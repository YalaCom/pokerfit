import {$,api,nav,toast,refreshBootstrap,haptic,sound,confetti,state,chipsShort} from "./core.js";

const SYMBOLS=["🍒","🔔","💎","👑","7️⃣","🃏","🌟","💰"];
let installed=false,busy=false,refreshTimer=null,observer=null;

export function initRequiredCasinoUI(){
  if(installed)return;installed=true;
  ensureRequiredUI();
  observer=new MutationObserver(ensureRequiredUI);
  observer.observe(document.body,{childList:true,subtree:true});
  refreshAll();
  refreshTimer=setInterval(refreshAll,5000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshAll();});
}

function ensureRequiredUI(){
  ensureHomeWallet();
  ensureCasinoWallet();
  ensureJackpotTile();
}

function bindOnce(el,key,fn){
  if(!el||el.dataset[key])return;
  el.dataset[key]="1";el.addEventListener("click",fn);
}

function ensureHomeWallet(){
  const home=$("view-home");if(!home)return;
  let wallet=$("homeExchangeBar");
  if(!wallet){
    wallet=document.createElement("div");wallet.id="homeExchangeBar";wallet.className="home-exchange-bar";
    wallet.innerHTML=`<button id="homeTopup"><small>ПОПОЛНИТЬ</small><b>500K</b><span>ЗА 1 ₽</span></button><button id="homeWithdraw"><small>ВЫВЕСТИ</small><b>1M</b><span>ЗА 1 ₽</span></button>`;
    home.querySelector(".hero-card")?.insertAdjacentElement("afterend",wallet);
  }
  bindOnce($("homeTopup"),"exchangeBound",()=>exchange("topup"));
  bindOnce($("homeWithdraw"),"exchangeBound",()=>exchange("withdraw"));

  let jackpot=$("requiredHomeJackpot");
  if(!jackpot){
    jackpot=document.createElement("button");jackpot.id="requiredHomeJackpot";jackpot.className="required-home-jackpot";
    jackpot.innerHTML=`<div class="rhj-top"><span>💰 GRAND JACKPOT</span><em>1 / 250 000</em></div><strong id="requiredHomeJackpotValue">0</strong><small>Банк пополняется чистыми проигрышами игроков</small><div class="rhj-bottom"><span>GRAND FORTUNE</span><b>ИГРАТЬ →</b></div>`;
    wallet?.insertAdjacentElement("afterend",jackpot);
  }
  bindOnce(jackpot,"jackpotBound",()=>{nav("casino");setTimeout(showJackpotInfo,100);});
}

function ensureCasinoWallet(){
  const lobby=$("casinoLobby"),hero=lobby?.querySelector(".casino-hero");if(!lobby||!hero)return;
  let bar=$("casinoCriticalExchange");
  if(!bar){
    bar=document.createElement("div");bar.id="casinoCriticalExchange";bar.className="home-exchange-bar casino-critical-exchange";
    bar.innerHTML=`<button id="casinoTopup"><small>ПОПОЛНИТЬ</small><b>500K</b><span>ЗА 1 ₽</span></button><button id="casinoWithdraw"><small>ВЫВЕСТИ</small><b>1M</b><span>ЗА 1 ₽</span></button>`;
    hero.insertAdjacentElement("afterend",bar);
  }
  bindOnce($("casinoTopup"),"exchangeBound",()=>exchange("topup"));
  bindOnce($("casinoWithdraw"),"exchangeBound",()=>exchange("withdraw"));
}

function ensureJackpotTile(){
  const grid=document.querySelector("#casinoLobby .casino-grid");if(!grid)return;
  document.querySelectorAll('#casinoLobby [data-casino-game="grandjackpot"]').forEach(x=>x.classList.add("legacy-jackpot-hidden"));
  let tile=$("requiredJackpotTile");
  if(!tile){
    tile=document.createElement("button");tile.id="requiredJackpotTile";tile.className="required-jackpot-tile";tile.dataset.category="slots";
    tile.innerHTML=`<em>JACKPOT</em><span class="rjt-crown">💰</span><b>GRAND FORTUNE</b><strong id="requiredCasinoJackpotValue">0</strong><small>3×5 • BONUS • WILD • весь банк</small>`;
    grid.prepend(tile);
  }
  bindOnce(tile,"jackpotBound",showJackpotInfo);
}

