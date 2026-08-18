import { credit, getBalance } from "./db.js";

const STREAK=[50000,75000,100000,150000,200000,300000,500000];

export async function rewardsStatus(env,userId) {
  userId=String(userId);
  const row=await env.DB.prepare(`SELECT * FROM daily_rewards WHERE telegram_id=?1`).bind(userId).first();
  const today=dayKey();
  const last=row?.last_claim_day||null;
  const yesterday=dayKey(Date.now()-86400000);
  let nextDay=1;
  if(last===yesterday) nextDay=Math.min(7,Number(row?.streak_day||0)+1);
  else if(last===today) nextDay=Number(row?.streak_day||1);
  const balance=await getBalance(env,userId);
  const helpKey=`lowhelp:${userId}:${today}`;
  const helped=await env.DB.prepare(`SELECT 1 AS ok FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`).bind(helpKey).first();
  return {
    streakDay:Number(row?.streak_day||0),
    streakAvailable:last!==today,
    streakNextDay:nextDay,
    streakNextAmount:STREAK[nextDay-1],
    freeAvailable:row?.last_free_claim_day!==today,
    rescueAvailable:balance===0,
    lowHelpAvailable:balance>0&&balance<50000&&!helped,
  };
}

export async function claimStreak(env,userId) {
  userId=String(userId);
  const row=await env.DB.prepare(`SELECT * FROM daily_rewards WHERE telegram_id=?1`).bind(userId).first();
  const today=dayKey(),yesterday=dayKey(Date.now()-86400000);
  if(row?.last_claim_day===today)throw new Error("ALREADY_CLAIMED");
  const next=row?.last_claim_day===yesterday?(Number(row.streak_day||0)%7)+1:1;
  const amount=STREAK[next-1];
  const c=await credit(env,userId,amount,"DAILY_STREAK",`reward:streak:${userId}:${today}`,{day:next});
  await env.DB.prepare(`
    INSERT INTO daily_rewards(telegram_id,streak_day,last_claim_day)
    VALUES(?1,?2,?3)
    ON CONFLICT(telegram_id) DO UPDATE SET streak_day=?2,last_claim_day=?3,updated_at=CURRENT_TIMESTAMP
  `).bind(userId,next,today).run();
  return {amount,balance:c.balance,day:next};
}

export async function claimFree(env,userId) {
  userId=String(userId);
  const today=dayKey();
  const row=await env.DB.prepare(`SELECT last_free_claim_day FROM daily_rewards WHERE telegram_id=?1`).bind(userId).first();
  if(row?.last_free_claim_day===today)throw new Error("ALREADY_CLAIMED");
  const amount=25000;
  const c=await credit(env,userId,amount,"DAILY_FREE",`reward:free:${userId}:${today}`,{day:today});
  await env.DB.prepare(`
    INSERT INTO daily_rewards(telegram_id,last_free_claim_day)
    VALUES(?1,?2)
    ON CONFLICT(telegram_id) DO UPDATE SET last_free_claim_day=?2,updated_at=CURRENT_TIMESTAMP
  `).bind(userId,today).run();
  return {amount,balance:c.balance};
}

export async function claimLowBalanceHelp(env,userId) {
  userId=String(userId);
  const balance=await getBalance(env,userId);
  if(balance<=0||balance>=50000)throw new Error("HELP_NOT_AVAILABLE");
  const today=dayKey();
  const c=await credit(env,userId,250000,"LOW_BALANCE_HELP",`lowhelp:${userId}:${today}`,{day:today});
  if(!c.applied)throw new Error("ALREADY_CLAIMED");
  return {amount:250000,balance:c.balance};
}

