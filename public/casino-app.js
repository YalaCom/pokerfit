import {GameEngine} from "./game/core/GameEngine.js";
import {GameState} from "./game/core/GameStateMachine.js";

const tg=window.Telegram?.WebApp;
const $=id=>document.getElementById(id);
const BET_STEPS=[1000,5000,10000,25000,50000,100000,250000,500000,1000000,2500000,5000000];
const state={
  player:null,slots:[],daily:null,jackpot:0,market:null,current:null,engine:null,
  bet:10000,autoRemaining:0,autoStop:false,currentTab:"slots",previousTab:"slots",
  tradeDuration:2,bets:null,loans:null
};
let toastTimer=null,marketRefreshBusy=false;
boot();

async function boot(){
  setBoot(8,"TELEGRAM SESSION");
  if(!tg?.initData){$("bootText").textContent="OPEN INSIDE TELEGRAM";return;}
  tg.ready();tg.expand();
  syncTelegramInsets();
  try{tg.setHeaderColor?.("#020304");tg.setBackgroundColor?.("#020304");}catch{}
  try{
    setBoot(24,"AUTHENTICATING");
    const data=await api("/api/bootstrap",{});
    state.player=data.player;state.slots=data.slots||[];state.daily=data.daily;state.jackpot=Number(data.jackpot||0);state.market=data.market||null;
    bindGlobal();renderSlots();renderDaily();refreshHeader();renderMarketMini();renderBadges(data.counts||{});
    setBoot(100,"READY");
    $("app").classList.remove("hidden");
    setTimeout(()=>$("bootScreen").classList.add("hide"),180);
    setTimeout(()=>$("bootScreen").classList.add("hidden"),620);
  }catch(error){$("bootText").textContent=`START ERROR: ${errorText(error.message)}`;}
}

function bindGlobal(){
  $("profileButton").onclick=openProfile;
  $("adminBtn").onclick=()=>location.href="/admin.html";
  $("dailyCard").onclick=claimDaily;
  $("marketQuick").onclick=()=>setTab("market");
  $("loanQuick").onclick=()=>setTab("loans");
  $("addBetBtn").onclick=openCreateBet;
  $("refreshBets").onclick=()=>loadBets(true);
  $("refreshMarket").onclick=()=>loadMarket(true);
  $("refreshLoans").onclick=()=>loadLoans(true);
  $("requestLoanBtn").onclick=requestLoan;
  $("loanAmount").oninput=updateLoanPreview;
  $("adminHelpBtn").onclick=requestAdminHelp;
  $("tradeUp").onclick=()=>openTrade("UP");
  $("tradeDown").onclick=()=>openTrade("DOWN");
  document.querySelectorAll("[data-duration]").forEach(b=>b.onclick=()=>selectDuration(Number(b.dataset.duration)));
  document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

  $("backBtn").onclick=closeSlot;
  $("infoBtn").onclick=openGameInfo;
  $("spinBtn").onclick=()=>spinOnce();
  $("bonusBuyBtn").onclick=openBonusBuy;
  $("autoBtn").onclick=()=>state.autoRemaining?stopAuto():openAuto();
  document.querySelector("[data-bet-down]").onclick=()=>changeBet(-1);
  document.querySelector("[data-bet-up]").onclick=()=>changeBet(1);
  $("betInput").onchange=()=>{state.bet=normalizeBet($("betInput").value);$("betInput").value=state.bet;};

  $("modalClose").onclick=closeModal;
  $("modal").onclick=e=>{if(e.target===$("modal"))closeModal();};

  window.addEventListener("resize",()=>{syncTelegramInsets();if(state.market)drawMarketChart(state.market.points||[]);},{passive:true});
  try{
    tg?.onEvent?.("contentSafeAreaChanged",syncTelegramInsets);
    tg?.onEvent?.("safeAreaChanged",syncTelegramInsets);
    tg?.onEvent?.("viewportChanged",syncTelegramInsets);
  }catch{}

  setInterval(()=>{
    updateCountdowns();
    if(state.currentTab==="market"&&!$("marketView").classList.contains("hidden"))loadMarket(true);
  },30000);
}

