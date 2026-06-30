// ── Service Worker — ChileCity RP ────────────────────────────────────────────
// Estrategia:
//   - /api/*           → SIEMPRE red (nunca cache: saldo, inventario, sesión, etc.
//                         son datos en vivo y cachearlos sería mostrar info vieja
//                         o de otro usuario).
//   - HTML (navegación) → network-first con fallback a cache si no hay señal.
//   - JS/CSS/íconos     → cache-first con actualización en segundo plano
//                         (stale-while-revalidate), para que la app cargue
//                         instantáneo y de paso quede medio-funcional offline.
//
// Subir CACHE_VERSION cuando cambien JS/CSS importantes para forzar que los
// clientes viejos descarten el cache anterior.

const CACHE_VERSION = "v1";
const CACHE_NAME = `chilecity-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/styles.css",
  "/favicon.svg",
  "/js/app.js",
  "/js/notificaciones.js",
  "/js/registro-civil.js",
  "/js/banco.js",
  "/js/tienda.js",
  "/js/admin-tienda.js",
  "/js/empresas.js",
  "/js/logros.js",
  "/js/panel-admin.js",
  "/js/comisaria.js",
  "/js/casino.js",
  "/js/apuestas.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        // Si falla el precache (ej. sin red en el install), no bloqueamos
        // la instalación del SW — igual sirve para lo que ya se cachee después.
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre.startsWith("chilecity-") && nombre !== CACHE_NAME)
            .map((nombre) => caches.delete(nombre))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // nunca interceptar POST/PUT/DELETE

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // solo same-origin

  // /api/* y /auth/* → directo a la red, nunca cache.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return;
  }

  // Navegación (HTML) → network-first, fallback a cache si no hay señal.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Estáticos (JS/CSS/íconos) → stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
