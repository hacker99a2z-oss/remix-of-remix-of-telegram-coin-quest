import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Headphones, History } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { usePlayer } from "@/hooks/use-player";
import { getWithdrawals, requestWithdraw } from "@/lib/api.functions";
import { auth, openLink, PROOF_URL, SUPPORT_URL, haptic } from "@/lib/tg";
import { COINS_PER_USD, MIN_WITHDRAW_USD, coinsToUsd } from "@/lib/rules";

export const Route = createFileRoute("/withdraw")({
  head: () => ({
    meta: [
      { title: "Withdraw — Coin Rush" },
      { name: "description", content: "Convert your Coin Rush coins to dollars and withdraw to Trust Wallet." },
      { property: "og:title", content: "Withdraw — Coin Rush" },
      { property: "og:description", content: "Convert coins to dollars and withdraw to Trust Wallet." },
    ],
  }),
  component: Withdraw,
});

function Withdraw() {
  const { data: me, refetch } = usePlayer();
  const qc = useQueryClient();
  const histFn = useServerFn(getWithdrawals);
  const reqFn = useServerFn(requestWithdraw);
  const { data: history } = useQuery({ queryKey: ["withdrawals"], queryFn: () => histFn({ data: auth() }) });
  const [usd, setUsd] = useState("1");
  const [wallet, setWallet] = useState("");
  const [busy, setBusy] = useState(false);

  const coins = me?.coins ?? 0;
  const balanceUsd = coinsToUsd(coins);
  const needCoins = Math.round((Number(usd) || 0) * COINS_PER_USD);

  const submit = async () => {
    setBusy(true);
    try {
      await reqFn({ data: { ...auth(), usd: Number(usd), wallet } });
      haptic("success");
      toast.success("Withdraw request sent!");
      setWallet("");
      refetch();
      qc.invalidateQueries({ queryKey: ["withdrawals"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Wallet">
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl border bg-card p-4 shadow-card">
          <p className="text-xs text-muted-foreground">Coins</p>
          <p className="font-display text-2xl text-gold-gradient">{coins.toLocaleString()}</p>
        </div>
        <div className="rounded-3xl border bg-card p-4 shadow-card">
          <p className="text-xs text-muted-foreground">Dollars</p>
          <p className="font-display text-2xl text-success">${balanceUsd.toFixed(2)}</p>
        </div>
      </section>
      <p className="mt-2 text-center text-xs text-muted-foreground">{COINS_PER_USD.toLocaleString()} coins = $1</p>

      <section className="mt-4 space-y-3 rounded-3xl border bg-card p-4 shadow-card">
        <h2 className="text-xl">Withdraw to Trust Wallet</h2>
        <label className="block text-xs text-muted-foreground">
          Amount (USD, min ${MIN_WITHDRAW_USD})
          <input
            type="number" min={MIN_WITHDRAW_USD} step="0.01" inputMode="decimal" value={usd}
            onChange={(e) => setUsd(e.target.value)}
            className="mt-1 w-full rounded-xl border bg-input px-3 py-3 text-base text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <p className="text-xs text-muted-foreground">Costs {needCoins.toLocaleString()} coins</p>
        <label className="block text-xs text-muted-foreground">
          Trust Wallet address (USDT)
          <input
            value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x… or T…"
            className="mt-1 w-full rounded-xl border bg-input px-3 py-3 font-mono text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <button
          onClick={submit}
          disabled={busy || needCoins > coins || Number(usd) < MIN_WITHDRAW_USD}
          className="w-full rounded-2xl bg-gold py-3.5 font-display text-xl text-primary-foreground shadow-glow active:scale-95 transition-transform disabled:opacity-40 disabled:shadow-none"
        >
          {busy ? "Sending…" : needCoins > coins ? "Not enough coins" : "Withdraw"}
        </button>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3">
        <button onClick={() => openLink(PROOF_URL)} className="flex items-center justify-center gap-2 rounded-2xl border bg-secondary py-3 text-sm font-medium active:scale-95 transition-transform">
          <BadgeCheck className="h-4 w-4 text-success" /> Payment proof
        </button>
        <button onClick={() => openLink(SUPPORT_URL)} className="flex items-center justify-center gap-2 rounded-2xl border bg-secondary py-3 text-sm font-medium active:scale-95 transition-transform">
          <Headphones className="h-4 w-4 text-primary" /> Contact support
        </button>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 flex items-center gap-2 text-xl"><History className="h-5 w-5" /> History</h2>
        {!history?.length && <p className="rounded-2xl border bg-card p-4 text-center text-sm text-muted-foreground">No withdrawals yet</p>}
        <div className="space-y-2">
          {history?.map((h) => (
            <div key={h.id} className="flex items-center justify-between rounded-2xl border bg-card p-3 shadow-card">
              <div>
                <p className="font-display text-lg">${h.usd.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()} · {h.wallet.slice(0, 6)}…{h.wallet.slice(-4)}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${h.status === "paid" ? "bg-success text-primary-foreground" : h.status === "rejected" ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>
                {h.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
