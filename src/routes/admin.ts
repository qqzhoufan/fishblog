import { Hono } from "hono";
import type { Env } from "../types.ts";
import { adminAuth, generateToken } from "../middleware/auth.ts";
import {
  loginPage,
  postListPage,
  postEditorPage,
} from "../templates/admin.ts";
import {
  getAllPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
} from "../db/queries.ts";

const admin = new Hono<{ Bindings: Env }>();

admin.get("/login", (c) => {
  return c.html(loginPage());
});

admin.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const username = (body.username as string) || "";
  const password = (body.password as string) || "";

  if (
    username !== c.env.ADMIN_USERNAME ||
    password !== c.env.ADMIN_PASSWORD
  ) {
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

admin.get("/logout", () => {
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin/login",
      "Set-Cookie": "fishblog_token=; Path=/; HttpOnly; Max-Age=0",
    },
  });
});

admin.use("/*", adminAuth);

admin.get("/", async (c) => {
  const posts = await getAllPosts(c.env.DB);
  return c.html(postListPage(posts));
});

admin.get("/new", (c) => {
  return c.html(postEditorPage());
});

admin.post("/new", async (c) => {
  const body = await c.req.parseBody();
  await createPost(c.env.DB, {
    title: body.title as string,
    slug: body.slug as string,
    content: body.content as string,
    excerpt: (body.excerpt as string) || "",
    published: parseInt(body.published as string) || 0,
  });
  return c.redirect("/admin");
});

admin.get("/edit/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const post = await getPostById(c.env.DB, id);
  if (!post) return c.text("Post not found", 404);
  return c.html(postEditorPage(post));
});

admin.post("/edit/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  const body = await c.req.parseBody();
  await updatePost(c.env.DB, id, {
    title: body.title as string,
    slug: body.slug as string,
    content: body.content as string,
    excerpt: (body.excerpt as string) || "",
    published: parseInt(body.published as string) || 0,
  });
  return c.redirect("/admin");
});

admin.post("/delete/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  await deletePost(c.env.DB, id);
  return c.redirect("/admin");
});

export default admin;
