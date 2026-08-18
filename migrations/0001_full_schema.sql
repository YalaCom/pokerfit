PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  language_code TEXT,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  rating INTEGER NOT NULL DEFAULT 1000,
  profile_frame TEXT,
  is_banned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallets (
  telegram_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 1000000 CHECK(balance >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_created
ON wallet_transactions(telegram_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_stats (
  telegram_id TEXT PRIMARY KEY,
  hands_played INTEGER NOT NULL DEFAULT 0,
  hands_won INTEGER NOT NULL DEFAULT 0,
  biggest_pot INTEGER NOT NULL DEFAULT 0,
  total_won INTEGER NOT NULL DEFAULT 0,
  total_lost INTEGER NOT NULL DEFAULT 0,
  all_ins INTEGER NOT NULL DEFAULT 0,
  all_ins_won INTEGER NOT NULL DEFAULT 0,
  tournaments_played INTEGER NOT NULL DEFAULT 0,
  final_tables INTEGER NOT NULL DEFAULT 0,
  tournaments_won INTEGER NOT NULL DEFAULT 0,
  blackjack_games INTEGER NOT NULL DEFAULT 0,
  blackjack_wins INTEGER NOT NULL DEFAULT 0,
  blackjack_losses INTEGER NOT NULL DEFAULT 0,
  blackjack_pushes INTEGER NOT NULL DEFAULT 0,
  blackjack_biggest_win INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  room_code TEXT UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'cash',
  visibility TEXT NOT NULL DEFAULT 'public',
  password_hash TEXT,
  sb INTEGER NOT NULL,
  bb INTEGER NOT NULL,
  min_buyin INTEGER NOT NULL,
  max_buyin INTEGER NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 9,
  turn_seconds INTEGER NOT NULL DEFAULT 20,
  current_players INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  tournament_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tables_open
ON tables(kind, visibility, status, current_players);

CREATE TABLE IF NOT EXISTS table_sessions (
  telegram_id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  seat_no INTEGER,
  buyin INTEGER NOT NULL DEFAULT 0,
  stack INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'seated',
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_table_sessions_table
ON table_sessions(table_id, status);

CREATE TABLE IF NOT EXISTS hands (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL,
  hand_no INTEGER NOT NULL,
  dealer_seat INTEGER,
  sb INTEGER,
  bb INTEGER,
  board TEXT,
  pot INTEGER NOT NULL DEFAULT 0,
  winners TEXT,
  status TEXT NOT NULL DEFAULT 'complete',
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hands_table
ON hands(table_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS hand_players (
  hand_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  seat_no INTEGER NOT NULL,
  hole_cards TEXT,
  contribution INTEGER NOT NULL DEFAULT 0,
  result INTEGER NOT NULL DEFAULT 0,
  combination TEXT,
  folded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hand_id, telegram_id),
  FOREIGN KEY (hand_id) REFERENCES hands(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hand_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hand_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  street TEXT NOT NULL,
  action TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  pot_after INTEGER NOT NULL DEFAULT 0,
  action_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hand_id) REFERENCES hands(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hand_actions_hand
ON hand_actions(hand_id, id);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  tournament_type TEXT NOT NULL DEFAULT 'freezeout',
  buy_in INTEGER NOT NULL,
  start_stack INTEGER NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 9,
  registered_players INTEGER NOT NULL DEFAULT 0,
  prize_pool INTEGER NOT NULL DEFAULT 0,
  starts_at TEXT NOT NULL,
  late_reg_until TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  blind_structure TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tournaments_start
ON tournaments(status, starts_at);

CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  stack INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'registered',
  table_id TEXT,
  seat_no INTEGER,
  placement INTEGER,
  prize INTEGER NOT NULL DEFAULT 0,
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  eliminated_at TEXT,
  PRIMARY KEY (tournament_id, telegram_id),
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS friendships (
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, friend_id),
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  reward INTEGER NOT NULL DEFAULT 0,
  metric TEXT NOT NULL,
  threshold INTEGER NOT NULL DEFAULT 1,
  rare INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_achievements (
  telegram_id TEXT NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TEXT,
  PRIMARY KEY (telegram_id, achievement_id),
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE,
  FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_rewards (
  telegram_id TEXT PRIMARY KEY,
  streak_day INTEGER NOT NULL DEFAULT 0,
  last_claim_day TEXT,
  last_free_claim_day TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rescue_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  claim_token TEXT NOT NULL UNIQUE,
  reward_amount INTEGER NOT NULL DEFAULT 50000,
  started_at TEXT NOT NULL,
  eligible_at TEXT NOT NULL,
  claimed_at TEXT,
  status TEXT NOT NULL DEFAULT 'watching',
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
ON notifications(telegram_id, created_at DESC);

CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS season_scores (
  season_id TEXT NOT NULL,
  telegram_id TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (season_id, telegram_id),
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE,
  FOREIGN KEY (telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_telegram_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO achievements
(id, name, description, reward, metric, threshold, rare) VALUES
('first_win','Первая кровь','Выиграть первую раздачу',25000,'hands_won',1,0),
('hundred_hands','Сотня','Сыграть 100 раздач',100000,'hands_played',100,0),
('millionaire','Миллионер','Иметь 10 000 000 фишек',250000,'balance',10000000,0),
('allin_king','Король ALL-IN','Выиграть 50 All-In',250000,'all_ins_won',50,0),
('daily_champion','Чемпион','Выиграть Daily Million',500000,'tournaments_won',1,1),
('blackjack_100','Крупье нервничает','Выиграть 100 игр в Blackjack',200000,'blackjack_wins',100,0);
