import signatureWorker from "./casino-signature-main.js";
import {validateTelegramInitData} from "./auth.js";
import {AUREUS_CONFIG,createAureusBonusBuyResult} from "./games/aureus.js";
import {OLYMPUS_STORM_CONFIG,createOlympusStormBonusBuyResult} from "./games/olympus-storm.js";
import {SWEET_BURST_CONFIG,createSweetBurstBonusBuyResult} from "./games/sweet-burst.js";
import {BLACK_HOUND_CONFIG,createBlackHoundBonusBuyResult} from "./games/black-hound-overdrive.js";
import {KOZYR_CONFIG,createKozyrBonusBuyResult} from "./games/kozyr.js";
import {PADAPLELOV_CONFIG,createPadaplelovBonusBuyResult} from "./games/padaplelov.js";

const BUILD="2026-08-20-feature-boost-padaplelov-v6";
const START_BALANCE=10_000_000,MIN_BET=1_000,MAX_BET=5_000_000,BOOST_CANDIDATES=5;
const BUY_IDS=new Set([AUREUS_CONFIG.id,OLYMPUS_STORM_CONFIG.id,SWEET_BURST_CONFIG.id,BLACK_HOUND_CONFIG.id,KOZYR_CONFIG.id,PADAPLELOV_CONFIG.id]);
const SLOT_NAMES={aureus:"AUREUS CASCADE",olympus_storm:"OLYMPUS STORM",sweet_bonanza:"SWEET BONANZA",black_hound_overdrive:"BLACK HOUND: OVERDRIVE",kozyr:"KOZYR",padaplelov:"PADAPLELOV"};
let schemaReady=false;

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/__fit_version")return json({ok:true,build:BUILD});
    if(request.method==="GET"&&url.pathname==="/casino-app.js")return forceSignatureEngine(request,env);
    if(request.method==="POST"){
      let body=null;try{body=await request.clone().json();}catch{}
      if(url.pathname==="/api/tuning/request")return featureTuningRequest(request,env,body);
      if(url.pathname==="/api/slot/bonus-buy"&&body&&BUY_IDS.has(String(body.gameId||""))){
        const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);
        if(!auth.ok)return json({ok:false,error:auth.error},401);
        await ensureSchema(env);
        const active=await env.DB.prepare(`SELECT remaining_uses FROM casino_bonus_boosts WHERE telegram_id=?1 AND game_id=?2 AND remaining_uses>0 LIMIT 1`).bind(String(auth.user.id),String(body.gameId)).first();
        if(active||String(body.gameId)===PADAPLELOV_CONFIG.id)return featureBonusBuy(env,auth.user,body,!!active);
      }
    }
    return withBuild(await signatureWorker.fetch(request,env));
  }
};

