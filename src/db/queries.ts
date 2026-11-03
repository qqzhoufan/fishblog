import type { Post, Category, ApiKey, Comment, CommentReply } from "../types.ts";

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

  const postsQuery = `SELECT p.*, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id ${where} ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ? OFFSET ?`;
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
        "SELECT p.*, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id WHERE p.published = 1 AND (p.title LIKE ? OR p.content LIKE ? OR p.excerpt LIKE ?) ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ? OFFSET ?"
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
      "SELECT p.*, c.name as category_name, (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) as comment_count FROM posts p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.is_pinned DESC, p.created_at DESC"
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
  post: Pick<Post, "slug" | "title" | "content" | "excerpt" | "published" | "category_id" | "is_pinned">,
  tagNames?: string[],
): Promise<D1Result> {
  const insert = db
    .prepare(
      "INSERT INTO posts (slug, title, content, excerpt, published, category_id, is_pinned) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(post.slug, post.title, post.content, post.excerpt, post.published, post.category_id, post.is_pinned ?? 0);
  if (tagNames === undefined || (Array.isArray(tagNames) && tagNames.length === 0)) return insert.run();
  // The slug is unique and the batch is transactional. Looking up the inserted
  // row by slug avoids relying on connection-scoped last_insert_rowid().
  const [result] = await db.batch([insert, ...newPostTagStatements(db, post.slug, tagNames)]);
  return result;
}

export async function updatePost(
  db: D1Database,
  id: number,
  post: Partial<Pick<Post, "slug" | "title" | "content" | "excerpt" | "published" | "category_id" | "is_pinned">>,
  tagNames?: string[],
): Promise<D1Result> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (post.slug !== undefined) { fields.push("slug = ?"); values.push(post.slug); }
  if (post.title !== undefined) { fields.push("title = ?"); values.push(post.title); }
  if (post.content !== undefined) { fields.push("content = ?"); values.push(post.content); }
  if (post.excerpt !== undefined) { fields.push("excerpt = ?"); values.push(post.excerpt); }
  if (post.published !== undefined) { fields.push("published = ?"); values.push(post.published); }
  if (post.category_id !== undefined) { fields.push("category_id = ?"); values.push(post.category_id); }
  if (post.is_pinned !== undefined) { fields.push("is_pinned = ?"); values.push(post.is_pinned); }
  fields.push("updated_at = datetime('now')");
  values.push(id);
  const update = db
    .prepare(`UPDATE posts SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values);
  if (tagNames === undefined) return update.run();
  const [result] = await db.batch([update, ...tagSyncStatements(db, id, tagNames)]);
  return result;
}

export async function deletePost(db: D1Database, id: number): Promise<D1Result> {
  const [, result] = await db.batch([
    db.prepare("DELETE FROM comments WHERE post_id = ?").bind(id),
    db.prepare("DELETE FROM posts WHERE id = ?").bind(id),
  ]);
  return result;
}

export async function incrementPostViews(db: D1Database, id: number): Promise<void> {
  await db.prepare("UPDATE posts SET views = views + 1 WHERE id = ?").bind(id).run();
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
  const [, , result] = await db.batch([
    db.prepare("UPDATE posts SET category_id = NULL WHERE category_id = ?").bind(id),
    db.prepare("UPDATE categories SET parent_id = NULL WHERE parent_id = ?").bind(id),
    db.prepare("DELETE FROM categories WHERE id = ?").bind(id),
  ]);
  return result;
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

// ── Tags ──

export type Tag = { id: number; name: string; post_count?: number };

export async function getAllTags(db: D1Database): Promise<Tag[]> {
  const result = await db
    .prepare("SELECT t.*, COUNT(pt.post_id) as post_count FROM tags t LEFT JOIN post_tags pt ON t.id = pt.tag_id GROUP BY t.id ORDER BY t.name")
    .all<Tag>();
  return result.results;
}

export async function getTagsForPost(db: D1Database, postId: number): Promise<Tag[]> {
  const result = await db
    .prepare("SELECT t.* FROM tags t JOIN post_tags pt ON t.id = pt.tag_id WHERE pt.post_id = ?")
    .bind(postId)
    .all<Tag>();
  return result.results;
}

function normalizeTagNames(tagNames: string[]): string[] {
  return [...new Set(tagNames.map((name) => name.trim()).filter(Boolean))];
}

function newPostTagStatements(db: D1Database, slug: string, tagNames: string[]): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  for (const name of normalizeTagNames(tagNames)) {
    statements.push(db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").bind(name));
    statements.push(
      db.prepare("INSERT OR IGNORE INTO post_tags (post_id, tag_id) SELECT p.id, t.id FROM posts p, tags t WHERE p.slug = ? AND t.name = ?")
        .bind(slug, name)
    );
  }
  return statements;
}

function tagSyncStatements(db: D1Database, postId: number, tagNames: string[]): D1PreparedStatement[] {
  const statements = [db.prepare("DELETE FROM post_tags WHERE post_id = ?").bind(postId)];
  for (const name of normalizeTagNames(tagNames)) {
    statements.push(db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").bind(name));
    statements.push(
      db.prepare("INSERT OR IGNORE INTO post_tags (post_id, tag_id) SELECT ?, id FROM tags WHERE name = ?")
        .bind(postId, name)
    );
  }
  return statements;
}

export async function syncPostTags(db: D1Database, postId: number, tagNames: string[]): Promise<void> {
  // D1 executes a batch as a transaction: a failed insert also restores the old associations.
  await db.batch(tagSyncStatements(db, postId, tagNames));
}

export async function getPostsByTag(
  db: D1Database, tagName: string, page = 1, pageSize = 10
): Promise<{ posts: Post[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [posts, countResult] = await Promise.all([
    db.prepare(
      "SELECT p.*, c.name as category_name FROM posts p LEFT JOIN categories c ON p.category_id = c.id JOIN post_tags pt ON p.id = pt.post_id JOIN tags t ON pt.tag_id = t.id WHERE p.published = 1 AND t.name = ? ORDER BY p.is_pinned DESC, p.created_at DESC LIMIT ? OFFSET ?"
    ).bind(tagName, pageSize, offset).all<Post>(),
    db.prepare(
      "SELECT COUNT(*) as count FROM posts p JOIN post_tags pt ON p.id = pt.post_id JOIN tags t ON pt.tag_id = t.id WHERE p.published = 1 AND t.name = ?"
    ).bind(tagName).first<{ count: number }>(),
  ]);
  return { posts: posts.results, total: countResult?.count ?? 0 };
}

// ── Comments ──

export async function getCommentsForPost(db: D1Database, postId: number): Promise<Comment[]> {
  const result = await db
    .prepare("SELECT id, post_id, author, content, created_at FROM comments WHERE post_id = ? ORDER BY created_at ASC, id ASC")
    .bind(postId)
    .all<Comment>();
  return result.results;
}

export async function createComment(
  db: D1Database,
  comment: Pick<Comment, "post_id" | "author" | "content">,
  email?: string,
): Promise<D1Result> {
  const insert = db
    .prepare("INSERT INTO comments (post_id, author, content) VALUES (?, ?, ?)")
    .bind(comment.post_id, comment.author, comment.content);
  if (!email) return insert.run();
  // D1 batch runs sequentially in one transaction, so last_insert_rowid()
  // refers to this insert. A failed contact insert rolls the comment back.
  const [result] = await db.batch([
    insert,
    db.prepare("INSERT INTO comment_contacts (comment_id, email) VALUES (last_insert_rowid(), ?)").bind(email),
  ]);
  return result;
}

export async function getRepliesForPost(db: D1Database, postId: number): Promise<CommentReply[]> {
  const result = await db.prepare(
    "SELECT r.id, r.comment_id, r.content, r.created_at FROM comment_replies r JOIN comments c ON c.id = r.comment_id WHERE c.post_id = ? ORDER BY r.created_at ASC, r.id ASC"
  ).bind(postId).all<CommentReply>();
  return result.results;
}

export async function createCommentReply(db: D1Database, commentId: number, content: string): Promise<D1Result> {
  return db.prepare("INSERT INTO comment_replies (comment_id, content) VALUES (?, ?)").bind(commentId, content).run();
}

// Private: never return this object from a public API or render the address.
export type CommentNotificationInfo = Comment & { post_title: string; post_slug: string; email: string | null };
export async function getCommentNotificationInfo(db: D1Database, commentId: number): Promise<CommentNotificationInfo | null> {
  return db.prepare(`SELECT c.id, c.post_id, c.author, c.content, c.created_at,
    p.title AS post_title, p.slug AS post_slug, cc.email AS email
    FROM comments c JOIN posts p ON p.id = c.post_id
    LEFT JOIN comment_contacts cc ON cc.comment_id = c.id WHERE c.id = ?`)
    .bind(commentId).first<CommentNotificationInfo>();
}

export type CommentWithPost = Comment & { post_title: string; post_slug: string };

export async function getAllComments(db: D1Database): Promise<CommentWithPost[]> {
  const result = await db
    .prepare(
      "SELECT cm.id, cm.post_id, cm.author, cm.content, cm.created_at, p.title as post_title, p.slug as post_slug FROM comments cm LEFT JOIN posts p ON cm.post_id = p.id ORDER BY cm.created_at DESC"
    )
    .all<CommentWithPost>();
  return result.results;
}

export async function deleteComment(db: D1Database, id: number): Promise<D1Result> {
  return db.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
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

export async function setConfigValues(db: D1Database, values: Record<string, string>): Promise<void> {
  const sql = "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?";
  await db.batch(Object.entries(values).map(([key, value]) => db.prepare(sql).bind(key, value, value)));
}

export async function getFavicon(db: D1Database): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM config WHERE key = 'favicon'").first<{ value: string }>();
  return row?.value ?? null;
}
