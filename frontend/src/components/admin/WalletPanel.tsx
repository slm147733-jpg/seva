import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Check, ImagePlus, Trash2, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox as _Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AdjustDialog, { invalidateWallet } from "@/components/wallet/AdjustDialog";
import { upiLink } from "@/components/wallet/WalletButton";
import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from "@/lib/api";
import { errorMessage, formatINR, formatIST } from "@/lib/hooks";
import type { ApproveIn, PaymentInfo, RejectIn, UserOut, WalletRequest, WalletSettingsIn, WalletTxn } from "@/lib/types";
import { PanelHeader } from "./common";

function RequestRow({ r }: { r: WalletRequest }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(r.amount ? String(r.amount) : "");
  const approve = useMutation({
    mutationFn: (amt: number) => apiPost<WalletRequest>(`/admin/wallet/requests/${r.id}/approve`, { amount: amt, note: "" } satisfies ApproveIn),
    onSuccess: (_, amt) => {
      toast.success(`Added ${formatINR(amt)} to ${r.user_name}'s wallet`);
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
          {r.amount ? (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={approve.isPending}
              onClick={() => approve.mutate(r.amount as number)}
              data-testid={`wallet-req-quick-approve-${r.id}`}
            >
              <Check className="size-4" /> Approve {formatINR(r.amount)}
            </Button>
          ) : null}
          <Button size="sm" variant={r.amount ? "outline" : "default"} disabled={!(Number(amount) > 0) || approve.isPending} onClick={() => approve.mutate(Number(amount))} data-testid={`wallet-req-approve-${r.id}`}>
            {r.amount ? "Other amount" : <><Check className="size-4" /> Add</>}
          </Button>
          <Button size="sm" variant="ghost" className="text-red-600" disabled={reject.isPending} onClick={() => reject.mutate()} data-testid={`wallet-req-reject-${r.id}`}>
            <X className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function SettingsCard({ info }: { info: PaymentInfo }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<WalletSettingsIn>({ upi_id: info.upi_id, payee_name: info.payee_name, deduct_fees: info.deduct_fees });
  const done = (msg: string) => () => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["admin-wallet-settings"] });
  };
  const save = useMutation({ mutationFn: () => apiPut<PaymentInfo>("/admin/wallet/settings", form), onSuccess: done("Payment settings saved"), onError: (e) => toast.error(errorMessage(e, "Check the UPI ID (like name@bank)")) });
  const upload = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.append("file", f);
      return apiUpload<PaymentInfo>("/admin/wallet/qr-image", fd);
    },
    onSuccess: done("QR image uploaded"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({ mutationFn: () => apiDelete<PaymentInfo>("/admin/wallet/qr-image"), onSuccess: done("QR image removed") });

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 grid gap-6 md:grid-cols-[1fr_auto]" data-testid="wallet-settings">
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="font-heading font-semibold">Payment settings</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ws-upi">Your UPI ID</Label>
            <Input id="ws-upi" placeholder="sevakendra@okaxis" value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value.trim() })} data-testid="wallet-settings-upi" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Payee name</Label>
            <Input id="ws-name" placeholder="Sevakendra" value={form.payee_name} onChange={(e) => setForm({ ...form, payee_name: e.target.value })} data-testid="wallet-settings-payee" />
          </div>
        </div>
        <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900" data-testid="wallet-settings-fee-note">
          Service fees are taken from the user's wallet automatically when they press <strong>Submit</strong> on their files.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending} data-testid="wallet-settings-save">Save settings</Button>
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending} data-testid="wallet-qr-upload-button">
            <ImagePlus className="size-4" /> {info.has_qr_image ? "Replace QR image" : "Upload QR image"}
          </Button>
          {info.has_qr_image && (
            <Button type="button" variant="ghost" className="text-red-600" onClick={() => remove.mutate()} data-testid="wallet-qr-remove-button">
              <Trash2 className="size-4" /> Remove image
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) upload.mutate(f);
            }}
            data-testid="wallet-qr-file-input"
          />
        </div>
      </form>
      <div className="flex gap-4 items-start">
        {info.upi_id && (
          <div className="text-center">
            <div className="rounded-xl border border-stone-200 p-2 bg-white"><QRCodeSVG value={upiLink(info.upi_id, info.payee_name)} size={120} /></div>
            <p className="mt-1 text-[11px] text-stone-500">UPI QR</p>
          </div>
        )}
        {info.has_qr_image && (
          <div className="text-center">
            <img src={`/api/wallet/qr-image?v=${Date.now() >> 16}`} alt="Shop QR" className="h-[136px] rounded-xl border border-stone-200" data-testid="wallet-settings-qr-image" />
            <p className="mt-1 text-[11px] text-stone-500">Shop QR</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WalletPanel({ pending }: { pending: WalletRequest[] }) {
  const [adjusting, setAdjusting] = useState<UserOut | null>(null);
  const settings = useQuery({ queryKey: ["admin-wallet-settings"], queryFn: () => apiGet<PaymentInfo>("/admin/wallet/settings") });
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => apiGet<UserOut[]>("/admin/users") });
  const txns = useQuery({ queryKey: ["admin-wallet-txns"], queryFn: () => apiGet<WalletTxn[]>("/admin/wallet/transactions"), refetchInterval: 15000 });
  const members = (users.data ?? []).filter((u) => u.role === "user");

  return (
    <div className="space-y-8">
      <PanelHeader title="Wallet" subtitle="Verify user payments, add or remove money manually, and set up your payment QR." />

      <section>
        <h2 className="font-heading text-lg font-bold mb-3">Payments to verify ({pending.length})</h2>
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

      {settings.data && <SettingsCard key={JSON.stringify(settings.data)} info={settings.data} />}

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
