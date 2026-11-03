import { Loader2, ScanText } from "lucide-react";
import type { AttachmentOut } from "@/lib/types";

// Receipt number + name read offline from the latest receipt, shown beside the service.
export default function ReceiptChip({ a, size = "sm" }: { a: AttachmentOut; size?: "sm" | "md" }) {
  if (!a.receipt_ocr) return null;
  const cls = size === "md" ? "text-xs px-2.5 py-1" : "text-[11px] px-2 py-0.5";
  if (a.receipt_ocr === "pending")
    return (
      <span className={`ml-1.5 inline-flex items-center gap-1 align-middle rounded-full bg-stone-100 text-stone-600 font-semibold ${cls}`} data-testid={`receipt-ocr-pending-${a.id}`}>
        <Loader2 className="size-3 animate-spin" /> Reading receipt…
      </span>
    );
  if (a.receipt_ocr !== "done")
    return (
      <span className={`ml-1.5 inline-flex items-center gap-1 align-middle rounded-full bg-stone-100 text-stone-500 font-medium ${cls}`} data-testid={`receipt-ocr-none-${a.id}`}>
        <ScanText className="size-3" /> No number found on receipt
      </span>
    );
  return (
    <span
      className={`ml-1.5 inline-flex items-center gap-1 align-middle rounded-full bg-green-100 text-green-900 font-semibold ${cls}`}
      data-testid={`receipt-chip-${a.id}`}
    >
      <ScanText className="size-3" />
      {a.receipt_number && <span className="font-mono" data-testid={`receipt-number-${a.id}`}>{a.receipt_number}</span>}
      {a.receipt_number && a.receipt_name && <span className="opacity-60">·</span>}
      {a.receipt_name && <span data-testid={`receipt-name-${a.id}`}>{a.receipt_name}</span>}
    </span>
  );
}
