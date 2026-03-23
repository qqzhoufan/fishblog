import { Hono } from "hono";
import { marked } from "marked";
import type { Env } from "../types.ts";
import { layout, escapeHtml } from "../templates/layout.ts";
import { getPublishedPosts, getPostBySlug, getConfig } from "../db/queries.ts";

const blog = new Hono<{ Bindings: Env }>();

blog.get("/", async (c) => {
  const page = parseInt(c.req.query("page") || "1");
  const [{ posts, total }, config] = await Promise.all([
    getPublishedPosts(c.env.DB, page),
    getConfig(c.env.DB),
  ]);

  const totalPages = Math.ceil(total / 10);

  const postItems = posts
    .map(
      (p) => `<li class="post-item">
        <h2><a href="/post/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a></h2>
        <div class="post-meta">${p.created_at.slice(0, 10)}</div>
        ${p.excerpt ? `<p class="post-excerpt">${escapeHtml(p.excerpt)}</p>` : ""}
      </li>`
    )
    .join("");

  const pagination =
    totalPages > 1
      ? `<div class="pagination">
          ${page > 1 ? `<a href="/?page=${page - 1}">&larr; 上一页</a>` : ""}
          ${page < totalPages ? `<a href="/?page=${page + 1}">下一页 &rarr;</a>` : ""}
        </div>`
      : "";

  const content = posts.length
    ? `<ul class="post-list">${postItems}</ul>${pagination}`
    : `<p style="text-align:center;color:var(--muted);padding:3rem 0">还没有文章，快去写一篇吧 :)</p>`;

  return c.html(layout("首页", content, config));
});

blog.get("/post/:slug", async (c) => {
  const slug = c.req.param("slug");
  const [post, config] = await Promise.all([
    getPostBySlug(c.env.DB, slug),
    getConfig(c.env.DB),
  ]);

  if (!post || !post.published) {
    return c.html(layout("404", '<p style="text-align:center;padding:3rem">文章不存在</p>', config), 404);
  }

  const html = await marked(post.content);
  const content = `<article class="article">
    <a href="/" class="back-link">&larr; 返回首页</a>
    <h1>${escapeHtml(post.title)}</h1>
    <div class="meta">${post.created_at.slice(0, 10)}</div>
    <div class="content">${html}</div>
  </article>`;

  return c.html(layout(post.title, content, config));
});

blog.get("/archive", async (c) => {
  const [{ posts }, config] = await Promise.all([
    getPublishedPosts(c.env.DB, 1, 9999),
    getConfig(c.env.DB),
  ]);

  const grouped: Record<string, typeof posts> = {};
  for (const post of posts) {
    const year = post.created_at.slice(0, 4);
    if (!grouped[year]) grouped[year] = [];
    grouped[year].push(post);
  }

  const years = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const archiveHtml = years
    .map(
      (year) => `
      <h3 class="archive-year">${year}</h3>
      <ul class="archive-list">
        ${grouped[year]
          .map(
            (p) => `<li>
              <span class="date">${p.created_at.slice(5, 10)}</span>
              <a href="/post/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a>
            </li>`
          )
          .join("")}
      </ul>`
    )
    .join("");

  const content = archiveHtml || '<p style="text-align:center;color:var(--muted);padding:3rem 0">暂无归档</p>';
  return c.html(layout("归档", content, config));
});

blog.get("/feed.xml", async (c) => {
  const [{ posts }, config] = await Promise.all([
    getPublishedPosts(c.env.DB, 1, 20),
    getConfig(c.env.DB),
  ]);

  const blogTitle = config.blog_title || "FishBlog";
  const url = new URL(c.req.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const items = posts
    .map(
      (p) => `<item>
      <title>${escapeHtml(p.title)}</title>
      <link>${baseUrl}/post/${escapeHtml(p.slug)}</link>
      <description>${escapeHtml(p.excerpt)}</description>
      <pubDate>${new Date(p.created_at).toUTCString()}</pubDate>
      <guid>${baseUrl}/post/${escapeHtml(p.slug)}</guid>
    </item>`
    )
    .join("\n");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(blogTitle)}</title>
    <link>${baseUrl}</link>
    <description>${escapeHtml(config.blog_description || "")}</description>
    ${items}
  </channel>
</rss>`;

  return c.text(rss, 200, { "Content-Type": "application/xml" });
});

export default blog;
