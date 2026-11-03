/** Optional transactional-email outbox. No provider is contacted unless configured. */
export type NotificationEnv = {
  DB: D1Database;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  ADMIN_NOTIFY_EMAIL?: string;
  SITE_URL?: string;
};

export type NotificationInput = {
  kind: "comment" | "reply";
  /** Stable identifier, for example the comment or reply ID. */
  eventId: string;
  commentId: number;
  /** Required only for a reply to a visitor who opted in. */
  recipient?: string;
  postTitle: string;
  postSlug: string;
  author: string;
  content: string;
};

export type NotificationStats = {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  /** Attempts made by this site today; other applications may share the provider quota. */
  todayAttempts: number;
};

type NotificationJob = {
  event_key: string;
  idempotency_key: string;
  recipient: string;
  subject: string;
  body: string;
  attempts: number;
  created_at: number;
};

const MAX_PER_DAY = 80;
const MAX_ATTEMPTS = 3;
// Resend retains idempotency keys for 24 hours. Never retry an older request:
// after that period a timed-out but delivered request might be sent twice.
const MAX_RETRY_AGE = 23 * 60 * 60;
const RETENTION_SECONDS = 7 * 24 * 60 * 60;
const LEASE_SECONDS = 120;
const RETRY_DELAYS = [60, 300, 900];

function cleanAddress(value: string | undefined): string | null {
  if (!value || value.length > 254 || /[\x00-\x1f\x7f]/.test(value)) return null;
  const address = value.trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) ? address : null;
}

function settings(env: NotificationEnv): { key: string; from: string; origin: string } | null {
  const key = env.RESEND_API_KEY?.trim();
  const from = cleanAddress(env.MAIL_FROM);
  if (!key || /[\x00-\x20\x7f]/.test(key) || !from || !env.SITE_URL || /[\x00-\x20\x7f]/.test(env.SITE_URL)) return null;
  try {
    const url = new URL(env.SITE_URL);
    // A deployment-owned URL is explicitly configured, never derived from the request Host.
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return { key, from, origin: url.origin };
  } catch {
    return null;
  }
}

export function notificationConfigured(env: NotificationEnv): boolean {
  return settings(env) !== null;
}

export function adminNotificationConfigured(env: NotificationEnv): boolean {
  return notificationConfigured(env) && cleanAddress(env.ADMIN_NOTIFY_EMAIL) !== null;
}