function setTab(tab){
  if(!["slots","bets","market","loans"].includes(tab))return;
  if(state.current){closeSlot();return setTab(tab);}
  state.currentTab=tab;
  document.querySelectorAll(".tab-view").forEach(v=>v.classList.remove("active"));
  $(`${tab}View`)?.classList.add("active");
  document.querySelectorAll("[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  window.scrollTo({top:0,behavior:"auto"});
  if(tab==="bets")loadBets(false);
  if(tab==="market")loadMarket(false);
  if(tab==="loans")loadLoans(false);
}

function renderSlots(){
  const desc={
    aureus:"Каскады, растущий множитель и отдельная Free Spins-сессия.",
    honey_fruits:"10×8 Ways, Giant Bee и растущая бонусная пчела.",
    lucky_coin_collector:"Монеты 500–50 000, Collector, ×2/×5 и Sticky Coin bonus.",
    neon_beast_rampage:"Portal Morph и пятираундовый Rampage с FURY.",
    olympus_storm:"Full-Reel Olympus Wild, sticky-барабаны и молнии по выигрышам."
  };
  $("slotGrid").innerHTML=state.slots.map((s,i)=>`
    <button class="slot-card" data-slot="${esc(s.id)}">
      <div class="slot-art"><img src="${esc(s.cover)}" alt="${esc(s.name)}"></div>
      <div class="slot-copy">
        <small>${esc(s.badge||"SLOT")} · MAX WIN ×${Number(s.maxWin||1000)}</small>
        <h3>${esc(s.name)}</h3>
        <p>${esc(desc[s.id]||s.mechanic||"Server-authoritative slot")}</p>
        <div class="slot-tags"><span>${Number(s.cols)}×${Number(s.rows)}</span><span>${esc(shortMechanic(s))}</span>${s.bonusBuy?'<span>FEATURE BUY</span>':""}</div>
        <div class="slot-play">PLAY SLOT →</div>
      </div>
    </button>`).join("");
  document.querySelectorAll("[data-slot]").forEach(card=>card.onclick=()=>openSlot(card.dataset.slot,card));
}

function shortMechanic(s){
  if(s.id==="olympus_storm")return "STICKY OLYMPUS";
  if(s.id==="neon_beast_rampage")return "RAMPAGE";
  if(s.id==="lucky_coin_collector")return "COIN FEATURE";
  if(s.id==="honey_fruits")return "GIANT BEE";
  return "TUMBLE";
}

/* ---------------- COMMUNITY BETS ---------------- */

async function loadBets(force){
  if(!force&&state.bets)return renderBets();
  $("openBets").innerHTML=loadingCard();
  try{
    const d=await api("/api/social/state",{});
    state.bets=d.bets;state.loans=d.loans;state.market=d.market;applyPlayer(d.player);
    renderBets();renderMarket(d.market);renderLoans(d.loans);
  }catch(e){$("openBets").innerHTML=empty(errorText(e.message));}
}

function renderBets(){
  const b=state.bets||{open:[],mine:[]};
  $("openBets").innerHTML=b.open?.length?b.open.map(renderBetCard).join(""):empty("Пока нет подтверждённых ставок.");
  $("myBets").innerHTML=b.mine?.length?b.mine.map(renderMineBet).join(""):empty("Ты ещё не создавал события.");
  bindOutcomeButtons();
}

function renderBetCard(m){
  const ticket=m.userBet?`<div class="my-ticket">ТВОЯ СТАВКА: <b>${esc(m.userBet.outcome)}</b> · ${fmt(m.userBet.amount)}</div>`:"";
  return `<article class="community-card">
    <div class="card-kicker"><span>${esc(m.creator?.username?`@${m.creator.username}`:m.creator?.name||"Игрок")}</span><span class="status-pill open">OPEN</span></div>
    <h3>${esc(m.title)}</h3><p>${esc(m.description||"Без описания")}</p>
    <div class="pool-total">ОБЩИЙ БАНК <b>${fmt(m.totalPool)}</b></div>
    <div class="outcome-grid">${(m.outcomes||[]).map((o,i)=>`
      <button class="outcome-btn" data-market="${esc(m.id)}" data-outcome-index="${i}" ${m.userBet?"disabled":""}>
        <span><b>${esc(o.name)}</b><small>банк ${fmt(o.amount)} · ${o.tickets} ставок</small></span>
        <span class="outcome-odds">${o.estimatedOdds?`≈ ×${Number(o.estimatedOdds).toFixed(2)}`:"NEW"}</span>
      </button>`).join("")}</div>${ticket}
  </article>`;
}

function renderMineBet(m){
  return `<article class="community-card">
    <div class="card-kicker"><span>МОЁ СОБЫТИЕ</span><span class="status-pill ${String(m.status).toLowerCase()}">${esc(m.status)}</span></div>
    <h3>${esc(m.title)}</h3><p>${esc(m.description||"Без описания")}</p>
    <div class="pool-total">БАНК <b>${fmt(m.totalPool)}</b>${m.winningOutcome?` · ПОБЕДИЛО <b>${esc(m.winningOutcome)}</b>`:""}</div>
  </article>`;
}

function bindOutcomeButtons(){
  document.querySelectorAll("[data-market][data-outcome-index]").forEach(btn=>btn.onclick=()=>{
    const m=(state.bets?.open||[]).find(x=>x.id===btn.dataset.market);
    const o=m?.outcomes?.[Number(btn.dataset.outcomeIndex)];
    if(m&&o)openPlaceBet(m,o.name);
  });
}

function openCreateBet(){
  showModal(`<small>NEW COMMUNITY BET</small><h2>Добавить ставку</h2>
    <p>После отправки событие увидит админ. Для остальных игроков оно появится только после подтверждения.</p>
    <div class="modal-form">
      <label><span>НАЗВАНИЕ</span><input id="newBetTitle" maxlength="80" placeholder="Например: Кто опоздает на смену?"></label>
      <label><span>ОПИСАНИЕ</span><textarea id="newBetDesc" maxlength="500" placeholder="Что именно считается результатом"></textarea></label>
      <label><span>ИСХОДЫ · 2–6</span><div id="outcomeEditor" class="outcome-editor"></div></label>
      <button id="addOutcome" class="ghost-action" type="button">+ ЕЩЁ ИСХОД</button>
      <button id="submitBet" class="primary-action wide">ОТПРАВИТЬ АДМИНУ</button>
    </div>`);
  addOutcomeInput("Да");addOutcomeInput("Нет");
  $("addOutcome").onclick=()=>{if(document.querySelectorAll(".outcome-line").length<6)addOutcomeInput("");};
  $("submitBet").onclick=submitNewBet;
}

function addOutcomeInput(value){
  const line=document.createElement("div");line.className="outcome-line";
  line.innerHTML=`<input maxlength="40" value="${escAttr(value)}" placeholder="Исход"><button type="button">×</button>`;
  line.querySelector("button").onclick=()=>{if(document.querySelectorAll(".outcome-line").length>2)line.remove();};
  $("outcomeEditor").appendChild(line);
}

async function submitNewBet(){
  const title=$("newBetTitle").value,description=$("newBetDesc").value;
  const outcomes=[...document.querySelectorAll(".outcome-line input")].map(x=>x.value.trim()).filter(Boolean);
  try{
    $("submitBet").disabled=true;
    await api("/api/bets/create",{title,description,outcomes});
    closeModal();state.bets=null;toast("Отправлено администратору");await loadBets(true);
  }catch(e){toast(errorText(e.message));$("submitBet").disabled=false;}
}

function openPlaceBet(m,outcome){
  showModal(`<small>PLACE BET</small><h2>${esc(m.title)}</h2><p>Исход: <b>${esc(outcome)}</b>. Сумма сразу спишется с общего баланса. На одно событие можно выбрать только один исход.</p>
    <div class="modal-form"><label><span>СУММА</span><input id="communityAmount" type="number" min="1000" max="5000000" value="10000"></label>
    <button id="communityConfirm" class="primary-action wide">ПОСТАВИТЬ НА ${esc(outcome)}</button></div>`);
  $("communityConfirm").onclick=async()=>{
    try{
      $("communityConfirm").disabled=true;
      const d=await api("/api/bets/place",{marketId:m.id,outcome,amount:Number($("communityAmount").value),requestId:requestId()});
      applyBalance(d.balance);closeModal();state.bets=null;toast("Ставка принята");await loadBets(true);
    }catch(e){toast(errorText(e.message));$("communityConfirm").disabled=false;}
  };
}

/* ---------------- MARKET ---------------- */

function selectDuration(hours){
  state.tradeDuration=hours;
  document.querySelectorAll("[data-duration]").forEach(b=>b.classList.toggle("active",Number(b.dataset.duration)===hours));
}

async function loadMarket(force){
  if(marketRefreshBusy)return;
  if(!force&&state.market?.points?.length){renderMarket(state.market);return;}
  marketRefreshBusy=true;
  try{
    const d=await api("/api/market/state",{});
    state.market=d;applyBalance(d.balance);renderMarket(d);
  }catch(e){toast(errorText(e.message));}
  finally{marketRefreshBusy=false;}
}

function renderMarket(m){
  if(!m)return;
  const price=Number(m.price||1000),points=m.points||[],first=Number(points[0]?.price||price);
  const pct=first?((price-first)/first*100):0;m.changePct=pct;
  $("marketPrice").textContent=price.toFixed(2);
  $("marketDelta").textContent=`${pct>=0?"+":""}${pct.toFixed(2)}%`;
  $("marketDelta").classList.toggle("negative",pct<0);
  $("tradePositions").innerHTML=(m.positions||[]).length?m.positions.map(renderPosition).join(""):empty("Открытых прогнозов пока нет.");
  state.market=m;renderMarketMini();drawMarketChart(points);updateCountdowns();
}

function renderPosition(p){
  const status=String(p.status||"OPEN"),positive=["WON","PUSH"].includes(status);
  return `<article class="position-card" data-close-ms="${Number(p.closeMs||0)}">
    <div class="position-head"><div class="card-kicker"><span>${p.direction==="UP"?"UP ↗":"DOWN ↘"} · ${p.durationHours}H</span></div><span class="status-pill ${status.toLowerCase()}">${status}</span></div>
    <h3>${fmt(p.amount)} · ENTRY ${Number(p.entryPrice).toFixed(2)}</h3>
    <div class="position-meta"><span>EXIT <b>${p.exitPrice==null?"—":Number(p.exitPrice).toFixed(2)}</b></span><span>PAYOUT <b>${fmt(p.payout)}</b></span></div>
    ${status==="OPEN"?'<div class="countdown">ДО ЗАКРЫТИЯ <strong data-countdown>—</strong></div>':""}
  </article>`;
}

async function openTrade(direction){
  const amount=Number($("tradeAmount").value);
  showModal(`<small>FIT INDEX</small><h2>${direction==="UP"?"Прогноз вверх ↗":"Прогноз вниз ↘"}</h2>
    <p>Срок: <b>${state.tradeDuration} часа</b>. Ставка: <b>${fmt(amount)}</b>. Победа возвращает ×1.90. Цена закрытия зависит только от реальных результатов игроков в слотах.</p>
    <button id="tradeConfirm" class="primary-action wide">ОТКРЫТЬ ${direction}</button>`);
  $("tradeConfirm").onclick=async()=>{
    try{
      $("tradeConfirm").disabled=true;
      const d=await api("/api/market/open",{direction,durationHours:state.tradeDuration,amount,requestId:requestId()});
      applyBalance(d.balance);closeModal();toast("Позиция открыта");state.market=null;await loadMarket(true);
    }catch(e){toast(errorText(e.message));$("tradeConfirm").disabled=false;}
  };
}

function drawMarketChart(points){
  const canvas=$("marketChart");if(!canvas)return;
  const box=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
  const w=Math.max(1,box.width),h=Math.max(1,box.height);
  canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);
  const ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const data=(points?.length?points:[{price:1000,time:Date.now()}]).slice(-80);
  const vals=data.map(x=>Number(x.price)||1000),min=Math.min(...vals),max=Math.max(...vals),range=Math.max(.01,max-min);
  const pad=18,plotW=w-pad*2,plotH=h-pad*2;

  ctx.strokeStyle="rgba(255,255,255,.055)";ctx.lineWidth=1;
  for(let i=1;i<5;i++){const y=pad+plotH*i/5;ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke();}
  for(let i=1;i<6;i++){const x=pad+plotW*i/6;ctx.beginPath();ctx.moveTo(x,pad);ctx.lineTo(x,h-pad);ctx.stroke();}

  const coords=data.map((p,i)=>({
    x:pad+(data.length===1?plotW/2:plotW*i/(data.length-1)),
    y:pad+plotH-(Number(p.price)-min)/range*plotH
  }));
  if(data.length===1){coords.push({x:w-pad,y:coords[0].y});coords[0].x=pad;}

  const rising=vals.at(-1)>=vals[0],lineGrad=ctx.createLinearGradient(0,0,w,0);
  lineGrad.addColorStop(0,rising?"#62e6b2":"#ff718e");lineGrad.addColorStop(.5,"#78dcff");lineGrad.addColorStop(1,"#ad84ff");
  const fill=ctx.createLinearGradient(0,pad,0,h-pad);fill.addColorStop(0,rising?"rgba(79,226,171,.18)":"rgba(255,91,126,.16)");fill.addColorStop(1,"rgba(112,93,255,0)");

  ctx.beginPath();coords.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.lineTo(coords.at(-1).x,h-pad);ctx.lineTo(coords[0].x,h-pad);ctx.closePath();ctx.fillStyle=fill;ctx.fill();
  ctx.beginPath();coords.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=lineGrad;ctx.lineWidth=2.2;ctx.shadowColor=rising?"#68e0bd":"#ff6f90";ctx.shadowBlur=10;ctx.stroke();ctx.shadowBlur=0;

  const last=coords.at(-1);ctx.beginPath();ctx.arc(last.x,last.y,4.5,0,Math.PI*2);ctx.fillStyle="#fff";ctx.fill();ctx.beginPath();ctx.arc(last.x,last.y,8,0,Math.PI*2);ctx.strokeStyle="rgba(121,222,255,.35)";ctx.stroke();
}

