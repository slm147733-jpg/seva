import type { AttachmentOut, FileStatus } from "@/lib/types";
import { STATUS_LABELS } from "./Status";

export type StatusFilterValue = FileStatus | "all";
const FILTERS: StatusFilterValue[] = ["all", "not_started", "seen", "processing", "generated", "rejected"];

export function applyStatusFilter(items: AttachmentOut[], value: StatusFilterValue): AttachmentOut[] {
  return value === "all" ? items : items.filter((a) => a.status === value);
}

export default function StatusFilter({ items, value, onChange, testPrefix }: {
  items: AttachmentOut[];
  value: StatusFilterValue;
  onChange: (v: StatusFilterValue) => void;
  testPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid={`${testPrefix}-filters`}>
      {FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 ${
            value === f ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-600 hover:bg-stone-100"
          }`}
          data-testid={`${testPrefix}-filter-${f}`}
        >
          {f === "all" ? "All" : STATUS_LABELS[f]}{" "}
          <span className="ml-1 font-mono text-xs opacity-70" data-testid={`${testPrefix}-filter-count-${f}`}>
            {applyStatusFilter(items, f).length}
          </span>
        </button>
      ))}
    </div>
  );
}
