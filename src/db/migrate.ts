export async function autoMigrate(db: D1Database): Promise<void> {
  // Check all base tables: a previous initialization can fail after creating
  // post_tags but before creating another table.
  const tableCount = await db.prepare(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('posts', 'categories', 'api_keys', 'config', 'tags', 'post_tags', 'comments', 'comment_replies', 'comment_contacts')"
  ).first<{ count: number }>();
  const tablesExist = tableCount?.count === 9;

  if (!tablesExist) {
    const migrations = [
      // Core posts table
      `CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        excerpt TEXT NOT NULL DEFAULT '',
        category_id INTEGER,
        published INTEGER NOT NULL DEFAULT 0,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        views INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug)`,
      `CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published, created_at)`,

      // Categories
      `CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        parent_id INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id)`,

      // API keys
      `CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        key_hash TEXT UNIQUE NOT NULL,
        permissions TEXT NOT NULL DEFAULT 'read',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_used_at TEXT
      )`,

      // Config
      `CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      )`,
      `INSERT OR IGNORE INTO config (key, value) VALUES ('blog_title', 'FishBlog')`,
      `INSERT OR IGNORE INTO config (key, value) VALUES ('blog_description', 'A minimal blog powered by Cloudflare Workers')`,
      `INSERT OR IGNORE INTO config (key, value) VALUES ('blog_footer', 'Powered by FishBlog')`,

      // Tags (many-to-many with posts)
      `CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS post_tags (
        post_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (post_id, tag_id),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )`,

      // Comments
      `CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        author TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id)`,
      // Separate tables preserve the existing comments and public API shape.
      `CREATE TABLE IF NOT EXISTS comment_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_comment_replies_comment ON comment_replies(comment_id)`,
      `CREATE TABLE IF NOT EXISTS comment_contacts (
        comment_id INTEGER PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,
        email TEXT NOT NULL
      )`,
    ];

    for (const sql of migrations) await db.prepare(sql).run();
  }

  // ── Incremental upgrades (always run, idempotent) ──

  async function addColumn(column: string, definition: string): Promise<void> {
    try {
      await db.prepare(`SELECT ${column} FROM posts LIMIT 1`).first();
    } catch {
      try {
        await db.prepare(`ALTER TABLE posts ADD COLUMN ${definition}`).run();
      } catch {
        // Another concurrent request may have added it. Recheck rather than
        // masking a real database error.
        await db.prepare(`SELECT ${column} FROM posts LIMIT 1`).first();
      }
    }
  }

  await addColumn("category_id", "category_id INTEGER");
  await addColumn("is_pinned", "is_pinned INTEGER NOT NULL DEFAULT 0");
  await addColumn("views", "views INTEGER NOT NULL DEFAULT 0");

  if (!tablesExist) {
    // Older databases may not have category_id until the upgrade above.
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category_id)").run();
  }
}