function renderMarketMini(){
  const m=state.market;if(!m)return;
  const price=Number(m.price||1000),pct=Number(m.changePct??0);
  $("marketMiniPrice").textContent=price.toFixed(2);
  $("marketMiniChange").textContent=`${pct>=0?"+":""}${pct.toFixed(2)}%`;
  $("marketMiniChange").style.color=pct<0?"#ff829d":"#6bdcb0";
}

/* ---------------- LOANS ---------------- */

async function loadLoans(force){
  if(!force&&state.loans){renderLoans(state.loans);return;}
  try{
    const d=await api("/api/loans/state",{});
    state.loans=d;applyBalance(d.balance);renderLoans(d);
  }catch(e){toast(errorText(e.message));}
}

function renderLoans(d){
  if(!d)return;
  state.loans=d;
  const me=String(state.player?.telegramId||"");
  const peers=d.peers||[];
  $("loanPeer").innerHTML=peers.length?peers.map(p=>`<option value="${escAttr(p.telegramId)}">${esc(p.firstName||"Игрок")}${p.username?` · @${esc(p.username)}`:""}</option>`).join(""):'<option value="">Нет других игроков</option>';
  $("requestLoanBtn").disabled=!peers.length;

  const incoming=(d.loans||[]).filter(l=>l.lenderId===me&&l.status==="REQUESTED");
  $("incomingLoans").innerHTML=incoming.length?incoming.map(renderIncomingLoan).join(""):empty("Новых запросов к тебе нет.");

  const mine=(d.loans||[]).filter(l=>!(l.lenderId===me&&l.status==="REQUESTED"));
  $("myLoans").innerHTML=mine.length?mine.map(renderLoanCard).join(""):empty("История займов пустая.");

  const negative=Number(d.balance)<0;
  $("debtAlert").classList.toggle("hidden",!negative);
  if(negative){
    const pending=d.adminHelp?.status==="PENDING";
    $("adminHelpBtn").disabled=pending;
    $("adminHelpBtn").textContent=pending?"ЗАПРОС УЖЕ ОТПРАВЛЕН":"ПОПРОСИТЬ АДМИНА";
  }
  bindLoanButtons();updateLoanPreview();updateCountdowns();
}

