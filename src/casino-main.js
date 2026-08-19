import {validateTelegramInitData} from "./auth.js";
import {AUREUS_CONFIG,createAureusResult,createAureusBonusBuyResult} from "./games/aureus.js";
import {HONEY_FRUITS_CONFIG,createHoneyFruitsResult} from "./games/honey-fruits.js";
import {LUCKY_COIN_CONFIG,createLuckyCoinResult} from "./games/lucky-coin-collector.js";
import {NEON_BEAST_CONFIG,createNeonBeastResult} from "./games/neon-beast-rampage.js";
import {OLYMPUS_STORM_CONFIG,createOlympusStormResult,createOlympusStormBonusBuyResult} from "./games/olympus-storm.js";

const BUILD="2026-08-19-casino-social-v7";
const START_BALANCE=10_000_000;
const MIN_BET=1_000;
const MAX_BET=5_000_000;
const DAILY_BONUS=250_000;
const LOAN_MAX=50_000_000;
const TRADE_PAYOUT=1.9;

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/__fit_version")return json({ok:true,build:BUILD});
    if(url.pathname.startsWith("/api/"))return api(request,env,url);
    const res=await env.ASSETS.fetch(request);
    const headers=new Headers(res.headers);
    headers.set("cache-control","no-store, no-cache, must-revalidate, max-age=0");
    headers.set("x-fit-build",BUILD);
    return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
  }
};

async function api(request,env,url){
  if(request.method!=="POST")return json({ok:false,error:"POST_REQUIRED"},405);
  let body;
  try{body=await request.json();}catch{return json({ok:false,error:"BAD_JSON"},400);}
  const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);
  if(!auth.ok)return json({ok:false,error:auth.error},401);
  try{
    let player=await ensureUser(env,auth.user);
    await syncOverdueLoans(env,String(player.telegram_id));
    player=await loadUser(env,player.telegram_id);

    if(url.pathname==="/api/bootstrap")return json({ok:true,...await bootstrap(env,player)});
    if(url.pathname==="/api/slot/spin")return json({ok:true,...await playSlotRound(env,player,body)});
    if(url.pathname==="/api/slot/bonus-buy")return json({ok:true,...await playBonusBuy(env,player,body)});
    if(url.pathname==="/api/daily/claim")return json({ok:true,...await claimDaily(env,player)});

    if(url.pathname==="/api/social/state")return json({ok:true,...await socialState(env,player)});
    if(url.pathname==="/api/bets/create")return json({ok:true,...await createBetMarket(env,player,body)});
    if(url.pathname==="/api/bets/place")return json({ok:true,...await placeEventBet(env,player,body)});

    if(url.pathname==="/api/market/state")return json({ok:true,...await marketState(env,player)});
    if(url.pathname==="/api/market/open")return json({ok:true,...await openTrade(env,player,body)});

    if(url.pathname==="/api/loans/state")return json({ok:true,...await loanState(env,player)});
    if(url.pathname==="/api/loans/request")return json({ok:true,...await requestLoan(env,player,body)});
    if(url.pathname==="/api/loans/respond")return json({ok:true,...await respondLoan(env,player,body)});
    if(url.pathname==="/api/loans/repay")return json({ok:true,...await repayLoan(env,player,body)});
    if(url.pathname==="/api/loans/admin-help")return json({ok:true,...await requestAdminHelp(env,player)});

    if(url.pathname==="/api/admin/users")return json({ok:true,...await adminUsers(env,player)});
    if(url.pathname==="/api/admin/adjust")return json({ok:true,...await adminAdjust(env,player,body)});
    if(url.pathname==="/api/admin/stats")return json({ok:true,...await adminStats(env,player)});
    if(url.pathname==="/api/admin/social")return json({ok:true,...await adminSocial(env,player)});
    if(url.pathname==="/api/admin/bets/action")return json({ok:true,...await adminBetAction(env,player,body)});
    if(url.pathname==="/api/admin/aid/action")return json({ok:true,...await adminAidAction(env,player,body)});

    return json({ok:false,error:"NOT_FOUND"},404);
  }catch(error){
    console.error(url.pathname,error);
    return json({ok:false,error:String(error?.message||"SERVER_ERROR")},400);
  }
}

async function bootstrap(env,player){
  await syncMarketIndex(env);
  const profile=await profileFor(env,await loadUser(env,player.telegram_id));
  const daily=await dailyStatus(env,player.telegram_id);
  const jackpot=await jackpotValue(env);
  const market=await getMarketSummary(env);
  const counts=await socialCounts(env,player.telegram_id);
  return {
    player:profile,
    slots:[
      slotCard(AUREUS_CONFIG,"/assets/game-covers/aureus.svg","FEATURED",true),
      slotCard(HONEY_FRUITS_CONFIG,"/assets/game-covers/honey-fruits.svg","NEW",false),
      slotCard(LUCKY_COIN_CONFIG,"/assets/game-covers/lucky-coin-collector.svg","COIN",false),
      slotCard(NEON_BEAST_CONFIG,"/assets/game-covers/neon-beast-rampage.svg","EXCLUSIVE",false),
      slotCard(OLYMPUS_STORM_CONFIG,"/assets/game-covers/olympus-storm.svg","STORM",true)
    ],
    daily,jackpot,market,counts
  };
}

function slotCard(config,cover,badge,bonusBuy){
  return {id:config.id,name:config.name,rows:config.rows,cols:config.reels,mechanic:config.mechanic,feature:config.feature,bonusBuy,maxWin:config.maxWin,cover,badge};
}

async function ensureUser(env,tg){
  const id=String(tg.id),username=tg.username||null,first=tg.first_name||"Игрок",last=tg.last_name||null;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO casino_users(telegram_id,username,first_name,last_name,balance,role)
      VALUES(?1,?2,?3,?4,?5,'PLAYER')
      ON CONFLICT(telegram_id) DO UPDATE SET
      username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,updated_at=CURRENT_TIMESTAMP`)
      .bind(id,username,first,last,START_BALANCE),
    env.DB.prepare(`INSERT OR IGNORE INTO casino_meta(key,value) VALUES('admin_telegram_id',?1)`).bind(id),
    env.DB.prepare(`INSERT OR IGNORE INTO casino_daily(telegram_id,streak) VALUES(?1,0)`).bind(id)
  ]);
  await env.DB.prepare(`UPDATE casino_users SET role='ADMIN'
    WHERE telegram_id=(SELECT value FROM casino_meta WHERE key='admin_telegram_id')`).run();
  const row=await loadUser(env,id);
  if(Number(row.is_banned||0))throw new Error("PLAYER_BANNED");
  return row;
}

async function loadUser(env,id){
  const row=await env.DB.prepare(`SELECT * FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(String(id)).first();
  if(!row)throw new Error("PLAYER_NOT_FOUND");
  return row;
}

