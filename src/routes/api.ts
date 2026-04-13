import { Hono } from "hono";
import type { Env } from "../types.ts";
import { sha256 } from "../middleware/auth.ts";
import {
  getPublishedPosts, getAllPosts, getPostBySlug, getPostById,
  createPost, updatePost, deletePost,
  getCategoryTree, getAllCategories, createCategory, updateCategory, deleteCategory,
  getApiKeyByHash, touchApiKey,
  getTagsForPost, syncPostTags,
} from "../db/queries.ts";

const api = new Hono<{ Bindings: Env }>();

type ApiKeyInfo = { id: number; permissions: string };

async function authenticateApiKey(
  db: D1Database,
  authHeader: string | undefined
): Promise<ApiKeyInfo | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const rawKey = authHeader.slice(7);
  const keyHash = await sha256(rawKey);
  const apiKey = await getApiKeyByHash(db, keyHash);
  if (!apiKey) return null;
  await touchApiKey(db, apiKey.id);
  return { id: apiKey.id, permissions: apiKey.permissions };
}

function hasPermission(key: ApiKeyInfo, perm: string): boolean {
  return key.permissions.split(",").map((p) => p.trim()).includes(perm);
}

function err(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

api.use("/*", async (c, next) => {
  const key = await authenticateApiKey(c.env.DB, c.req.header("authorization"));
  if (!key) return err("Invalid or missing API key", 401);
  c.set("apiKey" as never, key);
  await next();
});

api.get("/posts", async (c) => {
  const key = c.get("apiKey" as never) as ApiKeyInfo;
  if (!hasPermission(key, "read")) return err("No read permission", 403);

  const page = parseInt(c.req.query("page") || "1");
  const all = c.req.query("all") === "true";
  const catId = c.req.query("category_id") ? parseInt(c.req.query("category_id")!) : undefined;

  if (all) {
    const posts = await getAllPosts(c.env.DB);
    return c.json({ posts, total: posts.length });
  }

  const result = await getPublishedPosts(c.env.DB, page, 20, catId);
  return c.json(result);
});

api.get("/posts/:slug", async (c) => {
  const key = c.get("apiKey" as never) as ApiKeyInfo;
  if (!hasPermission(key, "read")) return err("No read permission", 403);

  const post = await getPostBySlug(c.env.DB, c.req.param("slug"));
  if (!post) return err("Post not found", 404);
  const tags = await getTagsForPost(c.env.DB, post.id);
  return c.json({ ...post, tags: tags.map((t) => t.name) });
});

api.post("/posts", async (c) => {
  const key = c.get("apiKey" as never) as ApiKeyInfo;
  if (!hasPermission(key, "create")) return err("No create permission", 403);

  const body = await c.req.json<{
    title: string; slug: string; content: string;
    excerpt?: string; published?: number; category_id?: number | null; tags?: string[];
  }>();

  if (!body.title || !body.slug) return err("title and slug are required", 400);

  const result = await createPost(c.env.DB, {
    title: body.title,
    slug: body.slug,
    content: body.content || "",
    excerpt: body.excerpt || "",
    published: body.published ?? 1,
    category_id: body.category_id ?? null,
  });

  const postId = result.meta.last_row_id;
  if (postId && body.tags) await syncPostTags(c.env.DB, postId, body.tags);

  const post = await getPostBySlug(c.env.DB, body.slug);
  return c.json({ success: true, post, tags: body.tags || [] }, 201);
});

api.put("/posts/:id", async (c) => {
  const key = c.get("apiKey" as never) as ApiKeyInfo;
  if (!hasPermission(key, "update")) return err("No update permission", 403);

  const id = parseInt(c.req.param("id"));
  const existing = await getPostById(c.env.DB, id);
  if (!existing) return err("Post not found", 404);

  const body = await c.req.json<{
    title?: string; slug?: string; content?: string;
    excerpt?: string; published?: number; category_id?: number | null; tags?: string[];
  }>();

  if (body.tags) await syncPostTags(c.env.DB, id, body.tags);

  await updatePost(c.env.DB, id, {
    title: body.title,
    slug: body.slug,
    content: body.content,
    excerpt: body.excerpt,
    published: body.published,
    category_id: body.category_id,
  });

  const post = await getPostById(c.env.DB, id);
  return c.json({ success: true, post });
});

api.delete("/posts/:id", async (c) => {
  const key = c.get("apiKey" as never) as ApiKeyInfo;
  if (!hasPermission(key, "delete")) return err("No delete permission", 403);

  const id = parseInt(c.req.param("id"));
  const existing = await getPostById(c.env.DB, id);
  if (!existing) return err("Post not found", 404);

  await deletePost(c.env.DB, id);
  return c.json({ success: true });
});

api.get("/categories", async (c) => {
  const key = c.get("apiKey" as never) as ApiKeyInfo;
  if (!hasPermission(key, "read")) return err("No read permission", 403);
  const categories = await getCategoryTree(c.env.DB);
  return c.json({ categories });
});

api.post("/categories", async (c) => {
  const key = c.get("apiKey" as never) as ApiKeyInfo;
  if (!hasPermission(key, "create")) return err("No create permission", 403);

  const body = await c.req.json<{ name: string; slug?: string; parent_id?: number | null; sort_order?: number }>();
  if (!body.name) return err("name is required", 400);

  const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "") || `cat-${Date.now()}`;
  await createCategory(c.env.DB, {
    name: body.name,
    slug,
    parent_id: body.parent_id ?? null,
    sort_order: body.sort_order ?? 0,
  });
  const categories = await getCategoryTree(c.env.DB);
  return c.json({ success: true, categories }, 201);
});

api.put("/categories/:id", async (c) => {
  const key = c.get("apiKey" as never) as ApiKeyInfo;
  if (!hasPermission(key, "update")) return err("No update permission", 403);

  const id = parseInt(c.req.param("id"));
  const all = await getAllCategories(c.env.DB);
  if (!all.find((cat) => cat.id === id)) return err("Category not found", 404);

  const body = await c.req.json<{ name?: string; slug?: string; parent_id?: number | null; sort_order?: number }>();
  const slug = body.slug || (body.name ? body.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-|-$/g, "") : undefined);
  await updateCategory(c.env.DB, id, {
    name: body.name,
    slug,
    parent_id: body.parent_id,
    sort_order: body.sort_order,
  });
  const categories = await getCategoryTree(c.env.DB);
  return c.json({ success: true, categories });
});

api.delete("/categories/:id", async (c) => {
  const key = c.get("apiKey" as never) as ApiKeyInfo;
  if (!hasPermission(key, "delete")) return err("No delete permission", 403);

  const id = parseInt(c.req.param("id"));
  const all = await getAllCategories(c.env.DB);
  if (!all.find((cat) => cat.id === id)) return err("Category not found", 404);

  await deleteCategory(c.env.DB, id);
  return c.json({ success: true });
});

export default api;