export async function startRescue(env,userId) {
  userId=String(userId);
  if(await getBalance(env,userId)!==0)throw new Error("BALANCE_NOT_ZERO");
  const active=await env.DB.prepare(`
    SELECT claim_token,eligible_at FROM rescue_rewards
    WHERE telegram_id=?1 AND status='watching' ORDER BY id DESC LIMIT 1
  `).bind(userId).first();
  if(active)return {claimToken:active.claim_token,eligibleAt:active.eligible_at};
  const token=crypto.randomUUID(),now=new Date(),eligible=new Date(now.getTime()+15000);
  await env.DB.prepare(`
    INSERT INTO rescue_rewards(telegram_id,claim_token,reward_amount,started_at,eligible_at,status)
    VALUES(?1,?2,50000,?3,?4,'watching')
  `).bind(userId,token,now.toISOString(),eligible.toISOString()).run();
  return {claimToken:token,eligibleAt:eligible.toISOString()};
}

export async function claimRescue(env,userId,claimToken) {
  userId=String(userId);
  const row=await env.DB.prepare(`SELECT * FROM rescue_rewards WHERE telegram_id=?1 AND claim_token=?2 LIMIT 1`)
    .bind(userId,String(claimToken)).first();
  if(!row)throw new Error("RESCUE_NOT_FOUND");
  if(row.status==="claimed")return {amount:Number(row.reward_amount),balance:await getBalance(env,userId)};
  if(row.status!=="watching")throw new Error("RESCUE_CANCELLED");
  if(Date.now()<Date.parse(row.eligible_at))throw new Error("TOO_EARLY");
  if(await getBalance(env,userId)!==0)throw new Error("BALANCE_NOT_ZERO");
  const c=await credit(env,userId,Number(row.reward_amount),"ZERO_RESCUE",`rescue:${row.claim_token}`,{rescueId:row.id});
  await env.DB.prepare(`UPDATE rescue_rewards SET status='claimed',claimed_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(row.id).run();
  return {amount:Number(row.reward_amount),balance:c.balance};
}

export async function syncAchievements(env,userId) {
  const p=await env.DB.prepare(`
    SELECT w.balance,s.* FROM wallets w JOIN user_stats s ON s.telegram_id=w.telegram_id
    WHERE w.telegram_id=?1 LIMIT 1
  `).bind(String(userId)).first();
  const achievements=(await env.DB.prepare(`SELECT * FROM achievements ORDER BY rare DESC,reward DESC`).all()).results||[];
  const unlocked=(await env.DB.prepare(`SELECT achievement_id,claimed_at FROM user_achievements WHERE telegram_id=?1`).bind(String(userId)).all()).results||[];
  const map=new Map(unlocked.map(x=>[x.achievement_id,x]));
  for(const a of achievements){
    const value=Number(p?.[a.metric]||0);
    if(value>=Number(a.threshold)&&!map.has(a.id)){
      await env.DB.prepare(`INSERT OR IGNORE INTO user_achievements(telegram_id,achievement_id) VALUES(?1,?2)`).bind(String(userId),a.id).run();
      map.set(a.id,{achievement_id:a.id,claimed_at:null});
    }
  }
  return achievements.map(a=>({
    id:a.id,name:a.name,description:a.description,reward:Number(a.reward),rare:!!a.rare,
    unlocked:map.has(a.id),claimed:!!map.get(a.id)?.claimed_at,
    progress:Math.min(Number(a.threshold),Number(p?.[a.metric]||0)),threshold:Number(a.threshold)
  }));
}

export async function claimAchievement(env,userId,achievementId) {
  const row=await env.DB.prepare(`
    SELECT a.reward,ua.claimed_at FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id
    WHERE ua.telegram_id=?1 AND ua.achievement_id=?2 LIMIT 1
  `).bind(String(userId),String(achievementId)).first();
  if(!row)throw new Error("NOT_UNLOCKED");
  if(row.claimed_at)throw new Error("ALREADY_CLAIMED");
  const c=await credit(env,userId,Number(row.reward),"ACHIEVEMENT",`achievement:${userId}:${achievementId}`,{achievementId});
  await env.DB.prepare(`UPDATE user_achievements SET claimed_at=CURRENT_TIMESTAMP WHERE telegram_id=?1 AND achievement_id=?2`)
    .bind(String(userId),String(achievementId)).run();
  return {amount:Number(row.reward),balance:c.balance};
}

function dayKey(ms=Date.now()){return new Date(ms).toISOString().slice(0,10);}
