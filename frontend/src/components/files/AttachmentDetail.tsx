import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, ExternalLink, Paperclip, ReceiptText, Send, Trash2, X } from "lucide-react";
import { ConfirmDelete } from "@/components/admin/common";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { apiDelete, apiGet, apiUpload, fileUrl } from "@/lib/api";
import { errorMessage, formatINR, formatIST } from "@/lib/hooks";
import { ACCEPT, POLL_MS, formatBytes, playChime, syncServerTime, validateFiles } from "@/lib/live";
import type { AttachmentDetail as Detail, DeleteResult, FileMeta, MessageOut, Role } from "@/lib/types";
import { FileIcon } from "./AttachmentList";
import { StatusBadge, StatusTimer } from "./Status";
import MissingDocs from "./MissingDocs";
import RejectDialog from "./RejectDialog";

function FileChip({ file, tone = "light", testId }: { file: FileMeta; tone?: "light" | "dark"; testId: string }) {
  return (
    <div
      className={`mt-2 flex items-center gap-2 rounded-xl border px-3 py-2 ${
        tone === "dark" ? "border-white/20 bg-white/10" : "border-stone-200 bg-white"
      }`}
      data-testid={testId}
    >
      <FileIcon type={file.content_type} className="size-4 shrink-0" />
      <span className="truncate text-sm flex-1">{file.filename}</span>
      <span className="text-[11px] opacity-70">{formatBytes(file.size)}</span>
      <a href={fileUrl(file.file_id)} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-black/10" title="Open">
        <ExternalLink className="size-4" />
      </a>
      <a href={fileUrl(file.file_id, true)} className="p-1 rounded hover:bg-black/10" title="Download" data-testid={`${testId}-download`}>
        <Download className="size-4" />
      </a>
    </div>
  );
}

