export async function autoMigrate(db: D1Database): Promise<void> {
  // Check if migration is needed by testing the newest table
  try {
    await db.prepare("SELECT 1 FROM post_tags LIMIT 1").first();
    return; // all tables exist, skip
  } catch {
    // need migration
  }

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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug)`,
    `CREATE INDEX IF NOT EXISTS idx_posts_published ON posts(published, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category_id)`,

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
  ];

  for (const sql of migrations) {
    try {
      await db.prepare(sql).run();
    } catch {
      // ignore errors for idempotent statements (e.g. column already exists)
    }
  }

  // Add category_id column to posts if missing (upgrade from old schema)
  try {
    await db.prepare("SELECT category_id FROM posts LIMIT 1").first();
  } catch {
    try {
      await db.prepare("ALTER TABLE posts ADD COLUMN category_id INTEGER").run();
    } catch {
      // column might already exist
    }
  }
}
