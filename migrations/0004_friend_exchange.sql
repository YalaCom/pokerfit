CREATE TABLE IF NOT EXISTS friend_exchange_requests (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('topup','withdraw')),
  chip_amount INTEGER NOT NULL,
  display_rubles INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_friend_exchange_user ON friend_exchange_requests(telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_friend_exchange_status ON friend_exchange_requests(status, created_at DESC);