async function forceSignatureEngine(request,env){
  const res=await signatureWorker.fetch(request,env);if(!res.ok)return res;let src=await res.text();
  src=src.replace(/from\s+["']\.\/game\/core\/GameEngine(?:Sweet|Hound|Signature)?\.js["']/, 'from "./game/core/GameEngineSignature.js"');
  return new Response(src,{status:res.status,headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});
}

async function featureBonusBuy(env,tg,body,boostRequested){
  try{
    const player=await ensureUser(env,tg),gameId=String(body.gameId||""),bet=validateBet(body.bet),requestId=validateRequestId(body.requestId),spec=bonusSpec(gameId,bet,body.tier);
    const key=`buy:${player.telegram_id}:${requestId}`,cached=await cachedResponse(env,key);if(cached)return json({ok:true,...cached,duplicate:true});
    if(Number(player.balance||0)<spec.cost)throw new Error("INSUFFICIENT_FUNDS");

    let outcome=spec.generate(),boostConsumed=false,featureScoreValue=featureScore(outcome);
    if(boostRequested){
      let best=outcome,bestScore=featureScoreValue;
      for(let i=1;i<BOOST_CANDIDATES;i++){const candidate=spec.generate(),score=featureScore(candidate);if(score>bestScore){best=candidate;bestScore=score;}}
      const claim=await env.DB.prepare(`UPDATE casino_bonus_boosts SET remaining_uses=remaining_uses-1,consumed_at=CURRENT_TIMESTAMP WHERE telegram_id=?1 AND game_id=?2 AND remaining_uses>0`).bind(String(player.telegram_id),gameId).run();
      if(Number(claim?.meta?.changes||0)>0){outcome=best;featureScoreValue=bestScore;boostConsumed=true;outcome.featureBoost={active:true,mode:"FEATURE_RICH",candidates:BOOST_CANDIDATES,score:bestScore};}
    }

    if(gameId===PADAPLELOV_CONFIG.id){
      outcome.bonusTriggered=true;outcome.bonusPurchased=true;outcome.bonusType="NIGHT_TAP";
      if(!outcome.bonus?.frames?.length)throw new Error("PADAPLELOV_BONUS_EMPTY");
    }

    const roundId=crypto.randomUUID(),payout=Math.max(0,Math.min(spec.cap,Math.floor(outcome.payout||0)));
    const debit=await changeBalance(env,player.telegram_id,-spec.cost,"BONUS_BUY",roundId,{gameId,bet,tier:spec.tier,cost:spec.cost,requestId,featureBoost:boostConsumed});let balance=debit.balance;
    if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,"BONUS_BUY_PAYOUT",roundId,{gameId,bet,tier:spec.tier,payout,requestId,featureBoost:boostConsumed})).balance;
    await recordRound(env,player.telegram_id,`${gameId}:bonus:${spec.tier}`,spec.cost,payout,roundId,outcome);await addJackpot(env,Math.max(1,Math.floor(spec.cost*.001)));await syncMarketIndex(env);
    if(boostConsumed)await env.DB.prepare(`INSERT OR IGNORE INTO casino_bonus_boost_applied(round_id,telegram_id,game_id,percent,base_payout,adjusted_payout,delta) VALUES(?1,?2,?3,100,?4,?4,0)`).bind(roundId,String(player.telegram_id),gameId,payout).run();
    const response={spinId:roundId,roundId,gameId,bet,cost:spec.cost,tier:spec.tier,payout,balance,multiplier:round2(payout/bet),maxWin:spec.cap,result:outcome,bonusBoostConsumed:boostConsumed,bonusBoostPercent:boostConsumed?100:0,bonusBoostMode:boostConsumed?"FEATURES":null,bonusBoostRemaining:0,featureBoostScore:boostConsumed?featureScoreValue:0};
    await cacheResponse(env,key,player.telegram_id,response);return json({ok:true,...response});
  }catch(error){console.error("feature_bonus_buy",error);return json({ok:false,error:String(error?.message||"SERVER_ERROR")},400);}
}

function bonusSpec(gameId,bet,tierRaw){
  if(gameId===AUREUS_CONFIG.id){const tier=["standard","premium","super"].includes(String(tierRaw))?String(tierRaw):"standard",m=tier==="super"?180:tier==="premium"?100:60;return {tier,cost:bet*m,cap:bet*AUREUS_CONFIG.maxWin,generate:()=>createAureusBonusBuyResult(bet,tier)};}
  if(gameId===OLYMPUS_STORM_CONFIG.id)return {tier:"storm",cost:bet*OLYMPUS_STORM_CONFIG.bonusBuyCost,cap:bet*OLYMPUS_STORM_CONFIG.maxWinMultiplier,generate:()=>createOlympusStormBonusBuyResult(bet)};
  if(gameId===SWEET_BURST_CONFIG.id)return {tier:"sweet",cost:bet*SWEET_BURST_CONFIG.bonusBuyCost,cap:bet*SWEET_BURST_CONFIG.maxWinMultiplier,generate:()=>createSweetBurstBonusBuyResult(bet)};
  if(gameId===BLACK_HOUND_CONFIG.id){const tier=BLACK_HOUND_CONFIG.bonusTiers[String(tierRaw||"night_pack")]?String(tierRaw||"night_pack"):"night_pack",d=BLACK_HOUND_CONFIG.bonusTiers[tier];return {tier,cost:bet*d.buyCost,cap:bet*BLACK_HOUND_CONFIG.maxWinMultiplier,generate:()=>createBlackHoundBonusBuyResult(bet,tier)};}
  if(gameId===KOZYR_CONFIG.id)return {tier:"black_ink",cost:bet*KOZYR_CONFIG.bonusBuyCost,cap:bet*KOZYR_CONFIG.maxWinMultiplier,generate:()=>createKozyrBonusBuyResult(bet)};
  if(gameId===PADAPLELOV_CONFIG.id)return {tier:"night_tap",cost:bet*PADAPLELOV_CONFIG.bonusBuyCost,cap:bet*PADAPLELOV_CONFIG.maxWinMultiplier,generate:()=>createPadaplelovBonusBuyResult(bet)};
  throw new Error("BONUS_BUY_NOT_READY");
}

