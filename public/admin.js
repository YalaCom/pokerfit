const tg=window.Telegram?.WebApp;
const $=id=>document.getElementById(id);
let users=[],social={markets:[],aid:[]},stats=null;
boot();

async function boot(){
  if(!tg?.initData){showError("Открой админку из Telegram Mini App");return;}
  tg.ready();tg.expand();
  try{
    const b=await api("/api/bootstrap",{});
    if(!b.player?.isAdmin){showError("Доступ только для администратора");return;}
    $("search").oninput=renderUsers;
    await loadAll();
  }catch(e){showError(errorText(e.message));}
}

async function loadAll(){
  try{
    const [u,s,so]=await Promise.all([
      api("/api/admin/users",{}),
      api("/api/admin/stats",{}),
      api("/api/admin/social",{})
    ]);
    users=u.users||[];stats=s;social=so;
    renderStats();renderUsers();renderGames();renderSocial();
  }catch(e){toast(errorText(e.message));}
}

function renderStats(){
  const t=stats?.totals||{},so=stats?.social||{},m=stats?.market||{};
  $("adminStats").innerHTML=`
    <div class="admin-stat"><small>ИГРОКОВ</small><b>${fmt(t.players)}</b></div>
    <div class="admin-stat"><small>ФИШЕК</small><b>${fmt(t.chips)}</b></div>
    <div class="admin-stat"><small>PENDING BETS</small><b>${fmt(so.pending_bets)}</b></div>
    <div class="admin-stat"><small>FIT INDEX</small><b>${Number(m.price||1000).toFixed(2)}</b></div>`;
}

function renderUsers(){
  const q=$("search").value.trim().toLowerCase();
  const list=users.filter(u=>!q||String(u.telegramId).includes(q)||String(u.username||"").toLowerCase().includes(q)||`${u.firstName||""} ${u.lastName||""}`.toLowerCase().includes(q));
  $("users").innerHTML=list.length?list.map(u=>`
    <article class="admin-user" data-user="${escAttr(u.telegramId)}">
      <div class="admin-user-head">
        <div><b>${esc(u.firstName||"Игрок")} ${esc(u.lastName||"")}${u.isAdmin?" · ADMIN":""}</b><small>${u.username?`@${esc(u.username)} · `:""}ID ${esc(u.telegramId)}</small></div>
        <span>${fmt(u.balance)}</span>
      </div>
      <div class="admin-actions">
        <input data-amount type="number" step="1000" placeholder="Сумма">
        <button class="add" data-add>+ ВЫДАТЬ</button><button class="sub" data-sub>− СПИСАТЬ</button>
      </div>
    </article>`).join(""):empty("Игроки не найдены");
  document.querySelectorAll("[data-user]").forEach(card=>{
    const id=card.dataset.user,amount=()=>Math.max(0,Math.floor(Number(card.querySelector("[data-amount]").value||0)));
    card.querySelector("[data-add]").onclick=()=>adjust(id,amount());
    card.querySelector("[data-sub]").onclick=()=>adjust(id,-amount());
  });
}

async function adjust(id,delta){
  if(!delta)return toast("Укажи сумму");
  try{
    const r=await api("/api/admin/adjust",{telegramId:id,delta});
    const u=users.find(x=>x.telegramId===id);if(u)u.balance=r.balance;
    toast(`Баланс ${fmt(r.balance)}`);renderUsers();
    stats=await api("/api/admin/stats",{});renderStats();renderGames();
  }catch(e){toast(errorText(e.message));}
}

function renderSocial(){
  const pending=(social.markets||[]).filter(m=>m.status==="PENDING");
  const open=(social.markets||[]).filter(m=>m.status==="OPEN");
  $("pendingMarkets").innerHTML=pending.length?pending.map(m=>marketCard(m,true)).join(""):empty("Ничего не ожидает.");
  $("openMarkets").innerHTML=open.length?open.map(m=>marketCard(m,false)).join(""):empty("Нет открытых ставок.");
  $("aidRequests").innerHTML=(social.aid||[]).length?social.aid.map(a=>`
    <article class="admin-aid">
      <div class="admin-aid-head"><div><b>${esc(a.name)}</b><small>${a.username?`@${esc(a.username)} · `:""}ID ${esc(a.telegramId)}</small></div><b>${fmt(a.balance)}</b></div>
      <small>Нужно закрыть отрицательный баланс · запрос ${fmt(a.amount)}</small>
      <div class="aid-actions"><button class="approve" data-aid-approve="${escAttr(a.id)}">ПОМОЧЬ</button><button class="reject" data-aid-reject="${escAttr(a.id)}">ОТКЛОНИТЬ</button></div>
    </article>`).join(""):empty("Запросов нет.");
  bindSocial();
}