function renderIncomingLoan(l){
  return `<article class="loan-card">
    <div class="loan-head"><div class="card-kicker"><span>ПРОСИТ У ТЕБЯ</span></div><span class="status-pill requested">REQUESTED</span></div>
    <h3>${esc(l.borrowerName)} · ${fmt(l.principal)}</h3>
    <div class="loan-meta"><span>Вернёт <b>${fmt(l.repayment)}</b></span><span>Срок <b>24 часа</b></span></div>
    <div class="loan-actions"><button class="accept" data-loan-accept="${escAttr(l.id)}">ВЫДАТЬ</button><button class="decline" data-loan-decline="${escAttr(l.id)}">ОТКЛОНИТЬ</button></div>
  </article>`;
}

function renderLoanCard(l){
  const me=String(state.player?.telegramId||""),borrower=l.borrowerId===me,person=borrower?l.lenderName:l.borrowerName;
  return `<article class="loan-card" ${l.dueMs?`data-close-ms="${l.dueMs}"`:""}>
    <div class="loan-head"><div class="card-kicker"><span>${borrower?"Я ДОЛЖЕН":"МНЕ ДОЛЖНЫ"} · ${esc(person)}</span></div><span class="status-pill ${String(l.status).toLowerCase()}">${esc(l.status)}</span></div>
    <h3>${fmt(l.principal)} → ${fmt(l.repayment)}</h3>
    <div class="loan-meta"><span>Процент <b>15%</b></span>${l.dueMs?'<span>Срок <b>24 часа</b></span>':""}</div>
    ${l.status==="ACTIVE"?`<div class="countdown">ДО СРОКА <strong data-countdown>—</strong></div>`:""}
    ${borrower&&l.status==="ACTIVE"?`<div class="loan-actions"><button class="repay" data-loan-repay="${escAttr(l.id)}">ВЕРНУТЬ ${fmt(l.repayment)}</button></div>`:""}
  </article>`;
}

