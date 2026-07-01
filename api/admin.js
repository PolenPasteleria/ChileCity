import { neon } from "@neondatabase/serverless";
import { requireSession } from "../lib/auth.js";
import { SUPER_ADMIN_ID, BASE_URL } from "../lib/constants.js";
import { ensureLogrosSchema, otorgarLogro, quitarLogro, listarLogrosUsuario } from "../lib/logros.js";

const MAX_ADMINS = 4; // máximo de admins adicionales (sin contar al super admin)

let schemaReady = false;
async function initTable(sql) {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS admins (
      id          SERIAL PRIMARY KEY,
      discord_id  TEXT UNIQUE NOT NULL,
      nombre      TEXT,
      agregado_por TEXT NOT NULL DEFAULT 'system',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  // Asegurarse de que el super admin siempre esté en la tabla
  await sql`
    INSERT INTO admins (discord_id, nombre, agregado_por)
    VALUES (${SUPER_ADMIN_ID}, 'Super Admin', 'system')
    ON CONFLICT (discord_id) DO NOTHING
  `;

  // ── Empresas ───────────────────────────────────────────────────────────
  // Vive en este mismo archivo (en vez de api/empresas.js) a propósito: el
  // plan gratuito de Vercel limita a 12 Serverless Functions por proyecto
  // (un archivo = una función) y ya estábamos justo en el límite. Mejor
  // sumarle acciones a un archivo existente que crear uno nuevo.
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
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS dueno_nombre TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS dueno_avatar_url TEXT`;
  await sql`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS dueno_discord_id TEXT`;

  // ── Staff ──────────────────────────────────────────────────────────────
  // Rol independiente de "admins": solo da acceso al Panel Staff (apartado
  // "Staff" del dashboard). No tiene acceso al Panel Admin ni a ninguna de
  // sus herramientas. Lo gestionan los admins desde el Panel Admin, igual
  // que la Gestión de Policías Virtuales.
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sql = neon(process.env.DATABASE_URL);
    await initTable(sql);
    await ensureLogrosSchema(sql);

    const { action } = req.query;

    // Quién está haciendo la petición se determina por la cookie de sesión,
    // nunca por un discord_id que mande el cliente.
    const session = requireSession(req, res);
    if (!session) return;
    const discord_id = session.id;

    // ── GET: verificar si yo soy admin ───────────────────────────────────────
    if (req.method === "GET" && action === "verificar") {
      const rows = await sql`SELECT * FROM admins WHERE discord_id = ${discord_id}`;
      const esSuperAdmin = discord_id === SUPER_ADMIN_ID;
      return res.status(200).json({
        esAdmin: rows.length > 0,
        esSuperAdmin,
      });
    }

    // ── GET: verificar si yo soy staff ────────────────────────────────────────
    if (req.method === "GET" && action === "verificarStaff") {
      const rows = await sql`SELECT id FROM staff WHERE discord_id = ${discord_id}`;
      return res.status(200).json({ esStaff: rows.length > 0 });
    }

    // ── GET: listar todos los admins (solo super admin) ──────────────────────
    if (req.method === "GET" && action === "listar") {
      if (discord_id !== SUPER_ADMIN_ID)
        return res.status(403).json({ error: "No autorizado" });

      const rows = await sql`SELECT * FROM admins ORDER BY created_at ASC`;
      return res.status(200).json({ admins: rows });
    }

    // ── POST: agregar admin (solo super admin) ────────────────────────────────
    if (req.method === "POST" && action === "agregar") {
      if (discord_id !== SUPER_ADMIN_ID)
        return res.status(403).json({ error: "No autorizado" });

      const { target_id, nombre } = req.body;
      if (!target_id) return res.status(400).json({ error: "Falta target_id" });
      if (target_id === SUPER_ADMIN_ID)
        return res.status(400).json({ error: "Ese ID ya es el super admin" });

      // Contar admins actuales (sin incluir el super admin)
      const count = await sql`
        SELECT COUNT(*) as cnt FROM admins WHERE discord_id != ${SUPER_ADMIN_ID}
      `;
      if (Number(count[0].cnt) >= MAX_ADMINS)
        return res.status(400).json({ error: `Límite de ${MAX_ADMINS} admins adicionales alcanzado` });

      // Verificar que no exista ya
      const existe = await sql`SELECT id FROM admins WHERE discord_id = ${target_id}`;
      if (existe.length > 0)
        return res.status(409).json({ error: "Ese usuario ya es admin" });

      const rows = await sql`
        INSERT INTO admins (discord_id, nombre, agregado_por)
        VALUES (${target_id}, ${nombre || null}, ${discord_id})
        RETURNING *
      `;
      return res.status(201).json({ admin: rows[0] });
    }

    // ── DELETE: eliminar admin (solo super admin) ─────────────────────────────
    if (req.method === "DELETE" && action === "eliminar") {
      if (discord_id !== SUPER_ADMIN_ID)
        return res.status(403).json({ error: "No autorizado" });

      const { target_id } = req.query;
      if (!target_id) return res.status(400).json({ error: "Falta target_id" });
      if (target_id === SUPER_ADMIN_ID)
        return res.status(400).json({ error: "No puedes eliminar al super admin" });

      await sql`DELETE FROM admins WHERE discord_id = ${target_id}`;
      return res.status(200).json({ ok: true });
    }

    // ══ EMPRESAS ════════════════════════════════════════════════════════════
    // (ver nota en initTable: vive acá para no sumar otra Serverless Function)

    // ── GET: listado paginado de empresas activas (cualquier sesión válida) ──
    if (req.method === "GET" && action === "empresas_listar") {
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

    // A partir de acá todas las acciones de empresas requieren ser admin.
    if (action && action.startsWith("empresas_admin_")) {
      const adminRows = await sql`SELECT id FROM admins WHERE discord_id = ${discord_id}`;
      const esAdmin = adminRows.length > 0;
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });

      // ── GET: listado paginado, incluye inactivas ────────────────────────
      if (req.method === "GET" && action === "empresas_admin_listar") {
        const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 8));
        const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
        const offset = (page - 1) * limit;

        const [empresas, totalRows] = await Promise.all([
          sql`SELECT * FROM empresas ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
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

      // ── POST: crear empresa ──────────────────────────────────────────────
      if (req.method === "POST" && action === "empresas_admin_crear") {
        const { nombre, descripcion, logo_url, discord_url, dueno_nombre, dueno_avatar_url, dueno_discord_id } = req.body || {};
        if (!nombre || !nombre.trim())
          return res.status(400).json({ error: "El nombre es obligatorio" });
        if (!discord_url || !discord_url.trim())
          return res.status(400).json({ error: "El link de Discord es obligatorio" });
        if (!/^https?:\/\//i.test(discord_url.trim()))
          return res.status(400).json({ error: "El link de Discord debe ser una URL válida (https://...)" });
        if (!dueno_nombre || !dueno_nombre.trim())
          return res.status(400).json({ error: "El nombre de Discord del dueño es obligatorio" });
        if (!dueno_discord_id || !/^\d{15,25}$/.test(dueno_discord_id.trim()))
          return res.status(400).json({ error: "El Discord ID del dueño es obligatorio y debe ser numérico" });

        const countRows = await sql`SELECT COUNT(*)::int AS total FROM empresas`;
        if ((countRows[0]?.total || 0) >= 100)
          return res.status(400).json({ error: "Se alcanzó el límite máximo de empresas" });

        const rows = await sql`
          INSERT INTO empresas (nombre, descripcion, logo_url, discord_url, dueno_nombre, dueno_avatar_url, dueno_discord_id)
          VALUES (
            ${nombre.trim()},
            ${descripcion?.trim() || null},
            ${logo_url?.trim() || null},
            ${discord_url.trim()},
            ${dueno_nombre.trim()},
            ${dueno_avatar_url?.trim() || null},
            ${dueno_discord_id.trim()}
          )
          RETURNING *
        `;

        // Logro: Empresario (al asignarle una empresa a su Discord ID)
        await otorgarLogro(sql, dueno_discord_id.trim(), "empresario", discord_id);

        return res.status(201).json({ empresa: rows[0] });
      }

      // ── PUT: editar empresa ──────────────────────────────────────────────
      if (req.method === "PUT" && action === "empresas_admin_editar") {
        const { empresa_id, nombre, descripcion, logo_url, discord_url, dueno_nombre, dueno_avatar_url, dueno_discord_id } = req.body || {};
        if (!empresa_id) return res.status(400).json({ error: "Falta empresa_id" });

        const existe = await sql`SELECT id FROM empresas WHERE id = ${empresa_id}`;
        if (existe.length === 0)
          return res.status(404).json({ error: "Empresa no encontrada" });

        if (discord_url && !/^https?:\/\//i.test(discord_url.trim()))
          return res.status(400).json({ error: "El link de Discord debe ser una URL válida (https://...)" });

        if (dueno_discord_id && !/^\d{15,25}$/.test(dueno_discord_id.trim()))
          return res.status(400).json({ error: "El Discord ID del dueño debe ser numérico" });

        const rows = await sql`
          UPDATE empresas
          SET
            nombre           = COALESCE(${nombre?.trim() || null}, nombre),
            descripcion      = COALESCE(${descripcion?.trim() || null}, descripcion),
            logo_url         = COALESCE(${logo_url?.trim() || null}, logo_url),
            discord_url      = COALESCE(${discord_url?.trim() || null}, discord_url),
            dueno_nombre     = COALESCE(${dueno_nombre?.trim() || null}, dueno_nombre),
            dueno_avatar_url = COALESCE(${dueno_avatar_url?.trim() || null}, dueno_avatar_url),
            dueno_discord_id = COALESCE(${dueno_discord_id?.trim() || null}, dueno_discord_id)
          WHERE id = ${empresa_id}
          RETURNING *
        `;

        // Logro: Empresario (también al editar, por si se agrega el ID después)
        if (rows[0]?.dueno_discord_id) {
          await otorgarLogro(sql, rows[0].dueno_discord_id, "empresario", discord_id);
        }

        return res.status(200).json({ empresa: rows[0] });
      }

      // ── DELETE: eliminar empresa (definitivo) ────────────────────────────
      if (req.method === "DELETE" && action === "empresas_admin_eliminar") {
        const { empresa_id } = req.query;
        if (!empresa_id) return res.status(400).json({ error: "Falta empresa_id" });

        await sql`DELETE FROM empresas WHERE id = ${empresa_id}`;
        return res.status(200).json({ ok: true });
      }
    }

    // ══ LOGROS (gestión desde el Panel Admin) ══════════════════════════════
    // Igual que con empresas: viven acá para no sumar otra Serverless
    // Function. Solo accesibles para admins (cualquiera, no solo el super
    // admin), igual que Admin Tienda y Administrar Empresas.
    if (action && action.startsWith("logros_admin_")) {
      const adminRows = await sql`SELECT id FROM admins WHERE discord_id = ${discord_id}`;
      const esAdmin = adminRows.length > 0;
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });

      // ── GET: ver los logros de un usuario (por su Discord ID) ────────────
      if (req.method === "GET" && action === "logros_admin_usuario") {
        const { target_id } = req.query;
        if (!target_id || !target_id.trim())
          return res.status(400).json({ error: "Falta target_id" });

        const logros = await listarLogrosUsuario(sql, target_id.trim());
        return res.status(200).json({ target_id: target_id.trim(), logros });
      }

      // ── POST: otorgar un logro manualmente ────────────────────────────────
      if (req.method === "POST" && action === "logros_admin_otorgar") {
        const { target_id, codigo } = req.body || {};
        if (!target_id || !codigo)
          return res.status(400).json({ error: "Faltan campos" });

        const otorgado = await otorgarLogro(sql, target_id.trim(), codigo, discord_id);
        return res.status(200).json({ ok: true, otorgado });
      }

      // ── DELETE: quitar un logro ───────────────────────────────────────────
      if (req.method === "DELETE" && action === "logros_admin_quitar") {
        const { target_id, codigo } = req.query;
        if (!target_id || !codigo)
          return res.status(400).json({ error: "Faltan campos" });

        await quitarLogro(sql, target_id.trim(), codigo);
        return res.status(200).json({ ok: true });
      }
    }

    // ══ STAFF (gestión desde el Panel Admin) ═══════════════════════════════
    // Igual que empresas/logros: vive acá para no sumar otra Serverless
    // Function. Accesible para cualquier admin (no solo el super admin),
    // igual que la Gestión de Policías Virtuales. El rol "staff" solo da
    // acceso al Panel Staff, nunca al Panel Admin.
    if (action && action.startsWith("staff_admin_")) {
      const adminRows = await sql`SELECT id FROM admins WHERE discord_id = ${discord_id}`;
      const esAdmin = adminRows.length > 0;
      if (!esAdmin) return res.status(403).json({ error: "No autorizado" });

      // ── GET: listar / buscar staff ────────────────────────────────────────
      if (req.method === "GET" && action === "staff_admin_listar") {
        const q = (req.query.q || "").trim();
        const rows = q
          ? await sql`
              SELECT * FROM staff
              WHERE discord_id ILIKE ${"%" + q + "%"} OR nombre ILIKE ${"%" + q + "%"}
              ORDER BY created_at DESC
            `
          : await sql`SELECT * FROM staff ORDER BY created_at DESC`;
        return res.status(200).json({ staff: rows });
      }

      // ── POST: agregar staff ───────────────────────────────────────────────
      if (req.method === "POST" && action === "staff_admin_agregar") {
        const { target_id, nombre } = req.body || {};
        if (!target_id || !target_id.trim())
          return res.status(400).json({ error: "Falta target_id" });

        const existe = await sql`SELECT id FROM staff WHERE discord_id = ${target_id.trim()}`;
        if (existe.length > 0)
          return res.status(409).json({ error: "Ese usuario ya es staff" });

        const rows = await sql`
          INSERT INTO staff (discord_id, nombre, agregado_por_id, agregado_por_nombre)
          VALUES (${target_id.trim()}, ${nombre?.trim() || null}, ${discord_id}, ${session.name || session.tag || discord_id})
          RETURNING *
        `;
        return res.status(201).json({ staff: rows[0] });
      }

      // ── DELETE: quitar staff ──────────────────────────────────────────────
      if (req.method === "DELETE" && action === "staff_admin_eliminar") {
        const { target_id } = req.query;
        if (!target_id) return res.status(400).json({ error: "Falta target_id" });

        await sql`DELETE FROM staff WHERE discord_id = ${target_id}`;
        return res.status(200).json({ ok: true });
      }
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    console.error("Error en /api/admin:", err);
    return res.status(500).json({ error: "Error interno del servidor." });
  }
}