async function profileFor(env,p){
  const stats=await env.DB.prepare(`SELECT COALESCE(SUM(bet),0) wagered,COUNT(*) rounds,
    COALESCE(MAX(payout),0) biggest_win FROM casino_rounds WHERE telegram_id=?1`)
    .bind(String(p.telegram_id)).first();
  const wagered=Number(stats?.wagered||0),step=25_000_000,level=Math.min(20,1+Math.floor(wagered/step)),within=wagered%step;
  return {...publicUser(p),vip:{level,progress:Math.floor(within/step*100),wagered},rounds:Number(stats?.rounds||0),biggestWin:Number(stats?.biggest_win||0)};
}

function publicUser(p){
  return {
    telegramId:String(p.telegram_id),username:p.username,firstName:p.first_name,lastName:p.last_name,
    balance:Number(p.balance||0),role:p.role||"PLAYER",isAdmin:p.role==="ADMIN",createdAt:p.created_at
  };
}

/* -------------------- SLOTS -------------------- */

async function playSlotRound(env,player,body){
  const gameId=String(body.gameId||""),bet=validateBet(body.bet),requestId=validateRequestId(body.requestId);
  const cacheKey=`spin:${player.telegram_id}:${requestId}`,cached=await cachedResponse(env,cacheKey);
  if(cached)return {...cached,duplicate:true};

  let outcome,maxWin;
  if(gameId===AUREUS_CONFIG.id){outcome=createAureusResult(bet);maxWin=AUREUS_CONFIG.maxWin;}
  else if(gameId===HONEY_FRUITS_CONFIG.id){outcome=createHoneyFruitsResult(bet);maxWin=HONEY_FRUITS_CONFIG.maxWin;}
  else if(gameId===LUCKY_COIN_CONFIG.id){outcome=createLuckyCoinResult(bet);maxWin=LUCKY_COIN_CONFIG.maxWin;}
  else if(gameId===NEON_BEAST_CONFIG.id){outcome=createNeonBeastResult(bet);maxWin=NEON_BEAST_CONFIG.maxWin;}
  else if(gameId===OLYMPUS_STORM_CONFIG.id){outcome=createOlympusStormResult(bet);maxWin=OLYMPUS_STORM_CONFIG.maxWin;}
  else throw new Error("SLOT_NOT_READY");

  const roundId=crypto.randomUUID(),payout=Math.max(0,Math.floor(outcome.payout));
  const debit=await changeBalance(env,player.telegram_id,-bet,"SLOT_BET",roundId,{gameId,bet,requestId});
  let balance=debit.balance;
  if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,"SLOT_PAYOUT",roundId,{gameId,bet,payout,requestId})).balance;
  await recordRound(env,player.telegram_id,gameId,bet,payout,roundId,outcome);
  await addJackpot(env,Math.max(1,Math.floor(bet*.002)));
  await syncMarketIndex(env);
  const response={spinId:roundId,roundId,gameId,bet,payout,balance,multiplier:round2(payout/bet),maxWin:bet*maxWin,result:outcome};
  await cacheResponse(env,cacheKey,player.telegram_id,response);
  return response;
}

async function playBonusBuy(env,player,body){
  const gameId=String(body.gameId||""),bet=validateBet(body.bet),requestId=validateRequestId(body.requestId);
  const cacheKey=`buy:${player.telegram_id}:${requestId}`,cached=await cachedResponse(env,cacheKey);
  if(cached)return {...cached,duplicate:true};

  let tier,costMultiplier,outcome,maxWin;
  if(gameId===AUREUS_CONFIG.id){
    tier=String(body.tier||"standard");
    costMultiplier=tier==="super"?180:tier==="premium"?100:60;
    outcome=createAureusBonusBuyResult(bet,tier);maxWin=AUREUS_CONFIG.maxWin;
  }else if(gameId===OLYMPUS_STORM_CONFIG.id){
    tier="storm";costMultiplier=OLYMPUS_STORM_CONFIG.bonusBuyCost;
    outcome=createOlympusStormBonusBuyResult(bet);maxWin=OLYMPUS_STORM_CONFIG.maxWin;
  }else throw new Error("BONUS_BUY_NOT_READY");

  const cost=bet*costMultiplier,roundId=crypto.randomUUID(),payout=Math.max(0,Math.floor(outcome.payout));
  const debit=await changeBalance(env,player.telegram_id,-cost,"BONUS_BUY",roundId,{gameId,bet,tier,cost,requestId});
  let balance=debit.balance;
  if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,"BONUS_BUY_PAYOUT",roundId,{gameId,bet,tier,payout,requestId})).balance;
  await recordRound(env,player.telegram_id,`${gameId}:bonus:${tier}`,cost,payout,roundId,outcome);
  await addJackpot(env,Math.max(1,Math.floor(cost*.001)));
  await syncMarketIndex(env);
  const response={spinId:roundId,roundId,gameId,bet,cost,tier,payout,balance,multiplier:round2(payout/bet),maxWin:bet*maxWin,result:outcome};
  await cacheResponse(env,cacheKey,player.telegram_id,response);
  return response;
}

/* -------------------- COMMUNITY BETS -------------------- */

async function socialState(env,player){
  const [bets,loans,market]=await Promise.all([
    listBetMarkets(env,player.telegram_id),
    loanState(env,player),
    marketState(env,player)
  ]);
  const fresh=await loadUser(env,player.telegram_id);
  return {player:publicUser(fresh),bets,loans,market};
}

