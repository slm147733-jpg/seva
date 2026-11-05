// Typed fetch layer over the FastAPI backend. Base is the relative "/api" prefix so the
// same code works in dev (Vite proxies /api → :8001) and behind a single origin in prod.
import { LOCAL_MODE, SUPABASE_MODE, handle, signedUrl, SbError } from "./supabaseApi";

// VITE_API_BASE lets a static copy (e.g. Hostinger) talk to the live server on another domain.
// Empty in this app's own preview/deploy, so calls stay relative.
const ORIGIN = ((import.meta.env.VITE_API_BASE as string | undefined) ?? "").replace(/\/+$/, "");
const BASE = `${ORIGIN}/api`;
const TOKEN_KEY = "sk_token";
const getToken = () => (ORIGIN ? localStorage.getItem(TOKEN_KEY) : null);
function keepToken(res: Response, path: string) {
  if (!ORIGIN) return;
  const t = res.headers.get("X-Session-Token");
  if (t) localStorage.setItem(TOKEN_KEY, t);
  if (path.startsWith("/auth/logout")) localStorage.removeItem(TOKEN_KEY);
}
const authHeaders = (): Record<string, string> => {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};
// Full URL for <img>/<a> links to the API (adds the session token on cross-domain copies).
export function apiUrl(path: string): string {
  const t = getToken();
  return t ? `${BASE}${path}${path.includes("?") ? "&" : "?"}t=${encodeURIComponent(t)}` : `${BASE}${path}`;
}

// Static (Hostinger) build: the same paths are answered by Supabase in the browser.
async function viaSupabase<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return (await handle(method, path, body)) as T;
  } catch (e) {
    if (e instanceof SbError) throw new ApiError(e.status, e.body);
    throw e;
  }
}

// Fields are declared, not constructor parameter properties: tsconfig sets
// erasableSyntaxOnly, which rejects `constructor(readonly status: number)`.
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(`request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type JsonBody = unknown;

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  if (SUPABASE_MODE) return viaSupabase<T>(method, path, body);
  // Auth rides the httpOnly session cookie automatically — never add auth headers here.
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? authHeaders() : { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  keepToken(res, path);

  // FastAPI reports request-validation failures as 422 with a {detail: [...]} body.
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// The response type is yours to declare: nothing infers across the Python boundary, so a
// TS interface here mirrors the endpoint's Pydantic model by hand — keep the two in sync.
export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);

// Multipart upload (files + form fields). The browser sets the multipart boundary header itself.
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  if (SUPABASE_MODE) return viaSupabase<T>("POST", path, form);
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: form, headers: authHeaders() });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }
  return (await res.json()) as T;
}

// Relative URL for viewing/downloading a stored file (auth rides the session cookie).
export const fileUrl = (fileId: string, download = false) =>
  SUPABASE_MODE
    ? `${signedUrl(fileId)}${download && !LOCAL_MODE ? "&download=" : ""}`
    : apiUrl(`/files/${fileId}${download ? "?download=true" : ""}`);
