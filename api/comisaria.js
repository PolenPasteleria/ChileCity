import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import { BASE_URL } from "../lib/constants.js";

let schemaReady = false;

async function initTables(sql) {
  if (schemaReady) return;

  // Tabla de policías virtuales autorizados
  await sql`
    CREATE TABLE IF NOT EXISTS policia_virtual (
      id          SERIAL PRIMARY KEY,
      discord_id  TEXT UNIQUE NOT NULL,
      nombre      TEXT,
      autorizado_por_id   TEXT NOT NULL,
      autorizado_por_nombre TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Tabla de multas
  await sql`
    CREATE TABLE IF NOT EXISTS multas (
      id              SERIAL PRIMARY KEY,
      ciudadano_id    TEXT NOT NULL,
      ciudadano_nombre TEXT,
      ciudadano_dni   TEXT,
      motivo          TEXT NOT NULL,
      valor           NUMERIC(12,0) NOT NULL,
      fecha_limite    DATE NOT NULL,
      estado          TEXT NOT NULL DEFAULT 'pendiente',
      funcionario_id  TEXT NOT NULL,
      funcionario_nombre TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Tabla de antecedentes
  await sql`
    CREATE TABLE IF NOT EXISTS antecedentes (
      id                SERIAL PRIMARY KEY,
      ciudadano_id      TEXT NOT NULL,
      ciudadano_nombre  TEXT,
      ciudadano_dni     TEXT,
      foto_url          TEXT,
      motivo            TEXT NOT NULL,
      articulos         TEXT,
      tiempo_carcel     TEXT,
      funcionario_id    TEXT NOT NULL,
      funcionario_nombre TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Tabla de denuncias
  await sql`
    CREATE TABLE IF NOT EXISTS denuncias (
      id                SERIAL PRIMARY KEY,
      denunciante_id    TEXT NOT NULL,
      denunciante_nombre TEXT,
      motivo            TEXT NOT NULL,
      descripcion       TEXT NOT NULL,
      evidencia_url     TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Tabla de logs de comisaría
  await sql`
    CREATE TABLE IF NOT EXISTS comisaria_logs (
      id          SERIAL PRIMARY KEY,
      usuario_id  TEXT NOT NULL,
      usuario_nombre TEXT,
      accion      TEXT NOT NULL,
      detalle     TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  schemaReady = true;
}

async function registrarLog(sql, usuario_id, usuario_nombre, accion, detalle) {
  try {
    await sql`
      INSERT INTO comisaria_logs (usuario_id, usuario_nombre, accion, detalle)
      VALUES (${usuario_id}, ${usuario_nombre}, ${accion}, ${detalle})
    `;
  } catch (e) {
    console.error("Error al registrar log:", e);
  }
}

async function esPoliciaVirtual(sql, discord_id) {
  const rows = await sql`SELECT id FROM policia_virtual WHERE discord_id = ${discord_id}`;
  return rows.length > 0;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sql = neon(process.env.DATABASE_URL);
    await initTables(sql);

    const session = requireSession(req, res);
    if (!session) return;

    const discord_id   = session.id;
    const discord_name = session.name || session.tag || discord_id;
    const { action }   = req.query;

    // ── Verificar si soy policía virtual ─────────────────────────────────────
    if (req.method === "GET" && action === "verificar") {
      const esPolicia = await esPoliciaVirtual(sql, discord_id);
      return res.status(200).json({ esPolicia });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GESTIÓN DE POLICÍAS (desde Panel Admin)
    // ═══════════════════════════════════════════════════════════════════════

    // Listar policías
    if (req.method === "GET" && action === "listarPolicias") {
      const rows = await sql`SELECT * FROM policia_virtual ORDER BY created_at DESC`;
      return res.status(200).json({ policias: rows });
    }

    // Buscar policía por ID o nombre
    if (req.method === "GET" && action === "buscarPolicia") {
      const { q } = req.query;
      if (!q) return res.status(400).json({ error: "Falta parámetro de búsqueda" });
      const rows = await sql`
        SELECT * FROM policia_virtual
        WHERE discord_id ILIKE ${"%" + q + "%"} OR nombre ILIKE ${"%" + q + "%"}
        ORDER BY created_at DESC
      `;
      return res.status(200).json({ policias: rows });
    }

    // Autorizar policía (solo admins)
    if (req.method === "POST" && action === "autorizarPolicia") {
      const { target_id, nombre } = req.body;
      if (!target_id) return res.status(400).json({ error: "Falta target_id" });

      const existe = await sql`SELECT id FROM policia_virtual WHERE discord_id = ${target_id}`;
      if (existe.length > 0)
        return res.status(409).json({ error: "Ese usuario ya es Policía Virtual" });

      const rows = await sql`
        INSERT INTO policia_virtual (discord_id, nombre, autorizado_por_id, autorizado_por_nombre)
        VALUES (${target_id}, ${nombre || null}, ${discord_id}, ${discord_name})
        RETURNING *
      `;
      await registrarLog(sql, discord_id, discord_name, "AUTORIZAR_POLICIA",
        `Autorizó como Policía Virtual a ${nombre || target_id} (${target_id})`);
      return res.status(201).json({ policia: rows[0] });
    }

    // Revocar policía (solo admins)
    if (req.method === "DELETE" && action === "revocarPolicia") {
      const { target_id } = req.query;
      if (!target_id) return res.status(400).json({ error: "Falta target_id" });

      const row = await sql`SELECT nombre FROM policia_virtual WHERE discord_id = ${target_id}`;
      await sql`DELETE FROM policia_virtual WHERE discord_id = ${target_id}`;
      await registrarLog(sql, discord_id, discord_name, "REVOCAR_POLICIA",
        `Revocó permiso de Policía Virtual a ${row[0]?.nombre || target_id} (${target_id})`);
      return res.status(200).json({ ok: true });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MULTAS
    // ═══════════════════════════════════════════════════════════════════════

    // Ver mis multas (usuario normal)
    if (req.method === "GET" && action === "misMultas") {
      const rows = await sql`
        SELECT * FROM multas WHERE ciudadano_id = ${discord_id} ORDER BY created_at DESC
      `;
      return res.status(200).json({ multas: rows });
    }

    // Agregar multa (solo policía)
    if (req.method === "POST" && action === "agregarMulta") {
      const esPolicia = await esPoliciaVirtual(sql, discord_id);
      if (!esPolicia) return res.status(403).json({ error: "No autorizado" });

      const { ciudadano_id, ciudadano_nombre, ciudadano_dni, motivo, valor, fecha_limite } = req.body;
      if (!ciudadano_id || !motivo || !valor || !fecha_limite)
        return res.status(400).json({ error: "Faltan campos requeridos" });

      const rows = await sql`
        INSERT INTO multas (ciudadano_id, ciudadano_nombre, ciudadano_dni, motivo, valor, fecha_limite, funcionario_id, funcionario_nombre)
        VALUES (${ciudadano_id}, ${ciudadano_nombre || null}, ${ciudadano_dni || null}, ${motivo}, ${valor}, ${fecha_limite}, ${discord_id}, ${discord_name})
        RETURNING *
      `;

      // Intentar cobrar automáticamente desde la cuenta bancaria
      try {
        const cuenta = await sql`SELECT saldo FROM cuentas WHERE discord_id = ${ciudadano_id}`;
        if (cuenta.length > 0 && Number(cuenta[0].saldo) >= Number(valor)) {
          await sql`UPDATE cuentas SET saldo = saldo - ${valor} WHERE discord_id = ${ciudadano_id}`;
          await sql`
            INSERT INTO transacciones (discord_id, tipo, monto, descripcion)
            VALUES (${ciudadano_id}, 'egreso', ${valor}, ${"Cobro automático de multa: " + motivo})
          `;
          await sql`UPDATE multas SET estado = 'pagada' WHERE id = ${rows[0].id}`;
          rows[0].estado = "pagada";
        }
      } catch (_) { /* La cuenta bancaria puede no existir */ }

      await registrarLog(sql, discord_id, discord_name, "CREAR_MULTA",
        `Multó a ${ciudadano_nombre || ciudadano_id} por: ${motivo} ($${valor})`);
      return res.status(201).json({ multa: rows[0] });
    }

    // Base de datos de multas (policía) con búsqueda
    if (req.method === "GET" && action === "todasMultas") {
      const esPolicia = await esPoliciaVirtual(sql, discord_id);
      if (!esPolicia) return res.status(403).json({ error: "No autorizado" });

      const { q } = req.query;
      let rows;
      if (q) {
        rows = await sql`
          SELECT * FROM multas
          WHERE ciudadano_id ILIKE ${"%" + q + "%"}
             OR ciudadano_nombre ILIKE ${"%" + q + "%"}
             OR ciudadano_dni ILIKE ${"%" + q + "%"}
          ORDER BY created_at DESC
        `;
      } else {
        rows = await sql`SELECT * FROM multas ORDER BY created_at DESC`;
      }
      return res.status(200).json({ multas: rows });
    }

    // Eliminar multa (policía)
    if (req.method === "DELETE" && action === "eliminarMulta") {
      const esPolicia = await esPoliciaVirtual(sql, discord_id);
      if (!esPolicia) return res.status(403).json({ error: "No autorizado" });

      const { id } = req.query;
      const row = await sql`SELECT * FROM multas WHERE id = ${id}`;
      if (row.length === 0) return res.status(404).json({ error: "Multa no encontrada" });

      await sql`DELETE FROM multas WHERE id = ${id}`;
      await registrarLog(sql, discord_id, discord_name, "ELIMINAR_MULTA",
        `Eliminó multa #${id} de ${row[0].ciudadano_nombre || row[0].ciudadano_id}: ${row[0].motivo}`);
      return res.status(200).json({ ok: true });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ANTECEDENTES
    // ═══════════════════════════════════════════════════════════════════════

    // Ver mis antecedentes (usuario normal)
    if (req.method === "GET" && action === "misAntecedentes") {
      const rows = await sql`
        SELECT * FROM antecedentes WHERE ciudadano_id = ${discord_id} ORDER BY created_at DESC
      `;
      return res.status(200).json({ antecedentes: rows });
    }

    // Agregar antecedente (solo policía)
    if (req.method === "POST" && action === "agregarAntecedente") {
      const esPolicia = await esPoliciaVirtual(sql, discord_id);
      if (!esPolicia) return res.status(403).json({ error: "No autorizado" });

      const { ciudadano_id, ciudadano_nombre, ciudadano_dni, foto_url, motivo, articulos, tiempo_carcel } = req.body;
      if (!ciudadano_id || !motivo)
        return res.status(400).json({ error: "Faltan campos requeridos" });

      const rows = await sql`
        INSERT INTO antecedentes (ciudadano_id, ciudadano_nombre, ciudadano_dni, foto_url, motivo, articulos, tiempo_carcel, funcionario_id, funcionario_nombre)
        VALUES (${ciudadano_id}, ${ciudadano_nombre || null}, ${ciudadano_dni || null}, ${foto_url || null}, ${motivo}, ${articulos || null}, ${tiempo_carcel || null}, ${discord_id}, ${discord_name})
        RETURNING *
      `;
      await registrarLog(sql, discord_id, discord_name, "CREAR_ANTECEDENTE",
        `Registró antecedente a ${ciudadano_nombre || ciudadano_id}: ${motivo}`);
      return res.status(201).json({ antecedente: rows[0] });
    }

    // Base de datos de antecedentes (policía)
    if (req.method === "GET" && action === "todosAntecedentes") {
      const esPolicia = await esPoliciaVirtual(sql, discord_id);
      if (!esPolicia) return res.status(403).json({ error: "No autorizado" });

      const { q } = req.query;
      let rows;
      if (q) {
        rows = await sql`
          SELECT * FROM antecedentes
          WHERE ciudadano_id ILIKE ${"%" + q + "%"}
             OR ciudadano_nombre ILIKE ${"%" + q + "%"}
             OR ciudadano_dni ILIKE ${"%" + q + "%"}
          ORDER BY created_at DESC
        `;
      } else {
        rows = await sql`SELECT * FROM antecedentes ORDER BY created_at DESC`;
      }
      return res.status(200).json({ antecedentes: rows });
    }

    // Eliminar antecedente (policía)
    if (req.method === "DELETE" && action === "eliminarAntecedente") {
      const esPolicia = await esPoliciaVirtual(sql, discord_id);
      if (!esPolicia) return res.status(403).json({ error: "No autorizado" });

      const { id } = req.query;
      const row = await sql`SELECT * FROM antecedentes WHERE id = ${id}`;
      if (row.length === 0) return res.status(404).json({ error: "Antecedente no encontrado" });

      await sql`DELETE FROM antecedentes WHERE id = ${id}`;
      await registrarLog(sql, discord_id, discord_name, "ELIMINAR_ANTECEDENTE",
        `Eliminó antecedente #${id} de ${row[0].ciudadano_nombre || row[0].ciudadano_id}`);
      return res.status(200).json({ ok: true });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DENUNCIAS
    // ═══════════════════════════════════════════════════════════════════════

    // Crear denuncia (cualquier usuario)
    if (req.method === "POST" && action === "crearDenuncia") {
      const { motivo, descripcion, evidencia_url } = req.body;
      if (!motivo || !descripcion)
        return res.status(400).json({ error: "Faltan campos requeridos" });

      const rows = await sql`
        INSERT INTO denuncias (denunciante_id, denunciante_nombre, motivo, descripcion, evidencia_url)
        VALUES (${discord_id}, ${discord_name}, ${motivo}, ${descripcion}, ${evidencia_url || null})
        RETURNING *
      `;
      await registrarLog(sql, discord_id, discord_name, "CREAR_DENUNCIA",
        `Realizó una denuncia por: ${motivo}`);
      return res.status(201).json({ denuncia: rows[0] });
    }

    // Ver todas las denuncias (solo policía)
    if (req.method === "GET" && action === "todasDenuncias") {
      const esPolicia = await esPoliciaVirtual(sql, discord_id);
      if (!esPolicia) return res.status(403).json({ error: "No autorizado" });

      const { q } = req.query;
      let rows;
      if (q) {
        rows = await sql`
          SELECT * FROM denuncias
          WHERE denunciante_id ILIKE ${"%" + q + "%"}
             OR denunciante_nombre ILIKE ${"%" + q + "%"}
             OR motivo ILIKE ${"%" + q + "%"}
          ORDER BY created_at DESC
        `;
      } else {
        rows = await sql`SELECT * FROM denuncias ORDER BY created_at DESC`;
      }
      return res.status(200).json({ denuncias: rows });
    }

    // Eliminar denuncia (solo policía)
    if (req.method === "DELETE" && action === "eliminarDenuncia") {
      const esPolicia = await esPoliciaVirtual(sql, discord_id);
      if (!esPolicia) return res.status(403).json({ error: "No autorizado" });

      const { id } = req.query;
      const row = await sql`SELECT * FROM denuncias WHERE id = ${id}`;
      if (row.length === 0) return res.status(404).json({ error: "Denuncia no encontrada" });

      await sql`DELETE FROM denuncias WHERE id = ${id}`;
      await registrarLog(sql, discord_id, discord_name, "ELIMINAR_DENUNCIA",
        `Eliminó denuncia #${id} de ${row[0].denunciante_nombre || row[0].denunciante_id}: ${row[0].motivo}`);
      return res.status(200).json({ ok: true });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // LOGS (solo policía/admin)
    // ═══════════════════════════════════════════════════════════════════════
    if (req.method === "GET" && action === "logs") {
      const esPolicia = await esPoliciaVirtual(sql, discord_id);
      if (!esPolicia) return res.status(403).json({ error: "No autorizado" });

      const { q } = req.query;
      let rows;
      if (q) {
        rows = await sql`
          SELECT * FROM comisaria_logs
          WHERE usuario_id ILIKE ${"%" + q + "%"}
             OR usuario_nombre ILIKE ${"%" + q + "%"}
             OR accion ILIKE ${"%" + q + "%"}
          ORDER BY created_at DESC LIMIT 200
        `;
      } else {
        rows = await sql`SELECT * FROM comisaria_logs ORDER BY created_at DESC LIMIT 200`;
      }
      return res.status(200).json({ logs: rows });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BUSCAR CIUDADANO (para formularios de policía)
    // ═══════════════════════════════════════════════════════════════════════
    if (req.method === "GET" && action === "buscarCiudadano") {
      const esPolicia = await esPoliciaVirtual(sql, discord_id);
      if (!esPolicia) return res.status(403).json({ error: "No autorizado" });

      const { q } = req.query;
      if (!q) return res.status(400).json({ error: "Falta parámetro de búsqueda" });

      const rows = await sql`
        SELECT d.discord_id, d.nombre1 || ' ' || d.apellido1 AS nombre_completo,
               d.rut AS dni
        FROM dni d
        WHERE d.discord_id ILIKE ${"%" + q + "%"}
           OR (d.nombre1 || ' ' || d.apellido1) ILIKE ${"%" + q + "%"}
           OR (d.nombre1 || ' ' || d.nombre2 || ' ' || d.apellido1 || ' ' || d.apellido2) ILIKE ${"%" + q + "%"}
           OR d.rut ILIKE ${"%" + q + "%"}
        LIMIT 10
      `;
      return res.status(200).json({ ciudadanos: rows });
    }

    return res.status(405).json({ error: "Acción no reconocida o método no permitido" });

  } catch (err) {
    console.error("Error en /api/comisaria:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
}
