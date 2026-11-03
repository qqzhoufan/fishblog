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

const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

// This table is deliberately additive: old posts, settings and API keys are untouched.
async function ensureSessionsTable(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS admin_sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  )`).run();
}

// Bind sessions to the current credentials without storing a password verifier.
// The token itself is random and never persisted, even in hashed form by itself.
async function sessionHash(token: string, env: Env): Promise<string> {
  return sha256(`fishblog-session-v1:${token}:${env.ADMIN_USERNAME}:${await sha256(env.ADMIN_PASSWORD)}`);
}

export async function createAdminSession(env: Env): Promise<string> {
  await ensureSessionsTable(env.DB);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").bind(now).run();
  await env.DB.prepare("INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)")
    .bind(await sessionHash(token, env), now + SESSION_MAX_AGE_SECONDS).run();
  return token;
}

export async function revokeAdminSession(c: Context<{ Bindings: Env }>): Promise<void> {
  const token = parseCookie(c.req.header("cookie"))["fishblog_token"];
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return;
  await ensureSessionsTable(c.env.DB);
  await c.env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?")
    .bind(await sessionHash(token, c.env)).run();
}

export async function adminAuth(c: Context<{ Bindings: Env }>, next: Next) {
  if (!c.env.ADMIN_USERNAME || !c.env.ADMIN_PASSWORD) return c.redirect("/admin/login");
  const cookies = parseCookie(c.req.header("cookie"));
  const token = cookies["fishblog_token"];
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return c.redirect("/admin/login");

  await ensureSessionsTable(c.env.DB);
  const session = await c.env.DB.prepare(
    "SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND expires_at > ?"
  ).bind(await sessionHash(token, c.env), Math.floor(Date.now() / 1000)).first();
  if (!session) return c.redirect("/admin/login");

  await next();
}