async function createBetMarket(env,player,body){
  const title=cleanText(body.title,3,80,"BAD_TITLE");
  const description=cleanText(body.description||"",0,500,"BAD_DESCRIPTION");
  const outcomes=normalizeOutcomes(body.outcomes);
  const id=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO casino_bet_markets(id,creator_id,title,description,outcomes_json,status)
    VALUES(?1,?2,?3,?4,?5,'PENDING')`)
    .bind(id,String(player.telegram_id),title,description,JSON.stringify(outcomes)).run();
  return {marketId:id,status:"PENDING",message:"WAITING_ADMIN"};
}

async function listBetMarkets(env,userId){
  const open=(await env.DB.prepare(`SELECT m.*,u.first_name creator_name,u.username creator_username
    FROM casino_bet_markets m LEFT JOIN casino_users u ON u.telegram_id=m.creator_id
    WHERE m.status='OPEN' ORDER BY m.approved_at DESC,m.created_at DESC LIMIT 40`).all()).results||[];
  const mine=(await env.DB.prepare(`SELECT m.*,u.first_name creator_name,u.username creator_username
    FROM casino_bet_markets m LEFT JOIN casino_users u ON u.telegram_id=m.creator_id
    WHERE m.creator_id=?1 ORDER BY m.created_at DESC LIMIT 20`).bind(String(userId)).all()).results||[];
  return {
    open:await enrichBetMarkets(env,open,userId),
    mine:await enrichBetMarkets(env,mine,userId)
  };
}

async function enrichBetMarkets(env,rows,userId){
  if(!rows.length)return [];
  const ids=[...new Set(rows.map(x=>String(x.id)))];
  const marks=ids.map((_,i)=>`?${i+1}`).join(",");
  const pools=(await env.DB.prepare(`SELECT market_id,outcome,SUM(amount) amount,COUNT(*) tickets
    FROM casino_market_bets WHERE market_id IN (${marks}) AND status='ACTIVE'
    GROUP BY market_id,outcome`).bind(...ids).all()).results||[];
  const userBets=(await env.DB.prepare(`SELECT market_id,outcome,amount,status,payout
    FROM casino_market_bets WHERE telegram_id=?1 AND market_id IN (${ids.map((_,i)=>`?${i+2}`).join(",")})`)
    .bind(String(userId),...ids).all()).results||[];
  const poolMap=new Map(),userMap=new Map();
  for(const r of pools){
    if(!poolMap.has(r.market_id))poolMap.set(r.market_id,new Map());
    poolMap.get(r.market_id).set(r.outcome,{amount:Number(r.amount||0),tickets:Number(r.tickets||0)});
  }
  for(const r of userBets)userMap.set(r.market_id,{outcome:r.outcome,amount:Number(r.amount||0),status:r.status,payout:Number(r.payout||0)});
  return rows.map(r=>{
    const outcomes=parseJson(r.outcomes_json,[]);
    const pm=poolMap.get(r.id)||new Map();
    const pool=outcomes.map(name=>({name,amount:Number(pm.get(name)?.amount||0),tickets:Number(pm.get(name)?.tickets||0)}));
    const totalPool=pool.reduce((s,x)=>s+x.amount,0);
    return {
      id:r.id,title:r.title,description:r.description,status:r.status,winningOutcome:r.winning_outcome||null,
      creator:{id:r.creator_id,name:r.creator_name||"Игрок",username:r.creator_username||null},
      outcomes:pool.map(x=>({...x,estimatedOdds:x.amount>0?round2(totalPool/x.amount):null})),
      totalPool,userBet:userMap.get(r.id)||null,createdAt:r.created_at,approvedAt:r.approved_at,settledAt:r.settled_at
    };
  });
}

async function placeEventBet(env,player,body){
  const marketId=String(body.marketId||""),outcome=String(body.outcome||""),amount=validateBet(body.amount);
  const requestId=validateRequestId(body.requestId),cacheKey=`event:${player.telegram_id}:${requestId}`;
  const cached=await cachedResponse(env,cacheKey);if(cached)return {...cached,duplicate:true};

  const market=await env.DB.prepare(`SELECT * FROM casino_bet_markets WHERE id=?1 LIMIT 1`).bind(marketId).first();
  if(!market||market.status!=="OPEN")throw new Error("BET_NOT_OPEN");
  const outcomes=parseJson(market.outcomes_json,[]);
  if(!outcomes.includes(outcome))throw new Error("BAD_OUTCOME");
  const existing=await env.DB.prepare(`SELECT id FROM casino_market_bets WHERE market_id=?1 AND telegram_id=?2 LIMIT 1`)
    .bind(marketId,String(player.telegram_id)).first();
  if(existing)throw new Error("BET_ALREADY_PLACED");

  const id=crypto.randomUUID(),roundId=`event:${id}`;
  await env.DB.prepare(`INSERT INTO casino_market_bets(id,market_id,telegram_id,outcome,amount,status)
    VALUES(?1,?2,?3,?4,?5,'RESERVED')`).bind(id,marketId,String(player.telegram_id),outcome,amount).run();
  let debit;
  try{
    debit=await changeBalance(env,player.telegram_id,-amount,"EVENT_BET_STAKE",roundId,{marketId,outcome,amount});
  }catch(error){
    await env.DB.prepare(`DELETE FROM casino_market_bets WHERE id=?1 AND status='RESERVED'`).bind(id).run();
    throw error;
  }
  await env.DB.prepare(`UPDATE casino_market_bets SET status='ACTIVE' WHERE id=?1`).bind(id).run();
  const response={betId:id,marketId,outcome,amount,balance:debit.balance};
  await cacheResponse(env,cacheKey,player.telegram_id,response);
  return response;
}

async function adminBetAction(env,admin,body){
  requireAdmin(admin);
  const id=String(body.marketId||""),action=String(body.action||"").toUpperCase();
  const market=await env.DB.prepare(`SELECT * FROM casino_bet_markets WHERE id=?1 LIMIT 1`).bind(id).first();
  if(!market)throw new Error("BET_NOT_FOUND");

  if(action==="APPROVE"){
    if(market.status!=="PENDING")throw new Error("BET_BAD_STATE");
    await env.DB.prepare(`UPDATE casino_bet_markets SET status='OPEN',approved_by=?2,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1`)
      .bind(id,String(admin.telegram_id)).run();
    return {marketId:id,status:"OPEN"};
  }

  if(action==="DELETE"){
    if(market.status==="OPEN")await refundEventMarket(env,id,"DELETED");
    else await env.DB.prepare(`UPDATE casino_bet_markets SET status='DELETED',updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(id).run();
    return {marketId:id,status:"DELETED"};
  }

  if(action==="CANCEL"){
    if(market.status!=="OPEN")throw new Error("BET_BAD_STATE");
    await refundEventMarket(env,id,"CANCELLED");
    return {marketId:id,status:"CANCELLED"};
  }

  if(action==="SETTLE"){
    if(market.status!=="OPEN")throw new Error("BET_BAD_STATE");
    const winning=String(body.winningOutcome||"");
    const outcomes=parseJson(market.outcomes_json,[]);
    if(!outcomes.includes(winning))throw new Error("BAD_OUTCOME");
    await settleEventMarket(env,market,winning,admin.telegram_id);
    return {marketId:id,status:"SETTLED",winningOutcome:winning};
  }
  throw new Error("BAD_ADMIN_ACTION");
}

