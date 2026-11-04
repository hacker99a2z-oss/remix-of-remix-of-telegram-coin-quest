import { createClient } from "@libsql/client";

type SupabasePlayer = {
  tg_id: number | string;
  first_name: string;
  username: string | null;
  photo_url: string | null;
  coins?: number | string;
  season_coins?: number | string;
  season_id?: number | string;
  games_played?: number | string;
  best_score?: number | string;
  last_play_date?: string | null;
  extra_plays?: number | string;
  ad_ready_at?: string | number | null;
  referral_count?: number | string;
  referred_by?: number | string | null;
  referral_paid?: boolean | number;
  daily_games?: number | string;
  daily_games_date?: string | null;
  bonus_claimed_date?: string | null;
  created_at?: string;
};

type SupabaseWithdrawal = {
  id: string;
  tg_id: number | string;
  coins: number | string;
  usd: number | string;
  wallet: string;
  status: string;
  created_at?: string;
};

const databaseUrl = process.env["TURSO_DATABASE_URL"];
const databaseToken = process.env["TURSO_AUTH_TOKEN"];
const supabaseUrl = (process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"])?.replace(
  /\/$/,
  "",
);
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!databaseUrl || !databaseToken || !supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, SUPABASE_URL (or VITE_SUPABASE_URL), and SUPABASE_SERVICE_ROLE_KEY are required",
  );
}

const turso = createClient({ url: databaseUrl, authToken: databaseToken, intMode: "number" });

async function readTable<T>(table: string, orderBy: string): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
    url.searchParams.set("select", "*");
    url.searchParams.set("order", `${orderBy}.asc`);
    const result = await fetch(url, {
      headers: {
        apikey: serviceRoleKey!,
        authorization: `Bearer ${serviceRoleKey}`,
        "range-unit": "items",
        range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!result.ok) throw new Error(`Supabase export failed for ${table} (${result.status})`);
    const page = (await result.json()) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function dateValue(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

function timestampValue(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function importPlayers(rows: SupabasePlayer[]): Promise<void> {
  const chunkSize = 100;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const tx = await turso.transaction("write");
    try {
      for (const player of rows.slice(offset, offset + chunkSize)) {
        await tx.execute({
          sql: `INSERT OR IGNORE INTO players (
            tg_id, first_name, username, photo_url, coins, season_coins, season_id,
            games_played, best_score, last_play_date, extra_plays, ad_ready_at,
            referral_count, referred_by, referral_paid, daily_games, daily_games_date,
            bonus_claimed_date, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            Number(player.tg_id),
            player.first_name,
            player.username ?? null,
            player.photo_url ?? null,
            Number(player.coins ?? 0),
            Number(player.season_coins ?? 0),
            Number(player.season_id ?? 0),
            Number(player.games_played ?? 0),
            Number(player.best_score ?? 0),
            dateValue(player.last_play_date),
            Number(player.extra_plays ?? 0),
            timestampValue(player.ad_ready_at),
            Number(player.referral_count ?? 0),
            player.referred_by == null ? null : Number(player.referred_by),
            player.referral_paid ? 1 : 0,
            Number(player.daily_games ?? 0),
            dateValue(player.daily_games_date),
            dateValue(player.bonus_claimed_date),
            player.created_at ?? new Date(0).toISOString(),
          ],
        });
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}

async function importWithdrawals(rows: SupabaseWithdrawal[]): Promise<void> {
  const chunkSize = 100;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const tx = await turso.transaction("write");
    try {
      for (const withdrawal of rows.slice(offset, offset + chunkSize)) {
        await tx.execute({
          sql: `INSERT OR IGNORE INTO withdrawals (id, tg_id, coins, usd, wallet, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            withdrawal.id,
            Number(withdrawal.tg_id),
            Number(withdrawal.coins),
            Number(withdrawal.usd),
            withdrawal.wallet,
            withdrawal.status,
            withdrawal.created_at ?? new Date(0).toISOString(),
          ],
        });
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}

try {
  const players = await readTable<SupabasePlayer>("players", "tg_id");
  await importPlayers(players);
  const withdrawals = await readTable<SupabaseWithdrawal>("withdrawals", "id");
  await importWithdrawals(withdrawals);
  const targetPlayers = await turso.execute("SELECT COUNT(*) AS count FROM players");
  const targetWithdrawals = await turso.execute("SELECT COUNT(*) AS count FROM withdrawals");
  const playerCount = Number(targetPlayers.rows[0]?.count ?? 0);
  const withdrawalCount = Number(targetWithdrawals.rows[0]?.count ?? 0);
  if (playerCount < players.length || withdrawalCount < withdrawals.length) {
    throw new Error("Turso import count check failed; keep the old database active");
  }
  console.info(
    `Verified ${players.length} source players and ${withdrawals.length} source withdrawals`,
  );
} finally {
  turso.close();
}
