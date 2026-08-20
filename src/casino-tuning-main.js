import houndWorker from "./casino-hound-main.js";
import {validateTelegramInitData} from "./auth.js";

const BUILD="2026-08-20-transparent-slot-tuning-v1";
const MIN_TUNING=-50;
const MAX_TUNING=100;
const TUNABLE_SLOTS=[
  {id:"aureus",name:"AUREUS CASCADE"},
  {id:"honey_fruits",name:"HONEY FRUITS"},
  {id:"lucky_coin_collector",name:"LUCKY COIN COLLECTOR"},
  {id:"neon_beast_rampage",name:"NEON BEAST: RAMPAGE"},
  {id:"olympus_storm",name:"OLYMPUS STORM"},
  {id:"sweet_bonanza",name:"SWEET BONANZA"},
  {id:"black_hound_overdrive",name:"BLACK HOUND: OVERDRIVE"}
];
const SLOT_IDS=new Set(TUNABLE_SLOTS.map(x=>x.id));
let schemaReady=false;

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/__fit_version")return json({ok:true,build:BUILD});
    if(request.method==="GET"&&(url.pathname==="/"||url.pathname==="/index.html"))return tunedIndex(request,env);
    if(request.method==="GET"&&url.pathname==="/casino-app.js")return tunedCasinoApp(request,env);
    if(request.method==="GET"&&url.pathname==="/admin.html")return tunedAdminHtml(request,env);
    if(request.method==="GET"&&url.pathname==="/admin.js")return tunedAdminJs(request,env);
    if(request.method==="POST"){
      let body=null;try{body=await request.clone().json();}catch{}
      if(url.pathname==="/api/bootstrap")return tunedBootstrap(request,env,body);
      if(url.pathname==="/api/tuning/request")return createTuningRequest(env,body);
      if(url.pathname==="/api/admin/tuning/state")return adminTuningState(env,body);
      if(url.pathname==="/api/admin/tuning/set")return adminSetTuning(env,body);
      if(url.pathname==="/api/admin/tuning/request-action")return adminTuningRequestAction(env,body);
      if((url.pathname==="/api/slot/spin"||url.pathname==="/api/slot/bonus-buy")&&body)return tunedSlotResponse(request,env,body);
    }
    return passThrough(request,env);
  }
};

async function passThrough(request,env){const res=await houndWorker.fetch(request,env);return withBuild(res);}

async function tunedIndex(request,env){
  const res=await houndWorker.fetch(request,env);if(!res.ok)return res;let html=await res.text();
  html=html.replace('</head>',`<style>
    .tuning-notice{margin:8px 14px 0;padding:9px 12px;border-radius:13px;text-align:center;font-size:10px;font-weight:950;letter-spacing:.08em;border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(14px);box-shadow:0 0 30px rgba(90,220,255,.08)}
    .tuning-notice.positive{color:#91ffd2;background:linear-gradient(90deg,rgba(22,95,72,.55),rgba(20,42,39,.7));border-color:rgba(98,255,190,.32)}
    .tuning-notice.negative{color:#ff91aa;background:linear-gradient(90deg,rgba(105,26,49,.58),rgba(44,17,27,.72));border-color:rgba(255,105,142,.3)}
    .tuning-request{width:100%;margin-top:10px;border:1px solid rgba(125,223,255,.2);background:linear-gradient(135deg,rgba(9,17,27,.94),rgba(15,7,25,.94));color:#aeeeff;border-radius:15px;padding:11px 12px;font-size:9px;font-weight:950;letter-spacing:.08em;box-shadow:inset 0 0 24px rgba(89,211,255,.04)}
    .tuning-request:disabled{opacity:.48}
  </style></head>`);
  html=html.replace('<div class="game-stage-shell">','<div id="tuningNotice" class="tuning-notice hidden"></div><div class="game-stage-shell">');
  html=html.replace('</div>\n      </div>\n    </section>\n\n    <nav id="bottomNav"','</div>\n        <button id="requestTuneBtn" class="tuning-request">ЗАКАЗАТЬ ПОДКРУТКУ · 5 ₽</button>\n      </div>\n    </section>\n\n    <nav id="bottomNav"');
  return htmlResponse(html,res.status);
}

