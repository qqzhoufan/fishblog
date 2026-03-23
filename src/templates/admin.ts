import { escapeHtml } from "./layout.ts";
import type { Post, Category, ApiKey } from "../types.ts";

export function adminLayout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - FishBlog Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f172a; --fg: #e2e8f0; --muted: #94a3b8;
      --surface: #1e293b; --border: #334155;
      --accent: #f97316; --accent-hover: #ea580c;
      --success: #22c55e; --danger: #ef4444;
      --radius: 8px;
    }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--fg); min-height: 100vh; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { color: var(--accent-hover); }

    .admin-header {
      background: var(--surface); border-bottom: 1px solid var(--border);
      padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center;
    }
    .admin-header h1 { font-size: 1.1rem; }
    .admin-header h1 span { color: var(--accent); }
    .admin-header nav { display: flex; gap: 1.5rem; font-size: .9rem; }

    .admin-main { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }

    .btn {
      display: inline-flex; align-items: center; gap: .4rem;
      padding: .5rem 1rem; border-radius: var(--radius); font-size: .875rem;
      border: 1px solid var(--border); background: var(--surface);
      color: var(--fg); cursor: pointer; transition: all .15s; text-decoration: none;
    }
    .btn:hover { border-color: var(--accent); color: var(--accent); }
    .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .btn-primary:hover { background: var(--accent-hover); border-color: var(--accent-hover); color: #fff; }
    .btn-danger { border-color: var(--danger); color: var(--danger); }
    .btn-danger:hover { background: var(--danger); color: #fff; }
    .btn-sm { padding: .3rem .7rem; font-size: .8rem; }

    table { width: 100%; border-collapse: collapse; }
    th, td { padding: .75rem 1rem; text-align: left; border-bottom: 1px solid var(--border); }
    th { font-size: .8rem; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    td { font-size: .9rem; }

    .badge { display: inline-block; padding: .15rem .5rem; border-radius: 99px; font-size: .75rem; font-weight: 600; }
    .badge-pub { background: #052e16; color: var(--success); }
    .badge-draft { background: #1c1917; color: var(--muted); }

    .form-group { margin-bottom: 1.25rem; }
    .form-group label { display: block; font-size: .85rem; color: var(--muted); margin-bottom: .4rem; font-weight: 500; }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%; padding: .6rem .8rem; background: var(--surface);
      border: 1px solid var(--border); border-radius: var(--radius);
      color: var(--fg); font-size: .9rem; font-family: inherit;
    }
    .form-group input:focus, .form-group textarea:focus, .form-group select:focus { outline: none; border-color: var(--accent); }
    .form-group textarea { min-height: 400px; font-family: 'JetBrains Mono', monospace; line-height: 1.6; resize: vertical; }

    .form-row { display: flex; gap: 1rem; }
    .form-row .form-group { flex: 1; }
    .actions { display: flex; gap: .5rem; }
    .page-title { font-size: 1.5rem; margin-bottom: 1.5rem; }
    .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }

    .key-display {
      background: var(--bg); border: 1px solid var(--accent); border-radius: var(--radius);
      padding: 1rem; font-family: 'JetBrains Mono', monospace; font-size: .85rem;
      word-break: break-all; margin: 1rem 0;
    }
    .key-display strong { color: var(--accent); }

    .perm-badges { display: flex; gap: .3rem; flex-wrap: wrap; }
    .perm-badge { font-size: .7rem; padding: .15rem .4rem; border-radius: 4px; background: #1e293b; border: 1px solid var(--border); }

    .checkbox-group { display: flex; flex-wrap: wrap; gap: .75rem; }
    .checkbox-group label { display: flex; align-items: center; gap: .3rem; font-size: .85rem; color: var(--fg); cursor: pointer; }
    .checkbox-group input[type="checkbox"] { accent-color: var(--accent); }

    .section-title { font-size: 1.1rem; margin: 2rem 0 1rem; padding-bottom: .5rem; border-bottom: 1px solid var(--border); }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
</head>
<body>
  <div class="admin-header">
    <h1><span>Fish</span>Blog Admin</h1>
    <nav>
      <a href="/admin">文章</a>
      <a href="/admin/categories">分类</a>
      <a href="/admin/apikeys">API Keys</a>
      <a href="/" target="_blank">查看博客</a>
      <a href="/admin/logout">退出</a>
    </nav>
  </div>
  <div class="admin-main">${content}</div>
</body>
</html>`;
}

export function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录 - FishBlog Admin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --bg: #0f172a; --fg: #e2e8f0; --muted: #94a3b8; --surface: #1e293b; --border: #334155; --accent: #f97316; --radius: 8px; }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--fg); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .login-box { width: 100%; max-width: 400px; background: var(--surface); padding: 2.5rem; border-radius: 12px; border: 1px solid var(--border); margin: 1rem; }
    .login-box h2 { text-align: center; margin-bottom: 1.5rem; font-size: 1.5rem; }
    .login-box h2 span { color: var(--accent); }
    .form-group { margin-bottom: 1.25rem; }
    .form-group label { display: block; font-size: .85rem; color: var(--muted); margin-bottom: .4rem; }
    .form-group input { width: 100%; padding: .6rem .8rem; background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); color: var(--fg); font-size: .9rem; }
    .form-group input:focus { outline: none; border-color: var(--accent); }
    .btn { width: 100%; padding: .7rem; background: var(--accent); color: #fff; border: none; border-radius: var(--radius); font-size: .95rem; cursor: pointer; font-weight: 600; }
    .btn:hover { background: #ea580c; }
    .error-msg { background: #450a0a; color: #ef4444; padding: .6rem 1rem; border-radius: var(--radius); margin-bottom: 1rem; font-size: .85rem; text-align: center; }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="login-box">
    <h2><span>Fish</span>Blog</h2>
    ${error ? `<div class="error-msg">${escapeHtml(error)}</div>` : ""}
    <form method="POST" action="/admin/login">
      <div class="form-group"><label>用户名</label><input type="text" name="username" required autocomplete="username"></div>
      <div class="form-group"><label>密码</label><input type="password" name="password" required autocomplete="current-password"></div>
      <button type="submit" class="btn">登 录</button>
    </form>
  </div>
</body>
</html>`;
}

export function postListPage(posts: Post[]): string {
  const rows = posts
    .map(
      (p) => `<tr>
      <td>${escapeHtml(p.title)}</td>
      <td>${p.category_name ? escapeHtml(p.category_name) : '<span style="color:var(--muted)">-</span>'}</td>
      <td>${p.published ? '<span class="badge badge-pub">已发布</span>' : '<span class="badge badge-draft">草稿</span>'}</td>
      <td>${p.created_at.slice(0, 10)}</td>
      <td>
        <div class="actions">
          <a href="/admin/edit/${p.id}" class="btn btn-sm">编辑</a>
          <form method="POST" action="/admin/delete/${p.id}" onsubmit="return confirm('确定删除？')">
            <button type="submit" class="btn btn-sm btn-danger">删除</button>
          </form>
        </div>
      </td>
    </tr>`
    )
    .join("");

  return adminLayout("文章管理", `
    <div class="top-bar"><h2 class="page-title">文章管理</h2><a href="/admin/new" class="btn btn-primary">+ 新建文章</a></div>
    <table>
      <thead><tr><th>标题</th><th>分类</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:3rem">暂无文章</td></tr>'}</tbody>
    </table>`);
}

export function postEditorPage(post?: Post, categories: Category[] = []): string {
  const isEdit = !!post;
  const action = isEdit ? `/admin/edit/${post!.id}` : "/admin/new";

  const catOptions = categories.map((c) => {
    const selected = post?.category_id === c.id ? "selected" : "";
    let opts = `<option value="${c.id}" ${selected}>${escapeHtml(c.name)}</option>`;
    if (c.children) {
      for (const child of c.children) {
        const childSelected = post?.category_id === child.id ? "selected" : "";
        opts += `<option value="${child.id}" ${childSelected}>&nbsp;&nbsp;└ ${escapeHtml(child.name)}</option>`;
      }
    }
    return opts;
  }).join("");

  return adminLayout(isEdit ? "编辑文章" : "新建文章", `
    <h2 class="page-title">${isEdit ? "编辑文章" : "新建文章"}</h2>
    <form method="POST" action="${action}">
      <div class="form-row">
        <div class="form-group"><label>标题</label><input type="text" name="title" value="${escapeHtml(post?.title || "")}" required></div>
        <div class="form-group"><label>Slug（URL 路径）</label><input type="text" name="slug" value="${escapeHtml(post?.slug || "")}" required pattern="[a-z0-9\\-]+" title="仅限小写字母、数字和连字符"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>摘要</label><input type="text" name="excerpt" value="${escapeHtml(post?.excerpt || "")}"></div>
        <div class="form-group"><label>分类</label>
          <select name="category_id"><option value="">无分类</option>${catOptions}</select>
        </div>
      </div>
      <div class="form-group"><label>正文（Markdown）</label><textarea name="content">${escapeHtml(post?.content || "")}</textarea></div>
      <div class="form-row" style="align-items:end">
        <div class="form-group"><label>状态</label>
          <select name="published">
            <option value="0" ${!post?.published ? "selected" : ""}>草稿</option>
            <option value="1" ${post?.published ? "selected" : ""}>发布</option>
          </select>
        </div>
        <div class="form-group"><div class="actions"><button type="submit" class="btn btn-primary">保存</button><a href="/admin" class="btn">取消</a></div></div>
      </div>
    </form>`);
}

// ── Categories ──

export function categoryListPage(categories: Category[]): string {
  const rows = categories.flatMap((c) => {
    const parentRow = `<tr>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td><code>${escapeHtml(c.slug)}</code></td>
      <td>—</td>
      <td>${c.sort_order}</td>
      <td><div class="actions">
        <a href="/admin/categories/edit/${c.id}" class="btn btn-sm">编辑</a>
        <form method="POST" action="/admin/categories/delete/${c.id}" onsubmit="return confirm('删除分类后，该分类下的文章将变为无分类。确定？')">
          <button type="submit" class="btn btn-sm btn-danger">删除</button>
        </form>
      </div></td>
    </tr>`;
    const childRows = (c.children || []).map(
      (ch) => `<tr>
      <td>&nbsp;&nbsp;└ ${escapeHtml(ch.name)}</td>
      <td><code>${escapeHtml(ch.slug)}</code></td>
      <td>${escapeHtml(c.name)}</td>
      <td>${ch.sort_order}</td>
      <td><div class="actions">
        <a href="/admin/categories/edit/${ch.id}" class="btn btn-sm">编辑</a>
        <form method="POST" action="/admin/categories/delete/${ch.id}" onsubmit="return confirm('确定删除？')">
          <button type="submit" class="btn btn-sm btn-danger">删除</button>
        </form>
      </div></td>
    </tr>`
    );
    return [parentRow, ...childRows];
  });

  return adminLayout("分类管理", `
    <div class="top-bar"><h2 class="page-title">分类管理</h2><a href="/admin/categories/new" class="btn btn-primary">+ 新建分类</a></div>
    <table>
      <thead><tr><th>名称</th><th>Slug</th><th>上级</th><th>排序</th><th>操作</th></tr></thead>
      <tbody>${rows.join("") || '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:3rem">暂无分类</td></tr>'}</tbody>
    </table>`);
}

export function categoryEditorPage(category?: Category & { id?: number }, parentCategories: Category[] = []): string {
  const isEdit = !!category?.id;
  const action = isEdit ? `/admin/categories/edit/${category!.id}` : "/admin/categories/new";

  const parentOptions = parentCategories
    .filter((c) => !isEdit || c.id !== category!.id)
    .map((c) => `<option value="${c.id}" ${category?.parent_id === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`)
    .join("");

  return adminLayout(isEdit ? "编辑分类" : "新建分类", `
    <h2 class="page-title">${isEdit ? "编辑分类" : "新建分类"}</h2>
    <form method="POST" action="${action}">
      <div class="form-row">
        <div class="form-group"><label>分类名称</label><input type="text" name="name" value="${escapeHtml(category?.name || "")}" required></div>
        <div class="form-group"><label>Slug</label><input type="text" name="slug" value="${escapeHtml(category?.slug || "")}" required pattern="[a-z0-9\\-]+"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>上级分类</label>
          <select name="parent_id"><option value="">无（一级分类）</option>${parentOptions}</select>
        </div>
        <div class="form-group"><label>排序（数字越小越靠前）</label><input type="number" name="sort_order" value="${category?.sort_order ?? 0}"></div>
      </div>
      <div class="actions"><button type="submit" class="btn btn-primary">保存</button><a href="/admin/categories" class="btn">取消</a></div>
    </form>`);
}

// ── API Keys ──

export function apiKeyListPage(apiKeys: ApiKey[], newKey?: string): string {
  const newKeyHtml = newKey
    ? `<div class="key-display"><strong>新 API Key 已生成，请立即复制保存（只显示一次）：</strong><br><br>${escapeHtml(newKey)}</div>`
    : "";

  const permLabels: Record<string, string> = {
    read: "读取", create: "创建", update: "编辑", delete: "删除",
  };

  const rows = apiKeys
    .map(
      (k) => {
        const perms = k.permissions.split(",").map(
          (p) => `<span class="perm-badge">${permLabels[p.trim()] || p.trim()}</span>`
        ).join("");
        return `<tr>
        <td>${escapeHtml(k.name)}</td>
        <td><code>${k.key_hash.slice(0, 12)}...</code></td>
        <td><div class="perm-badges">${perms}</div></td>
        <td>${k.last_used_at ? k.last_used_at.slice(0, 10) : '从未'}</td>
        <td>${k.created_at.slice(0, 10)}</td>
        <td>
          <form method="POST" action="/admin/apikeys/delete/${k.id}" onsubmit="return confirm('确定吊销此 Key？')">
            <button type="submit" class="btn btn-sm btn-danger">吊销</button>
          </form>
        </td>
      </tr>`;
      }
    )
    .join("");

  return adminLayout("API Keys", `
    <div class="top-bar"><h2 class="page-title">API Keys</h2><a href="/admin/apikeys/new" class="btn btn-primary">+ 生成 Key</a></div>
    ${newKeyHtml}
    <table>
      <thead><tr><th>名称</th><th>Key</th><th>权限</th><th>最后使用</th><th>创建时间</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:3rem">暂无 API Key</td></tr>'}</tbody>
    </table>
    <h3 class="section-title">API 使用说明</h3>
    <p style="font-size:.85rem;color:var(--muted);line-height:1.8">
      请求时在 Header 中携带 <code style="background:var(--surface);padding:.15em .35em;border-radius:4px">Authorization: Bearer YOUR_API_KEY</code><br>
      <strong>接口列表：</strong><br>
      <code>GET /api/posts</code> — 获取文章列表（需要 read 权限）<br>
      <code>GET /api/posts/:slug</code> — 获取单篇文章（需要 read 权限）<br>
      <code>POST /api/posts</code> — 创建文章（需要 create 权限）<br>
      <code>PUT /api/posts/:id</code> — 更新文章（需要 update 权限）<br>
      <code>DELETE /api/posts/:id</code> — 删除文章（需要 delete 权限）<br>
      <code>GET /api/categories</code> — 获取分类列表（需要 read 权限）
    </p>`);
}

export function apiKeyNewPage(): string {
  return adminLayout("生成 API Key", `
    <h2 class="page-title">生成 API Key</h2>
    <form method="POST" action="/admin/apikeys/new">
      <div class="form-group"><label>名称（用途描述）</label><input type="text" name="name" required placeholder="例如：OpenClaw 写作助手"></div>
      <div class="form-group"><label>权限</label>
        <div class="checkbox-group">
          <label><input type="checkbox" name="perm" value="read" checked> 读取文章</label>
          <label><input type="checkbox" name="perm" value="create"> 创建文章</label>
          <label><input type="checkbox" name="perm" value="update"> 编辑文章</label>
          <label><input type="checkbox" name="perm" value="delete"> 删除文章</label>
        </div>
      </div>
      <div class="actions"><button type="submit" class="btn btn-primary">生成</button><a href="/admin/apikeys" class="btn">取消</a></div>
    </form>`);
}
