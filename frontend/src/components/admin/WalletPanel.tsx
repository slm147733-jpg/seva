import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, CreditCard, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox as _Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AdjustDialog, { invalidateWallet } from "@/components/wallet/AdjustDialog";
import { apiGet, apiPost } from "@/lib/api";
import { errorMessage, formatINR, formatIST } from "@/lib/hooks";
import type { ApproveIn, PaymentsStatus, RejectIn, UserOut, WalletRequest, WalletTxn } from "@/lib/types";
import { PanelHeader } from "./common";

function RequestRow({ r }: { r: WalletRequest }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(r.amount ? String(r.amount) : "");
  const approve = useMutation({
    mutationFn: () => apiPost<WalletRequest>(`/admin/wallet/requests/${r.id}/approve`, { amount: Number(amount), note: "" } satisfies ApproveIn),
    onSuccess: () => {
      toast.success(`Added ${formatINR(Number(amount))} to ${r.user_name}'s wallet`);
      invalidateWallet(qc);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: () => apiPost<WalletRequest>(`/admin/wallet/requests/${r.id}/reject`, { note: "Payment not found" } satisfies RejectIn),
    onSuccess: () => {
      toast.success("Payment rejected");
      invalidateWallet(qc);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <TableRow data-testid={`wallet-req-row-${r.id}`}>
      <TableCell className="py-2.5">
        <p className="font-medium">{r.user_name}</p>
        <p className="font-mono text-xs text-stone-500">{r.user_mobile}</p>
      </TableCell>
      <TableCell className="font-mono text-base font-bold tracking-widest" data-testid={`wallet-req-last5-${r.id}`}>…{r.txn_last5}</TableCell>
      <TableCell className="font-mono">{r.amount ? formatINR(r.amount) : <span className="text-xs text-stone-400">not given</span>}</TableCell>
      <TableCell className="text-xs text-stone-500">{formatIST(r.created_at)}</TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          <Input type="number" min={1} placeholder="₹" className="w-24 h-8" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid={`wallet-req-amount-${r.id}`} />
          <Button size="sm" disabled={!(Number(amount) > 0) || approve.isPending} onClick={() => approve.mutate()} data-testid={`wallet-req-approve-${r.id}`}>
            <Check className="size-4" /> Add
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600" disabled={reject.isPending} onClick={() => reject.mutate()} data-testid={`wallet-req-reject-${r.id}`}>
            <X className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function RazorpayCard() {
  const { data } = useQuery({ queryKey: ["payments-status"], queryFn: () => apiGet<PaymentsStatus>("/admin/payments/status") });
  const ok = data?.configured;
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border p-5 ${ok ? "border-green-200 bg-green-50" : "border-amber-300 bg-amber-50"}`}
      data-testid="razorpay-status"
    >
      <CreditCard className={`size-6 shrink-0 ${ok ? "text-green-700" : "text-amber-700"}`} />
      <div className="text-sm">
        <p className="font-semibold" data-testid="razorpay-status-text">
          {!data ? "Checking online payments…" : ok ? `Online payments are on (Razorpay ${data.mode === "live" ? "LIVE" : "TEST"} mode)` : "Online payments are not set up"}
        </p>
        <p className="text-stone-600">
          Users top up their wallet with UPI, card or net banking through Razorpay. The money is added to their wallet automatically
          after the payment is verified.{data?.mode === "test" && " Test mode: no real money moves."}
        </p>
        {data && (
          <div className="mt-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5" data-testid="razorpay-webhook">
            <p className="font-semibold" data-testid="razorpay-webhook-status">
              Backup webhook: {data.webhook_configured ? "on" : "not set up yet"}
            </p>
            <p className="text-xs text-stone-600">
              Credits the wallet even if a user closes the page mid-payment. In Razorpay Dashboard → Webhooks, add this URL with the
              events <strong>payment.captured</strong> and <strong>order.paid</strong>:
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-stone-100 px-2 py-1 text-xs" data-testid="razorpay-webhook-url">{data.webhook_url}</code>
              <Button
                size="xs"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(data.webhook_url).then(() => toast.success("Webhook URL copied"))}
                data-testid="razorpay-webhook-copy"
              >
                Copy
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WalletPanel({ pending }: { pending: WalletRequest[] }) {
  const [adjusting, setAdjusting] = useState<UserOut | null>(null);
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => apiGet<UserOut[]>("/admin/users") });
  const txns = useQuery({ queryKey: ["admin-wallet-txns"], queryFn: () => apiGet<WalletTxn[]>("/admin/wallet/transactions"), refetchInterval: 15000 });
  const members = (users.data ?? []).filter((u) => u.role === "user");

  return (
    <div className="space-y-8">
      <PanelHeader title="Wallet" subtitle="Online top-ups via Razorpay, manual add / remove, and every wallet movement." />

      <RazorpayCard />

      {pending.length > 0 && (
      <section>
        <h2 className="font-heading text-lg font-bold mb-3">Older QR payments to verify ({pending.length})</h2>
        <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
          <Table data-testid="wallet-requests-table">
            <TableHeader>
              <TableRow className="bg-stone-50">
                <TableHead>User</TableHead>
                <TableHead>Txn last 5</TableHead>
                <TableHead>Says paid</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Credit amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((r) => <RequestRow key={r.id} r={r} />)}
              {pending.length === 0 && (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-stone-500" data-testid="wallet-requests-empty">No payments waiting.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
      )}

      <section>
        <h2 className="font-heading text-lg font-bold mb-3">User balances</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="wallet-balances">
          {members.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3" data-testid={`wallet-balance-card-${u.mobile}`}>
              <div className="min-w-0">
                <p className="font-medium truncate">{u.name}</p>
                <p className="font-mono text-xs text-stone-500">{u.mobile}</p>
              </div>
              <div className="text-right">
                <p className="font-mono font-bold" data-testid={`wallet-balance-${u.mobile}`}>{formatINR(u.wallet_balance) === "Free" ? "₹0" : formatINR(u.wallet_balance)}</p>
                <Button size="xs" variant="outline" onClick={() => setAdjusting(u)} data-testid={`wallet-adjust-open-${u.mobile}`}>
                  <Wallet className="size-3" /> Add / remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-heading text-lg font-bold mb-3">Recent wallet activity</h2>
        <ul className="rounded-2xl border border-stone-200 bg-white divide-y divide-stone-100" data-testid="wallet-txns">
          {(txns.data ?? []).slice(0, 30).map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className={`font-mono font-semibold w-24 ${t.type === "credit" ? "text-green-700" : "text-red-700"}`}>
                {t.type === "credit" ? "+" : "−"}{formatINR(t.amount)}
              </span>
              <span className="flex-1 min-w-0 truncate"><strong>{t.user_name}</strong> · {t.reason}</span>
              <span className="text-xs text-stone-500 hidden sm:inline">by {t.created_by} · {formatIST(t.created_at)}</span>
            </li>
          ))}
          {txns.isSuccess && txns.data.length === 0 && <li className="px-4 py-6 text-stone-500">No wallet activity yet.</li>}
        </ul>
      </section>
      <AdjustDialog key={adjusting?.id ?? "none"} user={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  );
}
