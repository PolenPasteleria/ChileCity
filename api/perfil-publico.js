import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import { BASE_URL } from "../lib/constants.js";

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

    // Búsqueda de DNIs
    let dnis;
    if (q && q.trim()) {
      const busq = `%${q.trim().toLowerCase()}%`;
      dnis = await sql`
        SELECT * FROM dni
        WHERE LOWER(nombre1)   LIKE ${busq}
           OR LOWER(nombre2)   LIKE ${busq}
           OR LOWER(apellido1) LIKE ${busq}
           OR LOWER(apellido2) LIKE ${busq}
           OR LOWER(rut)       LIKE ${busq}
        ORDER BY apellido1, nombre1
        LIMIT 100
      `;
    } else {
      dnis = await sql`SELECT * FROM dni ORDER BY apellido1, nombre1 LIMIT 200`;
    }

    const ids = dnis.map(d => d.discord_id);
    let inventarios = [], multas = [], antecedentes = [];

    if (ids.length > 0) {
      [inventarios, multas, antecedentes] = await Promise.all([
        sql`SELECT * FROM inventario WHERE discord_id = ANY(${ids}) ORDER BY comprado_at DESC`,
        sql`SELECT * FROM multas WHERE ciudadano_id = ANY(${ids}) ORDER BY created_at DESC`,
        sql`SELECT * FROM antecedentes WHERE ciudadano_id = ANY(${ids}) ORDER BY created_at DESC`,
      ]);
    }

    // Construir mapas por discord_id
    const invMap = {}, multaMap = {}, antMap = {};
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

    return res.status(200).json({
      registros: dnis.map(d => ({
        discord_id:   d.discord_id,
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
      })),
    });
  } catch (err) {
    console.error("Error en /api/perfil-publico:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
}
