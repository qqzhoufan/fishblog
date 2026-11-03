import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createHash } from 'node:crypto';

// Each run uses Miniflare's ephemeral, isolated D1 database. It never uses .wrangler
// state or the production database.
test('existing blog content and administrative workflows', async (t) => {
  const bundle = await build({ entryPoints: ['src/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'esnext' });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'local-test-password' }, cf: false, telemetry: { enabled: false } }));
  t.after(() => mf.dispose());
  const fetch = (path, init) => mf.dispatchFetch('http://localhost' + path, init);
  const db = await mf.getD1Database('DB');

  const initial = await fetch('/');
  assert.equal(initial.status, 200);
  await db.prepare("INSERT INTO categories (id, name, slug) VALUES (1, '分类', 'category')").run();
  await db.prepare("INSERT INTO posts (id, slug, title, content, excerpt, published, category_id) VALUES (1, 'hello', '旧文章', '正文 **加粗** [链接](https://example.com)', '摘要', 1, 1)").run();
  await db.prepare("INSERT INTO tags (id, name) VALUES (1, '100%')").run();
  await db.prepare('INSERT INTO post_tags (post_id, tag_id) VALUES (1, 1)').run();
  await db.prepare("INSERT INTO comments (post_id, author, content) VALUES (1, '访客', '旧评论')").run();
  await db.prepare("UPDATE config SET value = ? WHERE key = 'blog_footer'").bind('页脚 <a href="https://example.com">链接</a>').run();

  const page = await fetch('/post/hello');
  assert.equal(page.status, 200);
  const html = await page.text();
  for (const text of ['旧文章', '加粗', '旧评论', 'https://example.com']) assert.ok(html.includes(text), text);
  assert.equal((await fetch('/?cat=1')).status, 200);
  assert.equal((await fetch('/search?q=%E6%97%A7%E6%96%87%E7%AB%A0')).status, 200);
  assert.equal((await fetch('/feed.xml')).status, 200);
  assert.equal((await fetch('/sitemap.xml')).status, 200);
  const tagPage = await fetch('/tag/100%25');
  assert.equal(tagPage.status, 200);
  assert.match(await tagPage.text(), /旧文章/);

  const key = 'fb_local_test_key';
  const hash = createHash('sha256').update(key).digest('hex');
  await db.prepare("INSERT INTO api_keys (name, key_hash, permissions) VALUES (?, ?, ?)").bind('existing key', hash, 'read,create,update,delete').run();
  const api = await fetch('/api/posts/hello', { headers: { Authorization: `Bearer ${key}` } });
  assert.equal(api.status, 200);
  assert.equal((await api.json()).title, '旧文章');
  const created = await fetch('/api/posts', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'API 新文章', slug: 'api-created', content: '正文', tags: ['新标签'] }),
  });
  assert.equal(created.status, 201);
  const newPost = await created.json();
  assert.equal(newPost.post.published, 1);
  assert.equal((await db.prepare('SELECT count(*) AS count FROM post_tags WHERE post_id = ?').bind(newPost.post.id).first()).count, 1);
  const updated = await fetch(`/api/posts/${newPost.post.id}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'API 已更新', tags: ['更新标签'] }),
  });
  assert.equal(updated.status, 200);
  const apiUpdated = await fetch('/api/posts/api-created', { headers: { Authorization: `Bearer ${key}` } });
  assert.deepEqual((await apiUpdated.json()).tags, ['更新标签']);

  const comment = await fetch('/post/hello/comment', {
    method: 'POST', redirect: 'manual',
    headers: { 'CF-Connecting-IP': '192.0.2.8' },
    body: new URLSearchParams({ author: '新访客', content: '新评论', t: '1' }),
  });
  assert.equal(comment.status, 302);
  assert.equal((await db.prepare("SELECT count(*) AS count FROM comments WHERE author = '新访客'").first()).count, 1);

  const login = await fetch('/admin/login', { method: 'POST', body: new URLSearchParams({ username: 'admin', password: 'local-test-password' }), redirect: 'manual' });
  assert.equal(login.status, 302);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const admin = await fetch('/admin', { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal(admin.status, 200);
  assert.ok((await admin.text()).includes('旧文章'));
  await fetch('/admin/logout', { headers: { Cookie: cookie }, redirect: 'manual' });
  assert.equal((await fetch('/admin', { headers: { Cookie: cookie }, redirect: 'manual' })).status, 302);

  // D1 UPSERT ... RETURNING and limit enforcement in the actual Worker runtime.
  for (let i = 0; i < 31; i++) {
    const response = await fetch('/admin/login', {
      method: 'POST', redirect: 'manual', headers: { 'CF-Connecting-IP': '192.0.2.9' },
      body: new URLSearchParams({ username: 'admin', password: 'wrong' }),
    });
    assert.equal(response.status, i < 30 ? 401 : 429);
  }
});

test('repairs an incomplete older schema without changing existing records', async (t) => {
  const bundle = await build({ entryPoints: ['src/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'esnext' });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2024-12-01', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], bindings: { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'local-test-password' }, cf: false, telemetry: { enabled: false } }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  // Simulate an older posts schema and an interrupted initialization that
  // created post_tags before creating all of the other tables.
  await db.prepare("CREATE TABLE posts (id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', excerpt TEXT NOT NULL DEFAULT '', published INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
  await db.prepare('CREATE TABLE post_tags (post_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY(post_id, tag_id))').run();
  await db.prepare("INSERT INTO posts (id, slug, title, content, published) VALUES (42, 'legacy', '保留的旧文章', '原始正文', 1)").run();

  const response = await mf.dispatchFetch('http://localhost/post/legacy');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /保留的旧文章/);
  const post = await db.prepare('SELECT * FROM posts WHERE id = 42').first();
  assert.equal(post.content, '原始正文');
  assert.equal(post.published, 1);
  assert.equal(post.category_id, null);
  assert.equal(post.is_pinned, 0);
  assert.equal((await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('posts', 'categories', 'api_keys', 'config', 'tags', 'post_tags', 'comments')").first()).count, 7);
});
