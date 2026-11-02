import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "./api";
import type { SiteData, UserOut } from "./types";

export const DEFAULT_SITE: SiteData = {
  settings: {
    site_name: "Sevakendra",
    tagline: "Your trusted digital service centre",
    hero_title: "Every citizen service, one friendly counter.",
    hero_subtitle:
      "Apply, track and get help with government and utility services — fast, transparent and close to home.",
    announcement: "",
    helpline: "",
    email: "",
    address: "",
  },
  nav_pages: [],
  links: [],
};

export function useSite() {
  return useQuery({ queryKey: ["site"], queryFn: () => apiGet<SiteData>("/site") });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<UserOut>("/auth/me"),
    retry: false,
  });
}

export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | null;
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { loc?: unknown[]; msg?: string };
      const field = first.loc ? String(first.loc[first.loc.length - 1]) : "";
      if (field === "mobile") return "Enter a valid 10-digit mobile number (starts with 6-9)";
      if (field === "password" || field === "new_password") return "Password must be at least 6 characters";
      if (field === "slug") return "Slug must be lowercase letters, numbers and hyphens";
      return `${field ? field + ": " : ""}${first.msg ?? "Invalid input"}`;
    }
  }
  return fallback;
}

export function formatIST(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function normalizeUrl(url: string): string {
  if (/^(https?:|mailto:|tel:|\/)/i.test(url)) return url;
  return `https://${url}`;
}

export function formatINR(amount: number | null | undefined): string {
  if (!amount) return "Free";
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
