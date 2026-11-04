import { createClient, type Client } from "@libsql/client/web";

type QueueBinding = { send(body: unknown): Promise<void> };
type Env = {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
  PAYOUT_QUEUE?: QueueBinding;
};
type TelegramUser = {
  id: number;
  first_name: string;
  username: string | null;
  photo_url: string | null;
};
type PlayerRow = {
  tg_id: number;
  first_name: string;
  username: string | null;
  photo_url: string | null;
  coins: number;
  season_coins: number;
  season_id: number;
  games_played: number;
  best_score: number;
  last_play_date: string | null;
  extra_plays: number;
  ad_ready_at: number;
  referral_count: number;
  referred_by: number | null;
  referral_paid: number;
  daily_games: number;
  daily_games_date: string | null;
  bonus_claimed_date: string | null;
  created_at: string;
};

const SEASON_MS = 2 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const COINS_PER_USD = 100_000;
const MIN_WITHDRAW_CENTS = 2;
const MAX_PENDING_AD_PLAYS = 3;
const dbCache = new WeakMap<object, Client>();

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

function fail(status: number, code: string): never {
  throw new ApiError(status, code);
}

const dateUTC = (time = Date.now()) => new Date(time).toISOString().slice(0, 10);
const seasonId = (time = Date.now()) => Math.floor(time / SEASON_MS);
const asRow = <T>(value: unknown): T => value as T;

function database(env: Env): Client {
  const url = env.TURSO_DATABASE_URL;
  const authToken = env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) {
    fail(503, "database_unavailable");
  }
  const cached = dbCache.get(env);
  if (cached) return cached;
  const client = createClient({
    url,
    authToken,
    intMode: "number",
  });
  dbCache.set(env, client);
  return client;
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return mismatch === 0;
}

async function verifyTelegram(
  body: unknown,
  env: Env,
): Promise<{ user: TelegramUser; body: Record<string, unknown> }> {
  if (!env.TELEGRAM_BOT_TOKEN) fail(503, "telegram_auth_unavailable");
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "invalid_json");

  const requestBody = body as Record<string, unknown>;
  const initData = requestBody.initData;
  if (typeof initData !== "string" || initData.length === 0 || initData.length > 4096) {
    fail(401, "invalid_auth");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) fail(401, "invalid_auth");
  params.delete("hash");

  const authDate = Number(params.get("auth_date"));
  const nowSeconds = Date.now() / 1000;
  if (!Number.isFinite(authDate) || authDate > nowSeconds + 60 || nowSeconds - authDate > 86400) {
    fail(401, "expired_auth");
  }

  const checkString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const encoder = new TextEncoder();
  const key0 = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secret = await crypto.subtle.sign("HMAC", key0, encoder.encode(env.TELEGRAM_BOT_TOKEN));
  const key = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(checkString)));
  const expectedHash = [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
  if (!constantTimeEqual(hash.toLowerCase(), expectedHash)) fail(401, "invalid_auth");

  let telegramUser: unknown;
  try {
    telegramUser = JSON.parse(params.get("user") ?? "{}");
  } catch {
    fail(401, "invalid_auth");
  }
  if (!telegramUser || typeof telegramUser !== "object") fail(401, "invalid_auth");
  const rawUser = telegramUser as Record<string, unknown>;
  const telegramId = rawUser.id;
  const firstName = rawUser.first_name;
  if (
    !Number.isSafeInteger(telegramId) ||
    Number(telegramId) <= 0 ||
    typeof firstName !== "string"
  ) {
    fail(401, "invalid_auth");
  }

  return {
    user: {
      id: Number(telegramId),
      first_name: firstName.slice(0, 128),
      username: typeof rawUser.username === "string" ? rawUser.username.slice(0, 64) : null,
      photo_url: typeof rawUser.photo_url === "string" ? rawUser.photo_url.slice(0, 2048) : null,
    },
    body: requestBody,
  };
}