async function settleEventMarket(env,market,winning,adminId){
  const lock=await env.DB.prepare(`UPDATE casino_bet_markets SET status='SETTLING',updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='OPEN'`)
    .bind(market.id).run();
  if(Number(lock?.meta?.changes||0)!==1)throw new Error("BET_BAD_STATE");

  const bets=(await env.DB.prepare(`SELECT * FROM casino_market_bets WHERE market_id=?1 AND status='ACTIVE' ORDER BY created_at`)
    .bind(market.id).all()).results||[];
  const total=bets.reduce((s,b)=>s+Number(b.amount||0),0);
  const winningPool=bets.filter(b=>b.outcome===winning).reduce((s,b)=>s+Number(b.amount||0),0);

  for(const b of bets){
    if(b.outcome===winning&&winningPool>0){
      const payout=Math.max(0,Math.floor(Number(b.amount)*total/winningPool));
      if(payout>0)await changeBalance(env,b.telegram_id,payout,"EVENT_BET_PAYOUT",`event:${b.id}`,{marketId:market.id,winning,payout});
      await env.DB.prepare(`UPDATE casino_market_bets SET status='WON',payout=?2,settled_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(b.id,payout).run();
    }else{
      await env.DB.prepare(`UPDATE casino_market_bets SET status='LOST',payout=0,settled_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(b.id).run();
    }
  }
  await env.DB.prepare(`UPDATE casino_bet_markets SET status='SETTLED',winning_outcome=?2,settled_at=CURRENT_TIMESTAMP,
    approved_by=COALESCE(approved_by,?3),updated_at=CURRENT_TIMESTAMP WHERE id=?1`)
    .bind(market.id,winning,String(adminId)).run();
}

async function refundEventMarket(env,marketId,status){
  const bets=(await env.DB.prepare(`SELECT * FROM casino_market_bets WHERE market_id=?1 AND status='ACTIVE'`).bind(marketId).all()).results||[];
  for(const b of bets){
    await changeBalance(env,b.telegram_id,Number(b.amount),"EVENT_BET_REFUND",`event:${b.id}`,{marketId,reason:status});
    await env.DB.prepare(`UPDATE casino_market_bets SET status='REFUNDED',payout=?2,settled_at=CURRENT_TIMESTAMP WHERE id=?1`)
      .bind(b.id,Number(b.amount)).run();
  }
  await env.DB.prepare(`UPDATE casino_bet_markets SET status=?2,settled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1`)
    .bind(marketId,status).run();
}

/* -------------------- SYNTHETIC MARKET -------------------- */

async function syncMarketIndex(env){
  let state=await env.DB.prepare(`SELECT * FROM casino_market_state WHERE id=1`).first();
  if(!state){
    const max=await env.DB.prepare(`SELECT COALESCE(MAX(rowid),0) m FROM casino_rounds`).first();
    await env.DB.prepare(`INSERT INTO casino_market_state(id,price,last_round_rowid) VALUES(1,1000,?1)`).bind(Number(max?.m||0)).run();
    state={price:1000,last_round_rowid:Number(max?.m||0)};
  }
  const last=Number(state.last_round_rowid||0);
  const agg=await env.DB.prepare(`SELECT COALESCE(MAX(rowid),?1) max_id,COALESCE(SUM(bet),0) wagered,
    COALESCE(SUM(bet-payout),0) house_net FROM casino_rounds WHERE rowid>?1`).bind(last).first();
  const maxId=Number(agg?.max_id||last);
  if(maxId<=last)return Number(state.price||1000);

  const wagered=Number(agg?.wagered||0),houseNet=Number(agg?.house_net||0);
  const ratio=wagered>0?houseNet/wagered:0;
  const impact=clamp(ratio*.018,-.03,.03);
  const next=Math.max(10,round4(Number(state.price||1000)*(1+impact)));
  const now=Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE casino_market_state SET price=?1,last_round_rowid=?2,updated_at=CURRENT_TIMESTAMP WHERE id=1`).bind(next,maxId),
    env.DB.prepare(`INSERT INTO casino_market_points(price,house_net,wagered,created_ms) VALUES(?1,?2,?3,?4)`).bind(next,Math.floor(houseNet),Math.floor(wagered),now)
  ]);
  return next;
}

async function getMarketSummary(env){
  const state=await env.DB.prepare(`SELECT price,updated_at FROM casino_market_state WHERE id=1`).first();
  const prev=await env.DB.prepare(`SELECT price FROM casino_market_points ORDER BY id DESC LIMIT 1 OFFSET 1`).first();
  const price=Number(state?.price||1000),prevPrice=Number(prev?.price||price);
  return {price,changePct:prevPrice?round4((price-prevPrice)/prevPrice*100):0,updatedAt:state?.updated_at||null};
}

async function marketState(env,player){
  await syncMarketIndex(env);
  await settleTradingPositions(env);
  const state=await env.DB.prepare(`SELECT price,updated_at FROM casino_market_state WHERE id=1`).first();
  const points=((await env.DB.prepare(`SELECT id,price,house_net,wagered,created_ms FROM casino_market_points ORDER BY id DESC LIMIT 80`).all()).results||[]).reverse();
  const positions=(await env.DB.prepare(`SELECT id,direction,duration_hours,amount,entry_price,exit_price,status,payout,close_ms,created_ms,created_at,settled_at
    FROM casino_trading_positions WHERE telegram_id=?1 ORDER BY created_ms DESC LIMIT 30`).bind(String(player.telegram_id)).all()).results||[];
  const fresh=await loadUser(env,player.telegram_id);
  return {price:Number(state?.price||1000),updatedAt:state?.updated_at||null,points:points.map(normalizePoint),positions:positions.map(normalizePosition),balance:Number(fresh.balance||0)};
}

async function openTrade(env,player,body){
  await syncMarketIndex(env);
  await settleTradingPositions(env);
  const direction=String(body.direction||"").toUpperCase();
  if(!["UP","DOWN"].includes(direction))throw new Error("BAD_DIRECTION");
  const duration=Number(body.durationHours);
  if(![2,4,6].includes(duration))throw new Error("BAD_DURATION");
  const amount=validateBet(body.amount),requestId=validateRequestId(body.requestId);
  const cacheKey=`trade:${player.telegram_id}:${requestId}`,cached=await cachedResponse(env,cacheKey);
  if(cached)return {...cached,duplicate:true};

  const state=await env.DB.prepare(`SELECT price FROM casino_market_state WHERE id=1`).first();
  const entry=Number(state?.price||1000),id=crypto.randomUUID(),now=Date.now(),closeMs=now+duration*60*60*1000;
  const debit=await changeBalance(env,player.telegram_id,-amount,"TRADE_STAKE",`trade:${id}`,{direction,duration,entry});
  await env.DB.prepare(`INSERT INTO casino_trading_positions(id,telegram_id,direction,duration_hours,amount,entry_price,status,close_ms,created_ms)
    VALUES(?1,?2,?3,?4,?5,?6,'OPEN',?7,?8)`)
    .bind(id,String(player.telegram_id),direction,duration,amount,entry,closeMs,now).run();
  const response={positionId:id,direction,durationHours:duration,amount,entryPrice:entry,closeMs,balance:debit.balance};
  await cacheResponse(env,cacheKey,player.telegram_id,response);
  return response;
}

async function settleTradingPositions(env){
  const now=Date.now();
  const rows=(await env.DB.prepare(`SELECT * FROM casino_trading_positions WHERE status='OPEN' AND close_ms<=?1 ORDER BY close_ms LIMIT 100`).bind(now).all()).results||[];
  for(const p of rows){
    const point=await env.DB.prepare(`SELECT price FROM casino_market_points WHERE created_ms<=?1 ORDER BY id DESC LIMIT 1`).bind(Number(p.close_ms)).first();
    const exit=Number(point?.price??p.entry_price),entry=Number(p.entry_price),direction=p.direction;
    const won=direction==="UP"?exit>entry:exit<entry;
    const push=Math.abs(exit-entry)<0.000001;
    const payout=push?Number(p.amount):won?Math.floor(Number(p.amount)*TRADE_PAYOUT):0;
    const status=push?"PUSH":won?"WON":"LOST";
    const lock=await env.DB.prepare(`UPDATE casino_trading_positions SET status=?2,exit_price=?3,payout=?4,settled_at=CURRENT_TIMESTAMP
      WHERE id=?1 AND status='OPEN'`).bind(p.id,status,exit,payout).run();
    if(Number(lock?.meta?.changes||0)!==1)continue;
    if(payout>0)await changeBalance(env,p.telegram_id,payout,"TRADE_PAYOUT",`trade:${p.id}`,{entry,exit,direction,status});
  }
}

function normalizePoint(p){return {id:Number(p.id),price:Number(p.price),houseNet:Number(p.house_net||0),wagered:Number(p.wagered||0),time:Number(p.created_ms||0)};}
function normalizePosition(p){return {id:p.id,direction:p.direction,durationHours:Number(p.duration_hours),amount:Number(p.amount),entryPrice:Number(p.entry_price),exitPrice:p.exit_price==null?null:Number(p.exit_price),status:p.status,payout:Number(p.payout||0),closeMs:Number(p.close_ms),createdMs:Number(p.created_ms)};}

/* -------------------- LOANS -------------------- */

async function syncOverdueLoans(env,borrowerId=null){
  const now=Date.now();
  const sql=borrowerId
    ?`SELECT * FROM casino_loans WHERE borrower_id=?1 AND status='ACTIVE' AND due_ms<=?2 ORDER BY due_ms LIMIT 50`
    :`SELECT * FROM casino_loans WHERE status='ACTIVE' AND due_ms<=?1 ORDER BY due_ms LIMIT 50`;
  const q=borrowerId?env.DB.prepare(sql).bind(String(borrowerId),now):env.DB.prepare(sql).bind(now);
  const rows=(await q.all()).results||[];
  for(const loan of rows){
    const lock=await env.DB.prepare(`UPDATE casino_loans SET status='DEFAULTED',defaulted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id=?1 AND status='ACTIVE'`).bind(loan.id).run();
    if(Number(lock?.meta?.changes||0)!==1)continue;
    const repayment=Number(loan.repayment_amount);
    await forceChangeBalance(env,loan.borrower_id,-repayment,"LOAN_DEFAULT_DEBIT",`loan:${loan.id}`,{lenderId:loan.lender_id,principal:Number(loan.principal),repayment});
    await changeBalance(env,loan.lender_id,repayment,"LOAN_DEFAULT_CREDIT",`loan:${loan.id}`,{borrowerId:loan.borrower_id,principal:Number(loan.principal),repayment});
  }
}

async function loanState(env,player){
  await syncOverdueLoans(env,String(player.telegram_id));
  const id=String(player.telegram_id);
  const rows=(await env.DB.prepare(`SELECT l.*,
    bu.first_name borrower_name,bu.username borrower_username,
    lu.first_name lender_name,lu.username lender_username
    FROM casino_loans l
    LEFT JOIN casino_users bu ON bu.telegram_id=l.borrower_id
    LEFT JOIN casino_users lu ON lu.telegram_id=l.lender_id
    WHERE l.borrower_id=?1 OR l.lender_id=?1
    ORDER BY l.created_ms DESC LIMIT 50`).bind(id).all()).results||[];
  const peers=(await env.DB.prepare(`SELECT telegram_id,username,first_name,last_name FROM casino_users
    WHERE telegram_id<>?1 AND is_banned=0 ORDER BY updated_at DESC LIMIT 100`).bind(id).all()).results||[];
  const help=await env.DB.prepare(`SELECT id,amount,status,created_ms,created_at FROM casino_admin_help_requests
    WHERE telegram_id=?1 ORDER BY created_ms DESC LIMIT 1`).bind(id).first();
  const fresh=await loadUser(env,id);
  return {
    balance:Number(fresh.balance||0),
    loans:rows.map(normalizeLoan),
    peers:peers.map(p=>({telegramId:String(p.telegram_id),username:p.username,firstName:p.first_name,lastName:p.last_name})),
    adminHelp:help?{id:help.id,amount:Number(help.amount),status:help.status,createdMs:Number(help.created_ms)}:null
  };
}

async function requestLoan(env,player,body){
  const lenderId=String(body.lenderId||"");
  if(!lenderId||lenderId===String(player.telegram_id))throw new Error("BAD_LENDER");
  await loadUser(env,lenderId);
  const principal=validateLoanAmount(body.amount),repayment=Math.ceil(principal*1.15),id=crypto.randomUUID(),now=Date.now();
  const existing=await env.DB.prepare(`SELECT id FROM casino_loans WHERE borrower_id=?1 AND lender_id=?2 AND status='REQUESTED' LIMIT 1`)
    .bind(String(player.telegram_id),lenderId).first();
  if(existing)throw new Error("LOAN_REQUEST_EXISTS");
  await env.DB.prepare(`INSERT INTO casino_loans(id,borrower_id,lender_id,principal,repayment_amount,status,created_ms)
    VALUES(?1,?2,?3,?4,?5,'REQUESTED',?6)`)
    .bind(id,String(player.telegram_id),lenderId,principal,repayment,now).run();
  return {loanId:id,status:"REQUESTED",principal,repayment};
}

async function respondLoan(env,player,body){
  const id=String(body.loanId||""),action=String(body.action||"").toUpperCase();
  const loan=await env.DB.prepare(`SELECT * FROM casino_loans WHERE id=?1 LIMIT 1`).bind(id).first();
  if(!loan)throw new Error("LOAN_NOT_FOUND");
  if(String(loan.lender_id)!==String(player.telegram_id))throw new Error("LOAN_NOT_YOURS");
  if(loan.status!=="REQUESTED")throw new Error("LOAN_BAD_STATE");

  if(action==="DECLINE"){
    await env.DB.prepare(`UPDATE casino_loans SET status='DECLINED',updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='REQUESTED'`).bind(id).run();
    return {loanId:id,status:"DECLINED"};
  }
  if(action!=="ACCEPT")throw new Error("BAD_LOAN_ACTION");

  const lock=await env.DB.prepare(`UPDATE casino_loans SET status='ACCEPTING',updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='REQUESTED'`).bind(id).run();
  if(Number(lock?.meta?.changes||0)!==1)throw new Error("LOAN_BAD_STATE");
  try{
    await changeBalance(env,loan.lender_id,-Number(loan.principal),"LOAN_LEND",`loan:${id}`,{borrowerId:loan.borrower_id});
    const credit=await changeBalance(env,loan.borrower_id,Number(loan.principal),"LOAN_BORROW",`loan:${id}`,{lenderId:loan.lender_id});
    const due=Date.now()+24*60*60*1000;
    await env.DB.prepare(`UPDATE casino_loans SET status='ACTIVE',due_ms=?2,accepted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1`)
      .bind(id,due).run();
    return {loanId:id,status:"ACTIVE",dueMs:due,borrowerBalance:credit.balance};
  }catch(error){
    await env.DB.prepare(`UPDATE casino_loans SET status='REQUESTED',updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='ACCEPTING'`).bind(id).run();
    throw error;
  }
}

async function repayLoan(env,player,body){
  const id=String(body.loanId||"");
  await syncOverdueLoans(env,String(player.telegram_id));
  const loan=await env.DB.prepare(`SELECT * FROM casino_loans WHERE id=?1 LIMIT 1`).bind(id).first();
  if(!loan)throw new Error("LOAN_NOT_FOUND");
  if(String(loan.borrower_id)!==String(player.telegram_id))throw new Error("LOAN_NOT_YOURS");
  if(loan.status!=="ACTIVE")throw new Error("LOAN_BAD_STATE");
  const amount=Number(loan.repayment_amount);
  const debit=await changeBalance(env,loan.borrower_id,-amount,"LOAN_REPAY_DEBIT",`loan:${id}`,{lenderId:loan.lender_id});
  await changeBalance(env,loan.lender_id,amount,"LOAN_REPAY_CREDIT",`loan:${id}`,{borrowerId:loan.borrower_id});
  await env.DB.prepare(`UPDATE casino_loans SET status='REPAID',repaid_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(id).run();
  return {loanId:id,status:"REPAID",balance:debit.balance};
}

async function requestAdminHelp(env,player){
  const fresh=await loadUser(env,player.telegram_id),balance=Number(fresh.balance||0);
  if(balance>=0)throw new Error("NO_NEGATIVE_BALANCE");
  const existing=await env.DB.prepare(`SELECT id FROM casino_admin_help_requests WHERE telegram_id=?1 AND status='PENDING' LIMIT 1`)
    .bind(String(player.telegram_id)).first();
  if(existing)return {requestId:existing.id,status:"PENDING"};
  const id=crypto.randomUUID(),amount=Math.abs(balance),now=Date.now();
  await env.DB.prepare(`INSERT INTO casino_admin_help_requests(id,telegram_id,amount,status,created_ms)
    VALUES(?1,?2,?3,'PENDING',?4)`).bind(id,String(player.telegram_id),amount,now).run();
  return {requestId:id,status:"PENDING",amount};
}

function normalizeLoan(l){
  return {
    id:l.id,borrowerId:String(l.borrower_id),lenderId:String(l.lender_id),
    borrowerName:l.borrower_name||"Игрок",borrowerUsername:l.borrower_username||null,
    lenderName:l.lender_name||"Игрок",lenderUsername:l.lender_username||null,
    principal:Number(l.principal),repayment:Number(l.repayment_amount),status:l.status,
    dueMs:l.due_ms==null?null:Number(l.due_ms),createdMs:Number(l.created_ms)
  };
}

/* -------------------- ADMIN -------------------- */

async function adminUsers(env,player){
  requireAdmin(player);
  const rows=(await env.DB.prepare(`SELECT telegram_id,username,first_name,last_name,balance,role,is_banned,created_at
    FROM casino_users ORDER BY created_at DESC LIMIT 200`).all()).results||[];
  return {users:rows.map(publicUser)};
}

async function adminAdjust(env,player,body){
  requireAdmin(player);
  const id=String(body.telegramId||""),delta=Math.trunc(Number(body.delta));
  if(!id||!Number.isFinite(delta)||delta===0)throw new Error("BAD_ADJUSTMENT");
  await loadUser(env,id);
  const r=await forceChangeBalance(env,id,delta,"ADMIN_ADJUST",crypto.randomUUID(),{admin:String(player.telegram_id),requested:delta});
  return {telegramId:id,balance:r.balance,applied:delta};
}

async function adminStats(env,player){
  requireAdmin(player);
  const totals=await env.DB.prepare(`SELECT COUNT(*) players,COALESCE(SUM(balance),0) chips FROM casino_users`).first();
  const games=(await env.DB.prepare(`SELECT game_id,rounds,wagered,paid,
    CASE WHEN wagered>0 THEN ROUND(paid*100.0/wagered,2) ELSE 0 END rtp
    FROM casino_game_totals ORDER BY wagered DESC`).all()).results||[];
  const social=await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM casino_bet_markets WHERE status='PENDING') pending_bets,
    (SELECT COUNT(*) FROM casino_bet_markets WHERE status='OPEN') open_bets,
    (SELECT COUNT(*) FROM casino_admin_help_requests WHERE status='PENDING') aid_requests,
    (SELECT COUNT(*) FROM casino_loans WHERE status='ACTIVE') active_loans`).first();
  return {totals,games,jackpot:await jackpotValue(env),social,market:await getMarketSummary(env)};
}

async function adminSocial(env,player){
  requireAdmin(player);
  await syncOverdueLoans(env);
  const markets=(await env.DB.prepare(`SELECT m.*,u.first_name creator_name,u.username creator_username
    FROM casino_bet_markets m LEFT JOIN casino_users u ON u.telegram_id=m.creator_id
    WHERE m.status IN ('PENDING','OPEN') ORDER BY CASE m.status WHEN 'PENDING' THEN 0 ELSE 1 END,m.created_at DESC LIMIT 80`).all()).results||[];
  const aid=(await env.DB.prepare(`SELECT a.*,u.first_name,u.last_name,u.username,u.balance
    FROM casino_admin_help_requests a JOIN casino_users u ON u.telegram_id=a.telegram_id
    WHERE a.status='PENDING' ORDER BY a.created_ms ASC LIMIT 50`).all()).results||[];
  return {
    markets:await enrichBetMarkets(env,markets,player.telegram_id),
    aid:aid.map(x=>({id:x.id,telegramId:String(x.telegram_id),amount:Number(x.amount),name:`${x.first_name||"Игрок"} ${x.last_name||""}`.trim(),username:x.username||null,balance:Number(x.balance||0),createdMs:Number(x.created_ms)}))
  };
}

async function adminAidAction(env,admin,body){
  requireAdmin(admin);
  const id=String(body.requestId||""),action=String(body.action||"").toUpperCase();
  const req=await env.DB.prepare(`SELECT * FROM casino_admin_help_requests WHERE id=?1 AND status='PENDING' LIMIT 1`).bind(id).first();
  if(!req)throw new Error("AID_NOT_FOUND");
  if(action==="REJECT"){
    await env.DB.prepare(`UPDATE casino_admin_help_requests SET status='REJECTED',resolved_at=CURRENT_TIMESTAMP,admin_id=?2 WHERE id=?1`)
      .bind(id,String(admin.telegram_id)).run();
    return {requestId:id,status:"REJECTED"};
  }
  if(action!=="APPROVE")throw new Error("BAD_ADMIN_ACTION");
  const user=await loadUser(env,req.telegram_id),needed=Math.max(0,-Number(user.balance||0));
  let balance=Number(user.balance||0);
  if(needed>0)balance=(await changeBalance(env,req.telegram_id,needed,"ADMIN_DEBT_RESCUE",`aid:${id}`,{admin:String(admin.telegram_id)})).balance;
  await env.DB.prepare(`UPDATE casino_admin_help_requests SET status='APPROVED',amount=?2,resolved_at=CURRENT_TIMESTAMP,admin_id=?3 WHERE id=?1`)
    .bind(id,needed,String(admin.telegram_id)).run();
  return {requestId:id,status:"APPROVED",amount:needed,balance};
}

/* -------------------- DAILY / BALANCE / STATS -------------------- */

async function dailyStatus(env,id){
  const row=await env.DB.prepare(`SELECT streak,last_claim_at FROM casino_daily WHERE telegram_id=?1`).bind(String(id)).first();
  const last=row?.last_claim_at?Date.parse(row.last_claim_at+(/Z|[+-]\d\d/.test(row.last_claim_at)?"":"Z")):0;
  const claimable=!last||Date.now()-last>=20*60*60*1000;
  return {claimable,streak:Number(row?.streak||0),amount:DAILY_BONUS,lastClaimAt:row?.last_claim_at||null};
}

async function claimDaily(env,player){
  const status=await dailyStatus(env,player.telegram_id);
  if(!status.claimable)throw new Error("DAILY_NOT_READY");
  const now=new Date().toISOString(),streak=Math.min(30,status.streak+1);
  const amount=DAILY_BONUS+Math.min(250_000,(streak-1)*10_000);
  const r=await changeBalance(env,player.telegram_id,amount,"DAILY_BONUS",crypto.randomUUID(),{streak});
  await env.DB.prepare(`INSERT INTO casino_daily(telegram_id,streak,last_claim_at,updated_at)
    VALUES(?1,?2,?3,CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_id) DO UPDATE SET streak=excluded.streak,last_claim_at=excluded.last_claim_at,updated_at=CURRENT_TIMESTAMP`)
    .bind(String(player.telegram_id),streak,now).run();
  return {balance:r.balance,daily:{claimable:false,streak,amount,lastClaimAt:now}};
}

async function changeBalance(env,id,delta,type,roundId,meta){
  id=String(id);delta=Math.floor(Number(delta));
  const before=await env.DB.prepare(`SELECT balance FROM casino_users WHERE telegram_id=?1`).bind(id).first();
  if(!before)throw new Error("PLAYER_NOT_FOUND");
  const old=Number(before.balance||0);
  if(delta<0&&(old<0||old<-delta))throw new Error("INSUFFICIENT_FUNDS");
  const next=old+delta;
  await env.DB.batch([
    env.DB.prepare(`UPDATE casino_users SET balance=?2,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?1`).bind(id,next),
    env.DB.prepare(`INSERT INTO casino_ledger(telegram_id,type,amount,balance_before,balance_after,round_id,metadata)
      VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(id,type,delta,old,next,roundId||null,JSON.stringify(meta||{}))
  ]);
  return {balance:next,delta};
}

