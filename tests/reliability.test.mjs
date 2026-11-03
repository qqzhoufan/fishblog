import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { autoMigrate } from '../src/db/migrate.ts';
import { syncPostTags, getTagsForPost, getConfig, setConfigValues } from '../src/db/queries.ts';
import blog from '../src/routes/blog.ts';

// Isolated SQLite D1 adapter: each batch is one transaction, as in D1.
function temporaryDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const db = {
    prepare(sql) {
      function statement(args) {
        return {
          bind: (...params) => statement(params),
          async run() {
            const result = sqlite.prepare(sql).run(...args);
            return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
          },
          async first() { return sqlite.prepare(sql).get(...args) ?? null; },
          async all() { return { results: sqlite.prepare(sql).all(...args) }; },
        };
      }
      return statement([]);
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { db, sqlite };
}

async function fixture() {
  const ctx = temporaryDatabase();
  await autoMigrate(ctx.db);
  ctx.sqlite.exec("INSERT INTO posts (id, slug, title, content, published) VALUES (1, 'hello', 'hello', 'body', 1)");
  return ctx;
}

test('tag updates retain names, remove duplicates, clear tags and roll back on failure', async () => {
  const { db, sqlite } = await fixture();
  try {
    await syncPostTags(db, 1, [' old ', '旧', 'old', '']);
    assert.deepEqual((await getTagsForPost(db, 1)).map(t => t.name).sort(), ['old', '旧'].sort());
    sqlite.exec(`CREATE TRIGGER reject_bad_tag BEFORE INSERT ON post_tags
      WHEN (SELECT name FROM tags WHERE id = NEW.tag_id) = 'bad'
      BEGIN SELECT RAISE(ABORT, 'rejected'); END`);
    await assert.rejects(syncPostTags(db, 1, ['new', 'bad']), /rejected/);
    assert.deepEqual((await getTagsForPost(db, 1)).map(t => t.name).sort(), ['old', '旧'].sort());
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM tags WHERE name IN ('new', 'bad')").get().n, 0);
    await syncPostTags(db, 1, []);
    assert.deepEqual(await getTagsForPost(db, 1), []);
  } finally { sqlite.close(); }
});

test('settings are updated together and a failed write leaves all prior values intact', async () => {
  const { db, sqlite } = await fixture();
  try {
    await setConfigValues(db, { blog_title: 'Before', blog_footer: 'Before footer' });
    sqlite.exec(`CREATE TRIGGER reject_bad_config BEFORE UPDATE ON config
      WHEN NEW.key = 'blog_footer' AND NEW.value = 'bad'
      BEGIN SELECT RAISE(ABORT, 'rejected'); END`);
    await assert.rejects(setConfigValues(db, { blog_title: 'After', blog_footer: 'bad' }), /rejected/);
    const config = await getConfig(db);
    assert.equal(config.blog_title, 'Before');
    assert.equal(config.blog_footer, 'Before footer');
  } finally { sqlite.close(); }
});

test('tag pages correctly handle percent signs and non-ASCII names', async () => {
  const { db, sqlite } = await fixture();
  try {
    await syncPostTags(db, 1, ['100%', '中文']);
    for (const name of ['100%', '中文']) {
      const response = await blog.request(`https://example.com/tag/${encodeURIComponent(name)}`, {}, { DB: db });
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes(name));
      assert.ok(html.includes('hello'));
    }
  } finally { sqlite.close(); }
});

test('settings save a large valid favicon without losing data and reject oversized files atomically', async () => {
  const { default: admin } = await import('../src/routes/admin.ts');
  const { db, sqlite } = await fixture();
  const env = { DB: db, ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'correct horse battery staple' };
  try {
    const login = await admin.request('https://example.com/login', {
      method: 'POST',
      body: new URLSearchParams({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }),
    }, env);
    assert.equal(login.status, 302);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const original = new Uint8Array(180_000).map((_, i) => i % 256);
    const form = new FormData();
    form.set('blog_title', 'Updated title');
    form.set('blog_description', 'Updated description');
    form.set('blog_footer', '<a href="https://example.com">Link</a>');
    form.set('comments_enabled', '1');
    form.set('favicon', new File([original], 'icon.png', { type: 'image/png' }));
    const saved = await admin.request('https://example.com/settings', { method: 'POST', headers: { cookie }, body: form }, env);
    assert.equal(saved.status, 302);
    const before = await getConfig(db);
    assert.equal(before.blog_title, 'Updated title');
    assert.equal(before.blog_footer, '<a href="https://example.com">Link</a>');
    assert.deepEqual(Buffer.from(before.favicon.split(',')[1], 'base64'), Buffer.from(original));

    const oversized = new FormData();
    oversized.set('blog_title', 'Must not be saved');
    oversized.set('favicon', new File([new Uint8Array(1_400_001)], 'big.png', { type: 'image/png' }));
    const rejected = await admin.request('https://example.com/settings', { method: 'POST', headers: { cookie }, body: oversized }, env);
    assert.equal(rejected.status, 400);
    assert.match(await rejected.text(), /其他设置尚未保存/);
    assert.deepEqual(await getConfig(db), before);
  } finally { sqlite.close(); }
});

