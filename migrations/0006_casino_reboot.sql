CREATE TABLE IF NOT EXISTS casino_users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT NOT NULL DEFAULT 'Игрок',
  last_name TEXT,
  balance INTEGER NOT NULL DEFAULT 10000000,
  role TEXT NOT NULL DEFAULT 'PLAYER',
  is_banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS casino_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS casino_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  round_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_casino_ledger_user ON casino_ledger(telegram_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_casino_ledger_round ON casino_ledger(round_id);

CREATE TABLE IF NOT EXISTS casino_rounds (
  round_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  bet INTEGER NOT NULL,
  payout INTEGER NOT NULL,
  multiplier REAL NOT NULL DEFAULT 0,
  result_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_casino_rounds_user ON casino_rounds(telegram_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_casino_rounds_game ON casino_rounds(game_id,created_at DESC);

CREATE TABLE IF NOT EXISTS casino_game_totals (
  game_id TEXT PRIMARY KEY,
  rounds INTEGER NOT NULL DEFAULT 0,
  wagered INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
