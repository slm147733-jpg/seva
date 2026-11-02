import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet } from "./api";
import type { AttachmentList, Role } from "./types";

export const POLL_MS = 4000;

// ---- Notification chime (Web Audio, no asset needed) ----
let ctx: AudioContext | null = null;
export function playChime(): void {
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.14 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.35);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t + i * 0.14);
      osc.stop(t + i * 0.14 + 0.4);
    });
  } catch {
    /* audio unavailable — the toast still shows */
  }
}

export function notify(message: string, description?: string): void {
  playChime();
  toast.info(message, { description });
}

// ---- Server clock offset so timers don't depend on the device clock ----
let serverOffset = 0;
export function syncServerTime(serverIso: string): void {
  serverOffset = Date.parse(serverIso) - Date.now();
}
export const serverNow = () => Date.now() + serverOffset;

export function useTick(active: boolean): number {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

// ---- Live attachment feed: polls, and chimes when the other side does something new ----
export function useLiveAttachments(role: Role | undefined) {
  const query = useQuery({
    queryKey: ["attachments"],
    queryFn: async () => {
      const data = await apiGet<AttachmentList>("/attachments");
      syncServerTime(data.server_time);
      return data;
    },
    enabled: !!role,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  });

  const known = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!query.data || !role) return;
    const items = query.data.items;
    if (known.current === null) {
      known.current = new Map(items.map((a) => [a.id, a.last_event_at]));
      return;
    }
    const fresh = items.filter(
      (a) => a.last_event_role !== role && known.current!.get(a.id) !== a.last_event_at,
    );
    items.forEach((a) => known.current!.set(a.id, a.last_event_at));
    if (fresh.length === 1) notify(role === "admin" ? "New activity from a user" : "Update from Sevakendra", fresh[0].last_event_text);
    else if (fresh.length > 1) notify(`${fresh.length} new updates`, fresh[0].last_event_text);
  }, [query.data, role]);

  return query;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";
export const MAX_BYTES = 10 * 1024 * 1024;

export function validateFiles(files: File[]): string | null {
  for (const f of files) {
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) return `${f.name}: only PDF, JPG, JPEG or PNG allowed`;
    if (f.size > MAX_BYTES) return `${f.name}: larger than 10 MB`;
  }
  return null;
}