async function tunedCasinoApp(request,env){
  const res=await houndWorker.fetch(request,env);if(!res.ok)return res;let src=await res.text();
  src=src.replace('tradeDuration:2,bets:null,loans:null','tradeDuration:2,bets:null,loans:null,slotTunings:{},tuningPending:{}');
  src=src.replace('state.player=data.player;state.slots=data.slots||[];state.daily=data.daily;','state.player=data.player;state.slots=data.slots||[];state.slotTunings=data.slotTunings||{};state.tuningPending=data.tuningPending||{};state.daily=data.daily;');
  src=src.replace('$("bonusBuyBtn").onclick=openBonusBuy;','$("bonusBuyBtn").onclick=openBonusBuy;\n  if($("requestTuneBtn"))$("requestTuneBtn").onclick=requestSlotTuning;');
  src=src.replace('$("bonusBuyBtn").classList.toggle("hidden",!slot.bonusBuy);','$("bonusBuyBtn").classList.toggle("hidden",!slot.bonusBuy);renderSlotTuning();');
  src=src.replace('const r=await api("/api/slot/spin",{gameId:state.current.id,bet,requestId:requestId()});','const r=await api("/api/slot/spin",{gameId:state.current.id,bet,requestId:requestId()});syncTuningFromResponse(r);');
  src=src.replace('const r=await api("/api/slot/bonus-buy",{gameId:state.current.id,bet,tier,requestId:requestId()});','const r=await api("/api/slot/bonus-buy",{gameId:state.current.id,bet,tier,requestId:requestId()});syncTuningFromResponse(r);');
  src=src.replace('function openBonusBuy(){',`${clientTuningFunctions()}\nfunction openBonusBuy(){`);
  return jsResponse(src,res.status);
}
function clientTuningFunctions(){return String.raw`
function renderSlotTuning(){
  const notice=$("tuningNotice"),btn=$("requestTuneBtn");if(!notice||!btn||!state.current)return;
  const id=state.current.id,pct=Number(state.slotTunings?.[id]||0),pending=!!state.tuningPending?.[id];
  notice.classList.toggle("hidden",pct===0);notice.classList.toggle("positive",pct>0);notice.classList.toggle("negative",pct<0);
  if(pct>0)notice.textContent=`СЛОТ ПОДКРУЧЕН +${pct}%`;else if(pct<0)notice.textContent=`СЛОТ ВЫКРУЧЕН ${pct}%`;else notice.textContent="";
  btn.disabled=pending;btn.textContent=pending?"ЗАЯВКА НА ПОДКРУТКУ ОТПРАВЛЕНА":"ЗАКАЗАТЬ ПОДКРУТКУ · 5 ₽";
}
function syncTuningFromResponse(r){if(!state.current||r?.tuningPercent===undefined)return;const pct=Number(r.tuningPercent||0);state.slotTunings[state.current.id]=pct;renderSlotTuning();if(r?.tuning?.delta){const d=Number(r.tuning.delta||0);toast(`${d>=0?"ПОДКРУТКА +":"ВЫКРУТКА −"}${fmt(Math.abs(d))}`);}}
async function requestSlotTuning(){if(!state.current)return;const id=state.current.id;try{$("requestTuneBtn").disabled=true;await api("/api/tuning/request",{gameId:id});state.tuningPending[id]=true;renderSlotTuning();toast("Заявка отправлена админу");}catch(e){toast(errorText(e.message));renderSlotTuning();}}
`}

