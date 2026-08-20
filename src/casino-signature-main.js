import tuningWorker from "./casino-tuning-main-v3.js";
import {validateTelegramInitData} from "./auth.js";
import {KOZYR_CONFIG,createKozyrResult,createKozyrBonusBuyResult} from "./games/kozyr.js";
import {PADAPLELOV_CONFIG,createPadaplelovResult,createPadaplelovBonusBuyResult} from "./games/padaplelov.js";

const BUILD="2026-08-20-kozyr-padaplelov-chat-boost-v4";
const START_BALANCE=10_000_000,MIN_BET=1_000,MAX_BET=5_000_000;
const NEW_IDS=new Set([KOZYR_CONFIG.id,PADAPLELOV_CONFIG.id]);
const BONUS_BUY_SLOTS=new Set(["aureus","olympus_storm","sweet_bonanza","black_hound_overdrive",KOZYR_CONFIG.id,PADAPLELOV_CONFIG.id]);
const SLOT_NAMES={aureus:"AUREUS CASCADE",olympus_storm:"OLYMPUS STORM",sweet_bonanza:"SWEET BONANZA",black_hound_overdrive:"BLACK HOUND: OVERDRIVE",[KOZYR_CONFIG.id]:KOZYR_CONFIG.name,[PADAPLELOV_CONFIG.id]:PADAPLELOV_CONFIG.name};
let schemaReady=false;

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/__fit_version")return json({ok:true,build:BUILD});
    if(request.method==="POST"&&url.pathname==="/telegram/tuning-callback")return telegramCallback(request,env);
    if(request.method==="GET"&&url.pathname==="/assets/assets.manifest.json")return signatureManifest(request,env);
    if(request.method==="GET"&&url.pathname==="/casino-app.js")return signatureCasinoApp(request,env);
    if(request.method==="POST"){
      let body=null;try{body=await request.clone().json();}catch{}
      if(url.pathname==="/api/bootstrap")return signatureBootstrap(request,env,body);
      if(url.pathname==="/api/tuning/request")return chatTuningRequest(request,env,body);
      if((url.pathname==="/api/slot/spin"||url.pathname==="/api/slot/bonus-buy")&&NEW_IDS.has(String(body?.gameId||""))){
        return url.pathname.endsWith("bonus-buy")?newBonusBuy(request,env,body):newSpin(request,env,body);
      }
    }
    return withBuild(await tuningWorker.fetch(request,env));
  }
};

