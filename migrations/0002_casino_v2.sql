CREATE TABLE IF NOT EXISTS casino_roulette_rooms (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  bet INTEGER NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 3,
  current_players INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_casino_roulette_rooms_status
ON casino_roulette_rooms(status, current_players, created_at DESC);
