# Cambios aplicados — ChileCity RP v15 (auditoría de mejoras)

## ⚠️ Variables de entorno requeridas

Las mismas que v14 — sin cambios.

---

## 🔒 Seguridad — Headers HTTP

- `vercel.json`: se agregó un bloque `headers` aplicado a todo el sitio:
  - `Content-Security-Policy` — restringe scripts/estilos/fuentes/imágenes a
    `'self'` (más Google Fonts, que ya se usaba) y bloquea que el sitio sea
    embebido en un `<iframe>` ajeno (`frame-ancestors 'none'`).
  - `X-Content-Type-Options: nosniff` — evita que el navegador "adivine" el
    tipo de un archivo servido (mitiga ataques de MIME-sniffing).
  - `X-Frame-Options: DENY` — refuerzo del `frame-ancestors` para navegadores
    viejos que no leen CSP.
  - `Referrer-Policy: strict-origin-when-cross-origin` — no filtra la URL
    completa al navegar a sitios externos.
  - `Permissions-Policy` — deshabilita cámara/micrófono/geolocalización, que
    el sitio no usa.
- La CSP usa `'unsafe-inline'` en `script-src`/`style-src` porque el HTML
  actual tiene `onclick=` inline y `style=""` en varios lugares — si en algún
  momento se migran esos handlers a `addEventListener` y los estilos inline a
  clases CSS, se puede sacar `'unsafe-inline'` y la política queda mucho más
  estricta.

## ⚡ Rendimiento — Caché de estáticos

- `vercel.json`: se agregaron `Cache-Control` para los assets que no cambian
  seguido:
  - `/js/*` y `/styles.css` → `max-age=3600, must-revalidate` (una hora,
    revalida después). Si más adelante versionas los nombres de archivo
    (hash en el nombre), se puede subir a `immutable` con `max-age` largo.
  - Íconos PWA, logo y favicon → `max-age=2592000, immutable` (30 días, no
    cambian salvo que tú los reemplaces a mano).

## 🧹 Limpieza — `vercel.json`

- Se eliminaron 9 entradas de `rewrites` que eran no-operativas (`source`
  igual a `destination`, ej. `/api/dni` → `/api/dni`): Vercel ya enruta
  automáticamente cualquier archivo dentro de `/api` a su mismo path, así
  que esas líneas no hacían nada. Se mantuvieron solo los rewrites que sí
  cambian el path (`/auth/login`, `/api/logout`, assets en `/public`, etc).
- **No se tocó la cantidad de funciones en `/api`** (siguen siendo 12:
  admin, apuestas, banco, callback, casino, comisaria, dni, login,
  notificaciones, perfil-publico, session, tienda) — el plan gratuito de
  Vercel quedó respetado.

## 🗜️ Rendimiento — CSS minificado

- `public/styles.css`: pasado por `clean-css` (nivel `O2`, conserva
  estructura pero quita comentarios, espacios y declaraciones redundantes).
  129 KB → 92.6 KB (~28% más liviano). El contenido visual es idéntico, solo
  cambió el formato del archivo.

## ⏸️ Lo que NO se hizo en esta pasada (y por qué)

- **Autoalojar la imagen de fondo (actualmente en Imgur)**: no se pudo
  descargar desde este entorno porque no tengo acceso de red a `imgur.com`
  (solo a un set acotado de dominios técnicos: npm, PyPI, GitHub, etc).
  Si quieres, descarga tú la imagen y súbela a `public/`, o pásamela como
  archivo adjunto y yo la optimizo (WebP + tamaños) y actualizo las
  referencias en `index.html`.
- **Dividir `index.html` (140 KB) en fragmentos cargados on-demand**: es un
  cambio estructural grande (cómo se cargan las secciones del dashboard) con
  riesgo real de romper algo que no puedo probar en un navegador real desde
  acá. Si quieres avanzar en esto, mejor hacerlo de forma incremental,
  sección por sección, probando en tu entorno de Vercel preview antes de
  pasar a producción.

### Archivos tocados
- `vercel.json` — headers de seguridad, caché de estáticos, limpieza de rewrites redundantes.
- `public/styles.css` — minificado.

---

# Cambios aplicados — ChileCity RP v14

## ⚠️ Variables de entorno requeridas

Las mismas que v13 — sin cambios.

---

## 🔒 Seguridad — XSS almacenado en Banco y Panel Admin

- `public/js/banco.js`: la descripción de las transacciones, los nombres de
  usuario/RUT del panel admin, los nombres de sueldo y los contactos
  guardados se renderizaban con `innerHTML` **sin escapar**. Si alguien
  escribía HTML/JS en el concepto de una transferencia (por ejemplo), se
  ejecutaba en la pantalla de quien viera ese historial. Ahora todos esos
  campos pasan por `escHtml()`, igual que en comisaría/perfil público.
