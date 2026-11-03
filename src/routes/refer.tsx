import { createFileRoute } from "@tanstack/react-router";
import { Copy, Send, Gift, UserPlus, Gamepad2, Coins } from "lucide-react";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

  const steps = [
    { icon: UserPlus, title: "Share your link", text: "Send it to friends on Telegram" },
    { icon: Gamepad2, title: `They play ${REFERRAL_GAMES_NEEDED} games`, text: "Any game counts" },
    { icon: Coins, title: `You get +${REFERRAL_REWARD}`, text: "Coins land in your wallet" },
  ];

  return (
    <AppShell title="Invite Friends">
      <section className="relative overflow-hidden rounded-3xl border border-accent/40 bg-card p-6 text-center shadow-card">
        <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-coral opacity-30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -right-10 h-40 w-40 rounded-full bg-gold opacity-25 blur-3xl" />
        <div className="relative mx-auto mb-3 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-coral shadow-card animate-float">
          <Gift className="h-12 w-12 text-accent-foreground" />
        </div>
        <p className="relative text-xs uppercase tracking-wider text-muted-foreground">Per friend</p>
        <h2 className="relative font-display text-5xl text-gold-gradient">+{REFERRAL_REWARD}</h2>
        <p className="relative text-sm text-muted-foreground">coins</p>

        <div className="relative mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-muted p-3">
            <p className="font-display text-3xl">{me?.referralCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">Friends joined</p>
          </div>
          <div className="rounded-2xl bg-muted p-3">
            <p className="font-display text-3xl text-gold-gradient">{((me?.referralCount ?? 0) * REFERRAL_REWARD).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Coins earned</p>
          </div>
        </div>
      </section>

      <section className="mt-4 rounded-3xl border bg-card p-4 shadow-card">
        <h3 className="mb-3 text-lg">How it works</h3>
        <ol className="space-y-3">
          {steps.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex items-center gap-3">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <Icon className="h-5 w-5" />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold font-display text-xs text-primary-foreground">{i + 1}</span>
              </span>
              <div>
                <p className="font-medium">{title}</p>
                <p className="text-xs text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-4 rounded-3xl border bg-card p-4 shadow-card">
        <p className="mb-2 text-xs text-muted-foreground">Your invite link</p>
        <div className="truncate rounded-xl border border-dashed border-primary/40 bg-muted px-3 py-3 font-mono text-xs">{link || "…"}</div>
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
