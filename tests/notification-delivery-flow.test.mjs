import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// An isolated workerd/D1 integration. The global network fetch is replaced in
// the Worker and rejects every URL except the locally mocked Resend endpoint.
async function fixture(t, failFirst = false) {
  const bundle = await build({
    stdin: {
      contents: `import app from './src/index.ts';
        import { enqueueNotification, processNotifications } from './src/services/notifications.ts';
        const calls = [];
        let failNext = ${failFirst ? 'true' : 'false'};
        globalThis.fetch = async (url, init) => {
          if (String(url) !== 'https://api.resend.com/emails') throw new Error('Unexpected outbound request');
          calls.push({url: String(url), body: JSON.parse(init.body), idempotencyKey: init.headers['Idempotency-Key']});
          if (failNext) { failNext = false; return new Response('{}', {status: 503}); }
          return new Response('{"id":"mock-message-id"}', {status: 200});
        };
        export default { async fetch(request, env, ctx) {
          const path = new URL(request.url).pathname;
          if (path === '/__test/calls') return Response.json(calls);
          if (path === '/__test/process') { await processNotifications(env); return new Response('ok'); }
          if (path === '/__test/requeue') {
            await enqueueNotification(env, {kind:'comment', eventId:'1', commentId:1, postTitle:'Article', postSlug:'hello', author:'Subscriber', content:'First comment'});
            return new Response('ok');
          }
          return app.fetch(request, env, ctx);
        } };`,
      resolveDir: process.cwd(), sourcefile: 'notification-delivery-test.ts', loader: 'ts',
    },
    bundle: true, write: false, format: 'esm', platform: 'browser', target: 'esnext',
  });
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'],
    bindings: {
      ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'test-password',
      RESEND_API_KEY: 're_test_key', MAIL_FROM: 'blog@example.com',
      ADMIN_NOTIFY_EMAIL: 'owner@example.com', SITE_URL: 'https://blog.example.com',
    },
    cf: false, telemetry: { enabled: false },
  }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const fetch = (path, init) => mf.dispatchFetch('http://localhost' + path, init);
  assert.equal((await fetch('/')).status, 200);
  await db.prepare("INSERT INTO posts (id, slug, title, content, excerpt, published) VALUES (1, 'hello', 'Article', 'Text', '', 1)").run();
  const calls = async () => (await fetch('/__test/calls')).json();
  const waitFor = async (fn) => {
    for (let i = 0; i < 200; i++) {
      const value = await fn();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail('Timed out waiting for isolated Worker notification');
  };
  const comment = (body) => fetch('/post/hello/comment', {
    method: 'POST', redirect: 'manual', body: new URLSearchParams({ t: '1', ...body }),
  });
  const login = async () => {
    const response = await fetch('/admin/login', { method: 'POST', redirect: 'manual', body: new URLSearchParams({username:'admin', password:'test-password'}) });
    assert.equal(response.status, 302);
    return response.headers.get('set-cookie').split(';')[0];
  };
  const reply = (commentId, cookie, content) => fetch(`/admin/comments/reply/${commentId}`, {
    method: 'POST', redirect: 'manual', headers: { Cookie: cookie }, body: new URLSearchParams({ content }),
  });
  return { db, fetch, calls, waitFor, comment, login, reply };
}

test('real Worker routes send administrator and opted-in reply emails only', async (t) => {
  const { db, calls, waitFor, comment, login, reply } = await fixture(t);
  assert.equal((await comment({ author:'Subscriber', content:'First comment', email:'reader@example.com', notify:'1' })).status, 302);
  await waitFor(async () => (await db.prepare("SELECT status FROM notification_outbox WHERE event_key = 'comment/1'").first())?.status === 'sent');
  let sent = await calls();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].body.to, ['owner@example.com']);
  assert.match(sent[0].body.text, /First comment/);
  assert.match(sent[0].body.text, /https:\/\/blog\.example\.com\/post\/hello#comment-1/);
  assert.equal(sent[0].body.from, 'blog@example.com');

  // Supplying an address without ticking the notification checkbox is not consent.
  assert.equal((await comment({ author:'Anonymous', content:'No mail to me', email:'no-consent@example.com' })).status, 302);
  await waitFor(async () => (await db.prepare("SELECT status FROM notification_outbox WHERE event_key = 'comment/2'").first())?.status === 'sent');
  const cookie = await login();
  assert.equal((await reply(2, cookie, 'Reply without subscription')).status, 302);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM notification_outbox WHERE kind = 'reply' AND comment_id = 2").first()).n, 0);
  assert.equal((await calls()).length, 2);

  assert.equal((await reply(1, cookie, 'Reply to subscriber')).status, 302);
  await waitFor(async () => (await db.prepare("SELECT status FROM notification_outbox WHERE kind = 'reply' AND comment_id = 1").first())?.status === 'sent');
  sent = await calls();
  assert.equal(sent.length, 3);
  assert.deepEqual(sent[2].body.to, ['reader@example.com']);
  assert.match(sent[2].body.text, /Reply to subscriber/);
  assert.ok(sent.every((call) => call.url === 'https://api.resend.com/emails'));
  assert.ok(sent.every((call) => call.body.html === undefined));
  assert.notEqual(sent[0].idempotencyKey, sent[2].idempotencyKey);
});

test('same event is not duplicated; transient delivery failure observes retry delay and reuses key', async (t) => {
  const { db, fetch, calls, waitFor, comment } = await fixture(t, true);
  assert.equal((await comment({ author:'Subscriber', content:'First comment' })).status, 302);
  await waitFor(async () => {
    const row = await db.prepare("SELECT status, attempts FROM notification_outbox WHERE event_key = 'comment/1'").first();
    return row?.status === 'pending' && row.attempts === 1;
  });
  let sent = await calls();
  assert.equal(sent.length, 1);
  assert.ok((await db.prepare("SELECT next_attempt_at FROM notification_outbox WHERE event_key = 'comment/1'").first()).next_attempt_at > Date.now()/1000);
  assert.equal((await fetch('/__test/requeue')).status, 200);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM notification_outbox WHERE event_key = 'comment/1'").first()).n, 1);
  assert.equal((await fetch('/__test/process')).status, 200);
  assert.equal((await calls()).length, 1);
  await db.prepare("UPDATE notification_outbox SET next_attempt_at = 0 WHERE event_key = 'comment/1'").run();
  assert.equal((await fetch('/__test/process')).status, 200);
  assert.equal((await db.prepare("SELECT status FROM notification_outbox WHERE event_key = 'comment/1'").first()).status, 'sent');
  sent = await calls();
  assert.equal(sent.length, 2);
  assert.equal(sent[0].idempotencyKey, sent[1].idempotencyKey);
  assert.deepEqual(sent[0].body, sent[1].body);
});
