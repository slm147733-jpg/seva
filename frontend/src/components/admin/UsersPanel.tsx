import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Pencil, Plus, Search, Trash2, Wallet } from "lucide-react";
import AdjustDialog from "@/components/wallet/AdjustDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errorMessage, formatIST } from "@/lib/hooks";
import type { Ok, Role, Service, UserCreate, UserOut, UserUpdate } from "@/lib/types";
import { ConfirmDelete, PanelHeader } from "./common";
import AdminRequests from "./AdminRequests";
import { useMe } from "@/lib/hooks";
import type { ScopeIn } from "@/lib/types";

const ROLE_LABELS: Record<string, string> = { user: "User", admin: "Admin" };

type Mode = { kind: "create" } | { kind: "edit"; user: UserOut } | { kind: "reset"; user: UserOut } | null;

function UserFormDialog({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = mode?.kind === "edit" ? mode.user : null;
  const [form, setForm] = useState({
    name: editing?.name ?? "",
    mobile: editing?.mobile ?? "",
    password: "",
    role: (editing?.role ?? "user") as Role,
    service_ids: editing?.service_ids ?? ([] as string[]),
  });
  const services = useQuery({ queryKey: ["admin-services"], queryFn: () => apiGet<Service[]>("/admin/services") });
  const toggleService = (id: string) =>
    setForm((f) => ({
      ...f,
      service_ids: f.service_ids.includes(id) ? f.service_ids.filter((s) => s !== id) : [...f.service_ids, id],
    }));

  const save = useMutation({
    mutationFn: () => {
      if (editing) {
        const body: UserUpdate = { name: form.name, mobile: form.mobile, role: form.role, service_ids: form.service_ids };
        return apiPut<UserOut>(`/admin/users/${editing.id}`, body);
      }
      const body: UserCreate = form;
      return apiPost<UserOut>("/admin/users", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-services"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(editing ? "User updated" : "User login created");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <Dialog open={mode?.kind === "create" || mode?.kind === "edit"} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit user" : "Create user login"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" data-testid="user-form">
          <div className="space-y-2">
            <Label htmlFor="u-name">Name</Label>
            <Input
              id="u-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              data-testid="user-form-name-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-mobile">Mobile number</Label>
            <Input
              id="u-mobile"
              inputMode="numeric"
              maxLength={10}
              placeholder="10-digit mobile"
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value.replace(/\D/g, "") })}
              required
              data-testid="user-form-mobile-input"
            />
          </div>
          {!editing && (
            <div className="space-y-2">
              <Label htmlFor="u-pass">Password</Label>
              <Input
                id="u-pass"
                type="text"
                placeholder="Min 6 characters"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                data-testid="user-form-password-input"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={form.role} onValueChange={(v: string) => setForm({ ...form, role: v as Role })}>
              <SelectTrigger className="w-full" data-testid="user-form-role-select">
                <SelectValue>{(v) => ROLE_LABELS[v as string]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user" data-testid="role-option-user">User</SelectItem>
                <SelectItem value="admin" data-testid="role-option-admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.role === "user" && (
            <div className="space-y-2" data-testid="user-form-services">
              <Label>Services this user can choose</Label>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-stone-200 divide-y divide-stone-100">
                {(services.data ?? []).map((s) => (
                  <label key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-stone-50">
                    <input
                      type="checkbox"
                      className="size-4 accent-orange-600"
                      checked={form.service_ids.includes(s.id)}
                      onChange={() => toggleService(s.id)}
                      data-testid={`user-form-service-${s.id}`}
                    />
                    <span className="flex-1">{s.name}</span>
                    {!s.is_active && <span className="text-xs text-stone-400">inactive</span>}
                  </label>
                ))}
                {services.isSuccess && services.data.length === 0 && (
                  <p className="px-3 py-3 text-sm text-stone-500" data-testid="user-form-no-services">
                    No services yet — add them in the Services tab.
                  </p>
                )}
              </div>
              <p className="text-xs text-stone-500">{form.service_ids.length} selected · users can only upload for these services</p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} data-testid="user-form-submit-button">
              {editing ? "Save changes" : "Create login"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const user = mode?.kind === "reset" ? mode.user : null;
  const [pw, setPw] = useState("");
  const reset = useMutation({
    mutationFn: () => apiPost<Ok>(`/admin/users/${user?.id}/reset-password`, { new_password: pw }),
    onSuccess: () => {
      toast.success(`Password reset for ${user?.name}`);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password — {user?.name}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            reset.mutate();
          }}
        >
          <Input
            type="text"
            placeholder="New password (min 6 characters)"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            data-testid="reset-password-input"
          />
          <p className="text-xs text-stone-500">The user will be signed out of all devices.</p>
          <DialogFooter>
            <Button type="submit" disabled={reset.isPending} data-testid="reset-password-submit-button">
              Reset password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPanel({ currentAdminId }: { currentAdminId: string }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>(null);
  const [walletUser, setWalletUser] = useState<UserOut | null>(null);
  const [q, setQ] = useState("");
  const { data, isError, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => apiGet<UserOut[]>("/admin/users"),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };
  const servicesQ = useQuery({ queryKey: ["admin-services"], queryFn: () => apiGet<Service[]>("/admin/services") });
  const serviceNames: Record<string, string> = Object.fromEntries((servicesQ.data ?? []).map((s) => [s.id, s.name]));

  const toggle = useMutation({
    mutationFn: (u: UserOut) => apiPut<UserOut>(`/admin/users/${u.id}`, { is_active: !u.is_active }),
    onSuccess: (u) => {
      refresh();
      toast.success(`${u.name} ${u.is_active ? "activated" : "deactivated"}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const owner = !!useMe().data?.is_owner;
  const scope = useMutation({
    mutationFn: (u: UserOut) =>
      apiPut<UserOut>(`/admin/admins/${u.id}/scope`, { scope: u.admin_scope === "files" ? "full" : "files" } satisfies ScopeIn),
    onSuccess: (u) => {
      toast.success(`${u.name} now has ${u.admin_scope === "files" ? "files-only" : "full"} access`);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const users = (data && !isError ? data : []).filter((u) =>
    `${u.name} ${u.mobile}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      {owner && <AdminRequests />}
      <PanelHeader
        title="User management"
        subtitle="Create logins with mobile & password, edit details, reset passwords or turn accounts on/off."
        action={
          <Button onClick={() => setMode({ kind: "create" })} className="h-10" data-testid="admin-create-user-button">
            <Plus className="size-4" /> Create user login
          </Button>
        }
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone-400" />
        <Input
          placeholder="Search name or mobile"
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          data-testid="users-search-input"
        />
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <Table data-testid="users-table">
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead>Name</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Services</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead>Last sign-in</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const self = u.id === currentAdminId;
              return (
                <TableRow key={u.id} data-testid={`user-row-${u.mobile}`}>
                  <TableCell className="font-medium py-2.5">
                    {u.name} {self && <span className="text-xs text-stone-400">(you)</span>}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{u.mobile}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>{ROLE_LABELS[u.role]}</Badge>
                    {u.role === "admin" && (
                      <button
                        type="button"
                        disabled={!owner || u.is_owner || scope.isPending}
                        onClick={() => scope.mutate(u)}
                        title={owner && !u.is_owner ? "Click to switch access" : undefined}
                        className={`ml-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors duration-150 disabled:cursor-default ${
                          u.is_owner ? "bg-orange-100 text-orange-800" : u.admin_scope === "files" ? "bg-sky-100 text-sky-900 enabled:hover:bg-sky-200" : "bg-stone-100 text-stone-700 enabled:hover:bg-stone-200"
                        }`}
                        data-testid={`user-scope-${u.mobile}`}
                      >
                        {u.is_owner ? "Owner" : u.admin_scope === "files" ? "Files only" : "Full access"}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px]" data-testid={`user-services-${u.mobile}`}>
                    {u.role === "admin" ? (
                      <span className="text-xs text-stone-400">All (admin)</span>
                    ) : u.service_ids.length === 0 ? (
                      <span className="text-xs text-red-600">None assigned</span>
                    ) : (
                      <span className="text-xs text-stone-600 line-clamp-2">
                        {u.service_ids.map((id) => serviceNames[id]).filter(Boolean).join(", ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      disabled={self || toggle.isPending}
                      onClick={() => toggle.mutate(u)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors duration-200 disabled:opacity-60 ${
                        u.is_active ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-stone-200 text-stone-600 hover:bg-stone-300"
                      }`}
                      data-testid={`user-toggle-${u.mobile}`}
                      title={self ? "You cannot deactivate yourself" : "Click to toggle"}
                    >
                      <span className={`size-1.5 rounded-full ${u.is_active ? "bg-green-600" : "bg-stone-500"}`} />
                      {u.is_active ? "Active" : "Inactive"}
                    </button>
                  </TableCell>
                  <TableCell data-testid={`user-wallet-${u.mobile}`}>
                    {u.role === "user" ? (
                      <button
                        type="button"
                        onClick={() => setWalletUser(u)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-mono text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
                        data-testid={`user-wallet-button-${u.mobile}`}
                        title="Add / remove money"
                      >
                        <Wallet className="size-3.5" /> ₹{(u.wallet_balance ?? 0).toLocaleString("en-IN")}
                      </button>
                    ) : (
                      <span className="text-xs text-stone-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-stone-500">{formatIST(u.last_login)}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setMode({ kind: "edit", user: u })}
                      data-testid={`user-edit-${u.mobile}`}
                      title="Edit"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setMode({ kind: "reset", user: u })}
                      data-testid={`user-reset-${u.mobile}`}
                      title="Reset password"
                    >
                      <KeyRound className="size-4" />
                    </Button>
                    {!self && (
                      <ConfirmDelete
                        title={`Delete ${u.name}?`}
                        description="This permanently removes the login. This cannot be undone."
                        testId={`user-delete-${u.mobile}`}
                        trigger={<Trash2 className="size-4" />}
                        onConfirm={async () => {
                          try {
                            await apiDelete<Ok>(`/admin/users/${u.id}`);
                            toast.success("User deleted");
                            refresh();
                          } catch (e) {
                            toast.error(errorMessage(e));
                          }
                        }}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {!isLoading && users.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-stone-500" data-testid="users-empty">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {(mode?.kind === "create" || mode?.kind === "edit") && (
        <UserFormDialog key={mode.kind === "edit" ? mode.user.id : "new"} mode={mode} onClose={() => setMode(null)} />
      )}
      {mode?.kind === "reset" && <ResetPasswordDialog key={mode.user.id} mode={mode} onClose={() => setMode(null)} />}
      <AdjustDialog key={walletUser?.id ?? "none"} user={walletUser} onClose={() => setWalletUser(null)} />
    </div>
  );
}
