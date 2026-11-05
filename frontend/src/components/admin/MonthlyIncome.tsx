import { SUPABASE_MODE, printMonthlyIncome } from "@/lib/supabaseApi";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Trophy } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import type { MonthlyIncome as Monthly } from "@/lib/types";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const monthLabel = (ym: string, short = false) =>
  new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: short ? "short" : "long", year: "numeric" });

// Month-by-month wallet income and refunds per service, best earner first.
export default function MonthlyIncome() {
  const q = useQuery({
    queryKey: ["monthly-income"],
    queryFn: () => apiGet<Monthly>("/admin/reports/monthly-income?months=6"),
    refetchInterval: 60000,
  });
  const months = q.data?.months ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const m = months.find((x) => x.month === picked) ?? months[0];
  const top = m?.services.find((s) => s.net > 0);
  const best = Math.max(1, ...(m?.services.map((s) => s.net) ?? [1]));

  return (
    <div className="mt-8" data-testid="monthly-income">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold">Monthly income by service</h2>
          <p className="text-sm text-stone-500">Wallet fees collected minus refunds, per service. Highest earner first.</p>
          {m && (
            <a
              href={SUPABASE_MODE ? "#" : `/api/admin/reports/monthly-income.pdf?month=${m.month}`}
              onClick={(e) => {
                if (SUPABASE_MODE) {
                  e.preventDefault();
                  void printMonthlyIncome(m.month);
                }
              }}
              download
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-stone-700 transition-colors duration-150"
              data-testid="monthly-income-download-pdf"
            >
              <FileDown className="size-4" /> Download {monthLabel(m.month, true)} PDF
            </a>
          )}
        </div>
        <div className="flex flex-wrap gap-1 rounded-full bg-white border border-stone-200 p-1" data-testid="monthly-income-months">
          {months.map((x) => (
            <button
              key={x.month}
              type="button"
              onClick={() => setPicked(x.month)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium transition-colors duration-150 ${
                m?.month === x.month ? "bg-orange-600 text-white" : "text-stone-600 hover:bg-stone-100"
              }`}
              data-testid={`monthly-income-month-${x.month}`}
            >
              {monthLabel(x.month, true)}
            </button>
          ))}
        </div>
      </div>

      {m && (
        <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-white p-5" data-testid="monthly-fees">
            <p className="text-sm text-stone-500">Fees collected · {monthLabel(m.month)}</p>
            <p className="mt-2 font-mono text-2xl font-bold text-green-800">{inr(m.fees_collected)}</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white p-5" data-testid="monthly-refunds">
            <p className="text-sm text-stone-500">Refunded</p>
            <p className="mt-2 font-mono text-2xl font-bold text-red-700">{inr(m.refunds)}</p>
          </div>
          <div className="rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-100 to-yellow-50 p-5" data-testid="monthly-net">
            <p className="text-sm text-amber-900">Net income</p>
            <p className="mt-2 font-mono text-2xl font-bold text-amber-950">{inr(m.net)}</p>
            {top && (
              <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-orange-700" data-testid="monthly-top-service">
                <Trophy className="size-3.5" /> Top earner: {top.service_name}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <Table data-testid="monthly-income-table">
          <TableHeader>
            <TableRow className="bg-stone-50">
              <TableHead>Service</TableHead>
              <TableHead className="text-right">Files charged</TableHead>
              <TableHead className="text-right">Fees collected</TableHead>
              <TableHead className="text-right">Refunded</TableHead>
              <TableHead className="text-right">Net income</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {m?.services.map((s, i) => (
              <TableRow key={`${s.service_id ?? s.service_name}`} data-testid={`monthly-row-${i}`}>
                <TableCell className="py-2.5">
                  <p className="font-medium" data-testid={`monthly-row-name-${i}`}>{s.service_name}</p>
                  <div className="mt-1 h-1.5 w-full max-w-48 rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 transition-[width] duration-500"
                      style={{ width: `${Math.max(0, (s.net / best) * 100)}%` }}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono">{s.files}</TableCell>
                <TableCell className="text-right font-mono text-green-800">{inr(s.fees_collected)}</TableCell>
                <TableCell className="text-right font-mono text-red-700">{inr(s.refunds)}</TableCell>
                <TableCell className="text-right font-mono font-semibold" data-testid={`monthly-row-net-${i}`}>{inr(s.net)}</TableCell>
              </TableRow>
            ))}
            {m && m.services.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-stone-500" data-testid="monthly-income-empty">
                  No fees collected in {monthLabel(m.month)}.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
