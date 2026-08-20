import tuningWorker from "./casino-tuning-main-v2.js";
import {validateTelegramInitData} from "./auth.js";

const BUILD="2026-08-20-one-shot-bonus-boost-v3";
const BOOST_PERCENT=100;
const BONUS_BUY_SLOTS=new Set(["aureus","olympus_storm","sweet_bonanza","black_hound_overdrive"]);
const SLOT_NAMES={
  aureus:"AUREUS CASCADE",
  olympus_storm:"OLYMPUS STORM",
  sweet_bonanza:"SWEET BONANZA",
  black_hound_overdrive:"BLACK HOUND: OVERDRIVE"
};
let schemaReady=false;

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/__fit_version")return json({ok:true,build:BUILD});

    if(request.method==="GET"&&url.pathname==="/casino-app.js")return boostedCasinoApp(request,env);
    if(request.method==="GET"&&url.pathname==="/admin.html")return boostedAdminHtml(request,env);
    if(request.method==="GET"&&url.pathname==="/admin.js")return boostedAdminJs(request,env);

    if(request.method==="POST"){
      let body=null;
      try{body=await request.clone().json();}catch{}
      if(url.pathname==="/api/bootstrap")return boostedBootstrap(request,env,body);
      if(url.pathname==="/api/tuning/request")return boostedTuningRequest(request,env,body);
      if(url.pathname==="/api/admin/tuning/state")return boostedAdminState(request,env,body);
      if(url.pathname==="/api/admin/tuning/request-action")return boostedRequestAction(env,body);
      if(url.pathname==="/api/admin/bonus-boost/grant")return adminGrantBonusBoost(env,body);
      if(url.pathname==="/api/slot/bonus-buy"&&body)return boostedBonusBuy(request,env,body);
    }

    return withBuild(await tuningWorker.fetch(request,env));
  }
};

async function boostedBootstrap(request,env,body){
  const res=await tuningWorker.fetch(request,env);
  let data;
  try{data=await res.clone().json();}catch{return withBuild(res);}
  if(!res.ok||data?.ok===false)return withBuild(res);
  const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);
  if(!auth.ok)return withBuild(res);
  await ensureSchema(env);
  const rows=(await env.DB.prepare(`SELECT game_id,remaining_uses FROM casino_bonus_boosts WHERE telegram_id=?1 AND remaining_uses>0`).bind(String(auth.user.id)).all()).results||[];
  return json({...data,bonusBoosts:Object.fromEntries(rows.map(r=>[r.game_id,Number(r.remaining_uses||0)])),build:BUILD});
}

async function boostedTuningRequest(request,env,body){
  const gameId=String(body?.gameId||"");
  if(!BONUS_BUY_SLOTS.has(gameId))return json({ok:false,error:"BONUS_BUY_NOT_AVAILABLE_FOR_SLOT"},400);
  const res=await tuningWorker.fetch(request,env);
  let data;
  try{data=await res.clone().json();}catch{return withBuild(res);}
  if(!res.ok||data?.ok===false)return withBuild(res);
  if(!data.duplicate){
    const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);
    if(auth.ok)await notifyAdminAboutRequest(env,auth.user,gameId,data.requestId);
  }
  return json({...data,adminNotificationSent:!data.duplicate,boostPercent:BOOST_PERCENT,boostUses:1});
}

async function boostedAdminState(request,env,body){
  const res=await tuningWorker.fetch(request,env);
  let data;
  try{data=await res.clone().json();}catch{return withBuild(res);}
  if(!res.ok||data?.ok===false)return withBuild(res);
  await ensureSchema(env);
  const rows=(await env.DB.prepare(`SELECT b.telegram_id,b.game_id,b.percent,b.remaining_uses,b.activated_at,u.first_name,u.username FROM casino_bonus_boosts b LEFT JOIN casino_users u ON u.telegram_id=b.telegram_id WHERE b.remaining_uses>0 ORDER BY b.activated_at DESC`).all()).results||[];
  return json({...data,bonusBoosts:rows.map(r=>({
    telegramId:String(r.telegram_id),gameId:r.game_id,percent:Number(r.percent||BOOST_PERCENT),remainingUses:Number(r.remaining_uses||0),
    playerName:r.first_name||"Игрок",username:r.username,slotName:SLOT_NAMES[r.game_id]||r.game_id,activatedAt:r.activated_at
  }))});
}

