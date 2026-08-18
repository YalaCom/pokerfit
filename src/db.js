let compatibilityPromise = null;

export async function ensureCompatibility(env) {
  if (compatibilityPromise) return compatibilityPromise;
  compatibilityPromise = (async () => {
    const required = {
      users: {
        is_banned: "INTEGER NOT NULL DEFAULT 0",
        photo_url: "TEXT",
        rating: "INTEGER NOT NULL DEFAULT 1000",
        profile_frame: "TEXT",
        level: "INTEGER NOT NULL DEFAULT 1",
        xp: "INTEGER NOT NULL DEFAULT 0"
      },
      user_stats: {
        total_won: "INTEGER NOT NULL DEFAULT 0",
        total_lost: "INTEGER NOT NULL DEFAULT 0",
        all_ins: "INTEGER NOT NULL DEFAULT 0",
        all_ins_won: "INTEGER NOT NULL DEFAULT 0",
        final_tables: "INTEGER NOT NULL DEFAULT 0",
        blackjack_games: "INTEGER NOT NULL DEFAULT 0",
        blackjack_wins: "INTEGER NOT NULL DEFAULT 0",
        blackjack_losses: "INTEGER NOT NULL DEFAULT 0",
        blackjack_pushes: "INTEGER NOT NULL DEFAULT 0",
        blackjack_biggest_win: "INTEGER NOT NULL DEFAULT 0"
      }
    };

    for (const [table, columns] of Object.entries(required)) {
      const info = (await env.DB.prepare(`PRAGMA table_info(${table})`).all()).results || [];
      const existing = new Set(info.map(x => x.name));
      for (const [name, definition] of Object.entries(columns)) {
        if (!existing.has(name)) {
          try {
            await env.DB.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
          } catch (error) {
            if (!String(error?.message || "").toLowerCase().includes("duplicate column")) throw error;
          }
        }
      }
    }
  })().catch(error => {
    compatibilityPromise = null;
    throw error;
  });
  return compatibilityPromise;
}

export async function ensurePlayer(env, tgUser) {
  await ensureCompatibility(env);
  const id = String(tgUser.id);
  const username = tgUser.username || null;
  const firstName = tgUser.first_name || "Игрок";
  const lastName = tgUser.last_name || null;
  const photoUrl = tgUser.photo_url || null;
  const startKey = `start_bonus:${id}`;

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username=excluded.username,
        first_name=excluded.first_name,
        last_name=excluded.last_name,
        photo_url=COALESCE(excluded.photo_url, users.photo_url),
        updated_at=CURRENT_TIMESTAMP
    `).bind(id, username, firstName, lastName, photoUrl),
    env.DB.prepare(`
      INSERT OR IGNORE INTO wallets (telegram_id, balance)
      VALUES (?1, 1000000)
    `).bind(id),
    env.DB.prepare(`
      INSERT OR IGNORE INTO user_stats (telegram_id)
      VALUES (?1)
    `).bind(id),
    env.DB.prepare(`
      INSERT OR IGNORE INTO daily_rewards (telegram_id)
      VALUES (?1)
    `).bind(id),
    env.DB.prepare(`
      INSERT OR IGNORE INTO wallet_transactions
      (telegram_id,type,amount,balance_before,balance_after,idempotency_key,metadata)
      VALUES (?1,'START_BONUS',1000000,0,1000000,?2,'{"source":"registration"}')
    `).bind(id, startKey),
  ]);

  const p = await getPlayer(env, id);
  if (!p) throw new Error("PLAYER_NOT_FOUND");
  if (Number(p.is_banned)) throw new Error("PLAYER_BANNED");
  return p;
}

export async function getPlayer(env, id) {
  return env.DB.prepare(`
    SELECT
      u.telegram_id,u.username,u.first_name,u.last_name,u.photo_url,
      u.level,u.xp,u.rating,u.profile_frame,u.is_banned,u.created_at,
      w.balance,
      s.hands_played,s.hands_won,s.biggest_pot,s.total_won,s.total_lost,
      s.all_ins,s.all_ins_won,s.tournaments_played,s.final_tables,s.tournaments_won,
      s.blackjack_games,s.blackjack_wins,s.blackjack_losses,s.blackjack_pushes,
      s.blackjack_biggest_win
    FROM users u
    JOIN wallets w ON w.telegram_id=u.telegram_id
    JOIN user_stats s ON s.telegram_id=u.telegram_id
    WHERE u.telegram_id=?1 LIMIT 1
  `).bind(String(id)).first();
}

export async function getBalance(env, id) {
  const row = await env.DB.prepare(
    `SELECT balance FROM wallets WHERE telegram_id=?1 LIMIT 1`
  ).bind(String(id)).first();
  if (!row) throw new Error("WALLET_NOT_FOUND");
  return Number(row.balance);
}

export async function debit(env, id, amount, type, key, metadata = {}) {
  id = String(id);
  amount = Math.floor(Number(amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_AMOUNT");

  const old = await env.DB.prepare(
    `SELECT balance_after FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`
  ).bind(key).first();
  if (old) return { applied: false, balance: await getBalance(env, id) };

  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE wallets SET balance=balance-?2,updated_at=CURRENT_TIMESTAMP
        WHERE telegram_id=?1 AND balance>=?2
        RETURNING balance
      `).bind(id, amount),
      env.DB.prepare(`
        INSERT INTO wallet_transactions
        (telegram_id,type,amount,balance_before,balance_after,idempotency_key,metadata)
        SELECT ?1,?2,-?3,balance+?3,balance,?4,?5
        FROM wallets WHERE telegram_id=?1 AND changes()=1
      `).bind(id, type, amount, key, JSON.stringify(metadata)),
    ]);
    const updated = results?.[0]?.results?.[0];
    if (!updated) throw new Error("INSUFFICIENT_FUNDS");
    return { applied: true, balance: Number(updated.balance) };
  } catch (error) {
    const duplicate = await env.DB.prepare(
      `SELECT balance_after FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`
    ).bind(key).first();
    if (duplicate) return { applied: false, balance: await getBalance(env, id) };
    if (String(error?.message || "").includes("INSUFFICIENT_FUNDS")) throw error;
    const balance = await getBalance(env, id);
    if (balance < amount) throw new Error("INSUFFICIENT_FUNDS");
    throw error;
  }
}