function Bubble({ m, mine }: { m: MessageOut; mine: boolean }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"} animate-rise`} data-testid={`message-${m.id}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
          m.is_receipt
            ? "bg-green-50 border border-green-300 text-green-950"
            : mine
              ? "bg-orange-600 text-white rounded-br-md"
              : "bg-stone-100 text-stone-900 rounded-bl-md"
        }`}
      >
        <p className={`text-[11px] font-semibold ${mine && !m.is_receipt ? "text-orange-100" : "text-stone-500"}`}>
          {m.sender_name} · {m.sender_role === "admin" ? "Admin" : "User"}
        </p>
        {m.is_receipt && (
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-green-700">
            <ReceiptText className="size-3.5" /> Receipt / Acknowledgement
          </p>
        )}
        {m.text && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>}
        {m.file && <FileChip file={m.file} tone={mine && !m.is_receipt ? "dark" : "light"} testId={`message-file-${m.id}`} />}
        <p className={`mt-1 text-[10px] ${mine && !m.is_receipt ? "text-orange-100" : "text-stone-400"}`}>{formatIST(m.created_at)}</p>
      </div>
    </div>
  );
}

export default function AttachmentDetail({ id, role, myId, onClose }: {
  id: string | null;
  role: Role;
  myId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { data, isError } = useQuery({
    queryKey: ["attachment", id],
    queryFn: async () => {
      const d = await apiGet<Detail>(`/attachments/${id}`);
      syncServerTime(d.server_time);
      return d;
    },
    enabled: !!id,
    refetchInterval: POLL_MS,
  });

  // Opening marks it seen/read server-side — refresh the list so both dashboards update.
  useEffect(() => {
    if (data) qc.invalidateQueries({ queryKey: ["attachments"] });
  }, [data?.attachment.status, data?.attachment.unread, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const count = data?.messages.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [count]);

  const send = useMutation({
    mutationFn: (vars: { text: string; file: File | null }) => {
      const fd = new FormData();
      fd.append("text", vars.text);
      if (vars.file) fd.append("file", vars.file);
      return apiUpload<MessageOut>(`/attachments/${id}/messages`, fd);
    },
    onSuccess: (m, vars) => {
      // Clear only what was sent — the user may already have typed/picked the next one.
      setText((cur) => (cur === vars.text ? "" : cur));
      setFile((cur) => (cur === vars.file ? null : cur));
      qc.invalidateQueries({ queryKey: ["attachment", id] });
      qc.invalidateQueries({ queryKey: ["attachments"] });
      if (m.file) {
        playChime();
        toast.success(m.is_receipt ? "Receipt sent — status is now Generated" : "File sent");
      }
    },
    onError: (e) => toast.error(errorMessage(e, "Could not send")),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() && !file) return;
    send.mutate({ text, file });
  };

  const a = data && !isError ? data.attachment : null;
  const isImage = a?.file.content_type.startsWith("image/");

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col gap-0" data-testid="attachment-detail">
        <SheetHeader className="border-b border-stone-200 p-5">
          <SheetTitle className="font-heading pr-8 truncate" data-testid="detail-filename">
            {a ? a.file.filename : "Loading…"}
          </SheetTitle>
          <SheetDescription>
            {a && (
              <span>
                <span className="font-semibold text-amber-800" data-testid="detail-service">{a.service_name}</span>
                {a.service_fee !== null && (
                  <span className="ml-1 font-mono text-xs text-stone-600" data-testid="detail-fee">({formatINR(a.service_fee)})</span>
                )}{" "}
                · {a.user_name} ·{" "}
                <span className="font-mono">{a.user_mobile}</span> · sent {formatIST(a.created_at)}
              </span>
            )}
          </SheetDescription>
          {a && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <StatusBadge status={a.status} testId="detail-status" />
              <StatusTimer a={a} testId="detail-timer" />
              {role === "admin" && (
                <span className="ml-auto flex items-center gap-1">
                  {a.status !== "generated" && a.status !== "rejected" && <RejectDialog a={a} />}
                  <ConfirmDelete
                    title="Delete this file?"
                    description={`Removes the file, its remarks, receipts and WhatsApp alert entries for both sides. This cannot be undone.${
                      a.fee_charged > 0 && !a.fee_refunded && a.status !== "generated"
                        ? ` The ${formatINR(a.fee_charged)} fee will be refunded to ${a.user_name}'s wallet.`
                        : ""
                    }`}
                    testId="detail-delete-button"
                    trigger={<Trash2 className="size-4" />}
                    onConfirm={async () => {
                      try {
                        const r = await apiDelete<DeleteResult>(`/attachments/${a.id}`);
                        toast.success(r.refunded > 0 ? `File deleted · ${formatINR(r.refunded)} refunded` : "File deleted");
                        qc.invalidateQueries({ queryKey: ["admin-users"] });
                        onClose();
                        qc.removeQueries({ queryKey: ["attachment", a.id] });
                        qc.invalidateQueries({ queryKey: ["attachments"] });
                        qc.invalidateQueries({ queryKey: ["daily-report"] });
      qc.invalidateQueries({ queryKey: ["monthly-income"] });
                        qc.invalidateQueries({ queryKey: ["whatsapp-alerts"] });
                      } catch (e) {
                        toast.error(errorMessage(e, "Could not delete"));
                      }
                    }}
                  />
                </span>
              )}
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {a?.status === "rejected" && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" data-testid="detail-rejected-banner">
              <p className="font-semibold">This file was rejected{a.rejected_at ? ` on ${formatIST(a.rejected_at)}` : ""}.</p>
              {a.reject_reason && <p className="mt-1" data-testid="detail-reject-reason">Reason: {a.reject_reason}</p>}
              {a.fee_refunded && a.fee_charged > 0 && (
                <p className="mt-1 font-medium text-green-800" data-testid="detail-refund-note">
                  {formatINR(a.fee_charged)} was refunded to the wallet.
                </p>
              )}
            </div>
          )}
          {a && (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 overflow-hidden" data-testid="detail-preview">
              {isImage ? (
                <img src={fileUrl(a.file.file_id)} alt={a.file.filename} className="max-h-80 w-full object-contain bg-stone-100" />
              ) : (
                <iframe src={fileUrl(a.file.file_id)} title={a.file.filename} className="h-80 w-full bg-white" />
              )}
              <div className="flex items-center justify-between gap-2 border-t border-stone-200 bg-white px-4 py-2.5">
                <span className="text-xs text-stone-500">{formatBytes(a.file.size)}</span>
                <div className="flex gap-2">
                  <a
                    href={fileUrl(a.file.file_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium hover:bg-stone-100"
                    data-testid="detail-open-file"
                  >
                    <ExternalLink className="size-4" /> Open
                  </a>
                  <a
                    href={fileUrl(a.file.file_id, true)}
                    className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-orange-700 transition-colors"
                    data-testid="detail-download-file"
                  >
                    <Download className="size-4" /> Download
                  </a>
                </div>
              </div>
            </div>
          )}

          {a && <MissingDocs a={a} role={role} required={data?.service_required_documents ?? []} />}

          <div>
            <p className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-3">Remarks & replies</p>
            <div className="space-y-3" data-testid="detail-messages">
              {data?.messages.map((m) => (
                <Bubble key={m.id} m={m} mine={m.sender_id === myId} />
              ))}
              {data && data.messages.length === 0 && (
                <p className="text-sm text-stone-500" data-testid="detail-no-messages">
                  No remarks yet. {role === "admin" ? "Attach the receipt below when it's ready." : "Add a note for the admin below."}
                </p>
              )}
              <div ref={endRef} />
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="border-t border-stone-200 bg-white p-4 space-y-3" data-testid="remark-form">
          {file && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm" data-testid="remark-file-chip">
              <FileIcon type={file.type} className="size-4" />
              <span className="truncate flex-1">{file.name}</span>
              {role === "admin" && <span className="text-[11px] font-semibold text-green-700">Sends as receipt</span>}
              <button type="button" onClick={() => setFile(null)} aria-label="Remove file" data-testid="remark-file-remove">
                <X className="size-4" />
              </button>
            </div>
          )}
          <Textarea
            rows={2}
            placeholder="Write a remark…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (text.trim() || file) send.mutate({ text, file });
              }
            }}
            data-testid="remark-input"
          />
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => fileInput.current?.click()} data-testid="remark-attach-button">
              <Paperclip className="size-4" /> {role === "admin" ? "Attach receipt" : "Attach file"}
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                const err = validateFiles([f]);
                if (err) return toast.error(err);
                setFile(f);
              }}
              data-testid="remark-file-input"
            />
            <Button type="submit" disabled={send.isPending || (!text.trim() && !file)} data-testid="remark-send-button">
              <Send className="size-4" /> {send.isPending ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
