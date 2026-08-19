import {GameEngine} from "./game/core/GameEngine.js";
import {GameState} from "./game/core/GameStateMachine.js";

const tg=window.Telegram?.WebApp;
const $=id=>document.getElementById(id);
const BET_STEPS=[1000,5000,10000,25000,50000,100000,250000,500000,1000000,2500000,5000000];
const CLASSICS=[
  {id:"roulette",name:"ROULETTE",sub:"European 0–36",cover:"/assets/game-covers/roulette.svg",choices:["red","black","even","odd"]},
  {id:"blackjack",name:"BLACKJACK",sub:"Server dealer",cover:"/assets/game-covers/blackjack.svg"},
  {id:"plinko",name:"PLINKO",sub:"9 multiplier buckets",cover:"/assets/game-covers/plinko.svg"},
  {id:"dice",name:"DICE",sub:"Over / Under",cover:"/assets/game-covers/dice.svg",choices:["over","under"]},
  {id:"coinflip",name:"COIN FLIP",sub:"Heads / Tails",cover:"/assets/game-covers/coinflip.svg",choices:["heads","tails"]},
  {id:"baccarat",name:"BACCARAT",sub:"Player / Banker",cover:"/assets/game-covers/baccarat.svg",choices:["player","banker","tie"]}
];
const state={player:null,slots:[],daily:null,jackpot:0,current:null,engine:null,bet:10000,autoRemaining:0,autoStop:false,quality:localStorage.getItem("fit_casino_quality")||"AUTO"};
let toastTimer=null;

boot();

async function boot(){
  setBoot(8,"TELEGRAM SESSION");
  if(!tg?.initData){$("bootText").textContent="OPEN INSIDE TELEGRAM";return;}
  tg.ready();tg.expand();try{tg.setHeaderColor?.("#050609");tg.setBackgroundColor?.("#050609");}catch{}
  try{
    setBoot(22,"AUTHENTICATING");const data=await api("/api/bootstrap",{});setBoot(58,"LOADING CASINO FLOOR");
    state.player=data.player;state.slots=data.slots||[];state.daily=data.daily;state.jackpot=Number(data.jackpot||0);renderLobby();bindGlobal();refreshHeader();setBoot(100,"READY");
    $("app").classList.remove("hidden");setTimeout(()=>$("bootScreen").classList.add("hide"),220);setTimeout(()=>$("bootScreen").classList.add("hidden"),650);
  }catch(error){$("bootText").textContent=`START ERROR: ${errorText(error.message)}`;}
}

function bindGlobal(){
  $("profileButton").onclick=openProfile;$("adminBtn").onclick=()=>location.href="/admin.html";$("backBtn").onclick=showLobby;$("classicBackBtn").onclick=showLobby;$("infoBtn").onclick=openGameInfo;
  $("modalClose").onclick=closeModal;$("modal").onclick=e=>{if(e.target===$("modal"))closeModal();};
  $("spinBtn").onclick=()=>spinOnce();$("bonusBuyBtn").onclick=openBonusBuy;$("autoBtn").onclick=openAuto;
  document.querySelector("[data-bet-down]").onclick=()=>changeBet(-1);document.querySelector("[data-bet-up]").onclick=()=>changeBet(1);$("betInput").onchange=()=>{state.bet=normalizeBet($("betInput").value);$("betInput").value=state.bet;};
  $("dailyCard").onclick=claimDaily;
  document.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>handleNav(b.dataset.nav,b));
}