test('admin and API edits save post fields and tags together, rolling back both on failure', async () => {
  const { default: admin } = await import('../src/routes/admin.ts');
  const { default: api } = await import('../src/routes/api.ts');
  const { sha256 } = await import('../src/middleware/auth.ts');
  const { db, sqlite } = await fixture();
  const env = { DB: db, ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'correct horse battery staple' };
  try {
    await syncPostTags(db, 1, ['original']);
    const login = await admin.request('https://example.com/login', {
      method: 'POST', body: new URLSearchParams({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }),
    }, env);
    assert.equal(login.status, 302);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    sqlite.prepare('INSERT INTO api_keys (name, key_hash, permissions) VALUES (?, ?, ?)')
      .run('test key', await sha256('test-token'), 'update');
    sqlite.exec(`CREATE TRIGGER reject_bad_post_tag BEFORE INSERT ON post_tags
      WHEN (SELECT name FROM tags WHERE id = NEW.tag_id) = 'bad'
      BEGIN SELECT RAISE(ABORT, 'rejected'); END`);

    const edit = (title, tags) => new URLSearchParams({ title, slug: 'hello', content: 'body', published: '1', tags });
    const sendAdmin = (title, tags) => admin.request('https://example.com/edit/1', {
      method: 'POST', headers: { cookie }, body: edit(title, tags),
    }, env);
    const sendApi = (body) => api.request('https://example.com/posts/1', {
      method: 'PUT', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify(body),
    }, env);
    const state = async () => ({
      title: sqlite.prepare('SELECT title FROM posts WHERE id = 1').get().title,
      tags: (await getTagsForPost(db, 1)).map(t => t.name).sort(),
    });

    assert.equal((await sendAdmin('Admin edited', 'admin tag')).status, 302);
    assert.deepEqual(await state(), { title: 'Admin edited', tags: ['admin tag'] });
    assert.equal((await sendApi({ title: 'API edited' })).status, 200);
    assert.deepEqual(await state(), { title: 'API edited', tags: ['admin tag'] });
    assert.equal((await sendApi({ title: 'Both edited', tags: ['api tag'] })).status, 200);
    assert.deepEqual(await state(), { title: 'Both edited', tags: ['api tag'] });

    // Hono reports unhandled database errors; suppress expected output for these two failure cases.
    const originalError = console.error;
    try {
      console.error = () => {};
      assert.equal((await sendAdmin('Must roll back admin', 'first,bad')).status, 500);
      assert.deepEqual(await state(), { title: 'Both edited', tags: ['api tag'] });
      assert.equal((await sendApi({ title: 'Must roll back API', tags: ['first', 'bad'] })).status, 500);
      assert.deepEqual(await state(), { title: 'Both edited', tags: ['api tag'] });
    } finally { console.error = originalError; }
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM tags WHERE name IN ('first', 'bad')").get().n, 0);
    assert.equal((await sendApi({ tags: [] })).status, 200);
    assert.deepEqual(await state(), { title: 'Both edited', tags: [] });
  } finally { sqlite.close(); }
});

test('admin and API creation save posts and tags atomically, retaining their publishing defaults', async () => {
  const { default: admin } = await import('../src/routes/admin.ts');
  const { default: api } = await import('../src/routes/api.ts');
  const { sha256 } = await import('../src/middleware/auth.ts');
  const { db, sqlite } = await fixture();
  const env = { DB: db, ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'correct horse battery staple' };
  try {
    const login = await admin.request('https://example.com/login', {
      method: 'POST', body: new URLSearchParams({ username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD }),
    }, env);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    sqlite.prepare('INSERT INTO api_keys (name, key_hash, permissions) VALUES (?, ?, ?)')
      .run('test key', await sha256('test-token'), 'create');
    const sendAdmin = (slug, tags) => admin.request('https://example.com/new', {
      method: 'POST', headers: { cookie }, body: new URLSearchParams({ title: 'Admin post', slug, content: 'text', tags }),
    }, env);
    const sendApi = (body) => api.request('https://example.com/posts', {
      method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' }, body: JSON.stringify(body),
    }, env);
    const post = (slug) => sqlite.prepare('SELECT id, title, published FROM posts WHERE slug = ?').get(slug);
    assert.equal((await sendAdmin('new-admin', 'common, 管理')).status, 302);
    const adminPost = post('new-admin');
    assert.equal(adminPost.published, 0);
    assert.deepEqual((await getTagsForPost(db, adminPost.id)).map(t => t.name).sort(), ['common', '管理'].sort());
    const apiResponse = await sendApi({ title: 'API post', slug: 'new-api', content: 'text', tags: ['common', 'api'] });
    assert.equal(apiResponse.status, 201);
    const apiData = await apiResponse.json();
    assert.equal(apiData.success, true);
    assert.equal(apiData.post.slug, 'new-api');
    assert.equal(apiData.post.published, 1);
    assert.deepEqual(apiData.tags, ['common', 'api']);
    assert.deepEqual((await getTagsForPost(db, apiData.post.id)).map(t => t.name).sort(), ['api', 'common']);
    assert.equal((await sendApi({ title: 'Draft', slug: 'draft', published: 0 })).status, 201);
    assert.equal(post('draft').published, 0);

    sqlite.exec(`CREATE TRIGGER reject_bad_new_tag BEFORE INSERT ON post_tags
      WHEN (SELECT name FROM tags WHERE id = NEW.tag_id) = 'bad'
      BEGIN SELECT RAISE(ABORT, 'rejected'); END`);
    const originalError = console.error;
    try {
      console.error = () => {};
      assert.equal((await sendAdmin('fail-admin', 'temporary,bad')).status, 500);
      assert.equal((await sendApi({ title: 'Fail', slug: 'fail-api', tags: ['temporary', 'bad'] })).status, 500);
      assert.equal((await sendApi({ title: 'Duplicate', slug: 'new-api', tags: ['another'] })).status, 500);
    } finally { console.error = originalError; }
    assert.equal(post('fail-admin'), undefined);
    assert.equal(post('fail-api'), undefined);
    assert.equal(post('new-api').title, 'API post');
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM tags WHERE name IN ('temporary', 'bad', 'another')").get().n, 0);
  } finally { sqlite.close(); }
});

