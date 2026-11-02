import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, ClipboardList, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPost, apiUpload } from "@/lib/api";
import { errorMessage } from "@/lib/hooks";
import { ACCEPT, playChime, validateFiles } from "@/lib/live";
import type { AttachmentOut, MessageOut, MissingRequest, Role } from "@/lib/types";

function useRefresh(id: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["attachment", id] });
    qc.invalidateQueries({ queryKey: ["attachments"] });
  };
}

// Admin: tick which required documents are missing (plus custom items) and send the request.
function AdminRequest({ a, required }: { a: AttachmentOut; required: string[] }) {
  const refresh = useRefresh(a.id);
  const options = [...new Set([...required, ...a.missing_documents])];
  const [extra, setExtra] = useState<string[]>([]);
  const all = [...options, ...extra.filter((e) => !options.includes(e))];
  const [checked, setChecked] = useState<Set<string>>(new Set(a.missing_documents));
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(a.missing_documents.length > 0);

  const send = useMutation({
    mutationFn: (documents: string[]) => apiPost<AttachmentOut>(`/attachments/${a.id}/missing`, { documents, note } satisfies MissingRequest),
    onSuccess: (_r, documents) => {
      toast.success(documents.length ? `Requested ${documents.length} missing document(s)` : "Request cleared");
      setNote("");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const toggle = (d: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;
    setExtra((x) => (x.includes(v) ? x : [...x, v]));
    setChecked((prev) => new Set(prev).add(v));
    setCustom("");
  };

  if (!open) {
    return (
      <Button variant="outline" className="w-full border-dashed" onClick={() => setOpen(true)} data-testid="missing-open-button">
        <ClipboardList className="size-4" /> Request missing documents
      </Button>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 space-y-3" data-testid="missing-admin-panel">
      <div className="flex items-center justify-between">
        <p className="font-heading font-semibold flex items-center gap-2">
          <ClipboardList className="size-4 text-orange-600" /> Missing documents
        </p>
        {a.missing_documents.length > 0 && (
          <span className="text-xs font-medium text-stone-600" data-testid="missing-admin-progress">
            {a.missing_resolved.length}/{a.missing_documents.length} received
          </span>
        )}
      </div>
      {all.length === 0 && <p className="text-sm text-stone-600">This service has no document list. Add items below.</p>}
      <ul className="space-y-1.5">
        {all.map((d) => {
          const resolved = a.missing_resolved.includes(d);
          return (
            <li key={d}>
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="size-4 accent-orange-600"
                  checked={checked.has(d)}
                  onChange={() => toggle(d)}
                  data-testid={`missing-check-${d.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                />
                <span className="flex-1">{d}</span>
                {a.missing_documents.includes(d) && (
                  <span className={`text-[11px] font-semibold ${resolved ? "text-green-700" : "text-amber-700"}`}>
                    {resolved ? "Received" : "Requested"}
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <Input
          placeholder="Add another document"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          className="bg-white"
          data-testid="missing-custom-input"
        />
        <Button type="button" variant="outline" size="icon" onClick={addCustom} data-testid="missing-custom-add" aria-label="Add">
          <Plus className="size-4" />
        </Button>
      </div>
      <Input
        placeholder="Note for the user (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="bg-white"
        data-testid="missing-note-input"
      />
      <div className="flex flex-wrap justify-end gap-2">
        {a.missing_documents.length > 0 && (
          <Button variant="ghost" disabled={send.isPending} onClick={() => send.mutate([])} data-testid="missing-clear-button">
            Clear request
          </Button>
        )}
        <Button disabled={send.isPending || checked.size === 0} onClick={() => send.mutate(all.filter((d) => checked.has(d)))} data-testid="missing-send-button">
          Send request ({checked.size})
        </Button>
      </div>
    </div>
  );
}

// User: a checklist with an upload button per requested document.
function UserChecklist({ a }: { a: AttachmentOut }) {
  const refresh = useRefresh(a.id);
  const input = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: ({ doc, file }: { doc: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("for_document", doc);
      fd.append("text", `Sent: ${doc}`);
      return apiUpload<MessageOut>(`/attachments/${a.id}/messages`, fd);
    },
    onSuccess: (_m, v) => {
      playChime();
      toast.success(`${v.doc} sent`);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, "Upload failed")),
  });
  if (a.missing_documents.length === 0) return null;
  const done = a.missing_resolved.length;
  const total = a.missing_documents.length;

  return (
    <div className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-4 space-y-3 animate-rise" data-testid="missing-user-checklist">
      <div className="flex items-center justify-between gap-2">
        <p className="font-heading font-semibold text-orange-900 flex items-center gap-2">
          <ClipboardList className="size-4" /> Please send these documents
        </p>
        <span className="text-xs font-semibold text-orange-800" data-testid="missing-user-progress">
          {done}/{total} sent
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-orange-200 overflow-hidden">
        <div className="h-full bg-orange-600 transition-[width] duration-500" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <ul className="space-y-2">
        {a.missing_documents.map((d) => {
          const sent = a.missing_resolved.includes(d);
          const slug = d.toLowerCase().replace(/[^a-z0-9]+/g, "-");
          return (
            <li key={d} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 border border-orange-100" data-testid={`missing-item-${slug}`}>
              {sent ? <CheckCircle2 className="size-5 text-green-600 shrink-0" /> : <CircleDashed className="size-5 text-orange-500 shrink-0" />}
              <span className={`flex-1 text-sm ${sent ? "text-stone-500 line-through" : "font-medium"}`}>{d}</span>
              <Button
                size="sm"
                variant={sent ? "ghost" : "default"}
                disabled={upload.isPending}
                onClick={() => {
                  setTarget(d);
                  input.current?.click();
                }}
                data-testid={`missing-upload-${slug}`}
              >
                <Upload className="size-3.5" /> {sent ? "Send again" : upload.isPending && target === d ? "Sending…" : "Upload"}
              </Button>
            </li>
          );
        })}
      </ul>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f || !target) return;
          const err = validateFiles([f]);
          if (err) return toast.error(err);
          upload.mutate({ doc: target, file: f });
        }}
        data-testid="missing-file-input"
      />
    </div>
  );
}

export default function MissingDocs({ a, role, required }: { a: AttachmentOut; role: Role; required: string[] }) {
  if (role === "admin") return <AdminRequest key={a.missing_documents.join("|")} a={a} required={required} />;
  return <UserChecklist a={a} />;
}

export function MissingBadge({ a }: { a: AttachmentOut }) {
  const pending = a.missing_documents.filter((d) => !a.missing_resolved.includes(d)).length;
  if (a.missing_documents.length === 0) return null;
  return pending > 0 ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-orange-600 px-2 py-0.5 text-[11px] font-semibold text-white" data-testid={`missing-badge-${a.id}`}>
      <X className="size-3" /> {pending} document{pending === 1 ? "" : "s"} needed
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800" data-testid={`missing-badge-${a.id}`}>
      <CheckCircle2 className="size-3" /> Documents sent
    </span>
  );
}
