# FishBlog 🐟

A lightweight blog built on Cloudflare Workers and D1. Write in Markdown, manage posts and comments in a browser, or connect an external writing tool through the REST API.

[中文](README.md)

## Features

- **Writing and reading:** Markdown posts, drafts, publishing, pinned posts, excerpts, view counts, and image previews.
- **Discovery:** Two-level categories, tags, search, archives, RSS, sitemap, and SEO metadata.
- **Comments:** Visitors can comment without an account; administrators can review, delete, and reply to comments.
- **Optional notifications:** Configure an email provider to notify the administrator of new comments and, with a visitor's consent, send reply notifications. Comments and replies work without email configuration.
- **Site settings:** Set the title, description, footer, and favicon; light and dark themes follow the system setting.
- **REST API:** Issue API keys with separate read, create, update, and delete permissions.
- **Deployment and security:** GitHub Actions deployment, expiring and revocable admin sessions, login and comment rate limits, and sanitized HTML rendering.

FishBlog does not require a paid service. A low-traffic site may fit within Cloudflare's free allowances. Email is disabled by default; provider quotas, domain costs, and overage policies depend on your account and should be checked before enabling it.

## Deploy

1. Fork this repository.
2. Obtain your Cloudflare Account ID and create an API token with Workers and D1 edit permissions.
3. In your fork, open **Settings → Secrets and variables → Actions** and add:

| GitHub Secret | Purpose |
| --- | --- |
| `CF_API_TOKEN` | Cloudflare API token |
| `CF_ACCOUNT_ID` | Cloudflare Account ID |
| `ADMIN_USERNAME` | Administrator username |
| `ADMIN_PASSWORD` | Strong administrator password |

Run **Deploy to Cloudflare Workers** in GitHub Actions or push to `main`. The workflow installs dependencies, runs checks, creates or finds `fishblog-db`, configures admin credentials, and deploys the Worker. Database tables are initialized on the first request.

| Page | Path |
| --- | --- |
| Home | `/` |
| Admin | `/admin` |
| RSS | `/feed.xml` |
| Sitemap | `/sitemap.xml` |

Find your Worker URL in the Cloudflare dashboard and optionally add a custom domain. Before updating an existing blog, back up D1 and verify the upgrade against an isolated copy.

## Usage

Sign in at `/admin` to create Markdown posts, publish or save drafts, pin posts, and manage categories and tags. Ordinary images in posts can be opened in a preview; images already linked to another URL retain their link behavior.

HTML in posts and the footer is sanitized for display. Common Markdown, links, images, and tables are supported; scripts, event handlers, and embeds such as iframes are removed. The original stored content is not changed. Check custom HTML against a copy of existing content before upgrading.

Visitors can leave comments without registering. Use **Comments** in the admin panel to review, delete, or reply. Turning off comments does not delete existing ones. Email addresses are optional and used only for requested notifications. Under **Settings**, update the blog title, description, footer, or favicon (maximum 1.4 MB).

### Optional: email notifications

Email is disabled by default. FishBlog uses the [Resend](https://resend.com/) email API, which requires a Resend account, a verified sending domain, and an API key. Free plans have quotas, and a domain may cost money. Review [Resend's current pricing and limits](https://resend.com/pricing), including other applications sharing the account, before enabling it. FishBlog does not purchase or upgrade plans.

Add the following as GitHub Actions Secrets and run the deployment workflow, or set them directly as encrypted Secrets under the Worker's **Settings → Variables and Secrets** in Cloudflare:

| Secret | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Resend API key with sending permission only; never commit it |
| `MAIL_FROM` | Full sender address under a verified Resend domain, e.g. `blog@example.com` |
| `SITE_URL` | Public blog URL, e.g. `https://blog.example.com`, used for email links |
| `ADMIN_NOTIFY_EMAIL` | Administrator's new-comment recipient; omit for visitor reply notifications only |

With the first three configured, visitors who provide an email and opt in can receive reply notifications. Configure the fourth to notify the administrator of new comments. The email provider receives the recipient address and message content; visitor emails are not exposed in public pages or the comments API.

To limit usage, the site attempts at most 80 emails per UTC calendar day, including failed attempts. Failed delivery never rolls back a comment or reply. Pending and failed counts appear in **Comments**; new events trigger processing and an administrator can retry manually. There is no scheduled delivery job, so retries do not run automatically while the site is idle. Processing removes notification records older than seven days; emails that have already been attempted will not be resent after the safe retry window, and delivery is not guaranteed.

To disable email, remove `RESEND_API_KEY` from the **Cloudflare Worker Secrets**, or run `wrangler secret delete RESEND_API_KEY`. If the GitHub Actions Secret was also configured, remove it from GitHub too to prevent a later deployment from restoring it. Removing it from GitHub alone does not remove the existing Cloudflare Secret. Existing comments, replies, and stored emails are retained.

## REST API

Create API keys under **API Keys** and grant only the required `read`, `create`, `update`, or `delete` permissions. Send `Authorization: Bearer YOUR_API_KEY` with each request. Read access also permits access to drafts, so share such keys only with trusted integrations.

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/posts` | `read` | List posts; supports `page`, `category_id`, `all=true` |
| `GET` | `/api/posts/:slug` | `read` | Get a post and tags |
| `GET` | `/api/posts/:slug/comments` | `read` | Get comments |
| `POST` | `/api/posts` | `create` | Create a post |
| `PUT` | `/api/posts/:id` | `update` | Update a post |
| `DELETE` | `/api/posts/:id` | `delete` | Delete a post |
| `GET` | `/api/categories` | `read` | Get the category tree |
| `POST` | `/api/categories` | `create` | Create a category |
| `PUT` | `/api/categories/:id` | `update` | Update a category |
| `DELETE` | `/api/categories/:id` | `delete` | Delete a category |

```bash
curl -X POST https://your-blog.workers.dev/api/posts \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"title":"Hello World","slug":"hello-world","content":"# Hello","tags":["blog"],"published":1}'
```

## Local development and tests

Requires Node.js 22:

```bash
git clone https://github.com/qqzhoufan/fishblog.git
cd fishblog
cp wrangler.toml.example wrangler.toml
npm ci
printf 'ADMIN_USERNAME=admin\nADMIN_PASSWORD=local-password\n' > .dev.vars
npm run dev
```

Visit `http://localhost:8787`. Do not commit `.dev.vars` or Wrangler's local data. The example D1 ID is a placeholder; replace it before deploying to your account.

```bash
npm run typecheck
npm test
```

Tests use isolated temporary databases and do not access production data. The `main` deployment workflow runs these checks as well.

## Backup and upgrades

Export a D1 backup from the Cloudflare dashboard or with Wrangler. Before deploying an update, restore a copy in an isolated environment and verify existing posts, custom HTML, login, comments, and API integrations. Store admin credentials, API keys, and D1 backups securely.

## Project structure

```text
src/
  db/           Database initialization and queries
  middleware/   Admin sessions and request rate limits
  routes/       Blog, admin, and API routes
  services/     Optional email notifications and outbox
  templates/    Page templates and HTML sanitization
  index.ts      Worker entry point
tests/          Isolated database and Worker regression tests
.github/        GitHub Actions deployment workflow
```
