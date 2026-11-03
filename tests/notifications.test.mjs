import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { enqueueNotification, getNotificationStats, notificationConfigured, processNotifications, retryFailedNotifications, ensureNotificationTables, prepareNotificationInsert } from '../src/services/notifications.ts';

function makeDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON; CREATE TABLE comments (id INTEGER PRIMARY KEY); INSERT INTO comments(id) VALUES (1), (2), (3)');
  return { sqlite, prepare(sql) {
    let args = [];
    const statement = {
      bind(...values) { args = values; return statement; },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { return sqlite.prepare(sql).run(...args); },
    };
    return statement;
  } };
}
const makeEnv = (DB) => ({ DB, RESEND_API_KEY: 're_test_key', MAIL_FROM: 'blog@example.com', ADMIN_NOTIFY_EMAIL: 'owner@example.com', SITE_URL: 'https://blog.example.com' });
const event = { kind: 'comment', eventId: '1', commentId: 1, postTitle: '文章', postSlug: 'hello', author: '读者', content: '你好' };

test('disabled, missing consent and hostile configuration never enqueue or contact provider', async (t) => {
  const db = makeDb();
  t.after(() => db.sqlite.close());
  const mocked = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected send'); });
  assert.equal(await enqueueNotification({ DB: db }, event), false);
  assert.equal(await enqueueNotification(makeEnv(db), { ...event, kind: 'reply', recipient: undefined }), false);
  assert.equal(await enqueueNotification(makeEnv(db), { ...event, kind: 'reply', recipient: 'victim@example.com\nBcc:bad@example.com' }), false);
  for (const site of ['javascript:alert(1)', 'https://good.example@evil.example', 'https://good.example/\nheader']) {
    assert.equal(notificationConfigured({ ...makeEnv(db), SITE_URL: site }), false);
  }
  assert.equal(notificationConfigured({ ...makeEnv(db), MAIL_FROM: 'x@example.com\r\nBcc:bad@example.com' }), false);
  await processNotifications({ DB: db });
  assert.equal(mocked.mock.calls.length, 0);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name='notification_outbox'").get().n, 0);
});

test('idempotent outbox sends sanitized text via configured trusted origin and returns private aggregate only', async (t) => {
  const db = makeDb();
  t.after(() => db.sqlite.close());
  const env = makeEnv(db);
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('{"id":"test"}', {status: 200}));
  const input = { ...event, postSlug: 'post?next=https://evil.test', content: '<img src=x onerror=alert(1)>' };
  assert.equal(await enqueueNotification(env, input), true);
  assert.equal(await enqueueNotification(env, input), true);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM notification_outbox').get().n, 1);
  await Promise.all([processNotifications(env), processNotifications(env)]);
  assert.equal(mock.mock.calls.length, 1);
  const [endpoint, request] = mock.mock.calls[0].arguments;
  assert.equal(endpoint, 'https://api.resend.com/emails');
  assert.match(request.headers['Idempotency-Key'], /^fishblog\/[0-9a-f-]{36}$/);
  const payload = JSON.parse(request.body);
  assert.deepEqual(payload.to, ['owner@example.com']);
  assert.equal(payload.html, undefined);
  assert.match(payload.text, /https:\/\/blog\.example\.com\/post\/post%3Fnext%3Dhttps%3A%2F%2Fevil.test#comment-1/);
  const stats = await getNotificationStats(env);
  assert.deepEqual(stats, { pending: 0, sending: 0, sent: 1, failed: 0, todayAttempts: 1 });
  assert.doesNotMatch(JSON.stringify(stats), /example\.com|re_test|onerror/);
  db.sqlite.prepare('DELETE FROM comments WHERE id = 1').run();
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM notification_outbox').get().n, 0);
});

test('provider failures are recorded safely and can be retried without duplicating the event', async (t) => {
  const db = makeDb();
  t.after(() => db.sqlite.close());
  const env = makeEnv(db);
  let status = 503;
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('leaked-key-and-email', { status }));
  await enqueueNotification(env, { ...event, kind: 'reply', eventId: 'reply-1', recipient: 'visitor@example.com' });
  await processNotifications(env);
  let row = db.sqlite.prepare('SELECT status, attempts, error_code FROM notification_outbox').get();
  assert.deepEqual({ ...row }, { status: 'pending', attempts: 1, error_code: 'http_503' });
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM notification_outbox WHERE error_code LIKE '%leaked%'").get().n, 0);
  db.sqlite.prepare('UPDATE notification_outbox SET next_attempt_at = 0').run();
  status = 400;
  await processNotifications(env);
  row = db.sqlite.prepare('SELECT status, attempts, error_code FROM notification_outbox').get();
  assert.deepEqual({ ...row }, { status: 'failed', attempts: 2, error_code: 'http_400' });
  await retryFailedNotifications(env);
  status = 200;
  await processNotifications(env);
  assert.equal((await getNotificationStats(env)).sent, 1);
  assert.equal(mock.mock.calls.length, 3);
  assert.equal(new Set(mock.mock.calls.map((call) => call.arguments[1].headers['Idempotency-Key'])).size, 1);
});