function bindLoanButtons(){
  document.querySelectorAll("[data-loan-accept]").forEach(b=>b.onclick=()=>respondLoan(b.dataset.loanAccept,"ACCEPT"));
  document.querySelectorAll("[data-loan-decline]").forEach(b=>b.onclick=()=>respondLoan(b.dataset.loanDecline,"DECLINE"));
  document.querySelectorAll("[data-loan-repay]").forEach(b=>b.onclick=()=>repayLoan(b.dataset.loanRepay));
}

function updateLoanPreview(){
  const n=Math.max(0,Math.floor(Number($("loanAmount")?.value||0)));
  if($("loanRepayPreview"))$("loanRepayPreview").textContent=fmt(Math.ceil(n*1.15));
}

async function requestLoan(){
  const lenderId=$("loanPeer").value,amount=Number($("loanAmount").value);
  if(!lenderId)return toast("Нет игрока для запроса");
  try{
    $("requestLoanBtn").disabled=true;
    await api("/api/loans/request",{lenderId,amount});
    toast("Запрос отправлен");state.loans=null;await loadLoans(true);
  }catch(e){toast(errorText(e.message));$("requestLoanBtn").disabled=false;}
}

async function respondLoan(loanId,action){
  try{await api("/api/loans/respond",{loanId,action});toast(action==="ACCEPT"?"Займ выдан":"Запрос отклонён");state.loans=null;await loadLoans(true);}
  catch(e){toast(errorText(e.message));}
}

