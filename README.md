# Remix of Telegram Coin Quest

amake ekta @connector:telegram:"Telegram" mini app baniye diba jar frontend hobe vercel a are backend hobe render a refer page thakbe home page thakbe leaderboard thakbe then withdraw page thakbe
home page a ekta button thakbe Play (Daily play 1 times ) etay click korar por tumi tumr nijer moto ekta animated game baniye deo tumr idea moto are game ta ses hole 100 coins pabe are ekbar khela ses houar por play button tar akhane dekhabe watch ad to play more are ei ads gula hobe adsgram er ads egula adsgram er offcial site theke dekhe kivabe ads er code bosabe hobe dekhe then korba are type hobe reward ads are leader board je akhane pothom 30 jon price pabe are 10 $ ei 30 joner moddhe vag hobe but show hobe 50 jon user baki 20 emnei show hobe tader kichu deoa hobe na are 10 $ je 30 joner moddhe share hobe tader ekjon theke onno joner prize er moddhe beshi distance hobe na are etah 2 din por por reset hobe are user der coins 500 houar por leaderboard er akhane show hobe are etah leaderboard page a mention o thakbe are withdraw page a $ are coins 2 tai show hobe are 1 $ er jonno 100000 coins kata hobe are ei unupate hisab hobe are withdraw page a payments proof are contact support er button o thakbe then history o thakbe egula idea thik rekhe app ta k khub shundor are khub shundor design soho are khub shundor ekta animated game baniye deo jeno user ra khub mojao pay abr earn o korte pare are bar bar khelar jonno interest o thake

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/85aacae6-a3a1-4d17-aa01-71a59fa35711).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

The frontend is a static Vite app deployed to Cloudflare Pages. Its `/api/*` Pages Function proxies to the separate Cloudflare Worker, which verifies Telegram `initData` and stores player state in Turso. Cloudflare Queues and a five-minute Cron Trigger provide the withdrawal-job retry path.

```sh
bun install
bun run dev
```

For Vite local development, set `API_PROXY_TARGET` to a running Worker dev-server origin. `VITE_API_BASE_URL` may be set when calling a separately hosted API directly; the Pages deployment uses the same-origin `/api` proxy by default.

## Checks and Deployment

```sh
bun run typecheck
bun run test
bun run build
```

Copy `.env.example` to `.env` and add the Turso and scoped Cloudflare credentials plus the Telegram bot token. `bun run deploy` creates the Turso schema, imports existing Supabase players and withdrawal history, provisions the payout queues, deploys the Worker, binds Worker secrets, then deploys Pages. The one-time import also needs `SUPABASE_SERVICE_ROLE_KEY`; it does not delete the source database. Pause writes to the old app during the final import/cutover and verify player and withdrawal counts before switching traffic.

Actual USDT transfers are intentionally not enabled yet: choose and configure a payout provider before the Queue consumer can make payments. Until then, new withdrawal requests stay pending and no funds are sent.