async function signatureManifest(request,env){
  const res=await tuningWorker.fetch(request,env);if(!res.ok)return res;const data=await res.json();data.version=Math.max(10,Number(data.version||0)+1);data.games=data.games||{};
  data.games[KOZYR_CONFIG.id]={config:"/assets/games/kozyr/config.json",atlas:"/assets/games/kozyr/atlas/symbols.json",background:"/assets/games/kozyr/background.svg",bonusBackground:"/assets/games/kozyr/bonus-background.svg",cover:"/assets/game-covers/kozyr.svg"};
  data.games[PADAPLELOV_CONFIG.id]={config:"/assets/games/padaplelov/config.json",atlas:"/assets/games/padaplelov/atlas/symbols.json",background:"/assets/games/padaplelov/background.svg",bonusBackground:"/assets/games/padaplelov/bonus-background.svg",cover:"/assets/game-covers/padaplelov.svg"};
  return json(data);
}
async function signatureCasinoApp(request,env){
  const res=await tuningWorker.fetch(request,env);if(!res.ok)return res;let src=await res.text();
  src=src.replace("./game/core/GameEngineHound.js","./game/core/GameEngineSignature.js");
  src=src.replace('if(state.current.id==="black_hound_overdrive"){',`if(state.current.id==="kozyr"){
    showModal(\`<small>FEATURE BUY</small><h2>KOZYR · BLACK INK</h2><p>8 Free Spins. Permanent Tattoo Wilds остаются на поле, получают ×2/×3/×5 и усиливаются после участия в выигрышном кластере.</p><div class="modal-grid"><button class="modal-option" data-buy="black_ink"><b>\${fmt(bet*100)}</b><small>100× BET · BLACK INK</small></button></div>\`);
  }else if(state.current.id==="padaplelov"){
    showModal(\`<small>FEATURE BUY</small><h2>PADAPLELOV · NIGHT TAP</h2><p>12 Free Spins. Бочки раскрывают целые барабаны Wild, пена копится и разгоняет общий множитель до ×8.</p><div class="modal-grid"><button class="modal-option" data-buy="night_tap"><b>\${fmt(bet*85)}</b><small>85× BET · NIGHT TAP</small></button></div>\`);
  }else if(state.current.id==="black_hound_overdrive"){`);
  src=src.replace('black_hound_overdrive:"20 линий, CHAIN LINK и три разные бонуски со sticky multiplier-псами."','black_hound_overdrive:"20 линий, CHAIN LINK и три разные бонуски со sticky multiplier-псами.",\n    kozyr:"Cluster 5+, INK SPLASH и permanent Tattoo Wilds с растущими множителями.",\n    padaplelov:"20 линий, BARREL BLAST и NIGHT TAP с растущим FOAM multiplier."');
  src=src.replace('if(s.id==="black_hound_overdrive")return "3 BONUS MODES";','if(s.id==="kozyr")return "BLACK INK";\n  if(s.id==="padaplelov")return "NIGHT TAP";\n  if(s.id==="black_hound_overdrive")return "3 BONUS MODES";');
  return jsResponse(src,res.status);
}
async function signatureBootstrap(request,env,body){
  const res=await tuningWorker.fetch(request,env);let data;try{data=await res.clone().json();}catch{return withBuild(res);}if(!res.ok||data?.ok===false)return withBuild(res);
  const slots=Array.isArray(data.slots)?data.slots.slice():[];
  if(!slots.some(s=>s?.id===KOZYR_CONFIG.id))slots.push({id:KOZYR_CONFIG.id,name:KOZYR_CONFIG.name,rows:KOZYR_CONFIG.rows,cols:KOZYR_CONFIG.reels,mechanic:KOZYR_CONFIG.mechanic,feature:KOZYR_CONFIG.feature,bonusBuy:true,maxWin:KOZYR_CONFIG.maxWin,cover:"/assets/game-covers/kozyr.svg",badge:"SIGNATURE"});
  if(!slots.some(s=>s?.id===PADAPLELOV_CONFIG.id))slots.push({id:PADAPLELOV_CONFIG.id,name:PADAPLELOV_CONFIG.name,rows:PADAPLELOV_CONFIG.rows,cols:PADAPLELOV_CONFIG.reels,mechanic:PADAPLELOV_CONFIG.mechanic,feature:PADAPLELOV_CONFIG.feature,bonusBuy:true,maxWin:PADAPLELOV_CONFIG.maxWin,cover:"/assets/game-covers/padaplelov.svg",badge:"NEW"});
  return json({...data,slots,build:BUILD});
}