function renderLobby(){
  $("slotGrid").innerHTML=state.slots.map(s=>`<button class="slot-card" data-slot="${esc(s.id)}"><div class="slot-card-art"><img src="${esc(s.cover)}" alt="${esc(s.name)}"></div><div class="slot-card-copy"><small>${esc(s.badge||"FEATURED")} • MAX WIN x${Number(s.maxWin||1000)}</small><h3>${esc(s.name)}</h3><p>${esc(s.mechanic)}. Отдельный PixiJS reel engine, server-authoritative cascades и Free Spins mode.</p><div class="slot-tags"><span>6 × 5</span><span>TUMBLE</span><span>FREE SPINS</span></div><div class="slot-play">PLAY GAME →</div></div></button>`).join("");
  document.querySelectorAll("[data-slot]").forEach(card=>card.onclick=()=>openSlot(card.dataset.slot,card));
  $("classicGrid").innerHTML=CLASSICS.map(g=>`<button class="classic-card" data-classic="${g.id}"><img src="${g.cover}" alt="${g.name}"><div class="classic-card-copy"><b>${g.name}</b><small>${g.sub}</small></div></button>`).join("");
  document.querySelectorAll("[data-classic]").forEach(card=>card.onclick=()=>openClassic(card.dataset.classic));
  renderDaily();refreshHeader();
}

async function openSlot(id,card){
  const slot=state.slots.find(s=>s.id===id);if(!slot)return;if(state.autoRemaining)return;
  state.current=slot;state.bet=normalizeBet($("betInput").value||state.bet);$("betInput").value=state.bet;$("gameTitle").textContent=slot.name;$("gameMechanic").textContent=slot.mechanic;$("gameResult").textContent="LOADING";
  if(card){const rect=card.getBoundingClientRect();gsap.fromTo(card,{scale:1},{scale:.985,duration:.08,yoyo:true,repeat:1,ease:"power1.inOut"});await wait(120);}
  view("slotView");$("gameLoader").classList.remove("hidden");setGameProgress(0);try{
    if(!state.engine){state.engine=new GameEngine({container:$("pixiStage"),quality:state.quality});state.engine.addEventListener("statechange",e=>{const s=e.detail.current;$("engineState").textContent=s;syncGameControls(s);});}
    await state.engine.loadGame(id,p=>setGameProgress(Math.round(p*100)));$("gameLoader").classList.add("hidden");$("gameResult").textContent="READY";state.engine.haptics.impact("light");syncGameControls(GameState.IDLE);
  }catch(error){$("gameResult").textContent="LOAD ERROR";toast(errorText(error.message));}
}

async function spinOnce({auto=false}={}){
  if(!state.current||!state.engine?.canSpin())return false;const bet=normalizeBet($("betInput").value);if(bet>Number(state.player.balance||0)){toast("Недостаточно фишек");stopAuto();return false;}state.bet=bet;syncGameControls("LOCKED");$("gameResult").textContent="VERIFYING BET";
  try{
    const response=await api("/api/slot/spin",{gameId:state.current.id,bet,requestId:requestId()});
    await state.engine.presentSpin(response,{onBalance:balance=>{state.player.balance=Number(balance);updateBalance(balance,true);},onStatus:text=>$("gameResult").textContent=text});return true;
  }catch(error){toast(errorText(error.message));$("gameResult").textContent="READY";return false;}finally{syncGameControls(state.engine?.fsm?.current||GameState.IDLE);}
}

function openBonusBuy(){
  if(!state.current||!state.engine?.canSpin())return;const bet=normalizeBet($("betInput").value),tiers=[{id:"standard",name:"GOLDEN ENTRY",cost:60,desc:"8 Free Spins • bonus multipliers start at x2"},{id:"premium",name:"ASCENSION",cost:100,desc:"10 Free Spins • longer feature session"},{id:"super",name:"DIVINE RUN",cost:180,desc:"12 Free Spins • maximum feature duration"}];
  showModal(`<small>FEATURE BUY</small><h2>Golden Ascension</h2><p>Покупка сразу переводит игру в отдельный Free Spins mode. Результат всё равно определяется сервером; покупка не гарантирует выигрыш.</p><div class="modal-grid">${tiers.map(t=>`<button class="modal-option" data-buy-tier="${t.id}"><b>${t.name} • ${fmt(bet*t.cost)}</b><small>${t.cost}× BET • ${t.desc}</small></button>`).join("")}</div>`);
  document.querySelectorAll("[data-buy-tier]").forEach(b=>b.onclick=()=>buyBonus(b.dataset.buyTier));
}

