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
  category_id: number | null;
  published: number;
  is_pinned: number;
  views: number;
  created_at: string;
  updated_at: string;
  category_name?: string;
  comment_count?: number;
};

export type Comment = {
  id: number;
  post_id: number;
  author: string;
  content: string;
  created_at: string;
};

export type Category = {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  sort_order: number;
  children?: Category[];
  post_count?: number;
};

export type ApiKey = {
  id: number;
  name: string;
  key_hash: string;
  permissions: string;
  created_at: string;
  last_used_at: string | null;
};

export type SiteConfig = {
  key: string;
  value: string;
};
