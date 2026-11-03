import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import * as miniflare from 'miniflare';

// Executes the repository's actual query functions inside workerd using an
// ephemeral local D1, rather than using a mock SQLite adapter.
test('workerd D1 creates posts and tags atomically, including concurrent requests', { timeout: 30000 }, async () => {
  const bundle = await build({
    stdin: {
      contents: `import { createPost, deletePost, deleteCategory } from './src/db/queries.ts';
        export default { async fetch(request, env) {
          try {
            const body = await request.json();
            if (body.action === 'deletePost') return Response.json(await deletePost(env.DB, body.id));
            if (body.action === 'deleteCategory') return Response.json(await deleteCategory(env.DB, body.id));
            const result = await createPost(env.DB, {
              slug: body.slug, title: body.slug, content: '', excerpt: '',
              category_id: null, is_pinned: 0, published: 1
            }, body.tags);
            return Response.json(result);
          } catch (error) { return new Response(String(error), { status: 500 }); }
        } }`,
      resolveDir: process.cwd(),
      sourcefile: 'test-d1-worker.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  });
  const options = { modules: true, script: bundle.outputFiles[0].text, d1Databases: ['DB'] };
  const mf = new miniflare.Miniflare(miniflare.convertV4MiniflareOptions ? miniflare.convertV4MiniflareOptions(options) : options);
  try {
    const db = await mf.getD1Database('DB');
    await db.batch([
      db.prepare(`CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
        content TEXT NOT NULL, excerpt TEXT NOT NULL, category_id INTEGER, published INTEGER NOT NULL, is_pinned INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`),
      db.prepare('CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)'),
      db.prepare('CREATE TABLE post_tags (post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(post_id, tag_id))'),
      db.prepare('CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES posts(id), author TEXT NOT NULL, content TEXT NOT NULL)'),
      db.prepare('CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id INTEGER REFERENCES categories(id), name TEXT NOT NULL)'),
    ]);
    const invoke = (body) => mf.dispatchFetch('http://example.com/', { method: 'POST', body: JSON.stringify(body) });
    const first = await invoke({ slug: 'first', tags: ['one', 'shared'] });
    assert.equal(first.status, 200);
    const result = await first.json();
    assert.equal(result.success, true);
    const saved = await db.prepare('SELECT id FROM posts WHERE slug = ?').bind('first').first();
    assert.equal(result.meta.last_row_id, saved.id);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM post_tags WHERE post_id = ?').bind(saved.id).first()).n, 2);

    const concurrent = await Promise.all(Array.from({ length: 8 }, (_, i) => invoke({ slug: `concurrent-${i}`, tags: [`tag-${i}`, 'shared'] })));
    assert.ok(concurrent.every(response => response.status === 200));
    for (let i = 0; i < concurrent.length; i++) {
      const { meta } = await concurrent[i].json();
      const row = await db.prepare('SELECT id FROM posts WHERE slug = ?').bind(`concurrent-${i}`).first();
      assert.equal(meta.last_row_id, row.id);
      const tags = await db.prepare('SELECT t.name FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id = ? ORDER BY t.name').bind(row.id).all();
      assert.deepEqual(tags.results.map(t => t.name), ['shared', `tag-${i}`]);
    }

    await db.prepare(`CREATE TRIGGER reject_bad_tag BEFORE INSERT ON post_tags
      WHEN (SELECT name FROM tags WHERE id = NEW.tag_id) = 'bad'
      BEGIN SELECT RAISE(ABORT, 'rejected'); END`).run();
    assert.equal((await invoke({ slug: 'failed', tags: ['temporary', 'bad'] })).status, 500);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM posts WHERE slug = 'failed'").first()).n, 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM tags WHERE name IN ('temporary', 'bad')").first()).n, 0);
    await db.prepare('DROP TRIGGER reject_bad_tag').run();

    await db.prepare("INSERT INTO comments (post_id, author, content) VALUES (?, 'reader', 'keep')").bind(saved.id).run();
    await db.prepare("CREATE TRIGGER reject_post_delete BEFORE DELETE ON posts BEGIN SELECT RAISE(ABORT, 'rejected'); END").run();
    assert.equal((await invoke({ action: 'deletePost', id: saved.id })).status, 500);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM comments WHERE post_id = ?').bind(saved.id).first()).n, 1);
    await db.prepare('DROP TRIGGER reject_post_delete').run();
    assert.equal((await invoke({ action: 'deletePost', id: saved.id })).status, 200);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM comments WHERE post_id = ?').bind(saved.id).first()).n, 0);

    await db.batch([
      db.prepare("INSERT INTO categories (id, name) VALUES (10, 'parent')"),
      db.prepare("INSERT INTO categories (id, parent_id, name) VALUES (11, 10, 'child')"),
      db.prepare("UPDATE posts SET category_id = 10 WHERE slug = 'concurrent-0'"),
      db.prepare("CREATE TRIGGER reject_category_delete BEFORE DELETE ON categories BEGIN SELECT RAISE(ABORT, 'rejected'); END"),
    ]);
    assert.equal((await invoke({ action: 'deleteCategory', id: 10 })).status, 500);
    assert.equal((await db.prepare("SELECT category_id FROM posts WHERE slug = 'concurrent-0'").first()).category_id, 10);
    assert.equal((await db.prepare('SELECT parent_id FROM categories WHERE id = 11').first()).parent_id, 10);
    await db.prepare('DROP TRIGGER reject_category_delete').run();
    assert.equal((await invoke({ action: 'deleteCategory', id: 10 })).status, 200);
    assert.equal((await db.prepare("SELECT category_id FROM posts WHERE slug = 'concurrent-0'").first()).category_id, null);
    assert.equal((await db.prepare('SELECT parent_id FROM categories WHERE id = 11').first()).parent_id, null);
  } finally {
    await mf.dispose();
  }
});
