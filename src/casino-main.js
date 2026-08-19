import {validateTelegramInitData} from "./auth.js";
import {AUREUS_CONFIG,createAureusResult,createAureusBonusBuyResult} from "./games/aureus.js";
import {HONEY_FRUITS_CONFIG,createHoneyFruitsResult} from "./games/honey-fruits.js";
import {LUCKY_COIN_CONFIG,createLuckyCoinResult} from "./games/lucky-coin-collector.js";

const BUILD="2026-08-19-casino-engine-v4-lucky-coin";
const START_BALANCE=10_000_000;
const MIN_BET=1_000;
const MAX_BET=5_000_000;
const DAILY_BONUS=250_000;

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/__fit_version")return json({ok:true,build:BUILD});
    if(url.pathname.startsWith("/api/"))return api(request,env,url);
    const res=await env.ASSETS.fetch(request);const headers=new Headers(res.headers);headers.set("cache-control","no-store, no-cache, must-revalidate, max-age=0");headers.set("x-fit-build",BUILD);return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
  }
};

async function api(request,env,url){
  if(request.method!=="POST")return json({ok:false,error:"POST_REQUIRED"},405);
  let body;try{body=await request.json();}catch{return json({ok:false,error:"BAD_JSON"},400)}
  const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);if(!auth.ok)return json({ok:false,error:auth.error},401);
  try{
    const player=await ensureUser(env,auth.user);
    if(url.pathname==="/api/bootstrap")return json({ok:true,...await bootstrap(env,player)});
    if(url.pathname==="/api/slot/spin")return json({ok:true,...await playSlotRound(env,player,body)});
    if(url.pathname==="/api/slot/bonus-buy")return json({ok:true,...await playBonusBuy(env,player,body)});
    if(url.pathname==="/api/game/play")return json({ok:true,...await playClassicGame(env,player,body)});
    if(url.pathname==="/api/daily/claim")return json({ok:true,...await claimDaily(env,player)});
    if(url.pathname==="/api/admin/users")return json({ok:true,...await adminUsers(env,player)});
    if(url.pathname==="/api/admin/adjust")return json({ok:true,...await adminAdjust(env,player,body)});
    if(url.pathname==="/api/admin/stats")return json({ok:true,...await adminStats(env,player)});
    return json({ok:false,error:"NOT_FOUND"},404);
  }catch(error){console.error(url.pathname,error);return json({ok:false,error:String(error?.message||"SERVER_ERROR")},400)}
}

async function bootstrap(env,player){
  const profile=await profileFor(env,player),daily=await dailyStatus(env,player.telegram_id),jackpot=await jackpotValue(env);
  return {player:profile,slots:[
    {id:AUREUS_CONFIG.id,name:AUREUS_CONFIG.name,rows:AUREUS_CONFIG.rows,cols:AUREUS_CONFIG.reels,mechanic:AUREUS_CONFIG.mechanic,feature:AUREUS_CONFIG.feature,bonusBuy:true,maxWin:AUREUS_CONFIG.maxWin,cover:"/assets/game-covers/aureus.svg",badge:"FEATURED"},
    {id:HONEY_FRUITS_CONFIG.id,name:HONEY_FRUITS_CONFIG.name,rows:HONEY_FRUITS_CONFIG.rows,cols:HONEY_FRUITS_CONFIG.reels,mechanic:HONEY_FRUITS_CONFIG.mechanic,feature:HONEY_FRUITS_CONFIG.feature,bonusBuy:false,maxWin:HONEY_FRUITS_CONFIG.maxWin,cover:"/assets/game-covers/honey-fruits.svg",badge:"NEW"},
    {id:LUCKY_COIN_CONFIG.id,name:LUCKY_COIN_CONFIG.name,rows:LUCKY_COIN_CONFIG.rows,cols:LUCKY_COIN_CONFIG.reels,mechanic:LUCKY_COIN_CONFIG.mechanic,feature:LUCKY_COIN_CONFIG.feature,bonusBuy:false,maxWin:LUCKY_COIN_CONFIG.maxWin,cover:"/assets/game-covers/lucky-coin-collector.svg",badge:"NEW"}
  ],daily,jackpot};
}

