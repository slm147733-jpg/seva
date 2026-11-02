import { useQuery } from "@tanstack/react-query";
import { FileText, Link2, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { apiGet } from "@/lib/api";
import { formatIST } from "@/lib/hooks";
import type { Stats } from "@/lib/types";
import { PanelHeader } from "./common";

export default function OverviewPanel({ adminName, onNavigate }: { adminName: string; onNavigate: (tab: string) => void }) {
  const { data, isError } = useQuery({ queryKey: ["stats"], queryFn: () => apiGet<Stats>("/admin/stats") });
  const s = data && !isError ? data : null;

  const cards = [
    { key: "total", label: "Total accounts", value: s?.total_users, icon: Users, tab: "users", big: true },
    { key: "active", label: "Active", value: s?.active_users, icon: UserCheck, tab: "users" },
    { key: "inactive", label: "Inactive", value: s?.inactive_users, icon: UserX, tab: "users" },
    { key: "admins", label: "Admins", value: s?.admins, icon: ShieldCheck, tab: "users" },
    { key: "pages", label: "Website pages", value: s?.pages, icon: FileText, tab: "pages" },
    { key: "links", label: "Quick links", value: s?.links, icon: Link2, tab: "links" },
  ];

  return (
    <div>
      <PanelHeader title={`Namaste, ${adminName}`} subtitle="Here's what's happening across your website today." />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onNavigate(c.tab)}
            className={`text-left rounded-2xl border p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md animate-rise ${
              c.big
                ? "col-span-2 row-span-2 bg-gradient-to-br from-orange-600 via-orange-500 to-amber-400 text-white border-orange-500"
                : "bg-white border-stone-200"
            }`}
            style={{ animationDelay: `${i * 40}ms` }}
            data-testid={`stat-card-${c.key}`}
          >
            <c.icon className={`size-5 ${c.big ? "text-white/90" : "text-orange-600"}`} />
            <p className={`mt-4 font-mono font-bold ${c.big ? "text-6xl" : "text-3xl"}`} data-testid={`stat-value-${c.key}`}>
              {c.value ?? "—"}
            </p>
            <p className={`mt-1 text-sm ${c.big ? "text-white/85" : "text-stone-500"}`}>{c.label}</p>
          </button>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-stone-200 bg-white" data-testid="recent-logins">
        <div className="px-5 py-4 border-b border-stone-100">
          <h2 className="font-heading font-semibold">Recent sign-ins</h2>
        </div>
        <ul className="divide-y divide-stone-100">
          {(s?.recent_logins ?? []).map((u) => (
            <li key={u.id} className="px-5 py-3 flex items-center justify-between gap-4" data-testid={`recent-login-${u.id}`}>
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-amber-100 font-semibold text-amber-800">
                  {u.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs font-mono text-stone-500">{u.mobile}</p>
                </div>
              </div>
              <span className="text-sm text-stone-500">{formatIST(u.last_login)}</span>
            </li>
          ))}
          {s && s.recent_logins.length === 0 && <li className="px-5 py-6 text-stone-500">No sign-ins yet.</li>}
        </ul>
      </div>
    </div>
  );
}
