import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, LogOut, Phone, Search, UserRound } from "lucide-react";
import { Brand } from "@/components/Brand";
import { LinkCard } from "@/components/LinkCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { errorMessage, formatIST, useMe } from "@/lib/hooks";
import { endSession } from "@/lib/session";
import type { Link, Ok, UserOut } from "@/lib/types";
import UploadBar from "@/components/files/UploadBar";
import AttachmentList from "@/components/files/AttachmentList";
import AttachmentDetail from "@/components/files/AttachmentDetail";
import { useLiveAttachments } from "@/lib/live";

function ProfileDialog({ user }: { user: UserOut }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ current_password: "", new_password: "" });

  const saveName = useMutation({
    mutationFn: () => apiPut<UserOut>("/auth/me", { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Profile updated");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const changePw = useMutation({
    mutationFn: () => apiPost<Ok>("/auth/me/password", pw),
    onSuccess: () => {
      setPw({ current_password: "", new_password: "" });
      toast.success("Password changed");
      setOpen(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" data-testid="portal-edit-profile-button" />}>
        <UserRound className="size-4" /> Edit profile
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>My profile</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            saveName.mutate();
          }}
        >
          <Label htmlFor="pname">Name</Label>
          <div className="flex gap-2">
            <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} data-testid="profile-name-input" />
            <Button type="submit" disabled={saveName.isPending} data-testid="profile-save-name-button">
              Save
            </Button>
          </div>
        </form>
        <form
          className="space-y-3 border-t pt-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            changePw.mutate();
          }}
        >
          <p className="font-medium flex items-center gap-2">
            <KeyRound className="size-4 text-orange-600" /> Change password
          </p>
          <Input
            type="password"
            placeholder="Current password"
            value={pw.current_password}
            onChange={(e) => setPw({ ...pw, current_password: e.target.value })}
            data-testid="profile-current-password-input"
          />
          <Input
            type="password"
            placeholder="New password (min 6 characters)"
            value={pw.new_password}
            onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
            data-testid="profile-new-password-input"
          />
          <Button type="submit" className="w-full" disabled={changePw.isPending} data-testid="profile-change-password-button">
            Update password
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function UserPortal() {
  const me = useMe();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const live = useLiveAttachments(me.data?.role === "user" ? "user" : undefined);
  const files = live.data && !live.isError ? live.data.items : [];
  const links = useQuery({
    queryKey: ["my-links"],
    queryFn: () => apiGet<Link[]>("/auth/me/links"),
    enabled: !!me.data && !me.isError,
  });

  if (me.isError) return <Navigate to="/login" replace />;
  if (me.data?.role === "admin") return <Navigate to="/admin" replace />;

  const user = me.data;
  const filtered = (links.data ?? []).filter((l) =>
    `${l.title} ${l.category} ${l.description}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 backdrop-blur-md bg-white/85 border-b border-stone-200/80">
        <div className="mx-auto max-w-6xl px-4 md:px-8 py-3.5 flex items-center justify-between">
          <Brand name="Sevakendra" />
          <Button variant="ghost" onClick={() => endSession()} data-testid="portal-logout-button">
            <LogOut className="size-4" /> Logout
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 md:px-8 py-10">
        <section
          className="relative overflow-hidden rounded-3xl bg-amber-100 p-8 md:p-10 animate-rise"
          data-testid="portal-welcome-card"
        >
          <div className="absolute -right-16 -top-16 size-64 rounded-full bg-orange-400/30 blur-2xl" />
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-800">Namaste</p>
          <h1 className="mt-2 text-4xl md:text-5xl font-extrabold tracking-tight text-amber-950" data-testid="portal-user-name">
            {user ? user.name : "…"}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-amber-900">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 font-mono" data-testid="portal-user-mobile">
              <Phone className="size-3.5" /> +91 {user?.mobile}
            </span>
            <span className="rounded-full bg-white/70 px-3 py-1">Member since {user ? formatIST(user.created_at).split(",")[0] : "—"}</span>
            {user && <ProfileDialog key={user.name} user={user} />}
          </div>
        </section>

        <section className="mt-12" data-testid="portal-files-section">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-orange-700 font-semibold">Applications</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">My files & receipts</h2>
            </div>
            <span className="text-sm text-stone-500" data-testid="portal-files-count">
              {files.filter((f) => f.status === "generated").length} of {files.length} receipts ready
            </span>
          </div>
          <UploadBar />
          <div className="mt-4">
            <AttachmentList
              items={files}
              showUser={false}
              onOpen={setOpenId}
              emptyText="You haven't sent any files yet. Use the camera or attach PDF / images above."
            />
          </div>
          {user && <AttachmentDetail id={openId} role="user" myId={user.id} onClose={() => setOpenId(null)} />}
        </section>

        <section className="mt-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-orange-700 font-semibold">Your workspace</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight">Quick links</h2>
            </div>
            <div className="relative sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone-400" />
              <Input
                placeholder="Search links"
                className="pl-9 h-10"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                data-testid="portal-links-search"
              />
            </div>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="portal-links-grid">
            {filtered.map((l, i) => (
              <LinkCard key={l.id} link={l} index={i} />
            ))}
            {links.isSuccess && filtered.length === 0 && (
              <p className="text-stone-500" data-testid="portal-links-empty">
                No links found.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
