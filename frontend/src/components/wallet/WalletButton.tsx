import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Wallet, ArrowDownLeft, ArrowUpRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiGet, apiPost } from "@/lib/api";
import { errorMessage, formatINR, formatIST } from "@/lib/hooks";
import { notify } from "@/lib/live";
import type { WalletMe, WalletRequest, WalletRequestIn } from "@/lib/types";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function upiLink(upi: string, payee: string, amount?: number) {
  const p = new URLSearchParams({ pa: upi, pn: payee || "Sevakendra", cu: "INR", tn: "Sevakendra wallet top-up" });
  if (amount && amount > 0) p.set("am", amount.toFixed(2));
  return `upi://pay?${p.toString()}`;
}

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
  const [amount, setAmount] = useState("");
  const [last5, setLast5] = useState("");
  const pay = data?.payment;
  const canGen = !!pay?.upi_id;
  const [qrMode, setQrMode] = useState<"upi" | "image">("upi");
  const mode = canGen && (qrMode === "upi" || !pay?.has_qr_image) ? "upi" : pay?.has_qr_image ? "image" : null;
  const amt = Number(amount) > 0 ? Number(amount) : undefined;

  const submit = useMutation({
    mutationFn: () => apiPost<WalletRequest>("/wallet/requests", { amount: amt ?? null, txn_last5: last5 } satisfies WalletRequestIn),
    onSuccess: () => {
      toast.success("Payment submitted — the admin will verify and add it to your wallet");
      setAmount("");
      setLast5("");
      qc.invalidateQueries({ queryKey: ["wallet-me"] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not submit")),
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
            <DialogDescription>Scan & pay, then enter the last 5 digits of the transaction number.</DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl bg-gradient-to-br from-orange-600 to-amber-400 p-5 text-white">
            <p className="text-xs uppercase tracking-wider text-white/80">Available balance</p>
            <p className="mt-1 font-mono text-4xl font-bold" data-testid="wallet-dialog-balance">{data ? rupees(data.balance) : "—"}</p>
            <p className="mt-1 text-xs text-white/85">Service fees are paid from this wallet when you submit files.</p>
          </div>

          <div className="rounded-2xl border border-stone-200 p-4">
            {canGen && pay?.has_qr_image && (
              <div className="mb-3 flex gap-1 rounded-full bg-stone-100 p-1 w-fit mx-auto" data-testid="wallet-qr-toggle">
                {(["upi", "image"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setQrMode(m)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${mode === m ? "bg-white shadow text-stone-900" : "text-stone-500"}`}
                    data-testid={`wallet-qr-mode-${m}`}
                  >
                    {m === "upi" ? "UPI QR" : "Shop QR"}
                  </button>
                ))}
              </div>
            )}
            <div className="grid place-items-center" data-testid="wallet-qr">
              {mode === "upi" && pay ? (
                <>
                  <div className="rounded-xl bg-white p-3 border border-stone-200">
                    <QRCodeSVG value={upiLink(pay.upi_id, pay.payee_name, amt)} size={196} level="M" data-testid="wallet-qr-generated" />
                  </div>
                  <p className="mt-2 text-sm font-medium">{pay.payee_name || "Sevakendra"}</p>
                  <p className="font-mono text-xs text-stone-500" data-testid="wallet-upi-id">{pay.upi_id}</p>
                  {amt && <p className="text-xs text-orange-700 font-semibold">Amount {rupees(amt)} pre-filled</p>}
                </>
              ) : mode === "image" ? (
                <img src="/api/wallet/qr-image" alt="Payment QR" className="max-h-64 rounded-xl border border-stone-200" data-testid="wallet-qr-image" />
              ) : (
                <p className="py-8 text-center text-sm text-stone-500" data-testid="wallet-qr-missing">
                  The admin hasn't set up a payment QR yet. Please pay at the counter.
                </p>
              )}
            </div>
          </div>

          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!/^\d{5}$/.test(last5)) return toast.error("Enter exactly 5 digits");
              submit.mutate();
            }}
            data-testid="wallet-form"
          >
            <div className="space-y-1.5">
              <Label htmlFor="w-amt">Amount paid (optional)</Label>
              <Input id="w-amt" type="number" min={1} step="1" inputMode="decimal" placeholder="₹" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="wallet-amount-input" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-last5">Last 5 digits of transaction no.</Label>
              <Input
                id="w-last5"
                inputMode="numeric"
                maxLength={5}
                placeholder="e.g. 48213"
                className="font-mono tracking-[0.3em]"
                value={last5}
                onChange={(e) => setLast5(e.target.value.replace(/\D/g, "").slice(0, 5))}
                required
                data-testid="wallet-last5-input"
              />
            </div>
            <Button type="submit" className="sm:col-span-2 h-11" disabled={submit.isPending || last5.length !== 5} data-testid="wallet-submit-button">
              {submit.isPending ? "Submitting…" : "Submit payment"}
            </Button>
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
