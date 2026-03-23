# FishBlog 🐟

> A minimal blog system running on Cloudflare Workers. Zero server, zero cost, fully automated deployment.

[![Deploy to Cloudflare Workers](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://github.com/qqzhoufan/fishblog#-deploy-in-one-click)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[中文文档](README.md)

---

## ✨ Features

| | Feature | Description |
|---|---------|-------------|
| 📝 | **Markdown Editor** | Built-in admin panel with Markdown editing and instant publishing |
| 🏷️ | **Categories & Tags** | Two-level category hierarchy + freeform tags, sidebar filtering |
| 🔍 | **Full-text Search** | Fuzzy search across titles, content, and excerpts |
| 🎨 | **Adaptive Theme** | Dark/light mode follows system preference |
| 🔐 | **Secure Auth** | Admin password managed via Cloudflare Secrets |
| 🔑 | **REST API** | Built-in API key system with granular permissions for external integrations |
| 📡 | **RSS Feed** | Built-in `/feed.xml` |
| 🖼️ | **Custom Favicon** | Upload favicon from admin settings |
| ⚙️ | **Site Settings** | Visual configuration for blog title, description, footer |
| 📦 | **Zero Config** | D1 database auto-created, tables auto-initialized on first visit |
| 🚀 | **Auto Deploy** | Push to main = deployed, GitHub Actions handles everything |
| 🌍 | **Global CDN** | Runs on Cloudflare's 300+ edge nodes worldwide |
| 💰 | **Completely Free** | Workers Free: 100K requests/day, D1 Free: 5GB storage |

## 🛠 Tech Stack

- **Runtime** — [Cloudflare Workers](https://workers.cloudflare.com/)
- **Framework** — [Hono](https://hono.dev) (lightweight web framework for edge runtimes)
- **Database** — [Cloudflare D1](https://developers.cloudflare.com/d1/) (serverless SQLite)
- **Rendering** — Server-side HTML (SSR), Markdown via [marked](https://github.com/markedjs/marked)
- **Fonts** — Inter + Noto Serif SC + JetBrains Mono
- **CI/CD** — GitHub Actions + Wrangler CLI

## 🚀 Deploy in One Click

The entire process can be completed in your browser — no local tools required.

### Step 1: Fork the Repository

Click the **Fork** button in the top right corner of this page.

### Step 2: Get Cloudflare Credentials

**Get Account ID:**
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to **Workers & Pages** in the left sidebar
3. Copy the **Account ID** from the right sidebar

**Create API Token:**
1. Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use the **Edit Cloudflare Workers** template
4. Under **Permissions**, click **+ Add more** and add:
   - Account → **D1** → **Edit**
5. Click **Continue to summary** → **Create Token**
6. Copy the generated token

### Step 3: Configure GitHub Secrets

In your forked repository:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** and add these 4 secrets:

| Secret Name | Value | Description |
|---|---|---|
| `CF_API_TOKEN` | Token from previous step | Cloudflare API credential |
| `CF_ACCOUNT_ID` | Account ID from previous step | Cloudflare account identifier |
| `ADMIN_USERNAME` | e.g. `admin` | Blog admin username |
| `ADMIN_PASSWORD` | A strong password | Blog admin password |

### Step 4: Trigger Deployment

Either:
- **Option A**: Push any commit to the `main` branch
- **Option B**: Go to **Actions** tab → **Deploy to Cloudflare Workers** → **Run workflow**

GitHub Actions will automatically:

```
✅ Install dependencies
✅ Create D1 database (skip if exists)
✅ Resolve and bind database ID
✅ Set admin secrets
✅ Deploy Worker to Cloudflare's edge network
```

### Step 5: Verify

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages**
2. Click `fishblog` to find your URL (e.g. `https://fishblog.xxx.workers.dev`)
3. Visit the link — you should see your blog homepage

| Page | URL |
|------|-----|
| Blog Home | `https://fishblog.<your-subdomain>.workers.dev` |
| Admin Panel | `https://fishblog.<your-subdomain>.workers.dev/admin` |
| RSS Feed | `https://fishblog.<your-subdomain>.workers.dev/feed.xml` |

> Database tables are auto-created on first visit (may take 1-2 seconds).

### Custom Domain (Optional)

1. Cloudflare Dashboard → **Workers & Pages** → click `fishblog`
2. **Settings** → **Domains & Routes** → **Add** → **Custom Domain**
3. Enter your domain (e.g. `blog.example.com`) — DNS and HTTPS are configured automatically

## 📖 Usage

### Writing Posts

1. Go to `/admin` and log in
2. Click **+ 新建文章** (New Post)
3. Fill in title, slug (URL path, e.g. `hello-world`)
4. Choose a category (optional), add tags (comma-separated, optional)
5. Write content in Markdown, choose **Publish** or **Draft**
6. Click **保存** (Save)

### Categories

Go to Admin → **分类** (Categories) to create parent and child categories. The homepage sidebar shows the category tree for filtering.

### Tags

Add comma-separated tags to posts (e.g. `tech, cloudflare, tutorial`). Tags appear on post pages as clickable `#tag` links.

### Site Settings

Admin → **设置** (Settings): change blog title, description, footer text, and upload a favicon.

### REST API

Generate API keys in Admin → **API Keys** with granular permissions.

Include `Authorization: Bearer YOUR_API_KEY` in request headers.

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| `GET` | `/api/posts` | read | List posts (`?page=`, `?category_id=`, `?all=true`) |
| `GET` | `/api/posts/:slug` | read | Get post by slug (includes tags) |
| `POST` | `/api/posts` | create | Create post |
| `PUT` | `/api/posts/:id` | update | Update post |
| `DELETE` | `/api/posts/:id` | delete | Delete post |
| `GET` | `/api/categories` | read | Get category tree |

**Create post example:**

```bash
curl -X POST https://your-blog.workers.dev/api/posts \
  -H "Authorization: Bearer fb_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Hello World",
    "slug": "hello-world",
    "content": "# Hello\n\nThis is my first post.",
    "tags": ["tech", "blog"],
    "published": 1
  }'
```

## 💻 Local Development

```bash
git clone https://github.com/qqzhoufan/fishblog.git
cd fishblog
cp wrangler.toml.example wrangler.toml
npm install
echo -e 'ADMIN_USERNAME=admin\nADMIN_PASSWORD=123456' > .dev.vars
npm run dev
```

Visit http://localhost:8787 — hot reload enabled.

## 📁 Project Structure

```
fishblog/
├── src/
│   ├── index.ts              # Entry point, auto-migration middleware
│   ├── types.ts              # TypeScript type definitions
│   ├── routes/
│   │   ├── blog.ts           # Frontend: home, posts, archive, search, tags, RSS
│   │   ├── admin.ts          # Admin: posts, categories, API keys, settings
│   │   └── api.ts            # REST API for external integrations
│   ├── templates/
│   │   ├── layout.ts         # Frontend template (responsive + dark/light + sidebar)
│   │   └── admin.ts          # Admin template
│   ├── middleware/
│   │   └── auth.ts           # Cookie auth + API key verification
│   └── db/
│       ├── migrate.ts        # Incremental auto-migration
│       └── queries.ts        # Database query layer
├── .github/workflows/
│   └── deploy.yml            # GitHub Actions auto-deploy pipeline
├── wrangler.toml.example     # Wrangler config template
├── tsconfig.json
├── package.json
├── README.md                 # 中文文档
└── README_EN.md              # English documentation
```

## ❓ FAQ

**Q: Is it really free?**
A: Yes. Cloudflare Workers Free Plan: 100K requests/day. D1 Free Plan: 5GB storage + 5M row reads/day. More than enough for personal blogs.

**Q: Is my data secure?**
A: Admin passwords are stored in Cloudflare Secrets (encrypted). Auth uses SHA-256 hashing + HttpOnly cookies. API keys are also stored as hashes only.

**Q: How much traffic can it handle?**
A: Workers run on 300+ edge nodes globally. Free plan: 100K requests/day. Paid plans: unlimited.

**Q: How to backup data?**
A: Export from Cloudflare Dashboard → D1 → fishblog-db, or use `wrangler d1 export`.

**Q: How to change admin password?**
A: Update `ADMIN_PASSWORD` in GitHub Settings → Secrets, then re-run the Actions workflow.

**Q: How to integrate AI writing tools?**
A: Generate an API key with `create` permission in the admin panel, then use `POST /api/posts` to publish articles programmatically.

## License

[MIT](LICENSE)
