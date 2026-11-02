import { FileImage, FileText, MessageSquare } from "lucide-react";
import { formatIST } from "@/lib/hooks";
import { formatBytes } from "@/lib/live";
import type { AttachmentOut } from "@/lib/types";
import { StatusBadge, StatusTimer } from "./Status";

export function FileIcon({ type, className = "size-5" }: { type: string; className?: string }) {
  return type === "application/pdf" ? (
    <FileText className={`${className} text-red-600`} />
  ) : (
    <FileImage className={`${className} text-sky-600`} />
  );
}

export default function AttachmentList({ items, showUser, onOpen, emptyText, selected, onToggle }: {
  items: AttachmentOut[];
  showUser: boolean;
  onOpen: (id: string) => void;
  emptyText: string;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-stone-200 bg-white px-5 py-10 text-center text-stone-500" data-testid="attachments-empty">
        {emptyText}
      </p>
    );
  }
  return (
    <ul className="rounded-2xl border border-stone-200 bg-white divide-y divide-stone-100 overflow-hidden" data-testid="attachments-list">
      {items.map((a) => (
        <li key={a.id} className={`flex items-center ${selected?.has(a.id) ? "bg-orange-50" : ""}`}>
          {onToggle && (
            <label className="pl-4 md:pl-5 py-3.5 cursor-pointer">
              <input
                type="checkbox"
                className="size-4 accent-orange-600 cursor-pointer"
                checked={selected?.has(a.id) ?? false}
                onChange={() => onToggle(a.id)}
                aria-label={`Select ${a.file.filename}`}
                data-testid={`attachment-select-${a.id}`}
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => onOpen(a.id)}
            className={`flex-1 min-w-0 text-left px-4 md:px-5 py-3.5 grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_auto] items-center gap-x-4 gap-y-2 transition-colors duration-150 hover:bg-orange-50/60 ${
              a.unread ? "bg-amber-50/70" : ""
            }`}
            data-testid={`attachment-row-${a.id}`}
          >
            <span className="relative grid size-10 place-items-center rounded-xl bg-stone-100">
              <FileIcon type={a.file.content_type} />
              {a.unread && (
                <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-orange-600 ring-2 ring-white" data-testid={`attachment-unread-${a.id}`} />
              )}
            </span>
            <div className="min-w-0">
              <p className="font-medium truncate" data-testid={`attachment-name-${a.id}`}>
                {a.file.filename}
                <span
                  className="ml-2 align-middle rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
                  data-testid={`attachment-service-${a.id}`}
                >
                  {a.service_name}
                </span>
              </p>
              <p className="text-xs text-stone-500 truncate">
                {showUser && (
                  <span className="font-semibold text-stone-700">
                    {a.user_name} · <span className="font-mono">{a.user_mobile}</span> ·{" "}
                  </span>
                )}
                {formatBytes(a.file.size)} · {formatIST(a.created_at)}
              </p>
              <p className="text-xs text-stone-500 truncate mt-0.5">{a.last_event_text}</p>
            </div>
            <div className="col-start-2 md:col-start-auto flex items-center gap-3">
              <StatusBadge status={a.status} testId={`attachment-status-${a.id}`} />
              <StatusTimer a={a} testId={`attachment-timer-${a.id}`} />
            </div>
            <span className="hidden md:inline-flex items-center gap-1 text-xs text-stone-500">
              <MessageSquare className="size-3.5" /> {a.message_count}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
