import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Play, Tv, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ShooterGame } from "@/components/ShooterGame";
import { usePlayer } from "@/hooks/use-player";
import { finishGame, grantAdPlay } from "@/lib/api.functions";
import { auth, haptic, showRewardAd } from "@/lib/tg";
import { GAME_REWARD } from "@/lib/rules";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Coin Rush — Play & Earn" },
      { name: "description", content: "Dodge, take cover and shoot street gangs in 90-second battles to earn coins." },
      { property: "og:title", content: "Coin Rush — Play & Earn" },
      { property: "og:description", content: "Dodge, take cover and shoot street gangs to earn coins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: me, isLoading, error, setPlayer } = usePlayer();
  const finish = useServerFn(finishGame);
  const adPlay = useServerFn(grantAdPlay);
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNowMs(Date.now()), 1000); return () => clearInterval(i); }, []);
  const waitSec = me ? Math.max(0, Math.ceil((me.adReadyAt - nowMs) / 1000)) : 0;
  const canPlay = !!me && (me.canPlayFree || me.extraPlays > 0);

  const onEnd = async (score: number, survived: number) => {
    setPlaying(false);
    try {
      const p = await finish({ data: { ...auth(), score, survived } });
      setPlayer(p);
      setResult(score);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const watchAd = async () => {
    setBusy(true);
    try {
      const ok = await showRewardAd();
      if (!ok) throw new Error("Watch the full ad to unlock a game");
      const p = await adPlay({ data: auth() });
      setPlayer(p);
      haptic("success");
      toast.success("Extra game unlocked!");
    } catch (e: any) {
      toast.error(e?.description || e?.message || "Ad not available right now");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Coin Rush">
      {playing && <ShooterGame onEnd={onEnd} />}

      <section className="relative overflow-hidden rounded-3xl border bg-card p-6 text-center shadow-card">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold opacity-20 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-coral opacity-20 blur-2xl" />
        <div className="relative mx-auto mb-4 flex h-32 w-32 items-center justify-center animate-float">
          <div className="absolute inset-0 rounded-full border-4 border-dashed border-primary/40 animate-spin-slow" />
          <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-gold shadow-glow">
            <span className="font-display text-4xl text-primary-foreground">$</span>
            <span className="absolute inset-y-0 w-6 bg-foreground/40 animate-shine" />
          </div>
        </div>
        <h2 className="text-3xl">Catch. Combo. Cash.</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Dodge, block and blast the enemy squad. Finish a game to win{" "}
          <b className="text-primary">{GAME_REWARD} coins</b>.
        </p>

        <div className="mt-6">
          {isLoading ? (
            <div className="h-16 animate-pulse rounded-2xl bg-muted" />
          ) : error ? (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          ) : canPlay ? (
            <button
              onClick={() => { haptic("medium"); setResult(null); setPlaying(true); }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold py-4 font-display text-2xl text-primary-foreground shadow-glow animate-pulse-ring active:scale-95 transition-transform"
            >
              <Play className="h-6 w-6 fill-current" />
              {me!.canPlayFree ? "Play" : `Play (${me!.extraPlays} left)`}
            </button>
          ) : (
            <button
              disabled={busy || waitSec > 0}
              onClick={watchAd}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-coral py-4 font-display text-xl text-accent-foreground shadow-card active:scale-95 transition-transform disabled:opacity-60"
            >
              <Tv className="h-6 w-6" />
              {waitSec > 0 ? `Next ad in ${Math.floor(waitSec / 60)}:${String(waitSec % 60).padStart(2, "0")}` : busy ? "Loading ad…" : "Watch ad to play more"}
            </button>
          )}
          <p className="mt-2 text-xs text-muted-foreground">Daily play: 1 free game every day</p>
        </div>
      </section>

      {result !== null && (
        <section className="mt-4 rounded-3xl border border-primary/40 bg-card p-5 text-center shadow-glow animate-in zoom-in-95 fade-in">
          <Sparkles className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-1 text-sm text-muted-foreground">Score {result}</p>
          <p className="font-display text-3xl text-gold-gradient">+{GAME_REWARD} coins</p>
        </section>
      )}

    </AppShell>
  );
}