async function repayLoan(loanId){
  try{const d=await api("/api/loans/repay",{loanId});applyBalance(d.balance);toast("Долг погашен");state.loans=null;await loadLoans(true);}
  catch(e){toast(errorText(e.message));}
}

async function requestAdminHelp(){
  try{await api("/api/loans/admin-help",{});toast("Запрос администратору отправлен");state.loans=null;await loadLoans(true);}
  catch(e){toast(errorText(e.message));}
}

/* ---------------- SLOT ENGINE ---------------- */

async function openSlot(id,card){
  const slot=state.slots.find(s=>s.id===id);if(!slot||state.autoRemaining)return;
  state.previousTab=state.currentTab;state.current=slot;state.bet=normalizeBet($("betInput").value||state.bet);$("betInput").value=state.bet;
  $("gameTitle").textContent=slot.name;$("gameMechanic").textContent=slot.mechanic;$("gameResult").textContent="LOADING";
  $("bonusBuyBtn").classList.toggle("hidden",!slot.bonusBuy);
  document.querySelectorAll(".tab-view").forEach(v=>v.classList.remove("active"));$("slotView").classList.remove("hidden");$("bottomNav").classList.add("hidden");
  if(card){gsap.fromTo(card,{scale:1},{scale:.985,duration:.07,yoyo:true,repeat:1});await wait(80);}
  $("gameLoader").classList.remove("hidden");setGameProgress(0);
  try{
    if(!state.engine){
      state.engine=new GameEngine({container:$("pixiStage"),quality:"AUTO"});
      state.engine.addEventListener("statechange",e=>{setEngineState(e.detail.current);syncGameControls(e.detail.current);});
    }
    await state.engine.loadGame(id,p=>setGameProgress(Math.round(p*100)));
    $("gameLoader").classList.add("hidden");$("gameResult").textContent="READY";setEngineState(state.engine.fsm.current);syncGameControls(state.engine.fsm.current);
    updateGameBalance();
  }catch(e){$("gameLoader").classList.add("hidden");$("gameResult").textContent="LOAD ERROR";toast(errorText(e.message));}
}

function closeSlot(){
  if(state.autoRemaining)stopAuto();
  state.current=null;$("slotView").classList.add("hidden");$("bottomNav").classList.remove("hidden");setTab(state.previousTab||"slots");
}

async function spinOnce(){
  if(!state.current||!state.engine?.canSpin())return false;
  const bet=normalizeBet($("betInput").value);
  if(bet>Number(state.player.balance||0)){toast("Недостаточно фишек");stopAuto();return false;}
  state.bet=bet;syncGameControls("LOCKED");$("gameResult").textContent="VERIFYING";
  try{
    const r=await api("/api/slot/spin",{gameId:state.current.id,bet,requestId:requestId()});
    await state.engine.presentSpin(r,{onBalance:balance=>applyBalance(balance),onStatus:text=>$("gameResult").textContent=text});
    state.market=null;return true;
  }catch(e){toast(errorText(e.message));$("gameResult").textContent="READY";return false;}
  finally{syncGameControls(state.engine?.fsm?.current||GameState.IDLE);}
}

function openBonusBuy(){
  if(!state.current?.bonusBuy||!state.engine?.canSpin())return;
  const bet=normalizeBet($("betInput").value);
  if(state.current.id==="olympus_storm"){
    showModal(`<small>FEATURE BUY</small><h2>OLYMPUS BONUS</h2><p>15 Free Spins. Sticky Olympus-барабаны сохраняются до конца бонуса.</p><div class="modal-grid"><button class="modal-option" data-buy="storm"><b>${fmt(bet*100)}</b><small>100× BET</small></button></div>`);
  }else{
    showModal(`<small>FEATURE BUY</small><h2>AUREUS FEATURE</h2><div class="modal-grid">
      <button class="modal-option" data-buy="standard"><b>${fmt(bet*60)} · GOLDEN ENTRY</b><small>60× BET</small></button>
      <button class="modal-option" data-buy="premium"><b>${fmt(bet*100)} · ASCENSION</b><small>100× BET</small></button>
      <button class="modal-option" data-buy="super"><b>${fmt(bet*180)} · DIVINE RUN</b><small>180× BET</small></button>
    </div>`);
  }
  document.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>buyBonus(b.dataset.buy));
}

async function buyBonus(tier){
  closeModal();if(!state.current?.bonusBuy||!state.engine?.canSpin())return;
  const bet=normalizeBet($("betInput").value);
  try{
    syncGameControls("LOCKED");
    const r=await api("/api/slot/bonus-buy",{gameId:state.current.id,bet,tier,requestId:requestId()});
    await state.engine.presentSpin(r,{onBalance:balance=>applyBalance(balance),onStatus:text=>$("gameResult").textContent=text});
    state.market=null;
  }catch(e){toast(errorText(e.message));}
  finally{syncGameControls(state.engine?.fsm?.current||GameState.IDLE);}
}

