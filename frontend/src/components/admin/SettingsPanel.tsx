import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPut } from "@/lib/api";
import { DEFAULT_SITE, errorMessage, useSite } from "@/lib/hooks";
import type { Settings } from "@/lib/types";
import { PanelHeader } from "./common";

const FIELDS: { key: keyof Settings; label: string; long?: boolean; hint?: string }[] = [
  { key: "site_name", label: "Site name" },
  { key: "tagline", label: "Tagline" },
  { key: "hero_title", label: "Home headline" },
  { key: "hero_subtitle", label: "Home sub-text", long: true },
  { key: "announcement", label: "Announcement banner", hint: "Leave empty to hide the banner" },
  { key: "helpline", label: "Helpline number" },
  { key: "email", label: "Support email" },
  { key: "address", label: "Address" },
];

function SettingsForm({ initial }: { initial: Settings }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Settings>(initial);
  const save = useMutation({
    mutationFn: () => apiPut<Settings>("/admin/settings", form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site"] });
      toast.success("Website updated live");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <form
      className="rounded-2xl border border-stone-200 bg-white p-6 grid gap-5 md:grid-cols-2"
      data-testid="settings-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {FIELDS.map((f) => (
        <div key={f.key} className={`space-y-2 ${f.long ? "md:col-span-2" : ""}`}>
          <Label htmlFor={`s-${f.key}`}>{f.label}</Label>
          {f.long ? (
            <Textarea
              id={`s-${f.key}`}
              rows={3}
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              data-testid={`settings-${f.key}-input`}
            />
          ) : (
            <Input
              id={`s-${f.key}`}
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              data-testid={`settings-${f.key}-input`}
            />
          )}
          {f.hint && <p className="text-xs text-stone-500">{f.hint}</p>}
        </div>
      ))}
      <div className="md:col-span-2 flex justify-end">
        <Button type="submit" className="h-10 px-6" disabled={save.isPending} data-testid="settings-save-button">
          Save & publish
        </Button>
      </div>
    </form>
  );
}

export default function SettingsPanel() {
  const { data, isError, isLoading } = useSite();
  return (
    <div>
      <PanelHeader title="Site settings" subtitle="Change your website's name, home headline and contact details." />
      {isLoading ? (
        <div className="h-96 rounded-2xl bg-stone-100 animate-pulse" />
      ) : (
        <SettingsForm key={data?.settings.site_name ?? "x"} initial={data && !isError ? data.settings : DEFAULT_SITE.settings} />
      )}
    </div>
  );
}
