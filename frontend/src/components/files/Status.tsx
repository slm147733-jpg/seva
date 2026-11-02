import { CheckCircle2, Circle, Eye, Loader2, Timer } from "lucide-react";
import { formatDuration, useTick } from "@/lib/live";
import type { AttachmentOut, FileStatus } from "@/lib/types";

const META: Record<FileStatus, { label: string; cls: string; icon: typeof Circle }> = {
  not_started: { label: "Not yet started", cls: "bg-stone-100 text-stone-700 border-stone-200", icon: Circle },
  seen: { label: "Seen", cls: "bg-sky-50 text-sky-800 border-sky-200", icon: Eye },
  processing: { label: "Processing", cls: "bg-amber-100 text-amber-900 border-amber-300", icon: Loader2 },
  generated: { label: "Generated", cls: "bg-green-100 text-green-800 border-green-300", icon: CheckCircle2 },
};

export const STATUS_LABELS: Record<FileStatus, string> = {
  not_started: META.not_started.label,
  seen: META.seen.label,
  processing: META.processing.label,
  generated: META.generated.label,
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

// Processing: live elapsed time since processing began. Generated: frozen total.
export function StatusTimer({ a, testId }: { a: AttachmentOut; testId?: string }) {
  const live = a.status === "processing";
  const now = useTick(live);
  if (a.status === "processing" && a.processing_at) {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs text-amber-800" data-testid={testId}>
        <Timer className="size-3.5" /> {formatDuration(now - Date.parse(a.processing_at))}
      </span>
    );
  }
  if (a.status === "generated" && a.generated_at) {
    const gen = Date.parse(a.generated_at);
    const proc = a.processing_at ? Date.parse(a.processing_at) : null;
    const start = proc && proc < gen ? proc : a.seen_at ? Date.parse(a.seen_at) : Date.parse(a.created_at);
    return (
      <span className="inline-flex items-center gap-1 font-mono text-xs text-green-800" data-testid={testId}>
        <Timer className="size-3.5" /> Total {formatDuration(gen - start)}
      </span>
    );
  }
  return null;
}
