// Supabase data layer for the static (Hostinger) build. It answers the same "/api/..." paths the screens
// already call, so every feature keeps working without a server. Only the public/publishable key is used here;
// all money and status changes run inside Postgres functions protected by Row Level Security.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_MODE = Boolean(import.meta.env.VITE_SUPABASE_URL);
let sb: SupabaseClient | null = null;
const client = () =>
  (sb ??= createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string));

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export class SbError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.body = { detail };
  }
}
const fail = (status: number, detail: string): never => {
  throw new SbError(status, detail);
};
async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) fail(error.code === "P0402" ? 402 : error.code === "42501" ? 403 : 400, error.message);
  return data as T;
}
const rpc = <T = any>(fn: string, args: Json = {}) => q<T>(client().rpc(fn, args)); // eslint-disable-line @typescript-eslint/no-explicit-any
const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();

// ---------- signed file URLs (private bucket) ----------
const signed = new Map<string, string>();
export const signedUrl = (path: string) => signed.get(path) ?? "";
async function sign(paths: string[]) {
  const todo = [...new Set(paths.filter((p) => p && !signed.has(p)))];
  if (!todo.length) return;
  const { data } = await client().storage.from("uploads").createSignedUrls(todo, 3600);
  data?.forEach((d) => d.signedUrl && d.path && signed.set(d.path, d.signedUrl));
}
let qrData = "";
export const qrImage = () => qrData;

// ---------- session / profile ----------
let cached: Json | null = null;
async function me(): Promise<Json> {
  const { data } = await client().auth.getSession();
  if (!data.session) fail(401, "Not authenticated");
  const p = await q<Json>(client().from("profiles").select("*").eq("id", data.session!.user.id).maybeSingle());
  if (!p || !p.is_active) {
    await client().auth.signOut();
    fail(401, "Account unavailable");
  }
  cached = { ...p, wallet_balance: Number(p.wallet_balance) };
  return cached!;
}
const isAdmin = (u: Json) => u.role === "admin";

// ---------- shaping (mirrors the old server's output) ----------
const PROCESSING_MS = 60_000;
function attOut(d: Json, role: string): Json {
  const now = Date.now();
  const seen = d.seen_at ? Date.parse(d.seen_at) : null;
  const procAt = seen ? seen + PROCESSING_MS : null;
  const status = d.rejected_at ? "rejected" : d.generated_at ? "generated" : seen && now >= procAt! ? "processing" : seen ? "seen" : "not_started";
  return {
    service_name: "General", service_fee: null, missing_documents: [], missing_resolved: [], reject_reason: "",
    fee_refunded: false, resubmit_of: null, resubmitted_as: null, paused_at: null, receipt_number: null,
    receipt_name: null, receipt_ocr: null, rejected_at: null, generated_at: null, seen_at: null, ...d,
    status, processing_at: procAt && !d.generated_at && now >= procAt ? new Date(procAt).toISOString() : null,
    unread: Boolean(role === "admin" ? d.unread_admin : d.unread_user),
    fee_charged: Number(d.fee_charged || 0), paused_seconds: Number(d.paused_seconds || 0),
  };
}
const docs = async (table: string, order = "created_at") =>
  (await q<Json[]>(client().from(table).select("doc").order(order, { ascending: false }))).map((r) => r.doc);

