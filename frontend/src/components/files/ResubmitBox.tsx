import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Paperclip, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiUpload } from "@/lib/api";
import { errorMessage, formatINR } from "@/lib/hooks";
import { ACCEPT, formatBytes, validateFiles } from "@/lib/live";
import type { AttachmentOut, WalletMe } from "@/lib/types";
import { openWallet } from "@/components/wallet/WalletButton";

// User-only: send a corrected copy of a rejected file. The fee is taken again (it was refunded on reject).
export default function ResubmitBox({ a }: { a: AttachmentOut }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const wallet = useQuery({ queryKey: ["wallet-me"], queryFn: () => apiGet<WalletMe>("/wallet/me") });
  const fee = a.service_fee ?? 0;
  const balance = wallet.data?.balance ?? 0;
  const short = fee > 0 && wallet.data ? fee - balance : 0;

  const send = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("file", file as File);
      return apiUpload<AttachmentOut>(`/attachments/${a.id}/resubmit`, fd);
    },
    onSuccess: () => {
      toast.success(fee > 0 ? `Corrected copy sent · ${formatINR(fee)} paid from wallet` : "Corrected copy sent");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["attachments"] });
      qc.invalidateQueries({ queryKey: ["attachment", a.id] });
      qc.invalidateQueries({ queryKey: ["wallet-me"] });
    },
    onError: (e) => toast.error(errorMessage(e, "Could not resubmit")),
  });

  return (
    <div className="mt-3 rounded-xl border border-red-200 bg-white p-3" data-testid="resubmit-box">
      <p className="font-semibold text-stone-900 flex items-center gap-1.5">
        <RotateCcw className="size-4 text-orange-600" /> Send a corrected copy
      </p>
      <p className="mt-0.5 text-xs text-stone-600">
        Goes to the admin as a new file for {a.service_name}.{" "}
        {fee > 0 ? <>The {formatINR(fee)} fee is taken from your wallet again.</> : "No fee for this service."}
      </p>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []).slice(0, 1);
          e.target.value = "";
          if (!picked.length) return;
          const err = validateFiles(picked);
          if (err) toast.error(err);
          else setFile(picked[0]);
        }}
        data-testid="resubmit-file-input"
      />
      {file ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm" data-testid="resubmit-file-chip">
          <span className="truncate flex-1">{file.name}</span>
          <span className="text-xs text-stone-500">{formatBytes(file.size)}</span>
          <button type="button" onClick={() => setFile(null)} className="p-1 rounded hover:bg-stone-200" data-testid="resubmit-file-remove">
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} data-testid="resubmit-pick-button">
          <Paperclip className="size-4" /> {file ? "Change file" : "Choose file"}
        </Button>
        {short > 0 ? (
          <Button type="button" size="sm" onClick={openWallet} data-testid="resubmit-topup-button">
            Add {formatINR(short)} to wallet
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={!file || send.isPending} onClick={() => send.mutate()} data-testid="resubmit-submit-button">
            {send.isPending ? "Sending…" : fee > 0 ? `Resubmit & pay ${formatINR(fee)}` : "Resubmit"}
          </Button>
        )}
      </div>
    </div>
  );
}
