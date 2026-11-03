# FishBlog 🐟

一个运行在 Cloudflare Workers 和 D1 上的轻量博客。使用 Markdown 写作，通过浏览器管理文章、分类和评论，也可以用 REST API 接入其他写作工具。

[English](README_EN.md)

## 功能

- **写作与阅读**：Markdown 文章、草稿与发布、置顶、摘要、阅读量和图片预览。
- **组织与发现**：两级分类、标签、搜索、归档、RSS，以及站点地图和 SEO 元数据。
- **评论互动**：游客无需注册即可留言；管理员可在后台查看、删除和回复评论。
- **可选通知**：配置邮件服务后，可收到新留言通知；访客可以自愿留下邮箱，接收管理员回复通知。未配置时仍可正常使用评论和回复。
- **站点管理**：修改标题、描述、页脚和站点图标；支持随系统切换深浅色主题。
- **开放接口**：为 API Key 分别授予读取、新建、修改或删除权限。
- **部署与安全**：支持 GitHub Actions 部署，管理员会话可过期和撤销，评论和登录有频率限制，文章 HTML 在显示时会进行安全过滤。

FishBlog 本身不要求购买付费服务，低流量网站通常可以使用 Cloudflare 的免费额度。邮件通知默认关闭，启用时需要自行配置邮件服务；免费额度、域名费用和超额政策取决于服务商及账户设置，请在启用前确认。

## 快速部署

### 1. 准备仓库和 Cloudflare 凭据

1. Fork 本仓库。
2. 在 Cloudflare Dashboard 获取账户 ID（Account ID）。
3. 创建 Cloudflare API Token，授予 Workers 编辑和 D1 编辑权限。
4. 在 Fork 后的 GitHub 仓库打开 **Settings → Secrets and variables → Actions**，添加：

| GitHub Secret | 用途 |
| --- | --- |
| `CF_API_TOKEN` | Cloudflare API Token |
| `CF_ACCOUNT_ID` | Cloudflare Account ID |
| `ADMIN_USERNAME` | 管理员用户名 |
| `ADMIN_PASSWORD` | 管理员强密码 |

### 2. 部署并访问

在 GitHub Actions 中运行 **Deploy to Cloudflare Workers**，或推送到 `main` 分支。工作流会安装依赖、运行检查、创建或查找 `fishblog-db`、配置管理员凭据并部署 Worker。首次访问时自动初始化数据库表。

| 页面 | 路径 |
| --- | --- |
| 首页 | `/` |
| 管理后台 | `/admin` |
| RSS | `/feed.xml` |
| 站点地图 | `/sitemap.xml` |

在 Cloudflare Dashboard 的 Workers 页面可查看站点地址，也可按需绑定自定义域名。部署已有博客的新版本前，请先备份 D1，并在隔离环境验证现有数据和内容展示。

## 使用指南

### 写文章

登录 `/admin`，选择“新建文章”，填写标题、Slug、Markdown 正文及可选的摘要、分类和标签，再选择发布或保存为草稿。文章可置顶；前台普通图片可点击预览，原本带链接的图片保留链接行为。

文章和页脚中的 HTML 会在显示时过滤：常见 Markdown、链接、图片和表格会保留，脚本、事件属性及 iframe 等嵌入不会执行或显示。数据库中的原始内容不会因显示过滤而更改；使用自定义 HTML 的已有博客应先用内容副本检查显示效果。

### 管理评论

访客可以在文章下方使用昵称留言，无需注册。进入后台的“评论”页面可以查看、删除和回复留言；关闭游客评论不会删除已有内容。留言和回复通知属于可选功能，邮箱只用于通知，不应作为公开评论信息展示。

### 可选：开启邮件通知

