# FishBlog 🐟

> 一个极简的博客系统，运行在 Cloudflare Workers 上。零服务器、零成本、全自动部署。

[![Deploy to Cloudflare Workers](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://github.com/qqzhoufan/fishblog#-一键部署)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ 特性

| | 功能 | 说明 |
|---|------|------|
| 📝 | **Markdown 写作** | 内置管理后台，支持 Markdown 编辑与实时发布 |
| 🎨 | **主题自适应** | 深色/浅色模式跟随系统自动切换 |
| 🔐 | **安全认证** | 管理员密码通过 Cloudflare Secrets 加密管理，运行时 SHA-256 哈希校验 |
| 📡 | **RSS 订阅** | 内置 `/feed.xml`，方便读者订阅 |
| 📦 | **零配置** | D1 数据库自动创建、表结构首次访问自动初始化 |
| 🚀 | **全自动部署** | Push 到 main 分支即自动部署，GitHub Actions 一站式完成 |
| 🌍 | **全球加速** | 运行在 Cloudflare 边缘网络，全球低延迟访问 |
| 💰 | **完全免费** | Workers Free Plan 每天 10 万次请求，D1 Free 5GB 存储 |

## 🛠 技术栈

- **运行时** — [Cloudflare Workers](https://workers.cloudflare.com/)
- **框架** — [Hono](https://hono.dev)（轻量 Web 框架，专为边缘运行时设计）
- **数据库** — [Cloudflare D1](https://developers.cloudflare.com/d1/)（基于 SQLite 的无服务器数据库）
- **渲染** — 服务端 HTML 直出（SSR），[marked](https://github.com/markedjs/marked) 解析 Markdown
- **字体** — Inter + Noto Serif SC + JetBrains Mono
- **CI/CD** — GitHub Actions + Wrangler CLI

## 🚀 一键部署

整个过程无需安装任何本地工具，全部在浏览器中完成。

### 第一步：Fork 仓库

点击本页右上角的 **Fork** 按钮，将仓库复制到你的 GitHub 账号下。

### 第二步：获取 Cloudflare 凭据

**获取 Account ID：**
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入左侧 **Workers & Pages**
3. 右侧边栏可以看到 **Account ID**，复制它

**创建 API Token：**
1. 前往 [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 **Create Token**
3. 选择 **Edit Cloudflare Workers** 模板
4. 在 **Account Resources** 下确认选中你的账号
5. 在 **Permissions** 部分点击 **+ Add more**，添加：
   - Account → **D1** → **Edit**
6. 点击 **Continue to summary** → **Create Token**
7. 复制生成的 Token

### 第三步：配置 GitHub Secrets

在你 fork 的仓库中：

1. 进入 **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**，依次添加以下 4 个：

| Secret 名称 | 值 | 说明 |
|---|---|---|
| `CF_API_TOKEN` | 上一步创建的 Token | Cloudflare API 凭证 |
| `CF_ACCOUNT_ID` | 上一步复制的 ID | Cloudflare 账号标识 |
| `ADMIN_USERNAME` | 自定义，如 `admin` | 博客管理后台用户名 |
| `ADMIN_PASSWORD` | 自定义强密码 | 博客管理后台密码 |

### 第四步：触发部署

两种方式，任选其一：

- **方式 A**：Push 任意 commit 到 `main` 分支
- **方式 B**：进入仓库的 **Actions** 页面 → 选择 **Deploy to Cloudflare Workers** → 点击 **Run workflow**

GitHub Actions 会自动完成以下全部操作：

```
✅ 安装依赖
✅ 创建 D1 数据库（已存在则跳过）
✅ 解析并绑定数据库 ID
✅ 设置管理员 Secrets
✅ 部署 Worker 到 Cloudflare 边缘网络
```

### 第五步：开始使用

部署完成后，访问：

| 页面 | 地址 |
|------|------|
| 博客首页 | `https://fishblog.<your-subdomain>.workers.dev` |
| 管理后台 | `https://fishblog.<your-subdomain>.workers.dev/admin` |
| RSS 订阅 | `https://fishblog.<your-subdomain>.workers.dev/feed.xml` |

> `<your-subdomain>` 是你 Cloudflare 账号的 Workers 子域名，可在 Dashboard 中查看。

### 绑定自定义域名（可选）

1. 进入 Cloudflare Dashboard → **Workers & Pages** → 点击 `fishblog`
2. 进入 **Settings** → **Domains & Routes**
3. 点击 **Add** → **Custom Domain**
4. 输入你的域名（如 `blog.example.com`），Cloudflare 会自动配置 DNS 和 HTTPS

## 📖 使用指南

### 写文章

1. 访问 `/admin`，输入用户名和密码登录
2. 点击 **+ 新建文章**
3. 填写标题、Slug（URL 路径，如 `hello-world`）、摘要
4. 在正文区域用 Markdown 写作
5. 选择 **发布** 或保存为 **草稿**
6. 点击 **保存**

### 管理文章

- 在管理后台可以查看所有文章（含草稿）
- 支持编辑、删除、切换发布/草稿状态

### Markdown 支持

正文支持完整的 Markdown 语法：

```markdown
## 二级标题
### 三级标题

**加粗** *斜体* `行内代码`

- 无序列表
1. 有序列表

> 引用文字

![图片](https://example.com/image.png)
[链接](https://example.com)

代码块（支持语法高亮）
```

## 💻 本地开发

如需在本地调试或二次开发：

```bash
# 克隆仓库
git clone https://github.com/qqzhoufan/fishblog.git
cd fishblog

# 复制配置模板
cp wrangler.toml.example wrangler.toml

# 安装依赖
npm install

# 创建本地 Secrets 文件
echo -e 'ADMIN_USERNAME=admin\nADMIN_PASSWORD=123456' > .dev.vars

# 启动开发服务器
npm run dev
```

访问 http://localhost:8787 即可预览，代码修改后自动热重载。

## 📁 项目结构

```
fishblog/
├── src/
│   ├── index.ts              # 应用入口，挂载自动建表中间件
│   ├── types.ts              # TypeScript 类型定义
│   ├── routes/
│   │   ├── blog.ts           # 前端路由：首页、文章页、归档、RSS
│   │   └── admin.ts          # 后台路由：登录、文章增删改查
│   ├── templates/
│   │   ├── layout.ts         # 前端页面模板（响应式 + 主题适配）
│   │   └── admin.ts          # 后台页面模板
│   ├── middleware/
│   │   └── auth.ts           # Cookie 认证中间件
│   └── db/
│       ├── migrate.ts        # 自动建表（首次访问时执行）
│       └── queries.ts        # 数据库查询封装
├── .github/workflows/
│   └── deploy.yml            # GitHub Actions 全自动部署流水线
├── wrangler.toml.example     # Wrangler 配置模板
├── tsconfig.json             # TypeScript 配置
├── package.json              # 依赖和脚本
└── README.md
```

## 🔧 自定义配置

### 博客标题和描述

编辑 `wrangler.toml.example` 中的 `[vars]` 部分：

```toml
[vars]
BLOG_TITLE = "你的博客名"
BLOG_DESCRIPTION = "你的博客描述"
```

修改后 push 即可自动生效。

### 更多自定义

| 需求 | 修改文件 |
|------|----------|
| 页面样式 | `src/templates/layout.ts` |
| 后台样式 | `src/templates/admin.ts` |
| 导航链接 | `src/templates/layout.ts` 中 `<nav>` 部分 |
| 数据库字段 | `src/db/migrate.ts` + `src/db/queries.ts` |

## ❓ FAQ

**Q: 完全免费吗？**
A: 是的。Cloudflare Workers Free Plan 每天 10 万次请求，D1 Free Plan 5GB 存储 + 500 万行读取/天。个人博客完全够用。

**Q: 数据安全吗？**
A: 管理员密码存储在 Cloudflare Secrets 中（加密存储），不会出现在代码或日志中。认证使用 SHA-256 哈希 + HttpOnly Cookie。

**Q: 能承受多大流量？**
A: Cloudflare Workers 运行在全球 300+ 边缘节点，Free Plan 每天 10 万请求，付费计划无上限。

**Q: 如何备份数据？**
A: 在 Cloudflare Dashboard → D1 → fishblog-db 中可以导出数据库。也可通过 `wrangler d1 export` 命令行导出。

**Q: 如何更改管理员密码？**
A: 在 GitHub 仓库 Settings → Secrets 中更新 `ADMIN_PASSWORD`，然后重新触发一次 Actions 部署即可。

## License

[MIT](LICENSE)
