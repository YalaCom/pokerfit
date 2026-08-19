CREATE TABLE IF NOT EXISTS casino_bet_markets (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  outcomes_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  winning_outcome TEXT,
  approved_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT,
  settled_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_casino_bet_markets_status
ON casino_bet_markets(status, created_at DESC);

CREATE TABLE IF NOT EXISTS casino_market_bets (
  id TEXT PRIMARY KEY,
  market_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  payout INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at TEXT,
  UNIQUE(market_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_casino_market_bets_market
ON casino_market_bets(market_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_casino_market_bets_user
ON casino_market_bets(telegram_id, created_at DESC);

CREATE TABLE IF NOT EXISTS casino_market_state (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  price REAL NOT NULL DEFAULT 1000,
  last_round_rowid INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO casino_market_state(id, price, last_round_rowid)
SELECT 1, 1000, COALESCE(MAX(rowid), 0) FROM casino_rounds;

CREATE TABLE IF NOT EXISTS casino_market_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price REAL NOT NULL,
  house_net INTEGER NOT NULL DEFAULT 0,
  wagered INTEGER NOT NULL DEFAULT 0,
  created_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO casino_market_points(price, house_net, wagered, created_ms)
SELECT 1000, 0, 0, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM casino_market_points);

CREATE TABLE IF NOT EXISTS casino_trading_positions (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  duration_hours INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  entry_price REAL NOT NULL,
  exit_price REAL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  payout INTEGER NOT NULL DEFAULT 0,
  close_ms INTEGER NOT NULL,
  created_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_casino_trading_positions_user
ON casino_trading_positions(telegram_id, status, close_ms);

CREATE INDEX IF NOT EXISTS idx_casino_trading_positions_close
ON casino_trading_positions(status, close_ms);

CREATE TABLE IF NOT EXISTS casino_loans (
  id TEXT PRIMARY KEY,
  borrower_id TEXT NOT NULL,
  lender_id TEXT NOT NULL,
  principal INTEGER NOT NULL,
  interest_bps INTEGER NOT NULL DEFAULT 1500,
  repayment_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'REQUESTED',
  due_ms INTEGER,
  created_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  repaid_at TEXT,
  defaulted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_casino_loans_borrower
ON casino_loans(borrower_id, status, due_ms);

CREATE INDEX IF NOT EXISTS idx_casino_loans_lender
ON casino_loans(lender_id, status, due_ms);

CREATE TABLE IF NOT EXISTS casino_admin_help_requests (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_ms INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  admin_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_casino_admin_help_status
ON casino_admin_help_requests(status, created_ms DESC);
