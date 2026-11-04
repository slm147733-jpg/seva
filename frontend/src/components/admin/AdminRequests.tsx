import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ShieldCheck, ShieldQuestion, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import { errorMessage, formatIST } from "@/lib/hooks";
import type { AdminRequest, AdminScope, ApproveAdminIn, UserOut } from "@/lib/types";

// Owner-only: people who registered as admin from the login page, waiting for a decision.
export default function AdminRequests() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-requests"], queryFn: () => apiGet<AdminRequest[]>("/admin/admin-requests"), refetchInterval: 15000 });
  const done = () => {
    qc.invalidateQueries({ queryKey: ["admin-requests"] });
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };
  const approve = useMutation({
    mutationFn: ({ id, scope }: { id: string; scope: AdminScope }) =>
      apiPost<UserOut>(`/admin/admin-requests/${id}/approve`, { scope } satisfies ApproveAdminIn),
    onSuccess: (u) => {
      toast.success(`${u.name} can now sign in as ${u.admin_scope === "files" ? "a files-only" : "a full"} admin`);
      done();
    },
    onError: (e) => toast.error(errorMessage(e, "Could not approve")),
  });
  const reject = useMutation({
    mutationFn: (id: string) => apiPost<AdminRequest>(`/admin/admin-requests/${id}/reject`),
    onSuccess: () => {
      toast.success("Request rejected");
      done();
    },
    onError: (e) => toast.error(errorMessage(e, "Could not reject")),
  });
  const pending = (q.data ?? []).filter((r) => r.status === "pending");
  const recent = (q.data ?? []).filter((r) => r.status !== "pending").slice(0, 5);
  if (!q.data) return null;

  return (
    <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50/60 p-5" data-testid="admin-requests">
      <h2 className="font-heading text-lg font-bold flex items-center gap-2">
        <ShieldQuestion className="size-5 text-orange-600" /> Admin access requests
        {pending.length > 0 && (
          <span className="rounded-full bg-orange-600 px-2 py-0.5 text-xs font-bold text-white" data-testid="admin-requests-count">{pending.length}</span>
        )}
      </h2>
      <p className="text-sm text-stone-600">Only you (the owner) can approve. Choose what each new admin can do.</p>
      <ul className="mt-3 space-y-2">
        {pending.map((r) => (
          <li key={r.id} className="flex flex-col md:flex-row md:items-center gap-3 rounded-xl border border-stone-200 bg-white p-3" data-testid={`admin-request-${r.id}`}>
            <div className="flex-1">
              <p className="font-semibold">{r.name}</p>
              <p className="text-xs text-stone-500">
                <span className="font-mono">{r.mobile}</span> · requested {formatIST(r.created_at)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ id: r.id, scope: "full" })} data-testid={`admin-request-approve-full-${r.id}`}>
                <ShieldCheck className="size-4" /> Approve · full access
              </Button>
              <Button size="sm" variant="outline" disabled={approve.isPending} onClick={() => approve.mutate({ id: r.id, scope: "files" })} data-testid={`admin-request-approve-files-${r.id}`}>
                <Check className="size-4" /> Approve · files only
              </Button>
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" disabled={reject.isPending} onClick={() => reject.mutate(r.id)} data-testid={`admin-request-reject-${r.id}`}>
                <X className="size-4" /> Reject
              </Button>
            </div>
          </li>
        ))}
        {pending.length === 0 && <li className="text-sm text-stone-500" data-testid="admin-requests-empty">No requests waiting.</li>}
      </ul>
      {recent.length > 0 && (
        <p className="mt-3 text-xs text-stone-500" data-testid="admin-requests-recent">
          Recent:{" "}
          {recent.map((r) => `${r.name} (${r.status === "approved" ? (r.scope === "files" ? "approved · files only" : "approved · full") : "rejected"})`).join(" · ")}
        </p>
      )}
    </section>
  );
}