async function ensureUser(env,tg){
  const id=String(tg.id),username=tg.username||null,first=tg.first_name||"Игрок",last=tg.last_name||null;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO casino_users(telegram_id,username,first_name,last_name,balance,role) VALUES(?1,?2,?3,?4,?5,'PLAYER') ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,updated_at=CURRENT_TIMESTAMP`).bind(id,username,first,last,START_BALANCE),
    env.DB.prepare(`INSERT OR IGNORE INTO casino_meta(key,value) VALUES('admin_telegram_id',?1)`).bind(id),
    env.DB.prepare(`INSERT OR IGNORE INTO casino_daily(telegram_id,streak) VALUES(?1,0)`).bind(id)
  ]);
  await env.DB.prepare(`UPDATE casino_users SET role='ADMIN' WHERE telegram_id=(SELECT value FROM casino_meta WHERE key='admin_telegram_id')`).run();
  const row=await env.DB.prepare(`SELECT * FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(id).first();if(!row)throw new Error("PLAYER_NOT_FOUND");if(Number(row.is_banned||0))throw new Error("PLAYER_BANNED");return row;
}

async function profileFor(env,p){
  const stats=await env.DB.prepare(`SELECT COALESCE(SUM(bet),0) wagered,COUNT(*) rounds,COALESCE(MAX(payout),0) biggest_win FROM casino_rounds WHERE telegram_id=?1`).bind(String(p.telegram_id)).first();
  const wagered=Number(stats?.wagered||0),step=25_000_000,level=Math.min(20,1+Math.floor(wagered/step)),within=wagered%step;
  return {...publicUser(p),vip:{level,progress:Math.floor(within/step*100),wagered},rounds:Number(stats?.rounds||0),biggestWin:Number(stats?.biggest_win||0)};
}
function publicUser(p){return {telegramId:String(p.telegram_id),username:p.username,firstName:p.first_name,lastName:p.last_name,balance:Number(p.balance||0),role:p.role||"PLAYER",isAdmin:p.role==="ADMIN",createdAt:p.created_at};}

async function playSlotRound(env,player,body){
  const gameId=String(body.gameId||""),bet=validateBet(body.bet),requestId=validateRequestId(body.requestId),cacheKey=`spin:${player.telegram_id}:${requestId}`;const cached=await cachedResponse(env,cacheKey);if(cached)return {...cached,duplicate:true};
  let outcome,maxWin;if(gameId===AUREUS_CONFIG.id){outcome=createAureusResult(bet);maxWin=AUREUS_CONFIG.maxWin;}else if(gameId===HONEY_FRUITS_CONFIG.id){outcome=createHoneyFruitsResult(bet);maxWin=HONEY_FRUITS_CONFIG.maxWin;}else if(gameId===LUCKY_COIN_CONFIG.id){outcome=createLuckyCoinResult(bet);maxWin=LUCKY_COIN_CONFIG.maxWin;}else throw new Error("SLOT_NOT_READY");
  const roundId=crypto.randomUUID(),payout=Math.max(0,Math.floor(outcome.payout));const d=await changeBalance(env,player.telegram_id,-bet,"SLOT_BET",roundId,{gameId,bet,requestId});let balance=d.balance;if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,"SLOT_PAYOUT",roundId,{gameId,bet,payout,requestId})).balance;
  await recordRound(env,player.telegram_id,gameId,bet,payout,roundId,outcome);await addJackpot(env,Math.max(1,Math.floor(bet*.002)));
  const response={spinId:roundId,roundId,gameId,bet,payout,balance,multiplier:round2(payout/bet),maxWin:bet*maxWin,result:outcome};await cacheResponse(env,cacheKey,player.telegram_id,response);return response;
}