function featureScore(outcome){
  const frames=outcome?.bonus?.frames||[];let score=0;
  for(const f of frames){
    score+=Math.max(0,Number(f.scatterCount||0)-1)*6+Number(f.retrigger||0)*15;
    score+=(f.cascades?.length||0)*2.5+(f.newOlympus?.length||0)*18+(f.activeOlympus?.length||0)*2;
    score+=(f.bombPositions?.length||0)*10+Math.min(100,Number(f.bombMultiplier||0))*.15;
    score+=(f.newSticky?.length||0)*18+(f.upgraded?.length||0)*8+(f.chainLinks?.length||0)*10;
    score+=(f.barrelColumns?.length||0)*12+(f.goldKegs?.length||0)*20+(f.beerBarrels?.length||0)*7+Math.min(15,Number(f.foam||0))*.5;
    for(const c of f.cascades||[])score+=(c.inkSplash?.length||0)*10;
  }
  return score;
}

async function featureTuningRequest(request,env,body){
  const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);if(!auth.ok)return json({ok:false,error:auth.error},401);
  const gameId=String(body?.gameId||"");if(!BUY_IDS.has(gameId))return json({ok:false,error:"BONUS_BUY_NOT_AVAILABLE_FOR_SLOT"},400);
  await ensureSchema(env);const userId=String(auth.user.id);
  let row=await env.DB.prepare(`SELECT id FROM casino_tuning_requests WHERE telegram_id=?1 AND game_id=?2 AND status='PENDING' LIMIT 1`).bind(userId,gameId).first(),duplicate=!!row,requestId=row?.id;
  if(!requestId){requestId=crypto.randomUUID();await env.DB.prepare(`INSERT INTO casino_tuning_requests(id,telegram_id,game_id,status) VALUES(?1,?2,?3,'PENDING')`).bind(requestId,userId,gameId).run();}
  let sent=false;if(!duplicate)sent=await sendFeatureApproval(env,auth.user,gameId,requestId);
  return json({ok:true,requestId,status:"PENDING",duplicate,adminNotificationSent:sent,boostPercent:100,boostUses:1,boostMode:"FEATURES"});
}

