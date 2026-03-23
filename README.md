# FishBlog 🐟

一个极简的博客系统，运行在 Cloudflare Workers 上，零服务器成本，全自动部署。

## 技术栈

- **Runtime**: Cloudflare Workers
- **Framework**: [Hono](https://hono.dev)
- **Database**: Cloudflare D1 (SQLite)
- **Markdown**: marked
- **CI/CD**: GitHub Actions + Wrangler

## 特性

- 📝 Markdown 写作，管理后台内置
- 🎨 深色/浅色主题自动适配
- 🔐 管理员认证，密码通过 Secrets 安全管理
- 📡 RSS 订阅 (`/feed.xml`)
- 📦 零配置部署，D1 数据库自动创建和初始化
- 🚀 Push 即部署，GitHub Actions 全自动

## 一键部署

### 1. Fork 本仓库

### 2. 创建 Cloudflare API Token

前往 [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) → Create Token → 使用 **Edit Cloudflare Workers** 模板，额外勾选 **D1** 权限。

### 3. 配置 GitHub Secrets

在你 fork 的仓库中，进入 Settings → Secrets and variables → Actions → New repository secret，添加以下 4 个：

| Secret | 说明 |
|--------|------|
| `CF_API_TOKEN` | Cloudflare API Token |
| `CF_ACCOUNT_ID` | Cloudflare Account ID（在 Workers 页面右侧可找到） |
| `ADMIN_USERNAME` | 管理后台用户名 |
| `ADMIN_PASSWORD` | 管理后台密码 |

### 4. 触发部署

Push 任意 commit 到 `main` 分支，或手动在 Actions 页面点击 **Run workflow**。

GitHub Actions 会自动完成：
1. 创建 D1 数据库（已存在则跳过）
2. 设置管理员 Secrets
3. 部署 Worker

首次访问时，应用会自动初始化数据库表结构。

### 5. 开始使用

- 博客首页：`https://fishblog.<your-subdomain>.workers.dev`
- 管理后台：`https://fishblog.<your-subdomain>.workers.dev/admin`
- 自定义域名：在 Cloudflare Dashboard → Workers → 你的 Worker → Triggers → Custom Domains 中添加

## 本地开发

```bash
# 复制配置模板
cp wrangler.toml.example wrangler.toml

# 安装依赖
npm install

# 设置本地 Secrets
echo "admin" | npx wrangler secret put ADMIN_USERNAME --local
echo "your-password" | npx wrangler secret put ADMIN_PASSWORD --local

# 启动开发服务器
npm run dev
```

访问 http://localhost:8787

## 项目结构

```
fishblog/
├── src/
│   ├── index.ts            # 入口，自动建表中间件
│   ├── types.ts            # 类型定义
│   ├── routes/
│   │   ├── blog.ts         # 博客前端（首页、文章、归档、RSS）
│   │   └── admin.ts        # 管理后台（登录、文章 CRUD）
│   ├── templates/
│   │   ├── layout.ts       # 前端模板
│   │   └── admin.ts        # 后台模板
│   ├── middleware/
│   │   └── auth.ts         # 认证中间件
│   └── db/
│       ├── migrate.ts      # 自动建表
│       └── queries.ts      # 数据查询层
├── .github/workflows/
│   └── deploy.yml          # 全自动部署流水线
├── wrangler.toml.example   # 配置模板
└── package.json
```

## License

MIT