async function boostedRequestAction(env,body){
  const admin=await requireAdmin(env,body);
  if(admin.error)return admin.error;
  await ensureSchema(env);
  const requestId=String(body?.requestId||"");
  const action=String(body?.action||"").toUpperCase();
  const row=await env.DB.prepare(`SELECT * FROM casino_tuning_requests WHERE id=?1 AND status='PENDING' LIMIT 1`).bind(requestId).first();
  if(!row)return json({ok:false,error:"REQUEST_NOT_FOUND"},404);

  if(action==="REJECT"){
    await env.DB.prepare(`UPDATE casino_tuning_requests SET status='REJECTED',resolved_at=CURRENT_TIMESTAMP,resolved_by=?2 WHERE id=?1`).bind(requestId,String(admin.user.telegram_id)).run();
    return json({ok:true,status:"REJECTED"});
  }
  if(action!=="APPROVE")return json({ok:false,error:"BAD_ACTION"},400);
  const gameId=String(row.game_id||"");
  if(!BONUS_BUY_SLOTS.has(gameId))return json({ok:false,error:"BONUS_BUY_NOT_AVAILABLE_FOR_SLOT"},400);

  await grantBonusBoost(env,String(row.telegram_id),gameId,String(admin.user.telegram_id));
  await env.DB.prepare(`UPDATE casino_tuning_requests SET status='APPROVED',applied_percent=?2,resolved_at=CURRENT_TIMESTAMP,resolved_by=?3 WHERE id=?1`).bind(requestId,BOOST_PERCENT,String(admin.user.telegram_id)).run();
  return json({ok:true,status:"APPROVED",percent:BOOST_PERCENT,uses:1,gameId});
}

