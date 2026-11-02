import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Paperclip, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CameraCapture from "./CameraCapture";
import { apiGet, apiUpload } from "@/lib/api";
import { errorMessage } from "@/lib/hooks";
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
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
