import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import { SUPER_ADMIN_ID, BASE_URL } from "../lib/constants.js";

async function getAdminIds(sql) {
  try {
    const rows = await sql`SELECT discord_id FROM admins`;
    return rows.map(r => r.discord_id);
  } catch {
    return [SUPER_ADMIN_ID];
  }
}

let schemaReady = false;
async function initTables(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS empresas (
      id               SERIAL PRIMARY KEY,
      nombre           TEXT NOT NULL,
      descripcion      TEXT,
      logo_url         TEXT,
      discord_url      TEXT NOT NULL,
      dueno_nombre     TEXT,
      dueno_avatar_url TEXT,
      activo           BOOLEAN DEFAULT TRUE,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Por si la tabla ya existía de una versión anterior sin estas columnas.
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS dueno_nombre TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS dueno_avatar_url TEXT`;
  schemaReady = true;
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

    const { action } = req.query;

    // ── PUBLIC: listado paginado de empresas activas (no requiere sesión) ────
    if (req.method === "GET" && action === "listar") {
      const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 8));
      const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
      const offset = (page - 1) * limit;

      const [empresas, totalRows] = await Promise.all([
        sql`
          SELECT id, nombre, descripcion, logo_url, discord_url, dueno_nombre, dueno_avatar_url, created_at
          FROM empresas
          WHERE activo = TRUE
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
        sql`SELECT COUNT(*)::int AS total FROM empresas WHERE activo = TRUE`,
      ]);

      const total = totalRows[0]?.total || 0;

      return res.status(200).json({
        empresas,
        page,
        total,
        hasMore: offset + empresas.length < total,
      });
    }

    // ── A partir de aquí, todas las acciones requieren sesión ────────────────
    const session = requireSession(req, res);
    if (!session) return;
    const discord_id = session.id;

    const ADMIN_IDS = await getAdminIds(sql);
    const esAdmin = ADMIN_IDS.includes(discord_id);

    // ── ADMIN: listado paginado, incluye inactivas ──────────────────────────
    if (req.method === "GET" && action === "admin_listar") {
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });

      const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 8));
      const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
      const offset = (page - 1) * limit;

      const [empresas, totalRows] = await Promise.all([
        sql`
          SELECT * FROM empresas
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
        sql`SELECT COUNT(*)::int AS total FROM empresas`,
      ]);

      const total = totalRows[0]?.total || 0;

      return res.status(200).json({
        empresas,
        page,
        total,
        hasMore: offset + empresas.length < total,
      });
    }

    // ── ADMIN: crear empresa ─────────────────────────────────────────────────
    if (req.method === "POST" && action === "admin_crear") {
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });

      const { nombre, descripcion, logo_url, discord_url, dueno_nombre, dueno_avatar_url } = req.body || {};
      if (!nombre || !nombre.trim())
        return res.status(400).json({ error: "El nombre es obligatorio" });
      if (!discord_url || !discord_url.trim())
        return res.status(400).json({ error: "El link de Discord es obligatorio" });
      if (!/^https?:\/\//i.test(discord_url.trim()))
        return res.status(400).json({ error: "El link de Discord debe ser una URL válida (https://...)" });
      if (!dueno_nombre || !dueno_nombre.trim())
        return res.status(400).json({ error: "El nombre de Discord del dueño es obligatorio" });

      // Límite de seguridad: no permitir un número desmedido de empresas.
      const countRows = await sql`SELECT COUNT(*)::int AS total FROM empresas`;
      if ((countRows[0]?.total || 0) >= 100)
        return res.status(400).json({ error: "Se alcanzó el límite máximo de empresas" });

      const rows = await sql`
        INSERT INTO empresas (nombre, descripcion, logo_url, discord_url, dueno_nombre, dueno_avatar_url)
        VALUES (
          ${nombre.trim()},
          ${descripcion?.trim() || null},
          ${logo_url?.trim() || null},
          ${discord_url.trim()},
          ${dueno_nombre.trim()},
          ${dueno_avatar_url?.trim() || null}
        )
        RETURNING *
      `;
      return res.status(201).json({ empresa: rows[0] });
    }

    // ── ADMIN: editar empresa ────────────────────────────────────────────────
    if (req.method === "PUT" && action === "admin_editar") {
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });

      const { empresa_id, nombre, descripcion, logo_url, discord_url, dueno_nombre, dueno_avatar_url } = req.body || {};
      if (!empresa_id) return res.status(400).json({ error: "Falta empresa_id" });

      const existe = await sql`SELECT id FROM empresas WHERE id = ${empresa_id}`;
      if (existe.length === 0)
        return res.status(404).json({ error: "Empresa no encontrada" });

      if (discord_url !== undefined && discord_url !== null && discord_url !== "" && !/^https?:\/\//i.test(discord_url.trim()))
        return res.status(400).json({ error: "El link de Discord debe ser una URL válida (https://...)" });

      const rows = await sql`
        UPDATE empresas
        SET
          nombre           = COALESCE(${nombre?.trim() || null}, nombre),
          descripcion      = COALESCE(${descripcion?.trim() || null}, descripcion),
          logo_url         = COALESCE(${logo_url?.trim() || null}, logo_url),
          discord_url      = COALESCE(${discord_url?.trim() || null}, discord_url),
          dueno_nombre     = COALESCE(${dueno_nombre?.trim() || null}, dueno_nombre),
          dueno_avatar_url = COALESCE(${dueno_avatar_url?.trim() || null}, dueno_avatar_url)
        WHERE id = ${empresa_id}
        RETURNING *
      `;
      return res.status(200).json({ empresa: rows[0] });
    }

    // ── ADMIN: eliminar empresa (definitivo) ─────────────────────────────────
    if (req.method === "DELETE" && action === "admin_eliminar") {
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });

      const { empresa_id } = req.query;
      if (!empresa_id) return res.status(400).json({ error: "Falta empresa_id" });

      await sql`DELETE FROM empresas WHERE id = ${empresa_id}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    console.error("Error en /api/empresas:", err);
    return res.status(500).json({ error: "Error interno del servidor. Intenta de nuevo." });
  }
}