async function adminGrantBonusBoost(env,body){
  const admin=await requireAdmin(env,body);
  if(admin.error)return admin.error;
  await ensureSchema(env);
  const telegramId=String(body?.telegramId||"");
  const gameId=String(body?.gameId||"");
  if(!telegramId||!BONUS_BUY_SLOTS.has(gameId))return json({ok:false,error:"BAD_BONUS_BOOST_TARGET"},400);
  const user=await env.DB.prepare(`SELECT telegram_id FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(telegramId).first();
  if(!user)return json({ok:false,error:"PLAYER_NOT_FOUND"},404);
  await grantBonusBoost(env,telegramId,gameId,String(admin.user.telegram_id));
  return json({ok:true,telegramId,gameId,percent:BOOST_PERCENT,uses:1});
}

async function grantBonusBoost(env,telegramId,gameId,adminId){
  await env.DB.prepare(`INSERT INTO casino_bonus_boosts(telegram_id,game_id,percent,remaining_uses,activated_by,activated_at,consumed_at) VALUES(?1,?2,?3,1,?4,CURRENT_TIMESTAMP,NULL) ON CONFLICT(telegram_id,game_id) DO UPDATE SET percent=excluded.percent,remaining_uses=1,activated_by=excluded.activated_by,activated_at=CURRENT_TIMESTAMP,consumed_at=NULL`).bind(telegramId,gameId,BOOST_PERCENT,adminId).run();
}

async function boostedBonusBuy(request,env,body){
  const res=await tuningWorker.fetch(request,env);
  let data;
  try{data=await res.clone().json();}catch{return withBuild(res);}
  if(!res.ok||data?.ok===false)return withBuild(res);

  const gameId=String(body?.gameId||"");
  if(!BONUS_BUY_SLOTS.has(gameId))return withBuild(res);
  const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);
  if(!auth.ok)return withBuild(res);
  await ensureSchema(env);
  const userId=String(auth.user.id);
  const roundId=String(data.roundId||data.spinId||"");
  if(!roundId)return withBuild(res);

  const applied=await env.DB.prepare(`SELECT base_payout,adjusted_payout,delta FROM casino_bonus_boost_applied WHERE round_id=?1 LIMIT 1`).bind(roundId).first();
  if(applied){
    const u=await env.DB.prepare(`SELECT balance FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(userId).first();
    return json(decorateBonusBoost(data,Number(applied.base_payout||0),Number(applied.adjusted_payout||0),Number(applied.delta||0),Number(u?.balance??data.balance),true));
  }

  const active=await env.DB.prepare(`SELECT percent,remaining_uses FROM casino_bonus_boosts WHERE telegram_id=?1 AND game_id=?2 AND remaining_uses>0 LIMIT 1`).bind(userId,gameId).first();
  if(!active)return withBuild(res);

  const claim=await env.DB.prepare(`UPDATE casino_bonus_boosts SET remaining_uses=remaining_uses-1,consumed_at=CURRENT_TIMESTAMP WHERE telegram_id=?1 AND game_id=?2 AND remaining_uses>0`).bind(userId,gameId).run();
  if(Number(claim?.meta?.changes||0)<1)return withBuild(res);

  const base=Math.max(0,Math.floor(Number(data?.tuning?.basePayout??data.payout??0)));
  const current=Math.max(0,Math.floor(Number(data.payout||0)));
  const cap=Math.max(0,Math.floor(Number(data.maxWin||Number.MAX_SAFE_INTEGER)));
  const adjusted=Math.min(cap,Math.max(0,Math.floor(base*2)));
  const delta=adjusted-current;
  const round=await env.DB.prepare(`SELECT game_id,bet FROM casino_rounds WHERE round_id=?1 AND telegram_id=?2 LIMIT 1`).bind(roundId,userId).first();
  if(!round)return json({...data,bonusBoostConsumed:true,bonusBoostPercent:BOOST_PERCENT});

  const beforeRow=await env.DB.prepare(`SELECT balance FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(userId).first();
  const before=Number(beforeRow?.balance||0),after=before+delta;
  const result={...(data.result||{}),bonusBoost:{percent:BOOST_PERCENT,uses:1,basePayout:base,adjustedPayout:adjusted,delta}};
  const statements=[
    env.DB.prepare(`INSERT INTO casino_bonus_boost_applied(round_id,telegram_id,game_id,percent,base_payout,adjusted_payout,delta) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(roundId,userId,gameId,BOOST_PERCENT,base,adjusted,delta),
    env.DB.prepare(`UPDATE casino_rounds SET payout=?2,multiplier=?3,result_json=?4 WHERE round_id=?1`).bind(roundId,adjusted,round2(adjusted/Math.max(1,Number(data.bet||1))),JSON.stringify(result))
  ];
  if(delta!==0){
    statements.push(env.DB.prepare(`UPDATE casino_users SET balance=?2,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?1`).bind(userId,after));
    statements.push(env.DB.prepare(`INSERT INTO casino_ledger(telegram_id,type,amount,balance_before,balance_after,round_id,metadata) VALUES(?1,'BONUS_BOOST',?2,?3,?4,?5,?6)`).bind(userId,delta,before,after,roundId,JSON.stringify({gameId,percent:BOOST_PERCENT,basePayout:base,adjustedPayout:adjusted})));
    statements.push(env.DB.prepare(`UPDATE casino_game_totals SET paid=paid+?2,updated_at=CURRENT_TIMESTAMP WHERE game_id=?1`).bind(String(round.game_id||gameId),delta));
  }
  await env.DB.batch(statements);
  if(delta!==0)await correctMarket(env,delta,Number(round.bet||data.bet||1));
  return json(decorateBonusBoost(data,base,adjusted,delta,after,true));
}

function decorateBonusBoost(data,base,adjusted,delta,balance,consumed){
  const result={...(data.result||{}),bonusBoost:{percent:BOOST_PERCENT,uses:1,basePayout:base,adjustedPayout:adjusted,delta}};
  return {...data,payout:adjusted,balance,multiplier:round2(adjusted/Math.max(1,Number(data.bet||1))),result,bonusBoostPercent:BOOST_PERCENT,bonusBoostConsumed:consumed,bonusBoostRemaining:0,bonusBoost:{percent:BOOST_PERCENT,basePayout:base,adjustedPayout:adjusted,delta}};
}

