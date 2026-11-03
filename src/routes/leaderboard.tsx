import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Crown, Clock, Info } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getLeaderboard } from "@/lib/api.functions";
import { auth } from "@/lib/tg";
import { LEADERBOARD_MIN_COINS, PRIZE_POOL_USD, PRIZE_WINNERS, LEADERBOARD_SHOWN } from "@/lib/rules";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Coin Rush" },
      { name: "description", content: "Top 30 players share a $10 prize pool every 2 days." },
      { property: "og:title", content: "Leaderboard — Coin Rush" },
      { property: "og:description", content: "Top 30 players share a $10 prize pool every 2 days." },
    ],
  }),
  component: Leaderboard,
});

function useCountdown(to?: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!to) return "--";
  const s = Math.max(0, Math.floor((to - now) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

function Leaderboard() {
  const fn = useServerFn(getLeaderboard);
  const { data, isLoading } = useQuery({ queryKey: ["leaderboard"], queryFn: () => fn({ data: auth() }), refetchInterval: 30_000 });
  const left = useCountdown(data?.seasonEndsAt);
  const medal = ["🥇", "🥈", "🥉"];

  return (
    <AppShell title="Leaderboard">
      <section className="rounded-3xl border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Prize pool</p>
            <p className="font-display text-4xl text-gold-gradient">${PRIZE_POOL_USD}</p>
          </div>
          <div className="text-right">
            <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> Resets in</p>
            <p className="font-display text-lg tabular-nums">{left}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2 rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <p>
            Earn <b className="text-foreground">{LEADERBOARD_MIN_COINS}+ coins</b> this round to appear here. Top{" "}
            <b className="text-foreground">{PRIZE_WINNERS}</b> share ${PRIZE_POOL_USD} (fair split, close prizes). Top{" "}
            {LEADERBOARD_SHOWN} are shown. Board resets every 2 days.
          </p>
        </div>
      </section>

      <section className="mt-4 space-y-2">
        {isLoading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-2xl bg-card" />)}
        {data && data.list.length === 0 && (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            <Crown className="mx-auto mb-2 h-8 w-8 text-primary" />
            No one has {LEADERBOARD_MIN_COINS} coins yet this round. Be the first!
          </div>
        )}
        {data?.list.map((r) => (
          <div
            key={r.tgId}
            className={`flex items-center gap-3 rounded-2xl border p-3 shadow-card ${r.isMe ? "border-primary bg-secondary" : "bg-card"} ${r.rank <= 3 ? "shadow-glow" : ""}`}
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display ${r.rank <= 3 ? "bg-gold text-primary-foreground" : "bg-muted"}`}>
              {medal[r.rank - 1] ?? r.rank}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.name}{r.isMe && " (you)"}</p>
              <p className="text-xs text-muted-foreground">{r.coins.toLocaleString()} coins</p>
            </div>
            <div className={`font-display ${r.prize > 0 ? "text-success" : "text-muted-foreground"}`}>
              {r.prize > 0 ? `$${r.prize.toFixed(2)}` : "—"}
            </div>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
