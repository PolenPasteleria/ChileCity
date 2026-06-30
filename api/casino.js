import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import { BASE_URL, CASINO_MIN_APUESTA, CASINO_MAX_APUESTA, RATE_CASINO_SEG } from "../lib/constants.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { ensureLogrosSchema, otorgarLogro, checkLogrosSaldo } from "../lib/logros.js";

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

  await sql`
    CREATE TABLE IF NOT EXISTS casino_apuestas (
      id           SERIAL PRIMARY KEY,
      discord_id   TEXT NOT NULL,
      juego        TEXT NOT NULL,
      monto        BIGINT NOT NULL,
      eleccion     TEXT NOT NULL,
      resultado    TEXT NOT NULL,
      gano         BOOLEAN NOT NULL,
      premio       BIGINT NOT NULL DEFAULT 0,
      saldo_after  BIGINT NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS casino_ganancias (
      discord_id    TEXT PRIMARY KEY,
      total_ganado  BIGINT NOT NULL DEFAULT 0,
      nombre        TEXT
    )
  `;

  schemaReady = true;
}

/* ── Resultado Ruleta ─────────────────────────────────────────────────────── */
// 38 slots: 18 red, 18 black, 2 green (similar to American roulette)
function spinRuleta() {
  const r = Math.floor(Math.random() * 38);
  if (r < 18) return "rojo";
  if (r < 36) return "negro";
  return "verde";
}

