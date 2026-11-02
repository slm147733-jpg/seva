import { Link as RouterLink, Navigate, useSearchParams } from "react-router-dom";
import { BarChart3, Briefcase, ExternalLink, FileText, Inbox, LayoutDashboard, Link2, LogOut, Menu, Settings, Users } from "lucide-react";
import ServicesPanel from "@/components/admin/ServicesPanel";
import ReportsPanel from "@/components/admin/ReportsPanel";
import FilesPanel from "@/components/admin/FilesPanel";
import { useLiveAttachments } from "@/lib/live";
import { BrandMark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import OverviewPanel from "@/components/admin/OverviewPanel";
import UsersPanel from "@/components/admin/UsersPanel";
import PagesPanel from "@/components/admin/PagesPanel";
import LinksPanel from "@/components/admin/LinksPanel";
import SettingsPanel from "@/components/admin/SettingsPanel";
import { useMe } from "@/lib/hooks";
import { endSession } from "@/lib/session";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "files", label: "User files", icon: Inbox },
  { id: "reports", label: "Daily report", icon: BarChart3 },
  { id: "services", label: "Services", icon: Briefcase },
  { id: "users", label: "Users", icon: Users },
  { id: "pages", label: "Pages", icon: FileText },
  { id: "links", label: "Website links", icon: Link2 },
  { id: "settings", label: "Site settings", icon: Settings },
];

function SidebarNav({ tab, setTab, prefix, unread }: { tab: string; setTab: (t: string) => void; prefix: string; unread: number }) {
  return (
    <nav className="flex flex-col gap-1">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
            tab === t.id ? "bg-orange-600 text-white" : "text-stone-400 hover:bg-stone-900 hover:text-stone-100"
          }`}
          data-testid={`${prefix}-tab-${t.id}`}
        >
          <t.icon className="size-4" /> {t.label}
          {t.id === "files" && unread > 0 && (
            <span
              className="ml-auto rounded-full bg-yellow-400 px-2 py-0.5 text-[11px] font-bold text-stone-950"
              data-testid={`${prefix}-files-unread`}
            >
              {unread}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

export default function AdminDashboard() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? (params.get("tab") as string) : "overview";
  const setTab = (t: string) => setParams({ tab: t });
  const live = useLiveAttachments(me.data?.role === "admin" ? "admin" : undefined);
  const files = live.data && !live.isError ? live.data.items : [];
  const unread = files.filter((a) => a.unread).length;

  if (me.isError) return <Navigate to="/login" replace />;
  if (me.data && me.data.role !== "admin") return <Navigate to="/portal" replace />;
  const admin = me.data;

  return (
    <div className="min-h-screen bg-background lg:pl-64">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col justify-between bg-stone-950 p-4">
        <div>
          <div className="flex items-center gap-2.5 px-2 py-2 mb-6">
            <BrandMark />
            <div>
              <p className="font-heading font-extrabold text-stone-50 leading-tight">Sevakendra</p>
              <p className="text-[11px] uppercase tracking-wider text-orange-400">Admin console</p>
            </div>
          </div>
          <SidebarNav tab={tab} setTab={setTab} prefix="sidebar" unread={unread} />
        </div>
        <div className="rounded-xl bg-stone-900 p-3">
          <p className="text-sm font-medium text-stone-100 truncate" data-testid="admin-name">
            {admin?.name ?? "…"}
          </p>
          <p className="text-xs font-mono text-stone-500">{admin?.mobile}</p>
          <Button
            variant="ghost"
            className="mt-2 w-full justify-start text-stone-300 hover:bg-stone-800 hover:text-white"
            onClick={() => endSession()}
            data-testid="admin-logout-button"
          >
            <LogOut className="size-4" /> Logout
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/85 border-b border-stone-200/80">
        <div className="px-4 md:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger className="lg:hidden p-2 rounded-lg hover:bg-stone-100" data-testid="admin-mobile-menu-button">
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent side="left" className="bg-stone-950 p-4 border-stone-800">
                <SheetTitle className="text-stone-50 mb-4">Admin console</SheetTitle>
                <SidebarNav tab={tab} setTab={setTab} prefix="mobile" unread={unread} />
                <Button variant="ghost" className="mt-6 justify-start text-stone-300" onClick={() => endSession()}>
                  <LogOut className="size-4" /> Logout
                </Button>
              </SheetContent>
            </Sheet>
            <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">Admin</span>
          </div>
          <RouterLink
            to="/"
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-700 hover:text-orange-700 transition-colors"
            data-testid="admin-view-site-link"
          >
            View live site <ExternalLink className="size-4" />
          </RouterLink>
        </div>
      </header>

      <main className="px-4 md:px-8 py-8 max-w-6xl" key={tab}>
        <div className="animate-rise">
          {tab === "overview" && (
            <OverviewPanel adminName={admin?.name ?? ""} adminId={admin?.id ?? ""} files={files} onNavigate={setTab} />
          )}
          {tab === "files" && <FilesPanel adminId={admin?.id ?? ""} items={files} />}
          {tab === "reports" && <ReportsPanel />}
          {tab === "services" && <ServicesPanel />}
          {tab === "users" && <UsersPanel currentAdminId={admin?.id ?? ""} />}
          {tab === "pages" && <PagesPanel />}
          {tab === "links" && <LinksPanel />}
          {tab === "settings" && <SettingsPanel />}
        </div>
      </main>
    </div>
  );
}