async function buyBonus(tier){
  closeModal();if(!state.engine?.canSpin())return;const bet=normalizeBet($("betInput").value),cost=bet*(tier==="super"?180:tier==="premium"?100:60);if(cost>Number(state.player.balance||0))return toast("Недостаточно фишек для Feature Buy");syncGameControls("LOCKED");
  try{const response=await api("/api/slot/bonus-buy",{gameId:state.current.id,bet,tier,requestId:requestId()});await state.engine.presentSpin(response,{onBalance:balance=>{state.player.balance=Number(balance);updateBalance(balance,true);},onStatus:text=>$("gameResult").textContent=text});}catch(error){toast(errorText(error.message));}finally{syncGameControls(state.engine?.fsm?.current||GameState.IDLE);}
}

function openAuto(){if(!state.engine?.canSpin())return;showModal(`<small>AUTO PLAY</small><h2>Автопрокрутки</h2><p>Следующий spin начинается только после полного reel sequence, cascades, bonus и win presentation предыдущего.</p><div class="modal-grid">${[10,25,50,100].map(n=>`<button class="modal-option" data-auto="${n}"><b>${n} SPINS</b><small>Остановить можно в любой момент кнопкой AUTO.</small></button>`).join("")}</div>`);document.querySelectorAll("[data-auto]").forEach(b=>b.onclick=()=>startAuto(Number(b.dataset.auto)));}
async function startAuto(count){closeModal();state.autoRemaining=Math.max(1,count);state.autoStop=false;updateAutoLabel();while(state.autoRemaining>0&&!state.autoStop&&state.current){const ok=await spinOnce({auto:true});if(!ok)break;state.autoRemaining--;updateAutoLabel();if(state.autoRemaining>0&&!state.autoStop)await wait(450);}state.autoRemaining=0;state.autoStop=false;updateAutoLabel();}
function stopAuto(){state.autoStop=true;state.autoRemaining=0;updateAutoLabel();}
function updateAutoLabel(){$("autoCount").textContent=state.autoRemaining?String(state.autoRemaining):"PLAY";}

function openGameInfo(){if(!state.current)return;showModal(`<small>GAME INFO</small><h2>${esc(state.current.name)}</h2><p><b>TUMBLE:</b> winning symbols исчезают, остальные падают вниз, сверху приходят новые. Multiplier внутри одного cascade chain растёт x1 → x2 → x3 → x5 → x10.</p><p><b>SCATTER:</b> 4 или больше запускают Golden Ascension Free Spins. В бонусе multiplier начинается с x2 и может дойти до x20.</p><p><b>MAX WIN:</b> x${Number(state.current.maxWin||1000)} от основной ставки.</p>`);}

function openClassic(id){const g=CLASSICS.find(x=>x.id===id);if(!g)return;view("classicView");$("classicTitle").textContent=g.name;let choices="";if(g.choices)choices=`<select id="classicChoice">${g.choices.map(x=>`<option value="${x}">${x.toUpperCase()}</option>`).join("")}</select>`;$("classicBody").innerHTML=`<article class="classic-panel"><div class="classic-cover"><img src="${g.cover}" alt="${g.name}"></div><h3>${g.name}</h3><p>${g.sub}. Результат рассчитывается на сервере и записывается в баланс.</p><div class="classic-controls"><input id="classicBet" type="number" inputmode="numeric" min="1000" max="5000000" value="10000">${choices}<button id="classicPlay">PLAY ROUND</button></div><div id="classicResult" class="classic-result">READY</div></article>`;$("classicPlay").onclick=()=>playClassic(g);}
async function playClassic(g){const bet=normalizeBet($("classicBet").value);if(bet>Number(state.player.balance||0))return toast("Недостаточно фишек");$("classicPlay").disabled=true;try{const body={gameId:g.id,bet,requestId:requestId()};if($("classicChoice"))body.choice=$("classicChoice").value;const d=await api("/api/game/play",body);state.player.balance=Number(d.balance);updateBalance(d.balance,true);$("classicResult").textContent=classicResultText(g.id,d);}catch(e){toast(errorText(e.message));}finally{$("classicPlay").disabled=false;}}
function classicResultText(id,d){const r=d.result||{};if(id==="roulette")return `NUMBER ${r.number} • ${String(r.color||"").toUpperCase()} • ${r.won?`WIN ${fmt(d.payout)}`:"NO WIN"}`;if(id==="dice")return `ROLL ${r.roll} • ${r.won?`WIN ${fmt(d.payout)}`:"NO WIN"}`;if(id==="coinflip")return `${String(r.side||"").toUpperCase()} • ${r.won?`WIN ${fmt(d.payout)}`:"NO WIN"}`;if(id==="plinko")return `MULTIPLIER x${r.multiplier} • RETURN ${fmt(d.payout)}`;if(id==="blackjack")return `YOU ${r.playerScore} / DEALER ${r.dealerScore} • ${r.blackjack?"BLACKJACK":r.won?`WIN ${fmt(d.payout)}`:r.push?"PUSH":"NO WIN"}`;if(id==="baccarat")return `${String(r.winner||"").toUpperCase()} • ${r.won?`WIN ${fmt(d.payout)}`:"NO WIN"}`;return d.payout?`WIN ${fmt(d.payout)}`:"NO WIN";}

