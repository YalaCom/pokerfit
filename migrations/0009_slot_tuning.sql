CREATE TABLE IF NOT EXISTS casino_slot_tuning (
  telegram_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  percent INTEGER NOT NULL DEFAULT 0 CHECK(percent BETWEEN -50 AND 100),
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (telegram_id, game_id)
);

CREATE TABLE IF NOT EXISTS casino_tuning_requests (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  applied_percent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by TEXT
);

CREATE TABLE IF NOT EXISTS casino_slot_tuning_applied (
  round_id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  percent INTEGER NOT NULL,
  base_payout INTEGER NOT NULL,
  adjusted_payout INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tuning_requests_status
  ON casino_tuning_requests(status, created_at);