async function ensurePlayer(
  db: Client,
  user: TelegramUser,
  startParam: unknown,
): Promise<PlayerRow> {
  let referredBy: number | null = null;
  if (typeof startParam === "string") {
    const match = /^ref_(\d+)$/.exec(startParam.slice(0, 128));
    if (match) {
      const parsedId = Number(match[1]);
      if (Number.isSafeInteger(parsedId) && parsedId !== user.id) referredBy = parsedId;
    }
  }

  await db.execute({
    sql: `INSERT INTO players (tg_id, first_name, username, photo_url, season_id, referred_by)
      VALUES (?, ?, ?, ?, ?, (SELECT tg_id FROM players WHERE tg_id = ?))
      ON CONFLICT(tg_id) DO UPDATE SET
        first_name = excluded.first_name,
        username = excluded.username,
        photo_url = COALESCE(excluded.photo_url, players.photo_url)`,
    args: [user.id, user.first_name, user.username, user.photo_url, seasonId(), referredBy],
  });
  const result = await db.execute({
    sql: "SELECT * FROM players WHERE tg_id = ?",
    args: [user.id],
  });
  const player = asRow<PlayerRow | undefined>(result.rows[0]);
  if (!player) fail(500, "player_unavailable");
  return player;
}

function playerView(player: PlayerRow, time = Date.now()) {
  const currentSeason = seasonId(time);
  const today = dateUTC(time);
  return {
    tgId: Number(player.tg_id),
    name: player.first_name,
    username: player.username,
    coins: Number(player.coins),
    seasonCoins: Number(player.season_id) === currentSeason ? Number(player.season_coins) : 0,
    canPlayFree: player.last_play_date !== today,
    extraPlays: Number(player.extra_plays),
    gamesPlayed: Number(player.games_played),
    bestScore: Number(player.best_score),
    referralCount: Number(player.referral_count),
    photoUrl: player.photo_url,
    adReadyAt: Number(player.ad_ready_at) || 0,
    dailyGames: player.daily_games_date === today ? Number(player.daily_games) : 0,
    bonusClaimedToday: player.bonus_claimed_date === today,
  };
}

function response(data: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });
}

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    invalid_auth: "Open this app inside Telegram",
    expired_auth: "Session expired, reopen the app",
    no_game_available: "No plays left — watch an ad to play again",
    play_unavailable: "No plays left — watch an ad to play again",
    ad_cooldown: "Next ad unlocks soon — please wait",
    ad_play_limit: "You have reached the extra-play limit",
    bonus_not_ready: "Play 100 games today to claim",
    bonus_already_claimed: "Bonus already claimed today",
    insufficient_coins: "Not enough coins",
    invalid_wallet: "Enter a valid Trust Wallet address",
    minimum_withdrawal: "Minimum withdraw is $0.02",
    payout_provider_unavailable: "Withdraw request is pending payout setup",
  };
  return messages[code] ?? code.replaceAll("_", " ");
}

function apiError(error: unknown): Response {
  const known = error instanceof ApiError ? error : new ApiError(500, "internal_error");
  return response({ error: { code: known.code, message: messageFor(known.code) } }, known.status);
}