async function playBonusBuy(env,player,body){
  const gameId=String(body.gameId||"");if(gameId!==AUREUS_CONFIG.id)throw new Error("BONUS_BUY_NOT_READY");const bet=validateBet(body.bet),tier=String(body.tier||"standard"),tierDef=tier==="super"?{cost:180}:tier==="premium"?{cost:100}:{cost:60},cost=bet*tierDef.cost,requestId=validateRequestId(body.requestId),cacheKey=`buy:${player.telegram_id}:${requestId}`;const cached=await cachedResponse(env,cacheKey);if(cached)return {...cached,duplicate:true};
  const roundId=crypto.randomUUID(),outcome=createAureusBonusBuyResult(bet,tier),payout=Math.max(0,Math.floor(outcome.payout));const d=await changeBalance(env,player.telegram_id,-cost,"BONUS_BUY",roundId,{gameId,bet,tier,cost,requestId});let balance=d.balance;if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,"BONUS_BUY_PAYOUT",roundId,{gameId,bet,tier,payout,requestId})).balance;
  await recordRound(env,player.telegram_id,`${gameId}:bonus:${tier}`,cost,payout,roundId,outcome);await addJackpot(env,Math.max(1,Math.floor(cost*.001)));
  const response={spinId:roundId,roundId,gameId,bet,cost,tier,payout,balance,multiplier:round2(payout/bet),maxWin:bet*AUREUS_CONFIG.maxWin,result:outcome};await cacheResponse(env,cacheKey,player.telegram_id,response);return response;
}

async function playClassicGame(env,player,body){
  const gameId=String(body.gameId||""),bet=validateBet(body.bet),requestId=validateRequestId(body.requestId),cacheKey=`classic:${player.telegram_id}:${requestId}`;const cached=await cachedResponse(env,cacheKey);if(cached)return {...cached,duplicate:true};const roundId=crypto.randomUUID();
  const d=await changeBalance(env,player.telegram_id,-bet,"GAME_BET",roundId,{gameId,bet,requestId});let payout=0,result={};
  if(gameId==="roulette"){const n=secureInt(37),choice=String(body.choice||"red"),red=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]),won=choice==="number"?n===Number(body.number):choice==="red"?red.has(n):choice==="black"?n!==0&&!red.has(n):choice==="even"?n!==0&&n%2===0:n!==0&&n%2===1;payout=won?Math.floor(bet*(choice==="number"?36:2)):0;result={number:n,color:n===0?"green":red.has(n)?"red":"black",won};}
  else if(gameId==="dice"){const roll=1+secureInt(100),choice=String(body.choice||"over"),won=choice==="over"?roll>50:roll<=50;payout=won?Math.floor(bet*1.96):0;result={roll,choice,won};}
  else if(gameId==="coinflip"){const side=secureInt(2)?"heads":"tails",choice=String(body.choice||"heads"),won=side===choice;payout=won?Math.floor(bet*1.96):0;result={side,choice,won};}
  else if(gameId==="plinko"){const mults=[8,3,1.5,.6,.25,.6,1.5,3,8],weights=[1,4,10,22,30,22,10,4,1],bucket=weightedIndex(weights),mult=mults[bucket];payout=Math.floor(bet*mult);result={bucket,multiplier:mult,path:Array.from({length:10},()=>secureInt(2))};}
  else if(gameId==="blackjack"){const deck=shuffleCards(),p=[deck.pop(),deck.pop()],dealer=[deck.pop(),deck.pop()];while(score(p)<16)p.push(deck.pop());while(score(dealer)<17)dealer.push(deck.pop());const ps=score(p),ds=score(dealer),blackjack=ps===21&&p.length===2,won=ps<=21&&(ds>21||ps>ds),push=ps<=21&&ps===ds;payout=blackjack?Math.floor(bet*2.5):won?bet*2:push?bet:0;result={player:p,dealer,playerScore:ps,dealerScore:ds,blackjack,won,push};}
  else if(gameId==="baccarat"){const p=secureInt(10),b=secureInt(10),choice=String(body.choice||"player"),winner=p===b?"tie":p>b?"player":"banker",won=choice===winner;payout=won?Math.floor(bet*(winner==="tie"?8:1.95)):0;result={player:p,banker:b,winner,won};}
  else throw new Error("GAME_NOT_FOUND");
  let balance=d.balance;if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,"GAME_PAYOUT",roundId,{gameId,bet,payout,requestId})).balance;await recordRound(env,player.telegram_id,gameId,bet,payout,roundId,result);await addJackpot(env,Math.max(1,Math.floor(bet*.001)));const response={roundId,gameId,bet,payout,balance,multiplier:round2(payout/bet),result};await cacheResponse(env,cacheKey,player.telegram_id,response);return response;
}

