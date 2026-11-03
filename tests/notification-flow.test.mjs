import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('comment and reply survive a failed provider and queue private notifications', async (t) => {
  const bundle = await build({
    stdin: {
      contents: `import app from './src/index.ts';
        globalThis.fetch = async () => new Response('unavailable', { status: 503 });
        export default app;`,
      resolveDir: process.cwd(), sourcefile: 'notification-flow.ts', loader: 'ts',
    }, bundle: true, write: false, format: 'esm', platform: 'browser', target: 'esnext',
  });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { ADMIN_USERNAME:'admin', ADMIN_PASSWORD:'test-password', RESEND_API_KEY:'re_test', MAIL_FROM:'blog@example.com', ADMIN_NOTIFY_EMAIL:'owner@example.com', SITE_URL:'https://blog.example.com' }, cf:false, telemetry:{ enabled:false } }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const fetch = (path, init) => mf.dispatchFetch('http://localhost' + path, init);
  assert.equal((await fetch('/')).status, 200);
  await db.prepare("INSERT INTO posts (id, slug, title, content, excerpt, published) VALUES (1, 'hello', 'Article', 'Text', '', 1)").run();
  const comment = await fetch('/post/hello/comment', { method:'POST', redirect:'manual', body: new URLSearchParams({ author:'Reader', content:'Hello', email:'reader@example.com', notify:'1', t:'1' }) });
  assert.equal(comment.status, 302);
  const row = await db.prepare('SELECT id FROM comments WHERE author = ?').bind('Reader').first();
  assert.ok(row);
  let jobs = await db.prepare('SELECT kind, recipient, event_key FROM notification_outbox WHERE comment_id = ?').bind(row.id).all();
  assert.ok(jobs.results.some((job) => job.kind === 'comment' && job.recipient === 'owner@example.com'));

  const login = await fetch('/admin/login', { method:'POST', redirect:'manual', body: new URLSearchParams({username:'admin', password:'test-password'}) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const reply = await fetch(`/admin/comments/reply/${row.id}`, { method:'POST', redirect:'manual', headers:{Cookie:cookie}, body:new URLSearchParams({content:'Thank you'}) });
  assert.equal(reply.status, 302);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM comment_replies WHERE comment_id = ?').bind(row.id).first()).n, 1);
  jobs = await db.prepare('SELECT kind, recipient, event_key FROM notification_outbox WHERE comment_id = ?').bind(row.id).all();
  assert.ok(jobs.results.some((job) => job.kind === 'reply' && job.recipient === 'reader@example.com'));
  const page = await fetch('/admin/comments', { headers:{Cookie:cookie} });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /邮件通知/);
  assert.doesNotMatch(html, /reader@example\.com|re_test/);
});
