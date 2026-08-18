export async function ensureJackpotPool(env){
  await env.DB.prepare(`INSERT OR IGNORE INTO jackpot_pools(id,balance,base_balance) VALUES('grand',0,0)`).run();
}

export async function getJackpotPool(env){
  await ensureJackpotPool(env);
  const row=await env.DB.prepare(`SELECT balance,updated_at FROM jackpot_pools WHERE id='grand' LIMIT 1`).first();
  return {pool:Math.max(0,Number(row?.balance||0)),updatedAt:row?.updated_at||null};
}

export async function recordJackpotLoss(env,userId,roundId,bet,payout,source='CASINO'){
  userId=String(userId);roundId=String(roundId||'');
  bet=Math.max(0,Math.floor(Number(bet)||0));payout=Math.max(0,Math.floor(Number(payout)||0));
  const loss=Math.max(0,bet-payout);
  if(!roundId||loss<=0)return {added:0,...await getJackpotPool(env)};
  await ensureJackpotPool(env);
  const requestKey=`jackpot:loss:${source}:${roundId}`;
  const inserted=await env.DB.prepare(`
    INSERT INTO jackpot_events(request_key,telegram_id,type,amount,metadata)
    VALUES(?1,?2,'PLAYER_NET_LOSS',?3,?4)
    ON CONFLICT(request_key) DO NOTHING
    RETURNING id
  `).bind(requestKey,userId,loss,JSON.stringify({roundId,bet,payout,source})).first();
  if(inserted){
    await env.DB.prepare(`UPDATE jackpot_pools SET balance=balance+?1,base_balance=0,updated_at=CURRENT_TIMESTAMP WHERE id='grand'`).bind(loss).run();
  }
  const status=await getJackpotPool(env);
  return {added:inserted?loss:0,...status};
}

export async function claimWholeJackpot(env,userId,roundId){
  userId=String(userId);roundId=String(roundId||'');await ensureJackpotPool(env);
  const requestKey=`jackpot:claim:${roundId}`;
  const old=await env.DB.prepare(`SELECT amount FROM jackpot_events WHERE request_key=?1 LIMIT 1`).bind(requestKey).first();
  if(old)return Math.max(0,Number(old.amount||0));

  for(let attempt=0;attempt<4;attempt++){
    const row=await env.DB.prepare(`SELECT balance FROM jackpot_pools WHERE id='grand' LIMIT 1`).first();
    const amount=Math.max(0,Number(row?.balance||0));
    if(amount<=0)return 0;
    const changed=await env.DB.prepare(`
      UPDATE jackpot_pools SET balance=0,base_balance=0,updated_at=CURRENT_TIMESTAMP
      WHERE id='grand' AND balance=?1
      RETURNING balance
    `).bind(amount).first();
    if(!changed)continue;
    try{
      await env.DB.prepare(`
        INSERT INTO jackpot_events(request_key,telegram_id,type,amount,metadata)
        VALUES(?1,?2,'JACKPOT_WIN',?3,?4)
      `).bind(requestKey,userId,amount,JSON.stringify({roundId})).run();
      return amount;
    }catch(error){
      const existing=await env.DB.prepare(`SELECT amount FROM jackpot_events WHERE request_key=?1 LIMIT 1`).bind(requestKey).first();
      if(existing)return Math.max(0,Number(existing.amount||0));
      await env.DB.prepare(`UPDATE jackpot_pools SET balance=balance+?1,updated_at=CURRENT_TIMESTAMP WHERE id='grand'`).bind(amount).run();
      throw error;
    }
  }
  return 0;
}
