import { neon } from "@neondatabase/serverless";

// IDs de Discord con acceso admin al banco
const ADMIN_IDS = [
  // Agrega aquí los Discord IDs autorizados, ej: "123456789012345678"
  "1192236737565577287",
  "ADMIN_DISCORD_ID_2",
];

function generarNumeroCuenta() {
  // Formato: 0000-0000-0000-0000
  const seg = () => Math.floor(Math.random() * 9000 + 1000).toString();
  return `${seg()}-${seg()}-${seg()}-${seg()}`;
}

async function initTables(sql) {
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
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);
  await initTables(sql);

  const { action } = req.query;

  // ── GET: estado de cuenta ────────────────────────────────────────────────
  if (req.method === "GET" && action === "cuenta") {
    const { discord_id } = req.query;
    if (!discord_id) return res.status(400).json({ error: "Falta discord_id" });

    const rows = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
    if (rows.length === 0) return res.status(404).json({ existe: false });

    // Verificar sueldos pendientes
    const sueldos = await sql`
      SELECT * FROM sueldos WHERE discord_id = ${discord_id} AND activo = TRUE
    `;

    const ahora = new Date();
    let saldoActualizado = Number(rows[0].saldo);

    for (const sueldo of sueldos) {
      const ultimoCobro = new Date(sueldo.ultimo_cobro);
      const diasDesde = (ahora - ultimoCobro) / (1000 * 60 * 60 * 24);
      if (diasDesde >= sueldo.dias) {
        // Cobrar sueldo
        saldoActualizado += Number(sueldo.monto);
        await sql`
          UPDATE banco SET saldo = saldo + ${sueldo.monto} WHERE discord_id = ${discord_id}
        `;
        await sql`
          UPDATE sueldos SET ultimo_cobro = ${ahora.toISOString()} WHERE id = ${sueldo.id}
        `;
        await sql`
          INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
          VALUES (${discord_id}, 'sueldo', ${sueldo.monto}, ${'Sueldo: ' + sueldo.nombre}, ${saldoActualizado})
        `;
      }
    }

    // Re-fetch actualizado
    const updated = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
    const sueldosActivos = await sql`
      SELECT * FROM sueldos WHERE discord_id = ${discord_id} AND activo = TRUE
    `;

    // Calcular próximo sueldo
    let proximoSueldo = null;
    if (sueldosActivos.length > 0) {
      let menorTiempoRestante = Infinity;
      for (const s of sueldosActivos) {
        const ult = new Date(s.ultimo_cobro);
        const fechaProximo = new Date(ult.getTime() + s.dias * 24 * 60 * 60 * 1000);
        const restante = fechaProximo - ahora;
        if (restante > 0 && restante < menorTiempoRestante) {
          menorTiempoRestante = restante;
          proximoSueldo = { nombre: s.nombre, monto: s.monto, msRestantes: restante };
        }
      }
    }

    return res.status(200).json({
      existe: true,
      cuenta: updated[0],
      sueldos: sueldosActivos,
      proximoSueldo,
    });
  }

  // ── POST: crear cuenta ───────────────────────────────────────────────────
  if (req.method === "POST" && action === "crear") {
    const { discord_id } = req.body;
    if (!discord_id) return res.status(400).json({ error: "Falta discord_id" });

    // Verificar DNI
    const dni = await sql`SELECT id FROM dni WHERE discord_id = ${discord_id}`;
    if (dni.length === 0)
      return res.status(403).json({ error: "Debes crear tu DNI primero" });

    // Verificar que no tenga cuenta
    const existe = await sql`SELECT id FROM banco WHERE discord_id = ${discord_id}`;
    if (existe.length > 0)
      return res.status(409).json({ error: "Ya tienes una cuenta bancaria" });

    // Generar número único
    let numero;
    for (let i = 0; i < 10; i++) {
      numero = generarNumeroCuenta();
      const check = await sql`SELECT id FROM banco WHERE numero_cuenta = ${numero}`;
      if (check.length === 0) break;
    }

    const rows = await sql`
      INSERT INTO banco (discord_id, numero_cuenta, saldo)
      VALUES (${discord_id}, ${numero}, 1000000)
      RETURNING *
    `;

    await sql`
      INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
      VALUES (${discord_id}, 'ingreso', 1000000, 'Apertura de cuenta bancaria', 1000000)
    `;

    return res.status(201).json({ existe: true, cuenta: rows[0] });
  }

  // ── POST: transferir ─────────────────────────────────────────────────────
  if (req.method === "POST" && action === "transferir") {
    const { discord_id, rut_destino, monto } = req.body;
    if (!discord_id || !rut_destino || !monto)
      return res.status(400).json({ error: "Faltan campos" });

    const montoNum = parseInt(monto);
    if (isNaN(montoNum) || montoNum <= 0)
      return res.status(400).json({ error: "Monto inválido" });

    // Cuenta origen
    const origen = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
    if (origen.length === 0)
      return res.status(404).json({ error: "No tienes cuenta bancaria" });

    if (Number(origen[0].saldo) < montoNum)
      return res.status(400).json({ error: "Saldo insuficiente" });

    // Buscar destino por RUT
    const dniDest = await sql`SELECT discord_id FROM dni WHERE rut = ${rut_destino}`;
    if (dniDest.length === 0)
      return res.status(404).json({ error: "RUT destino no encontrado" });

    const destDiscordId = dniDest[0].discord_id;
    if (destDiscordId === discord_id)
      return res.status(400).json({ error: "No puedes transferirte a ti mismo" });

    const destBanco = await sql`SELECT * FROM banco WHERE discord_id = ${destDiscordId}`;
    if (destBanco.length === 0)
      return res.status(404).json({ error: "El destinatario no tiene cuenta bancaria" });

    const nuevoSaldoOrigen = Number(origen[0].saldo) - montoNum;
    const nuevoSaldoDest   = Number(destBanco[0].saldo) + montoNum;

    await sql`UPDATE banco SET saldo = ${nuevoSaldoOrigen} WHERE discord_id = ${discord_id}`;
    await sql`UPDATE banco SET saldo = ${nuevoSaldoDest}   WHERE discord_id = ${destDiscordId}`;

    // Registrar en historial de ambos
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

    return res.status(200).json({ ok: true, nuevoSaldo: nuevoSaldoOrigen });
  }

  // ── GET: historial ───────────────────────────────────────────────────────
  if (req.method === "GET" && action === "historial") {
    const { discord_id } = req.query;
    const rows = await sql`
      SELECT * FROM transacciones WHERE discord_id = ${discord_id}
      ORDER BY created_at DESC LIMIT 50
    `;
    return res.status(200).json({ transacciones: rows });
  }

  // ── ADMIN: listar usuarios con cuenta ────────────────────────────────────
  if (req.method === "GET" && action === "admin_usuarios") {
    const { discord_id } = req.query;
    if (!ADMIN_IDS.includes(discord_id))
      return res.status(403).json({ error: "No autorizado" });

    const rows = await sql`
      SELECT b.discord_id, b.numero_cuenta, b.saldo, b.created_at,
             d.nombre1, d.apellido1, d.rut
      FROM banco b
      LEFT JOIN dni d ON b.discord_id = d.discord_id
      ORDER BY b.created_at DESC
    `;
    return res.status(200).json({ usuarios: rows });
  }

  // ── ADMIN: ajustar saldo ──────────────────────────────────────────────────
  if (req.method === "POST" && action === "admin_saldo") {
    const { admin_id, discord_id_target, monto, descripcion } = req.body;
    if (!ADMIN_IDS.includes(admin_id))
      return res.status(403).json({ error: "No autorizado" });

    const montoNum = parseInt(monto);
    const cuenta = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id_target}`;
    if (cuenta.length === 0) return res.status(404).json({ error: "Usuario sin cuenta" });

    const nuevoSaldo = Number(cuenta[0].saldo) + montoNum;
    if (nuevoSaldo < 0) return res.status(400).json({ error: "Saldo no puede quedar negativo" });

    await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${discord_id_target}`;
    const tipo = montoNum >= 0 ? "ingreso" : "egreso";
    await sql`
      INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
      VALUES (${discord_id_target}, ${tipo}, ${Math.abs(montoNum)}, ${descripcion || 'Ajuste administrativo'}, ${nuevoSaldo})
    `;

    return res.status(200).json({ ok: true, nuevoSaldo });
  }

  // ── ADMIN: crear sueldo ───────────────────────────────────────────────────
  if (req.method === "POST" && action === "admin_sueldo_crear") {
    const { admin_id, discord_id_target, nombre, monto, dias } = req.body;
    if (!ADMIN_IDS.includes(admin_id))
      return res.status(403).json({ error: "No autorizado" });

    const montoNum = parseInt(monto);
    const diasNum  = parseInt(dias);
    if (!nombre || isNaN(montoNum) || montoNum <= 0 || isNaN(diasNum) || diasNum <= 0)
      return res.status(400).json({ error: "Datos inválidos" });

    const rows = await sql`
      INSERT INTO sueldos (discord_id, nombre, monto, dias, ultimo_cobro)
      VALUES (${discord_id_target}, ${nombre}, ${montoNum}, ${diasNum}, NOW())
      RETURNING *
    `;
    return res.status(201).json({ sueldo: rows[0] });
  }

  // ── ADMIN: eliminar sueldo ────────────────────────────────────────────────
  if (req.method === "DELETE" && action === "admin_sueldo_borrar") {
    const { admin_id, sueldo_id } = req.query;
    if (!ADMIN_IDS.includes(admin_id))
      return res.status(403).json({ error: "No autorizado" });

    await sql`UPDATE sueldos SET activo = FALSE WHERE id = ${sueldo_id}`;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Método no permitido" });
}
