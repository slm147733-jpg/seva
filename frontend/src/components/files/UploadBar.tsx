import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, CheckCircle2, FileText, Images, Paperclip, Send, UploadCloud, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CameraCapture from "./CameraCapture";
import { FileIcon } from "./AttachmentList";
import { apiGet, apiUpload } from "@/lib/api";
import { errorMessage, formatINR } from "@/lib/hooks";
import { ACCEPT, formatBytes, playChime, validateFiles } from "@/lib/live";
import type { AttachmentOut, Service, WalletMe } from "@/lib/types";

// Items wait here until the user presses Submit (that's when the fee is charged).
type Staged =
  | { key: string; kind: "file"; file: File }
  | { key: string; kind: "camera"; blobs: Blob[]; mode: "pdf" | "images" };

const units = (s: Staged) => (s.kind === "file" ? 1 : s.mode === "pdf" ? 1 : s.blobs.length);
let seq = 0;
const nextKey = () => `s${++seq}`;

export default function UploadBar() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const [picked, setPicked] = useState("");
  const [staged, setStaged] = useState<Staged[]>([]);

  const servicesQ = useQuery({ queryKey: ["my-services"], queryFn: () => apiGet<Service[]>("/services/mine"), refetchInterval: 30000 });
  const wallet = useQuery({ queryKey: ["wallet-me"], queryFn: () => apiGet<WalletMe>("/wallet/me") });
  const services = servicesQ.data && !servicesQ.isError ? servicesQ.data : [];
  // Auto-pick when there's only one; drop a pick the admin has since removed.
  const serviceId = services.some((s) => s.id === picked) ? picked : services.length === 1 ? services[0].id : "";
  const selectedService = services.find((s) => s.id === serviceId);
  const noServices = servicesQ.isSuccess && services.length === 0;

  const fee = selectedService?.fee ?? 0;
  const count = staged.reduce((n, s) => n + units(s), 0);
  const total = fee * count;
  const balance = wallet.data?.balance ?? 0;
  const short = total > balance;

  const submit = useMutation({
    mutationFn: async () => {
      const out: AttachmentOut[] = [];
      const files = staged.filter((s): s is Extract<Staged, { kind: "file" }> => s.kind === "file");
      if (files.length) {
        const fd = new FormData();
        files.forEach((s) => fd.append("files", s.file));
        fd.append("service_id", serviceId);
        out.push(...(await apiUpload<AttachmentOut[]>("/attachments", fd)));
        setStaged((prev) => prev.filter((p) => p.kind !== "file"));
      }
      for (const c of staged.filter((s): s is Extract<Staged, { kind: "camera" }> => s.kind === "camera")) {
        const fd = new FormData();
        c.blobs.forEach((b, i) => fd.append("files", b, `capture-${i + 1}.jpg`));
        fd.append("mode", c.mode);
        fd.append("service_id", serviceId);
        out.push(...(await apiUpload<AttachmentOut[]>("/attachments/camera", fd)));
        setStaged((prev) => prev.filter((p) => p.key !== c.key));
      }
      return out;
    },
    onSuccess: (items) => {
      playChime();
      toast.success(
        `Submitted ${items.length} file${items.length === 1 ? "" : "s"} for ${selectedService?.name}${total > 0 ? ` · ${formatINR(total)} paid from wallet` : ""}`,
      );
    },
    onError: (e) => toast.error(errorMessage(e, "Submit failed")),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["attachments"] });
      qc.invalidateQueries({ queryKey: ["wallet-me"] });
      qc.invalidateQueries({ queryKey: ["my-services"] });
    },
  });

  const needService = () => {
    if (serviceId) return false;
    toast.error(noServices ? "No services are assigned to you yet. Please contact the admin." : "Please select a service first");
    return true;
  };

  const addFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length || needService()) return;
    const err = validateFiles(files);
    if (err) return toast.error(err);
    if (count + files.length > 20) return toast.error("You can submit up to 20 files at a time");
    setStaged((prev) => [...prev, ...files.map((file) => ({ key: nextKey(), kind: "file" as const, file }))]);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        addFiles(e.dataTransfer.files);
      }}
      className={`rounded-2xl border-2 border-dashed p-6 space-y-5 transition-colors duration-200 ${
        drag ? "border-orange-500 bg-orange-50" : "border-orange-200 bg-white"
      }`}
      data-testid="upload-bar"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex items-center gap-4 flex-1">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700">
            <UploadCloud className="size-6" />
          </span>
          <div>
            <p className="font-heading font-bold">Send documents to Sevakendra</p>
            <p className="text-sm text-stone-500">Pick a service, add PDF / JPG / PNG files (10 MB each), then press Submit</p>
          </div>
        </div>
        <div className="md:w-72 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">1. Service</p>
          <Select value={serviceId} onValueChange={(v: string) => setPicked(v)} disabled={noServices || submit.isPending}>
            <SelectTrigger className="w-full h-11" data-testid="upload-service-select">
              <SelectValue placeholder={noServices ? "No services assigned" : "Select a service"}>
                {(v) => services.find((s) => s.id === v)?.name ?? (noServices ? "No services assigned" : "Select a service")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id} data-testid={`upload-service-option-${s.id}`}>
                  {s.name} · {formatINR(s.fee)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedService && (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] rounded-xl border border-amber-200 bg-amber-50/70 p-4 animate-rise" data-testid="upload-service-info">
          <div className="sm:pr-5 sm:border-r border-amber-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Fee per file</p>
            <p className="mt-1 font-mono text-2xl font-bold text-stone-900" data-testid="upload-service-fee">
              {formatINR(selectedService.fee)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Documents needed</p>
            {selectedService.required_documents.length > 0 ? (
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2" data-testid="upload-required-docs">
                {selectedService.required_documents.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-stone-800">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-orange-600" /> {d}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-stone-600" data-testid="upload-no-required-docs">
                No specific documents listed — attach whatever applies.
              </p>
            )}
            {selectedService.description && <p className="mt-2 text-xs text-stone-600">{selectedService.description}</p>}
          </div>
        </div>
      )}

      {noServices ? (
        <p className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900" data-testid="upload-no-services">
          No services have been given to you yet. Please contact the Sevakendra admin to get access.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 w-full sm:w-auto">2. Add files</p>
          <Button className="h-11 px-5" onClick={() => !needService() && setCamOpen(true)} disabled={!serviceId || submit.isPending} data-testid="open-camera-button">
            <Camera className="size-4" /> Use camera
          </Button>
          <Button
            variant="outline"
            className="h-11 px-5"
            onClick={() => !needService() && inputRef.current?.click()}
            disabled={!serviceId || submit.isPending}
            data-testid="attach-files-button"
          >
            <Paperclip className="size-4" /> Attach files
          </Button>
        </div>
      )}

      {staged.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4 space-y-3 animate-rise" data-testid="upload-staged">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">3. Ready to submit ({count})</p>
          <ul className="space-y-1.5">
            {staged.map((s) => (
              <li key={s.key} className="flex items-center gap-3 rounded-lg bg-white border border-stone-200 px-3 py-2 text-sm" data-testid={`staged-item-${s.key}`}>
                {s.kind === "file" ? (
                  <FileIcon type={s.file.type} className="size-4 shrink-0" />
                ) : s.mode === "pdf" ? (
                  <FileText className="size-4 shrink-0 text-red-600" />
                ) : (
                  <Images className="size-4 shrink-0 text-sky-600" />
                )}
                <span className="flex-1 truncate">
                  {s.kind === "file"
                    ? s.file.name
                    : s.mode === "pdf"
                      ? `Camera PDF · ${s.blobs.length} page${s.blobs.length === 1 ? "" : "s"}`
                      : `Camera photos · ${s.blobs.length} image${s.blobs.length === 1 ? "" : "s"}`}
                </span>
                <span className="text-xs text-stone-500">
                  {s.kind === "file" ? formatBytes(s.file.size) : `${units(s)} file${units(s) === 1 ? "" : "s"}`}
                </span>
                <button
                  type="button"
                  onClick={() => setStaged((prev) => prev.filter((p) => p.key !== s.key))}
                  disabled={submit.isPending}
                  className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  aria-label="Remove"
                  data-testid={`staged-remove-${s.key}`}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-stone-200 pt-3">
            <div className="text-sm" data-testid="upload-total">
              <p>
                Total fee: <strong className="font-mono text-base" data-testid="upload-total-amount">{formatINR(total)}</strong>
                {fee > 0 && <span className="text-stone-500"> ({formatINR(fee)} × {count})</span>}
              </p>
              <p className={`flex items-center gap-1 text-xs font-semibold ${short ? "text-red-600" : "text-green-700"}`} data-testid="upload-wallet-note">
                <Wallet className="size-3.5" /> Wallet balance ₹{balance.toLocaleString("en-IN")}
                {short ? ` — add ₹${(total - balance).toLocaleString("en-IN")} more to submit` : total > 0 ? " — fee will be paid from your wallet" : ""}
              </p>
            </div>
            <Button className="h-11 px-6" disabled={submit.isPending || short || !serviceId} onClick={() => submit.mutate()} data-testid="upload-submit-button">
              <Send className="size-4" /> {submit.isPending ? "Submitting…" : total > 0 ? `Submit & pay ${formatINR(total)}` : "Submit"}
            </Button>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
        data-testid="attach-files-input"
      />
      <CameraCapture
        open={camOpen}
        onOpenChange={setCamOpen}
        saving={false}
        onSave={async (blobs, mode) => {
          setStaged((prev) => [...prev, { key: nextKey(), kind: "camera", blobs, mode }]);
          toast.success(mode === "pdf" ? "PDF added — press Submit to send" : `${blobs.length} photo(s) added — press Submit to send`);
          return true;
        }}
      />
    </div>
  );
}
