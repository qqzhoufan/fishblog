import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

test('legacy comments, private opt-in, admin replies and deletion work on D1', { timeout: 30000 }, async (t) => {
  const bundle = await build({ entryPoints: ['src/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'esnext' });
  const options = { modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'test-password' }, cf: false, telemetry: { enabled: false } };
  const mf = new Miniflare(convertV4MiniflareOptions(options));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const fetch = (path, init) => mf.dispatchFetch('http://localhost' + path, init);

  // A database with the old tables and old comment rows upgrades additively.
  // Even an extra private column on a legacy/custom installation must never
  // appear in the public API's response.
  await db.prepare("CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, author TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), email TEXT) ").run();
  await db.prepare("INSERT INTO comments (id, post_id, author, content, email) VALUES (1, 1, 'old reader', 'old comment', 'legacy-private@example.com')").run();
  assert.equal((await fetch('/')).status, 200);
  await db.prepare("INSERT INTO posts (id, slug, title, content, excerpt, published) VALUES (1, 'old-post', 'Original', 'Text', '', 1)").run();
  const old = await fetch('/post/old-post');
  assert.equal(old.status, 200);
  assert.match(await old.text(), /old comment/);

  const postComment = (params) => fetch('/post/old-post/comment', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ t: '1', ...params }) });
  assert.equal((await postComment({ author: 'no mail', content: 'ordinary comment' })).status, 302);
  assert.equal((await postComment({ author: 'no opt-in', content: 'ignore mail', email: 'ignored@example.com' })).status, 302);
  assert.equal((await postComment({ author: 'opt in', content: 'please reply', email: 'private@example.com', notify: '1' })).status, 302);
  assert.equal((await postComment({ author: 'bad', content: 'bad', email: 'not-an-email', notify: '1' })).status, 400);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM comment_contacts').first()).n, 1);
  const privateComment = await db.prepare("SELECT c.id FROM comments c JOIN comment_contacts cc ON cc.comment_id = c.id WHERE cc.email = 'private@example.com'").first();
  assert.ok(privateComment);
  const concurrent = await Promise.all(Array.from({ length: 6 }, (_, i) => postComment({ author: `reader-${i}`, content: 'concurrent', email: `reader-${i}@example.com`, notify: '1' })));
  assert.ok(concurrent.every((response) => response.status === 302));
  for (let i = 0; i < concurrent.length; i++) {
    const saved = await db.prepare('SELECT c.author FROM comments c JOIN comment_contacts cc ON cc.comment_id = c.id WHERE cc.email = ?').bind(`reader-${i}@example.com`).first();
    assert.equal(saved?.author, `reader-${i}`);
  }
  await db.prepare("CREATE TRIGGER reject_contact BEFORE INSERT ON comment_contacts WHEN NEW.email = 'reject@example.com' BEGIN SELECT RAISE(ABORT, 'rejected'); END").run();
  assert.equal((await postComment({ author: 'rejected', content: 'must roll back', email: 'reject@example.com', notify: '1' })).status, 500);
  assert.equal((await db.prepare("SELECT count(*) AS n FROM comments WHERE author = 'rejected'").first()).n, 0);
  await db.prepare('DROP TRIGGER reject_contact').run();

  // API readers and public HTML must not receive private contact information.
  const key = 'fb_test_read';
  await db.prepare("INSERT INTO api_keys (name, key_hash, permissions) VALUES ('read', ?, 'read')").bind(createHash('sha256').update(key).digest('hex')).run();
  const api = await fetch('/api/posts/old-post/comments', { headers: { Authorization: `Bearer ${key}` } });
  assert.equal(api.status, 200);
  const apiBody = await api.text();
  assert.doesNotMatch(apiBody, /private@example\.com|ignored@example\.com|legacy-private@example\.com|"email"/);
  assert.doesNotMatch(await (await fetch('/post/old-post')).text(), /private@example\.com/);

  const noAuth = await fetch(`/admin/comments/reply/${privateComment.id}`, { method: 'POST', redirect: 'manual', body: new URLSearchParams({ content: 'not authorized' }) });
  assert.equal(noAuth.status, 302);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM comment_replies').first()).n, 0);
  const login = await fetch('/admin/login', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ username: 'admin', password: 'test-password' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const reply = await fetch(`/admin/comments/reply/${privateComment.id}`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie }, body: new URLSearchParams({ content: '<script>bad()</script> hello' }) });
  assert.equal(reply.status, 302);
  const page = await (await fetch('/post/old-post')).text();
  assert.match(page, /博主回复/);
  assert.match(page, /&lt;script&gt;bad\(\)&lt;\/script&gt; hello/);
  assert.doesNotMatch(page, /<script>bad/);
  // Existing comments without email can also receive an admin reply.
  assert.equal((await fetch('/admin/comments/reply/1', { method: 'POST', redirect: 'manual', headers: { Cookie: cookie }, body: new URLSearchParams({ content: 'welcome back' }) })).status, 302);
  assert.match(await (await fetch('/post/old-post')).text(), /welcome back/);

  const adminPage = await (await fetch('/admin', { headers: { Cookie: cookie } })).text();
  assert.match(adminPage, /评论管理/);
  assert.equal((await fetch(`/admin/comments/delete/${privateComment.id}`, { method: 'POST', redirect: 'manual', headers: { Cookie: cookie } })).status, 302);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM comment_contacts WHERE comment_id = ?').bind(privateComment.id).first()).n, 0);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM comment_replies WHERE comment_id = ?').bind(privateComment.id).first()).n, 0);
  assert.equal((await db.prepare('SELECT content FROM comments WHERE id = 1').first()).content, 'old comment');
  assert.equal((await fetch('/admin/delete/1', { method: 'POST', redirect: 'manual', headers: { Cookie: cookie } })).status, 302);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM comments').first()).n, 0);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM comment_contacts').first()).n, 0);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM comment_replies').first()).n, 0);
});