async function claimDaily(){if(!state.daily?.claimable)return toast("Daily Bonus уже забран");$("dailyCard").disabled=true;try{const d=await api("/api/daily/claim",{});state.daily=d.daily;state.player.balance=Number(d.balance);updateBalance(d.balance,true);renderDaily();toast(`Daily Bonus +${fmt(d.daily.amount)}`);}catch(e){toast(errorText(e.message));}finally{$("dailyCard").disabled=false;}}
function renderDaily(){if(!state.daily)return;$("dailyAmount").textContent=fmt(state.daily.amount||250000);$("dailyStatus").textContent=state.daily.claimable?"ЗАБРАТЬ":"ПОЛУЧЕНО";$("dailyCard").classList.toggle("claimed",!state.daily.claimable);}

function openProfile(){const p=state.player;if(!p)return;showModal(`<small>PLAYER PROFILE</small><div class="profile-sheet"><div class="profile-avatar-large">${esc(initial(p.firstName))}</div><div><h2>${esc(p.firstName||"Игрок")}</h2><p>${p.username?`@${esc(p.username)}`:`ID ${esc(p.telegramId)}`} • VIP ${Number(p.vip?.level||1)}</p></div></div><div class="profile-stats"><div><small>BALANCE</small><b>${fmt(p.balance)}</b></div><div><small>ROUNDS</small><b>${fmt(p.rounds||0)}</b></div><div><small>BIGGEST WIN</small><b>${fmt(p.biggestWin||0)}</b></div></div>`);}
function openSettings(){const e=state.engine;showModal(`<small>PREFERENCES</small><h2>Настройки</h2><div class="settings-row"><span>QUALITY</span><select id="qualitySelect"><option>AUTO</option><option>HIGH</option><option>LOW</option></select></div><div class="settings-row"><span>MUSIC</span><input id="musicVolume" type="range" min="0" max="1" step="0.05" value="${e?.audio?.musicVolume??.5}"></div><div class="settings-row"><span>SFX</span><input id="sfxVolume" type="range" min="0" max="1" step="0.05" value="${e?.audio?.sfxVolume??.9}"></div><div class="settings-row"><span>MUTE</span><input id="muteToggle" type="checkbox" ${e?.audio?.muted?"checked":""}></div>`);$("qualitySelect").value=state.quality;$("qualitySelect").onchange=x=>{state.quality=x.target.value;e?.setQuality?.(state.quality);};$("musicVolume").oninput=x=>e?.audio?.setMusic?.(Number(x.target.value));$("sfxVolume").oninput=x=>e?.audio?.setSfx?.(Number(x.target.value));$("muteToggle").onchange=x=>e?.audio?.setMuted?.(x.target.checked);}

