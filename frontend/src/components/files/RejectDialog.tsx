import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiPost } from "@/lib/api";
import { errorMessage, formatINR } from "@/lib/hooks";
import type { AttachmentOut, RejectFileIn } from "@/lib/types";

// Admin-only: reject a submitted file and give the fee back to the user's wallet.
export default function RejectDialog({ a }: { a: AttachmentOut }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const refundable = a.fee_charged > 0 && !a.fee_refunded;

  const reject = useMutation({
    mutationFn: () => apiPost<AttachmentOut>(`/attachments/${a.id}/reject`, { reason } satisfies RejectFileIn),
    onSuccess: (r) => {
      toast.success(r.fee_refunded && refundable ? `File rejected · ${formatINR(a.fee_charged)} refunded to ${a.user_name}` : "File rejected");
      setOpen(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["attachment", a.id] });
      qc.invalidateQueries({ queryKey: ["attachments"] });
      qc.invalidateQueries({ queryKey: ["daily-report"] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not reject")),
  });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="border-red-200 text-red-700 hover:bg-red-50 transition-colors duration-150"
        onClick={() => setOpen(true)}
        data-testid="detail-reject-button"
      >
        <Ban className="size-4" /> Reject
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="reject-dialog">
          <DialogHeader>
            <DialogTitle>Reject this file?</DialogTitle>
            <DialogDescription>
              The timer stops and the user sees it as Rejected.{" "}
              {refundable ? (
                <strong data-testid="reject-refund-note">{formatINR(a.fee_charged)} goes back to {a.user_name}'s wallet.</strong>
              ) : (
                <span data-testid="reject-refund-note">No fee to refund for this file.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason (shown to the user)</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              maxLength={500}
              placeholder="e.g. Photo is blurry, please upload a clear copy"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="reject-reason-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} data-testid="reject-cancel-button">
              Cancel
            </Button>
            <Button variant="destructive" disabled={reject.isPending} onClick={() => reject.mutate()} data-testid="reject-confirm-button">
              {reject.isPending ? "Rejecting…" : refundable ? "Reject & refund" : "Reject file"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
