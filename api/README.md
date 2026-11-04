# Coin Rush Worker API

Copy `.env.example` to `.env` for deployment and migration tools. Run `bun run db:migrate` before deployment. Bind `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `TELEGRAM_BOT_TOKEN` as Worker secrets; `PAYOUT_QUEUE` is declared in `wrangler.jsonc`. For local Vite development, set `API_PROXY_TARGET` to the Wrangler dev server origin. For direct Wrangler development, copy `.dev.vars.example` to `.dev.vars` in `api/`.

To preserve existing accounts and balances, add the source `SUPABASE_SERVICE_ROLE_KEY` locally and run `bun run db:import-supabase` after the Turso migration; this copies players and withdrawal history without deleting the source database. Do not deploy/cut over until this import has completed and the row totals have been checked.

Every endpoint is POST JSON and requires `{ "initData": "<Telegram.WebApp.initData>" }`. Routes: `/api/me`, `/api/game/start`, `/api/game/finish` (also `sessionId`, `score`, `kills`), `/api/ad/unlock`, `/api/daily-bonus/claim`, `/api/leaderboard`, `/api/withdrawals/request` (`usd`, `wallet`), and `/api/withdrawals/list`. Errors use `{ "error": { "code": "..." } }`.

Payout jobs are recorded and queued, but the consumer deliberately transitions them to `awaiting_provider`. It does not initiate transfers or mark withdrawals paid. A payout provider must be selected and integrated before withdrawals can be automated. Cron retries queued jobs after delivery failures; repeated queue delivery is harmless.
