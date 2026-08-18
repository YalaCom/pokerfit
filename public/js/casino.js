import {$,state,api,toast,chipsShort,refreshBootstrap,haptic,sound,confetti,nav} from "./core.js";

const games={slots:renderSlots,crash:renderCrash,dice:renderDice,wheel:renderWheel};
let crashTimer=null,crashGame=null,crashBusy=false;

export function initCasino(){
  ensureCasinoDom();
  $("casinoEntry").onclick=()=>{nav("casino",{silent:true});showLobby();};
  document.querySelectorAll("[data-casino-game]").forEach(b=>b.addEventListener("click",()=>openCasinoGame(b.dataset.casinoGame)));
  $("casinoBack")?.addEventListener("click",showLobby);
}
export function loadCasino(){showLobby();}

function ensureCasinoDom(){
  if(!$("casinoEntry")){
    const tile=document.createElement("button");tile.id="casinoEntry";tile.className="game-tile casino-entry";tile.innerHTML='<span class="casino-entry-icons">🎰 🚀 🎲 🎡</span><strong>CASINO</strong><small>Slots • Crash • Dice • Wheel<br>только виртуальные фишки</small><em>PLAY →</em>';
    document.querySelector("#view-home .game-grid")?.appendChild(tile);
  }
  if(!$("view-casino")){
    const section=document.createElement("section");section.id="view-casino";section.className="view";section.innerHTML=`<div class="page-title"><div><small>FIT CASINO</small><h2>Casino</h2></div><span class="casino-virtual">VIRTUAL CHIPS ONLY</span></div><div id="casinoLobby"><div class="casino-hero"><div><span>🎰</span><span>🚀</span><span>🎲</span><span>🎡</span></div><h3>FIT CASINO</h3><p>Все ставки только игровыми фишками. Без вывода и обмена на реальные деньги.</p></div><div class="casino-grid"><button data-casino-game="slots"><b>🎰 SLOTS</b><small>Комбинации и джекпот</small></button><button data-casino-game="crash"><b>🚀 CRASH</b><small>Успей забрать до взрыва</small></button><button data-casino-game="dice"><b>🎲 DICE</b><small>Больше или меньше</small></button><button data-casino-game="wheel"><b>🎡 WHEEL</b><small>Колесо множителей</small></button></div></div><div id="casinoGamePanel" class="hidden"><button id="casinoBack" class="casino-back">← НАЗАД В CASINO</button><h3 id="casinoGameTitle" class="casino-game-title">GAME</h3><div id="casinoGameBody"></div></div>`;
    document.querySelector("main#app")?.appendChild(section);
  }
}

function showLobby(){clearCrashTimer();crashGame=null;crashBusy=false;$("casinoLobby")?.classList.remove("hidden");$("casinoGamePanel")?.classList.add("hidden");}
function openCasinoGame(name){if(!games[name])return;$("casinoLobby").classList.add("hidden");$("casinoGamePanel").classList.remove("hidden");$("casinoGameTitle").textContent=({slots:"🎰 SLOTS",crash:"🚀 CRASH",dice:"🎲 DICE",wheel:"🎡 WHEEL"})[name];games[name]();}

function commonBet(defaultValue=10000){return `<div class="casino-bet"><label>СТАВКА</label><input id="casinoBet" type="number" min="1000" max="5000000" step="1000" value="${defaultValue}" inputmode="numeric"><div class="casino-presets"><button data-cbet="10000">10K</button><button data-cbet="50000">50K</button><button data-cbet="100000">100K</button><button data-cbet="500000">500K</button></div></div>`;}
function bindBetPresets(){document.querySelectorAll("[data-cbet]").forEach(b=>b.onclick=()=>{$("casinoBet").value=b.dataset.cbet;});}
function bet(){const n=Math.floor(Number($("casinoBet")?.value||0));if(n<1000)throw new Error("Минимальная ставка 1K");if(n>5000000)throw new Error("Максимальная ставка 5M");if(n>Number(state.player?.balance||0))throw new Error("Недостаточно фишек");return n;}