async function exchange(kind){
  const buttons=[kind==="topup"?$("homeTopup"):$("homeWithdraw"),kind==="topup"?$("casinoTopup"):$("casinoWithdraw")].filter(Boolean);
  buttons.forEach(b=>b.disabled=true);
  try{
    const d=await api(kind==="topup"?"/api/friend-exchange/topup":"/api/friend-exchange/withdraw");
    if(d.alreadyPending)toast("Такая заявка уже ждёт подтверждения");
    else toast(kind==="topup"?"Пополнение 500K за 1 ₽ отправлено на подтверждение":"1M фишек списан. Вывод на 1 ₽ ждёт подтверждения");
    await refreshBootstrap();haptic("success");await refreshAll();
  }catch(e){toast(e.message==="INSUFFICIENT_FUNDS"?"Для вывода нужен баланс минимум 1M":e.message);}
  finally{buttons.forEach(b=>b.disabled=false);}
}

function showJackpotInfo(){
  const lobby=$("casinoLobby"),panel=$("casinoGamePanel"),body=$("casinoGameBody"),title=$("casinoGameTitle");
  if(!lobby||!panel||!body)return;
  lobby.classList.add("hidden");panel.classList.remove("hidden");if(title)title.textContent="💰 GRAND FORTUNE";
  body.innerHTML=`<article class="required-jp-info"><div class="required-jp-art"><span>💰</span><i>GRAND</i></div><small>FIT CASINO • PROGRESSIVE JACKPOT</small><h3>GRAND FORTUNE</h3><strong id="requiredInfoJackpot">0</strong><p>Отдельный Jackpot-slot. Весь накопленный банк может выпасть только здесь. После выигрыша банк становится 0.</p><div class="required-jp-rules"><div><small>ПОЛЕ</small><b>3×5</b></div><div><small>ЛИНИИ</small><b>20</b></div><div><small>MAX WIN</small><b>×1000</b></div><div><small>JACKPOT</small><b>1:250K</b></div></div><div class="required-jp-symbols">🍒 🔔 💎 👑 7️⃣ 🃏 🌟 💰</div><div class="required-jp-bonus"><small>FORTUNE VAULT</small><b>3+ 🌟 запускают бонус. 🃏 WILD остаются на поле; символы 💰 усиливают бонус и могут добавить вращения.</b></div><button id="requiredJpPlay" class="casino-main-btn">ИГРАТЬ 💰</button></article>`;
  $("requiredJpPlay").onclick=renderJackpotSlot;refreshAll();
}

function renderJackpotSlot(){
  const body=$("casinoGameBody"),title=$("casinoGameTitle");if(!body)return;if(title)title.textContent="💰 GRAND FORTUNE";
  const cells=Array.from({length:15},(_,i)=>`<div class="required-jp-cell" data-rjp-cell="${i}">${SYMBOLS[i%SYMBOLS.length]}</div>`).join("");
  body.innerHTML=`<div class="required-jp-machine"><div class="required-jp-meter"><small>GRAND JACKPOT</small><strong id="requiredGameJackpot">0</strong></div><div class="required-jp-screen"><div id="requiredJpGrid" class="required-jp-grid">${cells}</div><div id="requiredBonusBadge" class="required-bonus-badge hidden">FORTUNE VAULT</div></div><div id="requiredJpResult" class="casino-result">20 линий • WILD • SCATTER • BONUS</div></div><div class="required-jp-dock"><div class="casino-bet"><label>СТАВКА</label><input id="requiredJpBet" type="number" min="1000" max="5000000" step="1000" value="10000" inputmode="numeric"><div class="casino-presets"><button data-rjp-bet="10000">10K</button><button data-rjp-bet="50000">50K</button><button data-rjp-bet="100000">100K</button><button data-rjp-bet="500000">500K</button></div><div class="required-maxwin">MAX WIN <b id="requiredMaxWin">10M</b> + JACKPOT</div></div><button id="requiredJpSpin" class="casino-main-btn">SPIN 💰</button></div>`;
  document.querySelectorAll("[data-rjp-bet]").forEach(b=>b.onclick=()=>{$("requiredJpBet").value=b.dataset.rjpBet;updateMaxWin();});
  $("requiredJpBet").oninput=updateMaxWin;$("requiredJpSpin").onclick=spinJackpot;updateMaxWin();refreshAll();
}

function updateMaxWin(){const bet=Math.max(0,Math.floor(Number($("requiredJpBet")?.value||0)));if($("requiredMaxWin"))$("requiredMaxWin").textContent=chipsShort(bet*1000);}