async function forceChangeBalance(env,id,delta,type,roundId,meta){
  id=String(id);delta=Math.floor(Number(delta));
  const before=await env.DB.prepare(`SELECT balance FROM casino_users WHERE telegram_id=?1`).bind(id).first();
  if(!before)throw new Error("PLAYER_NOT_FOUND");
  const old=Number(before.balance||0),next=old+delta;
  await env.DB.batch([
    env.DB.prepare(`UPDATE casino_users SET balance=?2,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?1`).bind(id,next),
    env.DB.prepare(`INSERT INTO casino_ledger(telegram_id,type,amount,balance_before,balance_after,round_id,metadata)
      VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(id,type,delta,old,next,roundId||null,JSON.stringify(meta||{}))
  ]);
  return {balance:next,delta};
}

async function recordRound(env,id,gameId,bet,payout,roundId,result){
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO casino_rounds(round_id,telegram_id,game_id,bet,payout,multiplier,result_json)
      VALUES(?1,?2,?3,?4,?5,?6,?7)`)
      .bind(roundId,String(id),gameId,bet,payout,round2(payout/Math.max(1,bet)),JSON.stringify(result)),
    env.DB.prepare(`INSERT INTO casino_game_totals(game_id,rounds,wagered,paid) VALUES(?1,1,?2,?3)
      ON CONFLICT(game_id) DO UPDATE SET rounds=rounds+1,wagered=wagered+excluded.wagered,
      paid=paid+excluded.paid,updated_at=CURRENT_TIMESTAMP`).bind(gameId,bet,payout)
  ]);
}