async function notifyAdminAboutRequest(env,user,gameId,requestId){
  try{
    const admin=await env.DB.prepare(`SELECT value FROM casino_meta WHERE key='admin_telegram_id' LIMIT 1`).first();
    const adminId=String(admin?.value||"");
    const token=String(env.TELEGRAM_BOT_TOKEN||"");
    if(!adminId||!token)return false;
    const name=[user?.first_name,user?.last_name].filter(Boolean).join(" ")||"Игрок";
    const username=user?.username?" @"+user.username:"";
    const slot=SLOT_NAMES[gameId]||gameId;
    const text="🎰 НОВАЯ ЗАЯВКА НА ПОДКРУТКУ\n\nИгрок: "+name+username+"\nСлот: "+slot+"\nЗапрос: +100% на 1 покупаемую бонуску\n\nОткрой админ-панель FIT Casino и подтверди или отклони заявку.";
    const r=await fetch("https://api.telegram.org/bot"+token+"/sendMessage",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:adminId,text,disable_web_page_preview:true})});
    if(!r.ok){console.warn("ADMIN_TUNING_NOTIFY_FAILED",r.status,await r.text());return false;}
    try{await env.DB.prepare(`UPDATE casino_tuning_requests SET notified_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(String(requestId||"")).run();}catch{}
    return true;
  }catch(error){console.warn("ADMIN_TUNING_NOTIFY",error);return false;}
}

async function boostedCasinoApp(request,env){
  const res=await tuningWorker.fetch(request,env);
  if(!res.ok)return res;
  let src=await res.text();
  src=src.replace('slotTunings:{},tuningPending:{}','slotTunings:{},tuningPending:{},bonusBoosts:{}');
  src=src.replace('state.slotTunings=data.slotTunings||{};state.tuningPending=data.tuningPending||{};','state.slotTunings=data.slotTunings||{};state.tuningPending=data.tuningPending||{};state.bonusBoosts=data.bonusBoosts||{};');
  src=src.replace('$("bonusBuyBtn").classList.toggle("hidden",!slot.bonusBuy);renderSlotTuning();','$("bonusBuyBtn").classList.toggle("hidden",!slot.bonusBuy);renderSlotTuning();renderBonusBoost();');
  src=src.replace('const r=await api("/api/slot/bonus-buy",{gameId:state.current.id,bet,tier,requestId:requestId()});syncTuningFromResponse(r);','const r=await api("/api/slot/bonus-buy",{gameId:state.current.id,bet,tier,requestId:requestId()});syncTuningFromResponse(r);syncBonusBoostFromResponse(r);');
  src=src.replace('function openBonusBuy(){',bonusClientPatch()+"\nfunction openBonusBuy(){");
  return jsResponse(src,res.status);
}

function bonusClientPatch(){
  return [
    'function renderBonusBoost(){',
    '  const notice=$("tuningNotice"),btn=$("requestTuneBtn");if(!notice||!btn||!state.current)return;',
    '  const active=Number(state.bonusBoosts?.[state.current.id]||0)>0;',
    '  btn.classList.toggle("hidden",!state.current.bonusBuy);',
    '  if(active){notice.classList.remove("hidden","negative");notice.classList.add("positive");notice.textContent="БОНУС ПОДКРУЧЕН +100% · 1 ПОКУПКА";btn.disabled=true;btn.textContent="БУСТ +100% УЖЕ АКТИВЕН";}',
    '}',
    'function syncBonusBoostFromResponse(r){if(!state.current)return;if(r?.bonusBoostConsumed){state.bonusBoosts[state.current.id]=0;renderSlotTuning();renderBonusBoost();toast("БУСТ +100% ИСПОЛЬЗОВАН");}}'
  ].join("\n");
}

async function boostedAdminHtml(request,env){
  const res=await tuningWorker.fetch(request,env);
  if(!res.ok)return res;
  let html=await res.text();
  html=html.replace('</style>','.tune-row [data-request-percent]{display:none}.boost-active{border-color:rgba(126,255,202,.22)!important}.boost-active b{color:#88ffd0}</style>');
  html=html.replace('<button id="resetTuning" class="reject">СБРОСИТЬ В 0%</button>','<button id="resetTuning" class="reject">СБРОСИТЬ В 0%</button><button id="grantBonusBoost" class="approve" style="grid-column:1/-1">+100% НА 1 БОНУСКУ</button>');
  html=html.replace('<div id="activeTunings"></div>','<div id="activeBonusBoosts"></div><div id="activeTunings"></div>');
  return htmlResponse(html,res.status);
}

async function boostedAdminJs(request,env){
  const res=await tuningWorker.fetch(request,env);
  if(!res.ok)return res;
  let src=await res.text();
  src=src.replace('ПРИМЕНИТЬ</button>','ВКЛЮЧИТЬ +100% · 1 БОНУСКУ</button>');
  src=src.replace('tuning=await api("/api/admin/tuning/state",{});renderTuning();','tuning=await api("/api/admin/tuning/state",{});renderTuning();renderBonusBoosts();');
  src=src.replace('function renderGames(){',bonusAdminPatch()+"\nfunction renderGames(){");
  return jsResponse(src,res.status);
}

function bonusAdminPatch(){
  return [
    'function renderBonusBoosts(){',
    '  const box=$("activeBonusBoosts"),grant=$("grantBonusBoost");if(box){box.innerHTML=(tuning.bonusBoosts||[]).length?(tuning.bonusBoosts||[]).map(b=>"<article class=\\\"tune-row boost-active\\\"><div class=\\\"tune-row-head\\\"><div><b>"+esc(b.playerName)+(b.username?" · @"+esc(b.username):"")+"</b><small>"+esc(b.slotName)+"</small></div><b>+100% · 1 БОНУСКА</b></div></article>").join(""):empty("Активных бустов на бонус нет.");}',
    '  if(grant)grant.onclick=grantOneBonusBoost;',
    '}',
    'async function grantOneBonusBoost(){const telegramId=$("tunePlayer").value,gameId=$("tuneSlot").value;if(!telegramId||!gameId)return toast("Выбери игрока и слот");try{await api("/api/admin/bonus-boost/grant",{telegramId,gameId});toast("+100% на 1 бонуску включено");await loadTuningAdmin();}catch(e){toast(errorText(e.message));}}'
  ].join("\n");
}

async function correctMarket(env,delta,bet){
  try{
    const state=await env.DB.prepare(`SELECT price FROM casino_market_state WHERE id=1`).first();
    if(!state)return;
    const impact=clamp(((-delta)/Math.max(1,bet))*.018,-.03,.03);
    const next=Math.max(10,round4(Number(state.price||1000)*(1+impact))),now=Date.now();
    await env.DB.batch([
      env.DB.prepare(`UPDATE casino_market_state SET price=?1,updated_at=CURRENT_TIMESTAMP WHERE id=1`).bind(next),
      env.DB.prepare(`INSERT INTO casino_market_points(price,house_net,wagered,created_ms) VALUES(?1,?2,?3,?4)`).bind(next,-Math.floor(delta),0,now)
    ]);
  }catch(error){console.warn("BONUS_BOOST_MARKET_CORRECTION",error);}
}

async function requireAdmin(env,body){
  const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);
  if(!auth.ok)return {error:json({ok:false,error:auth.error},401)};
  const user=await env.DB.prepare(`SELECT * FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(String(auth.user.id)).first();
  if(!user||user.role!=="ADMIN")return {error:json({ok:false,error:"ADMIN_ONLY"},403)};
  return {user};
}

async function ensureSchema(env){
  if(schemaReady)return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_bonus_boosts(telegram_id TEXT NOT NULL,game_id TEXT NOT NULL,percent INTEGER NOT NULL DEFAULT 100,remaining_uses INTEGER NOT NULL DEFAULT 1,activated_by TEXT,activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,consumed_at TEXT,PRIMARY KEY(telegram_id,game_id))`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_bonus_boost_applied(round_id TEXT PRIMARY KEY,telegram_id TEXT NOT NULL,game_id TEXT NOT NULL,percent INTEGER NOT NULL,base_payout INTEGER NOT NULL,adjusted_payout INTEGER NOT NULL,delta INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  try{await env.DB.prepare(`ALTER TABLE casino_tuning_requests ADD COLUMN notified_at TEXT`).run();}catch{}
  schemaReady=true;
}

function withBuild(res){try{const headers=new Headers(res.headers);headers.set("x-fit-build",BUILD);return new Response(res.body,{status:res.status,statusText:res.statusText,headers});}catch{return res;}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});}
function jsResponse(text,status=200){return new Response(text,{status,headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});}
function htmlResponse(text,status=200){return new Response(text,{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});}
function round2(n){return Math.floor(Number(n||0)*100)/100;}
function round4(n){return Math.round(Number(n||0)*10000)/10000;}
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