- `public/js/panel-admin.js`: el nombre de Discord y el ID de cada admin en
  la lista del Panel Admin tampoco se escapaban. Corregido por consistencia
  y defensa en profundidad.
- Se auditó el resto de los módulos (`casino.js`, `tienda.js`,
  `admin-tienda.js`, `empresas.js`, `apuestas.js`): ya escapaban
  correctamente todo el texto proveniente de usuarios, no requerían cambios.

## 📱 PWA — Set completo de íconos

- El manifest solo traía un ícono de 128×128 sin propósito `maskable` bien
  formado (recortaba mal en algunos launchers Android). Se generaron
  `icon-192.png`, `icon-512.png` (purpose `any`) e `icon-maskable-512.png`
  (con relleno de seguridad y fondo `#0a0a0f`) a partir del logo original,
  y se agregaron sus rewrites correspondientes en `vercel.json`.

## 🖼️ Rendimiento — imagen de fondo

- `index.html`: se agregó `<link rel="preload" fetchpriority="high">` para
  la imagen de fondo, además de `fetchpriority="high"` y `decoding="async"`
  en el `<img>`, ya que es contenido visible de inmediato (no debe ir con
  `loading="lazy"`).
- Se agregó un fundido de entrada (`opacity` + `transition`) para que la
  imagen no aparezca de golpe ("pop-in") mientras carga, con manejo de
  `onerror` para que la pantalla no se quede oscura si la imagen falla.
- Nota: la imagen sigue sirviéndose desde Imgur sin variantes responsivas;
  para una mejora real de peso conviene autoalojar una versión comprimida
  (WebP, varias resoluciones) — no se pudo hacer en este cambio por no
  tener acceso de red para descargarla y recomprimirla.

## 🔊 Sonidos y microinteracciones

- Nuevas funciones globales en `app.js`: `sonidoNotificacion()` (ping suave,
  dos tonos) y `sonidoConfirmacion()` (click corto tipo "listo"), con el
  mismo motor de Web Audio que ya usaban los sonidos de victoria/derrota del
  casino — sin archivos de audio externos.
- La campanita de notificaciones ahora también suena (sutil) cuando llega
  una notificación nueva, además de agitarse como antes.
- Transferencias bancarias exitosas y toasts de tipo `success` (compras en
  tienda, acciones varias) reproducen `sonidoConfirmacion()`.
- Generar la Cédula de Identidad por primera vez ahora tiene una animación
  de aparición (`rc-carnet-reveal`) + sonido de confirmación — pero solo la
  primera vez que se crea, no cada vez que se abre Registro Civil con un
  carnet ya existente.

### Archivos tocados
- `public/js/banco.js`, `public/js/panel-admin.js` — fix de XSS.
- `public/manifest.json`, `vercel.json` — íconos PWA.
- `public/index.html`, `public/styles.css` — preload/fade de fondo, animación de carnet.
- `public/js/app.js` — nuevos sonidos `sonidoNotificacion()` / `sonidoConfirmacion()`.
- `public/js/notificaciones.js`, `public/js/tienda.js`, `public/js/registro-civil.js` — enganche de los nuevos sonidos.

---



## 🔔 Notificaciones — antecedentes + avisos de administración

### Qué cambia
- La campanita de notificaciones (`/api/notificaciones`) ahora también avisa cuando a un usuario **le registran un antecedente policial** (tabla `antecedentes`), además de multas, transferencias recibidas y resultados de apuestas deportivas que ya existían.
- Nueva tabla `notif_admin`: permite al Panel Admin **enviar avisos manuales** a todos los usuarios o a Discord IDs específicos. Aparecen en la campanita con el ícono 📢 y el título que escriba el admin.
- Cualquier cuenta que esté en la tabla `admins` (o el `SUPER_ADMIN_ID`) puede enviar avisos — mismo criterio de permisos que el resto del Panel Admin.
- Nuevo endpoint: `POST /api/notificaciones?action=enviar` con body `{ titulo, detalle, destinatarios }`, donde `destinatarios` es `"todos"` o un arreglo de Discord IDs (máx. 50).
- Se corrigió el scroll del panel de notificaciones: antes el encabezado ("Notificaciones" / "Marcar leídas") se desplazaba junto con la lista; ahora queda fijo arriba y solo la lista de notificaciones hace scroll, sin filtrarse el scroll hacia el resto de la página (`overscroll-behavior: contain`).
- Nueva sección **"Enviar Notificación"** dentro de Panel Admin → permite elegir entre "Todos los usuarios" o "Usuarios específicos" (Discord IDs separados por coma), con título y mensaje opcional.

### Archivos tocados
- `api/notificaciones.js` — antecedentes, tabla `notif_admin`, acción `enviar`.
- `public/js/notificaciones.js` — manejo del nuevo tipo `admin` y `antecedente`.
- `public/js/panel-admin.js` — `pnSetModo()` / `pnEnviarNotificacion()`.
- `public/index.html` — formulario "Enviar Notificación" en Panel Admin.
- `public/styles.css` — fix de scroll del panel de notificaciones.

