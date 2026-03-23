import type { Category } from "../types.ts";

export function layout(
  title: string,
  content: string,
  config: Record<string, string> = {},
  options: { categories?: Category[]; currentCategory?: string } = {}
): string {
  const blogTitle = config.blog_title || "FishBlog";
  const blogDesc = config.blog_description || "";
  const { categories, currentCategory } = options;

  const sidebar = categories ? buildSidebar(categories, currentCategory) : "";
  const hasSidebar = !!categories;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${escapeHtml(blogTitle)}</title>
  <meta name="description" content="${escapeHtml(blogDesc)}">
  <link rel="icon" href="/favicon.ico">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #fafaf9; --fg: #1c1917; --muted: #78716c; --border: #e7e5e4;
      --accent: #ea580c; --accent-hover: #c2410c; --surface: #ffffff;
      --radius: 8px; --max-w: 960px;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
      --font-serif: 'Noto Serif SC', 'Source Han Serif SC', Georgia, serif;
    }

    @media (prefers-color-scheme: dark) {
      :root { --bg: #0c0a09; --fg: #fafaf9; --muted: #a8a29e; --border: #292524; --surface: #1c1917; }
    }

    body { font-family: var(--font-sans); background: var(--bg); color: var(--fg); line-height: 1.75; min-height: 100vh; display: flex; flex-direction: column; }
    a { color: var(--accent); text-decoration: none; transition: color .2s; }
    a:hover { color: var(--accent-hover); }

    header { border-bottom: 1px solid var(--border); padding: 1.5rem 0; }
    header .inner { max-width: var(--max-w); margin: 0 auto; padding: 0 1.5rem; display: flex; justify-content: space-between; align-items: center; }
    header h1 { font-size: 1.25rem; font-weight: 700; }
    header h1 a { color: var(--fg); }
    header nav { display: flex; gap: 1.5rem; font-size: .9rem; align-items: center; }
    header nav a { color: var(--muted); font-weight: 500; }
    header nav a:hover { color: var(--fg); }

    .search-box { position: relative; }
    .search-box input {
      padding: .35rem .7rem .35rem 1.8rem; border: 1px solid var(--border); border-radius: 99px;
      background: var(--surface); color: var(--fg); font-size: .8rem; width: 160px; transition: width .3s, border-color .2s;
    }
    .search-box input:focus { outline: none; border-color: var(--accent); width: 220px; }
    .search-box::before {
      content: '\\1F50D'; position: absolute; left: .6rem; top: 50%; transform: translateY(-50%); font-size: .75rem; pointer-events: none;
    }

    .content-wrap { flex: 1; max-width: var(--max-w); margin: 0 auto; padding: 2rem 1.5rem; width: 100%; display: ${hasSidebar ? "flex" : "block"}; gap: 2.5rem; }
    .main-content { flex: 1; min-width: 0; }

    .sidebar {
      width: 220px; flex-shrink: 0; position: sticky; top: 2rem; align-self: flex-start; max-height: calc(100vh - 4rem); overflow-y: auto;
    }
    .sidebar-card {
      background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem;
    }
    .sidebar-card h3 { font-size: .85rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: .75rem; font-weight: 600; }
    .cat-list { list-style: none; }
    .cat-list li { margin-bottom: .15rem; }
    .cat-list a {
      display: flex; justify-content: space-between; align-items: center;
      padding: .3rem .5rem; border-radius: 4px; font-size: .85rem; color: var(--fg); transition: background .15s;
    }
    .cat-list a:hover { background: var(--border); color: var(--accent); }
    .cat-list a.active { background: var(--accent); color: #fff; }
    .cat-list a.active:hover { background: var(--accent-hover); }
    .cat-count { font-size: .75rem; color: var(--muted); background: var(--bg); padding: .1rem .4rem; border-radius: 99px; }
    .cat-list a.active .cat-count { background: rgba(255,255,255,.2); color: #fff; }
    .cat-sub { padding-left: .8rem; }

    @media (max-width: 768px) {
      .content-wrap { flex-direction: column-reverse; }
      .sidebar { width: 100%; position: static; max-height: none; }
    }

    footer { border-top: 1px solid var(--border); text-align: center; padding: 1.5rem; font-size: .8rem; color: var(--muted); }
    footer a { color: var(--muted); }
    footer a:hover { color: var(--accent); }

    .post-list { list-style: none; }
    .post-item { padding: 1.5rem 0; border-bottom: 1px solid var(--border); }
    .post-item:last-child { border-bottom: none; }
    .post-item h2 { font-size: 1.25rem; margin-bottom: .25rem; font-family: var(--font-serif); }
    .post-item h2 a { color: var(--fg); }
    .post-item h2 a:hover { color: var(--accent); }
    .post-meta { font-size: .8rem; color: var(--muted); margin-bottom: .5rem; display: flex; gap: .75rem; align-items: center; }
    .post-meta .cat-tag { background: var(--surface); border: 1px solid var(--border); padding: .1rem .45rem; border-radius: 4px; font-size: .7rem; }
    .post-excerpt { color: var(--muted); font-size: .95rem; }

    .article { font-family: var(--font-serif); }
    .article h1 { font-size: 2rem; margin-bottom: .5rem; line-height: 1.3; }
    .article .meta { color: var(--muted); font-size: .85rem; margin-bottom: 2rem; font-family: var(--font-sans); display: flex; gap: .75rem; align-items: center; }
    .article .meta .cat-tag { background: var(--surface); border: 1px solid var(--border); padding: .1rem .45rem; border-radius: 4px; font-size: .75rem; }
    .article .content { font-size: 1.05rem; }
    .article .content h2 { font-size: 1.4rem; margin: 2rem 0 .75rem; font-weight: 700; }
    .article .content h3 { font-size: 1.15rem; margin: 1.5rem 0 .5rem; font-weight: 600; }
    .article .content p { margin-bottom: 1.25rem; }
    .article .content pre { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; overflow-x: auto; font-family: var(--font-mono); font-size: .875rem; margin-bottom: 1.25rem; }
    .article .content code { font-family: var(--font-mono); font-size: .875em; background: var(--surface); padding: .15em .35em; border-radius: 4px; }
    .article .content pre code { background: none; padding: 0; }
    .article .content blockquote { border-left: 3px solid var(--accent); padding-left: 1rem; color: var(--muted); margin-bottom: 1.25rem; }
    .article .content img { max-width: 100%; border-radius: var(--radius); }
    .article .content ul, .article .content ol { padding-left: 1.5rem; margin-bottom: 1.25rem; }
    .article .content li { margin-bottom: .25rem; }

    .pagination { display: flex; justify-content: center; gap: 1rem; margin-top: 2rem; font-size: .9rem; }
    .pagination a { padding: .4rem 1rem; border: 1px solid var(--border); border-radius: var(--radius); }

    .back-link { display: inline-block; margin-bottom: 2rem; font-size: .9rem; color: var(--muted); font-family: var(--font-sans); }
    .back-link:hover { color: var(--accent); }

    .archive-year { font-size: 1.5rem; font-weight: 700; margin: 2rem 0 .75rem; }
    .archive-list { list-style: none; }
    .archive-list li { padding: .4rem 0; display: flex; gap: 1rem; align-items: baseline; }
    .archive-list .date { color: var(--muted); font-size: .8rem; font-family: var(--font-mono); white-space: nowrap; }

    .search-results-title { font-size: 1.2rem; margin-bottom: 1rem; }
    .search-results-title span { color: var(--accent); }
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Noto+Serif+SC:wght@400;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
</head>
<body>
  <header>
    <div class="inner">
      <h1><a href="/">${escapeHtml(blogTitle)}</a></h1>
      <nav>
        <a href="/">首页</a>
        <a href="/archive">归档</a>
        <div class="search-box">
          <form action="/search" method="GET">
            <input type="text" name="q" placeholder="搜索文章..." aria-label="搜索">
          </form>
        </div>
      </nav>
    </div>
  </header>
  <div class="content-wrap">
    <div class="main-content">${content}</div>
    ${sidebar}
  </div>
  <footer><a href="https://github.com/qqzhoufan/fishblog" target="_blank">Powered by FishBlog</a></footer>
</body>
</html>`;
}

function buildSidebar(categories: Category[], currentCategory?: string): string {
  if (!categories.length) {
    return `<aside class="sidebar"><div class="sidebar-card"><h3>分类</h3><p style="font-size:.85rem;color:var(--muted)">暂无分类</p></div></aside>`;
  }

  let items = `<li><a href="/" class="${!currentCategory ? "active" : ""}">全部</a></li>`;

  for (const cat of categories) {
    const isActive = currentCategory === String(cat.id);
    const hasActiveChild = cat.children?.some((c) => currentCategory === String(c.id));
    items += `<li><a href="/?cat=${cat.id}" class="${isActive ? "active" : ""}">${escapeHtml(cat.name)}<span class="cat-count">${cat.post_count || 0}</span></a>`;
    if (cat.children && cat.children.length > 0) {
      items += `<ul class="cat-list cat-sub">`;
      for (const child of cat.children) {
        const childActive = currentCategory === String(child.id);
        items += `<li><a href="/?cat=${child.id}" class="${childActive ? "active" : ""}">${escapeHtml(child.name)}<span class="cat-count">${child.post_count || 0}</span></a></li>`;
      }
      items += `</ul>`;
    }
    items += `</li>`;
  }

  return `<aside class="sidebar"><div class="sidebar-card"><h3>分类</h3><ul class="cat-list">${items}</ul></div></aside>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
