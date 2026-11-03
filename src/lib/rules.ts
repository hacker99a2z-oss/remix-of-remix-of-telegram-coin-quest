// Business rules shared by client and server.
export const COINS_PER_USD = 100_000;
export const GAME_REWARD = 100;
export const REFERRAL_REWARD = 100;
export const REFERRAL_GAMES_NEEDED = 10;
export const GAME_SECONDS = 90;
// Next ad unlocks 90s after the game ends, plus whatever game time was left unplayed if the player died.
export function adCooldownMs(survivedSec: number): number {
  const s = Math.max(0, Math.min(GAME_SECONDS, survivedSec));
  return (GAME_SECONDS + (GAME_SECONDS - s)) * 1000;
}
export const LEADERBOARD_MIN_COINS = 500;
export const LEADERBOARD_SHOWN = 50;
export const PRIZE_WINNERS = 30;
export const PRIZE_POOL_USD = 10;
export const SEASON_MS = 2 * 24 * 60 * 60 * 1000;
export const MIN_WITHDRAW_USD = 1;
export const MAX_PENDING_AD_PLAYS = 3;

// Linear prize curve: rank 1 gets $0.50, each rank drops by the same small step,
// so neighbouring winners differ by ~1 cent and the 30 prizes sum to $10.
const TOP_PRIZE = 0.5;
const STEP = (PRIZE_WINNERS * TOP_PRIZE - PRIZE_POOL_USD) / ((PRIZE_WINNERS * (PRIZE_WINNERS - 1)) / 2);

export function prizeForRank(rank: number): number {
  if (rank < 1 || rank > PRIZE_WINNERS) return 0;
  return TOP_PRIZE - (rank - 1) * STEP;
}

export function coinsToUsd(coins: number): number {
  return coins / COINS_PER_USD;
}

export function seasonEndsAt(now = Date.now()): number {
  return (Math.floor(now / SEASON_MS) + 1) * SEASON_MS;
}
