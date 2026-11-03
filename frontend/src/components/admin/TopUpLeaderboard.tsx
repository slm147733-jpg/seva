import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Medal } from "lucide-react";
import { apiGet } from "@/lib/api";
import { formatIST } from "@/lib/hooks";
import type { TopUpLeaderboard as Board } from "@/lib/types";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const MEDAL = ["text-yellow-500", "text-stone-400", "text-amber-700"];

// Users ranked by verified wallet top-ups per month — your most regular customers.
export default function TopUpLeaderboard() {
  const [month, setMonth] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["topup-leaderboard", month],
    queryFn: () => apiGet<Board>(`/admin/reports/topup-leaderboard${month ? `?month=${month}` : ""}`),
    refetchInterval: 60000,
  });
  const b = q.data;
  const top = b?.leaders[0]?.total ?? 1;

  return (
    <div className="mt-8" data-testid="topup-leaderboard">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold">Top-up leaderboard</h2>
          <p className="text-sm text-stone-500">
            Users who added the most money to their wallet{b ? ` · ${inr(b.total)} in ${monthLabel(b.month)}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-full bg-white border border-stone-200 p-1" data-testid="leaderboard-months">
          {(b?.months ?? []).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMonth(m)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium transition-colors duration-150 ${
                b?.month === m ? "bg-orange-600 text-white" : "text-stone-600 hover:bg-stone-100"
              }`}
              data-testid={`leaderboard-month-${m}`}
            >
              {monthLabel(m)}
            </button>
          ))}
        </div>
      </div>
      <ol className="mt-4 rounded-2xl border border-stone-200 bg-white divide-y divide-stone-100">
        {b?.leaders.map((l, i) => (
          <li key={l.user_id} className="flex items-center gap-4 px-5 py-3 animate-rise" style={{ animationDelay: `${i * 30}ms` }} data-testid={`leaderboard-row-${i}`}>
            <span className="w-7 text-center font-mono font-bold text-stone-500">
              {i < 3 ? <Medal className={`size-5 inline ${MEDAL[i]}`} /> : i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate" data-testid={`leaderboard-name-${i}`}>{l.user_name}</p>
              <p className="text-xs text-stone-500">
                <span className="font-mono">{l.user_mobile}</span> · {l.count} top-up{l.count === 1 ? "" : "s"} · last {formatIST(l.last_at)}
              </p>
              <div className="mt-1.5 h-1.5 max-w-72 rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 transition-[width] duration-500" style={{ width: `${(l.total / top) * 100}%` }} />
              </div>
            </div>
            <span className="font-mono text-lg font-bold text-sky-800" data-testid={`leaderboard-total-${i}`}>{inr(l.total)}</span>
          </li>
        ))}
        {b && b.leaders.length === 0 && (
          <li className="px-5 py-6 text-center text-stone-500" data-testid="leaderboard-empty">No wallet top-ups in {monthLabel(b.month)}.</li>
        )}
      </ol>
    </div>
  );
}
