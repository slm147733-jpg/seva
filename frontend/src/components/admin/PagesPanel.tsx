import { useState, type FormEvent } from "react";
import { Link as RouterLink } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { errorMessage, formatIST } from "@/lib/hooks";
import type { Ok, Page, PageIn } from "@/lib/types";
import { ConfirmDelete, PanelHeader } from "./common";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function PageDialog({ page, nextOrder, onClose }: { page: Page | null; nextOrder: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [slugTouched, setSlugTouched] = useState(!!page);
  const [form, setForm] = useState<PageIn>({
    title: page?.title ?? "",
    slug: page?.slug ?? "",
    excerpt: page?.excerpt ?? "",
    content: page?.content ?? "",
    show_in_nav: page?.show_in_nav ?? true,
    order: page?.order ?? nextOrder,
  });

  const save = useMutation({
    mutationFn: () => (page ? apiPut<Page>(`/admin/pages/${page.id}`, form) : apiPost<Page>("/admin/pages", form)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-pages"] });
      qc.invalidateQueries({ queryKey: ["site"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["page"] });
      toast.success(page ? "Page updated — live now" : "Page published");
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{page ? "Edit page" : "New page"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          data-testid="page-form"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-title">Title</Label>
              <Input
                id="p-title"
                value={form.title}
                onChange={(e) =>
                  setForm({ ...form, title: e.target.value, slug: slugTouched ? form.slug : slugify(e.target.value) })
                }
                required
                data-testid="page-form-title-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-slug">URL slug</Label>
              <div className="flex">
                <span className="inline-flex items-center rounded-l-lg border border-r-0 border-input bg-muted px-2 text-xs text-stone-500">
                  /p/
                </span>
                <Input
                  id="p-slug"
                  className="rounded-l-none"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm({ ...form, slug: slugify(e.target.value) });
                  }}
                  required
                  data-testid="page-form-slug-input"
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-excerpt">Short summary</Label>
            <Input
              id="p-excerpt"
              value={form.excerpt}
              onChange={(e) => setForm({ ...form, excerpt: e.target.value })}
              data-testid="page-form-excerpt-input"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-content">Content</Label>
            <Textarea
              id="p-content"
              rows={10}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder={"Write paragraphs separated by a blank line.\n\n- Start lines with a dash for bullet points"}
              data-testid="page-form-content-input"
            />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.show_in_nav}
                onCheckedChange={(c) => setForm({ ...form, show_in_nav: !!c })}
                data-testid="page-form-nav-checkbox"
              />
              Show on home page & menu
            </label>
            <label className="flex items-center gap-2 text-sm">
              Order
              <Input
                type="number"
                className="w-20"
                value={form.order}
                onChange={(e) => setForm({ ...form, order: Number(e.target.value) || 0 })}
                data-testid="page-form-order-input"
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} data-testid="page-form-submit-button">
              {page ? "Save & publish" : "Publish page"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PagesPanel() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Page | "new" | null>(null);
  const { data, isError, isLoading } = useQuery({ queryKey: ["admin-pages"], queryFn: () => apiGet<Page[]>("/admin/pages") });
  const pages = data && !isError ? data : [];

  return (
    <div>
      <PanelHeader
        title="Website pages"
        subtitle="Pages marked 'Show on home page' appear in the public menu and home page instantly."
        action={
          <Button onClick={() => setEditing("new")} className="h-10" data-testid="admin-create-page-button">
            <Plus className="size-4" /> New page
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {pages.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border border-stone-200 bg-white p-5 flex flex-col gap-3 hover:shadow-md transition-shadow duration-200"
            data-testid={`page-item-${p.slug}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-lg font-bold">{p.title}</h3>
                <p className="font-mono text-xs text-stone-500">/p/{p.slug}</p>
              </div>
              <Badge variant={p.show_in_nav ? "default" : "outline"}>{p.show_in_nav ? "In menu" : "Hidden"}</Badge>
            </div>
            <p className="text-sm text-stone-600 line-clamp-2">{p.excerpt || "No summary"}</p>
            <div className="flex items-center justify-between border-t border-stone-100 pt-3">
              <span className="text-xs text-stone-400">
                #{p.order} · {formatIST(p.updated_at)}
              </span>
              <div className="flex items-center gap-1">
                <RouterLink
                  to={`/p/${p.slug}`}
                  target="_blank"
                  className="p-1.5 rounded-md hover:bg-stone-100"
                  data-testid={`page-view-${p.slug}`}
                  title="View live"
                >
                  <Eye className="size-4" />
                </RouterLink>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditing(p)} data-testid={`page-edit-${p.slug}`}>
                  <Pencil className="size-4" />
                </Button>
                <ConfirmDelete
                  title={`Delete "${p.title}"?`}
                  description="The page will be removed from the website immediately."
                  testId={`page-delete-${p.slug}`}
                  trigger={<Trash2 className="size-4" />}
                  onConfirm={async () => {
                    try {
                      await apiDelete<Ok>(`/admin/pages/${p.id}`);
                      toast.success("Page deleted");
                      qc.invalidateQueries({ queryKey: ["admin-pages"] });
                      qc.invalidateQueries({ queryKey: ["site"] });
                      qc.invalidateQueries({ queryKey: ["stats"] });
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                />
              </div>
            </div>
          </div>
        ))}
        {!isLoading && pages.length === 0 && (
          <p className="text-stone-500" data-testid="pages-empty">
            No pages yet. Create your first page.
          </p>
        )}
      </div>
      {editing && (
        <PageDialog
          key={editing === "new" ? "new" : editing.id}
          page={editing === "new" ? null : editing}
          nextOrder={pages.length + 1}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
