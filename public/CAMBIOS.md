# Cambios aplicados — ChileCity RP v13

## ⚠️ Variables de entorno requeridas

Las mismas que v12: `SESSION_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DATABASE_URL`.
No se requieren variables nuevas.

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