async function sendFeatureApproval(env,user,gameId,requestId){
  const admin=await adminTelegramId(env),token=String(env.TELEGRAM_BOT_TOKEN||"");if(!admin||!token)return false;
  await ensureWebhook(env);const callbackToken=randomToken();await env.DB.prepare(`INSERT OR REPLACE INTO casino_tuning_callbacks(token,request_id,admin_id,created_at) VALUES(?1,?2,?3,CURRENT_TIMESTAMP)`).bind(callbackToken,requestId,admin).run();
  const name=[user?.first_name,user?.last_name].filter(Boolean).join(" ")||"Игрок",username=user?.username?" @"+user.username:"",slot=SLOT_NAMES[gameId]||gameId;
  const text=`🎰 ЗАПРОС НА ПОДКРУТКУ\n\nИгрок: ${name}${username}\nСлот: ${slot}\nРежим: FEATURE BOOST +100%\n\nСледующая Bonus Buy будет чаще давать Scatter/retrigger/Wild и специальные фишки слота. Итоговая выплата напрямую НЕ умножается.\n\nПодтвердить?`;
  const r=await botCall(env,"sendMessage",{chat_id:admin,text,reply_markup:{inline_keyboard:[[{text:"✅ Подтвердить буст",callback_data:"tb:a:"+callbackToken},{text:"❌ Отклонить",callback_data:"tb:r:"+callbackToken}]]}});
  if(r?.ok&&r.result?.message_id)await env.DB.prepare(`UPDATE casino_tuning_callbacks SET message_id=?2,chat_id=?3 WHERE token=?1`).bind(callbackToken,String(r.result.message_id),admin).run();
  return !!r?.ok;
}
async function adminTelegramId(env){const r=await env.DB.prepare(`SELECT telegram_id FROM casino_users WHERE role='ADMIN' ORDER BY updated_at DESC LIMIT 1`).first();if(r?.telegram_id)return String(r.telegram_id);const m=await env.DB.prepare(`SELECT value FROM casino_meta WHERE key='admin_telegram_id' LIMIT 1`).first();return String(m?.value||"");}
async function ensureWebhook(env){const token=String(env.TELEGRAM_BOT_TOKEN||""),url=String(env.APP_URL||"").replace(/\/$/,"")+"/telegram/tuning-callback";if(!token||!url.startsWith("https://"))return false;const secret=await webhookSecret(env),r=await botCall(env,"setWebhook",{url,secret_token:secret,allowed_updates:["callback_query"],drop_pending_updates:false});return !!r?.ok;}
async function webhookSecret(env){let r=await env.DB.prepare(`SELECT value FROM casino_meta WHERE key='telegram_tuning_webhook_secret' LIMIT 1`).first();if(r?.value)return String(r.value);const v=randomToken()+randomToken();await env.DB.prepare(`INSERT OR IGNORE INTO casino_meta(key,value) VALUES('telegram_tuning_webhook_secret',?1)`).bind(v).run();r=await env.DB.prepare(`SELECT value FROM casino_meta WHERE key='telegram_tuning_webhook_secret' LIMIT 1`).first();return String(r?.value||v);}
async function botCall(env,method,payload){try{const token=String(env.TELEGRAM_BOT_TOKEN||"");if(!token)return null;const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});return await r.json();}catch(e){console.warn("BOT_API",method,e);return null;}}

