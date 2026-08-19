CREATE TABLE IF NOT EXISTS casino_request_cache (
  request_key TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_casino_request_cache_user
ON casino_request_cache(telegram_id, created_at DESC);

CREATE TABLE IF NOT EXISTS casino_daily (
  telegram_id TEXT PRIMARY KEY,
  streak INTEGER NOT NULL DEFAULT 0,
  last_claim_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO casino_meta(key,value) VALUES('grand_jackpot','50000000');