默认不发送邮件。FishBlog 使用 [Resend](https://resend.com/) 的邮件 API；需要 Resend 账户、经过验证的发件域名和 API Key。免费方案有用量限制，域名可能产生费用；请先查看 [Resend 当前价格和限制](https://resend.com/pricing)，也要考虑同一账户中其他应用的邮件用量。FishBlog 不会自动订购或升级套餐。

将以下值作为 GitHub Actions Secrets 添加后重新运行部署工作流；也可以直接在 Cloudflare Worker 的 **Settings → Variables and Secrets** 中设置为加密 Secret：

| Secret | 说明 |
| --- | --- |
| `RESEND_API_KEY` | Resend 仅发送权限的 API Key，勿提交到仓库 |
| `MAIL_FROM` | 已在 Resend 验证的发件域名下的完整邮箱，例如 `blog@example.com` |
| `SITE_URL` | 博客的公开地址，例如 `https://blog.example.com`，用于生成邮件链接 |
| `ADMIN_NOTIFY_EMAIL` | 接收新留言通知的管理员邮箱；不填时只支持访客回复通知 |

前三项配置完整后，勾选通知并填写邮箱的访客可以收到管理员回复；配置第四项后，新留言也会通知管理员。邮件服务商会收到收件地址及邮件内容；访客邮箱不会包含在公开页面或评论 API 中。

为限制用量，本站最多在每个 UTC 自然日尝试发送 80 封，包括失败的尝试。邮件发送失败不会撤销评论或回复；待发送和失败数量可在后台“评论管理”查看，新通知会触发处理，也可以手动点击重试。系统没有定时投递任务，空闲时不会自动重试；每次处理通知时会清理超过 7 天的通知记录，已尝试发送的邮件超过安全重试期限后不会再次发送，无法保证每封邮件必达。

要停用邮件通知，请从 **Cloudflare Worker 的 Secrets** 删除 `RESEND_API_KEY`，或使用 `wrangler secret delete RESEND_API_KEY`；如果 GitHub Actions 也配置过该 Secret，还需从 GitHub 删除，避免后续部署重新写入。仅从 GitHub 删除不会自动删除 Cloudflare 中已有的 Secret。停用后已有评论、回复和邮箱不会被删除。

### 设置站点

后台“设置”可修改博客标题、描述、页脚和 Favicon；图标文件最大 1.4 MB。管理员登录会话到期或退出后需要重新登录。更新管理员密码会使旧会话失效。

## API

在后台 **API Keys** 创建密钥，按需要授予 `read`、`create`、`update` 和 `delete` 权限。请求时使用 `Authorization: Bearer YOUR_API_KEY`。拥有读取权限的密钥也可以读取草稿，请只授予可信的集成。

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/posts` | `read` | 文章列表；支持 `page`、`category_id` 和 `all=true` |
| `GET` | `/api/posts/:slug` | `read` | 获取文章及标签 |
| `GET` | `/api/posts/:slug/comments` | `read` | 获取文章评论 |
| `POST` | `/api/posts` | `create` | 新建文章 |
| `PUT` | `/api/posts/:id` | `update` | 更新文章 |
| `DELETE` | `/api/posts/:id` | `delete` | 删除文章 |
| `GET` | `/api/categories` | `read` | 获取分类树 |
| `POST` | `/api/categories` | `create` | 新建分类 |
| `PUT` | `/api/categories/:id` | `update` | 更新分类 |
| `DELETE` | `/api/categories/:id` | `delete` | 删除分类 |

```bash
curl -X POST https://your-blog.workers.dev/api/posts \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"title":"Hello World","slug":"hello-world","content":"# Hello","tags":["博客"],"published":1}'
```

## 本地开发与测试

需要 Node.js 22。复制配置模板，并在本地配置管理员凭据：

```bash
git clone https://github.com/qqzhoufan/fishblog.git
cd fishblog
cp wrangler.toml.example wrangler.toml
npm ci
printf 'ADMIN_USERNAME=admin\nADMIN_PASSWORD=local-password\n' > .dev.vars
npm run dev
```

访问 `http://localhost:8787`。`.dev.vars` 和本地 Wrangler 数据不应提交到仓库。本地配置中的 D1 ID 是占位值，部署到自己的 Cloudflare 账户前需要替换。

```bash
npm run typecheck
npm test
```

测试使用独立的临时数据库，不连接线上数据。推送到 `main` 后的部署工作流也会运行这些检查。

## 备份与升级

在 Cloudflare Dashboard 的 D1 数据库页面导出备份，或使用 Wrangler 的 D1 导出功能。部署前建议先在独立环境恢复副本，验证首页、历史文章、自定义 HTML、登录、评论和 API；确认正常后再更新线上版本。管理员凭据、API Key 和 D1 数据应分别妥善保存。

## 项目结构

```text
src/
  db/           数据库初始化与查询
  middleware/   登录会话和请求限速
  routes/       博客、后台与 API 路由
  services/     可选邮件通知及队列
  templates/    页面模板和内容安全过滤
  index.ts      Worker 入口
tests/          隔离数据库与 Worker 回归测试
.github/        GitHub Actions 部署工作流
```
