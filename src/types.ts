export type Env = {
  DB: D1Database;
  BLOG_TITLE: string;
  BLOG_DESCRIPTION: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
};

export type Post = {
  id: number;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  published: number;
  created_at: string;
  updated_at: string;
};

export type SiteConfig = {
  key: string;
  value: string;
};
