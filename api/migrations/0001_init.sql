PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  tg_id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  username TEXT,
  photo_url TEXT,
  coins INTEGER NOT NULL DEFAULT 0,
  season_coins INTEGER NOT NULL DEFAULT 0,
  season_id INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  last_play_date TEXT,
  extra_plays INTEGER NOT NULL DEFAULT 0,
  ad_ready_at INTEGER NOT NULL DEFAULT 0,
  referral_count INTEGER NOT NULL DEFAULT 0,
  referred_by INTEGER,
  referral_paid INTEGER NOT NULL DEFAULT 0,
  daily_games INTEGER NOT NULL DEFAULT 0,
  daily_games_date TEXT,
  bonus_claimed_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS players_leaderboard
  ON players(season_id, season_coins DESC, created_at ASC);

CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  tg_id INTEGER NOT NULL REFERENCES players(tg_id),
  enemy_total INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  ad_play INTEGER NOT NULL DEFAULT 0,
  finished_at INTEGER,
  reward INTEGER,
  score INTEGER,
  kills INTEGER
);

CREATE INDEX IF NOT EXISTS game_sessions_player
  ON game_sessions(tg_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS game_sessions_one_active
  ON game_sessions(tg_id) WHERE finished_at IS NULL;

CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  tg_id INTEGER NOT NULL REFERENCES players(tg_id),
  coins INTEGER NOT NULL,
  usd REAL NOT NULL,
  wallet TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS withdrawals_player
  ON withdrawals(tg_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payout_jobs (
  id TEXT PRIMARY KEY,
  withdrawal_id TEXT NOT NULL UNIQUE REFERENCES withdrawals(id),
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS payout_jobs_ready
  ON payout_jobs(status, next_attempt_at);
