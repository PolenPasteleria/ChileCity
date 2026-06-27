# Cambios aplicados — ChileCity RP

## ⚠️ Acción requerida antes de desplegar

Agrega esta variable de entorno nueva en Vercel (Project Settings → Environment Variables):

- `SESSION_SECRET` → un valor largo y aleatorio (ej. genera uno con `openssl rand -hex 32`).
  Se usa para firmar la cookie de sesión. Sin esto, el login con Discord fallará.

Las variables que ya tenías (`DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DATABASE_URL`) siguen igual.

Opcionales (tienen un valor por defecto igual al que ya usabas, así que no son obligatorias):
- `APP_URL` → tu dominio (ej. `https://chile-city.vercel.app`). Por defecto usa ese mismo.
- `SUPER_ADMIN_ID` → tu ID de Discord de super admin. Por defecto usa el que ya tenías hardcodeado.

## 🔴 Seguridad: autenticación real en el servidor

Antes, cada usuario "se identificaba" mandando su propio `discord_id` en cada petición
(por URL, body o `localStorage`). Cualquiera podía editarlo desde la consola del navegador
y hacerse pasar por otra persona — incluido el super admin.

Ahora, al loguearte con Discord (`/api/callback`) el servidor firma una **cookie httpOnly**
con tu identidad (`lib/auth.js`). Todas las APIs (`banco`, `dni`, `tienda`, `admin`) leen
quién eres desde esa cookie, nunca desde un parámetro que mande el navegador. Los
endpoints sensibles ahora responden `401` si no hay sesión válida.

Se agregaron dos endpoints nuevos:
- `GET /api/me` — para que el frontend sepa quién está logueado (reemplaza leer la URL/localStorage).
- `POST /api/logout` — borra la cookie de sesión.

El panel de admin para gestionar sueldos de otro usuario sigue funcionando: un admin
puede consultar la cuenta de un tercero (`/api/banco?action=cuenta&discord_id=X`), pero
un usuario normal solo puede ver la suya aunque cambie ese parámetro.

## 🟠 Otras correcciones de seguridad

- CORS restringido a tu propio dominio (antes era `*`, abierto a cualquier sitio).
- El ID de super admin estaba duplicado y hardcodeado en 3 archivos distintos
  (`banco.js`, `tienda.js`, `admin.js`); ahora vive en un solo lugar (`lib/constants.js`).
- `dni.js` no tenía manejo de errores (`try/catch`); ahora es consistente con el resto.

## 🟡 Rendimiento

- Las funciones ya no ejecutan `CREATE TABLE IF NOT EXISTS...` en cada request; solo la
  primera vez que la función arranca (se cachea en memoria mientras la instancia esté "tibia").
- `logo.webp`: pesaba 176 KB para mostrarse a 64px; se redujo a 128px de origen → 7 KB,
  sin pérdida de calidad visible.
- Se eliminó `Fondo.png` (y su copia en `.webp`): no se usaba en ningún lado — el fondo real
  se carga desde una URL externa de Imgur. Eran 380 KB muertos en el repo.

## Lo que NO se tocó (a propósito)

- `GET /api/tienda?action=base_datos` sigue siendo público: es el "padrón" de la ciudad,
  tal como estaba diseñado originalmente.
- SEO / Open Graph / favicon: pediste dejarlo fuera de esta tanda.
