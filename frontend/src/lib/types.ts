// Hand-written mirrors of backend/models/*.py — keep in sync.
export type Role = "admin" | "user";
export type Audience = "public" | "users" | "both";

export interface UserOut {
  id: string;
  name: string;
  mobile: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

export interface SetupStatus {
  needs_setup: boolean;
}

export interface UserCreate {
  name: string;
  mobile: string;
  password: string;
  role: Role;
}

export interface UserUpdate {
  name?: string;
  mobile?: string;
  role?: Role;
  is_active?: boolean;
}

export interface Stats {
  total_users: number;
  active_users: number;
  inactive_users: number;
  admins: number;
  pages: number;
  links: number;
  recent_logins: UserOut[];
}

export interface Ok {
  ok: boolean;
}

export interface PageIn {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  show_in_nav: boolean;
  order: number;
}

export interface Page extends PageIn {
  id: string;
  updated_at: string;
}

export interface LinkIn {
  title: string;
  url: string;
  description: string;
  category: string;
  audience: Audience;
  is_active: boolean;
  order: number;
}

export interface Link extends LinkIn {
  id: string;
  created_at: string;
}

export interface Settings {
  site_name: string;
  tagline: string;
  hero_title: string;
  hero_subtitle: string;
  announcement: string;
  helpline: string;
  email: string;
  address: string;
}

export interface SiteData {
  settings: Settings;
  nav_pages: Page[];
  links: Link[];
}
