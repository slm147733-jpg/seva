import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import AttachmentList from "@/components/files/AttachmentList";
import AttachmentDetail from "@/components/files/AttachmentDetail";
import { STATUS_LABELS } from "@/components/files/Status";
import type { AttachmentOut, FileStatus } from "@/lib/types";
import { PanelHeader } from "./common";

const FILTERS: (FileStatus | "all")[] = ["all", "not_started", "seen", "processing", "generated"];

// Data comes from the dashboard-level live feed (one poller → one set of notifications).
export default function FilesPanel({ adminId, items }: { adminId: string; items: AttachmentOut[] }) {
  const [filter, setFilter] = useState<FileStatus | "all">("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === "all" ? items.length : items.filter((a) => a.status === f).length]));
  const shown = items.filter(
    (a) =>
      (filter === "all" || a.status === filter) &&
      `${a.user_name} ${a.user_mobile} ${a.file.filename}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <PanelHeader
        title="User files"
        subtitle="Open a file to mark it Seen. After a minute it moves to Processing and the timer starts. Attach the receipt to mark it Generated."
      />
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap gap-2" data-testid="files-filters">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
                filter === f ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-100"
              }`}
              data-testid={`files-filter-${f}`}
            >
              {f === "all" ? "All" : STATUS_LABELS[f]} <span className="ml-1 font-mono text-xs opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>
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
      <AttachmentList items={shown} showUser onOpen={setOpenId} emptyText="No files here yet." />
      <AttachmentDetail id={openId} role="admin" myId={adminId} onClose={() => setOpenId(null)} />
    </div>
  );
}
