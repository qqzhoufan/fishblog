import type { Context } from "hono";
import type { Env } from "../types.ts";
import { sha256 } from "./auth.ts";

/** Fixed-window counters live in D1 so limits are shared across Worker isolates. */
export async function checkRateLimit(
  c: Context<{ Bindings: Env }>,
  action: "login" | "comment",
  maximum: number,
  windowSeconds: number,
): Promise<number> {
  // Cloudflare supplies this header on deployed Workers. Local requests without
  // it keep working; don't collapse all local users into one shared bucket.
  const ip = c.req.header("CF-Connecting-IP");
  if (!ip || ip.length > 45) return 0;

  const db = c.env.DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS request_rate_limits (
    bucket_key TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_request_rate_limits_expiry ON request_rate_limits(expires_at)").run();
  const now = Math.floor(Date.now() / 1000);
  // Expired buckets are deleted on subsequent traffic, so IP churn does not
  // leave permanently growing state. Only one hash per action and IP is stored.
  await db.prepare("DELETE FROM request_rate_limits WHERE expires_at <= ?").bind(now).run();
  const key = await sha256(`${action}:${ip}`);
  const counter = await db.prepare(`INSERT INTO request_rate_limits (bucket_key, expires_at, attempts)
    VALUES (?, ?, 1)
    ON CONFLICT(bucket_key) DO UPDATE SET attempts = attempts + 1
    RETURNING expires_at, attempts`).bind(key, now + windowSeconds)
    .first<{ expires_at: number; attempts: number }>();
  if (!counter || counter.attempts <= maximum) return 0;
  return Math.max(1, counter.expires_at - now);
}
