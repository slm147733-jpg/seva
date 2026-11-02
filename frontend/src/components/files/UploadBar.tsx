import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Paperclip, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import CameraCapture from "./CameraCapture";
import { apiUpload } from "@/lib/api";
import { errorMessage } from "@/lib/hooks";
import { ACCEPT, playChime, validateFiles } from "@/lib/live";
import type { AttachmentOut } from "@/lib/types";

export default function UploadBar() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [camOpen, setCamOpen] = useState(false);
  const [drag, setDrag] = useState(false);

  const done = (items: AttachmentOut[]) => {
    qc.invalidateQueries({ queryKey: ["attachments"] });
    playChime();
    toast.success(items.length === 1 ? `Uploaded ${items[0].file.filename}` : `Uploaded ${items.length} files`);
  };

  const upload = useMutation({
    mutationFn: (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      return apiUpload<AttachmentOut[]>("/attachments", fd);
    },
    onSuccess: done,
    onError: (e) => toast.error(errorMessage(e, "Upload failed")),
  });

  const camera = useMutation({
    mutationFn: ({ blobs, mode }: { blobs: Blob[]; mode: "pdf" | "images" }) => {
      const fd = new FormData();
      blobs.forEach((b, i) => fd.append("files", b, `capture-${i + 1}.jpg`));
      fd.append("mode", mode);
      return apiUpload<AttachmentOut[]>("/attachments/camera", fd);
    },
    onSuccess: done,
    onError: (e) => toast.error(errorMessage(e, "Upload failed")),
  });

  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
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
      className={`rounded-2xl border-2 border-dashed p-6 flex flex-col md:flex-row md:items-center gap-5 transition-colors duration-200 ${
        drag ? "border-orange-500 bg-orange-50" : "border-orange-200 bg-white"
      }`}
      data-testid="upload-bar"
    >
      <div className="flex items-center gap-4 flex-1">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-700">
          <UploadCloud className="size-6" />
        </span>
        <div>
          <p className="font-heading font-bold">Send documents to Sevakendra</p>
          <p className="text-sm text-stone-500">PDF, JPG, JPEG or PNG · up to 10 MB each · drag & drop works too</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          className="h-11 px-5"
          onClick={() => setCamOpen(true)}
          disabled={camera.isPending}
          data-testid="open-camera-button"
        >
          <Camera className="size-4" /> Use camera
        </Button>
        <Button
          variant="outline"
          className="h-11 px-5"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          data-testid="attach-files-button"
        >
          <Paperclip className="size-4" /> {upload.isPending ? "Uploading…" : "Attach files"}
        </Button>
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
      </div>
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