async function tunedAdminHtml(request,env){
  const res=await houndWorker.fetch(request,env);if(!res.ok)return res;let html=await res.text();
  html=html.replace('</style>',`.tune-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.tune-grid select,.tune-grid input{border:1px solid rgba(255,255,255,.08);background:#070a0e;color:#fff;border-radius:10px;padding:10px}.tune-grid .wide{grid-column:1/-1}.tune-row{padding:11px;border:1px solid rgba(255,255,255,.07);background:#0b1017;border-radius:14px;margin-top:7px}.tune-row-head{display:flex;justify-content:space-between;gap:8px}.tune-row small{display:block;color:#7e899b;font-size:8px;margin-top:3px}.tune-percent{font-weight:950;color:#7ff3c0}.tune-percent.negative{color:#ff8ca5}.tune-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.tune-actions input{grid-column:1/-1;border:1px solid rgba(255,255,255,.08);background:#070a0e;color:#fff;border-radius:9px;padding:9px}.tune-actions button{border-radius:9px;padding:9px;border:1px solid rgba(255,255,255,.08);background:#0d131b;font-size:8px;font-weight:900}.tune-save{color:#85ffd1}.tune-reset{color:#ff91aa}</style>`);
  html=html.replace('<section class="admin-card"><h2>Игроки</h2>',`<section class="admin-card"><h2>Подкрутка слотов</h2><div id="tuningRequests"></div><div class="tune-grid" style="margin-top:12px"><select id="tunePlayer" class="wide"></select><select id="tuneSlot"></select><input id="tunePercent" type="number" min="-50" max="100" value="25" placeholder="−50…100%"><button id="saveTuning" class="approve">СОХРАНИТЬ %</button><button id="resetTuning" class="reject">СБРОСИТЬ В 0%</button></div><div id="activeTunings"></div></section>\n    <section class="admin-card"><h2>Игроки</h2>`);
  return htmlResponse(html,res.status);
}

