import { createFileRoute } from "@tanstack/react-router";
import { Copy, Send, Gift } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { usePlayer } from "@/hooks/use-player";
import { BOT_USERNAME, openLink, haptic } from "@/lib/tg";
import { REFERRAL_REWARD, REFERRAL_GAMES_NEEDED } from "@/lib/rules";

export const Route = createFileRoute("/refer")({
  head: () => ({
    meta: [
      { title: "Invite Friends — Coin Rush" },
      { name: "description", content: "Invite friends to Coin Rush and earn bonus coins when they play 10 games." },
      { property: "og:title", content: "Invite Friends — Coin Rush" },
      { property: "og:description", content: "Invite friends and earn bonus coins." },
    ],
  }),
  component: Refer,
});

function Refer() {
  const { data: me } = usePlayer();
  const link = me ? `https://t.me/${BOT_USERNAME}?startapp=ref_${me.tgId}` : "";

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    haptic("success");
    toast.success("Link copied!");
  };
  const share = () => {
    const text = `🎮 Play Coin Rush with me and earn coins every day!`;
    openLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
  };

  return (
    <AppShell title="Invite Friends">
      <section className="rounded-3xl border bg-card p-6 text-center shadow-card">
        <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-coral shadow-card animate-float">
          <Gift className="h-10 w-10 text-accent-foreground" />
        </div>
        <h2 className="text-3xl">+{REFERRAL_REWARD} coins</h2>
        <p className="mt-1 text-sm text-muted-foreground">for every friend who joins with your link and plays {REFERRAL_GAMES_NEEDED} games</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-muted p-3">
            <p className="font-display text-2xl">{me?.referralCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">Friends</p>
          </div>
          <div className="rounded-2xl bg-muted p-3">
            <p className="font-display text-2xl text-gold-gradient">{((me?.referralCount ?? 0) * REFERRAL_REWARD).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Coins earned</p>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-3xl border bg-card p-4 shadow-card">
        <p className="mb-2 text-xs text-muted-foreground">Your invite link</p>
        <div className="truncate rounded-xl bg-muted px-3 py-3 font-mono text-xs">{link || "…"}</div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button onClick={copy} disabled={!me} className="flex items-center justify-center gap-2 rounded-2xl border bg-secondary py-3 font-medium active:scale-95 transition-transform">
            <Copy className="h-4 w-4" /> Copy
          </button>
          <button onClick={share} disabled={!me} className="flex items-center justify-center gap-2 rounded-2xl bg-gold py-3 font-display text-lg text-primary-foreground shadow-glow active:scale-95 transition-transform">
            <Send className="h-4 w-4" /> Share
          </button>
        </div>
      </section>
    </AppShell>
  );
}
