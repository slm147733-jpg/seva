import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wallet, ArrowDownLeft, ArrowUpRight, Clock, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost } from "@/lib/api";
import { errorMessage, formatINR, formatIST } from "@/lib/hooks";
import { notify } from "@/lib/live";
import type { CreateOrderIn, CreateOrderOut, VerifyPaymentOut, WalletMe, WalletRequest } from "@/lib/types";
import { openCheckout } from "@/lib/razorpay";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const QUICK = [100, 200, 500, 1000];

const OPEN_EVENT = "sevakendra:open-wallet";
export const openWallet = () => window.dispatchEvent(new Event(OPEN_EVENT));

// Polls the wallet and chimes when the admin adds money or handles a payment.
function useLiveWallet() {
  const q = useQuery({ queryKey: ["wallet-me"], queryFn: () => apiGet<WalletMe>("/wallet/me"), refetchInterval: 5000 });
  const lastTxn = useRef<string | null | undefined>(undefined);
  const lastReq = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const d = q.data;
    if (!d) return;
    const newest = d.transactions[0]?.id ?? null;
    if (lastTxn.current !== undefined && newest && newest !== lastTxn.current) {
      const t = d.transactions[0];
      if (t.type === "credit") notify(`${rupees(t.amount)} added to your wallet`, `${t.reason} · Balance ${rupees(d.balance)}`);
      else if (t.created_by !== "system") notify(`${rupees(t.amount)} removed from your wallet`, t.reason);
    }
    lastTxn.current = newest;
    const prev = lastReq.current;
    if (prev) {
      d.requests
        .filter((r) => r.status === "rejected" && prev.get(r.id) === "pending")
        .forEach((r) => notify(`Payment …${r.txn_last5} could not be verified`, r.admin_note || "Please contact the admin."));
    }
    lastReq.current = new Map(d.requests.map((r) => [r.id, r.status]));
  }, [q.data]);
  return q;
}

const REQ_STYLE: Record<WalletRequest["status"], string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
};

export default function WalletButton({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const { data } = useLiveWallet();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, h);
    return () => window.removeEventListener(OPEN_EVENT, h);
  }, []);
  const [amount, setAmount] = useState("");
  const amt = Math.round(Number(amount) || 0);
  const valid = amt >= 1 && amt <= 1_000_000;

  const pay = useMutation({
    mutationFn: async () => {
      const order = await apiPost<CreateOrderOut>("/create-order", { amount: amt * 100 } satisfies CreateOrderIn);
      setOpen(false); // let the Razorpay modal take focus
      const r = await openCheckout(order, (msg) => toast.error(msg));
      if (r.kind === "dismissed") return { cancelled: true as const, lastError: r.lastError };
      const v = await apiPost<VerifyPaymentOut>("/verify-payment", r.payment);
      return { cancelled: false as const, v };
    },
    onSuccess: (r) => {
      if (r.cancelled) {
        toast.info(r.lastError ? "Payment not completed — no money was added" : "Payment cancelled");
        return;
      }
      toast.success(`${rupees(r.v.credited)} added · Balance ${rupees(r.v.balance)}`);
      setAmount("");
      qc.invalidateQueries({ queryKey: ["wallet-me"] });
    },
    onError: (e) => toast.error(errorMessage(e, e instanceof Error && !("status" in e) ? e.message : "Payment could not be completed")),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-gradient-to-r from-amber-100 to-yellow-100 px-3.5 py-1.5 text-sm font-semibold text-amber-950 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-[transform,box-shadow] duration-200"
        data-testid="wallet-button"
      >
        <Wallet className="size-4 text-orange-600" />
        {!compact && <span className="hidden sm:inline">Wallet</span>}
        <span className="font-mono" data-testid="wallet-balance">{data ? rupees(data.balance) : "₹—"}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto" data-testid="wallet-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="size-5 text-orange-600" /> My wallet
            </DialogTitle>
            <DialogDescription>Top up online in seconds. Service fees are paid from this balance.</DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl bg-gradient-to-br from-orange-600 to-amber-400 p-5 text-white">
            <p className="text-xs uppercase tracking-wider text-white/80">Available balance</p>
            <p className="mt-1 font-mono text-4xl font-bold" data-testid="wallet-dialog-balance">{data ? rupees(data.balance) : "—"}</p>
            <p className="mt-1 text-xs text-white/85">Service fees are paid from this wallet when you submit files.</p>
          </div>

          <form
            className="rounded-2xl border border-stone-200 p-4 space-y-3"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              pay.mutate();
            }}
            data-testid="wallet-topup-form"
          >
            <p className="font-semibold flex items-center gap-2">
              <CreditCard className="size-4 text-orange-600" /> Add money online
            </p>
            <div className="flex flex-wrap gap-2" data-testid="wallet-quick-amounts">
              {QUICK.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setAmount(String(n))}
                  className={`rounded-full border px-3.5 py-1.5 font-mono text-sm font-semibold transition-[background-color,color,transform] duration-150 active:scale-95 ${
                    Number(amount) === n ? "border-orange-600 bg-orange-600 text-white" : "border-stone-200 bg-white hover:bg-orange-50"
                  }`}
                  data-testid={`wallet-quick-${n}`}
                >
                  {rupees(n)}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-amt">Or enter any amount</Label>
              <Input
                id="w-amt"
                type="number"
                min={1}
                step="1"
                inputMode="numeric"
                placeholder="₹"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                data-testid="wallet-amount-input"
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={pay.isPending || !valid} data-testid="wallet-pay-online-button">
              {pay.isPending ? "Opening payment…" : valid ? `Pay ${rupees(amt)} online` : "Enter an amount (min ₹1)"}
            </Button>
            <p className="text-center text-[11px] text-stone-500">UPI, cards and net banking · secured by Razorpay · added to your wallet instantly</p>
          </form>

          {data && data.requests.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">My payments</p>
              <ul className="space-y-1.5" data-testid="wallet-requests">
                {data.requests.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm" data-testid={`wallet-request-${r.id}`}>
                    <span className="font-mono">…{r.txn_last5}</span>
                    <span className="text-stone-600">{r.credited_amount ? rupees(r.credited_amount) : r.amount ? rupees(r.amount) : "—"}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${REQ_STYLE[r.status]}`}>
                      {r.status === "pending" ? "Verifying" : r.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data && data.transactions.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-2">History</p>
              <ul className="divide-y divide-stone-100" data-testid="wallet-history">
                {data.transactions.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                    {t.type === "credit" ? <ArrowDownLeft className="size-4 text-green-600" /> : <ArrowUpRight className="size-4 text-red-600" />}
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{t.reason}</p>
                      <p className="text-[11px] text-stone-400 flex items-center gap-1"><Clock className="size-3" /> {formatIST(t.created_at)}</p>
                    </div>
                    <span className={`font-mono font-semibold ${t.type === "credit" ? "text-green-700" : "text-red-700"}`}>
                      {t.type === "credit" ? "+" : "−"}
                      {formatINR(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