test('parent and child category counts match direct category filters', async () => {
  const { getCategoryTree, getPublishedPosts } = await import('../src/db/queries.ts');
  const { db, sqlite } = await fixture();
  try {
    sqlite.exec(`INSERT INTO categories (id, name, slug) VALUES (1, 'parent', 'parent');
      INSERT INTO categories (id, name, slug, parent_id) VALUES (2, 'child', 'child', 1);
      UPDATE posts SET category_id = 1 WHERE id = 1;
      INSERT INTO posts (slug, title, content, published, category_id) VALUES ('child-post', 'child post', '', 1, 2);
      INSERT INTO posts (slug, title, content, published, category_id) VALUES ('draft-post', 'draft post', '', 0, 1)`);
    const categories = await getCategoryTree(db);
    assert.equal(categories[0].post_count, 1);
    assert.equal(categories[0].children[0].post_count, 1);
    assert.equal((await getPublishedPosts(db, 1, 10, 1)).total, categories[0].post_count);
    assert.equal((await getPublishedPosts(db, 1, 10, 2)).total, categories[0].children[0].post_count);
  } finally { sqlite.close(); }
});

test('deleting a post and its comments is atomic if the post delete fails', async () => {
  const { deletePost } = await import('../src/db/queries.ts');
  const { db, sqlite } = await fixture();
  try {
    sqlite.exec("INSERT INTO comments (post_id, author, content) VALUES (1, 'reader', 'keep me')");
    sqlite.exec("CREATE TRIGGER reject_post_delete BEFORE DELETE ON posts BEGIN SELECT RAISE(ABORT, 'rejected'); END");
    await assert.rejects(deletePost(db, 1), /rejected/);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE id = 1').get().n, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM comments WHERE post_id = 1').get().n, 1);
    sqlite.exec('DROP TRIGGER reject_post_delete');
    const result = await deletePost(db, 1);
    assert.equal(result.meta.changes, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM posts WHERE id = 1').get().n, 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM comments WHERE post_id = 1').get().n, 0);
  } finally { sqlite.close(); }
});

test('deleting a category preserves posts and children if deletion fails', async () => {
  const { deleteCategory } = await import('../src/db/queries.ts');
  const { db, sqlite } = await fixture();
  try {
    sqlite.exec(`INSERT INTO categories (id, name, slug) VALUES (1, 'parent', 'parent');
      INSERT INTO categories (id, name, slug, parent_id) VALUES (2, 'child', 'child', 1);
      UPDATE posts SET category_id = 1 WHERE id = 1;
      CREATE TRIGGER reject_category_delete BEFORE DELETE ON categories BEGIN SELECT RAISE(ABORT, 'rejected'); END`);
    await assert.rejects(deleteCategory(db, 1), /rejected/);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM categories WHERE id = 1').get().n, 1);
    assert.equal(sqlite.prepare('SELECT category_id FROM posts WHERE id = 1').get().category_id, 1);
    assert.equal(sqlite.prepare('SELECT parent_id FROM categories WHERE id = 2').get().parent_id, 1);
    sqlite.exec('DROP TRIGGER reject_category_delete');
    const result = await deleteCategory(db, 1);
    assert.equal(result.meta.changes, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM categories WHERE id = 1').get().n, 0);
    assert.equal(sqlite.prepare('SELECT category_id FROM posts WHERE id = 1').get().category_id, null);
    assert.equal(sqlite.prepare('SELECT parent_id FROM categories WHERE id = 2').get().parent_id, null);
  } finally { sqlite.close(); }
});
