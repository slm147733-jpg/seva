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
  service_ids: string[];
}

export interface SetupStatus {
  needs_setup: boolean;
}

export interface UserCreate {
  name: string;
  mobile: string;
  password: string;
  role: Role;
  service_ids: string[];
}

export interface UserUpdate {
  name?: string;
  mobile?: string;
  role?: Role;
  is_active?: boolean;
  service_ids?: string[];
}

// backend/models/service.py
export interface ServiceIn {
  name: string;
  description: string;
  is_active: boolean;
}

export interface Service extends ServiceIn {
  id: string;
  created_at: string;
  user_count: number;
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

// backend/models/attachment.py
export type FileStatus = "not_started" | "seen" | "processing" | "generated";

export interface FileMeta {
  file_id: string;
  filename: string;
  content_type: string;
  size: number;
}

export interface AttachmentOut {
  id: string;
  user_id: string;
  user_name: string;
  user_mobile: string;
  service_id: string | null;
  service_name: string;
  file: FileMeta;
  status: FileStatus;
  created_at: string;
  seen_at: string | null;
  processing_at: string | null;
  generated_at: string | null;
  last_event_at: string;
  last_event_role: Role;
  last_event_text: string;
  unread: boolean;
  message_count: number;
}

export interface AttachmentList {
  server_time: string;
  items: AttachmentOut[];
}

export interface MessageOut {
  id: string;
  attachment_id: string;
  sender_id: string;
  sender_name: string;
  sender_role: Role;
  text: string;
  file: FileMeta | null;
  is_receipt: boolean;
  created_at: string;
}

export interface AttachmentDetail {
  server_time: string;
  attachment: AttachmentOut;
  messages: MessageOut[];
}

export interface BulkDelete {
  ids: string[];
}

export interface DeleteResult {
  deleted: number;
}

// backend/models/report.py
export interface DayRow {
  date: string;
  received: number;
  seen: number;
  generated: number;
  avg_minutes: number | null;
}

export interface StatusCounts {
  not_started: number;
  seen: number;
  processing: number;
  generated: number;
}

export interface DailyReport {
  today: string;
  days: DayRow[];
  current: StatusCounts;
  total_received: number;
  total_generated: number;
  avg_minutes: number | null;
}

export interface WhatsAppAlert {
  id: string;
  user_id: string;
  user_name: string;
  mobile: string;
  attachment_id: string;
  message: string;
  status: "not_connected" | "sent" | "failed";
  detail: string;
  created_at: string;
}
