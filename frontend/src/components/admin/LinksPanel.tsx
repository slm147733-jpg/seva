import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errorMessage, normalizeUrl } from "@/lib/hooks";
import type { Audience, Link, LinkIn, Ok } from "@/lib/types";
import { ConfirmDelete, PanelHeader } from "./common";

const AUDIENCE_LABELS: Record<string, string> = {
  both: "Website + Users",
  public: "Public website only",
  users: "Logged-in users only",
};

function LinkDialog({ link, nextOrder, onClose }: { link: Link | null; nextOrder: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<LinkIn>({
    title: link?.title ?? "",
    url: link?.url ?? "",
    description: link?.description ?? "",
    category: link?.category ?? "General",
    audience: link?.audience ?? "both",
    is_active: link?.is_active ?? true,
    order: link?.order ?? nextOrder,
  });
  const save = useMutation({
    mutationFn: () => (link ? apiPut<Link>(`/admin/links/${link.id}`, form) : apiPost<Link>("/admin/links", form)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-links"] });
      qc.invalidateQueries({ queryKey: ["site"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(link ? "Link updated" : "Link added");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{link ? "Edit link" : "Add website link"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          data-testid="link-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="l-title">Title</Label>
            <Input
              id="l-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
              data-testid="link-form-title-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="l-url">URL</Label>
            <Input
              id="l-url"
              placeholder="https://example.gov.in"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              required
              data-testid="link-form-url-input"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="l-cat">Category</Label>
              <Input
                id="l-cat"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                data-testid="link-form-category-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Show to</Label>
              <Select value={form.audience} onValueChange={(v: string) => setForm({ ...form, audience: v as Audience })}>
                <SelectTrigger className="w-full" data-testid="link-form-audience-select">
                  <SelectValue>{(v) => AUDIENCE_LABELS[v as string]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(AUDIENCE_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v} data-testid={`audience-option-${v}`}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="l-desc">Description</Label>
            <Input
              id="l-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              data-testid="link-form-description-input"
            />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.is_active}
                onCheckedChange={(c) => setForm({ ...form, is_active: !!c })}
                data-testid="link-form-active-checkbox"
              />
              Visible
            </label>
            <label className="flex items-center gap-2 text-sm">
              Order
              <Input
                type="number"
                className="w-20"
                value={form.order}
                onChange={(e) => setForm({ ...form, order: Number(e.target.value) || 0 })}
                data-testid="link-form-order-input"
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} data-testid="link-form-submit-button">
              {link ? "Save link" : "Add link"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function LinksPanel() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Link | "new" | null>(null);
  const { data, isError, isLoading } = useQuery({ queryKey: ["admin-links"], queryFn: () => apiGet<Link[]>("/admin/links") });
  const links = data && !isError ? data : [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-links"] });
    qc.invalidateQueries({ queryKey: ["site"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const toggle = useMutation({
    mutationFn: (l: Link) => {
      const { id: _id, created_at: _c, ...rest } = l;
      return apiPut<Link>(`/admin/links/${l.id}`, { ...rest, is_active: !l.is_active });
    },
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <PanelHeader
        title="Website links"
        subtitle="Add or edit service links shown on the website and in every user's portal."
        action={
          <Button onClick={() => setEditing("new")} className="h-10" data-testid="admin-create-link-button">
            <Plus className="size-4" /> Add link
          </Button>
        }
      />
      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <Table data-testid="links-table">
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead>#</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Shown to</TableHead>
              <TableHead>Visible</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map((l) => (
              <TableRow key={l.id} data-testid={`link-row-${l.id}`}>
                <TableCell className="font-mono text-xs text-stone-400">{l.order}</TableCell>
                <TableCell className="py-2.5">
                  <p className="font-medium">{l.title}</p>
                  <p className="text-xs text-stone-500 truncate max-w-[260px]">{l.url}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{l.category}</Badge>
                </TableCell>
                <TableCell className="text-sm">{AUDIENCE_LABELS[l.audience]}</TableCell>
                <TableCell>
                  <Checkbox
                    checked={l.is_active}
                    onCheckedChange={() => toggle.mutate(l)}
                    data-testid={`link-toggle-${l.id}`}
                  />
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <a
                    href={normalizeUrl(l.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex p-1.5 rounded-md hover:bg-stone-100 align-middle"
                    data-testid={`link-open-${l.id}`}
                  >
                    <ExternalLink className="size-4" />
                  </a>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(l)} data-testid={`link-edit-${l.id}`}>
                    <Pencil className="size-4" />
                  </Button>
                  <ConfirmDelete
                    title={`Delete "${l.title}"?`}
                    description="This link will be removed everywhere."
                    testId={`link-delete-${l.id}`}
                    trigger={<Trash2 className="size-4" />}
                    onConfirm={async () => {
                      try {
                        await apiDelete<Ok>(`/admin/links/${l.id}`);
                        toast.success("Link deleted");
                        refresh();
                      } catch (e) {
                        toast.error(errorMessage(e));
                      }
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && links.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-stone-500" data-testid="links-empty">
                  No links yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {editing && (
        <LinkDialog
          key={editing === "new" ? "new" : editing.id}
          link={editing === "new" ? null : editing}
          nextOrder={links.length + 1}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