async function tunedAdminJs(request,env){
  const res=await houndWorker.fetch(request,env);if(!res.ok)return res;let src=await res.text();
  src=src.replace('let users=[],social={markets:[],aid:[]},stats=null;','let users=[],social={markets:[],aid:[]},stats=null,tuning={tunings:[],requests:[],slots:[]};');
  src=src.replace('const [u,s,so]=await Promise.all([','const [u,s,so,tu]=await Promise.all([');
  src=src.replace('api("/api/admin/social",{})\n    ]);','api("/api/admin/social",{}),\n      api("/api/admin/tuning/state",{})\n    ]);');
  src=src.replace('users=u.users||[];stats=s;social=so;\n    renderStats();renderUsers();renderGames();renderSocial();','users=u.users||[];stats=s;social=so;tuning=tu;\n    renderStats();renderUsers();renderGames();renderSocial();renderTuning();');
  src=src.replace('function renderGames(){',`${adminTuningFunctions()}\nfunction renderGames(){`);
  return jsResponse(src,res.status);
}
function adminTuningFunctions(){return String.raw`
function renderTuning(){
  const player=$("tunePlayer"),slot=$("tuneSlot");if(!player||!slot)return;const prevPlayer=player.value,prevSlot=slot.value;
  player.innerHTML=users.map(u=>`<option value="${escAttr(u.telegramId)}">${esc(u.firstName||"Игрок")}${u.username?` · @${esc(u.username)}`:""}</option>`).join("");slot.innerHTML=(tuning.slots||[]).map(s=>`<option value="${escAttr(s.id)}">${esc(s.name)}</option>`).join("");if(prevPlayer&&users.some(u=>u.telegramId===prevPlayer))player.value=prevPlayer;if(prevSlot&&(tuning.slots||[]).some(s=>s.id===prevSlot))slot.value=prevSlot;
  $("saveTuning").onclick=()=>saveTuning(Number($("tunePercent").value||0));$("resetTuning").onclick=()=>saveTuning(0);
  $("tuningRequests").innerHTML=(tuning.requests||[]).length?(tuning.requests||[]).map(r=>`<article class="tune-row" data-tune-request="${escAttr(r.id)}"><div class="tune-row-head"><div><b>${esc(r.playerName)}${r.username?` · @${esc(r.username)}`:""}</b><small>${esc(r.slotName)} · заявка игрока</small></div><b>5 ₽</b></div><div class="tune-actions"><input data-request-percent type="number" min="-50" max="100" value="25"><button class="tune-save" data-request-approve>ПРИМЕНИТЬ</button><button class="tune-reset" data-request-reject>ОТКЛОНИТЬ</button></div></article>`).join(""):empty("Заявок на подкрутку нет.");
  $("activeTunings").innerHTML=(tuning.tunings||[]).length?(tuning.tunings||[]).map(t=>`<article class="tune-row"><div class="tune-row-head"><div><b>${esc(t.playerName)}${t.username?` · @${esc(t.username)}`:""}</b><small>${esc(t.slotName)}</small></div><span class="tune-percent ${Number(t.percent)<0?"negative":""}">${Number(t.percent)>0?"+":""}${Number(t.percent)}%</span></div><div class="tune-actions"><button class="tune-reset" data-tune-clear="${escAttr(t.telegramId)}" data-tune-game="${escAttr(t.gameId)}" style="grid-column:1/-1">СБРОСИТЬ</button></div></article>`).join(""):empty("Активных подкруток нет.");
  document.querySelectorAll("[data-tune-request]").forEach(card=>{card.querySelector("[data-request-approve]").onclick=()=>tuningRequestAction(card.dataset.tuneRequest,"APPROVE",Number(card.querySelector("[data-request-percent]").value||0));card.querySelector("[data-request-reject]").onclick=()=>tuningRequestAction(card.dataset.tuneRequest,"REJECT",0);});document.querySelectorAll("[data-tune-clear]").forEach(b=>b.onclick=()=>setTuning(b.dataset.tuneClear,b.dataset.tuneGame,0));
}
async function saveTuning(percent){const telegramId=$("tunePlayer").value,gameId=$("tuneSlot").value;if(!telegramId||!gameId)return toast("Выбери игрока и слот");return setTuning(telegramId,gameId,percent);}
async function setTuning(telegramId,gameId,percent){try{await api("/api/admin/tuning/set",{telegramId,gameId,percent});toast(percent?`Подкрутка ${percent>0?"+":""}${percent}% сохранена`:"Подкрутка сброшена");tuning=await api("/api/admin/tuning/state",{});renderTuning();}catch(e){toast(errorText(e.message));}}
async function tuningRequestAction(requestId,action,percent){try{await api("/api/admin/tuning/request-action",{requestId,action,percent});toast(action==="APPROVE"?"Подкрутка применена":"Заявка отклонена");tuning=await api("/api/admin/tuning/state",{});renderTuning();}catch(e){toast(errorText(e.message));}}
`}

async function tunedBootstrap(request,env,body){
  const res=await houndWorker.fetch(request,env);let data;try{data=await res.clone().json();}catch{return withBuild(res);}if(!res.ok||data?.ok===false)return withBuild(res);const auth=await authBody(env,body);if(!auth.ok)return json({ok:false,error:auth.error},401);await ensureSchema(env);const id=String(auth.user.id),rows=(await env.DB.prepare(`SELECT game_id,percent FROM casino_slot_tuning WHERE telegram_id=?1 AND percent<>0`).bind(id).all()).results||[],pending=(await env.DB.prepare(`SELECT game_id FROM casino_tuning_requests WHERE telegram_id=?1 AND status='PENDING'`).bind(id).all()).results||[];return json({...data,slotTunings:Object.fromEntries(rows.map(r=>[r.game_id,Number(r.percent||0)])),tuningPending:Object.fromEntries(pending.map(r=>[r.game_id,true])),build:BUILD});
}