---

## ⚠️ Variables de entorno requeridas (heredado)

## 🔴 Perfil Público (reemplaza Base de Datos)

### Qué cambia
- La sección **"Base de Datos"** fue eliminada completamente.
- La reemplaza **"Perfil Público"** — accesible solo para usuarios con sesión iniciada.
- La ruta pública `GET /api/tienda?action=base_datos` queda obsoleta (ya no se llama desde el frontend).
- La nueva API es `GET /api/perfil-publico` — requiere sesión (cookie httpOnly), devuelve todos los ciudadanos con su inventario, multas y antecedentes en una sola llamada paralela.

### Qué muestra cada ciudadano
Cada DNI registrado en la ciudad expande un panel con tres pestañas:
- **Inventario** — grid con imagen, nombre y precio pagado de cada item.
- **Multas** — lista con motivo, fecha, funcionario, monto y estado (pendiente/pagada).
- **Antecedentes** — lista con motivo, artículos, fecha, funcionario y tiempo de cárcel.

### Búsqueda
- Barra con debounce de 280 ms — no spamea el servidor mientras el usuario escribe.
- Botón ✕ para limpiar (también funciona con `Escape`).
- Busca por nombre, apellidos o RUT en todos los campos.

### Stats bar
Cuatro contadores en tiempo real: ciudadanos, items totales, multas y antecedentes.
Los últimos dos tienen color de alerta (amarillo y rojo).

---

## 🟡 Rendimiento

- `GET /api/perfil-publico` carga inventarios, multas y antecedentes en **paralelo** con `Promise.all`, no en secuencia — una sola ida a la BD en lugar de tres.
- El esquema de la tabla de `dni` solo se inicializa la primera vez que la función arranca (igual que el resto de las APIs en v12).
- La búsqueda en el frontend tiene debounce de 280 ms para no disparar peticiones en cada tecla.

---

## 🎨 Visual — Dashboard cards premium

- Las cards del dashboard cambiaron de layout **vertical → horizontal** (icono a la izquierda, texto centrado, flecha a la derecha).
- El icono de cada card tiene su propio `border-radius` y fondo, y escala suavemente al hacer hover.
- La flecha `›` de cada card ahora se desplaza levemente hacia la derecha al hover en lugar de aparecer desde la nada.
- Un indicador de color (línea de 3px en el borde izquierdo) aparece al hover, usando `--card-color` de cada card.
- `backdrop-filter: blur(12px)` en todas las cards para efecto glass más premium.
- En mobile (≤600px) el grid cambia a **1 columna**.

---

## ✨ Visual — Transiciones de sección

- `mostrarPantalla()` detecta si el usuario va del dashboard a una sección (`screen-enter`) o vuelve al dashboard (`screen-return`) y aplica animaciones distintas:
  - **Hacia sección**: desliza desde la derecha (`translateX(32px → 0)`).
  - **Volver al dashboard**: desliza desde la izquierda (`translateX(-24px → 0)`).
- Las animaciones duran 420 ms y 380 ms respectivamente, con la curva `cubic-bezier(0.16,1,0.3,1)`.

---

## 🧭 UX — Indicador de sección

- Al navegar entre secciones aparece una **píldora flotante** centrada en la parte superior con el nombre de la sección activa.
- Desaparece automáticamente después de 1.8 s.
- Diseño: fondo dark con `backdrop-filter`, borde sutil, fade + slide vertical.
- No aparece en landing ni dashboard.

---

## ✅ UX — Validación en tiempo real (Registro Civil)

- Los campos de nombre y apellido muestran borde **verde** al superar 2 caracteres válidos, y borde **rojo** + micro-animación de sacudida si se detecta un carácter inválido (números, símbolos).
- El campo de fecha muestra borde verde al seleccionarse.
- La validación ocurre en `input` (en cada tecla), no solo al enviar.

---

## 📱 UX — Mobile First pass

- `seccion-container` ahora respeta `safe-area-inset` de iOS (notch y barra de gestos).
- El header de sección, título y botón volver tienen tamaños optimizados para pantallas ≤480px.
- El header de cada card de Perfil Público oculta la meta (fecha/items) en pantallas pequeñas para no colapsar el layout.
- La barra de búsqueda de Perfil Público oculta el botón X nativo de Chrome/iOS (`.pp-search-input::-webkit-search-cancel-button`) para usar solo el nuestro.
- El grid de inventario dentro de Perfil Público reduce el ancho mínimo de items en mobile.

---

## Lo que NO se tocó

- Banco, Tienda, Casino, Apuestas, Comisaría, Panel Admin, Admin Banco, Admin Tienda — sin cambios.
- SEO / Open Graph / favicon — sin cambios.
- Rate limiting — sin cambios.
- Autenticación por cookie httpOnly — sin cambios.
