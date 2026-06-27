import { neon } from "@neondatabase/serverless";

// IDs de Discord con acceso admin a la tienda
// ⚠️ COLOCA AQUÍ TUS 3 DISCORD IDs DE ADMIN PARA LA TIENDA
const ADMIN_IDS_TIENDA = [
  "1192236737565577287",  // Admin 1 (igual que banco)
  "TIENDA_ADMIN_ID_2",    // Admin 2 — reemplaza con el ID real
  "TIENDA_ADMIN_ID_3",    // Admin 3 — reemplaza con el ID real
];

function parseMonto(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const CATEGORIAS_VALIDAS = ["vehiculos", "armas", "licencias", "otros"];

async function initTables(sql) {
  // Tabla de productos de la tienda
  await sql`
    CREATE TABLE IF NOT EXISTS tienda_productos (
      id          SERIAL PRIMARY KEY,
      nombre      TEXT NOT NULL,
      precio      BIGINT NOT NULL,
      categoria   TEXT NOT NULL,
      imagen_url  TEXT,
      activo      BOOLEAN DEFAULT TRUE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Tabla de inventario (compras de usuarios)
  await sql`
    CREATE TABLE IF NOT EXISTS inventario (
      id            SERIAL PRIMARY KEY,
      discord_id    TEXT NOT NULL,
      producto_id   INTEGER NOT NULL,
      nombre        TEXT NOT NULL,
      precio_pagado BIGINT NOT NULL,
      categoria     TEXT NOT NULL,
      imagen_url    TEXT,
      comprado_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const sql = neon(process.env.DATABASE_URL);
    await initTables(sql);

    const { action } = req.query;

    // ── GET: listar productos activos ────────────────────────────────────────
    if (req.method === "GET" && action === "productos") {
      const { categoria } = req.query;
      let rows;
      if (categoria && CATEGORIAS_VALIDAS.includes(categoria)) {
        rows = await sql`
          SELECT * FROM tienda_productos
          WHERE activo = TRUE AND categoria = ${categoria}
          ORDER BY created_at DESC
        `;
      } else {
        rows = await sql`
          SELECT * FROM tienda_productos
          WHERE activo = TRUE
          ORDER BY categoria, created_at DESC
        `;
      }
      return res.status(200).json({
        productos: rows.map(p => ({ ...p, precio: toNumber(p.precio) })),
      });
    }

    // ── POST: comprar producto ────────────────────────────────────────────────
    if (req.method === "POST" && action === "comprar") {
      const { discord_id, producto_id } = req.body;
      if (!discord_id || !producto_id)
        return res.status(400).json({ error: "Faltan campos" });

      // Verificar producto existe y está activo
      const productos = await sql`
        SELECT * FROM tienda_productos WHERE id = ${producto_id} AND activo = TRUE
      `;
      if (productos.length === 0)
        return res.status(404).json({ error: "Producto no encontrado o no disponible" });

      const producto = productos[0];
      const precio = toNumber(producto.precio);

      // Verificar que el usuario no tenga ya este producto en su inventario
      const yaComprado = await sql`
        SELECT id FROM inventario
        WHERE discord_id = ${discord_id} AND producto_id = ${producto_id}
        LIMIT 1
      `;
      if (yaComprado.length > 0)
        return res.status(409).json({ error: "Ya tienes este producto en tu inventario." });

      // Verificar cuenta bancaria y saldo
      const cuentas = await sql`SELECT * FROM banco WHERE discord_id = ${discord_id}`;
      if (cuentas.length === 0)
        return res.status(403).json({ error: "Necesitas una cuenta bancaria para comprar" });

      const saldoActual = toNumber(cuentas[0].saldo);
      if (saldoActual < precio)
        return res.status(400).json({
          error: "Fondos insuficientes",
          saldo: saldoActual,
          precio,
          faltante: precio - saldoActual,
        });

      const nuevoSaldo = saldoActual - precio;

      // Descontar saldo
      await sql`UPDATE banco SET saldo = ${nuevoSaldo} WHERE discord_id = ${discord_id}`;

      // Registrar transacción en banco
      await sql`
        INSERT INTO transacciones (discord_id, tipo, monto, descripcion, saldo_after)
        VALUES (
          ${discord_id},
          'egreso',
          ${precio},
          ${'Compra en tienda: ' + producto.nombre},
          ${nuevoSaldo}
        )
      `;

      // Agregar al inventario
      const items = await sql`
        INSERT INTO inventario (discord_id, producto_id, nombre, precio_pagado, categoria, imagen_url)
        VALUES (${discord_id}, ${producto.id}, ${producto.nombre}, ${precio}, ${producto.categoria}, ${producto.imagen_url})
        RETURNING *
      `;

      return res.status(200).json({
        ok: true,
        nuevoSaldo,
        item: { ...items[0], precio_pagado: toNumber(items[0].precio_pagado) },
      });
    }

    // ── GET: inventario del usuario ──────────────────────────────────────────
    if (req.method === "GET" && action === "inventario") {
      const { discord_id } = req.query;
      if (!discord_id) return res.status(400).json({ error: "Falta discord_id" });

      const rows = await sql`
        SELECT * FROM inventario
        WHERE discord_id = ${discord_id}
        ORDER BY comprado_at DESC
      `;
      return res.status(200).json({
        items: rows.map(i => ({ ...i, precio_pagado: toNumber(i.precio_pagado) })),
      });
    }

    // ── ADMIN: listar todos los productos (incluyendo inactivos) ─────────────
    if (req.method === "GET" && action === "admin_productos") {
      const { admin_id } = req.query;
      if (!ADMIN_IDS_TIENDA.includes(admin_id))
        return res.status(403).json({ error: "No autorizado" });

      const rows = await sql`
        SELECT * FROM tienda_productos ORDER BY created_at DESC
      `;
      return res.status(200).json({
        productos: rows.map(p => ({ ...p, precio: toNumber(p.precio) })),
      });
    }

    // ── ADMIN: crear producto ────────────────────────────────────────────────
    if (req.method === "POST" && action === "admin_crear_producto") {
      const { admin_id, nombre, precio, categoria, imagen_url } = req.body;
      if (!ADMIN_IDS_TIENDA.includes(admin_id))
        return res.status(403).json({ error: "No autorizado" });

      if (!nombre || !precio || !categoria)
        return res.status(400).json({ error: "Faltan campos obligatorios" });

      if (!CATEGORIAS_VALIDAS.includes(categoria))
        return res.status(400).json({ error: "Categoría inválida" });

      const precioNum = parseMonto(precio);
      if (precioNum === null || precioNum <= 0)
        return res.status(400).json({ error: "Precio inválido" });

      const rows = await sql`
        INSERT INTO tienda_productos (nombre, precio, categoria, imagen_url)
        VALUES (${nombre}, ${precioNum}, ${categoria}, ${imagen_url || null})
        RETURNING *
      `;
      return res.status(201).json({
        producto: { ...rows[0], precio: toNumber(rows[0].precio) },
      });
    }

    // ── ADMIN: editar producto ───────────────────────────────────────────────
    if (req.method === "PUT" && action === "admin_editar_producto") {
      const { admin_id, producto_id, nombre, precio, categoria, imagen_url } = req.body;
      if (!ADMIN_IDS_TIENDA.includes(admin_id))
        return res.status(403).json({ error: "No autorizado" });

      if (!producto_id)
        return res.status(400).json({ error: "Falta producto_id" });

      const existe = await sql`SELECT id FROM tienda_productos WHERE id = ${producto_id}`;
      if (existe.length === 0)
        return res.status(404).json({ error: "Producto no encontrado" });

      const precioNum = precio ? parseMonto(precio) : null;
      if (precio !== undefined && (precioNum === null || precioNum <= 0))
        return res.status(400).json({ error: "Precio inválido" });

      if (categoria && !CATEGORIAS_VALIDAS.includes(categoria))
        return res.status(400).json({ error: "Categoría inválida" });

      const rows = await sql`
        UPDATE tienda_productos
        SET
          nombre     = COALESCE(${nombre || null}, nombre),
          precio     = COALESCE(${precioNum}, precio),
          categoria  = COALESCE(${categoria || null}, categoria),
          imagen_url = COALESCE(${imagen_url !== undefined ? imagen_url : null}, imagen_url)
        WHERE id = ${producto_id}
        RETURNING *
      `;
      return res.status(200).json({
        producto: { ...rows[0], precio: toNumber(rows[0].precio) },
      });
    }

    // ── ADMIN: eliminar (desactivar) producto ────────────────────────────────
    if (req.method === "DELETE" && action === "admin_eliminar_producto") {
      const { admin_id, producto_id } = req.query;
      if (!ADMIN_IDS_TIENDA.includes(admin_id))
        return res.status(403).json({ error: "No autorizado" });

      await sql`UPDATE tienda_productos SET activo = FALSE WHERE id = ${producto_id}`;
      return res.status(200).json({ ok: true });
    }

    // ── ADMIN: listar todos los usuarios con inventario (con DNI) ────────────
    if (req.method === "GET" && action === "admin_inventarios") {
      const { admin_id } = req.query;
      if (!ADMIN_IDS_TIENDA.includes(admin_id))
        return res.status(403).json({ error: "No autorizado" });

      // Obtener todos los usuarios que tienen items en inventario
      // y que tengan DNI registrado, con su nombre y RUT
      const rows = await sql`
        SELECT
          i.discord_id,
          COUNT(i.id)::int AS cantidad,
          d.nombre1,
          d.apellido1,
          d.rut
        FROM inventario i
        LEFT JOIN dni d ON d.discord_id = i.discord_id
        WHERE d.discord_id IS NOT NULL
        GROUP BY i.discord_id, d.nombre1, d.apellido1, d.rut
        ORDER BY d.apellido1, d.nombre1
      `;

      return res.status(200).json({
        usuarios: rows.map(r => ({
          discord_id: r.discord_id,
          nombre: `${r.nombre1 || ''} ${r.apellido1 || ''}`.trim() || r.discord_id,
          rut: r.rut || null,
          cantidad: r.cantidad,
        })),
      });
    }

    // ── ADMIN: obtener inventario de un usuario específico ─────────────────
    if (req.method === "GET" && action === "admin_inventario_usuario") {
      const { admin_id, discord_id } = req.query;
      if (!ADMIN_IDS_TIENDA.includes(admin_id))
        return res.status(403).json({ error: "No autorizado" });

      if (!discord_id)
        return res.status(400).json({ error: "Falta discord_id" });

      const rows = await sql`
        SELECT * FROM inventario
        WHERE discord_id = ${discord_id}
        ORDER BY comprado_at DESC
      `;

      return res.status(200).json({
        items: rows.map(i => ({ ...i, precio_pagado: toNumber(i.precio_pagado) })),
      });
    }

    // ── ADMIN: eliminar item del inventario de un usuario ──────────────────
    if (req.method === "DELETE" && action === "admin_eliminar_item_inventario") {
      const { admin_id, item_id } = req.query;
      if (!ADMIN_IDS_TIENDA.includes(admin_id))
        return res.status(403).json({ error: "No autorizado" });

      if (!item_id)
        return res.status(400).json({ error: "Falta item_id" });

      await sql`DELETE FROM inventario WHERE id = ${item_id}`;
      return res.status(200).json({ ok: true });
    }

    // ── ADMIN: base de datos — todos los DNI con su inventario ─────────────
    if (req.method === "GET" && action === "admin_base_datos") {
      const { admin_id, q } = req.query;
      if (!ADMIN_IDS_TIENDA.includes(admin_id))
        return res.status(403).json({ error: "No autorizado" });

      // Traer todos los DNI
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
        `;
      } else {
        dnis = await sql`SELECT * FROM dni ORDER BY apellido1, nombre1`;
      }

      // Traer inventarios de esos discord_ids
      const ids = dnis.map(d => d.discord_id);
      let inventarios = [];
      if (ids.length > 0) {
        inventarios = await sql`
          SELECT * FROM inventario
          WHERE discord_id = ANY(${ids})
          ORDER BY comprado_at DESC
        `;
      }

      // Agrupar inventario por discord_id
      const invMap = {};
      for (const item of inventarios) {
        if (!invMap[item.discord_id]) invMap[item.discord_id] = [];
        invMap[item.discord_id].push({ ...item, precio_pagado: toNumber(item.precio_pagado) });
      }

      return res.status(200).json({
        registros: dnis.map(d => ({
          discord_id: d.discord_id,
          nombre1:   d.nombre1,
          nombre2:   d.nombre2,
          apellido1: d.apellido1,
          apellido2: d.apellido2,
          rut:       d.rut,
          fecha_nac: d.fecha_nac,
          inventario: invMap[d.discord_id] || [],
        })),
      });
    }

    // ── PUBLIC: base de datos — todos los DNI con su inventario ────────────
    if (req.method === "GET" && action === "base_datos") {
      const { q } = req.query;

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
        `;
      } else {
        dnis = await sql`SELECT * FROM dni ORDER BY apellido1, nombre1`;
      }

      const ids = dnis.map(d => d.discord_id);
      let inventarios = [];
      if (ids.length > 0) {
        inventarios = await sql`
          SELECT * FROM inventario
          WHERE discord_id = ANY(${ids})
          ORDER BY comprado_at DESC
        `;
      }

      const invMap = {};
      for (const item of inventarios) {
        if (!invMap[item.discord_id]) invMap[item.discord_id] = [];
        invMap[item.discord_id].push({ ...item, precio_pagado: toNumber(item.precio_pagado) });
      }

      return res.status(200).json({
        registros: dnis.map(d => ({
          discord_id: d.discord_id,
          nombre1:    d.nombre1,
          nombre2:    d.nombre2,
          apellido1:  d.apellido1,
          apellido2:  d.apellido2,
          rut:        d.rut,
          fecha_nac:  d.fecha_nac,
          inventario: invMap[d.discord_id] || [],
        })),
      });
    }

    return res.status(405).json({ error: "Método no permitido" });
  } catch (err) {
    console.error("Error en /api/tienda:", err);
    return res.status(500).json({ error: "Error interno del servidor. Intenta de nuevo." });
  }
}