async function cachedResponse(env,key){
  const r=await env.DB.prepare(`SELECT response_json FROM casino_request_cache WHERE request_key=?1 LIMIT 1`).bind(key).first();
  if(!r?.response_json)return null;
  try{return JSON.parse(r.response_json);}catch{return null;}
}

async function cacheResponse(env,key,id,response){
  await env.DB.prepare(`INSERT OR IGNORE INTO casino_request_cache(request_key,telegram_id,response_json) VALUES(?1,?2,?3)`)
    .bind(key,String(id),JSON.stringify(response)).run();
}

async function jackpotValue(env){
  const row=await env.DB.prepare(`SELECT value FROM casino_meta WHERE key='grand_jackpot'`).first();
  return Number(row?.value||50_000_000);
}

async function addJackpot(env,amount){
  await env.DB.prepare(`INSERT INTO casino_meta(key,value) VALUES('grand_jackpot',?1)
    ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+?1 AS TEXT)`)
    .bind(Math.max(0,Math.floor(amount))).run();
}

async function socialCounts(env,id){
  const r=await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM casino_bet_markets WHERE status='OPEN') open_bets,
    (SELECT COUNT(*) FROM casino_loans WHERE (borrower_id=?1 OR lender_id=?1) AND status IN ('REQUESTED','ACTIVE')) loans,
    (SELECT COUNT(*) FROM casino_trading_positions WHERE telegram_id=?1 AND status='OPEN') trades`).bind(String(id)).first();
  return {openBets:Number(r?.open_bets||0),loans:Number(r?.loans||0),trades:Number(r?.trades||0)};
}

/* -------------------- VALIDATION -------------------- */

function requireAdmin(p){if(p.role!=="ADMIN")throw new Error("ADMIN_ONLY");}

function validateBet(v){
  const n=Math.floor(Number(v));
  if(!Number.isFinite(n)||n<MIN_BET)throw new Error("MIN_BET_1000");
  if(n>MAX_BET)throw new Error("MAX_BET_5M");
  return n;
}

function validateLoanAmount(v){
  const n=Math.floor(Number(v));
  if(!Number.isFinite(n)||n<MIN_BET)throw new Error("MIN_LOAN_1000");
  if(n>LOAN_MAX)throw new Error("MAX_LOAN_50M");
  return n;
}

function validateRequestId(v){
  const s=String(v||"");
  if(!/^[a-zA-Z0-9:_-]{8,100}$/.test(s))throw new Error("BAD_REQUEST_ID");
  return s;
}

function normalizeOutcomes(value){
  if(!Array.isArray(value))throw new Error("BAD_OUTCOMES");
  const out=value.map(x=>cleanText(x,1,40,"BAD_OUTCOME")).filter(Boolean);
  const unique=[...new Set(out.map(x=>x.toLocaleLowerCase("ru-RU")))];
  if(out.length<2||out.length>6||unique.length!==out.length)throw new Error("BAD_OUTCOMES");
  return out;
}

function cleanText(v,min,max,error){
  const s=String(v??"").replace(/\s+/g," ").trim();
  if(s.length<min||s.length>max)throw new Error(error);
  return s;
}

function parseJson(v,fallback){try{return JSON.parse(v);}catch{return fallback;}}
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function round2(n){return Math.floor(Number(n||0)*100)/100;}
function round4(n){return Math.round(Number(n||0)*10000)/10000;}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
