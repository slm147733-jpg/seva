// Browser-only stand-in for the Supabase client, used by the plain static (Hostinger) build.
// Saved logins ship inside seed.json (passwords stay bcrypt-scrambled); everything created afterwards
// is kept in this browser's IndexedDB only. It mirrors supabase/schema.sql's tables, visibility rules and
// functions so supabaseApi.ts works unchanged.
import bcrypt from "bcryptjs";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Res = { data: any; error: { message: string; code?: string } | null }; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Store { tables: Record<string, Json[]> }

// ---------- IndexedDB key/value ----------
const idb = () =>
  new Promise<IDBDatabase>((ok, bad) => {
    const r = indexedDB.open("sevakendra-local", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error);
  });
async function kv<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await idb();
  return new Promise<T>((ok, bad) => {
    const req = fn(d.transaction("kv", mode).objectStore("kv"));
    req.onsuccess = () => ok(req.result as T);
    req.onerror = () => bad(req.error);
  });
}
const kvGet = <T>(k: string) => kv<T | undefined>("readonly", (s) => s.get(k));
const kvPut = (k: string, v: unknown) => kv("readwrite", (s) => s.put(v, k));
const kvDel = (k: string) => kv("readwrite", (s) => s.delete(k));

const TABLES = ["profiles", "site_settings", "pages", "links", "services", "attachments", "attachment_messages",
  "wallet_transactions", "wallet_requests", "whatsapp_alerts"];
let store: Store | null = null;
let loading: Promise<Store> | null = null;
async function load(): Promise<Store> {
  if (store) return store;
  return (loading ??= (async () => {
    let s = await kvGet<Store>("db");
    if (!s) {
      const seed = await (await fetch(`${import.meta.env.BASE_URL}seed.json`, { cache: "no-store" })).json();
      s = { tables: Object.fromEntries(TABLES.map((t) => [t, seed.tables?.[t] ?? []])) };
      await kvPut("db", s);
    }
    store = s;
    return s;
  })());
}
const save = () => kvPut("db", store);
const T = (name: string) => store!.tables[name];
const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x));

// ---------- session ----------
const SESSION = "sk_local_session";
const uid = () => localStorage.getItem(SESSION);
const profile = (id: string | null) => (id ? T("profiles").find((p) => p.id === id) : undefined);
const isAdminUser = () => {
  const p = profile(uid());
  return Boolean(p && p.role === "admin" && p.is_active);
};

class DbError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}
const fail = (m: string, code?: string): never => {
  throw new DbError(m, code);
};
const wrap = async (fn: () => unknown): Promise<Res> => {
  try {
    await load();
    return { data: await fn(), error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e), code: (e as DbError).code } };
  }
};

// Row visibility = the Row Level Security rules of the Supabase version.
const PUBLIC = new Set(["site_settings", "pages", "links", "services"]);
function visible(table: string, r: Json): boolean {
  if (PUBLIC.has(table)) return true;
  const me = uid();
  if (!me || !profile(me)?.is_active) return false;
  if (isAdminUser()) return true;
  if (table === "profiles") return r.id === me;
  if (table === "attachment_messages") return r.owner_id === me;
  return r.user_id === me;
}
const keyOf = (table: string) => (table === "site_settings" ? "key" : "id");
const field = (r: Json, k: string) => r[k] ?? r.doc?.[k];

