CREATE TABLE IF NOT EXISTS virtual_chip_requests (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_virtual_chip_requests_user ON virtual_chip_requests(telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_virtual_chip_requests_status ON virtual_chip_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS jackpot_pools (
  id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL,
  base_balance INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO jackpot_pools(id,balance,base_balance) VALUES('grand',50000000,50000000);

CREATE TABLE IF NOT EXISTS jackpot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_key TEXT NOT NULL UNIQUE,
  telegram_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jackpot_events_created ON jackpot_events(created_at DESC);
