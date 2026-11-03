import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, TriangleAlert } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { formatIST } from "@/lib/hooks";
import type { DailyReport, Service, WhatsAppAlert } from "@/lib/types";
import ServiceSelect from "@/components/files/ServiceSelect";
import { PanelHeader } from "./common";
import MonthlyIncome from "./MonthlyIncome";

const RANGES = [7, 14, 30];

const fmtMins = (m: number | null) => {
  if (m === null) return "—";
  if (m < 60) return `${m.toFixed(1)} min`;
  return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

const ALERT_STATUS: Record<WhatsAppAlert["status"], { label: string; cls: string }> = {
  not_connected: { label: "Not connected", cls: "bg-stone-100 text-stone-700" },
  sent: { label: "Sent", cls: "bg-green-100 text-green-800" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700" },
};

export default function ReportsPanel() {
  const [days, setDays] = useState(14);
  const [serviceId, setServiceId] = useState("");
  const servicesQ = useQuery({ queryKey: ["admin-services"], queryFn: () => apiGet<Service[]>("/admin/services") });
  const report = useQuery({
    queryKey: ["daily-report", days, serviceId],
    queryFn: () =>
      apiGet<DailyReport>(`/admin/reports/daily?days=${days}${serviceId ? `&service_id=${encodeURIComponent(serviceId)}` : ""}`),
    refetchInterval: 30000,
  });
  const alerts = useQuery({ queryKey: ["whatsapp-alerts"], queryFn: () => apiGet<WhatsAppAlert[]>("/admin/whatsapp-alerts") });
  const r = report.data && !report.isError ? report.data : null;
  const todayRow = r?.days[0];
  const chart = r ? [...r.days].reverse().map((d) => ({ ...d, label: shortDate(d.date) })) : [];

  const cards = [
    { key: "today-received", label: "Received today", value: todayRow?.received ?? "—" },
    { key: "today-generated", label: "Receipts today", value: todayRow?.generated ?? "—" },
    { key: "today-avg", label: "Avg time today", value: todayRow ? fmtMins(todayRow.avg_minutes) : "—" },
    { key: "pending", label: "Pending now", value: r ? r.current.not_started + r.current.seen + r.current.processing : "—" },
  ];
  const money = [
    { key: "fees-today", label: "Fees collected today", value: todayRow ? inr(todayRow.fees_collected) : "—" },
    { key: "refunds-today", label: "Refunded today", value: todayRow ? inr(todayRow.refunds) : "—" },
    { key: "net-today", label: "Net income today", value: todayRow ? inr(todayRow.net_fees) : "—" },
    { key: "net-range", label: `Net income · ${days} days`, value: r ? inr(r.total_net_fees) : "—" },
  ];

  return (
    <div>
      <PanelHeader
        title="Daily work report"
        subtitle="Files received, opened and finished each day (India time), with time taken and wallet fees collected minus refunds."
        action={
          <div className="flex flex-col sm:flex-row gap-2">
          <ServiceSelect
            value={serviceId}
            onChange={setServiceId}
            options={(servicesQ.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
            testId="report-service-filter"
          />
          <div className="flex gap-1 rounded-full bg-white border border-stone-200 p-1" data-testid="report-range">
            {RANGES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDays(n)}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium transition-colors duration-150 ${
                  days === n ? "bg-orange-600 text-white" : "text-stone-600 hover:bg-stone-100"
                }`}
                data-testid={`report-range-${n}`}
              >
                {n} days
              </button>
            ))}
          </div>
          </div>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.map((c, i) => (
          <div
            key={c.key}
            className={`rounded-2xl border p-5 animate-rise ${i === 0 ? "bg-gradient-to-br from-orange-600 to-amber-400 text-white border-orange-500" : "bg-white border-stone-200"}`}
            style={{ animationDelay: `${i * 40}ms` }}
            data-testid={`report-card-${c.key}`}
          >
            <p className={`text-sm ${i === 0 ? "text-white/85" : "text-stone-500"}`}>{c.label}</p>
            <p className="mt-2 font-mono text-3xl font-bold" data-testid={`report-value-${c.key}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 grid-cols-2 lg:grid-cols-4" data-testid="report-money">
        {money.map((c, i) => (
          <div
            key={c.key}
            className={`rounded-2xl border p-5 animate-rise ${c.key === "net-range" ? "bg-amber-100 border-amber-300" : "bg-white border-stone-200"}`}
            style={{ animationDelay: `${160 + i * 40}ms` }}
            data-testid={`report-card-${c.key}`}
          >
            <p className="text-sm text-stone-500">{c.label}</p>
            <p className={`mt-2 font-mono text-2xl font-bold ${c.key.startsWith("refunds") ? "text-red-700" : "text-green-800"}`} data-testid={`report-value-${c.key}`}>
              {c.value}
            </p>
          </div>
        ))}
      </div>

      {r && (
        <p className="mt-4 text-sm text-stone-600" data-testid="report-current">
          Right now: <strong>{r.current.not_started}</strong> not yet started · <strong>{r.current.seen}</strong> seen ·{" "}
          <strong>{r.current.processing}</strong> processing · <strong>{r.current.generated}</strong> generated · <strong>{r.current.rejected}</strong> rejected · overall average{" "}
          <strong>{fmtMins(r.avg_minutes)}</strong>
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5" data-testid="report-chart">
        <h2 className="font-heading font-semibold mb-4">Received vs receipts generated</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="received" name="Received" fill="#EA580C" radius={[6, 6, 0, 0]} />
              <Bar dataKey="generated" name="Generated" fill="#EAB308" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <Table data-testid="report-table">
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Opened (seen)</TableHead>
              <TableHead className="text-right">Receipts generated</TableHead>
              <TableHead className="text-right">Rejected</TableHead>
              <TableHead className="text-right">Avg time taken</TableHead>
              <TableHead className="text-right">Fees collected</TableHead>
              <TableHead className="text-right">Refunded</TableHead>
              <TableHead className="text-right">Net income</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r?.days.map((d) => (
              <TableRow key={d.date} data-testid={`report-row-${d.date}`}>
                <TableCell className="font-medium py-2.5">
                  {shortDate(d.date)} {d.date === r.today && <span className="ml-1 text-xs text-orange-700">(today)</span>}
                </TableCell>
                <TableCell className="text-right font-mono">{d.received}</TableCell>
                <TableCell className="text-right font-mono">{d.seen}</TableCell>
                <TableCell className="text-right font-mono">{d.generated}</TableCell>
                <TableCell className="text-right font-mono">{d.rejected}</TableCell>
                <TableCell className="text-right font-mono">{fmtMins(d.avg_minutes)}</TableCell>
                <TableCell className="text-right font-mono text-green-800" data-testid={`report-fees-${d.date}`}>{inr(d.fees_collected)}</TableCell>
                <TableCell className="text-right font-mono text-red-700" data-testid={`report-refunds-${d.date}`}>{inr(d.refunds)}</TableCell>
                <TableCell className="text-right font-mono font-semibold" data-testid={`report-net-${d.date}`}>{inr(d.net_fees)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <MonthlyIncome />

      <div className="mt-8" data-testid="whatsapp-log">
        <h2 className="font-heading text-xl font-bold flex items-center gap-2">
          <MessageCircle className="size-5 text-green-600" /> WhatsApp receipt alerts
        </h2>
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="whatsapp-not-connected-note">
          <TriangleAlert className="size-5 shrink-0 text-amber-600" />
          <p>
            No WhatsApp service is connected yet, so these messages are <strong>prepared and logged but not actually sent</strong>. Once you connect
            a service (e.g. Twilio or Meta WhatsApp Business), new alerts will go out automatically.
          </p>
        </div>
        <ul className="mt-4 rounded-2xl border border-stone-200 bg-white divide-y divide-stone-100">
          {(alerts.data ?? []).map((a) => (
            <li key={a.id} className="px-5 py-3.5" data-testid={`whatsapp-alert-${a.id}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  {a.user_name} <span className="font-mono text-xs text-stone-500">+91 {a.mobile}</span>
                </p>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ALERT_STATUS[a.status].cls}`} data-testid={`whatsapp-alert-status-${a.id}`}>
                    {ALERT_STATUS[a.status].label}
                  </span>
                  <span className="text-xs text-stone-500">{formatIST(a.created_at)}</span>
                </div>
              </div>
              <p className="mt-1 text-sm text-stone-600">{a.message}</p>
            </li>
          ))}
          {alerts.isSuccess && alerts.data.length === 0 && (
            <li className="px-5 py-6 text-stone-500" data-testid="whatsapp-empty">
              No alerts yet — one is created each time you send a receipt.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
