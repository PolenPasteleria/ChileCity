import { setSessionCookie } from "../lib/auth.js";
import { BASE_URL } from "../lib/constants.js";

export default async function handler(req, res) {
  const code = req.query.code;
  if (!code) return res.status(400).send("Sin código de autorización");

  try {
    // 1. Intercambiar código por access token
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type:    "authorization_code",
        code,
        redirect_uri: `${BASE_URL}/auth/callback`,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error("Token error:", tokenData);
      return res.status(500).send("Error obteniendo token de Discord");
    }

    // 2. Obtener datos del usuario
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const user = await userRes.json();

    const avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator || 0) % 5}.png`;

    // 3. Firmar la sesión en el servidor (cookie httpOnly). El frontend ya no
    //    recibe ni necesita el discord_id por la URL: cada API lo lee de la
    //    cookie, así nadie puede falsificar de quién es la sesión.
    setSessionCookie(res, {
      id:       user.id,
      name:     user.global_name || user.username,
      tag:      user.discriminator !== "0" ? `#${user.discriminator}` : "",
      username: user.username || null, // @handle real de Discord, usado para buscar por usuario en Perfil Público
      avatar,
    });

    res.redirect("/");
  } catch (err) {
    console.error("OAuth error:", err);
    res.status(500).send("Error interno de autenticación");
  }
}