/** Idempotent, additive tables. They do not change existing comments or posts. */
export async function ensureNotificationTables(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS notification_outbox (
    event_key TEXT PRIMARY KEY,
    idempotency_key TEXT NOT NULL,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    lease_until INTEGER NOT NULL DEFAULT 0,
    first_attempt_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    error_code TEXT
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_notification_due ON notification_outbox(status, next_attempt_at, lease_until)").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS notification_daily_quota (
    day TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL
  )`).run();
}

function message(env: NotificationEnv, input: NotificationInput) {
  const config = settings(env);
  const recipient = cleanAddress(input.kind === "comment" ? env.ADMIN_NOTIFY_EMAIL : input.recipient);
  if (!config || !recipient || !Number.isSafeInteger(input.commentId) || input.commentId <= 0 || !/^[A-Za-z0-9_-]{1,128}$/.test(input.eventId)) return null;
  const url = new URL(`/post/${encodeURIComponent(input.postSlug)}`, config.origin);
  url.hash = `comment-${input.commentId}`;
  const title = input.postTitle.slice(0, 300);
  const author = input.author.slice(0, 100);
  const text = input.content.slice(0, 2500);
  const subject = input.kind === 'comment' ? 'FishBlog：有新评论' : 'FishBlog：你的评论有了回复';
  const body = input.kind === 'comment'
    ? `文章：${title}\n评论人：${author}\n\n${text}\n\n查看评论：${url.href}`
    : `你在《${title}》的评论有了回复：\n\n${text}\n\n查看回复：${url.href}`;
  return { eventKey: `${input.kind}/${input.eventId}`, recipient, subject, body };
}

/**
 * Build the outbox INSERT as a D1 statement for callers that already have a
 * comment ID and need to include it in a larger atomic db.batch(). Call
 * ensureNotificationTables first. Returns null when mail is not configured.
 */
export function prepareNotificationInsert(env: NotificationEnv, input: NotificationInput): D1PreparedStatement | null {
  const item = message(env, input);
  if (!item) return null;
  const now = Math.floor(Date.now() / 1000);
  return env.DB.prepare(`INSERT OR IGNORE INTO notification_outbox
    (event_key, idempotency_key, comment_id, kind, recipient, subject, body, next_attempt_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(item.eventKey, `fishblog/${crypto.randomUUID()}`, input.commentId, input.kind, item.recipient, item.subject, item.body, now, now, now);
}

/** Returns false when mail is disabled; repeated event IDs never create duplicates. */
export async function enqueueNotification(env: NotificationEnv, input: NotificationInput): Promise<boolean> {
  if (!message(env, input)) return false;
  await ensureNotificationTables(env.DB);
  const insert = prepareNotificationInsert(env, input);
  if (!insert) return false;
  await insert.run();
  return true;
}

/** Aggregate only: never return email addresses, message content or provider errors. */
export async function getNotificationStats(env: NotificationEnv): Promise<NotificationStats> {
  if (!notificationConfigured(env)) return { pending: 0, sending: 0, sent: 0, failed: 0, todayAttempts: 0 };
  await ensureNotificationTables(env.DB);
  const rows = await env.DB.prepare("SELECT status, count(*) AS count FROM notification_outbox GROUP BY status")
    .all<{ status: string; count: number }>();
  const counts = Object.fromEntries(rows.results.map((row) => [row.status, row.count]));
  const day = new Date().toISOString().slice(0, 10);
  const quota = await env.DB.prepare("SELECT attempts FROM notification_daily_quota WHERE day = ?")
    .bind(day).first<{ attempts: number }>();
  return { pending: counts.pending || 0, sending: counts.sending || 0, sent: counts.sent || 0, failed: counts.failed || 0, todayAttempts: quota?.attempts || 0 };
}

/** Manually retry recent failures and pending jobs. Older messages cannot be retried safely. */
export async function retryFailedNotifications(env: NotificationEnv): Promise<void> {
  if (!notificationConfigured(env)) return;
  await ensureNotificationTables(env.DB);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(`UPDATE notification_outbox SET status = 'pending', attempts = 0,
    next_attempt_at = ?, lease_until = 0, error_code = NULL, updated_at = ?
    WHERE status IN ('failed', 'pending') AND (first_attempt_at IS NULL OR first_attempt_at >= ?)`)
    .bind(now, now, now - MAX_RETRY_AGE).run();
}

/**
 * Send at most one due message. Call from waitUntil after queueing, and from an
 * administrator-only retry action. No timers or extra Cloudflare products are required.
 * Provider/API failures are recorded without secrets, recipients or response bodies.
 */
export async function processNotifications(env: NotificationEnv): Promise<boolean> {
  const config = settings(env);
  if (!config) return false;
  await ensureNotificationTables(env.DB);
  const db = env.DB;
  const now = Math.floor(Date.now() / 1000);
  await db.prepare("DELETE FROM notification_outbox WHERE created_at < ?").bind(now - RETENTION_SECONDS).run();
  await db.prepare("DELETE FROM notification_daily_quota WHERE day < ?")
    .bind(new Date((now - RETENTION_SECONDS) * 1000).toISOString().slice(0, 10)).run();
  // Old records may have timed out after delivery; do not risk sending twice.
  await db.prepare("UPDATE notification_outbox SET status = 'failed', error_code = 'expired', updated_at = ? WHERE status != 'sent' AND first_attempt_at IS NOT NULL AND first_attempt_at < ?")
    .bind(now, now - MAX_RETRY_AGE).run();
  const job = await db.prepare(`UPDATE notification_outbox SET status = 'sending', lease_until = ?, updated_at = ?
    WHERE event_key = (SELECT event_key FROM notification_outbox
      WHERE ((status = 'pending' AND next_attempt_at <= ?) OR (status = 'sending' AND lease_until <= ?))
        AND attempts < ? AND (first_attempt_at IS NULL OR first_attempt_at >= ?) ORDER BY created_at, event_key LIMIT 1)
    RETURNING event_key, idempotency_key, recipient, subject, body, attempts, created_at`)
    .bind(now + LEASE_SECONDS, now, now, now, MAX_ATTEMPTS, now - MAX_RETRY_AGE).first<NotificationJob>();
  if (!job) return false;
  const quota = await db.prepare(`INSERT INTO notification_daily_quota(day, attempts) VALUES (?, 1)
    ON CONFLICT(day) DO UPDATE SET attempts = attempts + 1 WHERE attempts < ? RETURNING attempts`)
    .bind(new Date(now * 1000).toISOString().slice(0, 10), MAX_PER_DAY).first<{ attempts: number }>();
  if (!quota) {
    // Defer until the next UTC day without consuming a retry attempt.
    const tomorrow = Math.floor(now / 86400) * 86400 + 86400;
    await db.prepare("UPDATE notification_outbox SET status = 'pending', lease_until = 0, next_attempt_at = ?, error_code = 'daily_limit', updated_at = ? WHERE event_key = ? AND status = 'sending'")
      .bind(tomorrow, now, job.event_key).run();
    return false;
  }
  const attempt = job.attempts + 1;
  // Persist the first actual attempt before sending, even if the Worker stops
  // before it can record the response. Quota-deferred jobs have not been sent.
  await db.prepare("UPDATE notification_outbox SET first_attempt_at = COALESCE(first_attempt_at, ?) WHERE event_key = ? AND status = 'sending'")
    .bind(now, job.event_key).run();
  let delivered = false;
  let errorCode = 'network';
  let permanent = false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${config.key}`, 'Content-Type': 'application/json', 'Idempotency-Key': job.idempotency_key },
      body: JSON.stringify({ from: config.from, to: [job.recipient], subject: job.subject, text: job.body }),
      signal: AbortSignal.timeout(10000),
    });
    delivered = response.ok;
    if (!delivered) {
      errorCode = `http_${response.status}`;
      // Other 4xx require a configuration/address correction. 409 may be a
      // concurrent idempotent request; 429 is retryable.
      permanent = response.status >= 400 && response.status < 500 && response.status !== 409 && response.status !== 429;
    }
  } catch {
    // Deliberately do not log exceptions: provider errors can include PII or keys.
  }
  const completed = Math.floor(Date.now() / 1000);
  if (delivered) {
    await db.prepare("UPDATE notification_outbox SET status = 'sent', attempts = ?, lease_until = 0, error_code = NULL, updated_at = ? WHERE event_key = ? AND status = 'sending'")
      .bind(attempt, completed, job.event_key).run();
  } else {
    const terminal = permanent || attempt >= MAX_ATTEMPTS;
    const next = completed + RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
    await db.prepare("UPDATE notification_outbox SET status = ?, attempts = ?, lease_until = 0, next_attempt_at = ?, error_code = ?, updated_at = ? WHERE event_key = ? AND status = 'sending'")
      .bind(terminal ? 'failed' : 'pending', attempt, next, errorCode, completed, job.event_key).run();
  }
  return true;
}

/** Drain a bounded number of due jobs without adding paid infrastructure. */
export async function processNotificationBatch(env: NotificationEnv): Promise<void> {
  for (let i = 0; i < 10; i++) {
    if (!await processNotifications(env)) break;
  }
}
