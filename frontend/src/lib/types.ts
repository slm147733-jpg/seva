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
  wallet_balance: number;
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
  fee: number;
  required_documents: string[];
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
export type FileStatus = "not_started" | "seen" | "processing" | "generated" | "rejected";

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
  service_fee: number | null;
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
  missing_documents: string[];
  missing_resolved: string[];
  rejected_at: string | null;
  reject_reason: string;
  fee_charged: number;
  fee_refunded: boolean;
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
  for_document: string | null;
  created_at: string;
}

export interface AttachmentDetail {
  server_time: string;
  attachment: AttachmentOut;
  messages: MessageOut[];
  service_required_documents: string[];
}

export interface MissingRequest {
  documents: string[];
  note: string;
}

export interface BulkDelete {
  ids: string[];
}

export interface DeleteResult {
  deleted: number;
  refunded: number;
}

export interface RejectFileIn {
  reason: string;
}

// backend/models/report.py
export interface DayRow {
  date: string;
  received: number;
  seen: number;
  generated: number;
  avg_minutes: number | null;
  rejected: number;
  fees_collected: number;
  refunds: number;
  net_fees: number;
}

export interface StatusCounts {
  not_started: number;
  seen: number;
  processing: number;
  generated: number;
  rejected: number;
}

export interface DailyReport {
  today: string;
  days: DayRow[];
  current: StatusCounts;
  total_received: number;
  total_generated: number;
  avg_minutes: number | null;
  total_fees_collected: number;
  total_refunds: number;
  total_net_fees: number;
}

export interface ServiceIncome {
  service_id: string | null;
  service_name: string;
  files: number;
  fees_collected: number;
  refunds: number;
  net: number;
}

export interface MonthIncome {
  month: string;
  fees_collected: number;
  refunds: number;
  net: number;
  services: ServiceIncome[];
}

export interface MonthlyIncome {
  months: MonthIncome[];
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

// backend/models/wallet.py
export interface WalletTxn {
  id: string;
  user_id: string;
  user_name: string;
  user_mobile: string;
  type: "credit" | "debit";
  amount: number;
  reason: string;
  balance_after: number;
  created_by: string;
  attachment_id: string | null;
  category: "fee" | "refund" | "topup" | "adjust";
  service_id: string | null;
  created_at: string;
}

export interface WalletRequestIn {
  amount: number | null;
  txn_last5: string;
}

export interface WalletRequest {
  id: string;
  user_id: string;
  user_name: string;
  user_mobile: string;
  amount: number | null;
  txn_last5: string;
  status: "pending" | "approved" | "rejected";
  credited_amount: number | null;
  admin_note: string;
  created_at: string;
  resolved_at: string | null;
}

export interface PaymentInfo {
  upi_id: string;
  payee_name: string;
  has_qr_image: boolean;
  deduct_fees: boolean;
}

export interface WalletMe {
  balance: number;
  payment: PaymentInfo;
  transactions: WalletTxn[];
  requests: WalletRequest[];
  usual_fee: number;
  usual_service_name: string;
}

export interface WalletSettingsIn {
  upi_id: string;
  payee_name: string;
  deduct_fees: boolean;
}

export interface AdjustIn {
  amount: number;
  direction: "add" | "remove";
  reason: string;
}

export interface ApproveIn {
  amount: number;
  note: string;
}

export interface RejectIn {
  note: string;
}