async function tunedSlotResponse(request,env,body){
  const res=await houndWorker.fetch(request,env);let data;try{data=await res.clone().json();}catch{return withBuild(res);}if(!res.ok||data?.ok===false)return withBuild(res);const gameId=String(body?.gameId||"");if(!SLOT_IDS.has(gameId))return withBuild(res);const auth=await authBody(env,body);if(!auth.ok)return withBuild(res);await ensureSchema(env);const pct=await getTuningPercent(env,String(auth.user.id),gameId);if(!pct)return json({...data,tuningPercent:0});return json(await applyTuning(env,String(auth.user.id),gameId,pct,data));
}

async function applyTuning(env,userId,gameId,pct,data){
  const roundId=String(data.roundId||data.spinId||"");if(!roundId)return {...data,tuningPercent:pct};const prior=await env.DB.prepare(`SELECT percent,base_payout,adjusted_payout,delta FROM casino_slot_tuning_applied WHERE round_id=?1 LIMIT 1`).bind(roundId).first();if(prior){const u=await env.DB.prepare(`SELECT balance FROM casino_users WHERE telegram_id=?1`).bind(userId).first();return decorateTuned(data,pct,Number(prior.base_payout||0),Number(prior.adjusted_payout||0),Number(prior.delta||0),Number(u?.balance??data.balance));}
  const base=Math.max(0,Math.floor(Number(data.payout||0))),maxWin=Math.max(0,Math.floor(Number(data.maxWin||Number.MAX_SAFE_INTEGER))),adjusted=Math.min(maxWin,Math.max(0,Math.floor(base*(100+pct)/100))),delta=adjusted-base;const round=await env.DB.prepare(`SELECT game_id,bet,result_json FROM casino_rounds WHERE round_id=?1 AND telegram_id=?2 LIMIT 1`).bind(roundId,userId).first();if(!round)return {...data,tuningPercent:pct};const beforeRow=await env.DB.prepare(`SELECT balance FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(userId).first(),before=Number(beforeRow?.balance||0),after=before+delta,result={...(data.result||{}),tuning:{percent:pct,basePayout:base,adjustedPayout:adjusted,delta}};
  const statements=[env.DB.prepare(`INSERT INTO casino_slot_tuning_applied(round_id,telegram_id,game_id,percent,base_payout,adjusted_payout,delta) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(roundId,userId,gameId,pct,base,adjusted,delta),env.DB.prepare(`UPDATE casino_rounds SET payout=?2,multiplier=?3,result_json=?4 WHERE round_id=?1`).bind(roundId,adjusted,round2(adjusted/Math.max(1,Number(data.bet||round.bet||1))),JSON.stringify(result))];if(delta!==0){statements.push(env.DB.prepare(`UPDATE casino_users SET balance=?2,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?1`).bind(userId,after));statements.push(env.DB.prepare(`INSERT INTO casino_ledger(telegram_id,type,amount,balance_before,balance_after,round_id,metadata) VALUES(?1,'SLOT_TUNING',?2,?3,?4,?5,?6)`).bind(userId,delta,before,after,roundId,JSON.stringify({gameId,percent:pct,basePayout:base,adjustedPayout:adjusted})));statements.push(env.DB.prepare(`UPDATE casino_game_totals SET paid=paid+?2,updated_at=CURRENT_TIMESTAMP WHERE game_id=?1`).bind(String(round.game_id||gameId),delta));}await env.DB.batch(statements);if(delta!==0)await correctMarket(env,delta,Number(round.bet||data.bet||1));return decorateTuned(data,pct,base,adjusted,delta,after);
}
function decorateTuned(data,pct,base,adjusted,delta,balance){const result={...(data.result||{}),tuning:{percent:pct,basePayout:base,adjustedPayout:adjusted,delta}};return {...data,payout:adjusted,balance,multiplier:round2(adjusted/Math.max(1,Number(data.bet||1))),result,tuningPercent:pct,tuning:{percent:pct,basePayout:base,adjustedPayout:adjusted,delta}};}
async function correctMarket(env,delta,bet){try{const state=await env.DB.prepare(`SELECT price FROM casino_market_state WHERE id=1`).first();if(!state)return;const impact=clamp(((-delta)/Math.max(1,bet))*.018,-.03,.03),next=Math.max(10,round4(Number(state.price||1000)*(1+impact))),now=Date.now();await env.DB.batch([env.DB.prepare(`UPDATE casino_market_state SET price=?1,updated_at=CURRENT_TIMESTAMP WHERE id=1`).bind(next),env.DB.prepare(`INSERT INTO casino_market_points(price,house_net,wagered,created_ms) VALUES(?1,?2,?3,?4)`).bind(next,-Math.floor(delta),0,now)]);}catch(error){console.warn("TUNING_MARKET_CORRECTION",error);}}