function marketCard(m,pending){
  const options=(m.outcomes||[]).map(o=>`<option value="${escAttr(o.name)}">${esc(o.name)} · банк ${fmt(o.amount)}</option>`).join("");
  return `<article class="admin-market" data-market-card="${escAttr(m.id)}">
    <div class="admin-market-head"><div><b>${esc(m.title)}</b><small>${m.creator?.username?`@${esc(m.creator.username)}`:esc(m.creator?.name||"Игрок")} · банк ${fmt(m.totalPool)}</small></div><span class="status-pill ${String(m.status).toLowerCase()}">${esc(m.status)}</span></div>
    <small>${esc(m.description||"Без описания")}</small>
    <div class="market-outcomes">${(m.outcomes||[]).map(o=>`<span>${esc(o.name)} · ${fmt(o.amount)}</span>`).join("")}</div>
    <div class="market-actions">
      ${pending?`<button class="approve" data-market-action="APPROVE">ПОДТВЕРДИТЬ</button><button class="delete" data-market-action="DELETE">УДАЛИТЬ</button>`:
      `<select data-winning>${options}</select>
       <button class="settle" data-market-action="SETTLE">ЗАВЕРШИТЬ</button><button class="cancel" data-market-action="CANCEL">ОТМЕНА + ВОЗВРАТ</button>
       <button class="delete" data-market-action="DELETE" style="grid-column:1/-1">УДАЛИТЬ + ВОЗВРАТ</button>`}
    </div>
  </article>`;
}

function bindSocial(){
  document.querySelectorAll("[data-market-card]").forEach(card=>{
    card.querySelectorAll("[data-market-action]").forEach(btn=>btn.onclick=()=>adminMarketAction(card.dataset.marketCard,btn.dataset.marketAction,card.querySelector("[data-winning]")?.value));
  });
  document.querySelectorAll("[data-aid-approve]").forEach(b=>b.onclick=()=>aidAction(b.dataset.aidApprove,"APPROVE"));
  document.querySelectorAll("[data-aid-reject]").forEach(b=>b.onclick=()=>aidAction(b.dataset.aidReject,"REJECT"));
}

async function adminMarketAction(marketId,action,winningOutcome){
  const label=action==="SETTLE"?`Подтвердить победу исхода «${winningOutcome}»?`:action==="CANCEL"?"Отменить событие и вернуть все ставки?":action==="DELETE"?"Удалить событие? Для открытого события деньги вернутся игрокам.":null;
  if(label&&!confirm(label))return;
  try{
    await api("/api/admin/bets/action",{marketId,action,winningOutcome});
    toast("Готово");social=await api("/api/admin/social",{});stats=await api("/api/admin/stats",{});renderSocial();renderStats();
  }catch(e){toast(errorText(e.message));}
}

async function aidAction(requestId,action){
  try{
    await api("/api/admin/aid/action",{requestId,action});
    toast(action==="APPROVE"?"Баланс восстановлен":"Запрос отклонён");
    await loadAll();
  }catch(e){toast(errorText(e.message));}
}

function renderGames(){
  $("games").innerHTML=(stats?.games||[]).length?(stats.games||[]).map(g=>`
    <div class="admin-game"><b>${esc(g.game_id)}</b><span>${fmt(g.rounds)} раундов</span><span>${fmt(g.wagered)}</span><span>RTP ${Number(g.rtp||0).toFixed(2)}%</span></div>`).join(""):empty("Пока нет сыгранных слотов.");
}

function showError(t){document.body.innerHTML=`<main class="admin-shell"><div class="admin-error">${esc(t)}</div></main>`;}
async function api(path,data){
  const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({initData:tg.initData,...data})});
  const j=await r.json().catch(()=>({ok:false,error:"BAD_RESPONSE"}));
  if(!r.ok||!j.ok)throw new Error(j.error||`HTTP_${r.status}`);return j;
}
function errorText(e){return String(e||"ERROR").replaceAll("_"," ");}
function empty(t){return `<div class="admin-error">${esc(t)}</div>`;}
function fmt(v){return Number(v||0).toLocaleString("ru-RU");}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escAttr(v){return esc(v);}
function toast(t){const el=$("toast");el.textContent=t;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),1900);}
