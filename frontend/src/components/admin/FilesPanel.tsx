import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import AttachmentList from "@/components/files/AttachmentList";
import AttachmentDetail from "@/components/files/AttachmentDetail";
import StatusFilter, { applyStatusFilter, type StatusFilterValue } from "@/components/files/StatusFilter";
import type { AttachmentOut } from "@/lib/types";
import { PanelHeader } from "./common";

// Data comes from the dashboard-level live feed (one poller → one set of notifications).
export default function FilesPanel({ adminId, items }: { adminId: string; items: AttachmentOut[] }) {
  const [filter, setFilter] = useState<StatusFilterValue>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = applyStatusFilter(items, filter).filter((a) =>
    `${a.user_name} ${a.user_mobile} ${a.file.filename}`.toLowerCase().includes(q.toLowerCase()),
  );

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
      <AttachmentList items={shown} showUser onOpen={setOpenId} emptyText="No files here yet." />
      <AttachmentDetail id={openId} role="admin" myId={adminId} onClose={() => setOpenId(null)} />
    </div>
  );
}