function openAuto(){
  if(!state.engine?.canSpin())return;
  showModal(`<small>AUTO PLAY</small><h2>Автопрокрутки</h2><div class="modal-grid">${[10,25,50,100].map(n=>`<button class="modal-option" data-auto="${n}"><b>${n} SPINS</b><small>Можно остановить в любой момент</small></button>`).join("")}</div>`);
  document.querySelectorAll("[data-auto]").forEach(b=>b.onclick=()=>startAuto(Number(b.dataset.auto)));
}

async function startAuto(count){
  closeModal();state.autoRemaining=count;state.autoStop=false;updateAuto();
  while(state.autoRemaining>0&&!state.autoStop&&state.current){
    const ok=await spinOnce();if(!ok)break;state.autoRemaining--;updateAuto();if(state.autoRemaining>0)await wait(300);
  }
  state.autoRemaining=0;state.autoStop=false;updateAuto();
}
function stopAuto(){state.autoStop=true;state.autoRemaining=0;updateAuto();}
function updateAuto(){$("autoCount").textContent=state.autoRemaining?String(state.autoRemaining):"PLAY";}

function openGameInfo(){
  if(!state.current)return;
  const id=state.current.id;
  const copy={
    olympus_storm:"Full-Reel Olympus раскрывается на весь барабан, работает как Wild и в бонусе остаётся sticky. Молния срабатывает только когда Olympus участвует в выигрышной комбинации.",
    lucky_coin_collector:"3+ монеты запускают Coin Reveal. Денежные монеты дают 500–50 000; ×2/×5 меняют слой, Collector собирает текущие значения.",
    honey_fruits:"Ways-механика с Giant Bee bonus. Пчела растёт, перемещается и создаёт Wild-зоны.",
    neon_beast_rampage:"Portal Morph превращает символы, Rampage проходит пять раундов с растущим FURY.",
    aureus:"Tumble-каскады и отдельный Free Spins режим с растущим множителем."
  };
  showModal(`<small>GAME INFO</small><h2>${esc(state.current.name)}</h2><p>${esc(copy[id]||state.current.mechanic)}</p><p><b>MAX WIN ×${Number(state.current.maxWin||1000)}</b></p>`);
}

function syncGameControls(engineState){
  const allowed=engineState===GameState.IDLE||engineState===GameState.BASE_IDLE;
  $("spinBtn").disabled=!allowed;$("bonusBuyBtn").disabled=!allowed||!state.current?.bonusBuy;$("betInput").disabled=!allowed;
  document.querySelector("[data-bet-down]").disabled=!allowed;document.querySelector("[data-bet-up]").disabled=!allowed;
  $("autoBtn").disabled=state.autoRemaining?false:!allowed;
}
function setEngineState(raw){$("engineState").textContent=raw==="BASE_IDLE"||raw==="IDLE"?"READY":String(raw||"READY").replaceAll("_"," ");}
function changeBet(dir){if(!state.engine?.canSpin())return;const current=normalizeBet($("betInput").value),idx=Math.max(0,BET_STEPS.findIndex(v=>v>=current)),next=BET_STEPS[Math.max(0,Math.min(BET_STEPS.length-1,idx+dir))];state.bet=next;$("betInput").value=next;}

/* ---------------- GLOBAL ---------------- */

async function claimDaily(){
  if(!state.daily?.claimable)return toast("Daily уже получен");
  try{
    $("dailyCard").disabled=true;const d=await api("/api/daily/claim",{});
    state.daily=d.daily;applyBalance(d.balance);renderDaily();toast(`+${fmt(d.daily.amount)}`);
  }catch(e){toast(errorText(e.message));}
  finally{$("dailyCard").disabled=false;}
}

function renderDaily(){
  if(!state.daily)return;
  $("dailyAmount").textContent=fmt(state.daily.amount||250000);
  $("dailyStatus").textContent=state.daily.claimable?"ЗАБРАТЬ":"ПОЛУЧЕНО";
  $("dailyCard").disabled=!state.daily.claimable;
}

function openProfile(){
  const p=state.player;if(!p)return;
  showModal(`<small>PLAYER PROFILE</small><div class="profile-sheet"><div class="profile-avatar-large">${esc(initial(p.firstName))}</div><div><h2>${esc(p.firstName||"Игрок")}</h2><p>${p.username?`@${esc(p.username)}`:`ID ${esc(p.telegramId)}`} · VIP ${Number(p.vip?.level||1)}</p></div></div>
    <div class="profile-stats"><div><small>BALANCE</small><b>${fmt(p.balance)}</b></div><div><small>ROUNDS</small><b>${fmt(p.rounds||0)}</b></div><div><small>BIG WIN</small><b>${fmt(p.biggestWin||0)}</b></div></div>`);
}

