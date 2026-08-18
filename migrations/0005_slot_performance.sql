CREATE TABLE IF NOT EXISTS slot_performance (
  slot_id TEXT PRIMARY KEY,
  spins INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  wagered INTEGER NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 0,
  biggest_win INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS slot_round_audit (
  round_id TEXT PRIMARY KEY,
  slot_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  bet INTEGER NOT NULL,
  payout INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_slot_round_audit_slot_created
ON slot_round_audit(slot_id, created_at DESC);
