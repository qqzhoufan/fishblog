# FishBlog 🐟

一个极简的博客系统，运行在 Cloudflare Workers 上，零服务器成本。

## 技术栈

- **Runtime**: Cloudflare Workers
- **Framework**: [Hono](https://hono.dev)
- **Database**: Cloudflare D1 (SQLite)
- **Markdown**: marked
- **CI/CD**: GitHub Actions + Wrangler

## 特性

- 📝 Markdown 编辑器，支持实时预览
- 🎨 深色/浅色主题自适应
- 🔐 内置管理后台，密码认证
- 📡 RSS 订阅 (`/feed.xml`)
- 📦 零依赖部署，全在 Cloudflare 边缘运行
- 🚀 GitHub push 自动部署

## 快速开始

### 1. 前置条件

```bash
npm install -g wrangler
wrangler login
```

### 2. 一键初始化

```bash
git clone <your-repo-url>
cd fishblog
npm install
npm run setup
```

脚本会自动：创建 D1 数据库、配置管理员账号、初始化数据表。

### 3. 本地开发

```bash
npm run dev
```

访问 http://localhost:8787

### 4. 部署到 Cloudflare

```bash
npm run db:init:remote   # 远程初始化数据库（首次）
npm run deploy           # 部署 Worker
```

### 5. 自动部署（CI/CD）

在 GitHub 仓库 Settings → Secrets 中添加：

| Secret | 说明 |
|--------|------|
| `CF_API_TOKEN` | Cloudflare API Token（需要 Workers + D1 权限） |
| `CF_ACCOUNT_ID` | Cloudflare Account ID |

之后每次 push 到 `main` 分支都会自动部署。

## 项目结构

```
fishblog/
├── src/
│   ├── index.ts          # 入口
│   ├── types.ts          # 类型定义
│   ├── routes/
│   │   ├── blog.ts       # 博客前端路由
│   │   └── admin.ts      # 管理后台路由
│   ├── templates/
│   │   ├── layout.ts     # 前端模板
│   │   └── admin.ts      # 后台模板
│   ├── middleware/
│   │   └── auth.ts       # 认证中间件
│   └── db/
│       ├── schema.sql    # 数据库表结构
│       └── queries.ts    # 数据查询层
├── .github/workflows/
│   └── deploy.yml        # GitHub Actions
├── wrangler.toml         # Workers 配置
├── setup.sh              # 一键初始化脚本
└── package.json
```

## License

MIT
