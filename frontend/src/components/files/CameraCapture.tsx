import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FileText, Images, RefreshCw, SwitchCamera, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Shot {
  blob: Blob;
  url: string;
}

const MAX_SIDE = 1600;

export default function CameraCapture({ open, onOpenChange, onSave, saving }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (blobs: Blob[], mode: "pdf" | "images") => Promise<boolean>;
  saving: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera is not supported in this browser. Use 'Add from device' below.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 } }, audio: false })
      .then((stream) => {
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch(() => !cancelled && setError("Camera access was blocked. Allow camera permission, or use 'Add from device'."));
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, facing, attempt]);

  const reset = useCallback(() => {
    setShots((prev) => {
      prev.forEach((s) => URL.revokeObjectURL(s.url));
      return [];
    });
  }, []);

  const close = (o: boolean) => {
    if (!o) {
      stop();
      reset();
    }
    onOpenChange(o);
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return toast.error("Camera is not ready yet");
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setShots((prev) => [...prev, { blob, url: URL.createObjectURL(blob) }]);
        setFlash(true);
        setTimeout(() => setFlash(false), 150);
      },
      "image/jpeg",
      0.85,
    );
  };

  const addFromDevice = (files: FileList | null) => {
    if (!files) return;
    const imgs = Array.from(files).filter((f) => /^image\/(jpeg|png)$/.test(f.type));
    setShots((prev) => [...prev, ...imgs.map((f) => ({ blob: f as Blob, url: URL.createObjectURL(f) }))]);
  };

  const remove = (i: number) =>
    setShots((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, j) => j !== i);
    });

  const save = async (mode: "pdf" | "images") => {
    const ok = await onSave(
      shots.map((s) => s.blob),
      mode,
    );
    if (ok) close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto" data-testid="camera-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="size-5 text-orange-600" /> Capture documents
          </DialogTitle>
          <DialogDescription>Keep capturing pages, then save them as one PDF or as separate images.</DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-2xl bg-stone-950 aspect-[4/3]">
          {error ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-stone-300" data-testid="camera-error">
              <div className="space-y-3">
                <p>{error}</p>
                <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)} data-testid="camera-retry-button">
                  <RefreshCw className="size-4" /> Try again
                </Button>
              </div>
            </div>
          ) : (
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" data-testid="camera-video" />
          )}
          <div
            className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-150 ${flash ? "opacity-70" : "opacity-0"}`}
          />
          {!error && (
            <button
              type="button"
              onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
              className="absolute top-3 right-3 rounded-full bg-black/50 p-2 text-white backdrop-blur hover:bg-black/70 transition-colors"
              data-testid="camera-switch-button"
              aria-label="Switch camera"
            >
              <SwitchCamera className="size-5" />
            </button>
          )}
          {!error && (
            <button
              type="button"
              onClick={capture}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 size-16 rounded-full border-4 border-white bg-orange-600 shadow-xl active:scale-90 transition-transform duration-100"
              data-testid="camera-capture-button"
              aria-label="Capture photo"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium" data-testid="camera-shot-count">
            {shots.length} photo{shots.length === 1 ? "" : "s"} captured
          </p>
          <label className="text-sm text-orange-700 font-medium cursor-pointer hover:underline">
            Add from device
            <input
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                addFromDevice(e.target.files);
                e.target.value = "";
              }}
              data-testid="camera-device-input"
            />
          </label>
        </div>

        {shots.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1" data-testid="camera-thumbnails">
            {shots.map((s, i) => (
              <div key={s.url} className="relative shrink-0 animate-rise">
                <img src={s.url} alt={`Capture ${i + 1}`} className="h-20 w-16 rounded-lg object-cover border border-stone-200" />
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">{i + 1}</span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="absolute -top-1.5 -right-1.5 rounded-full bg-red-600 p-0.5 text-white"
                  data-testid={`camera-remove-${i}`}
                  aria-label="Remove photo"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-11"
            disabled={!shots.length || saving}
            onClick={() => save("images")}
            data-testid="camera-save-images-button"
          >
            <Images className="size-4" /> Save as images
          </Button>
          <Button className="h-11" disabled={!shots.length || saving} onClick={() => save("pdf")} data-testid="camera-save-pdf-button">
            <FileText className="size-4" /> Save as one PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
