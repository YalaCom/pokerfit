CREATE TABLE IF NOT EXISTS casino_web_accounts (
  player_id TEXT PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_casino_web_accounts_login
ON casino_web_accounts(login);

CREATE TABLE IF NOT EXISTS casino_web_sessions (
  token_hash TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_casino_web_sessions_player
ON casino_web_sessions(player_id, expires_at);

CREATE TABLE IF NOT EXISTS casino_telegram_login_requests (
  token_hash TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'PENDING',
  telegram_id TEXT,
  confirm_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_casino_tg_login_status
ON casino_telegram_login_requests(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_casino_tg_login_confirm
ON casino_telegram_login_requests(confirm_hash);
