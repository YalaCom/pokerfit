CREATE TABLE IF NOT EXISTS casino_roulette_sessions (
  room_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'joined',
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(room_id, telegram_id),
  FOREIGN KEY(room_id) REFERENCES casino_roulette_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_roulette_sessions_user
ON casino_roulette_sessions(telegram_id, status, updated_at DESC);
