import { neon } from "@neondatabase/serverless";
import { requireSession, getSessionUser } from "../lib/auth.js";
import { BASE_URL, RATE_APUESTA_SEG } from "../lib/constants.js";
import { checkRateLimit } from "../lib/rateLimit.js";

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function parseMonto(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

let schemaReady = false;
async function initTables(sql) {
  if (schemaReady) return;

  // Partidos deportivos
  await sql`
    CREATE TABLE IF NOT EXISTS sport_partidos (
      id            SERIAL PRIMARY KEY,
      equipo_a      TEXT NOT NULL,
      equipo_b      TEXT NOT NULL,
      logo_a        TEXT,
      logo_b        TEXT,
      goles_a       INTEGER NOT NULL DEFAULT 0,
      goles_b       INTEGER NOT NULL DEFAULT 0,
      estado        TEXT NOT NULL DEFAULT 'activo',
      mult_a        NUMERIC(5,2) NOT NULL DEFAULT 2.00,
      mult_empate   NUMERIC(5,2) NOT NULL DEFAULT 3.00,
      mult_b        NUMERIC(5,2) NOT NULL DEFAULT 2.00,
      ganador       TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      finalizado_at TIMESTAMPTZ
    )
  `;

  // Apuestas deportivas
  await sql`
    CREATE TABLE IF NOT EXISTS sport_apuestas (
      id              SERIAL PRIMARY KEY,
      discord_id      TEXT NOT NULL,
      partido_id      INTEGER NOT NULL REFERENCES sport_partidos(id),
      tipo            TEXT NOT NULL,
      eleccion        TEXT NOT NULL,
      monto           BIGINT NOT NULL,
      marcador_a      INTEGER,
      marcador_b      INTEGER,
      estado          TEXT NOT NULL DEFAULT 'pendiente',
      premio          BIGINT NOT NULL DEFAULT 0,
      saldo_after     BIGINT,
      acierto_marcador BOOLEAN,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      resuelto_at     TIMESTAMPTZ
    )
  `;

  schemaReady = true;
}

async function isAdmin(sql, discord_id) {
  try {
    const rows = await sql`SELECT 1 FROM admins WHERE discord_id = ${discord_id}`;
    return rows.length > 0;
  } catch { return false; }
}

async function resolverPartido(sql, partidoId, goles_a, goles_b) {
  // Determinar ganador
  let ganador;
  if (goles_a > goles_b) ganador = "A";
  else if (goles_b > goles_a) ganador = "B";
  else ganador = "empate";

  // Obtener el partido con multiplicadores
  const [partido] = await sql`
    SELECT * FROM sport_partidos WHERE id = ${partidoId}
  `;

  // Obtener todas las apuestas pendientes del partido
  const apuestas = await sql`
    SELECT * FROM sport_apuestas WHERE partido_id = ${partidoId} AND estado = 'pendiente'
  `;

  for (const ap of apuestas) {
    let gano = false;
    let acierto_marcador = false;
    let multiplicador = 1;

    // Determinar si ganó
    if (ap.eleccion === ganador ||
        (ap.eleccion === "A" && ganador === "A") ||
        (ap.eleccion === "B" && ganador === "B") ||
        (ap.eleccion === "empate" && ganador === "empate")) {
      gano = true;
      if (ganador === "A") multiplicador = toNumber(partido.mult_a);
      else if (ganador === "B") multiplicador = toNumber(partido.mult_b);
      else multiplicador = toNumber(partido.mult_empate);
    }

    // Para apuesta combinada: verificar marcador exacto
    if (ap.tipo === "combinada" && gano &&
        ap.marcador_a !== null && ap.marcador_b !== null &&
        ap.marcador_a === goles_a && ap.marcador_b === goles_b) {
      acierto_marcador = true;
      multiplicador = multiplicador * 2; // doble multiplicador por marcador exacto
    }

    let premio = 0;
    let nuevoEstado = "perdida";

    if (gano) {
      premio = Math.floor(toNumber(ap.monto) * multiplicador);
      nuevoEstado = "ganada";

      // Actualizar saldo bancario del ganador
      const cuentaRows = await sql`SELECT saldo FROM banco WHERE discord_id = ${ap.discord_id}`;
      if (cuentaRows.length > 0) {
        const saldoActual = toNumber(cuentaRows[0].saldo);
        const nuevoSaldo = saldoActual + premio;

        await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${ap.discord_id}`;

        const desc = `Apuesta deportiva: ${partido.equipo_a} vs ${partido.equipo_b} — ${acierto_marcador ? "¡Marcador exacto! " : ""}Ganó`;
        await sql`
          INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
          VALUES (${ap.discord_id}, 'ingreso', ${premio}, ${desc}, ${nuevoSaldo})
        `;

        await sql`
          UPDATE sport_apuestas
          SET estado = ${nuevoEstado}, premio = ${premio}, saldo_after = ${nuevoSaldo},
              acierto_marcador = ${acierto_marcador}, resuelto_at = NOW()
          WHERE id = ${ap.id}
        `;
      }
    } else {
      // Registrar pérdida en transacciones (ya se descontó al apostar)
      const cuentaRows = await sql`SELECT saldo FROM banco WHERE discord_id = ${ap.discord_id}`;
      const saldoActual = cuentaRows.length > 0 ? toNumber(cuentaRows[0].saldo) : 0;

      await sql`
        UPDATE sport_apuestas
        SET estado = ${nuevoEstado}, premio = 0, saldo_after = ${saldoActual},
            acierto_marcador = false, resuelto_at = NOW()
        WHERE id = ${ap.id}
      `;
    }
  }

  // Finalizar el partido
  await sql`
    UPDATE sport_partidos
    SET estado = 'finalizado', goles_a = ${goles_a}, goles_b = ${goles_b},
        ganador = ${ganador}, finalizado_at = NOW()
    WHERE id = ${partidoId}
  `;
}

async function cancelarPartido(sql, partidoId) {
  const apuestas = await sql`
    SELECT * FROM sport_apuestas WHERE partido_id = ${partidoId} AND estado = 'pendiente'
  `;

  const [partido] = await sql`SELECT * FROM sport_partidos WHERE id = ${partidoId}`;

  for (const ap of apuestas) {
    const cuentaRows = await sql`SELECT saldo FROM banco WHERE discord_id = ${ap.discord_id}`;
    if (cuentaRows.length > 0) {
      const saldoActual = toNumber(cuentaRows[0].saldo);
      const nuevoSaldo = saldoActual + toNumber(ap.monto);
      await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${ap.discord_id}`;
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${ap.discord_id}, 'ingreso', ${ap.monto},
          ${`Devolución apuesta cancelada: ${partido.equipo_a} vs ${partido.equipo_b}`},
          ${nuevoSaldo})
      `;
      await sql`
        UPDATE sport_apuestas SET estado = 'cancelada', saldo_after = ${nuevoSaldo}, resuelto_at = NOW()
        WHERE id = ${ap.id}
      `;
    }
  }

  await sql`UPDATE sport_partidos SET estado = 'cancelado' WHERE id = ${partidoId}`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sql = neon(process.env.DATABASE_URL);
    await initTables(sql);

    const session = requireSession(req, res);
    if (!session) return;
    const discord_id = session.id;
    const esAdmin = await isAdmin(sql, discord_id);

    const { action } = req.query;

    // ── GET: listar partidos activos (público) ──────────────────────────────
    if (req.method === "GET" && action === "partidos") {
      const rows = await sql`
        SELECT * FROM sport_partidos
        WHERE estado IN ('activo', 'en_curso')
        ORDER BY created_at DESC
      `;
      return res.status(200).json({
        partidos: rows.map(p => ({
          ...p,
          mult_a: toNumber(p.mult_a),
          mult_b: toNumber(p.mult_b),
          mult_empate: toNumber(p.mult_empate),
        }))
      });
    }

    // ── GET: todos los partidos (admin) ─────────────────────────────────────
    if (req.method === "GET" && action === "todos-partidos") {
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });
      const rows = await sql`
        SELECT * FROM sport_partidos ORDER BY created_at DESC LIMIT 50
      `;
      return res.status(200).json({
        partidos: rows.map(p => ({
          ...p,
          mult_a: toNumber(p.mult_a),
          mult_b: toNumber(p.mult_b),
          mult_empate: toNumber(p.mult_empate),
        }))
      });
    }

    // ── GET: historial personal ─────────────────────────────────────────────
    if (req.method === "GET" && action === "mi-historial") {
      const rows = await sql`
        SELECT sa.*, sp.equipo_a, sp.equipo_b, sp.logo_a, sp.logo_b,
               sp.goles_a, sp.goles_b, sp.ganador
        FROM sport_apuestas sa
        JOIN sport_partidos sp ON sa.partido_id = sp.id
        WHERE sa.discord_id = ${discord_id}
        ORDER BY sa.created_at DESC LIMIT 50
      `;
      return res.status(200).json({
        apuestas: rows.map(a => ({ ...a, monto: toNumber(a.monto), premio: toNumber(a.premio) }))
      });
    }

    // ── GET: historial admin (todas las apuestas) ───────────────────────────
    if (req.method === "GET" && action === "historial-admin") {
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });
      const { partido_id, estado: estadoFilter } = req.query;
      let rows;
      if (partido_id) {
        rows = await sql`
          SELECT sa.*, sp.equipo_a, sp.equipo_b
          FROM sport_apuestas sa
          JOIN sport_partidos sp ON sa.partido_id = sp.id
          WHERE sa.partido_id = ${partido_id}
          ORDER BY sa.created_at DESC
        `;
      } else if (estadoFilter) {
        rows = await sql`
          SELECT sa.*, sp.equipo_a, sp.equipo_b
          FROM sport_apuestas sa
          JOIN sport_partidos sp ON sa.partido_id = sp.id
          WHERE sa.estado = ${estadoFilter}
          ORDER BY sa.created_at DESC LIMIT 100
        `;
      } else {
        rows = await sql`
          SELECT sa.*, sp.equipo_a, sp.equipo_b
          FROM sport_apuestas sa
          JOIN sport_partidos sp ON sa.partido_id = sp.id
          ORDER BY sa.created_at DESC LIMIT 100
        `;
      }
      return res.status(200).json({
        apuestas: rows.map(a => ({ ...a, monto: toNumber(a.monto), premio: toNumber(a.premio) }))
      });
    }

    // ── POST: crear partido (admin) ─────────────────────────────────────────
    if (req.method === "POST" && action === "crear-partido") {
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });
      const { equipo_a, equipo_b, logo_a, logo_b, mult_a, mult_b, mult_empate } = req.body;
      if (!equipo_a || !equipo_b) return res.status(400).json({ error: "Faltan equipos" });
      const mA = parseFloat(mult_a) || 2.0;
      const mB = parseFloat(mult_b) || 2.0;
      const mE = parseFloat(mult_empate) || 3.0;
      const [row] = await sql`
        INSERT INTO sport_partidos (equipo_a, equipo_b, logo_a, logo_b, mult_a, mult_b, mult_empate)
        VALUES (${equipo_a}, ${equipo_b}, ${logo_a || null}, ${logo_b || null}, ${mA}, ${mB}, ${mE})
        RETURNING *
      `;
      return res.status(201).json({ partido: row });
    }

    // ── PUT: editar partido (admin) ─────────────────────────────────────────
    if (req.method === "PUT" && action === "editar-partido") {
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });
      const { id, equipo_a, equipo_b, logo_a, logo_b, mult_a, mult_b, mult_empate } = req.body;
      if (!id) return res.status(400).json({ error: "Falta id" });
      const [row] = await sql`
        UPDATE sport_partidos
        SET equipo_a = ${equipo_a}, equipo_b = ${equipo_b},
            logo_a = ${logo_a || null}, logo_b = ${logo_b || null},
            mult_a = ${parseFloat(mult_a) || 2.0},
            mult_b = ${parseFloat(mult_b) || 2.0},
            mult_empate = ${parseFloat(mult_empate) || 3.0}
        WHERE id = ${id}
        RETURNING *
      `;
      return res.status(200).json({ partido: row });
    }

    // ── PUT: actualizar marcador (admin) ────────────────────────────────────
    if (req.method === "PUT" && action === "marcador") {
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });
      const { id, goles_a, goles_b } = req.body;
      if (!id) return res.status(400).json({ error: "Falta id" });
      const [row] = await sql`
        UPDATE sport_partidos
        SET goles_a = ${parseInt(goles_a) || 0}, goles_b = ${parseInt(goles_b) || 0},
            estado = 'en_curso'
        WHERE id = ${id}
        RETURNING *
      `;
      return res.status(200).json({ partido: row });
    }

    // ── PUT: finalizar partido (admin) ──────────────────────────────────────
    if (req.method === "PUT" && action === "finalizar") {
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });
      const { id, goles_a, goles_b } = req.body;
      if (!id) return res.status(400).json({ error: "Falta id" });
      await resolverPartido(sql, id, parseInt(goles_a) || 0, parseInt(goles_b) || 0);
      return res.status(200).json({ ok: true });
    }

    // ── PUT: cancelar partido (admin) ───────────────────────────────────────
    if (req.method === "PUT" && action === "cancelar") {
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: "Falta id" });
      await cancelarPartido(sql, id);
      return res.status(200).json({ ok: true });
    }

    // ── DELETE: eliminar partido (admin) ────────────────────────────────────
    if (req.method === "DELETE" && action === "eliminar-partido") {
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "Falta id" });
      // Solo eliminar si no hay apuestas pendientes
      const pending = await sql`
        SELECT COUNT(*) as cnt FROM sport_apuestas WHERE partido_id = ${id} AND estado = 'pendiente'
      `;
      if (toNumber(pending[0].cnt) > 0)
        return res.status(400).json({ error: "No se puede eliminar: hay apuestas pendientes. Cancela primero." });
      await sql`DELETE FROM sport_apuestas WHERE partido_id = ${id}`;
      await sql`DELETE FROM sport_partidos WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    // ── POST: apostar (usuario) ─────────────────────────────────────────────
    if (req.method === "POST" && action === "apostar") {
      const { partido_id, tipo, eleccion, monto, marcador_a, marcador_b } = req.body;

      // Rate limiting
      const rl = await checkRateLimit(sql, discord_id, "apuesta", RATE_APUESTA_SEG);
      if (rl) return res.status(429).json({ error: rl });

      if (!partido_id || !tipo || !eleccion) return res.status(400).json({ error: "Faltan campos" });
      const montoNum = parseMonto(monto);
      if (!montoNum) return res.status(400).json({ error: "Monto inválido. Debe ser entero positivo." });

      // Validar tipo y elección
      if (!["simple", "combinada"].includes(tipo))
        return res.status(400).json({ error: "Tipo de apuesta inválido." });
      if (!["A", "B", "empate"].includes(eleccion))
        return res.status(400).json({ error: "Elección inválida." });

      // Verificar partido activo
      const partidoRows = await sql`
        SELECT * FROM sport_partidos WHERE id = ${partido_id} AND estado IN ('activo','en_curso')
      `;
      if (partidoRows.length === 0)
        return res.status(400).json({ error: "El partido no está disponible para apuestas." });

      // Verificar si ya apostó en este partido
      const yaApostó = await sql`
        SELECT id FROM sport_apuestas
        WHERE discord_id = ${discord_id} AND partido_id = ${partido_id} AND estado = 'pendiente'
      `;
      if (yaApostó.length > 0)
        return res.status(400).json({ error: "Ya tienes una apuesta activa en este partido." });

      // Verificar saldo
      const cuentaRows = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
      if (cuentaRows.length === 0)
        return res.status(404).json({ error: "No tienes cuenta bancaria." });
      const saldoActual = toNumber(cuentaRows[0].saldo);
      if (saldoActual < montoNum)
        return res.status(400).json({ error: "Saldo insuficiente." });

      // Descontar monto
      const nuevoSaldo = saldoActual - montoNum;
      await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${discord_id}`;

      const partido = partidoRows[0];
      const desc = `Apuesta deportiva: ${partido.equipo_a} vs ${partido.equipo_b} (${tipo})`;
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${discord_id}, 'egreso', ${montoNum}, ${desc}, ${nuevoSaldo})
      `;

      // Registrar apuesta
      const mA = tipo === "combinada" && marcador_a !== undefined ? parseInt(marcador_a) : null;
      const mB = tipo === "combinada" && marcador_b !== undefined ? parseInt(marcador_b) : null;

      const [apuesta] = await sql`
        INSERT INTO sport_apuestas (discord_id, partido_id, tipo, eleccion, monto, marcador_a, marcador_b, saldo_after)
        VALUES (${discord_id}, ${partido_id}, ${tipo}, ${eleccion}, ${montoNum}, ${mA}, ${mB}, ${nuevoSaldo})
        RETURNING *
      `;

      return res.status(201).json({
        apuesta: { ...apuesta, monto: toNumber(apuesta.monto) },
        nuevoSaldo,
      });
    }

    return res.status(405).json({ error: "Método no permitido." });
  } catch (err) {
    console.error("Error en /api/apuestas:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
}
