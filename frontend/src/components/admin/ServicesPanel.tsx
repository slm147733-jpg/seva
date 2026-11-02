import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errorMessage, formatINR } from "@/lib/hooks";
import { Textarea } from "@/components/ui/textarea";
import type { Ok, Service, ServiceIn } from "@/lib/types";
import { ConfirmDelete, PanelHeader } from "./common";

function refresh(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["admin-services"] });
  qc.invalidateQueries({ queryKey: ["admin-users"] });
}

function ServiceDialog({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ServiceIn>({
    name: service?.name ?? "",
    description: service?.description ?? "",
    is_active: service?.is_active ?? true,
    fee: service?.fee ?? 0,
    required_documents: service?.required_documents ?? [],
  });
  const [docsText, setDocsText] = useState((service?.required_documents ?? []).join("\n"));
  const save = useMutation({
    mutationFn: () => {
      const body: ServiceIn = { ...form, required_documents: docsText.split("\n").map((d) => d.trim()).filter(Boolean) };
      return service ? apiPut<Service>(`/admin/services/${service.id}`, body) : apiPost<Service>("/admin/services", body);
    },
    onSuccess: () => {
      refresh(qc);
      toast.success(service ? "Service updated" : "Service added");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{service ? "Edit service" : "Add service"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          data-testid="service-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="sv-name">Service name</Label>
            <Input
              id="sv-name"
              placeholder="e.g. PAN card – new application"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              minLength={2}
              data-testid="service-form-name-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sv-desc">Description (optional)</Label>
            <Input
              id="sv-desc"
              placeholder="Documents needed, notes for users…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              data-testid="service-form-description-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sv-fee">Service fee (₹)</Label>
            <div className="flex">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 text-sm text-stone-600">₹</span>
              <Input
                id="sv-fee"
                type="number"
                min={0}
                step="1"
                className="rounded-l-none"
                value={form.fee}
                onChange={(e) => setForm({ ...form, fee: Math.max(0, Number(e.target.value) || 0) })}
                data-testid="service-form-fee-input"
              />
            </div>
            <p className="text-xs text-stone-500">Use 0 for a free service. Users see this amount when they pick the service.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sv-docs">Required documents (one per line)</Label>
            <Textarea
              id="sv-docs"
              rows={4}
              placeholder={"Aadhaar card\nPassport size photo\nAddress proof"}
              value={docsText}
              onChange={(e) => setDocsText(e.target.value)}
              data-testid="service-form-documents-input"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.is_active}
              onCheckedChange={(c) => setForm({ ...form, is_active: !!c })}
              data-testid="service-form-active-checkbox"
            />
            Active (users can pick it)
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} data-testid="service-form-submit-button">
              {service ? "Save service" : "Add service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ServicesPanel() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const { data, isError, isLoading } = useQuery({ queryKey: ["admin-services"], queryFn: () => apiGet<Service[]>("/admin/services") });
  const services = data && !isError ? data : [];

  return (
    <div>
      <PanelHeader
        title="Services"
        subtitle="Create the work types you handle, then give them to users in the Users tab. Users can only upload for their services."
        action={
          <Button onClick={() => setEditing("new")} className="h-10" data-testid="admin-create-service-button">
            <Plus className="size-4" /> Add service
          </Button>
        }
      />
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <Table data-testid="services-table">
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead>Service</TableHead>
              <TableHead>Fee</TableHead>
              <TableHead>Documents</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((s) => (
              <TableRow key={s.id} data-testid={`service-row-${s.id}`}>
                <TableCell className="py-2.5">
                  <p className="font-medium" data-testid={`service-name-${s.id}`}>{s.name}</p>
                  {s.description && <p className="text-xs text-stone-500">{s.description}</p>}
                </TableCell>
                <TableCell className="font-mono text-sm" data-testid={`service-fee-${s.id}`}>{formatINR(s.fee)}</TableCell>
                <TableCell className="max-w-[240px]" data-testid={`service-docs-${s.id}`}>
                  {s.required_documents.length === 0 ? (
                    <span className="text-xs text-stone-400">None listed</span>
                  ) : (
                    <span className="text-xs text-stone-600 line-clamp-2">{s.required_documents.join(", ")}</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm" data-testid={`service-users-${s.id}`}>{s.user_count}</TableCell>
                <TableCell>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.is_active ? "bg-green-100 text-green-800" : "bg-stone-200 text-stone-600"}`}
                  >
                    {s.is_active ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(s)} data-testid={`service-edit-${s.id}`}>
                    <Pencil className="size-4" />
                  </Button>
                  <ConfirmDelete
                    title={`Delete "${s.name}"?`}
                    description={`It will be removed from ${s.user_count} user(s). Files already sent keep this service name.`}
                    testId={`service-delete-${s.id}`}
                    trigger={<Trash2 className="size-4" />}
                    onConfirm={async () => {
                      try {
                        await apiDelete<Ok>(`/admin/services/${s.id}`);
                        toast.success("Service deleted");
                        refresh(qc);
                      } catch (e) {
                        toast.error(errorMessage(e));
                      }
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && services.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-stone-500" data-testid="services-empty">
                  No services yet. Add your first one (e.g. "Aadhaar update").
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {editing && (
        <ServiceDialog key={editing === "new" ? "new" : editing.id} service={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
