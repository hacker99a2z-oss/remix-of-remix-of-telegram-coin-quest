import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Play, Tv, Trophy, Swords, Timer, Shield, Crosshair, Skull, Gift } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ShooterGame } from "@/components/ShooterGame";
import { usePlayer } from "@/hooks/use-player";
import { finishGame, grantAdPlay } from "@/lib/api.functions";
import { auth, haptic, showRewardAd } from "@/lib/tg";
import { GAME_REWARD, GAME_SECONDS } from "@/lib/rules";
import arenaBg from "@/assets/arena-bg.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Coin Rush — Play & Earn" },
      { name: "description", content: "Take cover, block and shoot the enemy squad. Survive 90 seconds to earn coins." },
      { property: "og:title", content: "Coin Rush — Play & Earn" },
      { property: "og:description", content: "Survive 90-second battles against the enemy squad to earn coins." },
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
  const [result, setResult] = useState<{ score: number; reward: number; survived: number } | null>(null);
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
      setResult({ score, reward: p.reward, survived });
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
    <AppShell title="Battle Arena">
      {playing && <ShooterGame onEnd={onEnd} />}

      <section className="relative overflow-hidden rounded-3xl border border-primary/30 shadow-card">
        <img src={arenaBg} alt="Military base arena" className="absolute inset-0 h-full w-full object-cover object-top" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/50 to-background" />
        <div className="relative flex min-h-[340px] flex-col justify-end p-5">
          <span className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground">
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive-foreground" /> Enemy squad incoming
          </span>
          <h2 className="text-4xl leading-none drop-shadow">Survive {GAME_SECONDS}s.<br /><span className="text-gold-gradient">Win {GAME_REWARD} coins.</span></h2>
          <p className="mt-2 text-sm text-foreground/80">Hide behind cover, raise your shield and take them down one by one.</p>

          <div className="mt-5">
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
                {me!.canPlayFree ? "Play free game" : `Play (${me!.extraPlays} left)`}
              </button>
            ) : (
              <button
                disabled={busy || waitSec > 0}
                onClick={watchAd}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-coral py-4 font-display text-xl text-accent-foreground shadow-card active:scale-95 transition-transform disabled:opacity-70"
              >
                {waitSec > 0 ? <Timer className="h-6 w-6" /> : <Tv className="h-6 w-6" />}
                {waitSec > 0 ? `Next ad in ${Math.floor(waitSec / 60)}:${String(waitSec % 60).padStart(2, "0")}` : busy ? "Loading ad…" : "Watch ad to play"}
              </button>
            )}
          </div>
        </div>
      </section>

      {result && (
        <section className={`mt-4 rounded-3xl border p-5 text-center shadow-card animate-in zoom-in-95 fade-in ${result.reward > 0 ? "border-primary/50 bg-card shadow-glow" : "border-destructive/40 bg-card"}`}>
          {result.reward > 0 ? <Trophy className="mx-auto h-9 w-9 text-primary" /> : <Skull className="mx-auto h-9 w-9 text-destructive" />}
          <p className="mt-1 font-display text-2xl">{result.reward > 0 ? "You survived!" : `K.O. at ${Math.floor(result.survived)}s`}</p>
          <p className="text-sm text-muted-foreground">Score {result.score}</p>
          <p className={`mt-1 font-display text-3xl ${result.reward > 0 ? "text-gold-gradient" : "text-muted-foreground"}`}>+{result.reward} coins</p>
          {result.reward === 0 && <p className="mt-1 text-xs text-muted-foreground">Survive the full {GAME_SECONDS} seconds to earn {GAME_REWARD} coins.</p>}
        </section>
      )}

      <section className="mt-4 grid grid-cols-3 gap-3">
        <Stat icon={<Swords className="h-5 w-5 text-primary" />} label="Games" value={me?.gamesPlayed ?? 0} />
        <Stat icon={<Trophy className="h-5 w-5 text-gold" />} label="Best" value={me?.bestScore ?? 0} />
        <Stat icon={<Gift className="h-5 w-5 text-success" />} label="Extra" value={me?.extraPlays ?? 0} />
      </section>

      <section className="mt-4 rounded-3xl border bg-card p-4 shadow-card">
        <h3 className="mb-3 text-lg">How to win</h3>
        <ul className="space-y-3 text-sm">
          <Tip icon={<Shield className="h-4 w-4" />} text="Hold the blue shield button to block bullets." />
          <Tip icon={<Crosshair className="h-4 w-4" />} text="Hold the orange button, drag to aim, let go to shoot." />
          <Tip icon={<Timer className="h-4 w-4" />} text={`One free game every day. Stay alive all ${GAME_SECONDS}s for ${GAME_REWARD} coins.`} />
        </ul>
      </section>
    </AppShell>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-3 text-center shadow-card">
      <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-muted">{icon}</div>
      <p className="font-display text-xl tabular-nums">{value.toLocaleString()}</p>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function Tip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">{icon}</span>
      <span className="text-muted-foreground">{text}</span>
    </li>
  );
}