/* ── Resultado Cara o Cruz ──────────────────────────────────────────────── */
function lanzarMoneda() {
  return Math.random() < 0.5 ? "cara" : "cruz";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sql = neon(process.env.DATABASE_URL);
    await initTables(sql);
    await ensureLogrosSchema(sql);

    const session = requireSession(req, res);
    if (!session) return;
    const discord_id = session.id;

    const { action } = req.query;

    // ── GET: historial del usuario ─────────────────────────────────────────
    if (req.method === "GET" && action === "historial") {
      const rows = await sql`
        SELECT * FROM casino_apuestas
        WHERE discord_id = ${discord_id}
        ORDER BY created_at DESC LIMIT 30
      `;
      return res.status(200).json({
        apuestas: rows.map(a => ({
          ...a,
          monto: toNumber(a.monto),
          premio: toNumber(a.premio),
          saldo_after: toNumber(a.saldo_after),
        })),
      });
    }

    // ── GET: ranking top 5 ────────────────────────────────────────────────
    if (req.method === "GET" && action === "ranking") {
      const rows = await sql`
        SELECT discord_id, total_ganado, nombre
        FROM casino_ganancias
        ORDER BY total_ganado DESC LIMIT 5
      `;
      return res.status(200).json({
        ranking: rows.map(r => ({ ...r, total_ganado: toNumber(r.total_ganado) })),
      });
    }

    // ── POST: jugar ───────────────────────────────────────────────────────
    if (req.method === "POST" && action === "jugar") {
      const { juego, monto, eleccion } = req.body;

      // Rate limiting
      const rl = await checkRateLimit(sql, discord_id, "casino", RATE_CASINO_SEG);
      if (rl) return res.status(429).json({ error: rl });

      // Validación básica
      if (!juego || !eleccion) return res.status(400).json({ error: "Faltan campos." });
      const montoNum = parseMonto(monto);
      if (!montoNum) return res.status(400).json({ error: "Monto inválido. Debe ser entero positivo." });
      if (montoNum < CASINO_MIN_APUESTA)
        return res.status(400).json({ error: `La apuesta mínima es $${CASINO_MIN_APUESTA.toLocaleString("es-CL")}.` });
      if (montoNum > CASINO_MAX_APUESTA)
        return res.status(400).json({ error: `La apuesta máxima es $${CASINO_MAX_APUESTA.toLocaleString("es-CL")}.` });

      // Validar juego y elección
      if (juego === "ruleta" && !["rojo","negro","verde"].includes(eleccion))
        return res.status(400).json({ error: "Elección inválida para ruleta." });
      if (juego === "moneda" && !["cara","cruz"].includes(eleccion))
        return res.status(400).json({ error: "Elección inválida para cara o cruz." });
      if (juego === "avion") {
        const mult = parseFloat(eleccion);
        if (isNaN(mult) || mult < 1.1 || mult > 100)
          return res.status(400).json({ error: "Multiplicador inválido (entre 1.1x y 100x)." });
      }
      if (!["ruleta","moneda","avion"].includes(juego))
        return res.status(400).json({ error: "Juego inválido." });

      // Verificar cuenta bancaria
      const cuentaRows = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
      if (cuentaRows.length === 0)
        return res.status(404).json({ error: "No tienes cuenta bancaria." });

      const saldoActual = toNumber(cuentaRows[0].saldo);
      if (saldoActual < montoNum)
        return res.status(400).json({ error: "Saldo insuficiente." });

      // Obtener nombre del usuario (para ranking)
      let nombreUsuario = session.name || discord_id;
      const dniRows = await sql`SELECT nombre1, apellido1 FROM dni WHERE discord_id = ${discord_id}`;
      if (dniRows.length > 0) {
        nombreUsuario = `${dniRows[0].nombre1} ${dniRows[0].apellido1}`;
      }

      // Generar resultado en servidor (anti-trampa)
      let resultado, gano, premio;
      if (juego === "ruleta") {
        resultado = spinRuleta();
        gano = resultado === eleccion;
        if (gano) {
          const mult = resultado === "verde" ? 14 : 2;
          premio = montoNum * mult;
        } else {
          premio = 0;
        }
      } else if (juego === "moneda") {
        resultado = lanzarMoneda();
        gano = resultado === eleccion;
        premio = gano ? montoNum * 2 : 0;
      } else if (juego === "avion") {
        // El avión: se genera un multiplicador de crash aleatorio
        // Distribución: 90% chances crash antes de 10x, más probable crashear bajo
        // Formula: crash = 0.99 / (1 - random) pero con house edge
        const r = Math.random();
        let crashMultiplier;
        if (r < 0.05) {
          // 5% crashea inmediatamente (antes de 1.1x)
          crashMultiplier = 1.0;
        } else {
          // Distribución exponencial con house edge del 5%
          crashMultiplier = Math.max(1.0, 0.95 / (1 - Math.random()));
          crashMultiplier = Math.round(crashMultiplier * 100) / 100;
        }
        const multObjetivo = parseFloat(eleccion);
        gano = crashMultiplier >= multObjetivo;
        resultado = crashMultiplier.toFixed(2);
        premio = gano ? Math.floor(montoNum * multObjetivo) : 0;
      }

      // Calcular nuevo saldo
      const nuevoSaldo = saldoActual - montoNum + premio;

      // Actualizar saldo bancario
      await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${discord_id}`;

      // Registrar transacción bancaria
      if (gano) {
        const ganancia = premio - montoNum;
        await sql`
          INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
          VALUES (${discord_id}, 'ingreso', ${ganancia}, ${`Casino (${juego}) — ganó`}, ${nuevoSaldo})
        `;
      } else {
        await sql`
          INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
          VALUES (${discord_id}, 'egreso', ${montoNum}, ${`Casino (${juego}) — perdió`}, ${nuevoSaldo})
        `;
      }

      // Guardar apuesta en historial del casino
      await sql`
        INSERT INTO casino_apuestas (discord_id, juego, monto, eleccion, resultado, gano, premio, saldo_after)
        VALUES (${discord_id}, ${juego}, ${montoNum}, ${eleccion}, ${resultado}, ${gano}, ${premio}, ${nuevoSaldo})
      `;

      // Logro: Suertudo (primera vez que gana en el casino)
      if (gano && premio > montoNum) {
        await otorgarLogro(sql, discord_id, "suertudo");
      }
      // Logros de saldo (3M/20M/50M/100M/1000M)
      await checkLogrosSaldo(sql, discord_id, nuevoSaldo);

      // Actualizar ranking si ganó
      if (gano && premio > montoNum) {
        const gananciaRanking = premio - montoNum;
        await sql`
          INSERT INTO casino_ganancias (discord_id, total_ganado, nombre)
          VALUES (${discord_id}, ${gananciaRanking}, ${nombreUsuario})
          ON CONFLICT (discord_id) DO UPDATE
          SET total_ganado = casino_ganancias.total_ganado + ${gananciaRanking},
              nombre = ${nombreUsuario}
        `;
      }

      return res.status(200).json({
        resultado,
        gano,
        premio,
        nuevoSaldo,
        monto: montoNum,
      });
    }

    return res.status(405).json({ error: "Método no permitido." });
  } catch (err) {
    console.error("Error en /api/casino:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
}