async function newSpin(request,env,body){
  const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);if(!auth.ok)return json({ok:false,error:auth.error},401);
  try{
    const player=await ensureUser(env,auth.user),gameId=String(body.gameId||""),bet=validateBet(body.bet),requestId=validateRequestId(body.requestId),key=`spin:${player.telegram_id}:${requestId}`,cached=await cachedResponse(env,key);if(cached)return json({ok:true,...cached,duplicate:true});
    const cfg=gameId===KOZYR_CONFIG.id?KOZYR_CONFIG:PADAPLELOV_CONFIG,outcome=gameId===KOZYR_CONFIG.id?createKozyrResult(bet):createPadaplelovResult(bet),roundId=crypto.randomUUID(),payout=Math.max(0,Math.floor(outcome.payout));
    const debit=await changeBalance(env,player.telegram_id,-bet,"SLOT_BET",roundId,{gameId,bet,requestId});let balance=debit.balance;
    if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,"SLOT_PAYOUT",roundId,{gameId,bet,payout,requestId})).balance;
    await recordRound(env,player.telegram_id,gameId,bet,payout,roundId,outcome);await addJackpot(env,Math.max(1,Math.floor(bet*.002)));await syncMarketIndex(env);
    const response={spinId:roundId,roundId,gameId,bet,payout,balance,multiplier:round2(payout/bet),maxWin:bet*cfg.maxWin,result:outcome};await cacheResponse(env,key,player.telegram_id,response);return json({ok:true,...response});
  }catch(error){console.error("signature_spin",error);return json({ok:false,error:String(error?.message||"SERVER_ERROR")},400);}
}
async function newBonusBuy(request,env,body){
  const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);if(!auth.ok)return json({ok:false,error:auth.error},401);
  try{
    await ensureSchema(env);const player=await ensureUser(env,auth.user),gameId=String(body.gameId||""),bet=validateBet(body.bet),requestId=validateRequestId(body.requestId),key=`buy:${player.telegram_id}:${requestId}`,cached=await cachedResponse(env,key);if(cached)return json({ok:true,...cached,duplicate:true});
    const isKozyr=gameId===KOZYR_CONFIG.id,cfg=isKozyr?KOZYR_CONFIG:PADAPLELOV_CONFIG,tier=isKozyr?"black_ink":"night_tap",cost=bet*(isKozyr?100:85),outcome=isKozyr?createKozyrBonusBuyResult(bet):createPadaplelovBonusBuyResult(bet),roundId=crypto.randomUUID();
    let payout=Math.max(0,Math.floor(outcome.payout));const cap=bet*cfg.maxWin;
    const active=await env.DB.prepare(`SELECT remaining_uses FROM casino_bonus_boosts WHERE telegram_id=?1 AND game_id=?2 AND remaining_uses>0 LIMIT 1`).bind(String(player.telegram_id),gameId).first();
    let boostConsumed=false,basePayout=payout;if(active){const claim=await env.DB.prepare(`UPDATE casino_bonus_boosts SET remaining_uses=remaining_uses-1,consumed_at=CURRENT_TIMESTAMP WHERE telegram_id=?1 AND game_id=?2 AND remaining_uses>0`).bind(String(player.telegram_id),gameId).run();if(Number(claim?.meta?.changes||0)>0){boostConsumed=true;payout=Math.min(cap,payout*2);outcome.bonusBoost={percent:100,basePayout,adjustedPayout:payout};}}
    const debit=await changeBalance(env,player.telegram_id,-cost,"BONUS_BUY",roundId,{gameId,bet,tier,cost,requestId});let balance=debit.balance;
    if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,boostConsumed?"BONUS_BUY_BOOSTED_PAYOUT":"BONUS_BUY_PAYOUT",roundId,{gameId,bet,tier,payout,basePayout,requestId})).balance;
    await recordRound(env,player.telegram_id,`${gameId}:bonus:${tier}`,cost,payout,roundId,outcome);await addJackpot(env,Math.max(1,Math.floor(cost*.001)));await syncMarketIndex(env);
    if(boostConsumed)await env.DB.prepare(`INSERT OR IGNORE INTO casino_bonus_boost_applied(round_id,telegram_id,game_id,percent,base_payout,adjusted_payout,delta) VALUES(?1,?2,?3,100,?4,?5,?6)`).bind(roundId,String(player.telegram_id),gameId,basePayout,payout,payout-basePayout).run();
    const response={spinId:roundId,roundId,gameId,bet,cost,tier,payout,balance,multiplier:round2(payout/bet),maxWin:cap,result:outcome,bonusBoostConsumed:boostConsumed,bonusBoostPercent:boostConsumed?100:0,bonusBoostRemaining:0};await cacheResponse(env,key,player.telegram_id,response);return json({ok:true,...response});
  }catch(error){console.error("signature_bonus_buy",error);return json({ok:false,error:String(error?.message||"SERVER_ERROR")},400);}
}