function renderSlots(){
  clearCrashTimer();
  $("casinoGameBody").innerHTML=`<div class="slot-machine"><div class="slot-lightbar"></div><div class="slot-reels"><div class="slot-reel">🍒</div><div class="slot-reel">💎</div><div class="slot-reel">7️⃣</div></div><div id="casinoResult" class="casino-result">Собери три одинаковых символа</div></div>${commonBet()}<button id="slotSpin" class="casino-main-btn">КРУТИТЬ 🎰</button>`;
  bindBetPresets();$("slotSpin").onclick=spinSlots;
}
async function spinSlots(){
  let amount;try{amount=bet();}catch(e){return toast(e.message)}
  const btn=$("slotSpin"),reels=[...document.querySelectorAll(".slot-reel")];btn.disabled=true;haptic("medium");sound("click");
  const symbols=["🍒","🍋","🔔","⭐","💎","7️⃣"],timers=reels.map((el,i)=>setInterval(()=>el.textContent=symbols[Math.floor(Math.random()*symbols.length)],55+i*12));
  try{
    const d=await api("/api/casino/slots",{bet:amount,requestId:crypto.randomUUID()});
    await wait(650);
    for(let i=0;i<reels.length;i++){clearInterval(timers[i]);await wait(130);reels[i].textContent=d.result.reels[i];reels[i].classList.add("land");setTimeout(()=>reels[i].classList.remove("land"),300);haptic("light");}
    showCasinoResult(d.payout,d.multiplier,d.payout?`ВЫИГРЫШ ${chipsShort(d.payout)}`:"МИМО");
    if(d.payout>amount){confetti();sound("win");}else sound("lose");
    await refreshBootstrap();
  }catch(e){toast(e.message)}finally{timers.forEach(clearInterval);btn.disabled=false;}
}

function renderWheel(){
  clearCrashTimer();
  $("casinoGameBody").innerHTML=`<div class="wheel-stage"><div class="wheel-pointer">▼</div><div id="casinoWheel" class="casino-wheel"><span>0×</span><span>0.5×</span><span>1×</span><span>1.5×</span><span>2×</span><span>3×</span><span>5×</span><span>10×</span></div><div id="casinoResult" class="casino-result">Колесо множителей</div></div>${commonBet()}<button id="wheelSpin" class="casino-main-btn">КРУТИТЬ 🎡</button>`;
  bindBetPresets();$("wheelSpin").onclick=spinWheel;
}
async function spinWheel(){
  let amount;try{amount=bet();}catch(e){return toast(e.message)}
  const btn=$("wheelSpin"),wheel=$("casinoWheel");btn.disabled=true;wheel.style.transition="none";wheel.style.transform="rotate(0deg)";void wheel.offsetWidth;
  try{
    const d=await api("/api/casino/wheel",{bet:amount,requestId:crypto.randomUUID()});
    const count=8,segment=360/count,target=360*5+(360-(d.result.index*segment+segment/2));
    wheel.style.transition="transform 3.2s cubic-bezier(.12,.67,.12,1)";wheel.style.transform=`rotate(${target}deg)`;haptic("medium");
    await wait(3250);showCasinoResult(d.payout,d.multiplier,`${d.result.label} • ${d.payout?`+${chipsShort(d.payout)}`:"ПРОИГРЫШ"}`);if(d.payout>amount){confetti();sound("win");}else sound("lose");await refreshBootstrap();
  }catch(e){toast(e.message)}finally{btn.disabled=false;}
}

function renderDice(){
  clearCrashTimer();
  $("casinoGameBody").innerHTML=`<div class="dice-stage"><div id="diceBall" class="dice-ball">?</div><div id="casinoResult" class="casino-result">Выбери условие и бросай</div></div><div class="dice-config"><button class="dice-choice active" data-dice-choice="under">МЕНЬШЕ</button><button class="dice-choice" data-dice-choice="over">БОЛЬШЕ</button><input id="diceTarget" type="range" min="10" max="90" value="50"><div class="dice-target">ЦЕЛЬ: <b id="diceTargetLabel">50</b></div></div>${commonBet()}<button id="diceRoll" class="casino-main-btn">БРОСИТЬ 🎲</button>`;
  bindBetPresets();let choice="under";document.querySelectorAll(".dice-choice").forEach(b=>b.onclick=()=>{choice=b.dataset.diceChoice;document.querySelectorAll(".dice-choice").forEach(x=>x.classList.toggle("active",x===b));});$("diceTarget").oninput=()=>$("diceTargetLabel").textContent=$("diceTarget").value;$("diceRoll").onclick=()=>rollDice(choice);
}
async function rollDice(choice){
  let amount;try{amount=bet();}catch(e){return toast(e.message)}
  const target=Number($("diceTarget").value),ball=$("diceBall"),btn=$("diceRoll");btn.disabled=true;
  const timer=setInterval(()=>{ball.textContent=1+Math.floor(Math.random()*100);ball.classList.toggle("bounce")},65);
  try{
    const d=await api("/api/casino/dice",{bet:amount,choice,target,requestId:crypto.randomUUID()});await wait(720);clearInterval(timer);ball.textContent=d.result.roll;ball.classList.add(d.result.win?"win":"lose");setTimeout(()=>ball.classList.remove("win","lose"),1000);showCasinoResult(d.payout,d.multiplier,`${d.result.roll} • ${d.result.win?`WIN ×${d.result.shownMultiplier}`:"LOSE"}`);if(d.result.win)confetti();d.result.win?sound("win"):sound("lose");await refreshBootstrap();
  }catch(e){clearInterval(timer);toast(e.message)}finally{btn.disabled=false;}
}

