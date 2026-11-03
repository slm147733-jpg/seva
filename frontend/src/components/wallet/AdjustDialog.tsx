import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiPost } from "@/lib/api";
import { errorMessage, formatINR } from "@/lib/hooks";
import type { AdjustIn, UserOut, WalletTxn } from "@/lib/types";

export function invalidateWallet(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["admin-users"] });
  qc.invalidateQueries({ queryKey: ["admin-wallet-requests"] });
  qc.invalidateQueries({ queryKey: ["admin-wallet-txns"] });
}

// Admin: add or remove money from one user's wallet.
export default function AdjustDialog({ user, onClose }: { user: UserOut | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () =>
      apiPost<WalletTxn>(`/admin/wallet/users/${user?.id}/adjust`, { amount: Number(amount), direction, reason } satisfies AdjustIn),
    onSuccess: (t) => {
      toast.success(`${direction === "add" ? "Added" : "Removed"} ${formatINR(t.amount)} · new balance ${formatINR(t.balance_after)}`);
      invalidateWallet(qc);
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="wallet-adjust-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="size-5 text-orange-600" /> Wallet — {user?.name}
          </DialogTitle>
          <DialogDescription>
            Current balance <strong className="font-mono" data-testid="wallet-adjust-current">{formatINR(user?.wallet_balance ?? 0)}</strong>
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!(Number(amount) > 0)) return toast.error("Enter an amount greater than 0");
            save.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {(["add", "remove"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDirection(d)}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  direction === d
                    ? d === "add" ? "border-green-500 bg-green-50 text-green-800" : "border-red-400 bg-red-50 text-red-700"
                    : "border-stone-200 text-stone-600 hover:bg-stone-50"
                }`}
                data-testid={`wallet-adjust-${d}`}
              >
                {d === "add" ? <Plus className="size-4" /> : <Minus className="size-4" />} {d === "add" ? "Add money" : "Remove money"}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-amt">Amount (₹)</Label>
            <Input id="adj-amt" type="number" min={1} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required data-testid="wallet-adjust-amount" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">Reason (shown to the user)</Label>
            <Input id="adj-reason" placeholder="e.g. Cash paid at counter" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="wallet-adjust-reason" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={save.isPending} data-testid="wallet-adjust-submit">
              {direction === "add" ? "Add to wallet" : "Remove from wallet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
