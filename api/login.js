export default function handler(req, res) {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", process.env.DISCORD_CLIENT_ID);
  url.searchParams.set("redirect_uri", "https://chile-city.vercel.app/auth/callback");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  res.redirect(url.toString());
}
