import type { Context, Next } from "hono";
import type { Env } from "../types.ts";

export async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseCookie(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key.trim()] = rest.join("=").trim();
  }
  return cookies;
}

export async function generateToken(
  username: string,
  password: string
): Promise<string> {
  const payload = `fishblog:${username}:${await sha256(password)}`;
  return sha256(payload);
}

export async function adminAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const cookies = parseCookie(c.req.header("cookie"));
  const token = cookies["fishblog_token"];
  if (!token) return c.redirect("/admin/login");

  const expected = await generateToken(
    c.env.ADMIN_USERNAME,
    c.env.ADMIN_PASSWORD
  );
  if (token !== expected) return c.redirect("/admin/login");

  await next();
}
