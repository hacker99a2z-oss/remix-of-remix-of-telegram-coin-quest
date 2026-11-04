import type { auth } from "./tg";

type Auth = ReturnType<typeof auth>;
type RequestAuth = Auth & Record<string, unknown>;

export type Player = {
  tgId: number;
  name: string;
  username: string | null;
  coins: number;
  seasonCoins: number;
  canPlayFree: boolean;
  extraPlays: number;
  gamesPlayed: number;
  bestScore: number;
  referralCount: number;
  photoUrl: string | null;
  adReadyAt: number;
  dailyGames: number;
  bonusClaimedToday: boolean;
};

export type LeaderboardRow = {
  rank: number;
  tgId: number;
  name: string;
  username: string | null;
  coins: number;
  prize: number;
  isMe: boolean;
};

export type Withdrawal = {
  id: string;
  coins: number;
  usd: number;
  wallet: string;
  status: string;
  created_at: string;
};

const baseUrl =
  (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.replace(/\/$/, "") ?? "";

async function post<T>(path: string, data: RequestAuth): Promise<T> {
  const response = await fetch(`${baseUrl}/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  const result = isJson ? await response.json().catch(() => null) : null;
  if (response.ok && (result === null || typeof result !== "object")) {
    throw new Error("Game server is not reachable right now. Please try again later.");
  }
  if (!response.ok) {
    const detail = result?.error;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message ||
          detail?.code ||
          result?.message ||
          `Request failed (${response.status})`;
    throw new Error(message);
  }
  return result as T;
}

export const getMe = (data: RequestAuth & { startParam: string }) => post<Player>("me", data);
export const startGame = (data: Auth) =>
  post<{ sessionId: string; enemyTotal: number }>("game/start", data);
export const finishGame = (data: Auth & { sessionId: string; score: number; kills: number }) =>
  post<Player & { reward: number }>("game/finish", data);
export const grantAdPlay = (data: Auth) => post<Player>("ad/unlock", data);
export const claimDailyBonus = (data: Auth) =>
  post<Player & { bonus: number }>("daily-bonus/claim", data);
export const getLeaderboard = (data: Auth) =>
  post<{ list: LeaderboardRow[]; seasonEndsAt: number }>("leaderboard", data);
export const requestWithdraw = (data: Auth & { usd: number; wallet: string }) =>
  post<{ ok: true }>("withdrawals/request", data);
export const getWithdrawals = (data: Auth) => post<Withdrawal[]>("withdrawals/list", data);
