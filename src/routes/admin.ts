import { Hono } from "hono";
import type { Env } from "../types.ts";
import { sha256, adminAuth, createAdminSession, revokeAdminSession } from "../middleware/auth.ts";
import { checkRateLimit } from "../middleware/rate-limit.ts";
import { dispatchNotification, dispatchPendingNotifications } from "../services/notification-dispatch.ts";
import { adminNotificationConfigured, getNotificationStats, notificationConfigured, retryFailedNotifications } from "../services/notifications.ts";
import {
  loginPage, postListPage, postEditorPage,
  categoryListPage, categoryEditorPage,
  apiKeyListPage, apiKeyNewPage, settingsPage, commentListPage,
} from "../templates/admin.ts";
import {
  getAllPosts, getPostById, createPost, updatePost, deletePost,
  getCategoryTree, getAllCategories, createCategory, updateCategory, deleteCategory,
  getAllApiKeys, createApiKey, deleteApiKey,
  getConfig, setConfigValues,
  getTagsForPost,
  getAllComments, deleteComment, getCommentNotificationInfo, createCommentReply,
} from "../db/queries.ts";

const admin = new Hono<{ Bindings: Env }>();

// ── Auth ──

admin.get("/login", (c) => c.html(loginPage()));

admin.post("/login", async (c) => {
  if (!c.env.ADMIN_USERNAME || !c.env.ADMIN_PASSWORD) {
    return c.html(loginPage("管理员账号尚未配置"), 503);
  }
  const retryAfter = await checkRateLimit(c, "login", 30, 10 * 60);
  if (retryAfter) return c.html(loginPage("尝试次数过多，请稍后再试"), 429, { "Retry-After": String(retryAfter) });
  const body = await c.req.parseBody();
  const username = (body.username as string) || "";
  const password = (body.password as string) || "";

  if (username !== c.env.ADMIN_USERNAME || password !== c.env.ADMIN_PASSWORD) {
    return c.html(loginPage("用户名或密码错误"), 401);
  }

  const token = await createAdminSession(c.env);
  const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin",
      "Set-Cookie": `fishblog_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secure}`,
    },
  });
});

admin.get("/logout", async (c) => {
  await revokeAdminSession(c);
  const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
  return new Response(null, {
    status: 302,
    headers: { Location: "/admin/login", "Set-Cookie": `fishblog_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}` },
  });
});

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
  await createPost(c.env.DB, {
    title: body.title as string, slug: body.slug as string,
    content: body.content as string, excerpt: (body.excerpt as string) || "",
    published: parseInt(body.published as string) || 0, category_id: catId,
    is_pinned: body.is_pinned ? 1 : 0,
  }, parseTags(body.tags as string));
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
    is_pinned: body.is_pinned ? 1 : 0,
  }, parseTags(body.tags as string));
  return c.redirect("/admin");
});

admin.post("/delete/:id", async (c) => {
  await deletePost(c.env.DB, parseInt(c.req.param("id")));
  return c.redirect("/admin");
});

// ── Comments ──

admin.get("/comments", async (c) => {
  const comments = await getAllComments(c.env.DB);
  let notificationStatus: Awaited<ReturnType<typeof getNotificationStats>> | null = null;
  if (notificationConfigured(c.env)) {
    try { notificationStatus = await getNotificationStats(c.env); } catch { /* Keep comment management usable. */ }
  }
  return c.html(commentListPage(comments, {
    configured: notificationConfigured(c.env),
    adminConfigured: adminNotificationConfigured(c.env),
    stats: notificationStatus,
  }));
});

admin.post("/comments/notifications/retry", async (c) => {
  if (notificationConfigured(c.env)) {
    try {
      await retryFailedNotifications(c.env);
      dispatchPendingNotifications(c);
    } catch {
      return c.text("无法处理邮件通知，请稍后再试。", 503);
    }
  }
  return c.redirect("/admin/comments");
});

admin.post("/comments/delete/:id", async (c) => {
  await deleteComment(c.env.DB, parseInt(c.req.param("id")));
  return c.redirect("/admin/comments");
});

admin.post("/comments/reply/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return c.text("评论不存在", 404);
  const comment = await getCommentNotificationInfo(c.env.DB, id);
  if (!comment) return c.text("评论不存在", 404);
  const body = await c.req.parseBody();
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content || content.length > 2000) return c.text("回复内容应为 1 至 2000 个字符", 400);
  const result = await createCommentReply(c.env.DB, id, content);
  const replyId = result.meta?.last_row_id;
  if (comment.email && replyId) await dispatchNotification(c, {
    kind: "reply", eventId: String(replyId), commentId: id, recipient: comment.email,
    postTitle: comment.post_title, postSlug: comment.post_slug, author: comment.author, content,
  });
  return c.redirect("/admin/comments");
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

  const values: Record<string, string> = {
    blog_title: (body.blog_title as string) || "FishBlog",
    blog_description: (body.blog_description as string) || "",
    blog_footer: (body.blog_footer as string) || "Powered by FishBlog",
    comments_enabled: body.comments_enabled ? "1" : "0",
  };

  const faviconFile = body.favicon;
  if (faviconFile && faviconFile instanceof File && faviconFile.size > 0) {
    // Base64 expands data by one third; leave room below D1's 2,000,000-byte row limit.
    if (faviconFile.size > 1_400_000) {
      const config = await getConfig(c.env.DB);
      return c.html(settingsPage({ ...config, ...values }, false, "图标文件过大，请选择不超过 1.4 MB 的文件。其他设置尚未保存。"), 400);
    }
    const bytes = new Uint8Array(await faviconFile.arrayBuffer());
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 0x8000) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
    }
    values.favicon = `data:${faviconFile.type};base64,${btoa(chunks.join(""))}`;
  }

  await setConfigValues(c.env.DB, values);
  return c.redirect("/admin/settings?saved=1");
});

export default admin;
