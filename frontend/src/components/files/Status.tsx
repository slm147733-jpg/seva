import { Ban, CheckCircle2, Circle, Eye, Loader2, Timer } from "lucide-react";
import { formatDuration, useTick } from "@/lib/live";
import type { AttachmentOut, FileStatus } from "@/lib/types";

const META: Record<FileStatus, { label: string; cls: string; icon: typeof Circle }> = {
  not_started: { label: "Not yet started", cls: "bg-stone-100 text-stone-700 border-stone-200", icon: Circle },
  seen: { label: "Seen", cls: "bg-sky-50 text-sky-800 border-sky-200", icon: Eye },
  processing: { label: "Processing", cls: "bg-amber-100 text-amber-900 border-amber-300", icon: Loader2 },
  generated: { label: "Generated", cls: "bg-green-100 text-green-800 border-green-300", icon: CheckCircle2 },
  rejected: { label: "Rejected", cls: "bg-red-50 text-red-700 border-red-200", icon: Ban },
};

export const STATUS_LABELS: Record<FileStatus, string> = {
  not_started: META.not_started.label,
  seen: META.seen.label,
  processing: META.processing.label,
  generated: META.generated.label,
  rejected: META.rejected.label,
};

export function StatusBadge({ status, testId }: { status: FileStatus; testId?: string }) {
  const m = META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${m.cls}`}
      data-testid={testId}
      data-status={status}
    >
      <m.icon className={`size-3.5 ${status === "processing" ? "animate-spin [animation-duration:2.5s]" : ""}`} />
      {m.label}
    </span>
  );
}

// Timer runs from the moment the user submits (every status) and freezes at Generated / Rejected.
export function StatusTimer({ a, testId }: { a: AttachmentOut; testId?: string }) {
  const live = a.status !== "generated" && a.status !== "rejected";
  const now = useTick(live);
  const start = Date.parse(a.created_at);
  if (a.status === "rejected" && a.rejected_at) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs text-red-700" data-testid={testId}>
        <Timer className="size-3.5" /> Stopped {formatDuration(Date.parse(a.rejected_at) - start)}
      </span>
    );
  }
  if (a.status === "generated" && a.generated_at) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs text-green-800" data-testid={testId}>
        <Timer className="size-3.5" /> Total {formatDuration(Date.parse(a.generated_at) - start)}
      </span>
    );
  }
  const color = a.status === "processing" ? "text-amber-800" : a.status === "seen" ? "text-sky-800" : "text-stone-600";
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-xs ${color}`} data-testid={testId}>
      <Timer className="size-3.5" /> {formatDuration(now - start)}
    </span>
  );
}
