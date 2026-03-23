import type { Post, Category, ApiKey } from "../types.ts";

// ── Posts ──

export async function getPublishedPosts(
  db: D1Database,
  page = 1,
  pageSize = 10,
  categoryId?: number
): Promise<{ posts: Post[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const where = categoryId
    ? "WHERE p.published = 1 AND p.category_id = ?"
    : "WHERE p.published = 1";
  const binds = categoryId
    ? [pageSize, offset, categoryId]
    : [pageSize, offset];
  const countBinds = categoryId ? [categoryId] : [];

  const postsQuery = `SELECT p.*, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
  const countQuery = `SELECT COUNT(*) as count FROM posts p ${where}`;

  const [posts, countResult] = await Promise.all([
    categoryId
      ? db.prepare(postsQuery).bind(categoryId, pageSize, offset).all<Post>()
      : db.prepare(postsQuery).bind(pageSize, offset).all<Post>(),
    categoryId
      ? db.prepare(countQuery).bind(categoryId).first<{ count: number }>()
      : db.prepare(countQuery).first<{ count: number }>(),
  ]);
  return { posts: posts.results, total: countResult?.count ?? 0 };
}

export async function searchPosts(
  db: D1Database,
  query: string,
  page = 1,
  pageSize = 10
): Promise<{ posts: Post[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const like = `%${query}%`;
  const [posts, countResult] = await Promise.all([
    db
      .prepare(
        "SELECT p.*, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.published = 1 AND (p.title LIKE ? OR p.content LIKE ? OR p.excerpt LIKE ?) ORDER BY p.created_at DESC LIMIT ? OFFSET ?"
      )
      .bind(like, like, like, pageSize, offset)
      .all<Post>(),
    db
      .prepare(
        "SELECT COUNT(*) as count FROM posts WHERE published = 1 AND (title LIKE ? OR content LIKE ? OR excerpt LIKE ?)"
      )
      .bind(like, like, like)
      .first<{ count: number }>(),
  ]);
  return { posts: posts.results, total: countResult?.count ?? 0 };
}

export async function getAllPosts(db: D1Database): Promise<Post[]> {
  const result = await db
    .prepare(
      "SELECT p.*, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC"
    )
    .all<Post>();
  return result.results;
}

export async function getPostBySlug(
  db: D1Database,
  slug: string
): Promise<Post | null> {
  return db
    .prepare(
      "SELECT p.*, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = ?"
    )
    .bind(slug)
    .first<Post>();
}

export async function getPostById(
  db: D1Database,
  id: number
): Promise<Post | null> {
  return db
    .prepare(
      "SELECT p.*, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = ?"
    )
    .bind(id)
    .first<Post>();
}

export async function createPost(
  db: D1Database,
  post: Pick<Post, "slug" | "title" | "content" | "excerpt" | "published" | "category_id">
): Promise<D1Result> {
  return db
    .prepare(
      "INSERT INTO posts (slug, title, content, excerpt, published, category_id) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(post.slug, post.title, post.content, post.excerpt, post.published, post.category_id)
    .run();
}

export async function updatePost(
  db: D1Database,
  id: number,
  post: Partial<Pick<Post, "slug" | "title" | "content" | "excerpt" | "published" | "category_id">>
): Promise<D1Result> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (post.slug !== undefined) { fields.push("slug = ?"); values.push(post.slug); }
  if (post.title !== undefined) { fields.push("title = ?"); values.push(post.title); }
  if (post.content !== undefined) { fields.push("content = ?"); values.push(post.content); }
  if (post.excerpt !== undefined) { fields.push("excerpt = ?"); values.push(post.excerpt); }
  if (post.published !== undefined) { fields.push("published = ?"); values.push(post.published); }
  if (post.category_id !== undefined) { fields.push("category_id = ?"); values.push(post.category_id); }
  fields.push("updated_at = datetime('now')");
  values.push(id);
  return db
    .prepare(`UPDATE posts SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function deletePost(db: D1Database, id: number): Promise<D1Result> {
  return db.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
}

// ── Categories ──

export async function getAllCategories(db: D1Database): Promise<Category[]> {
  const result = await db
    .prepare("SELECT * FROM categories ORDER BY sort_order, name")
    .all<Category>();
  return result.results;
}

export async function getCategoryTree(db: D1Database): Promise<Category[]> {
  const all = await getAllCategories(db);
  const countResult = await db
    .prepare(
      "SELECT category_id, COUNT(*) as count FROM posts WHERE published = 1 AND category_id IS NOT NULL GROUP BY category_id"
    )
    .all<{ category_id: number; count: number }>();

  const countMap: Record<number, number> = {};
  for (const row of countResult.results) {
    countMap[row.category_id] = row.count;
  }

  const roots: Category[] = [];
  const childrenMap: Record<number, Category[]> = {};

  for (const cat of all) {
    cat.post_count = countMap[cat.id] || 0;
    if (cat.parent_id) {
      if (!childrenMap[cat.parent_id]) childrenMap[cat.parent_id] = [];
      childrenMap[cat.parent_id].push(cat);
    } else {
      roots.push(cat);
    }
  }

  for (const root of roots) {
    root.children = childrenMap[root.id] || [];
    root.post_count = (root.post_count || 0) + root.children.reduce((s, c) => s + (c.post_count || 0), 0);
  }

  return roots;
}

export async function createCategory(
  db: D1Database,
  cat: Pick<Category, "name" | "slug" | "parent_id" | "sort_order">
): Promise<D1Result> {
  return db
    .prepare("INSERT INTO categories (name, slug, parent_id, sort_order) VALUES (?, ?, ?, ?)")
    .bind(cat.name, cat.slug, cat.parent_id, cat.sort_order)
    .run();
}

export async function updateCategory(
  db: D1Database,
  id: number,
  cat: Partial<Pick<Category, "name" | "slug" | "parent_id" | "sort_order">>
): Promise<D1Result> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (cat.name !== undefined) { fields.push("name = ?"); values.push(cat.name); }
  if (cat.slug !== undefined) { fields.push("slug = ?"); values.push(cat.slug); }
  if (cat.parent_id !== undefined) { fields.push("parent_id = ?"); values.push(cat.parent_id); }
  if (cat.sort_order !== undefined) { fields.push("sort_order = ?"); values.push(cat.sort_order); }
  values.push(id);
  return db.prepare(`UPDATE categories SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
}

export async function deleteCategory(db: D1Database, id: number): Promise<D1Result> {
  await db.prepare("UPDATE posts SET category_id = NULL WHERE category_id = ?").bind(id).run();
  await db.prepare("UPDATE categories SET parent_id = NULL WHERE parent_id = ?").bind(id).run();
  return db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
}

// ── API Keys ──

export async function getAllApiKeys(db: D1Database): Promise<ApiKey[]> {
  const result = await db.prepare("SELECT * FROM api_keys ORDER BY created_at DESC").all<ApiKey>();
  return result.results;
}

export async function getApiKeyByHash(db: D1Database, keyHash: string): Promise<ApiKey | null> {
  return db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").bind(keyHash).first<ApiKey>();
}

export async function createApiKey(
  db: D1Database,
  apiKey: Pick<ApiKey, "name" | "key_hash" | "permissions">
): Promise<D1Result> {
  return db
    .prepare("INSERT INTO api_keys (name, key_hash, permissions) VALUES (?, ?, ?)")
    .bind(apiKey.name, apiKey.key_hash, apiKey.permissions)
    .run();
}

export async function deleteApiKey(db: D1Database, id: number): Promise<D1Result> {
  return db.prepare("DELETE FROM api_keys WHERE id = ?").bind(id).run();
}

export async function touchApiKey(db: D1Database, id: number): Promise<void> {
  await db.prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").bind(id).run();
}

// ── Config ──

export async function getConfig(db: D1Database): Promise<Record<string, string>> {
  const result = await db.prepare("SELECT key, value FROM config").all<{ key: string; value: string }>();
  const config: Record<string, string> = {};
  for (const row of result.results) {
    config[row.key] = row.value;
  }
  return config;
}

export async function setConfig(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?")
    .bind(key, value, value)
    .run();
}

export async function getFavicon(db: D1Database): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM config WHERE key = 'favicon'").first<{ value: string }>();
  return row?.value ?? null;
}
