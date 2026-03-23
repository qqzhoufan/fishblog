import type { Post } from "../types.ts";

export async function getPublishedPosts(
  db: D1Database,
  page = 1,
  pageSize = 10
): Promise<{ posts: Post[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [posts, countResult] = await Promise.all([
    db
      .prepare(
        "SELECT * FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?"
      )
      .bind(pageSize, offset)
      .all<Post>(),
    db
      .prepare("SELECT COUNT(*) as count FROM posts WHERE published = 1")
      .first<{ count: number }>(),
  ]);
  return { posts: posts.results, total: countResult?.count ?? 0 };
}

export async function getAllPosts(db: D1Database): Promise<Post[]> {
  const result = await db
    .prepare("SELECT * FROM posts ORDER BY created_at DESC")
    .all<Post>();
  return result.results;
}

export async function getPostBySlug(
  db: D1Database,
  slug: string
): Promise<Post | null> {
  return db.prepare("SELECT * FROM posts WHERE slug = ?").bind(slug).first<Post>();
}

export async function getPostById(
  db: D1Database,
  id: number
): Promise<Post | null> {
  return db.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first<Post>();
}

export async function createPost(
  db: D1Database,
  post: Pick<Post, "slug" | "title" | "content" | "excerpt" | "published">
): Promise<D1Result> {
  return db
    .prepare(
      "INSERT INTO posts (slug, title, content, excerpt, published) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(post.slug, post.title, post.content, post.excerpt, post.published)
    .run();
}

export async function updatePost(
  db: D1Database,
  id: number,
  post: Partial<Pick<Post, "slug" | "title" | "content" | "excerpt" | "published">>
): Promise<D1Result> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (post.slug !== undefined) { fields.push("slug = ?"); values.push(post.slug); }
  if (post.title !== undefined) { fields.push("title = ?"); values.push(post.title); }
  if (post.content !== undefined) { fields.push("content = ?"); values.push(post.content); }
  if (post.excerpt !== undefined) { fields.push("excerpt = ?"); values.push(post.excerpt); }
  if (post.published !== undefined) { fields.push("published = ?"); values.push(post.published); }
  fields.push("updated_at = datetime('now')");
  values.push(id);
  return db
    .prepare(`UPDATE posts SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
}

export async function deletePost(
  db: D1Database,
  id: number
): Promise<D1Result> {
  return db.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
}

export async function getConfig(
  db: D1Database
): Promise<Record<string, string>> {
  const result = await db.prepare("SELECT key, value FROM config").all<{
    key: string;
    value: string;
  }>();
  const config: Record<string, string> = {};
  for (const row of result.results) {
    config[row.key] = row.value;
  }
  return config;
}