async function spinJackpot(){
  if(busy)return;const amount=Math.floor(Number($("requiredJpBet")?.value||0));
  if(amount<1000)return toast("Минимальная ставка 1K");if(amount>5_000_000)return toast("Максимальная ставка 5M");if(amount>Number(state.player?.balance||0))return toast("Недостаточно фишек");
  busy=true;const btn=$("requiredJpSpin");if(btn)btn.disabled=true;clearCells();haptic("medium");sound("click");
  const cells=[...document.querySelectorAll(".required-jp-cell")];const timers=cells.map((el,i)=>setInterval(()=>el.textContent=SYMBOLS[Math.floor(Math.random()*SYMBOLS.length)],45+(i%5)*4));
  try{
    const d=await api("/api/casino/jackpot/spin",{bet:amount,requestId:crypto.randomUUID()});await wait(620);timers.forEach(clearInterval);renderGrid(d.result.grid);markBaseWins(d.result.base?.lines||[]);
    if(d.result.bonusTriggered&&d.result.bonus)await playBonus(d.result.bonus);
    const normal=Number(d.result.normalPayout||0),jp=Number(d.result.jackpotPayout||0);
    if(d.result.jackpotHit&&jp>0){setResult(`💰 GRAND JACKPOT! +${chipsShort(jp)}`,true);sound("win");confetti();haptic("success");}
    else if(Number(d.payout||0)>amount){setResult(`WIN ${chipsShort(d.payout)} • ×${Number(d.multiplier||0).toFixed(2)}`,true);sound("win");confetti();}
    else if(Number(d.payout||0)>0){setResult(`RETURN ${chipsShort(d.payout)}`,false);sound("click");}
    else{setResult("NO WIN",false);sound("lose");}
    if(normal>=amount*1000)setResult(`MAX WIN ${chipsShort(amount*1000)}${jp?` + JACKPOT ${chipsShort(jp)}`:""}`,true);
    await refreshBootstrap();await refreshAll();
  }catch(e){timers.forEach(clearInterval);toast(e.message);}
  finally{busy=false;if(btn)btn.disabled=false;}
}

async function playBonus(bonus){
  const badge=$("requiredBonusBadge");badge?.classList.remove("hidden");let sticky=new Set((bonus.initialSticky||[]).map(x=>x.join(":")));
  for(let i=0;i<(bonus.frames||[]).length;i++){const frame=bonus.frames[i];renderGrid(frame.grid,sticky);sticky=new Set((frame.sticky||[]).map(x=>x.join(":")));markSticky(sticky);if(badge)badge.textContent=`FORTUNE VAULT • ${i+1}/${bonus.frames.length} • ×${Number(frame.bonusMultiplier||1).toFixed(2)}`;setResult(`BONUS +${chipsShort(frame.payout||0)}`,Number(frame.payout||0)>0);await wait(260);}badge?.classList.add("hidden");
}

function renderGrid(grid,locked=new Set()){const cells=[...document.querySelectorAll(".required-jp-cell")];for(let r=0;r<3;r++)for(let c=0;c<5;c++){const i=r*5+c;if(cells[i]){cells[i].textContent=grid?.[r]?.[c]||"?";cells[i].classList.toggle("sticky",locked.has(`${r}:${c}`));}}}
function markSticky(sticky){document.querySelectorAll(".required-jp-cell").forEach(x=>x.classList.remove("sticky"));for(const key of sticky){const [r,c]=key.split(":").map(Number);document.querySelector(`[data-rjp-cell="${r*5+c}"]`)?.classList.add("sticky");}}
function markBaseWins(lines){for(const line of lines.slice(0,10)){(line.rows||[]).slice(0,line.count||5).forEach((r,c)=>document.querySelector(`[data-rjp-cell="${r*5+c}"]`)?.classList.add("win"));}}
function clearCells(){document.querySelectorAll(".required-jp-cell").forEach(x=>x.classList.remove("win","sticky"));}
function setResult(text,win){const el=$("requiredJpResult");if(!el)return;el.textContent=text;el.classList.toggle("win",!!win);el.classList.toggle("lose",!win);}

async function refreshAll(){
  try{const d=await api("/api/casino/jackpot/status"),pool=Number(d.pool||0),text=pool.toLocaleString("ru-RU");["requiredHomeJackpotValue","requiredCasinoJackpotValue","requiredInfoJackpot","requiredGameJackpot","homeJackpotValue"].forEach(id=>{if($(id))$(id).textContent=text;});if($("globalJackpotPool"))$("globalJackpotPool").textContent=chipsShort(pool);}catch{}
}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
