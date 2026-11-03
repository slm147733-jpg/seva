import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPut } from "@/lib/api";
import { errorMessage } from "@/lib/hooks";
import type { RejectReasons } from "@/lib/types";

export const useRejectReasons = () =>
  useQuery({ queryKey: ["reject-reasons"], queryFn: () => apiGet<RejectReasons>("/admin/reject-reasons") });

function Editor({ initial }: { initial: string[] }) {
  const qc = useQueryClient();
  const [list, setList] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  const save = useMutation({
    mutationFn: () => apiPut<RejectReasons>("/admin/reject-reasons", { reasons: list } satisfies RejectReasons),
    onSuccess: (r) => {
      qc.setQueryData(["reject-reasons"], r);
      setList(r.reasons);
      toast.success("Quick reject reasons saved");
    },
    onError: (e) => toast.error(errorMessage(e, "Could not save")),
  });
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (list.includes(v)) return toast.error("That reason is already in the list");
    setList([...list, v]);
    setDraft("");
  };

  return (
    <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-6" data-testid="reject-reasons-editor">
      <h2 className="font-heading text-lg font-bold flex items-center gap-2">
        <Ban className="size-5 text-red-600" /> Quick reject reasons
      </h2>
      <p className="text-sm text-stone-500">One-tap reasons shown when you reject a file. Edit the text, remove, or add your own.</p>
      <ul className="mt-4 space-y-2">
        {list.map((r, i) => (
          <li key={i} className="flex items-center gap-2" data-testid={`reject-reason-item-${i}`}>
            <Input
              value={r}
              maxLength={80}
              onChange={(e) => setList(list.map((x, j) => (j === i ? e.target.value : x)))}
              data-testid={`reject-reason-edit-${i}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-red-600 hover:bg-red-50"
              onClick={() => setList(list.filter((_, j) => j !== i))}
              data-testid={`reject-reason-remove-${i}`}
            >
              <X className="size-4" />
            </Button>
          </li>
        ))}
        {list.length === 0 && <li className="text-sm text-stone-500" data-testid="reject-reasons-empty">No quick reasons — add one below.</li>}
      </ul>
      <div className="mt-3 flex gap-2">
        <Input
          placeholder="e.g. Signature missing"
          value={draft}
          maxLength={80}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          data-testid="reject-reason-new-input"
        />
        <Button type="button" variant="outline" onClick={add} disabled={list.length >= 30} data-testid="reject-reason-add-button">
          <Plus className="size-4" /> Add
        </Button>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="reject-reasons-save-button">
          {save.isPending ? "Saving…" : "Save reasons"}
        </Button>
      </div>
    </div>
  );
}

export default function RejectReasonsEditor() {
  const { data } = useRejectReasons();
  if (!data) return <div className="mt-8 h-48 rounded-2xl bg-stone-100 animate-pulse" />;
  return <Editor key={data.reasons.join("|")} initial={data.reasons} />;
}