async function ensureSchema(env){if(schemaReady)return;await env.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_bonus_boosts(telegram_id TEXT NOT NULL,game_id TEXT NOT NULL,percent INTEGER NOT NULL DEFAULT 100,remaining_uses INTEGER NOT NULL DEFAULT 0,activated_by TEXT,activated_at TEXT,consumed_at TEXT,PRIMARY KEY(telegram_id,game_id))`).run();await env.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_bonus_boost_applied(round_id TEXT PRIMARY KEY,telegram_id TEXT NOT NULL,game_id TEXT NOT NULL,percent INTEGER NOT NULL,base_payout INTEGER NOT NULL,adjusted_payout INTEGER NOT NULL,delta INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();await env.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_tuning_requests(id TEXT PRIMARY KEY,telegram_id TEXT NOT NULL,game_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',applied_percent INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,resolved_at TEXT,resolved_by TEXT)`).run();await env.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_tuning_callbacks(token TEXT PRIMARY KEY,request_id TEXT NOT NULL,admin_id TEXT NOT NULL,chat_id TEXT,message_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,resolved_at TEXT)`).run();schemaReady=true;}
async function ensureUser(env,tg){const id=String(tg.id),username=tg.username||null,first=tg.first_name||"Игрок",last=tg.last_name||null;await env.DB.batch([env.DB.prepare(`INSERT INTO casino_users(telegram_id,username,first_name,last_name,balance,role) VALUES(?1,?2,?3,?4,?5,'PLAYER') ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,updated_at=CURRENT_TIMESTAMP`).bind(id,username,first,last,START_BALANCE),env.DB.prepare(`INSERT OR IGNORE INTO casino_daily(telegram_id,streak) VALUES(?1,0)`).bind(id)]);const row=await env.DB.prepare(`SELECT * FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(id).first();if(!row)throw new Error("PLAYER_NOT_FOUND");if(Number(row.is_banned||0))throw new Error("PLAYER_BANNED");return row;}
async function changeBalance(env,id,delta,type,roundId,meta){id=String(id);delta=Math.floor(Number(delta));const before=await env.DB.prepare(`SELECT balance FROM casino_users WHERE telegram_id=?1`).bind(id).first();if(!before)throw new Error("PLAYER_NOT_FOUND");const old=Number(before.balance||0);if(delta<0&&(old<0||old<-delta))throw new Error("INSUFFICIENT_FUNDS");const next=old+delta;await env.DB.batch([env.DB.prepare(`UPDATE casino_users SET balance=?2,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?1`).bind(id,next),env.DB.prepare(`INSERT INTO casino_ledger(telegram_id,type,amount,balance_before,balance_after,round_id,metadata) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(id,type,delta,old,next,roundId||null,JSON.stringify(meta||{}))]);return {balance:next};}
async function recordRound(env,id,gameId,bet,payout,roundId,result){await env.DB.batch([env.DB.prepare(`INSERT INTO casino_rounds(round_id,telegram_id,game_id,bet,payout,multiplier,result_json) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(roundId,String(id),gameId,bet,payout,round2(payout/Math.max(1,bet)),JSON.stringify(result)),env.DB.prepare(`INSERT INTO casino_game_totals(game_id,rounds,wagered,paid) VALUES(?1,1,?2,?3) ON CONFLICT(game_id) DO UPDATE SET rounds=rounds+1,wagered=wagered+excluded.wagered,paid=paid+excluded.paid,updated_at=CURRENT_TIMESTAMP`).bind(gameId,bet,payout)]);}
async function addJackpot(env,a){await env.DB.prepare(`INSERT INTO casino_meta(key,value) VALUES('grand_jackpot',?1) ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+?1 AS TEXT)`).bind(Math.max(0,Math.floor(a))).run();}
async function syncMarketIndex(env){let state=await env.DB.prepare(`SELECT * FROM casino_market_state WHERE id=1`).first();if(!state){const max=await env.DB.prepare(`SELECT COALESCE(MAX(rowid),0) m FROM casino_rounds`).first();await env.DB.prepare(`INSERT INTO casino_market_state(id,price,last_round_rowid) VALUES(1,1000,?1)`).bind(Number(max?.m||0)).run();state={price:1000,last_round_rowid:Number(max?.m||0)};}const last=Number(state.last_round_rowid||0),agg=await env.DB.prepare(`SELECT COALESCE(MAX(rowid),?1) max_id,COALESCE(SUM(bet),0) wagered,COALESCE(SUM(bet-payout),0) house_net FROM casino_rounds WHERE rowid>?1`).bind(last).first(),maxId=Number(agg?.max_id||last);if(maxId<=last)return;const wagered=Number(agg?.wagered||0),houseNet=Number(agg?.house_net||0),ratio=wagered>0?houseNet/wagered:0,impact=Math.max(-.03,Math.min(.03,ratio*.018)),next=Math.max(10,round4(Number(state.price||1000)*(1+impact))),now=Date.now();await env.DB.batch([env.DB.prepare(`UPDATE casino_market_state SET price=?1,last_round_rowid=?2,updated_at=CURRENT_TIMESTAMP WHERE id=1`).bind(next,maxId),env.DB.prepare(`INSERT INTO casino_market_points(price,house_net,wagered,created_ms) VALUES(?1,?2,?3,?4)`).bind(next,Math.floor(houseNet),Math.floor(wagered),now)]);}
async function cachedResponse(env,key){const r=await env.DB.prepare(`SELECT response_json FROM casino_request_cache WHERE request_key=?1 LIMIT 1`).bind(key).first();if(!r?.response_json)return null;try{return JSON.parse(r.response_json);}catch{return null;}}
async function cacheResponse(env,key,id,response){await env.DB.prepare(`INSERT OR IGNORE INTO casino_request_cache(request_key,telegram_id,response_json) VALUES(?1,?2,?3)`).bind(key,String(id),JSON.stringify(response)).run();}
function validateBet(v){const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<MIN_BET)throw new Error("MIN_BET_1000");if(n>MAX_BET)throw new Error("MAX_BET_5M");return n;}function validateRequestId(v){const s=String(v||"");if(!/^[a-zA-Z0-9:_-]{8,100}$/.test(s))throw new Error("BAD_REQUEST_ID");return s;}function randomToken(){const a=new Uint8Array(12);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}function round2(n){return Math.floor(Number(n||0)*100)/100;}function round4(n){return Math.round(Number(n||0)*10000)/10000;}function withBuild(res){try{const h=new Headers(res.headers);h.set("x-fit-build",BUILD);h.set("cache-control","no-store");return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h});}catch{return res;}}function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});}