async function createTuningRequest(env,body){const auth=await authBody(env,body);if(!auth.ok)return json({ok:false,error:auth.error},401);await ensureSchema(env);const gameId=String(body?.gameId||"");if(!SLOT_IDS.has(gameId))return json({ok:false,error:"BAD_SLOT"},400);const userId=String(auth.user.id),old=await env.DB.prepare(`SELECT id FROM casino_tuning_requests WHERE telegram_id=?1 AND game_id=?2 AND status='PENDING' LIMIT 1`).bind(userId,gameId).first();if(old)return json({ok:true,requestId:old.id,status:"PENDING",duplicate:true});const id=crypto.randomUUID();await env.DB.prepare(`INSERT INTO casino_tuning_requests(id,telegram_id,game_id,status) VALUES(?1,?2,?3,'PENDING')`).bind(id,userId,gameId).run();return json({ok:true,requestId:id,status:"PENDING"});}

async function adminTuningState(env,body){const admin=await requireAdmin(env,body);if(admin.error)return admin.error;await ensureSchema(env);const tunings=(await env.DB.prepare(`SELECT t.telegram_id,t.game_id,t.percent,u.first_name,u.username FROM casino_slot_tuning t LEFT JOIN casino_users u ON u.telegram_id=t.telegram_id WHERE t.percent<>0 ORDER BY t.updated_at DESC`).all()).results||[],requests=(await env.DB.prepare(`SELECT r.id,r.telegram_id,r.game_id,r.status,r.created_at,u.first_name,u.username FROM casino_tuning_requests r LEFT JOIN casino_users u ON u.telegram_id=r.telegram_id WHERE r.status='PENDING' ORDER BY r.created_at ASC`).all()).results||[],nameOf=id=>TUNABLE_SLOTS.find(s=>s.id===id)?.name||id;return json({ok:true,slots:TUNABLE_SLOTS,tunings:tunings.map(t=>({telegramId:String(t.telegram_id),gameId:t.game_id,percent:Number(t.percent),playerName:t.first_name||"Игрок",username:t.username,slotName:nameOf(t.game_id)})),requests:requests.map(r=>({id:r.id,telegramId:String(r.telegram_id),gameId:r.game_id,status:r.status,playerName:r.first_name||"Игрок",username:r.username,slotName:nameOf(r.game_id),createdAt:r.created_at}))});}
async function adminSetTuning(env,body){const admin=await requireAdmin(env,body);if(admin.error)return admin.error;await ensureSchema(env);const telegramId=String(body?.telegramId||""),gameId=String(body?.gameId||""),percent=validatePercent(body?.percent);if(!telegramId||!SLOT_IDS.has(gameId))return json({ok:false,error:"BAD_TUNING_TARGET"},400);await setTuning(env,telegramId,gameId,percent,String(admin.user.telegram_id));return json({ok:true,telegramId,gameId,percent});}
async function adminTuningRequestAction(env,body){const admin=await requireAdmin(env,body);if(admin.error)return admin.error;await ensureSchema(env);const requestId=String(body?.requestId||""),action=String(body?.action||"").toUpperCase(),row=await env.DB.prepare(`SELECT * FROM casino_tuning_requests WHERE id=?1 AND status='PENDING' LIMIT 1`).bind(requestId).first();if(!row)return json({ok:false,error:"REQUEST_NOT_FOUND"},404);if(action==="REJECT"){await env.DB.prepare(`UPDATE casino_tuning_requests SET status='REJECTED',resolved_at=CURRENT_TIMESTAMP,resolved_by=?2 WHERE id=?1`).bind(requestId,String(admin.user.telegram_id)).run();return json({ok:true,status:"REJECTED"});}if(action!=="APPROVE")return json({ok:false,error:"BAD_ACTION"},400);const percent=validatePercent(body?.percent);await setTuning(env,String(row.telegram_id),String(row.game_id),percent,String(admin.user.telegram_id));await env.DB.prepare(`UPDATE casino_tuning_requests SET status='APPROVED',applied_percent=?2,resolved_at=CURRENT_TIMESTAMP,resolved_by=?3 WHERE id=?1`).bind(requestId,percent,String(admin.user.telegram_id)).run();return json({ok:true,status:"APPROVED",percent});}
async function setTuning(env,telegramId,gameId,percent,adminId){if(percent===0){await env.DB.prepare(`DELETE FROM casino_slot_tuning WHERE telegram_id=?1 AND game_id=?2`).bind(telegramId,gameId).run();return;}await env.DB.prepare(`INSERT INTO casino_slot_tuning(telegram_id,game_id,percent,updated_by) VALUES(?1,?2,?3,?4) ON CONFLICT(telegram_id,game_id) DO UPDATE SET percent=excluded.percent,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`).bind(telegramId,gameId,percent,adminId).run();}
async function getTuningPercent(env,userId,gameId){const row=await env.DB.prepare(`SELECT percent FROM casino_slot_tuning WHERE telegram_id=?1 AND game_id=?2 LIMIT 1`).bind(userId,gameId).first();return row?validatePercent(row.percent):0;}function validatePercent(v){const n=Math.round(Number(v)||0);if(n<MIN_TUNING||n>MAX_TUNING)throw new Error(`TUNING_RANGE_${MIN_TUNING}_${MAX_TUNING}`);return n;}async function authBody(env,body){return validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);}async function requireAdmin(env,body){const auth=await authBody(env,body);if(!auth.ok)return {error:json({ok:false,error:auth.error},401)};const user=await env.DB.prepare(`SELECT * FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(String(auth.user.id)).first();if(!user||user.role!=="ADMIN")return {error:json({ok:false,error:"ADMIN_ONLY"},403)};return {user};}
async function ensureSchema(env){if(schemaReady)return;await env.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_slot_tuning(telegram_id TEXT NOT NULL,game_id TEXT NOT NULL,percent INTEGER NOT NULL DEFAULT 0,updated_by TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(telegram_id,game_id))`).run();await env.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_tuning_requests(id TEXT PRIMARY KEY,telegram_id TEXT NOT NULL,game_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',applied_percent INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,resolved_at TEXT,resolved_by TEXT)`).run();await env.DB.prepare(`CREATE TABLE IF NOT EXISTS casino_slot_tuning_applied(round_id TEXT PRIMARY KEY,telegram_id TEXT NOT NULL,game_id TEXT NOT NULL,percent INTEGER NOT NULL,base_payout INTEGER NOT NULL,adjusted_payout INTEGER NOT NULL,delta INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tuning_requests_status ON casino_tuning_requests(status,created_at)`).run();schemaReady=true;}
function withBuild(res){try{const headers=new Headers(res.headers);headers.set("x-fit-build",BUILD);return new Response(res.body,{status:res.status,statusText:res.statusText,headers});}catch{return res;}}function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});}function jsResponse(text,status=200){return new Response(text,{status,headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});}function htmlResponse(text,status=200){return new Response(text,{status,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});}function round2(n){return Math.floor(Number(n||0)*100)/100;}function round4(n){return Math.round(Number(n||0)*10000)/10000;}function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