function handleNav(nav,button){document.querySelectorAll("[data-nav]").forEach(x=>x.classList.remove("active"));button.classList.add("active");if(nav==="home")showLobby();else if(nav==="games"){showLobby();setTimeout(()=>$("classicSection")?.scrollIntoView({behavior:"smooth",block:"start"}),80);}else if(nav==="profile")openProfile();else if(nav==="settings")openSettings();}
function showLobby(){if(state.autoRemaining)stopAuto();view("lobbyView");state.current=null;}
function view(id){document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));$(id).classList.add("active");window.scrollTo({top:0,behavior:"instant"});}
function refreshHeader(){const p=state.player;if(!p)return;$("playerName").textContent=p.firstName||"Игрок";$("avatarInitial").textContent=initial(p.firstName);$("vipLabel").textContent=`VIP ${Number(p.vip?.level||1)}`;$("vipTitle").textContent=`VIP LEVEL ${Number(p.vip?.level||1)}`;$("vipProgressText").textContent=`${Number(p.vip?.progress||0)}%`;$("vipProgress").style.width=`${Number(p.vip?.progress||0)}%`;$("jackpotValue").textContent=fmt(state.jackpot);updateBalance(p.balance,false);if(p.isAdmin)$("adminBtn").classList.remove("hidden");}
function updateBalance(value,animate=false){$("balance").textContent=fmt(value);if(animate){$("balancePanel")?.classList?.add?.("flash");const box=document.querySelector(".balance-panel");box?.classList.remove("flash");void box?.offsetWidth;box?.classList.add("flash");}}
function syncGameControls(engineState){const allowed=engineState===GameState.IDLE;$("spinBtn").disabled=!allowed;$("bonusBuyBtn").disabled=!allowed;$("betInput").disabled=!allowed;document.querySelector("[data-bet-down]").disabled=!allowed;document.querySelector("[data-bet-up]").disabled=!allowed;if(state.autoRemaining)$("autoBtn").disabled=false;else $("autoBtn").disabled=!allowed;}
function changeBet(dir){if(!state.engine?.canSpin())return;const current=normalizeBet($("betInput").value),idx=Math.max(0,BET_STEPS.findIndex(v=>v>=current)),next=BET_STEPS[Math.max(0,Math.min(BET_STEPS.length-1,idx+dir))];state.bet=next;$("betInput").value=next;gsap.fromTo($("betInput"),{scale:1.18},{scale:1,duration:.22,ease:"back.out(2)"});state.engine?.haptics?.selection?.();}
function normalizeBet(v){const n=Math.floor(Number(v)||10000);return Math.max(1000,Math.min(5000000,n));}
function setGameProgress(p){p=Math.max(0,Math.min(100,p));$("gameLoadPercent").textContent=`${p}%`;$("gameLoadBar").style.width=`${p}%`;}
function setBoot(p,text){$("bootPercent").textContent=`${p}%`;$("bootBar").style.width=`${p}%`;$("bootText").textContent=text;}
function showModal(html){$("modalBody").innerHTML=html;$("modal").classList.remove("hidden");}
function closeModal(){$("modal").classList.add("hidden");}
async function api(path,payload){const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({initData:tg.initData,...payload})});let d;try{d=await r.json();}catch{throw new Error(`HTTP_${r.status}`)}if(!r.ok||d.ok===false)throw new Error(d.error||`HTTP_${r.status}`);return d;}
function requestId(){return crypto.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`;}
function toast(text){clearTimeout(toastTimer);$("toast").textContent=text;$("toast").classList.add("show");toastTimer=setTimeout(()=>$("toast").classList.remove("show"),2200);}
function errorText(e){return ({INSUFFICIENT_FUNDS:"Недостаточно фишек",MIN_BET_1000:"Минимальная ставка 1 000",MAX_BET_5M:"Максимальная ставка 5 000 000",DAILY_NOT_READY:"Daily Bonus ещё недоступен",SLOT_NOT_READY:"Эта игра ещё переносится на новый движок",STATE_BLOCKED:"Дождись окончания анимации"})[e]||String(e).replaceAll("_"," ");}
function initial(v){return String(v||"F").trim().charAt(0).toUpperCase();}
function fmt(n){return Math.floor(Number(n)||0).toLocaleString("ru-RU");}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
