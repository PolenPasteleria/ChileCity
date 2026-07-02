import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import { SUPER_ADMIN_ID, BASE_URL, RATE_TRANSFER_SEG } from "../lib/constants.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { ensureLogrosSchema, otorgarLogro, checkLogrosSaldo, listarLogrosUsuario } from "../lib/logros.js";
import { ensureStaffLogsSchema, registrarStaffLog } from "../lib/staffLogs.js";

const SALDO_INICIAL = 1000000;

function generarNumeroCuenta() {
  const seg = () => Math.floor(Math.random() * 9000 + 1000).toString();
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseMonto(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

async function getAdminIds(sql) {
  try {
    const rows = await sql`SELECT discord_id FROM admins`;
    return rows.map(r => r.discord_id);
  } catch {
    return [SUPER_ADMIN_ID];
  }
}

// Etiqueta legible para logs de staff: "Nombre Apellido (discord_id)" si el
// usuario tiene DNI registrado, o solo "(discord_id)" si no.
async function etiquetaUsuario(sql, discord_id_target) {
  try {
    const rows = await sql`SELECT nombre1, apellido1 FROM dni WHERE discord_id = ${discord_id_target}`;
    if (rows.length > 0) return `${rows[0].nombre1} ${rows[0].apellido1} (${discord_id_target})`;
  } catch {}
  return discord_id_target;
}

let schemaReady = false;
async function initTables(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS banco (
      id            SERIAL PRIMARY KEY,
      discord_id    TEXT UNIQUE NOT NULL,
      numero_cuenta TEXT UNIQUE NOT NULL,
      saldo         BIGINT NOT NULL DEFAULT 1000000,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS transacciones (
      id            SERIAL PRIMARY KEY,
      discord_id    TEXT NOT NULL,
      tipo          TEXT NOT NULL,
      monto         BIGINT NOT NULL,
      descripcion   TEXT,
      contraparte   TEXT,
      saldo_after   BIGINT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_transacciones_discord_id ON transacciones(discord_id)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sueldos (
      id            SERIAL PRIMARY KEY,
      discord_id    TEXT NOT NULL,
      nombre        TEXT NOT NULL,
      monto         BIGINT NOT NULL,
      dias          INTEGER NOT NULL,
      ultimo_cobro  TIMESTAMPTZ DEFAULT NOW(),
      activo        BOOLEAN DEFAULT TRUE,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_sueldos_discord_id ON sueldos(discord_id)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS admins (
      id          SERIAL PRIMARY KEY,
      discord_id  TEXT UNIQUE NOT NULL,
      nombre      TEXT,
      agregado_por TEXT NOT NULL DEFAULT 'system',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    INSERT INTO admins (discord_id, nombre, agregado_por)
    VALUES (${SUPER_ADMIN_ID}, 'Super Admin', 'system')
    ON CONFLICT (discord_id) DO NOTHING
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS contactos_banco (
      id            SERIAL PRIMARY KEY,
      discord_id    TEXT NOT NULL,
      nombre        TEXT NOT NULL,
      rut           TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(discord_id, rut)
    )
  `;
  // La tabla "staff" vive originalmente en api/admin.js. Se re-declara acá
  // (misma definición, CREATE TABLE IF NOT EXISTS) porque Admin Banco ahora
  // también es accesible para el rol Staff, no solo para admins.
  await sql`
    CREATE TABLE IF NOT EXISTS staff (
      id           SERIAL PRIMARY KEY,
      discord_id   TEXT UNIQUE NOT NULL,
      nombre       TEXT,
      agregado_por_id     TEXT NOT NULL,
      agregado_por_nombre TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  schemaReady = true;
}

async function getStaffIds(sql) {
  try {
    const rows = await sql`SELECT discord_id FROM staff`;
    return rows.map(r => r.discord_id);
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  // CORS restringido al propio dominio (antes era "*", abierto a cualquiera)
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sql = neon(process.env.DATABASE_URL);
    await initTables(sql);
    await ensureLogrosSchema(sql);
    await ensureStaffLogsSchema(sql);

    const ADMIN_IDS = await getAdminIds(sql);
    const STAFF_IDS = await getStaffIds(sql);
    const { action } = req.query;

    // Identidad real del usuario: SIEMPRE viene de la cookie de sesión
    // firmada, nunca de un discord_id/admin_id que mande el cliente.
    // Esto es lo que evita que alguien pueda transferirse plata de otra
    // cuenta o auto-asignarse como admin con solo cambiar un parámetro.
    const session = requireSession(req, res);
    if (!session) return; // requireSession ya respondió 401
    const discord_id = session.id;
    const discord_name = session.name || session.tag || discord_id;
    const esAdmin = ADMIN_IDS.includes(discord_id);
    // Staff tiene acceso a Admin Banco (saldos y sueldos), igual que un
    // admin, pero sigue sin poder gestionar otros admins/staff.
    const esStaff = STAFF_IDS.includes(discord_id);
    const puedeAdminBanco = esAdmin || esStaff;

    // ── GET: estado de cuenta ────────────────────────────────────────────────
    if (req.method === "GET" && action === "cuenta") {
      // Por defecto cada uno solo ve su propia cuenta. Un admin puede pedir
      // la cuenta de otro discord_id (ej. para gestionar sus sueldos), pero
      // un usuario normal no puede hacerlo aunque mande ese parámetro.
      let targetId = discord_id;
      const { discord_id: discordIdQuery } = req.query;
      if (discordIdQuery && discordIdQuery !== discord_id) {
        if (!puedeAdminBanco) return res.status(403).json({ error: "No autorizado" });
        targetId = discordIdQuery;
      }

      const rows = await sql`SELECT * FROM banco WHERE discord_id = ${targetId}`;
      if (rows.length === 0) return res.status(404).json({ existe: false });

      const sueldos = await sql`
        SELECT * FROM sueldos WHERE discord_id = ${targetId} AND activo = TRUE
      `;

      const ahora = new Date();
      let saldoActualizado = toNumber(rows[0].saldo);

      for (const sueldo of sueldos) {
        const ultimoCobro = new Date(sueldo.ultimo_cobro);
        const diasDesde = (ahora - ultimoCobro) / (1000 * 60 * 60 * 24);
        if (diasDesde >= sueldo.dias) {
          const montoSueldo = toNumber(sueldo.monto);
          saldoActualizado += montoSueldo;
          await sql`UPDATE banco SET saldo = saldo + ${montoSueldo} WHERE discord_id = ${targetId}`;
          await sql`UPDATE sueldos SET ultimo_cobro = ${ahora.toISOString()} WHERE id = ${sueldo.id}`;
          await sql`
            INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
            VALUES (${targetId}, 'sueldo', ${montoSueldo}, ${'Sueldo: ' + sueldo.nombre}, ${saldoActualizado})
          `;
          // Logro: Tu Primer Sueldo (idempotente: solo se otorga la primera vez)
          await otorgarLogro(sql, targetId, "primer_sueldo");
        }
      }

      // Revisa logros de saldo (3M/20M/50M/100M/1000M) con el saldo final
      await checkLogrosSaldo(sql, targetId, saldoActualizado);

      const updated = await sql`SELECT * FROM banco WHERE discord_id = ${targetId}`;
      const sueldosActivos = await sql`
        SELECT * FROM sueldos WHERE discord_id = ${targetId} AND activo = TRUE
      `;

      let proximoSueldo = null;
      if (sueldosActivos.length > 0) {
        let menorTiempoRestante = Infinity;
        for (const s of sueldosActivos) {
          const ult = new Date(s.ultimo_cobro);
          const fechaProximo = new Date(ult.getTime() + s.dias * 24 * 60 * 60 * 1000);
          const restante = fechaProximo - ahora;
          if (restante > 0 && restante < menorTiempoRestante) {
            menorTiempoRestante = restante;
            proximoSueldo = { nombre: s.nombre, monto: toNumber(s.monto), msRestantes: restante };
          }
        }
      }

      return res.status(200).json({
        existe: true,
        cuenta: { ...updated[0], saldo: toNumber(updated[0].saldo) },
        sueldos: sueldosActivos.map(s => ({ ...s, monto: toNumber(s.monto) })),
        proximoSueldo,
      });
    }

    // ── POST: crear cuenta ───────────────────────────────────────────────────
    if (req.method === "POST" && action === "crear") {
      const dni = await sql`SELECT id FROM dni WHERE discord_id = ${discord_id}`;
      if (dni.length === 0)
        return res.status(403).json({ error: "Debes crear tu DNI primero" });

      const existe = await sql`SELECT id FROM banco WHERE discord_id = ${discord_id}`;
      if (existe.length > 0)
        return res.status(409).json({ error: "Ya tienes una cuenta bancaria" });

      let numero;
      for (let i = 0; i < 10; i++) {
        numero = generarNumeroCuenta();
        const check = await sql`SELECT id FROM banco WHERE numero_cuenta = ${numero}`;
        if (check.length === 0) break;
      }

      const rows = await sql`
        INSERT INTO banco (discord_id, numero_cuenta, saldo)
        VALUES (${discord_id}, ${numero}, ${SALDO_INICIAL})
        RETURNING *
      `;

      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${discord_id}, 'ingreso', ${SALDO_INICIAL}, 'Apertura de cuenta bancaria', ${SALDO_INICIAL})
      `;

      // Logro: El Comienzo (abrir la cuenta bancaria)
      await otorgarLogro(sql, discord_id, "comienzo");

      return res.status(201).json({ existe: true, cuenta: { ...rows[0], saldo: toNumber(rows[0].saldo) } });
    }

    // ── POST: transferir ─────────────────────────────────────────────────────
    if (req.method === "POST" && action === "transferir") {
      const { rut_destino, monto } = req.body;
      if (!rut_destino || !monto)
        return res.status(400).json({ error: "Faltan campos" });

      // Rate limiting
      const rl = await checkRateLimit(sql, discord_id, "transfer", RATE_TRANSFER_SEG);
      if (rl) return res.status(429).json({ error: rl });

      const montoNum = parseMonto(monto);
      if (montoNum === null || montoNum <= 0)
        return res.status(400).json({ error: "Monto inválido" });

      const origen = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
      if (origen.length === 0)
        return res.status(404).json({ error: "No tienes cuenta bancaria" });

      const saldoOrigenActual = toNumber(origen[0].saldo);
      if (saldoOrigenActual < montoNum)
        return res.status(400).json({ error: "Saldo insuficiente" });

      const dniDest = await sql`SELECT discord_id FROM dni WHERE rut = ${rut_destino}`;
      if (dniDest.length === 0)
        return res.status(404).json({ error: "RUT destino no encontrado" });

      const destDiscordId = dniDest[0].discord_id;
      if (destDiscordId === discord_id)
        return res.status(400).json({ error: "No puedes transferirte a ti mismo" });

      const destBanco = await sql`SELECT * FROM banco WHERE discord_id = ${destDiscordId}`;
      if (destBanco.length === 0)
        return res.status(404).json({ error: "El destinatario no tiene cuenta bancaria" });

      const nuevoSaldoOrigen = saldoOrigenActual - montoNum;
      const nuevoSaldoDest   = toNumber(destBanco[0].saldo) + montoNum;

      await sql`UPDATE banco SET saldo = ${nuevoSaldoOrigen} WHERE discord_id = ${discord_id}`;
      await sql`UPDATE banco SET saldo = ${nuevoSaldoDest}   WHERE discord_id = ${destDiscordId}`;

      const dniOrigen = await sql`SELECT nombre1, apellido1, rut FROM dni WHERE discord_id = ${discord_id}`;
      const nombreOrigen = dniOrigen.length > 0 ? `${dniOrigen[0].nombre1} ${dniOrigen[0].apellido1}` : discord_id;

      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, contraparte, saldo_after)
        VALUES (${discord_id}, 'egreso', ${montoNum}, ${'Transferencia a RUT ' + rut_destino}, ${rut_destino}, ${nuevoSaldoOrigen})
      `;
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, contraparte, saldo_after)
        VALUES (${destDiscordId}, 'ingreso', ${montoNum}, ${'Transferencia recibida de ' + nombreOrigen}, ${dniOrigen[0]?.rut || discord_id}, ${nuevoSaldoDest})
      `;

      await checkLogrosSaldo(sql, discord_id, nuevoSaldoOrigen);
      await checkLogrosSaldo(sql, destDiscordId, nuevoSaldoDest);

      return res.status(200).json({ ok: true, nuevoSaldo: nuevoSaldoOrigen });
    }

    // ── GET: mis logros ───────────────────────────────────────────────────────
    if (req.method === "GET" && action === "logros") {
      const logros = await listarLogrosUsuario(sql, discord_id);
      return res.status(200).json({ logros });
    }

    // ── GET: historial ───────────────────────────────────────────────────────
    if (req.method === "GET" && action === "historial") {
      const rows = await sql`
        SELECT * FROM transacciones WHERE discord_id = ${discord_id}
        ORDER BY created_at DESC LIMIT 50
      `;
      return res.status(200).json({
        transacciones: rows.map(t => ({ ...t, monto: toNumber(t.monto), saldo_after: toNumber(t.saldo_after) })),
      });
    }

    // ── ADMIN: listar usuarios con cuenta ────────────────────────────────────
    if (req.method === "GET" && action === "admin_usuarios") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const rows = await sql`
        SELECT b.discord_id, b.numero_cuenta, b.saldo, b.created_at,
               d.nombre1, d.apellido1, d.rut
        FROM banco b
        LEFT JOIN dni d ON b.discord_id = d.discord_id
        ORDER BY b.created_at DESC
      `;
      return res.status(200).json({
        usuarios: rows.map(u => ({ ...u, saldo: toNumber(u.saldo) })),
      });
    }

    // ── ADMIN: ajustar saldo ──────────────────────────────────────────────────
    if (req.method === "POST" && action === "admin_saldo") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const { discord_id_target, monto, descripcion } = req.body;
      const montoNum = parseMonto(monto);
      if (montoNum === null)
        return res.status(400).json({ error: "Monto inválido" });

      const cuenta = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id_target}`;
      if (cuenta.length === 0) return res.status(404).json({ error: "Usuario sin cuenta" });

      const nuevoSaldo = toNumber(cuenta[0].saldo) + montoNum;
      if (nuevoSaldo < 0) return res.status(400).json({ error: "Saldo no puede quedar negativo" });
      if (!Number.isSafeInteger(nuevoSaldo))
        return res.status(400).json({ error: "El monto resultante es demasiado grande" });

      await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${discord_id_target}`;
      const tipo = montoNum >= 0 ? "ingreso" : "egreso";
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${discord_id_target}, ${tipo}, ${Math.abs(montoNum)}, ${descripcion || 'Ajuste administrativo'}, ${nuevoSaldo})
      `;

      await checkLogrosSaldo(sql, discord_id_target, nuevoSaldo);

      const etiqueta = await etiquetaUsuario(sql, discord_id_target);
      await registrarStaffLog(sql, discord_id, discord_name,
        montoNum >= 0 ? "SALDO_AGREGAR" : "SALDO_QUITAR",
        `${montoNum >= 0 ? "Agregó" : "Quitó"} $${Math.abs(montoNum).toLocaleString('es-CL')} ${montoNum >= 0 ? "a" : "de"} ${etiqueta}${descripcion ? ` — "${descripcion}"` : ""}`);

      return res.status(200).json({ ok: true, nuevoSaldo });
    }

    // ── ADMIN: resetear cuenta ────────────────────────────────────────────────
    if (req.method === "POST" && action === "admin_reset_cuenta") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const { discord_id_target } = req.body;
      if (!discord_id_target)
        return res.status(400).json({ error: "Falta discord_id_target" });

      const cuenta = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id_target}`;
      if (cuenta.length === 0) return res.status(404).json({ error: "Usuario sin cuenta" });

      await sql`UPDATE banco SET saldo = ${SALDO_INICIAL} WHERE discord_id = ${discord_id_target}`;
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (${discord_id_target}, 'ajuste', ${SALDO_INICIAL}, 'Cuenta reseteada por administrador', ${SALDO_INICIAL})
      `;

      const etiquetaReset = await etiquetaUsuario(sql, discord_id_target);
      await registrarStaffLog(sql, discord_id, discord_name, "CUENTA_RESETEAR",
        `Reseteó la cuenta de ${etiquetaReset} a $${SALDO_INICIAL.toLocaleString('es-CL')}`);

      return res.status(200).json({ ok: true, nuevoSaldo: SALDO_INICIAL });
    }

    // ── ADMIN: crear sueldo ───────────────────────────────────────────────────
    if (req.method === "POST" && action === "admin_sueldo_crear") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const { discord_id_target, nombre, monto, dias } = req.body;
      const montoNum = parseMonto(monto);
      const diasNum  = parseMonto(dias);
      if (!nombre || montoNum === null || montoNum <= 0 || diasNum === null || diasNum <= 0)
        return res.status(400).json({ error: "Datos inválidos" });

      const rows = await sql`
        INSERT INTO sueldos (discord_id, nombre, monto, dias, ultimo_cobro)
        VALUES (${discord_id_target}, ${nombre}, ${montoNum}, ${diasNum}, NOW())
        RETURNING *
      `;

      const etiquetaSueldo = await etiquetaUsuario(sql, discord_id_target);
      await registrarStaffLog(sql, discord_id, discord_name, "SUELDO_AGREGAR",
        `Agregó el sueldo "${nombre}" ($${montoNum.toLocaleString('es-CL')} cada ${diasNum} día(s)) a ${etiquetaSueldo}`);

      return res.status(201).json({ sueldo: { ...rows[0], monto: toNumber(rows[0].monto) } });
    }

    // ── ADMIN: eliminar sueldo ────────────────────────────────────────────────
    if (req.method === "DELETE" && action === "admin_sueldo_borrar") {
      if (!puedeAdminBanco)
        return res.status(403).json({ error: "No autorizado" });

      const { sueldo_id } = req.query;
      const existente = await sql`SELECT * FROM sueldos WHERE id = ${sueldo_id}`;
      await sql`UPDATE sueldos SET activo = FALSE WHERE id = ${sueldo_id}`;

      if (existente.length > 0) {
        const etiquetaBorrar = await etiquetaUsuario(sql, existente[0].discord_id);
        await registrarStaffLog(sql, discord_id, discord_name, "SUELDO_QUITAR",
          `Quitó el sueldo "${existente[0].nombre}" ($${toNumber(existente[0].monto).toLocaleString('es-CL')}) a ${etiquetaBorrar}`);
      }

      return res.status(200).json({ ok: true });
    }

    // ── GET: listar contactos ─────────────────────────────────────────────────
    if (req.method === "GET" && action === "contactos") {
      const rows = await sql`
        SELECT * FROM contactos_banco WHERE discord_id = ${discord_id}
        ORDER BY created_at ASC
      `;
      return res.status(200).json({ contactos: rows });
    }

    // ── POST: agregar contacto ────────────────────────────────────────────────
    if (req.method === "POST" && action === "contacto_agregar") {
      const { nombre, rut } = req.body;
      if (!nombre || !rut)
        return res.status(400).json({ error: "Faltan campos" });

      const count = await sql`
        SELECT COUNT(*) FROM contactos_banco WHERE discord_id = ${discord_id}
      `;
      if (parseInt(count[0].count) >= 5)
        return res.status(400).json({ error: "Máximo 5 contactos permitidos" });

      // Verificar que el RUT existe en el sistema
      const dniCheck = await sql`SELECT discord_id, nombre1, apellido1 FROM dni WHERE rut = ${rut}`;
      if (dniCheck.length === 0)
        return res.status(404).json({ error: "RUT no encontrado en el sistema" });
      if (dniCheck[0].discord_id === discord_id)
        return res.status(400).json({ error: "No puedes agregarte a ti mismo" });

      try {
        const rows = await sql`
          INSERT INTO contactos_banco (discord_id, nombre, rut)
          VALUES (${discord_id}, ${nombre.trim()}, ${rut.trim()})
          RETURNING *
        `;
        return res.status(201).json({ contacto: rows[0] });
      } catch (e) {
        if (e.message?.includes("unique") || e.code === "23505")
          return res.status(409).json({ error: "Este RUT ya está en tus contactos" });
        throw e;
      }
    }

    // ── DELETE: eliminar contacto ─────────────────────────────────────────────
    if (req.method === "DELETE" && action === "contacto_borrar") {
      const { id } = req.query;
      await sql`
        DELETE FROM contactos_banco WHERE id = ${id} AND discord_id = ${discord_id}
      `;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    console.error("Error en /api/banco:", err);
    return res.status(500).json({ error: "Error interno del servidor. Intenta de nuevo." });
  }
}
