import { Hono } from "hono";
import type { Env } from "../types.ts";
import { sha256, adminAuth, generateToken } from "../middleware/auth.ts";
import {
  loginPage, postListPage, postEditorPage,
  categoryListPage, categoryEditorPage,
  apiKeyListPage, apiKeyNewPage, settingsPage,
} from "../templates/admin.ts";
import {
  getAllPosts, getPostById, createPost, updatePost, deletePost,
  getCategoryTree, getAllCategories, createCategory, updateCategory, deleteCategory,
  getAllApiKeys, createApiKey, deleteApiKey,
  getConfig, setConfig,
  getTagsForPost, syncPostTags,
} from "../db/queries.ts";

const admin = new Hono<{ Bindings: Env }>();

// ── Auth ──

admin.get("/login", (c) => c.html(loginPage()));

admin.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const username = (body.username as string) || "";
  const password = (body.password as string) || "";

  if (username !== c.env.ADMIN_USERNAME || password !== c.env.ADMIN_PASSWORD) {
    return c.html(loginPage("用户名或密码错误"), 401);
  }

  const token = await generateToken(username, password);
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin",
      "Set-Cookie": `fishblog_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`,
    },
  });
});

admin.get("/logout", () =>
  new Response(null, {
    status: 302,
    headers: { Location: "/admin/login", "Set-Cookie": "fishblog_token=; Path=/; HttpOnly; Max-Age=0" },
  })
);

admin.use("/*", adminAuth);

// ── Posts ──

admin.get("/", async (c) => {
  const posts = await getAllPosts(c.env.DB);
  return c.html(postListPage(posts));
});

admin.get("/new", async (c) => {
  const categories = await getCategoryTree(c.env.DB);
  return c.html(postEditorPage(undefined, categories));
});

function parseTags(raw: string): string[] {
  return (raw || "").split(",").map((t) => t.trim()).filter(Boolean);
}

admin.post("/new", async (c) => {
  const body = await c.req.parseBody();
  const catId = body.category_id ? parseInt(body.category_id as string) : null;
  const result = await createPost(c.env.DB, {
    title: body.title as string, slug: body.slug as string,
    content: body.content as string, excerpt: (body.excerpt as string) || "",
    published: parseInt(body.published as string) || 0, category_id: catId,
  });
  const postId = result.meta.last_row_id;
  if (postId) await syncPostTags(c.env.DB, postId, parseTags(body.tags as string));
  return c.redirect("/admin");
});

admin.get("/edit/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const [post, categories, tags] = await Promise.all([
    getPostById(c.env.DB, id), getCategoryTree(c.env.DB), getTagsForPost(c.env.DB, id),
  ]);
  if (!post) return c.text("Post not found", 404);
  return c.html(postEditorPage(post, categories, tags.map((t) => t.name)));
});

admin.post("/edit/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.parseBody();
  const catId = body.category_id ? parseInt(body.category_id as string) : null;
  await updatePost(c.env.DB, id, {
    title: body.title as string, slug: body.slug as string,
    content: body.content as string, excerpt: (body.excerpt as string) || "",
    published: parseInt(body.published as string) || 0, category_id: catId,
  });
  await syncPostTags(c.env.DB, id, parseTags(body.tags as string));
  return c.redirect("/admin");
});

admin.post("/delete/:id", async (c) => {
  await deletePost(c.env.DB, parseInt(c.req.param("id")));
  return c.redirect("/admin");
});

// ── Categories ──

admin.get("/categories", async (c) => {
  const categories = await getCategoryTree(c.env.DB);
  return c.html(categoryListPage(categories));
});

admin.get("/categories/new", async (c) => {
  const all = await getAllCategories(c.env.DB);
  const roots = all.filter((c) => !c.parent_id);
  return c.html(categoryEditorPage(undefined, roots));
});

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    || `cat-${Date.now()}`;
}

admin.post("/categories/new", async (c) => {
  const body = await c.req.parseBody();
  const name = body.name as string;
  await createCategory(c.env.DB, {
    name, slug: generateSlug(name),
    parent_id: body.parent_id ? parseInt(body.parent_id as string) : null,
    sort_order: parseInt(body.sort_order as string) || 0,
  });
  return c.redirect("/admin/categories");
});

admin.get("/categories/edit/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const all = await getAllCategories(c.env.DB);
  const cat = all.find((c) => c.id === id);
  if (!cat) return c.text("Category not found", 404);
  const roots = all.filter((c) => !c.parent_id);
  return c.html(categoryEditorPage(cat, roots));
});

admin.post("/categories/edit/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.parseBody();
  const name = body.name as string;
  await updateCategory(c.env.DB, id, {
    name, slug: generateSlug(name),
    parent_id: body.parent_id ? parseInt(body.parent_id as string) : null,
    sort_order: parseInt(body.sort_order as string) || 0,
  });
  return c.redirect("/admin/categories");
});

admin.post("/categories/delete/:id", async (c) => {
  await deleteCategory(c.env.DB, parseInt(c.req.param("id")));
  return c.redirect("/admin/categories");
});

// ── API Keys ──

admin.get("/apikeys", async (c) => {
  const keys = await getAllApiKeys(c.env.DB);
  return c.html(apiKeyListPage(keys));
});

admin.get("/apikeys/new", (c) => c.html(apiKeyNewPage()));

admin.post("/apikeys/new", async (c) => {
  const form = await c.req.formData();
  const name = form.get("name") as string;
  const perms = form.getAll("perm") as string[];
  const permissions = perms.filter(Boolean).join(",");

  const rawKey = `fb_${crypto.randomUUID().replace(/-/g, "")}`;
  const keyHash = await sha256(rawKey);

  await createApiKey(c.env.DB, { name, key_hash: keyHash, permissions });

  const keys = await getAllApiKeys(c.env.DB);
  return c.html(apiKeyListPage(keys, rawKey));
});

admin.post("/apikeys/delete/:id", async (c) => {
  await deleteApiKey(c.env.DB, parseInt(c.req.param("id")));
  return c.redirect("/admin/apikeys");
});

// ── Settings ──

admin.get("/settings", async (c) => {
  const config = await getConfig(c.env.DB);
  const saved = c.req.query("saved") === "1";
  return c.html(settingsPage(config, saved));
});

admin.post("/settings", async (c) => {
  const body = await c.req.parseBody();

  await setConfig(c.env.DB, "blog_title", (body.blog_title as string) || "FishBlog");
  await setConfig(c.env.DB, "blog_description", (body.blog_description as string) || "");
  await setConfig(c.env.DB, "blog_footer", (body.blog_footer as string) || "Powered by FishBlog");

  const faviconFile = body.favicon;
  if (faviconFile && faviconFile instanceof File && faviconFile.size > 0) {
    const buffer = await faviconFile.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const dataUrl = `data:${faviconFile.type};base64,${base64}`;
    await setConfig(c.env.DB, "favicon", dataUrl);
  }

  return c.redirect("/admin/settings?saved=1");
});

export default admin;
