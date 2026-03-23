import { Hono } from "hono";
import type { Env } from "../types.ts";
import { sha256 } from "../middleware/auth.ts";
import {
  getPublishedPosts, getAllPosts, getPostBySlug, getPostById,
  createPost, updatePost, deletePost,
  getCategoryTree, getApiKeyByHash, touchApiKey,
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
  return c.json(post);
});

api.post("/posts", async (c) => {
  const key = c.get("apiKey" as never) as ApiKeyInfo;
  if (!hasPermission(key, "create")) return err("No create permission", 403);

  const body = await c.req.json<{
    title: string; slug: string; content: string;
    excerpt?: string; published?: number; category_id?: number | null;
  }>();

  if (!body.title || !body.slug) return err("title and slug are required", 400);

  await createPost(c.env.DB, {
    title: body.title,
    slug: body.slug,
    content: body.content || "",
    excerpt: body.excerpt || "",
    published: body.published ?? 0,
    category_id: body.category_id ?? null,
  });

  const post = await getPostBySlug(c.env.DB, body.slug);
  return c.json({ success: true, post }, 201);
});

api.put("/posts/:id", async (c) => {
  const key = c.get("apiKey" as never) as ApiKeyInfo;
  if (!hasPermission(key, "update")) return err("No update permission", 403);

  const id = parseInt(c.req.param("id"));
  const existing = await getPostById(c.env.DB, id);
  if (!existing) return err("Post not found", 404);

  const body = await c.req.json<{
    title?: string; slug?: string; content?: string;
    excerpt?: string; published?: number; category_id?: number | null;
  }>();

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

export default api;