function refreshHeader(){
  const p=state.player;if(!p)return;
  $("playerName").textContent=p.firstName||"Игрок";$("avatarInitial").textContent=initial(p.firstName);$("vipLabel").textContent=`VIP ${Number(p.vip?.level||1)}`;
  $("balance").textContent=fmt(p.balance);updateGameBalance();$("jackpotValue").textContent=fmt(state.jackpot);
  $("adminBtn").classList.toggle("hidden",!p.isAdmin);
}
function applyPlayer(p){if(!p)return;state.player={...state.player,...p};refreshHeader();}
function applyBalance(v){if(!state.player)return;state.player.balance=Number(v);$("balance").textContent=fmt(v);updateGameBalance();}
function updateGameBalance(){if($("gameBalance"))$("gameBalance").textContent=fmt(state.player?.balance||0);}
function renderBadges(c){
  $("betsBadge").classList.toggle("hidden",!Number(c.openBets||0));$("tradeBadge").classList.toggle("hidden",!Number(c.trades||0));$("loanBadge").classList.toggle("hidden",!Number(c.loans||0));
}
function updateCountdowns(){
  document.querySelectorAll("[data-close-ms] [data-countdown]").forEach(el=>{
    const ms=Number(el.closest("[data-close-ms]").dataset.closeMs)-Date.now();
    el.textContent=ms<=0?"ЗАКРЫВАЕТСЯ":durationText(ms);
  });
}
function durationText(ms){
  const total=Math.max(0,Math.floor(ms/1000)),h=Math.floor(total/3600),m=Math.floor(total%3600/60),s=total%60;
  return `${h}ч ${String(m).padStart(2,"0")}м ${String(s).padStart(2,"0")}с`;
}

function showModal(html){$("modalBody").innerHTML=html;$("modal").classList.remove("hidden");}
function closeModal(){$("modal").classList.add("hidden");$("modalBody").innerHTML="";}
function loadingCard(){return '<div class="empty-card">ЗАГРУЖАЮ…</div>';}
function empty(text){return `<div class="empty-card">${esc(text)}</div>`;}
function normalizeBet(v){const n=Math.floor(Number(v)||10000);return Math.max(1000,Math.min(5000000,n));}
function setGameProgress(p){p=Math.max(0,Math.min(100,p));$("gameLoadPercent").textContent=`${p}%`;$("gameLoadBar").style.width=`${p}%`;}
function setBoot(p,text){$("bootPercent").textContent=`${p}%`;$("bootBar").style.width=`${p}%`;$("bootText").textContent=text;}
function syncTelegramInsets(){try{document.documentElement.style.setProperty("--tg-top",`${Math.max(0,Number(tg?.contentSafeAreaInset?.top||0),Number(tg?.safeAreaInset?.top||0))}px`);}catch{}}

async function api(path,payload){
  const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({initData:tg.initData,...payload})});
  let d;try{d=await r.json();}catch{throw new Error(`HTTP_${r.status}`);}
  if(!r.ok||d.ok===false)throw new Error(d.error||`HTTP_${r.status}`);return d;
}

function errorText(e){
  const map={
    INSUFFICIENT_FUNDS:"Недостаточно фишек",MIN_BET_1000:"Минимум 1 000",MAX_BET_5M:"Максимум 5 000 000",
    DAILY_NOT_READY:"Daily ещё недоступен",SLOT_NOT_READY:"Слот недоступен",BONUS_BUY_NOT_READY:"Feature Buy здесь отключён",
    BET_NOT_OPEN:"Ставка уже закрыта",BET_ALREADY_PLACED:"Ты уже поставил на это событие",BAD_OUTCOME:"Некорректный исход",
    BAD_OUTCOMES:"Нужно 2–6 разных исходов",BAD_TITLE:"Название 3–80 символов",BAD_DESCRIPTION:"Описание слишком длинное",
    BAD_DIRECTION:"Выбери направление",BAD_DURATION:"Доступно 2, 4 или 6 часов",MIN_LOAN_1000:"Минимальный займ 1 000",
    MAX_LOAN_50M:"Максимальный займ 50 000 000",BAD_LENDER:"Нельзя попросить у самого себя",LOAN_REQUEST_EXISTS:"Такой запрос уже ожидает ответа",
    LOAN_BAD_STATE:"Статус займа уже изменился",LOAN_NOT_YOURS:"Это не твой займ",NO_NEGATIVE_BALANCE:"Баланс не отрицательный",
    ADMIN_ONLY:"Только для администратора"
  };
  return map[e]||String(e).replaceAll("_"," ");
}

function requestId(){return crypto.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`;}
function toast(text){clearTimeout(toastTimer);$("toast").textContent=text;$("toast").classList.add("show");toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2200);}
function fmt(v){return Math.floor(Number(v)||0).toLocaleString("ru-RU");}
function initial(v){return String(v||"F").trim().charAt(0).toUpperCase();}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escAttr(v){return esc(v).replace(/`/g,"&#96;");}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