async function upload(owner: string, file: File | Blob, name: string) {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";
  const ext = safe.split(".").pop()!.toLowerCase();
  const type = file.type || (ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg");
  if (!["application/pdf", "image/png", "image/jpeg"].includes(type)) fail(400, `${name}: only PDF, JPG, JPEG or PNG files are allowed`);
  if (file.size > 10 * 1024 * 1024) fail(400, `${name}: file is larger than 10 MB`);
  const path = `${owner}/${uuid()}-${safe}`;
  await q(client().storage.from("uploads").upload(path, file, { contentType: type }));
  return { file_id: path, filename: name, content_type: type, size: file.size };
}

// ---------- receipt reading in the browser (offline OCR) ----------
async function readReceipt(attId: string, msgId: string, file: File) {
  let number: string | null = null, name: string | null = null;
  try {
    if (file.type.startsWith("image/")) {
      const { default: Tesseract } = await import("tesseract.js");
      const { data } = await Tesseract.recognize(file, "eng");
      const lines = data.text.split("\n").map((l) => l.trim()).filter(Boolean);
      const NUM = /(application|appln|appl|acknowledge?ment|ack|enrol+ment|request|reference|ref|urn|token|receipt)\s*(no|number|num|id|#)?\.?\s*[:\-=]?\s*/i;
      const NAME = /(applicant|citizen|customer|candidate|resident|beneficiary)?\s*'?s?\s*name\s*(of\s*the\s*applicant)?\s*[:\-=]\s*/i;
      lines.forEach((l, i) => {
        const m = !number && l.match(NUM);
        if (m) {
          const rest = l.slice(m.index! + m[0].length) || lines[i + 1] || "";
          const v = rest.match(/[A-Z0-9][A-Z0-9/-]{4,39}/i)?.[0];
          if (v && (v.match(/\d/g)?.length ?? 0) >= 4) number = v.toUpperCase();
        }
        const n = !name && !/father|mother|husband|guardian|s\/o|d\/o|w\/o/i.test(l) && l.match(NAME);
        if (n) {
          const v = (l.slice(n.index! + n[0].length) || "").split(/\s{2,}|\b(age|gender|mobile|date|dob)\b/i)[0].replace(/[^A-Za-z .]/g, "").trim();
          if (v.length >= 2 && v.length <= 60) name = v.toUpperCase();
        }
      });
    }
  } catch {
    /* unreadable — recorded as not found */
  }
  await rpc("admin_set_receipt_ocr", { p_att: attId, p_msg: msgId, p_number: number, p_name: name });
}

// ---------- reports (IST days) ----------
const IST = 330 * 60_000;
const istDay = (iso: string) => new Date(Date.parse(iso) + IST).toISOString().slice(0, 10);
const istMonth = (iso: string) => istDay(iso).slice(0, 7);
const r2 = (n: number) => Math.round(n * 100) / 100;
const isFee = (t: Json) => t.category === "fee" || (!t.category && t.type === "debit" && t.created_by === "system" && /^Fee:/.test(t.reason));
const isTopup = (t: Json) => t.type === "credit" && (t.category === "topup" || (!t.category && /^Payment verified/.test(t.reason)));

async function dailyReport(days: number, serviceId: string | null) {
  const atts = (await docs("attachments")).filter((d) => !serviceId || d.service_id === serviceId);
  const txns = await docs("wallet_transactions");
  const today = istDay(nowIso());
  const keys = Array.from({ length: days }, (_, i) => istDay(new Date(Date.parse(today) - i * 86400000).toISOString()));
  const row = () => ({ received: 0, seen: 0, generated: 0, rejected: 0, durs: [] as number[], fees: 0, refunds: 0, topups: 0 });
  const by: Record<string, ReturnType<typeof row>> = Object.fromEntries(keys.map((k) => [k, row()]));
  const cur = { not_started: 0, seen: 0, processing: 0, generated: 0, rejected: 0 };
  const all: number[] = [];
  for (const d of atts) {
    const o = attOut(d, "admin");
    cur[o.status as keyof typeof cur]++;
    by[istDay(d.created_at)] && by[istDay(d.created_at)].received++;
    if (d.seen_at && by[istDay(d.seen_at)]) by[istDay(d.seen_at)].seen++;
    if (d.rejected_at) { if (by[istDay(d.rejected_at)]) by[istDay(d.rejected_at)].rejected++; }
    else if (d.generated_at) {
      const mins = Math.max(0, (Date.parse(d.generated_at) - Date.parse(d.created_at)) / 1000 - Number(d.paused_seconds || 0)) / 60;
      if (by[istDay(d.generated_at)]) { by[istDay(d.generated_at)].generated++; by[istDay(d.generated_at)].durs.push(mins); all.push(mins); }
    }
  }
  for (const t of txns) {
    const b = by[istDay(t.created_at)];
    if (!b) continue;
    if (isTopup(t)) b.topups += t.amount;
    if (serviceId && t.service_id !== serviceId) continue;
    if (t.category === "refund") b.refunds += t.amount;
    else if (isFee(t)) b.fees += t.amount;
  }
  const avg = (xs: number[]) => (xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const rows = keys.map((k) => ({ date: k, received: by[k].received, seen: by[k].seen, generated: by[k].generated, avg_minutes: avg(by[k].durs),
    rejected: by[k].rejected, fees_collected: r2(by[k].fees), refunds: r2(by[k].refunds), net_fees: r2(by[k].fees - by[k].refunds), topups: r2(by[k].topups) }));
  const sum = (f: (r: (typeof rows)[0]) => number) => r2(rows.reduce((a, r) => a + f(r), 0));
  return { today, days: rows, current: cur, total_received: sum((r) => r.received), total_generated: sum((r) => r.generated), avg_minutes: avg(all),
    total_fees_collected: sum((r) => r.fees_collected), total_refunds: sum((r) => r.refunds), total_net_fees: sum((r) => r.net_fees), total_topups: sum((r) => r.topups) };
}

const lastMonths = (n: number) => {
  const out: string[] = [];
  const d = new Date(Date.parse(nowIso()) + IST);
  for (let i = 0; i < n; i++) out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  return out;
};
async function monthlyIncome(n: number) {
  const txns = (await docs("wallet_transactions")).filter((t) => t.category === "refund" || isFee(t));
  const names: Record<string, string> = Object.fromEntries((await docs("services")).map((s) => [s.id, s.name]));
  (await docs("attachments")).forEach((a) => a.service_id && !names[a.service_id] && (names[a.service_id] = a.service_name || "Deleted service"));
  return { months: lastMonths(n).map((month) => {
    const agg: Record<string, { fees: number; refunds: number; files: number; name: string; sid: string | null }> = {};
    txns.filter((t) => istMonth(t.created_at) === month).forEach((t) => {
      const legacy = (t.reason || "").slice(4).split(" × ")[0].trim() || "Other";
      const sid = t.service_id || Object.keys(names).find((k) => names[k] === legacy) || `legacy:${legacy}`;
      const a = (agg[sid] ??= { fees: 0, refunds: 0, files: 0, name: names[sid] || legacy, sid: sid.startsWith("legacy:") ? null : sid });
      if (t.category === "refund") a.refunds += t.amount;
      else { a.fees += t.amount; a.files += parseInt((t.reason || "").split("× ")[1]) || 1; }
    });
    const services = Object.values(agg).map((a) => ({ service_id: a.sid, service_name: a.name, files: a.files, fees_collected: r2(a.fees),
      refunds: r2(a.refunds), net: r2(a.fees - a.refunds) })).sort((x, y) => y.net - x.net);
    const fees = r2(services.reduce((s, x) => s + x.fees_collected, 0)), refunds = r2(services.reduce((s, x) => s + x.refunds, 0));
    return { month, fees_collected: fees, refunds, net: r2(fees - refunds), services };
  }) };
}
export async function printMonthlyIncome(month: string) {
  const m = (await monthlyIncome(24)).months.find((x) => x.month === month);
  const w = window.open("", "_blank");
  if (!m || !w) return;
  const rs = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  w.document.write(`<html><head><title>Income by service ${month}</title><style>body{font-family:sans-serif;padding:24px}h1{color:#EA580C}
  table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:right}td:nth-child(2),th:nth-child(2){text-align:left}
  th{background:#EA580C;color:#fff}</style></head><body><h1>Sevakendra</h1><h3>Monthly income by service — ${month}</h3>
  <p>Fees ${rs(m.fees_collected)} · Refunded ${rs(m.refunds)} · <b>Net ${rs(m.net)}</b></p><table><tr><th>#</th><th>Service</th><th>Files</th>
  <th>Fees</th><th>Refunded</th><th>Net</th></tr>${m.services.map((s, i) => `<tr><td>${i + 1}</td><td>${s.service_name}</td><td>${s.files}</td>
  <td>${rs(s.fees_collected)}</td><td>${rs(s.refunds)}</td><td>${rs(s.net)}</td></tr>`).join("")}</table>
  <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

// ---------- router ----------
const byOrder = (a: Json, b: Json) => (a.order ?? 0) - (b.order ?? 0);
const crud = async (table: string, method: string, id: string | undefined, body: Json, extra: Json = {}) => {
  if (method === "GET") return (await docs(table)).sort(byOrder);
  if (method === "DELETE") return q(client().from(table).delete().eq("id", id!)).then(() => ({ ok: true }));
  const prev = id ? (await q<Json>(client().from(table).select("doc").eq("id", id).maybeSingle()))?.doc : null;
  const doc = { ...(prev ?? { id: uuid(), created_at: nowIso(), ...extra }), ...body, updated_at: nowIso() };
  await q(client().from(table).upsert({ id: doc.id, doc }));
  return doc;
};

export async function handle(method: string, fullPath: string, body: any): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const [path, qs] = fullPath.split("?");
  const params = new URLSearchParams(qs);
  const seg = path.split("/").filter(Boolean);
  const form = body instanceof FormData ? body : null;
  const b: Json = form ? {} : (body ?? {});
  const M = method;

  // public
  if (path === "/site") {
    const [s, pages, links] = await Promise.all([q<Json>(client().from("site_settings").select("doc").eq("key", "site").maybeSingle()), docs("pages"), docs("links")]);
    return { settings: s?.doc ?? {}, nav_pages: pages.filter((p) => p.show_in_nav).sort(byOrder), links: links.filter((l) => l.is_active && ["public", "both"].includes(l.audience)).sort(byOrder) };
  }
  if (seg[0] === "pages") return (await docs("pages")).find((p) => p.slug === seg[1]) ?? fail(404, "Page not found");
  if (path === "/auth/setup-status") return { needs_setup: await rpc<boolean>("needs_setup") };
  if (path === "/auth/setup") fail(403, "Admin already set up. Please log in.");
  if (path === "/auth/login") {
    const email = await rpc<string | null>("login_email", { p_mobile: b.mobile });
    const { error } = email ? await client().auth.signInWithPassword({ email, password: b.password }) : { error: true };
    if (error) fail(401, "Invalid mobile number or password");
    const u = await me().catch(() => fail(403, "Your account is deactivated. Contact the admin."));
    await rpc("touch_login");
    return u;
  }
  if (path === "/auth/logout") { await client().auth.signOut(); cached = null; return { ok: true }; }

  const u = await me();
  const admin = isAdmin(u);
  if (seg[0] === "admin" && !admin) fail(403, "Admin access required");

  // auth / profile
  if (path === "/auth/me") {
    if (M === "PUT") { await rpc("update_my_name", { p_name: b.name }); return me(); }
    return u;
  }
  if (path === "/auth/me/password") {
    const { error } = await client().auth.signInWithPassword({ email: u.email, password: b.current_password });
    if (error) fail(400, "Current password is incorrect");
    await q(client().auth.updateUser({ password: b.new_password }) as never);
    return { ok: true };
  }
  if (path === "/auth/me/links") return (await docs("links")).filter((l) => l.is_active && ["users", "both"].includes(l.audience)).sort(byOrder);

  // services
  if (path === "/services/mine") return (await docs("services")).filter((s) => s.is_active !== false && u.service_ids.includes(s.id)).sort((a, x) => a.name.localeCompare(x.name));
  if (seg[1] === "services") {
    if (M === "GET") {
      const users = await q<Json[]>(client().from("profiles").select("service_ids"));
      return (await docs("services")).map((s) => ({ ...s, user_count: users.filter((x) => x.service_ids.includes(s.id)).length })).sort((a, x) => a.name.localeCompare(x.name));
    }
    return crud("services", M, seg[2], b, { is_active: true, user_count: 0 });
  }
  if (seg[1] === "pages") return crud("pages", M, seg[2], b);
  if (seg[1] === "links") return crud("links", M, seg[2], b);
  if (path === "/admin/settings") { await q(client().from("site_settings").upsert({ key: "site", doc: b })); return b; }
  if (path === "/admin/reject-reasons") {
    if (M === "PUT") { const reasons = [...new Set((b.reasons as string[]).map((r) => r.trim()).filter(Boolean))]; await q(client().from("site_settings").upsert({ key: "reject_reasons", doc: { reasons } })); return { reasons }; }
    const r = await q<Json>(client().from("site_settings").select("doc").eq("key", "reject_reasons").maybeSingle());
    return { reasons: r?.doc?.reasons ?? ["Blurry photo", "Wrong document", "Document incomplete", "Details don't match", "Document expired", "Wrong service selected"] };
  }

  // users
  if (seg[1] === "users") {
    const out = (p: Json) => ({ ...p, wallet_balance: Number(p.wallet_balance) });
    if (M === "GET") return (await q<Json[]>(client().from("profiles").select("*").order("created_at", { ascending: false }))).map(out);
    if (M === "POST" && !seg[2]) return out(await rpc("admin_create_user", { p_name: b.name, p_mobile: b.mobile, p_password: b.password, p_role: b.role, p_services: b.service_ids ?? [] }));
    if (seg[3] === "reset-password") { await rpc("admin_reset_password", { p_user: seg[2], p_password: b.new_password }); return { ok: true }; }
    if (M === "PUT") return out(await rpc("admin_update_user", { p_user: seg[2], p_patch: b }));
    if (M === "DELETE") { await rpc("admin_delete_user", { p_user: seg[2] }); return { ok: true }; }
  }
  if (path === "/admin/stats") {
    const [ps, pages, links] = await Promise.all([q<Json[]>(client().from("profiles").select("*")), docs("pages"), docs("links")]);
    return { total_users: ps.length, active_users: ps.filter((p) => p.is_active).length, inactive_users: ps.filter((p) => !p.is_active).length,
      admins: ps.filter((p) => p.role === "admin").length, pages: pages.length, links: links.length,
      recent_logins: ps.filter((p) => p.last_login).sort((a, x) => x.last_login.localeCompare(a.last_login)).slice(0, 5) };
  }

  // wallet
  const walletInfo = async () => {
    const w = (await q<Json>(client().from("site_settings").select("doc").eq("key", "wallet").maybeSingle()))?.doc ?? {};
    qrData = w.qr_data_url || "";
    return { upi_id: w.upi_id || "", payee_name: w.payee_name || "", has_qr_image: Boolean(w.qr_data_url), deduct_fees: Boolean(w.deduct_fees), _doc: w };
  };
  const pub = ({ _doc, ...p }: Json) => p; // eslint-disable-line @typescript-eslint/no-unused-vars
  if (path === "/wallet/me") {
    const [txns, reqs, svc, atts] = await Promise.all([docs("wallet_transactions"), docs("wallet_requests"), docs("services"), docs("attachments")]);
    const mine = svc.filter((s) => u.service_ids.includes(s.id) && s.is_active !== false && s.fee > 0);
    const counts: Record<string, number> = {};
    atts.forEach((a) => (counts[a.service_id] = (counts[a.service_id] || 0) + 1));
    const pick = mine.sort((a, x) => (counts[x.id] || 0) - (counts[a.id] || 0) || x.fee - a.fee)[0];
    return { balance: u.wallet_balance, payment: pub(await walletInfo()), transactions: txns.slice(0, 50), requests: reqs.slice(0, 20),
      usual_fee: pick ? r2(pick.fee) : 0, usual_service_name: pick?.name ?? "" };
  }
  if (path === "/wallet/requests") return rpc("wallet_request", { p_amount: b.amount ?? null, p_last5: b.txn_last5 });
  if (path === "/admin/wallet/requests") {
    const all = await docs("wallet_requests");
    const list = params.get("status") ? all.filter((r) => r.status === params.get("status")) : all;
    return list.map((r) => ({ ...r, duplicates: all.filter((o) => o.txn_last5 === r.txn_last5 && o.user_id !== r.user_id && o.status !== "rejected")
      .map((o) => ({ request_id: o.id, user_name: o.user_name, user_mobile: o.user_mobile, status: o.status, credited_amount: o.credited_amount, created_at: o.created_at })) }));
  }
  if (seg[2] === "requests" && seg[4]) return rpc("admin_wallet_resolve", { p_req: seg[3], p_approve: seg[4] === "approve", p_amount: b.amount ?? null, p_note: b.note ?? "" });
  if (seg[2] === "users" && seg[4] === "adjust") return rpc("admin_wallet_adjust", { p_user: seg[3], p_amount: b.amount, p_direction: b.direction, p_reason: b.reason ?? "" });
  if (path === "/admin/wallet/transactions") return (await docs("wallet_transactions")).slice(0, 200);
  if (path === "/admin/wallet/settings" || path === "/admin/wallet/qr-image") {
    const w = (await walletInfo())._doc;
    if (M === "PUT") Object.assign(w, b);
    if (path.endsWith("qr-image")) {
      const f = form?.get("file") as File | null;
      w.qr_data_url = M === "DELETE" || !f ? null : await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.readAsDataURL(f); });
    }
    if (M !== "GET") await q(client().from("site_settings").upsert({ key: "wallet", doc: w }));
    return pub(await walletInfo());
  }

  // reports
  if (path === "/admin/reports/daily") return dailyReport(Number(params.get("days") || 14), params.get("service_id"));
  if (path === "/admin/reports/monthly-income") return monthlyIncome(Number(params.get("months") || 6));
  if (path === "/admin/reports/topup-leaderboard") {
    const months = lastMonths(6), month = params.get("month") || months[0];
    const agg: Record<string, Json> = {};
    (await docs("wallet_transactions")).filter((t) => isTopup(t) && istMonth(t.created_at) === month).forEach((t) => {
      const a = (agg[t.user_id] ??= { user_id: t.user_id, user_name: t.user_name, user_mobile: t.user_mobile, total: 0, count: 0, last_at: t.created_at });
      a.total = r2(a.total + t.amount); a.count++; if (t.created_at > a.last_at) a.last_at = t.created_at;
    });
    const leaders = Object.values(agg).sort((a, x) => x.total - a.total || x.count - a.count).slice(0, 20);
    return { month, months, total: r2(leaders.reduce((s, l) => s + l.total, 0)), leaders };
  }
  if (path === "/admin/whatsapp-alerts") return (await docs("whatsapp_alerts")).slice(0, 100);

  // files
  if (path === "/attachments" && M === "GET") {
    const items = (await docs("attachments")).sort((a, x) => (x.last_event_at || "").localeCompare(a.last_event_at || ""));
    await sign(items.map((d) => d.file?.file_id));
    return { server_time: await rpc<string>("server_now"), items: items.map((d) => attOut(d, u.role)) };
  }
  if (path === "/attachments" || path === "/attachments/camera") {
    const files = form!.getAll("files") as File[];
    const metas = [];
    for (const [i, f] of files.entries()) metas.push(await upload(u.id, f, f.name || `camera-${i + 1}.jpg`));
    const out = await rpc<Json[]>("user_submit", { p_service_id: form!.get("service_id"), p_files: metas });
    return out.map((d) => attOut(d, u.role));
  }
  if (path === "/attachments/bulk-delete" || (seg[0] === "attachments" && M === "DELETE")) {
    const r = await rpc<Json>("admin_delete_files", { p_ids: seg[1] && seg[1] !== "bulk-delete" ? [seg[1]] : b.ids });
    if (r.paths?.length) await client().storage.from("uploads").remove(r.paths.filter(Boolean));
    return { deleted: r.deleted, refunded: Number(r.refunded) };
  }
  if (seg[0] === "attachments" && seg[1]) {
    const id = seg[1];
    if (!seg[2]) {
      await rpc("open_attachment", { p_att: id });
      const row = await q<Json>(client().from("attachments").select("doc").eq("id", id).maybeSingle());
      if (!row) fail(404, "Attachment not found");
      const msgs = (await q<Json[]>(client().from("attachment_messages").select("doc").eq("attachment_id", id).order("created_at"))).map((m) => m.doc);
      await sign([row.doc.file?.file_id, ...msgs.map((m) => m.file?.file_id)]);
      const svc = row.doc.service_id ? (await q<Json>(client().from("services").select("doc").eq("id", row.doc.service_id).maybeSingle()))?.doc : null;
      return { server_time: await rpc<string>("server_now"), attachment: attOut(row.doc, u.role), messages: msgs, service_required_documents: svc?.required_documents ?? [] };
    }
    const owner = admin ? (await q<Json>(client().from("attachments").select("user_id").eq("id", id).single())).user_id : u.id;
    const f = form?.get("file") as File | null;
    if (seg[2] === "messages") {
      const meta = f ? await upload(owner, f, f.name) : null;
      const m = await rpc<Json>("post_message", { p_att: id, p_text: form?.get("text") ?? "", p_file: meta, p_for_document: form?.get("for_document") ?? null });
      if (m.is_receipt && f) void readReceipt(id, m.id, f);
      if (meta) await sign([meta.file_id]);
      return m;
    }
    if (seg[2] === "resubmit") return attOut(await rpc("user_resubmit", { p_att: id, p_file: await upload(u.id, f!, f!.name) }), u.role);
    if (seg[2] === "missing") return attOut(await rpc("admin_request_missing", { p_att: id, p_docs: b.documents ?? [], p_note: b.note ?? "" }), "admin");
    if (seg[2] === "reject") return attOut(await rpc("admin_reject_file", { p_att: id, p_reason: b.reason ?? "" }), "admin");
  }
  fail(404, `Not available: ${method} ${path}`);
}