async function chatTuningRequest(request,env,body){
  const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);if(!auth.ok)return json({ok:false,error:auth.error},401);
  const gameId=String(body?.gameId||"");if(!BONUS_BUY_SLOTS.has(gameId))return json({ok:false,error:"BONUS_BUY_NOT_AVAILABLE_FOR_SLOT"},400);
  await ensureSchema(env);const userId=String(auth.user.id);
  let row=await env.DB.prepare(`SELECT id FROM casino_tuning_requests WHERE telegram_id=?1 AND game_id=?2 AND status='PENDING' LIMIT 1`).bind(userId,gameId).first(),duplicate=!!row;
  let requestId=row?.id;
  if(!requestId){requestId=crypto.randomUUID();await env.DB.prepare(`INSERT INTO casino_tuning_requests(id,telegram_id,game_id,status) VALUES(?1,?2,?3,'PENDING')`).bind(requestId,userId,gameId).run();}
  if(!duplicate)await sendApprovalCard(env,auth.user,gameId,requestId);
  return json({ok:true,requestId,status:"PENDING",duplicate,adminNotificationSent:!duplicate,boostPercent:100,boostUses:1});
}
async function sendApprovalCard(env,user,gameId,requestId){
  const admin=await env.DB.prepare(`SELECT value FROM casino_meta WHERE key='admin_telegram_id' LIMIT 1`).first(),adminId=String(admin?.value||""),token=String(env.TELEGRAM_BOT_TOKEN||"");if(!adminId||!token)return false;
  await ensureTelegramWebhook(env);const callbackToken=randomToken();await env.DB.prepare(`INSERT OR REPLACE INTO casino_tuning_callbacks(token,request_id,admin_id,created_at) VALUES(?1,?2,?3,CURRENT_TIMESTAMP)`).bind(callbackToken,requestId,adminId).run();
  const name=[user?.first_name,user?.last_name].filter(Boolean).join(" ")||"Игрок",username=user?.username?" @"+user.username:"",slot=SLOT_NAMES[gameId]||gameId;
  const text="🎰 ЗАПРОС НА ПОДКРУТКУ\n\nИгрок: "+name+username+"\nСлот: "+slot+"\nЭффект: +100% к выплате следующей покупаемой бонуски\nИспользований: 1\n\nПодтвердить?";
  const payload={chat_id:adminId,text,reply_markup:{inline_keyboard:[[{text:"✅ Подтвердить +100%",callback_data:"tb:a:"+callbackToken},{text:"❌ Отклонить",callback_data:"tb:r:"+callbackToken}]]}};
  const r=await botCall(env,"sendMessage",payload);if(r?.ok&&r.result?.message_id)await env.DB.prepare(`UPDATE casino_tuning_callbacks SET message_id=?2,chat_id=?3 WHERE token=?1`).bind(callbackToken,String(r.result.message_id),adminId).run();return !!r?.ok;
}
async function telegramCallback(request,env){
  await ensureSchema(env);const secret=await webhookSecret(env),header=request.headers.get("x-telegram-bot-api-secret-token")||"";if(!secret||header!==secret)return new Response("forbidden",{status:403});
  let update;try{update=await request.json();}catch{return new Response("ok");}const q=update?.callback_query;if(!q)return new Response("ok");
  const data=String(q.data||""),m=/^tb:([ar]):([A-Za-z0-9_-]+)$/.exec(data);if(!m){await answerCallback(env,q.id,"Неизвестная команда");return new Response("ok");}
  const action=m[1]==="a"?"APPROVE":"REJECT",token=m[2],cb=await env.DB.prepare(`SELECT * FROM casino_tuning_callbacks WHERE token=?1 LIMIT 1`).bind(token).first();if(!cb){await answerCallback(env,q.id,"Заявка устарела");return new Response("ok");}
  const adminId=(await env.DB.prepare(`SELECT value FROM casino_meta WHERE key='admin_telegram_id' LIMIT 1`).first())?.value;if(String(q.from?.id||"")!==String(adminId||"")||String(cb.admin_id)!==String(adminId||"")){await answerCallback(env,q.id,"Только администратор");return new Response("ok");}
  const row=await env.DB.prepare(`SELECT r.*,u.first_name,u.username FROM casino_tuning_requests r LEFT JOIN casino_users u ON u.telegram_id=r.telegram_id WHERE r.id=?1 LIMIT 1`).bind(String(cb.request_id)).first();
  if(!row||row.status!=="PENDING"){await answerCallback(env,q.id,"Уже обработано");return new Response("ok");}
  const slot=SLOT_NAMES[row.game_id]||row.game_id,player=(row.first_name||"Игрок")+(row.username?" @"+row.username:"");
  if(action==="APPROVE"){await env.DB.batch([
    env.DB.prepare(`INSERT INTO casino_bonus_boosts(telegram_id,game_id,percent,remaining_uses,activated_by,activated_at,consumed_at) VALUES(?1,?2,100,1,?3,CURRENT_TIMESTAMP,NULL) ON CONFLICT(telegram_id,game_id) DO UPDATE SET percent=100,remaining_uses=1,activated_by=excluded.activated_by,activated_at=CURRENT_TIMESTAMP,consumed_at=NULL`).bind(String(row.telegram_id),String(row.game_id),String(adminId)),
    env.DB.prepare(`UPDATE casino_tuning_requests SET status='APPROVED',applied_percent=100,resolved_at=CURRENT_TIMESTAMP,resolved_by=?2 WHERE id=?1`).bind(String(row.id),String(adminId)),
    env.DB.prepare(`UPDATE casino_tuning_callbacks SET resolved_at=CURRENT_TIMESTAMP WHERE token=?1`).bind(token)
  ]);await answerCallback(env,q.id,"Буст +100% включён");await editApproval(env,q.message?.chat?.id,q.message?.message_id,"✅ ПОДКРУТКА ПОДТВЕРЖДЕНА\n\nИгрок: "+player+"\nСлот: "+slot+"\n+100% на 1 следующую Bonus Buy.");await notifyPlayer(env,row.telegram_id,"✅ Админ подтвердил подкрутку +100% на 1 покупаемую бонуску в "+slot+".");
  }else{await env.DB.batch([env.DB.prepare(`UPDATE casino_tuning_requests SET status='REJECTED',resolved_at=CURRENT_TIMESTAMP,resolved_by=?2 WHERE id=?1`).bind(String(row.id),String(adminId)),env.DB.prepare(`UPDATE casino_tuning_callbacks SET resolved_at=CURRENT_TIMESTAMP WHERE token=?1`).bind(token)]);await answerCallback(env,q.id,"Заявка отклонена");await editApproval(env,q.message?.chat?.id,q.message?.message_id,"❌ ПОДКРУТКА ОТКЛОНЕНА\n\nИгрок: "+player+"\nСлот: "+slot);await notifyPlayer(env,row.telegram_id,"❌ Админ отклонил запрос на подкрутку в "+slot+".");}
  return new Response("ok");
}
async function ensureTelegramWebhook(env){const token=String(env.TELEGRAM_BOT_TOKEN||""),url=String(env.APP_URL||"").replace(/\/$/,"")+"/telegram/tuning-callback";if(!token||!url.startsWith("https://"))return false;const secret=await webhookSecret(env);const r=await botCall(env,"setWebhook",{url,secret_token:secret,allowed_updates:["callback_query"],drop_pending_updates:false});return !!r?.ok;}
async function webhookSecret(env){let r=await env.DB.prepare(`SELECT value FROM casino_meta WHERE key='telegram_tuning_webhook_secret' LIMIT 1`).first();if(r?.value)return String(r.value);const v=randomToken()+randomToken();await env.DB.prepare(`INSERT OR IGNORE INTO casino_meta(key,value) VALUES('telegram_tuning_webhook_secret',?1)`).bind(v).run();r=await env.DB.prepare(`SELECT value FROM casino_meta WHERE key='telegram_tuning_webhook_secret' LIMIT 1`).first();return String(r?.value||v);}
async function botCall(env,method,payload){try{const token=String(env.TELEGRAM_BOT_TOKEN||"");if(!token)return null;const r=await fetch("https://api.telegram.org/bot"+token+"/"+method,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});return await r.json();}catch(e){console.warn("BOT_API",method,e);return null;}}
async function answerCallback(env,id,text){if(id)await botCall(env,"answerCallbackQuery",{callback_query_id:id,text,show_alert:false});}
async function editApproval(env,chatId,messageId,text){if(chatId&&messageId)await botCall(env,"editMessageText",{chat_id:chatId,message_id:messageId,text,reply_markup:{inline_keyboard:[]}});}
async function notifyPlayer(env,id,text){await botCall(env,"sendMessage",{chat_id:String(id),text});}