test('daily cap defers without sending, and messages older than idempotency window never retry', async (t) => {
  const db = makeDb();
  t.after(() => db.sqlite.close());
  const env = makeEnv(db);
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 200 }));
  await ensureNotificationTables(db);
  await prepareNotificationInsert(env, event).run();
  db.sqlite.prepare('INSERT INTO notification_daily_quota(day, attempts) VALUES (?, 80)').run(new Date().toISOString().slice(0,10));
  await processNotifications(env);
  assert.equal(mock.mock.calls.length, 0);
  let row = db.sqlite.prepare('SELECT status, attempts, error_code, next_attempt_at FROM notification_outbox').get();
  assert.equal(row.status, 'pending');
  assert.equal(row.attempts, 0);
  assert.equal(row.error_code, 'daily_limit');
  assert.ok(row.next_attempt_at > Date.now() / 1000);
  // A quota-deferred message has never been sent, so it remains eligible even
  // after 23 hours; the idempotency window begins with the first real attempt.
  db.sqlite.prepare('UPDATE notification_outbox SET created_at = ?, next_attempt_at = 0').run(Math.floor(Date.now() / 1000) - 24 * 3600);
  db.sqlite.prepare('DELETE FROM notification_daily_quota').run();
  await processNotifications(env);
  assert.equal(mock.mock.calls.length, 1);
  assert.equal((await getNotificationStats(env)).sent, 1);

  await enqueueNotification(env, { ...event, eventId: '2', commentId: 2 });
  db.sqlite.prepare("UPDATE notification_outbox SET first_attempt_at = ?, status = 'pending' WHERE comment_id = 2").run(Math.floor(Date.now() / 1000) - 24 * 3600);
  await processNotifications(env);
  await retryFailedNotifications(env);
  row = db.sqlite.prepare('SELECT status, error_code FROM notification_outbox WHERE comment_id = 2').get();
  assert.equal(row.status, 'failed');
  assert.equal(row.error_code, 'expired');
  assert.equal(mock.mock.calls.length, 1);
});

test('separate sites sharing a provider account use distinct stable idempotency keys', async (t) => {
  const firstDb = makeDb();
  const secondDb = makeDb();
  t.after(() => { firstDb.sqlite.close(); secondDb.sqlite.close(); });
  const first = makeEnv(firstDb);
  const second = makeEnv(secondDb);
  await enqueueNotification(first, event);
  await enqueueNotification(first, event);
  await enqueueNotification(second, event);
  const key1 = firstDb.sqlite.prepare('SELECT idempotency_key FROM notification_outbox').get().idempotency_key;
  const key2 = secondDb.sqlite.prepare('SELECT idempotency_key FROM notification_outbox').get().idempotency_key;
  assert.notEqual(key1, key2);
  assert.equal(firstDb.sqlite.prepare('SELECT count(*) AS n FROM notification_outbox').get().n, 1);
});

test('outbox and concurrent sender work on workerd D1 without external email', async (t) => {
  const { build } = await import('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
  const bundle = await build({
    stdin: {
      contents: `import { enqueueNotification, processNotifications } from './src/services/notifications.ts';
        globalThis.fetch = async () => new Response('{}', {status: 200});
        export default { async fetch(request, env) {
          if (new URL(request.url).pathname === '/queue') {
            await enqueueNotification(env, {kind:'comment', eventId:'1', commentId:1, postTitle:'Old', postSlug:'old', author:'A', content:'B'});
          } else { await processNotifications(env); }
          return new Response('ok');
        } }`,
      resolveDir: process.cwd(), sourcefile: 'notification-test.ts', loader: 'ts',
    }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'esnext',
  });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { RESEND_API_KEY:'re_test', MAIL_FROM:'blog@example.com', ADMIN_NOTIFY_EMAIL:'owner@example.com', SITE_URL:'https://blog.example.com' }, cf: false, telemetry: { enabled: false } }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  await db.prepare('CREATE TABLE comments (id INTEGER PRIMARY KEY)').run();
  await db.prepare('INSERT INTO comments(id) VALUES (1)').run();
  assert.equal((await mf.dispatchFetch('http://localhost/queue')).status, 200);
  const result = await Promise.all([mf.dispatchFetch('http://localhost/process'), mf.dispatchFetch('http://localhost/process')]);
  assert.deepEqual(result.map((response) => response.status), [200, 200]);
  const job = await db.prepare('SELECT status, attempts FROM notification_outbox').first();
  assert.equal(job.status, 'sent');
  assert.equal(job.attempts, 1);
  await db.prepare('DELETE FROM comments WHERE id = 1').run();
  assert.equal((await db.prepare('SELECT count(*) AS n FROM notification_outbox').first()).n, 0);
});
