import { escapeHtml } from "./layout.ts";
import type { Post } from "../types.ts";

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
      color: var(--fg); cursor: pointer; transition: all .15s;
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

    .badge {
      display: inline-block; padding: .15rem .5rem; border-radius: 99px; font-size: .75rem; font-weight: 600;
    }
    .badge-pub { background: #052e16; color: var(--success); }
    .badge-draft { background: #1c1917; color: var(--muted); }

    .form-group { margin-bottom: 1.25rem; }
    .form-group label { display: block; font-size: .85rem; color: var(--muted); margin-bottom: .4rem; font-weight: 500; }
    .form-group input, .form-group textarea, .form-group select {
      width: 100%; padding: .6rem .8rem; background: var(--surface);
      border: 1px solid var(--border); border-radius: var(--radius);
      color: var(--fg); font-size: .9rem; font-family: inherit;
    }
    .form-group input:focus, .form-group textarea:focus {
      outline: none; border-color: var(--accent);
    }
    .form-group textarea { min-height: 400px; font-family: 'JetBrains Mono', monospace; line-height: 1.6; resize: vertical; }

    .form-row { display: flex; gap: 1rem; }
    .form-row .form-group { flex: 1; }

    .actions { display: flex; gap: .5rem; }

    .page-title { font-size: 1.5rem; margin-bottom: 1.5rem; }
    .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }

    .login-box {
      max-width: 400px; margin: 8rem auto; background: var(--surface);
      padding: 2.5rem; border-radius: 12px; border: 1px solid var(--border);
    }
    .login-box h2 { text-align: center; margin-bottom: 1.5rem; }
    .error-msg { background: #450a0a; color: var(--danger); padding: .6rem 1rem; border-radius: var(--radius); margin-bottom: 1rem; font-size: .85rem; }
  </style>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
</head>
<body>
  <div class="admin-header">
    <h1><span>Fish</span>Blog Admin</h1>
    <nav>
      <a href="/admin">文章管理</a>
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
      <div class="form-group">
        <label>用户名</label>
        <input type="text" name="username" required autocomplete="username">
      </div>
      <div class="form-group">
        <label>密码</label>
        <input type="password" name="password" required autocomplete="current-password">
      </div>
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

  return adminLayout(
    "文章管理",
    `<div class="top-bar">
      <h2 class="page-title">文章管理</h2>
      <a href="/admin/new" class="btn btn-primary">+ 新建文章</a>
    </div>
    <table>
      <thead><tr><th>标题</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:3rem">暂无文章，点击右上角创建第一篇吧</td></tr>'}</tbody>
    </table>`
  );
}

export function postEditorPage(post?: Post): string {
  const isEdit = !!post;
  const action = isEdit ? `/admin/edit/${post!.id}` : "/admin/new";

  return adminLayout(
    isEdit ? "编辑文章" : "新建文章",
    `<h2 class="page-title">${isEdit ? "编辑文章" : "新建文章"}</h2>
    <form method="POST" action="${action}">
      <div class="form-row">
        <div class="form-group">
          <label>标题</label>
          <input type="text" name="title" value="${escapeHtml(post?.title || "")}" required>
        </div>
        <div class="form-group">
          <label>Slug（URL 路径）</label>
          <input type="text" name="slug" value="${escapeHtml(post?.slug || "")}" required pattern="[a-z0-9\\-]+" title="仅限小写字母、数字和连字符">
        </div>
      </div>
      <div class="form-group">
        <label>摘要</label>
        <input type="text" name="excerpt" value="${escapeHtml(post?.excerpt || "")}">
      </div>
      <div class="form-group">
        <label>正文（Markdown）</label>
        <textarea name="content">${escapeHtml(post?.content || "")}</textarea>
      </div>
      <div class="form-row" style="align-items:end">
        <div class="form-group">
          <label>状态</label>
          <select name="published">
            <option value="0" ${!post?.published ? "selected" : ""}>草稿</option>
            <option value="1" ${post?.published ? "selected" : ""}>发布</option>
          </select>
        </div>
        <div class="form-group">
          <div class="actions">
            <button type="submit" class="btn btn-primary">保存</button>
            <a href="/admin" class="btn">取消</a>
          </div>
        </div>
      </div>
    </form>`
  );
}
