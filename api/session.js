import { getSessionUser, clearSessionCookie } from "../lib/auth.js";
import { SUPER_ADMIN_ID, BASE_URL } from "../lib/constants.js";

// ── Sesión ────────────────────────────────────────────────────────────────
// Fusiona lo que antes eran dos funciones serverless separadas (/api/me y
// /api/logout) en una sola. Vercel Hobby permite máximo 12 Serverless
// Functions por deployment, y este proyecto ya estaba al límite (13), así
// que en vez de borrar funcionalidad se combinan estas dos rutas — ambas
// pequeñas y relacionadas con el estado de sesión — en un solo archivo.
// El enrutamiento real sigue viviendo en vercel.json: tanto /api/me como
// /api/logout apuntan a este mismo archivo físico.

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", BASE_URL);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.status(200).end();

  // El query param "ruta" lo agrega vercel.json al reescribir /api/logout y
  // /api/me hacia este mismo archivo (más confiable que inspeccionar
  // req.url, cuyo comportamiento con rewrites puede variar).
  const esLogout = req.query?.ruta === "logout";

  if (esLogout) {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true });
  }

  // Por defecto (o /api/me): devolver el estado de sesión actual.
  const user = getSessionUser(req);
  if (!user) return res.status(200).json({ autenticado: false });

  return res.status(200).json({
    autenticado: true,
    id: user.id,
    name: user.name,
    tag: user.tag,
    avatar: user.avatar,
    esSuperAdmin: user.id === SUPER_ADMIN_ID,
  });
}
