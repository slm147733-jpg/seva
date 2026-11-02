import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, CheckCircle2, Paperclip, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CameraCapture from "./CameraCapture";
import { apiGet, apiUpload } from "@/lib/api";
import { errorMessage, formatINR } from "@/lib/hooks";
import { ACCEPT, playChime, validateFiles } from "@/lib/live";
import type { AttachmentOut, Service } from "@/lib/types";

export default function UploadBar() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [drag, setDrag] = useState(false);
  const [picked, setPicked] = useState("");

  const servicesQ = useQuery({ queryKey: ["my-services"], queryFn: () => apiGet<Service[]>("/services/mine"), refetchInterval: 30000 });
  const services = servicesQ.data && !servicesQ.isError ? servicesQ.data : [];
  // Auto-pick when there's only one; drop a pick the admin has since removed.
  const serviceId = services.some((s) => s.id === picked) ? picked : services.length === 1 ? services[0].id : "";
  const serviceName = services.find((s) => s.id === serviceId)?.name;
  const selectedService = services.find((s) => s.id === serviceId);
  const noServices = servicesQ.isSuccess && services.length === 0;

  const done = (items: AttachmentOut[]) => {
    qc.invalidateQueries({ queryKey: ["attachments"] });
    playChime();
    toast.success(
      items.length === 1 ? `Uploaded ${items[0].file.filename} for ${items[0].service_name}` : `Uploaded ${items.length} files for ${serviceName}`,
    );
  };
  const onError = (e: unknown) => {
    toast.error(errorMessage(e, "Upload failed"));
    qc.invalidateQueries({ queryKey: ["my-services"] });
  };

  const upload = useMutation({
    mutationFn: (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("service_id", serviceId);
      return apiUpload<AttachmentOut[]>("/attachments", fd);
    },
    onSuccess: done,
    onError,
  });

  const camera = useMutation({
    mutationFn: ({ blobs, mode }: { blobs: Blob[]; mode: "pdf" | "images" }) => {
      const fd = new FormData();
      blobs.forEach((b, i) => fd.append("files", b, `capture-${i + 1}.jpg`));
      fd.append("mode", mode);
      fd.append("service_id", serviceId);
      return apiUpload<AttachmentOut[]>("/attachments/camera", fd);
    },
    onSuccess: done,
    onError,
  });

  const needService = () => {
    if (serviceId) return false;
    toast.error(noServices ? "No services are assigned to you yet. Please contact the admin." : "Please select a service first");
    return true;
  };

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length || needService()) return;
    const err = validateFiles(files);
    if (err) return toast.error(err);
    upload.mutate(files);
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
        pick(e.dataTransfer.files);
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
            <p className="text-sm text-stone-500">Pick a service, then attach PDF, JPG, JPEG or PNG · up to 10 MB each</p>
          </div>
        </div>
        <div className="md:w-72 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">1. Service</p>
          <Select value={serviceId} onValueChange={(v: string) => setPicked(v)} disabled={noServices}>
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
        <div
          className="grid gap-4 sm:grid-cols-[auto_1fr] rounded-xl border border-amber-200 bg-amber-50/70 p-4 animate-rise"
          data-testid="upload-service-info"
        >
          <div className="sm:pr-5 sm:border-r border-amber-200">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Service fee</p>
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
          <Button
            className="h-11 px-5"
            onClick={() => !needService() && setCamOpen(true)}
            disabled={camera.isPending || !serviceId}
            data-testid="open-camera-button"
          >
            <Camera className="size-4" /> Use camera
          </Button>
          <Button
            variant="outline"
            className="h-11 px-5"
            onClick={() => !needService() && inputRef.current?.click()}
            disabled={upload.isPending || !serviceId}
            data-testid="attach-files-button"
          >
            <Paperclip className="size-4" /> {upload.isPending ? "Uploading…" : "Attach files"}
          </Button>
          {serviceName && (
            <span className="text-sm text-stone-500" data-testid="upload-selected-service">
              for <strong className="text-stone-800">{serviceName}</strong>
            </span>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
        data-testid="attach-files-input"
      />
      <CameraCapture
        open={camOpen}
        onOpenChange={setCamOpen}
        saving={camera.isPending}
        onSave={async (blobs, mode) => {
          try {
            await camera.mutateAsync({ blobs, mode });
            return true;
          } catch {
            return false;
          }
        }}
      />
    </div>
  );
}