class Query implements PromiseLike<Res> {
  private filters: [string, unknown][] = [];
  private ord: [string, boolean] | null = null;
  private cols = "*";
  private mode: "select" | "upsert" | "delete" = "select";
  private payload: Json | Json[] | null = null;
  private one: "" | "maybe" | "single" = "";
  private table: string;
  constructor(table: string) {
    this.table = table;
  }
  select(c = "*") { this.cols = c; return this; }
  eq(k: string, v: unknown) { this.filters.push([k, v]); return this; }
  order(k: string, o?: { ascending?: boolean }) { this.ord = [k, o?.ascending !== false]; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  single() { this.one = "single"; return this; }
  upsert(r: Json | Json[]) { this.mode = "upsert"; this.payload = r; return this; }
  delete() { this.mode = "delete"; return this; }
  then<A = Res, B = never>(ok?: ((v: Res) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return wrap(() => this.run()).then(ok, bad);
  }
  private match = (r: Json) => visible(this.table, r) && this.filters.every(([k, v]) => r[k] === v);
  private async run() {
    const rows = T(this.table);
    if (this.mode !== "select") {
      if (!isAdminUser()) fail("Admin only", "42501");
      if (this.mode === "delete") {
        store!.tables[this.table] = rows.filter((r) => !this.match(r));
      } else {
        const k = keyOf(this.table);
        for (const r of [this.payload!].flat()) {
          const i = rows.findIndex((x) => x[k] === r[k]);
          if (i >= 0) rows[i] = { ...rows[i], ...clone(r) };
          else rows.push(clone(r));
        }
      }
      await save();
      return null;
    }
    let out = rows.filter(this.match);
    if (this.ord) {
      const [k, asc] = this.ord;
      out = [...out].sort((a, b) => String(field(a, k) ?? "").localeCompare(String(field(b, k) ?? "")) * (asc ? 1 : -1));
    }
    const pick = (r: Json) => {
      if (this.cols === "*") {
        const { password_hash, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
        return clone(rest);
      }
      return Object.fromEntries(this.cols.split(",").map((c) => [c.trim(), clone(r[c.trim()])]));
    };
    if (this.one) {
      if (!out[0] && this.one === "single") fail("Row not found");
      return out[0] ? pick(out[0]) : null;
    }
    return out.map(pick);
  }
}

// ---------- server-side functions (translated from supabase/schema.sql) ----------
const ts = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const r2 = (n: number) => Math.round(n * 100) / 100;
const me = () => {
  const p = profile(uid());
  if (!p || !p.is_active) fail("Not authenticated", "42501");
  return p!;
};
const admin = () => {
  const p = me();
  if (p.role !== "admin") fail("Admin only", "42501");
  return p;
};
const att = (id: string) => T("attachments").find((a) => a.id === id);
const patch = (a: Json, ch: Json) => Object.assign(a.doc, ch);
const addMsg = (attId: string, owner: string, m: Json) => {
  const doc = { id: uuid(), attachment_id: attId, file: null, is_receipt: false, created_at: ts(), ...m };
  T("attachment_messages").push({ id: doc.id, attachment_id: attId, owner_id: owner, doc, created_at: doc.created_at });
  return doc;
};

function walletApply(user: string, kind: string, amount: number, reason: string, by: string, category: string, attId: string | null = null, svc: string | null = null) {
  if (!(amount > 0)) fail("Amount must be more than 0");
  const p = profile(user) ?? fail("User not found");
  const bal = Number(p.wallet_balance || 0);
  if (kind === "debit" && bal < amount) fail("Not enough wallet balance", "P0402");
  p.wallet_balance = r2(kind === "debit" ? bal - amount : bal + amount);
  const t = { id: uuid(), user_id: user, user_name: p.name, user_mobile: p.mobile, type: kind, amount, balance_after: p.wallet_balance,
    reason, created_by: by, attachment_id: attId, category, service_id: svc, created_at: ts() };
  T("wallet_transactions").push({ id: t.id, user_id: user, doc: t, created_at: t.created_at });
  return t;
}
function newAttachment(p: Json, s: Json, f: Json, fee: number, extra: Json = {}) {
  const now = ts();
  const d = { id: extra.id ?? uuid(), user_id: p.id, user_name: p.name, user_mobile: p.mobile, file: f, service_id: s.id ?? null,
    service_name: s.name ?? "General", service_fee: s.fee ?? null, created_at: now, seen_at: null, generated_at: null, unread_admin: true,
    unread_user: false, last_event_at: now, last_event_role: "user", last_event_text: `${p.name} uploaded ${f.filename}`, message_count: 0,
    fee_charged: fee, fee_refunded: false, missing_documents: [], missing_resolved: [], paused_at: null, paused_seconds: 0, ...extra };
  T("attachments").push({ id: d.id, user_id: p.id, doc: d, created_at: now });
  return d;
}
function pause(d: Json, waiting: boolean): Json {
  if (waiting && !d.paused_at) return { paused_at: ts() };
  if (!waiting && d.paused_at) return { paused_at: null, paused_seconds: Number(d.paused_seconds || 0) + (Date.now() - Date.parse(d.paused_at)) / 1000 };
  return {};
}
const ownFile = (f: Json, owner: string) => String(f?.file_id ?? "").split("/")[0] === owner || fail("Invalid file");
function refund(a: Json, reason: string, by: string) {
  const fee = Number(a.doc.fee_charged || 0);
  if (fee <= 0 || a.doc.fee_refunded || a.doc.generated_at) return 0;
  a.doc.fee_refunded = true;
  walletApply(a.user_id, "credit", fee, `Refund: ${a.doc.service_name || "file"} — ${reason}`, by, "refund", a.id, a.doc.service_id ?? null);
  return fee;
}
const strip = (p: Json) => {
  const { password_hash, ...rest } = p; // eslint-disable-line @typescript-eslint/no-unused-vars
  return clone(rest);
};

const RPC: Record<string, (a: Json) => unknown> = {
  server_now: () => ts(),
  needs_setup: () => !T("profiles").some((p) => p.role === "admin"),
  login_email: ({ p_mobile }) => T("profiles").find((p) => p.mobile === p_mobile)?.email ?? null,
  touch_login: () => { const p = profile(uid()); if (p) p.last_login = ts(); },
  update_my_name: ({ p_name }) => {
    if (String(p_name ?? "").trim().length < 2) fail("Name is too short");
    me().name = String(p_name).trim();
  },
  wallet_request: ({ p_amount, p_last5 }) => {
    const p = me();
    if (!/^\d{5}$/.test(p_last5 ?? "")) fail("Enter exactly the last 5 digits");
    if (T("wallet_requests").filter((r) => r.user_id === p.id && r.doc.status === "pending").length >= 5) fail("You already have 5 payments waiting");
    const r = { id: uuid(), user_id: p.id, user_name: p.name, user_mobile: p.mobile, amount: p_amount, txn_last5: p_last5, status: "pending",
      credited_amount: null, admin_note: "", created_at: ts(), resolved_at: null };
    T("wallet_requests").push({ id: r.id, user_id: p.id, doc: r, created_at: r.created_at });
    return r;
  },
  admin_wallet_resolve: ({ p_req, p_approve, p_amount, p_note }) => {
    const a = admin();
    const r = T("wallet_requests").find((x) => x.id === p_req && x.doc.status === "pending") ?? fail("Already handled");
    if (p_approve && !(Number(p_amount) > 0)) fail("Amount must be more than 0");
    Object.assign(r.doc, { status: p_approve ? "approved" : "rejected", credited_amount: p_approve ? Number(p_amount) : null,
      admin_note: p_note ?? "", resolved_at: ts() });
    if (p_approve) walletApply(r.user_id, "credit", Number(p_amount), `Payment verified (Txn …${r.doc.txn_last5})`, a.name, "topup");
    return r.doc;
  },
  admin_wallet_adjust: ({ p_user, p_amount, p_direction, p_reason }) => {
    const a = admin();
    return walletApply(p_user, p_direction === "remove" ? "debit" : "credit", Number(p_amount), String(p_reason ?? "").trim() || "Manual adjustment", a.name, "adjust");
  },
  user_submit: ({ p_service_id, p_files, p_fee_count }) => {
    const p = me();
    if (p.role !== "user") fail("Only users submit files");
    const files = p_files as Json[];
    if (!files.length || files.length > 20) fail("Attach 1 to 20 files");
    const s = T("services").find((x) => x.id === p_service_id && x.doc.is_active !== false)?.doc;
    if (!s || !(p.service_ids ?? []).includes(p_service_id)) fail("Pick one of your services", "42501");
    files.forEach((f) => ownFile(f, p.id));
    const fee = r2(Number(s!.fee || 0));
    const n = p_fee_count ?? files.length;
    if (fee > 0) walletApply(p.id, "debit", r2(fee * n), `Fee: ${s!.name} × ${n}`, "system", "fee", null, s!.id);
    return files.map((f) => newAttachment(p, s!, f, fee > 0 ? fee : 0));
  },
  user_resubmit: ({ p_att, p_file }) => {
    const p = me();
    const a = att(p_att);
    if (!a || a.user_id !== p.id || !a.doc.rejected_at || a.doc.resubmitted_as) fail("This file cannot be resubmitted");
    ownFile(p_file, p.id);
    const newId = uuid();
    const fee = r2(Number(a!.doc.service_fee || 0));
    const s = { id: a!.doc.service_id, name: a!.doc.service_name, fee };
    if (fee > 0) walletApply(p.id, "debit", fee, `Fee: ${s.name} × 1 (resubmit)`, "system", "fee", newId, s.id);
    a!.doc.resubmitted_as = newId;
    const d = newAttachment(p, s, p_file, fee, { id: newId, resubmit_of: p_att, last_event_text: `${p.name} resubmitted a corrected copy: ${p_file.filename}` });
    addMsg(p_att, p.id, { sender_id: p.id, sender_name: p.name, sender_role: "user", text: `Corrected copy sent as a new file: ${p_file.filename}` });
    patch(a!, { last_event_at: ts(), last_event_role: "user", last_event_text: "Corrected copy sent", unread_admin: true, message_count: Number(a!.doc.message_count || 0) + 1 });
    return d;
  },
  open_attachment: ({ p_att }) => {
    const p = me();
    const a = att(p_att);
    if (!a) return;
    if (p.role === "admin") patch(a, { unread_admin: false, seen_at: a.doc.seen_at ?? ts() });
    else if (a.user_id === p.id) patch(a, { unread_user: false });
  },
  post_message: ({ p_att, p_text, p_file, p_for_document }) => {
    const p = me();
    const a = att(p_att);
    if (!a || (p.role !== "admin" && a.user_id !== p.id)) fail("File not found");
    const text = String(p_text ?? "").trim();
    if (!text && !p_file) fail("Write a remark or attach a file");
    if (p_file) ownFile(p_file, a!.user_id);
    if (p.role === "admin" && p_file && a!.doc.rejected_at) fail("This file was rejected — a receipt can't be sent for it");
    const isRcpt = p.role === "admin" && Boolean(p_file);
    const now = ts();
    const m = addMsg(p_att, a!.user_id, { sender_id: p.id, sender_name: p.name, sender_role: p.role, text, file: p_file ?? null,
      is_receipt: isRcpt, created_at: now, for_document: p_for_document ?? null });
    const ch: Json = { last_event_at: now, last_event_role: p.role, message_count: Number(a!.doc.message_count || 0) + 1,
      last_event_text: p.name + (isRcpt ? " sent a receipt" : p_file ? " sent a file" : `: ${text.slice(0, 80)}`) };
    if (p.role === "admin") {
      ch.unread_user = true;
      if (!a!.doc.seen_at) ch.seen_at = now;
      if (isRcpt) {
        Object.assign(ch, { receipt_ocr: "pending", receipt_message_id: m.id });
        if (!a!.doc.generated_at) Object.assign(ch, { generated_at: now }, pause(a!.doc, false));
        const w = { id: uuid(), user_id: a!.user_id, user_name: a!.doc.user_name, user_mobile: a!.doc.user_mobile, attachment_id: p_att,
          status: "not_connected", message: "Your receipt is ready. Log in to Sevakendra to download it.", created_at: now };
        T("whatsapp_alerts").push({ id: w.id, user_id: a!.user_id, doc: w, created_at: now });
      }
    } else {
      ch.unread_admin = true;
      if (p_for_document) {
        const resolved = [...new Set([...(a!.doc.missing_resolved ?? []), p_for_document])];
        ch.missing_resolved = resolved;
        Object.assign(ch, pause(a!.doc, !a!.doc.generated_at && (a!.doc.missing_documents ?? []).some((d: string) => !resolved.includes(d))));
      }
    }
    patch(a!, ch);
    return m;
  },
  admin_set_receipt_ocr: ({ p_att, p_msg, p_number, p_name }) => {
    admin();
    const a = att(p_att);
    if (a && a.doc.receipt_message_id === p_msg)
      patch(a, { receipt_number: p_number, receipt_name: p_name, receipt_ocr: p_number == null && p_name == null ? "not_found" : "done" });
  },
  admin_request_missing: ({ p_att, p_docs, p_note }) => {
    const p = admin();
    const a = att(p_att) ?? fail("File not found");
    const docsList = p_docs as string[];
    const kept = (a.doc.missing_resolved ?? []).filter((x: string) => docsList.includes(x));
    const note = String(p_note ?? "").trim();
    const now = ts();
    const txt = !docsList.length ? "Missing-document request cleared."
      : `Please send these missing documents:${docsList.map((x) => `\n• ${x}`).join("")}${note ? `\n${note}` : ""}`;
    addMsg(p_att, a.user_id, { sender_id: p.id, sender_name: p.name, sender_role: "admin", text: txt, created_at: now });
    const ch: Json = { missing_documents: docsList, missing_note: p_note ?? "", missing_resolved: kept, missing_requested_at: now,
      missing_reminded_at: null, last_event_at: now, last_event_role: "admin", unread_user: true,
      last_event_text: docsList.length ? "Missing documents requested" : "Request cleared", message_count: Number(a.doc.message_count || 0) + 1 };
    if (!a.doc.seen_at) ch.seen_at = now;
    Object.assign(ch, pause(a.doc, !a.doc.generated_at && !a.doc.rejected_at && docsList.some((d) => !kept.includes(d))));
    patch(a, ch);
    return a.doc;
  },
  admin_reject_file: ({ p_att, p_reason }) => {
    const p = admin();
    const a = att(p_att);
    if (!a || a.doc.rejected_at || a.doc.generated_at) fail("File already finished or rejected");
    const now = ts();
    const reason = String(p_reason ?? "").trim();
    patch(a!, { rejected_at: now, reject_reason: reason });
    const refunded = refund(a!, "file rejected", p.name);
    addMsg(p_att, a!.user_id, { sender_id: p.id, sender_name: p.name, sender_role: "admin", created_at: now,
      text: `This file was rejected.${reason ? `\nReason: ${reason}` : ""}${refunded > 0 ? `\n₹${refunded} has been returned to your wallet.` : ""}` });
    patch(a!, { last_event_at: now, last_event_role: "admin", unread_user: true, message_count: Number(a!.doc.message_count || 0) + 1,
      last_event_text: `File rejected${refunded > 0 ? ` · ₹${refunded} refunded` : ""}`, fee_refunded: refunded > 0 || Boolean(a!.doc.fee_refunded),
      ...(a!.doc.seen_at ? {} : { seen_at: now }), ...pause(a!.doc, false) });
    return a!.doc;
  },
  admin_delete_files: ({ p_ids }) => {
    const p = admin();
    const ids = new Set(p_ids as string[]);
    let total = 0;
    const paths: string[] = [];
    for (const a of T("attachments").filter((x) => ids.has(x.id))) {
      total += refund(a, "file deleted", p.name);
      paths.push(a.doc.file?.file_id, ...T("attachment_messages").filter((m) => m.attachment_id === a.id && m.doc.file).map((m) => m.doc.file.file_id));
    }
    store!.tables.attachments = T("attachments").filter((x) => !ids.has(x.id));
    store!.tables.attachment_messages = T("attachment_messages").filter((m) => !ids.has(m.attachment_id));
    store!.tables.whatsapp_alerts = T("whatsapp_alerts").filter((w) => !ids.has(w.doc.attachment_id));
    return { deleted: ids.size, refunded: total, paths: paths.filter(Boolean) };
  },
  admin_create_user: ({ p_name, p_mobile, p_password, p_role, p_services }) => {
    admin();
    if (!/^[6-9]\d{9}$/.test(p_mobile ?? "")) fail("Enter a valid 10-digit mobile number");
    if (String(p_password ?? "").length < 6) fail("Password must be at least 6 characters");
    if (T("profiles").some((p) => p.mobile === p_mobile)) fail("Mobile number already registered");
    const p = { id: uuid(), name: String(p_name).trim(), mobile: p_mobile, email: `${p_mobile}@sevakendra.app`, role: p_role ?? "user",
      is_active: true, created_at: ts(), last_login: null, service_ids: p_services ?? [], wallet_balance: 0, password_hash: bcrypt.hashSync(p_password, 10) };
    T("profiles").push(p);
    return strip(p);
  },
  admin_update_user: ({ p_user, p_patch }) => {
    admin();
    const b = p_patch as Json;
    if (p_user === uid() && (b.role === "user" || b.is_active === false)) fail("You cannot demote or deactivate yourself");
    if (b.mobile && T("profiles").some((p) => p.mobile === b.mobile && p.id !== p_user)) fail("Mobile number already registered");
    const p = profile(p_user) ?? fail("User not found");
    for (const k of ["name", "mobile", "role", "is_active", "service_ids"]) if (b[k] !== undefined && b[k] !== null) p[k] = b[k];
    if (b.mobile) p.email = `${p.mobile}@sevakendra.app`;
    return strip(p);
  },
  admin_reset_password: ({ p_user, p_password }) => {
    admin();
    if (String(p_password ?? "").length < 6) fail("Password must be at least 6 characters");
    (profile(p_user) ?? fail("User not found")).password_hash = bcrypt.hashSync(p_password, 10);
  },
  admin_delete_user: ({ p_user }) => {
    admin();
    if (p_user === uid()) fail("You cannot delete yourself");
    const atts = new Set(T("attachments").filter((a) => a.user_id === p_user).map((a) => a.id));
    store!.tables.profiles = T("profiles").filter((p) => p.id !== p_user);
    store!.tables.attachments = T("attachments").filter((a) => a.user_id !== p_user);
    store!.tables.attachment_messages = T("attachment_messages").filter((m) => !atts.has(m.attachment_id));
  },
};

// ---------- client surface used by supabaseApi.ts ----------
const urls = new Map<string, string>();
export const localClient = {
  from: (table: string) => new Query(table),
  rpc: (fn: string, args: Json = {}) =>
    wrap(async () => {
      const f = RPC[fn] ?? fail(`Not available offline: ${fn}`);
      const out = await f(args);
      await save();
      return out ?? null;
    }),
  auth: {
    getSession: async () => {
      await load();
      const id = uid();
      return { data: { session: id && profile(id) ? { user: { id } } : null }, error: null };
    },
    signInWithPassword: ({ email, password }: { email: string; password: string }) =>
      wrap(() => {
        const p = T("profiles").find((x) => x.email === email);
        if (!p || !p.password_hash || !bcrypt.compareSync(password, p.password_hash)) fail("Invalid login credentials");
        localStorage.setItem(SESSION, p!.id);
        return { user: { id: p!.id } };
      }),
    signOut: async () => {
      localStorage.removeItem(SESSION);
      return { error: null };
    },
    updateUser: ({ password }: { password: string }) =>
      wrap(async () => {
        if (String(password ?? "").length < 6) fail("Password must be at least 6 characters");
        me().password_hash = bcrypt.hashSync(password, 10);
        await save();
        return { user: { id: uid() } };
      }),
  },
  storage: {
    from: () => ({
      upload: (path: string, file: Blob) => wrap(async () => { await kvPut(`file:${path}`, file); return { path }; }),
      createSignedUrls: (paths: string[]) =>
        wrap(async () => {
          const out = [];
          for (const path of paths) {
            if (!urls.has(path)) {
              const blob = await kvGet<Blob>(`file:${path}`);
              if (blob) urls.set(path, URL.createObjectURL(blob));
            }
            out.push({ path, signedUrl: urls.get(path) ?? "" });
          }
          return out;
        }),
      remove: (paths: string[]) => wrap(async () => { for (const p of paths) await kvDel(`file:${p}`); return null; }),
    }),
  },
};
