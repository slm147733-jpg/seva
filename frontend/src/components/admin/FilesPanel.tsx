import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AttachmentList from "@/components/files/AttachmentList";
import AttachmentDetail from "@/components/files/AttachmentDetail";
import StatusFilter, { applyStatusFilter, type StatusFilterValue } from "@/components/files/StatusFilter";
import { apiPost } from "@/lib/api";
import { errorMessage } from "@/lib/hooks";
import type { AttachmentOut, DeleteResult } from "@/lib/types";
import { PanelHeader } from "./common";

export function invalidateFileQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["attachments"] });
  qc.invalidateQueries({ queryKey: ["daily-report"] });
  qc.invalidateQueries({ queryKey: ["whatsapp-alerts"] });
}

// Data comes from the dashboard-level live feed (one poller → one set of notifications).
export default function FilesPanel({ adminId, items }: { adminId: string; items: AttachmentOut[] }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<StatusFilterValue>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const shown = applyStatusFilter(items, filter).filter((a) =>
    `${a.user_name} ${a.user_mobile} ${a.file.filename}`.toLowerCase().includes(q.toLowerCase()),
  );
  // Only count selections that still exist (live feed may have removed some).
  const liveSelected = items.filter((a) => selected.has(a.id)).map((a) => a.id);
  const allShownSelected = shown.length > 0 && shown.every((a) => selected.has(a.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAllShown = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      shown.forEach((a) => (allShownSelected ? next.delete(a.id) : next.add(a.id)));
      return next;
    });

  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) => apiPost<DeleteResult>("/attachments/bulk-delete", { ids }),
    onSuccess: (r) => {
      toast.success(`Deleted ${r.deleted} file${r.deleted === 1 ? "" : "s"}`);
      setSelected(new Set());
      setConfirmOpen(false);
      invalidateFileQueries(qc);
    },
    onError: (e) => toast.error(errorMessage(e, "Could not delete")),
  });

  return (
    <div>
      <PanelHeader
        title="User files"
        subtitle="Open a file to mark it Seen. After a minute it moves to Processing and the timer starts. Attach the receipt to mark it Generated."
      />
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
        <StatusFilter items={items} value={filter} onChange={setFilter} testPrefix="files" />
        <div className="relative lg:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-stone-400" />
          <Input
            placeholder="Search user, mobile or file"
            className="pl-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="files-search-input"
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-2.5" data-testid="files-bulk-bar">
        <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
          <input
            type="checkbox"
            className="size-4 accent-orange-600"
            checked={allShownSelected}
            onChange={toggleAllShown}
            disabled={shown.length === 0}
            data-testid="files-select-all"
          />
          Select all shown ({shown.length})
        </label>
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone-500" data-testid="files-selected-count">
            {liveSelected.length} selected
          </span>
          {liveSelected.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} data-testid="files-clear-selection">
              Clear
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            disabled={liveSelected.length === 0}
            onClick={() => setConfirmOpen(true)}
            data-testid="files-delete-selected-button"
          >
            <Trash2 className="size-4" /> Delete selected
          </Button>
        </div>
      </div>

      <AttachmentList items={shown} showUser onOpen={setOpenId} emptyText="No files here yet." selected={selected} onToggle={toggle} />
      <AttachmentDetail id={openId} role="admin" myId={adminId} onClose={() => setOpenId(null)} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent data-testid="files-delete-dialog">
          <DialogHeader>
            <DialogTitle>
              Delete {liveSelected.length} file{liveSelected.length === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This permanently removes the files, their remarks, receipts and WhatsApp alert entries for both you and the users. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} data-testid="files-delete-cancel">
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={bulkDelete.isPending}
              onClick={() => bulkDelete.mutate(liveSelected)}
              data-testid="files-delete-confirm"
            >
              {bulkDelete.isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