function renderCrash(){
  clearCrashTimer();crashGame=null;crashBusy=false;
  $("casinoGameBody").innerHTML=`<div class="crash-stage"><div class="crash-grid"></div><div id="rocket" class="rocket">🚀</div><div id="crashMultiplier" class="crash-multiplier">1.00×</div><div id="casinoResult" class="casino-result crash-message">Нажми СТАРТ и успей забрать</div></div>${commonBet()}<button id="crashStart" class="casino-main-btn">СТАРТ 🚀</button><button id="crashCashout" class="casino-cashout hidden">ЗАБРАТЬ • <span>1.00×</span></button>`;
  bindBetPresets();$("crashStart").onclick=startCrash;$("crashCashout").onclick=cashoutCrash;
}
async function startCrash(){
  if(crashBusy)return;let amount;try{amount=bet();}catch(e){return toast(e.message)}crashBusy=true;$("crashStart").disabled=true;
  try{
    const d=await api("/api/casino/crash/start",{bet:amount,requestId:crypto.randomUUID()});crashGame=d.game;$("crashStart").classList.add("hidden");$("crashCashout").classList.remove("hidden");$("casinoResult").textContent="РАКЕТА ПОШЛА";haptic("heavy");
    crashTimer=setInterval(pollCrash,180);await refreshBootstrap();
  }catch(e){toast(e.message);crashBusy=false;$("crashStart").disabled=false;}
}
async function pollCrash(){
  if(!crashGame)return;try{
    const d=await api("/api/casino/crash/status",{token:crashGame.token});updateCrashVisual(d.multiplier);
    if(d.crashed){clearCrashTimer();$("crashMultiplier").textContent=`${Number(d.crashAt).toFixed(2)}×`;$("casinoResult").textContent=`💥 CRASH ${Number(d.crashAt).toFixed(2)}×`;$("crashCashout").classList.add("hidden");$("crashStart").classList.remove("hidden");$("crashStart").disabled=false;crashBusy=false;crashGame=null;sound("lose");haptic("error");await refreshBootstrap();}
  }catch(e){clearCrashTimer();toast(e.message);crashBusy=false;}
}
async function cashoutCrash(){
  if(!crashGame||crashBusy==="cashout")return;crashBusy="cashout";$("crashCashout").disabled=true;
  try{
    const d=await api("/api/casino/crash/cashout",{token:crashGame.token,actionId:crypto.randomUUID()});clearCrashTimer();
    if(d.won){updateCrashVisual(d.cashoutMultiplier);$("casinoResult").textContent=`✅ CASHOUT ${Number(d.cashoutMultiplier).toFixed(2)}× • +${chipsShort(d.payout)}`;confetti();sound("win");haptic("success");}
    else{$("casinoResult").textContent=`💥 CRASH ${Number(d.crashAt).toFixed(2)}×`;sound("lose");haptic("error");}
    $("crashCashout").classList.add("hidden");$("crashStart").classList.remove("hidden");$("crashStart").disabled=false;$("crashCashout").disabled=false;crashGame=null;crashBusy=false;await refreshBootstrap();
  }catch(e){toast(e.message);crashBusy=false;$("crashCashout").disabled=false;}
}
function updateCrashVisual(multiplier){const m=Math.max(1,Number(multiplier||1));$("crashMultiplier").textContent=`${m.toFixed(2)}×`;$("crashCashout").querySelector("span").textContent=`${m.toFixed(2)}×`;const progress=Math.min(1,(m-1)/5);$("rocket").style.transform=`translate(${progress*150}px,${-progress*115}px) rotate(18deg)`;}
function clearCrashTimer(){if(crashTimer){clearInterval(crashTimer);crashTimer=null;}}

function showCasinoResult(payout,multiplier,text){const el=$("casinoResult");if(!el)return;el.textContent=text;el.className=`casino-result ${payout>0&&multiplier>1?"win":payout>0?"push":"lose"}`;}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