async function dailyStatus(env,id){const row=await env.DB.prepare(`SELECT streak,last_claim_at FROM casino_daily WHERE telegram_id=?1`).bind(String(id)).first();const last=row?.last_claim_at?Date.parse(row.last_claim_at+(/Z|[+-]\d\d/.test(row.last_claim_at)?"":"Z")):0,claimable=!last||Date.now()-last>=20*60*60*1000;return {claimable,streak:Number(row?.streak||0),amount:DAILY_BONUS,lastClaimAt:row?.last_claim_at||null};}
async function claimDaily(env,player){const status=await dailyStatus(env,player.telegram_id);if(!status.claimable)throw new Error("DAILY_NOT_READY");const now=new Date().toISOString(),streak=Math.min(30,status.streak+1),amount=DAILY_BONUS+Math.min(250_000,(streak-1)*10_000),r=await changeBalance(env,player.telegram_id,amount,"DAILY_BONUS",crypto.randomUUID(),{streak});await env.DB.prepare(`INSERT INTO casino_daily(telegram_id,streak,last_claim_at,updated_at) VALUES(?1,?2,?3,CURRENT_TIMESTAMP) ON CONFLICT(telegram_id) DO UPDATE SET streak=excluded.streak,last_claim_at=excluded.last_claim_at,updated_at=CURRENT_TIMESTAMP`).bind(String(player.telegram_id),streak,now).run();return {balance:r.balance,daily:{claimable:false,streak,amount,lastClaimAt:now}};}