async function ensureSchema(env){if(schemaReady)return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_tuning_requests(id TEXT PRIMARY KEY,telegram_id TEXT NOT NULL,game_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',applied_percent INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,resolved_at TEXT,resolved_by TEXT)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_bonus_boosts(telegram_id TEXT NOT NULL,game_id TEXT NOT NULL,percent INTEGER NOT NULL DEFAULT 100,remaining_uses INTEGER NOT NULL DEFAULT 0,activated_by TEXT,activated_at TEXT,consumed_at TEXT,PRIMARY KEY(telegram_id,game_id))`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_bonus_boost_applied(round_id TEXT PRIMARY KEY,telegram_id TEXT NOT NULL,game_id TEXT NOT NULL,percent INTEGER NOT NULL,base_payout INTEGER NOT NULL,adjusted_payout INTEGER NOT NULL,delta INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_tuning_callbacks(token TEXT PRIMARY KEY,request_id TEXT NOT NULL,admin_id TEXT NOT NULL,chat_id TEXT,message_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,resolved_at TEXT)`).run();schemaReady=true;
}
async function ensureUser(env,tg){const id=String(tg.id),username=tg.username||null,first=tg.first_name||"Игрок",last=tg.last_name||null;await env.DB.batch([env.DB.prepare(`INSERT INTO casino_users(telegram_id,username,first_name,last_name,balance,role) VALUES(?1,?2,?3,?4,?5,'PLAYER') ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,updated_at=CURRENT_TIMESTAMP`).bind(id,username,first,last,START_BALANCE),env.DB.prepare(`INSERT OR IGNORE INTO casino_meta(key,value) VALUES('admin_telegram_id',?1)`).bind(id),env.DB.prepare(`INSERT OR IGNORE INTO casino_daily(telegram_id,streak) VALUES(?1,0)`).bind(id)]);await env.DB.prepare(`UPDATE casino_users SET role='ADMIN' WHERE telegram_id=(SELECT value FROM casino_meta WHERE key='admin_telegram_id')`).run();const row=await env.DB.prepare(`SELECT * FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(id).first();if(!row)throw new Error("PLAYER_NOT_FOUND");if(Number(row.is_banned||0))throw new Error("PLAYER_BANNED");return row;}
async function changeBalance(env,id,delta,type,roundId,meta){id=String(id);delta=Math.floor(Number(delta));const before=await env.DB.prepare(`SELECT balance FROM casino_users WHERE telegram_id=?1`).bind(id).first();if(!before)throw new Error("PLAYER_NOT_FOUND");const old=Number(before.balance||0);if(delta<0&&(old<0||old<-delta))throw new Error("INSUFFICIENT_FUNDS");const next=old+delta;await env.DB.batch([env.DB.prepare(`UPDATE casino_users SET balance=?2,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?1`).bind(id,next),env.DB.prepare(`INSERT INTO casino_ledger(telegram_id,type,amount,balance_before,balance_after,round_id,metadata) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(id,type,delta,old,next,roundId||null,JSON.stringify(meta||{}))]);return {balance:next};}
async function recordRound(env,id,gameId,bet,payout,roundId,result){await env.DB.batch([env.DB.prepare(`INSERT INTO casino_rounds(round_id,telegram_id,game_id,bet,payout,multiplier,result_json) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(roundId,String(id),gameId,bet,payout,round2(payout/Math.max(1,bet)),JSON.stringify(result)),env.DB.prepare(`INSERT INTO casino_game_totals(game_id,rounds,wagered,paid) VALUES(?1,1,?2,?3) ON CONFLICT(game_id) DO UPDATE SET rounds=rounds+1,wagered=wagered+excluded.wagered,paid=paid+excluded.paid,updated_at=CURRENT_TIMESTAMP`).bind(gameId,bet,payout)]);}
async function addJackpot(env,a){await env.DB.prepare(`INSERT INTO casino_meta(key,value) VALUES('grand_jackpot',?1) ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+?1 AS TEXT)`).bind(Math.max(0,Math.floor(a))).run();}
async function syncMarketIndex(env){let state=await env.DB.prepare(`SELECT * FROM casino_market_state WHERE id=1`).first();if(!state){const max=await env.DB.prepare(`SELECT COALESCE(MAX(rowid),0) m FROM casino_rounds`).first();await env.DB.prepare(`INSERT INTO casino_market_state(id,price,last_round_rowid) VALUES(1,1000,?1)`).bind(Number(max?.m||0)).run();state={price:1000,last_round_rowid:Number(max?.m||0)};}const last=Number(state.last_round_rowid||0),agg=await env.DB.prepare(`SELECT COALESCE(MAX(rowid),?1) max_id,COALESCE(SUM(bet),0) wagered,COALESCE(SUM(bet-payout),0) house_net FROM casino_rounds WHERE rowid>?1`).bind(last).first(),maxId=Number(agg?.max_id||last);if(maxId<=last)return;const wagered=Number(agg?.wagered||0),houseNet=Number(agg?.house_net||0),ratio=wagered>0?houseNet/wagered:0,impact=Math.max(-.03,Math.min(.03,ratio*.018)),next=Math.max(10,round4(Number(state.price||1000)*(1+impact))),now=Date.now();await env.DB.batch([env.DB.prepare(`UPDATE casino_market_state SET price=?1,last_round_rowid=?2,updated_at=CURRENT_TIMESTAMP WHERE id=1`).bind(next,maxId),env.DB.prepare(`INSERT INTO casino_market_points(price,house_net,wagered,created_ms) VALUES(?1,?2,?3,?4)`).bind(next,Math.floor(houseNet),Math.floor(wagered),now)]);}
async function cachedResponse(env,key){const r=await env.DB.prepare(`SELECT response_json FROM casino_request_cache WHERE request_key=?1 LIMIT 1`).bind(key).first();if(!r?.response_json)return null;try{return JSON.parse(r.response_json);}catch{return null;}}
async function cacheResponse(env,key,id,response){await env.DB.prepare(`INSERT OR IGNORE INTO casino_request_cache(request_key,telegram_id,response_json) VALUES(?1,?2,?3)`).bind(key,String(id),JSON.stringify(response)).run();}
function validateBet(v){const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<MIN_BET)throw new Error("MIN_BET_1000");if(n>MAX_BET)throw new Error("MAX_BET_5M");return n;}function validateRequestId(v){const s=String(v||"");if(!/^[a-zA-Z0-9:_-]{8,100}$/.test(s))throw new Error("BAD_REQUEST_ID");return s;}
function randomToken(){const a=new Uint8Array(12);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function round2(n){return Math.floor(Number(n||0)*100)/100;}function round4(n){return Math.round(Number(n||0)*10000)/10000;}
function withBuild(res){try{const h=new Headers(res.headers);h.set("x-fit-build",BUILD);return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h});}catch{return res;}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});}
function jsResponse(text,status=200){return new Response(text,{status,headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});}