export async function credit(env, id, amount, type, key, metadata = {}) {
  id = String(id);
  amount = Math.floor(Number(amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("INVALID_AMOUNT");

  const old = await env.DB.prepare(
    `SELECT balance_after FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`
  ).bind(key).first();
  if (old) return { applied: false, balance: await getBalance(env, id) };

  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE wallets SET balance=balance+?2,updated_at=CURRENT_TIMESTAMP
        WHERE telegram_id=?1 RETURNING balance
      `).bind(id, amount),
      env.DB.prepare(`
        INSERT INTO wallet_transactions
        (telegram_id,type,amount,balance_before,balance_after,idempotency_key,metadata)
        SELECT ?1,?2,?3,balance-?3,balance,?4,?5
        FROM wallets WHERE telegram_id=?1 AND changes()=1
      `).bind(id, type, amount, key, JSON.stringify(metadata)),
    ]);
    const updated = results?.[0]?.results?.[0];
    if (!updated) throw new Error("WALLET_NOT_FOUND");
    return { applied: true, balance: Number(updated.balance) };
  } catch (error) {
    const duplicate = await env.DB.prepare(
      `SELECT balance_after FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`
    ).bind(key).first();
    if (duplicate) return { applied: false, balance: await getBalance(env, id) };
    throw error;
  }
}

export async function zeroLedger(env, id, type, key, metadata = {}) {
  const old = await env.DB.prepare(
    `SELECT 1 AS ok FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`
  ).bind(key).first();
  if (old) return false;
  const balance = await getBalance(env, id);
  try {
    await env.DB.prepare(`
      INSERT INTO wallet_transactions
      (telegram_id,type,amount,balance_before,balance_after,idempotency_key,metadata)
      VALUES (?1,?2,0,?3,?3,?4,?5)
    `).bind(String(id), type, balance, key, JSON.stringify(metadata)).run();
    return true;
  } catch (error) {
    const duplicate = await env.DB.prepare(
      `SELECT 1 AS ok FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`
    ).bind(key).first();
    if (duplicate) return false;
    throw error;
  }
}

export async function addXp(env, id, amount) {
  amount = Math.max(0, Math.floor(Number(amount) || 0));
  await env.DB.prepare(`
    UPDATE users
    SET xp=xp+?2,
        level=MIN(100,1+CAST((xp+?2)/500 AS INTEGER)),
        updated_at=CURRENT_TIMESTAMP
    WHERE telegram_id=?1
  `).bind(String(id), amount).run();
}

export async function logAdmin(env, adminId, action, target, payload = {}) {
  await env.DB.prepare(`
    INSERT INTO admin_logs(admin_telegram_id,action,target,payload)
    VALUES(?1,?2,?3,?4)
  `).bind(String(adminId), action, target ? String(target) : null, JSON.stringify(payload)).run();
}

export function publicPlayer(p) {
  const hands = Number(p.hands_played || 0);
  const wins = Number(p.hands_won || 0);
  return {
    telegramId: String(p.telegram_id),
    username: p.username,
    firstName: p.first_name,
    lastName: p.last_name,
    photoUrl: p.photo_url,
    level: Number(p.level || 1),
    xp: Number(p.xp || 0),
    rating: Number(p.rating || 1000),
    profileFrame: p.profile_frame || null,
    balance: Number(p.balance || 0),
    handsPlayed: hands,
    handsWon: wins,
    winRate: hands ? Math.round(wins / hands * 100) : 0,
    biggestPot: Number(p.biggest_pot || 0),
    totalWon: Number(p.total_won || 0),
    totalLost: Number(p.total_lost || 0),
    allIns: Number(p.all_ins || 0),
    allInsWon: Number(p.all_ins_won || 0),
    tournamentsPlayed: Number(p.tournaments_played || 0),
    finalTables: Number(p.final_tables || 0),
    tournamentsWon: Number(p.tournaments_won || 0),
    blackjackGames: Number(p.blackjack_games || 0),
    blackjackWins: Number(p.blackjack_wins || 0),
    blackjackLosses: Number(p.blackjack_losses || 0),
    blackjackPushes: Number(p.blackjack_pushes || 0),
    blackjackBiggestWin: Number(p.blackjack_biggest_win || 0),
    registeredAt: p.created_at,
  };
}
