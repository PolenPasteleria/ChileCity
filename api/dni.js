import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import { BASE_URL } from "../lib/constants.js";
import { ensureLogrosSchema, otorgarLogro } from "../lib/logros.js";

// Genera un RUT chileno válido con formato XX.XXX.XXX-D
function generarRut() {
  // Número entre 10.000.000 y 25.000.000 (rango realista Chile)
  const num = Math.floor(Math.random() * 15000000) + 10000000;
  const dv  = calcularDV(num);
  const str = num.toString();
  // Formatear con puntos: XX.XXX.XXX
  const formateado =
    str.slice(0, 2) + "." + str.slice(2, 5) + "." + str.slice(5, 8);
  return `${formateado}-${dv}`;
}

function calcularDV(rut) {
  let suma  = 0;
  let multi = 2;
  let r     = rut;
  while (r > 0) {
    suma  += (r % 10) * multi;
    r      = Math.floor(r / 10);
    multi  = multi === 7 ? 2 : multi + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

let schemaReady = false;
async function initTable(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS dni (
      id           SERIAL PRIMARY KEY,
      discord_id   TEXT UNIQUE NOT NULL,
      rut          TEXT UNIQUE NOT NULL,
      nombre1      TEXT NOT NULL,
      nombre2      TEXT NOT NULL,
      apellido1    TEXT NOT NULL,
      apellido2    TEXT NOT NULL,
      fecha_nac    TEXT NOT NULL,
      nacionalidad TEXT NOT NULL DEFAULT 'Chilena',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Usuario de Discord (@handle) asociado al DNI, para poder buscarlo desde
  // Perfil Público. Se agrega con ALTER porque la tabla puede ya existir de
  // versiones anteriores sin esta columna.
  await sql`ALTER TABLE dni ADD COLUMN IF NOT EXISTS discord_username TEXT`;
  // Biografía corta del ciudadano, editable desde la card de perfil del
  // dashboard. Nullable: no todos la habrán llenado.
  await sql`ALTER TABLE dni ADD COLUMN IF NOT EXISTS bio TEXT`;
  schemaReady = true;
}

export default async function handler(req, res) {
  // CORS restringido al propio dominio (antes era "*", abierto a cualquiera)
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sql = neon(process.env.DATABASE_URL);
    await initTable(sql);
    await ensureLogrosSchema(sql);

    // El discord_id ya NO se toma del query/body: se lee de la cookie de
    // sesión firmada, así nadie puede consultar o crear un DNI a nombre de
    // otra persona con solo cambiar un parámetro.
    const session = requireSession(req, res);
    if (!session) return; // requireSession ya respondió 401

    const discord_id = session.id;

    // ── GET: buscar mi propio DNI ──────────────────────────────────────────
    if (req.method === "GET") {
      const rows = await sql`SELECT * FROM dni WHERE discord_id = ${discord_id}`;
      if (rows.length === 0) return res.status(404).json({ existe: false });

      // Mantiene el @usuario de Discord guardado al día (puede cambiar con
      // el tiempo). Solo escribe si realmente cambió, para no gastar una
      // query de UPDATE en cada carga.
      if (session.username && rows[0].discord_username !== session.username) {
        await sql`UPDATE dni SET discord_username = ${session.username} WHERE discord_id = ${discord_id}`;
        rows[0].discord_username = session.username;
      }

      return res.status(200).json({ existe: true, dni: rows[0] });
    }

    // ── POST: crear mi DNI ──────────────────────────────────────────────────
    if (req.method === "POST") {
      const { nombre1, nombre2, apellido1, apellido2, fecha_nac } = req.body;

      if (!nombre1 || !nombre2 || !apellido1 || !apellido2 || !fecha_nac) {
        return res.status(400).json({ error: "Faltan campos obligatorios" });
      }

      // Verificar que no exista ya
      const existe = await sql`SELECT id FROM dni WHERE discord_id = ${discord_id}`;
      if (existe.length > 0) {
        return res.status(409).json({ error: "Ya tienes un DNI registrado" });
      }

      // Generar RUT único (reintenta si hay colisión)
      let rut;
      let intentos = 0;
      while (intentos < 10) {
        rut = generarRut();
        const rutExiste = await sql`SELECT id FROM dni WHERE rut = ${rut}`;
        if (rutExiste.length === 0) break;
        intentos++;
      }

      const n1 = nombre1.trim().toUpperCase();
      const n2 = nombre2.trim().toUpperCase();
      const a1 = apellido1.trim().toUpperCase();
      const a2 = apellido2.trim().toUpperCase();

      const rows = await sql`
        INSERT INTO dni (discord_id, rut, nombre1, nombre2, apellido1, apellido2, fecha_nac, discord_username)
        VALUES (${discord_id}, ${rut}, ${n1}, ${n2}, ${a1}, ${a2}, ${fecha_nac}, ${session.username || null})
        RETURNING *
      `;

      // Logro: Bienvenido a la Ciudad (primera vez que crea su DNI)
      await otorgarLogro(sql, discord_id, "bienvenido");

      return res.status(201).json({ existe: true, dni: rows[0] });
    }

    // ── PATCH: actualizar mi biografía (card de perfil del dashboard) ───────
    if (req.method === "PATCH") {
      let { bio } = req.body || {};
      bio = (bio ?? "").toString().trim().slice(0, 160);

      const rows = await sql`
        UPDATE dni SET bio = ${bio || null}
        WHERE discord_id = ${discord_id}
        RETURNING *
      `;
      if (rows.length === 0) {
        return res.status(404).json({ error: "Primero debes crear tu cédula de identidad." });
      }
      return res.status(200).json({ existe: true, dni: rows[0] });
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    console.error("Error en /api/dni:", err);
    return res.status(500).json({ error: "Error interno del servidor. Intenta de nuevo." });
  }
}