function secureRandomInt(min: number, max: number): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return min + (values[0]! % (max - min + 1));
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");

  if (request.method === "OPTIONS") return response({}, 204);
  if (request.method === "GET" && path === "/health") return response({ ok: true });
  if (request.method !== "POST") fail(405, "method_not_allowed");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    fail(400, "invalid_json");
  }
  const { user, body: input } = await verifyTelegram(body, env);
  const db = database(env);

  if (path === "/api/me") {
    const player = await ensurePlayer(db, user, input.startParam);
    return response(playerView(player));
  }

  if (path === "/api/game/start") {
    await ensurePlayer(db, user, input.startParam);
    const now = Date.now();
    const today = dateUTC(now);
    const tx = await db.transaction("write");
    try {
      await tx.execute({
        sql: "UPDATE game_sessions SET finished_at = ? WHERE tg_id = ? AND finished_at IS NULL AND created_at <= ?",
        args: [now, user.id, now - 30 * 60 * 1000],
      });
      const active = await tx.execute({
        sql: "SELECT id, enemy_total FROM game_sessions WHERE tg_id = ? AND finished_at IS NULL LIMIT 1",
        args: [user.id],
      });
      if (active.rows[0]) {
        const session = asRow<{ id: string; enemy_total: number }>(active.rows[0]);
        await tx.commit();
        return response({ sessionId: session.id, enemyTotal: Number(session.enemy_total) });
      }

      const result = await tx.execute({
        sql: "SELECT * FROM players WHERE tg_id = ?",
        args: [user.id],
      });
      const player = asRow<PlayerRow | undefined>(result.rows[0]);
      if (!player) fail(404, "player_not_found");
      const free = player.last_play_date !== today;
      if (!free && (player.extra_plays < 1 || player.ad_ready_at > now))
        fail(409, "no_game_available");

      const sessionId = crypto.randomUUID();
      const enemyTotal = secureRandomInt(9, 12);
      await tx.execute({
        sql: "INSERT INTO game_sessions (id, tg_id, enemy_total, created_at, ad_play) VALUES (?, ?, ?, ?, ?)",
        args: [sessionId, user.id, enemyTotal, now, free ? 0 : 1],
      });
      await tx.commit();
      return response({ sessionId, enemyTotal });
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  if (path === "/api/game/finish") {
    const sessionId = input.sessionId;
    const score = input.score;
    const kills = input.kills;
    if (
      typeof sessionId !== "string" ||
      !Number.isSafeInteger(score) ||
      !Number.isSafeInteger(kills) ||
      Number(score) < 0 ||
      Number(score) > 100_000 ||
      Number(kills) < 0
    ) {
      fail(400, "invalid_payload");
    }

    const tx = await db.transaction("write");
    try {
      const sessionResult = await tx.execute({
        sql: "SELECT * FROM game_sessions WHERE id = ? AND tg_id = ?",
        args: [sessionId, user.id],
      });
      const session = asRow<
        | {
            id: string;
            enemy_total: number;
            created_at: number;
            ad_play: number;
            finished_at: number | null;
            reward: number | null;
          }
        | undefined
      >(sessionResult.rows[0]);
      if (!session) fail(409, "session_unavailable");
      if (session.finished_at) {
        if (session.reward === null) fail(409, "session_expired");
        const current = await tx.execute({
          sql: "SELECT * FROM players WHERE tg_id = ?",
          args: [user.id],
        });
        const player = asRow<PlayerRow | undefined>(current.rows[0]);
        if (!player) fail(404, "player_not_found");
        await tx.commit();
        return response({ ...playerView(player), reward: Number(session.reward ?? 0) });
      }

      const now = Date.now();
      const elapsed = now - Number(session.created_at);
      if (elapsed < 0 || elapsed > 30 * 60 * 1000) fail(409, "session_expired");
      if (Number(kills) > Number(session.enemy_total)) fail(400, "invalid_kills");
      if (Number(kills) > 0 && elapsed < Math.max(1500, Number(kills) * 600))
        fail(400, "game_too_fast");
      const maximumPlausibleScore = Number(kills) * 10 + Math.ceil(elapsed / 1000) * 8 + 10;
      if (Number(score) > maximumPlausibleScore) fail(400, "invalid_score");

      const playerResult = await tx.execute({
        sql: "SELECT * FROM players WHERE tg_id = ?",
        args: [user.id],
      });
      const player = asRow<PlayerRow | undefined>(playerResult.rows[0]);
      if (!player) fail(404, "player_not_found");
      const today = dateUTC(now);
      const isFree = Number(session.ad_play) === 0;
      if (isFree && player.last_play_date === today) fail(409, "no_game_available");
      if (!isFree && (player.extra_plays < 1 || player.ad_ready_at > now))
        fail(409, "play_unavailable");

      const reward = Number(kills) * 10;
      const currentSeason = seasonId(now);
      const dailyGames = player.daily_games_date === today ? Number(player.daily_games) + 1 : 1;
      await tx.execute({
        sql: `UPDATE players SET
          coins = coins + ?,
          season_coins = CASE WHEN season_id = ? THEN season_coins + ? ELSE ? END,
          season_id = ?,
          games_played = games_played + 1,
          best_score = MAX(best_score, ?),
          last_play_date = CASE WHEN ? = 1 THEN ? ELSE last_play_date END,
          extra_plays = CASE WHEN ? = 1 THEN extra_plays - 1 ELSE extra_plays END,
          ad_ready_at = CASE WHEN ? = 1 THEN ? ELSE 0 END,
          daily_games = ?,
          daily_games_date = ?
          WHERE tg_id = ?`,
        args: [
          reward,
          currentSeason,
          reward,
          reward,
          currentSeason,
          Number(score),
          isFree ? 1 : 0,
          today,
          isFree ? 0 : 1,
          isFree ? 0 : 1,
          now + 3 * 60 * 1000,
          dailyGames,
          today,
          user.id,
        ],
      });

      if (player.referred_by && !player.referral_paid && Number(player.games_played) + 1 >= 10) {
        const referralPaid = await tx.execute({
          sql: "UPDATE players SET referral_paid = 1 WHERE tg_id = ? AND referral_paid = 0",
          args: [user.id],
        });
        if (referralPaid.rowsAffected === 1) {
          await tx.execute({
            sql: `UPDATE players SET coins = coins + 100,
              season_coins = CASE WHEN season_id = ? THEN season_coins + 100 ELSE 100 END,
              season_id = ?, referral_count = referral_count + 1 WHERE tg_id = ?`,
            args: [currentSeason, currentSeason, player.referred_by],
          });
        }
      }

      await tx.execute({
        sql: "UPDATE game_sessions SET finished_at = ?, reward = ?, score = ?, kills = ? WHERE id = ? AND finished_at IS NULL",
        args: [now, reward, Number(score), Number(kills), sessionId],
      });
      const updated = await tx.execute({
        sql: "SELECT * FROM players WHERE tg_id = ?",
        args: [user.id],
      });
      const freshPlayer = asRow<PlayerRow | undefined>(updated.rows[0]);
      if (!freshPlayer) fail(404, "player_not_found");
      await tx.commit();
      return response({ ...playerView(freshPlayer, now), reward });
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  if (path === "/api/ad/unlock") {
    await ensurePlayer(db, user, input.startParam);
    const now = Date.now();
    const tx = await db.transaction("write");
    try {
      const result = await tx.execute({
        sql: "SELECT * FROM players WHERE tg_id = ?",
        args: [user.id],
      });
      const player = asRow<PlayerRow | undefined>(result.rows[0]);
      if (!player) fail(404, "player_not_found");
      if (player.ad_ready_at > now) fail(429, "ad_cooldown");
      await tx.execute({
        sql: "UPDATE players SET extra_plays = MIN(?, extra_plays + 1) WHERE tg_id = ?",
        args: [MAX_PENDING_AD_PLAYS, user.id],
      });
      const updated = await tx.execute({
        sql: "SELECT * FROM players WHERE tg_id = ?",
        args: [user.id],
      });
      const freshPlayer = asRow<PlayerRow | undefined>(updated.rows[0]);
      if (!freshPlayer) fail(404, "player_not_found");
      await tx.commit();
      return response(playerView(freshPlayer, now));
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  if (path === "/api/daily-bonus/claim") {
    await ensurePlayer(db, user, input.startParam);
    const now = Date.now();
    const today = dateUTC(now);
    const tx = await db.transaction("write");
    try {
      const result = await tx.execute({
        sql: "SELECT * FROM players WHERE tg_id = ?",
        args: [user.id],
      });
      const player = asRow<PlayerRow | undefined>(result.rows[0]);
      if (!player) fail(404, "player_not_found");
      if (player.daily_games_date !== today || Number(player.daily_games) < 100)
        fail(409, "bonus_not_ready");
      if (player.bonus_claimed_date === today) fail(409, "bonus_already_claimed");

      const bonus = secureRandomInt(10, 50) * 100;
      await tx.execute({
        sql: "UPDATE players SET coins = coins + ?, bonus_claimed_date = ? WHERE tg_id = ?",
        args: [bonus, today, user.id],
      });
      const updated = await tx.execute({
        sql: "SELECT * FROM players WHERE tg_id = ?",
        args: [user.id],
      });
      const freshPlayer = asRow<PlayerRow | undefined>(updated.rows[0]);
      if (!freshPlayer) fail(404, "player_not_found");
      await tx.commit();
      return response({ ...playerView(freshPlayer, now), bonus });
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  if (path === "/api/leaderboard") {
    const currentSeason = seasonId();
    const rows = await db.execute({
      sql: `SELECT tg_id, first_name, username, season_coins FROM players
        WHERE season_id = ? AND season_coins >= 500
        ORDER BY season_coins DESC, created_at ASC LIMIT 50`,
      args: [currentSeason],
    });
    const step = (30 * 0.5 - 10) / ((30 * 29) / 2);
    const list = rows.rows.map((row, index) => {
      const player = asRow<{
        tg_id: number;
        first_name: string;
        username: string | null;
        season_coins: number;
      }>(row);
      const rank = index + 1;
      return {
        rank,
        tgId: Number(player.tg_id),
        name: player.first_name,
        username: player.username,
        coins: Number(player.season_coins),
        prize: rank <= 30 ? 0.5 - (rank - 1) * step : 0,
        isMe: Number(player.tg_id) === user.id,
      };
    });
    return response({ list, seasonEndsAt: (currentSeason + 1) * SEASON_MS });
  }

  if (path === "/api/withdrawals/request") {
    await ensurePlayer(db, user, input.startParam);
    const rawUsd = input.usd;
    const wallet = typeof input.wallet === "string" ? input.wallet.trim() : "";
    if (typeof rawUsd !== "number" || !Number.isFinite(rawUsd)) fail(400, "invalid_withdrawal");
    if (wallet.length < 20 || wallet.length > 120) fail(400, "invalid_wallet");
    const usdCents = Math.floor(rawUsd * 100 + Number.EPSILON);
    if (usdCents < MIN_WITHDRAW_CENTS) fail(400, "minimum_withdrawal");
    const usd = usdCents / 100;
    const coins = Math.round(usd * COINS_PER_USD);
    const now = Date.now();
    const withdrawalId = crypto.randomUUID();
    const tx = await db.transaction("write");
    try {
      const deducted = await tx.execute({
        sql: "UPDATE players SET coins = coins - ? WHERE tg_id = ? AND coins >= ?",
        args: [coins, user.id, coins],
      });
      if (deducted.rowsAffected !== 1) fail(409, "insufficient_coins");
      await tx.execute({
        sql: "INSERT INTO withdrawals (id, tg_id, coins, usd, wallet, status) VALUES (?, ?, ?, ?, ?, 'pending')",
        args: [withdrawalId, user.id, coins, usd, wallet],
      });
      await tx.execute({
        sql: `INSERT INTO payout_jobs (id, withdrawal_id, status, attempts, next_attempt_at, created_at, updated_at)
          VALUES (?, ?, 'queued', 0, ?, ?, ?)`,
        args: [withdrawalId, withdrawalId, now, now, now],
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }

    try {
      if (!env.PAYOUT_QUEUE) throw new Error("queue_unavailable");
      await env.PAYOUT_QUEUE.send({ jobId: withdrawalId });
    } catch {
      await db.execute({
        sql: "UPDATE payout_jobs SET status = 'retry', next_attempt_at = ?, last_error = 'queue_send_failed', updated_at = ? WHERE id = ?",
        args: [now + 5 * 60 * 1000, Date.now(), withdrawalId],
      });
    }
    return response({ ok: true });
  }

  if (path === "/api/withdrawals/list") {
    const rows = await db.execute({
      sql: "SELECT id, coins, usd, wallet, status, created_at FROM withdrawals WHERE tg_id = ? ORDER BY created_at DESC LIMIT 50",
      args: [user.id],
    });
    return response(rows.rows);
  }

  fail(404, "not_found");
}

async function processPayoutJob(env: Env, jobId: string): Promise<void> {
  const db = database(env);
  const job = await db.execute({
    sql: "SELECT status FROM payout_jobs WHERE id = ?",
    args: [jobId],
  });
  if (job.rows[0]?.status !== "queued" && job.rows[0]?.status !== "retry") return;

  await db.execute({
    sql: `UPDATE payout_jobs SET status = 'awaiting_provider',
      last_error = 'payout_provider_not_configured', updated_at = ? WHERE id = ? AND status IN ('queued', 'retry')`,
    args: [Date.now(), jobId],
  });
}

type QueueMessage = {
  body: { jobId?: unknown };
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      return apiError(error);
    }
  },

  async queue(batch: { messages: QueueMessage[] }, env: Env): Promise<void> {
    for (const message of batch.messages) {
      if (typeof message.body?.jobId !== "string") {
        message.ack();
        continue;
      }
      try {
        await processPayoutJob(env, message.body.jobId);
        message.ack();
      } catch {
        message.retry({ delaySeconds: 300 });
      }
    }
  },

  async scheduled(_event: unknown, env: Env): Promise<void> {
    const db = database(env);
    const now = Date.now();
    const jobs = await db.execute({
      sql: "SELECT id FROM payout_jobs WHERE status IN ('queued', 'retry') AND next_attempt_at <= ? LIMIT 100",
      args: [now],
    });
    for (const job of jobs.rows as unknown as Array<{ id: string }>) {
      try {
        if (!env.PAYOUT_QUEUE) continue;
        await env.PAYOUT_QUEUE.send({ jobId: job.id });
        await db.execute({
          sql: "UPDATE payout_jobs SET next_attempt_at = ?, updated_at = ? WHERE id = ? AND status IN ('queued', 'retry')",
          args: [now + 5 * 60 * 1000, now, job.id],
        });
      } catch {
        await db.execute({
          sql: "UPDATE payout_jobs SET status = 'retry', next_attempt_at = ?, last_error = 'queue_send_failed', updated_at = ? WHERE id = ?",
          args: [now + 5 * 60 * 1000, now, job.id],
        });
      }
    }
  },
};