async function changeBalance(env,id,delta,type,roundId,meta){id=String(id);delta=Math.floor(Number(delta));const before=await env.DB.prepare(`SELECT balance FROM casino_users WHERE telegram_id=?1`).bind(id).first();if(!before)throw new Error("PLAYER_NOT_FOUND");const old=Number(before.balance||0);if(delta<0&&old<-delta)throw new Error("INSUFFICIENT_FUNDS");const next=Math.max(0,old+delta);await env.DB.batch([env.DB.prepare(`UPDATE casino_users SET balance=?2,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?1`).bind(id,next),env.DB.prepare(`INSERT INTO casino_ledger(telegram_id,type,amount,balance_before,balance_after,round_id,metadata) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(id,type,delta,old,next,roundId||null,JSON.stringify(meta||{}))]);return {balance:next,delta};}
async function recordRound(env,id,gameId,bet,payout,roundId,result){await env.DB.batch([env.DB.prepare(`INSERT INTO casino_rounds(round_id,telegram_id,game_id,bet,payout,multiplier,result_json) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(roundId,String(id),gameId,bet,payout,round2(payout/Math.max(1,bet)),JSON.stringify(result)),env.DB.prepare(`INSERT INTO casino_game_totals(game_id,rounds,wagered,paid) VALUES(?1,1,?2,?3) ON CONFLICT(game_id) DO UPDATE SET rounds=rounds+1,wagered=wagered+excluded.wagered,paid=paid+excluded.paid,updated_at=CURRENT_TIMESTAMP`).bind(gameId,bet,payout)]);}
async function cachedResponse(env,key){const r=await env.DB.prepare(`SELECT response_json FROM casino_request_cache WHERE request_key=?1 LIMIT 1`).bind(key).first();if(!r?.response_json)return null;try{return JSON.parse(r.response_json);}catch{return null;}}
async function cacheResponse(env,key,id,response){await env.DB.prepare(`INSERT OR IGNORE INTO casino_request_cache(request_key,telegram_id,response_json) VALUES(?1,?2,?3)`).bind(key,String(id),JSON.stringify(response)).run();}
async function jackpotValue(env){const row=await env.DB.prepare(`SELECT value FROM casino_meta WHERE key='grand_jackpot'`).first();return Number(row?.value||50_000_000);}
async function addJackpot(env,amount){await env.DB.prepare(`INSERT INTO casino_meta(key,value) VALUES('grand_jackpot',?1) ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+?1 AS TEXT)`).bind(Math.max(0,Math.floor(amount))).run();}

async function adminUsers(env,player){requireAdmin(player);const rows=(await env.DB.prepare(`SELECT telegram_id,username,first_name,last_name,balance,role,is_banned,created_at FROM casino_users ORDER BY created_at DESC LIMIT 200`).all()).results||[];return {users:rows.map(publicUser)};}
async function adminAdjust(env,player,body){requireAdmin(player);const id=String(body.telegramId||""),delta=Math.trunc(Number(body.delta));if(!id||!Number.isFinite(delta)||delta===0)throw new Error("BAD_ADJUSTMENT");const target=await env.DB.prepare(`SELECT balance FROM casino_users WHERE telegram_id=?1`).bind(id).first();if(!target)throw new Error("PLAYER_NOT_FOUND");let actual=delta;if(delta<0)actual=-Math.min(Math.abs(delta),Number(target.balance||0));const r=await changeBalance(env,id,actual,"ADMIN_ADJUST",crypto.randomUUID(),{admin:String(player.telegram_id),requested:delta});return {telegramId:id,balance:r.balance,applied:actual};}
async function adminStats(env,player){requireAdmin(player);const totals=await env.DB.prepare(`SELECT COUNT(*) players,COALESCE(SUM(balance),0) chips FROM casino_users`).first();const games=(await env.DB.prepare(`SELECT game_id,rounds,wagered,paid,CASE WHEN wagered>0 THEN ROUND(paid*100.0/wagered,2) ELSE 0 END rtp FROM casino_game_totals ORDER BY wagered DESC`).all()).results||[];return {totals,games,jackpot:await jackpotValue(env)};}
function requireAdmin(p){if(p.role!=="ADMIN")throw new Error("ADMIN_ONLY");}

function validateBet(v){const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<MIN_BET)throw new Error("MIN_BET_1000");if(n>MAX_BET)throw new Error("MAX_BET_5M");return n;}
function validateRequestId(v){const s=String(v||"");if(!/^[a-zA-Z0-9:_-]{8,100}$/.test(s))throw new Error("BAD_REQUEST_ID");return s;}
function weightedIndex(weights){const ints=weights.map(x=>Math.max(0,Math.round(Number(x)*100))),total=ints.reduce((a,b)=>a+b,0);let roll=secureInt(Math.max(1,total));for(let i=0;i<ints.length;i++){roll-=ints[i];if(roll<0)return i;}return ints.length-1;}
function secureInt(max){max=Math.max(1,Math.floor(max));const lim=0x100000000-(0x100000000%max),a=new Uint32Array(1);do crypto.getRandomValues(a);while(a[0]>=lim);return a[0]%max;}
function round2(n){return Math.floor(Number(n||0)*100)/100;}
function shuffleCards(){const vals=[2,3,4,5,6,7,8,9,10,10,10,10,11],d=[];for(let s=0;s<4;s++)for(const v of vals)d.push(v);for(let i=d.length-1;i>0;i--){const j=secureInt(i+1);[d[i],d[j]]=[d[j],d[i]];}return d;}
function score(hand){let s=hand.reduce((a,b)=>a+b,0),aces=hand.filter(x=>x===11).length;while(s>21&&aces--){s-=10;}return s;}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
