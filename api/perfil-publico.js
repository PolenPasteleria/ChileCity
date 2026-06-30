import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import { BASE_URL } from "../lib/constants.js";
import { ensureLogrosSchema, LOGROS } from "../lib/logros.js";

let schemaReady = false;
async function ensureSchema(sql) {
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
  await sql`ALTER TABLE dni ADD COLUMN IF NOT EXISTS discord_username TEXT`;
  await ensureLogrosSchema(sql);
  schemaReady = true;
}

function toNumber(v) { return v == null ? 0 : Number(v); }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const session = requireSession(req, res);
  if (!session) return;

  try {
    const sql = neon(process.env.DATABASE_URL);
    await ensureSchema(sql);

    const { q } = req.query;

    // ── Paginación ───────────────────────────────────────────────────────
    // Antes se traían hasta 200 ciudadanos (o 100 en una búsqueda) en una
    // sola llamada, junto con todo su inventario/multas/antecedentes. Si la
    // ciudad crece a miles de DNIs eso se vuelve una respuesta enorme y
    // lenta. Ahora se pagina: el cliente pide "page" (desde 1) y "limit"
    // (tope 60), y el servidor además devuelve el total de registros que
    // calzan con la búsqueda para que el front sepa si hay más páginas.
    const PAGE_SIZE_DEFAULT = 30;
    const PAGE_SIZE_MAX     = 60;
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(req.query.limit, 10) || PAGE_SIZE_DEFAULT));
    const offset = (page - 1) * limit;

    // Búsqueda de DNIs (paginada)
    let dnis, totalRow;
    if (q && q.trim()) {
      // Acepta buscar con o sin "@" delante del usuario de Discord.
      const busq = `%${q.trim().replace(/^@/, "").toLowerCase()}%`;
      [dnis, totalRow] = await Promise.all([
        sql`
          SELECT * FROM dni
          WHERE LOWER(nombre1)   LIKE ${busq}
             OR LOWER(nombre2)   LIKE ${busq}
             OR LOWER(apellido1) LIKE ${busq}
             OR LOWER(apellido2) LIKE ${busq}
             OR LOWER(rut)       LIKE ${busq}
             OR LOWER(discord_username) LIKE ${busq}
          ORDER BY apellido1, nombre1
          LIMIT ${limit} OFFSET ${offset}
        `,
        sql`
          SELECT COUNT(*)::int AS total FROM dni
          WHERE LOWER(nombre1)   LIKE ${busq}
             OR LOWER(nombre2)   LIKE ${busq}
             OR LOWER(apellido1) LIKE ${busq}
             OR LOWER(apellido2) LIKE ${busq}
             OR LOWER(rut)       LIKE ${busq}
             OR LOWER(discord_username) LIKE ${busq}
        `,
      ]);
    } else {
      [dnis, totalRow] = await Promise.all([
        sql`SELECT * FROM dni ORDER BY apellido1, nombre1 LIMIT ${limit} OFFSET ${offset}`,
        sql`SELECT COUNT(*)::int AS total FROM dni`,
      ]);
    }
    const total = totalRow[0]?.total || 0;

    const ids = dnis.map(d => d.discord_id);
    let inventarios = [], multas = [], antecedentes = [], logrosRows = [];

    if (ids.length > 0) {
      [inventarios, multas, antecedentes, logrosRows] = await Promise.all([
        sql`SELECT * FROM inventario WHERE discord_id = ANY(${ids}) ORDER BY comprado_at DESC`,
        sql`SELECT * FROM multas WHERE ciudadano_id = ANY(${ids}) ORDER BY created_at DESC`,
        sql`SELECT * FROM antecedentes WHERE ciudadano_id = ANY(${ids}) ORDER BY created_at DESC`,
        sql`SELECT discord_id, codigo, created_at FROM logros_usuario WHERE discord_id = ANY(${ids})`,
      ]);
    }

    // Construir mapas por discord_id
    const invMap = {}, multaMap = {}, antMap = {}, logroMap = {};
    for (const item of inventarios) {
      if (!invMap[item.discord_id]) invMap[item.discord_id] = [];
      invMap[item.discord_id].push({ ...item, precio_pagado: toNumber(item.precio_pagado) });
    }
    for (const m of multas) {
      if (!multaMap[m.ciudadano_id]) multaMap[m.ciudadano_id] = [];
      multaMap[m.ciudadano_id].push({ ...m, valor: toNumber(m.valor) });
    }
    for (const a of antecedentes) {
      if (!antMap[a.ciudadano_id]) antMap[a.ciudadano_id] = [];
      antMap[a.ciudadano_id].push(a);
    }
    for (const lg of logrosRows) {
      if (!logroMap[lg.discord_id]) logroMap[lg.discord_id] = {};
      logroMap[lg.discord_id][lg.codigo] = lg.created_at;
    }

    return res.status(200).json({
      page,
      limit,
      total,
      hasMore: offset + dnis.length < total,
      registros: dnis.map(d => {
        const obtenidos = logroMap[d.discord_id] || {};
        const logros = LOGROS.map(l => ({
          ...l,
          obtenido: Boolean(obtenidos[l.codigo]),
          fecha: obtenidos[l.codigo] || null,
        }));
        return {
          discord_id:       d.discord_id,
          discord_username: d.discord_username || null,
          nombre1:      d.nombre1,
          nombre2:      d.nombre2,
          apellido1:    d.apellido1,
          apellido2:    d.apellido2,
          rut:          d.rut,
          fecha_nac:    d.fecha_nac,
          nacionalidad: d.nacionalidad || "Chilena",
          inventario:   invMap[d.discord_id]   || [],
          multas:       multaMap[d.discord_id]  || [],
          antecedentes: antMap[d.discord_id]    || [],
          logros,
        };
      }),
    });
  } catch (err) {
    console.error("Error en /api/perfil-publico:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
}
