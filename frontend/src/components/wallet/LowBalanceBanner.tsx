import { useQuery } from "@tanstack/react-query";
import { BellRing, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api";
import { formatINR } from "@/lib/hooks";
import type { WalletMe } from "@/lib/types";
import { openWallet } from "./WalletButton";

// Reminds the user to top up when the wallet can't cover their usual service fee.
export default function LowBalanceBanner() {
  const { data } = useQuery({ queryKey: ["wallet-me"], queryFn: () => apiGet<WalletMe>("/wallet/me"), refetchInterval: 5000 });
  if (!data || data.usual_fee <= 0 || data.balance >= data.usual_fee) return null;
  const short = Math.round((data.usual_fee - data.balance) * 100) / 100;
  return (
    <div
      className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-orange-300 bg-gradient-to-r from-orange-50 to-yellow-50 p-4 shadow-sm animate-rise"
      role="alert"
      data-testid="low-balance-banner"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-600 text-white">
        <BellRing className="size-5" />
      </span>
      <div className="flex-1 text-sm text-orange-950">
        <p className="font-semibold" data-testid="low-balance-title">Low wallet balance</p>
        <p data-testid="low-balance-text">
          Your balance is <strong className="font-mono">₹{data.balance.toLocaleString("en-IN")}</strong>, but{" "}
          <strong>{data.usual_service_name}</strong> costs <strong className="font-mono">{formatINR(data.usual_fee)}</strong>. Add at least{" "}
          <strong className="font-mono">{formatINR(short)}</strong> to submit your next file.
        </p>
      </div>
      <Button onClick={openWallet} className="shrink-0" data-testid="low-balance-topup-button">
        <Wallet className="size-4" /> Add money
      </Button>
    </div>
  );
}
