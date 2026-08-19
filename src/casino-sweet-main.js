import baseWorker from "./casino-main.js";
import {validateTelegramInitData} from "./auth.js";
import {SWEET_BURST_CONFIG,createSweetBurstResult} from "./games/sweet-burst.js";

const BUILD="2026-08-20-sweet-bonanza-v1";
const START_BALANCE=10_000_000;
const MIN_BET=1_000;
const MAX_BET=5_000_000;

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/__fit_version")return json({ok:true,build:BUILD});
    if(request.method==="GET"&&url.pathname==="/assets/assets.manifest.json")return sweetManifest(request,env);
    if(request.method==="GET"&&url.pathname==="/casino-app.js")return sweetCasinoApp(request,env);
    if(request.method==="POST"&&url.pathname==="/api/bootstrap")return sweetBootstrap(request,env);
    if(request.method==="POST"&&url.pathname==="/api/slot/spin"){
      let body;try{body=await request.clone().json();}catch{return baseWorker.fetch(request,env);}
      if(String(body?.gameId||"")===SWEET_BURST_CONFIG.id)return sweetSpin(request,env,body);
    }
    const res=await baseWorker.fetch(request,env);
    try{
      const headers=new Headers(res.headers);headers.set("x-fit-build",BUILD);
      return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
    }catch{return res;}
  }
};

async function sweetManifest(request,env){
  const res=await env.ASSETS.fetch(request);
  if(!res.ok)return res;
  const data=await res.json();
  data.version=Math.max(6,Number(data.version||0)+1);
  data.games=data.games||{};
  data.games[SWEET_BURST_CONFIG.id]={
    config:"/assets/games/sweet-burst/config.json",
    atlas:"/assets/games/sweet-burst/atlas/symbols.json",
    background:"/assets/games/sweet-burst/background.svg",
    bonusBackground:"/assets/games/sweet-burst/bonus-background.svg",
    cover:"/assets/game-covers/sweet-burst.svg"
  };
  return json(data);
}

async function sweetCasinoApp(request,env){
  const res=await env.ASSETS.fetch(request);
  if(!res.ok)return res;
  const src=await res.text();
  const patched=src.replace('./game/core/GameEngine.js','./game/core/GameEngineSweet.js');
  return new Response(patched,{status:200,headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store"}});
}
async function sweetBootstrap(request,env){
  const res=await baseWorker.fetch(request,env);
  let data;try{data=await res.clone().json();}catch{return res;}
  if(!res.ok||data?.ok===false)return res;
  const slots=Array.isArray(data.slots)?data.slots.slice():[];
  if(!slots.some(s=>s?.id===SWEET_BURST_CONFIG.id))slots.push({
    id:SWEET_BURST_CONFIG.id,name:SWEET_BURST_CONFIG.name,rows:SWEET_BURST_CONFIG.rows,cols:SWEET_BURST_CONFIG.reels,
    mechanic:SWEET_BURST_CONFIG.mechanic,feature:SWEET_BURST_CONFIG.feature,bonusBuy:false,maxWin:SWEET_BURST_CONFIG.maxWin,
    cover:"/assets/game-covers/sweet-burst.svg",badge:"SWEET"
  });
  return json({...data,slots});
}

async function sweetSpin(request,env,body){
  const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);
  if(!auth.ok)return json({ok:false,error:auth.error},401);
  try{
    const player=await ensureUser(env,auth.user),bet=validateBet(body.bet),requestId=validateRequestId(body.requestId);
    const cacheKey=`spin:${player.telegram_id}:${requestId}`,cached=await cachedResponse(env,cacheKey);
    if(cached)return json({ok:true,...cached,duplicate:true});
    const outcome=createSweetBurstResult(bet),roundId=crypto.randomUUID(),payout=Math.max(0,Math.floor(outcome.payout));
    const debit=await changeBalance(env,player.telegram_id,-bet,"SLOT_BET",roundId,{gameId:SWEET_BURST_CONFIG.id,bet,requestId});
    let balance=debit.balance;
    if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,"SLOT_PAYOUT",roundId,{gameId:SWEET_BURST_CONFIG.id,bet,payout,requestId})).balance;
    await recordRound(env,player.telegram_id,SWEET_BURST_CONFIG.id,bet,payout,roundId,outcome);
    await addJackpot(env,Math.max(1,Math.floor(bet*.002)));
    await syncMarketIndex(env);
    const response={spinId:roundId,roundId,gameId:SWEET_BURST_CONFIG.id,bet,payout,balance,multiplier:round2(payout/bet),
      maxWin:bet*SWEET_BURST_CONFIG.maxWin,result:outcome};
    await cacheResponse(env,cacheKey,player.telegram_id,response);
    return json({ok:true,...response});
  }catch(error){
    console.error("sweet_bonanza",error);
    return json({ok:false,error:String(error?.message||"SERVER_ERROR")},400);
  }
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
  const row=await env.DB.prepare(`SELECT * FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(id).first();
  if(!row)throw new Error("PLAYER_NOT_FOUND");
  if(Number(row.is_banned||0))throw new Error("PLAYER_BANNED");
  return row;
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

async function addJackpot(env,amount){
  await env.DB.prepare(`INSERT INTO casino_meta(key,value) VALUES('grand_jackpot',?1)
    ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+?1 AS TEXT)`)
    .bind(Math.max(0,Math.floor(amount))).run();
}

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
  const maxId=Number(agg?.max_id||last);if(maxId<=last)return Number(state.price||1000);
  const wagered=Number(agg?.wagered||0),houseNet=Number(agg?.house_net||0),ratio=wagered>0?houseNet/wagered:0;
  const impact=Math.max(-.03,Math.min(.03,ratio*.018)),next=Math.max(10,round4(Number(state.price||1000)*(1+impact))),now=Date.now();
  await env.DB.batch([
    env.DB.prepare(`UPDATE casino_market_state SET price=?1,last_round_rowid=?2,updated_at=CURRENT_TIMESTAMP WHERE id=1`).bind(next,maxId),
    env.DB.prepare(`INSERT INTO casino_market_points(price,house_net,wagered,created_ms) VALUES(?1,?2,?3,?4)`).bind(next,Math.floor(houseNet),Math.floor(wagered),now)
  ]);
  return next;
}

async function cachedResponse(env,key){
  const r=await env.DB.prepare(`SELECT response_json FROM casino_request_cache WHERE request_key=?1 LIMIT 1`).bind(key).first();
  if(!r?.response_json)return null;try{return JSON.parse(r.response_json);}catch{return null;}
}
async function cacheResponse(env,key,id,response){
  await env.DB.prepare(`INSERT OR IGNORE INTO casino_request_cache(request_key,telegram_id,response_json) VALUES(?1,?2,?3)`)
    .bind(key,String(id),JSON.stringify(response)).run();
}
function validateBet(v){const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<MIN_BET)throw new Error("MIN_BET_1000");if(n>MAX_BET)throw new Error("MAX_BET_5M");return n;}
function validateRequestId(v){const s=String(v||"");if(!/^[a-zA-Z0-9:_-]{8,100}$/.test(s))throw new Error("BAD_REQUEST_ID");return s;}
function round2(n){return Math.floor(Number(n||0)*100)/100;}
function round4(n){return Math.round(Number(n||0)*10000)/10000;}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
