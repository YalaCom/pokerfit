import {$,state,api,toast,chipsShort,refreshBootstrap,haptic,sound,confetti} from "./core.js";

const WILD="🃏",SCATTER="🌟";
const catalog={
  moon5:{title:"MOONLIGHT RICHES",icon:"🌙",size:"3×5",rows:3,cols:5,lines:25,risk:"MEDIUM",accent:"moon",summary:"Ночной линейный слот с растущим множителем во фриспинах.",bonusTitle:"MOON ASCENSION",bonus:"3+ SCATTER запускают 6 фриспинов. WILD остаются на поле, а множитель бонуса растёт с каждым вращением.",symbols:["🌙","🔮","💎","🦉","👑","🌌",WILD,SCATTER]},
  dragon6:{title:"DRAGON FIRE",icon:"🐉",size:"4×6",rows:4,cols:6,lines:30,risk:"HIGH",accent:"dragon",summary:"Огненный слот на 24 клетки с длинными линиями и липкими WILD.",bonusTitle:"DRAGON RESPINS",bonus:"4+ SCATTER запускают бонус. Каждый новый WILD фиксируется и добавляет дополнительное вращение.",symbols:["🔥","🪙","🏮","🐉","💎","👑",WILD,SCATTER]},
  grandjackpot:{title:"GRAND FORTUNE",icon:"💰",size:"3×5",rows:3,cols:5,lines:20,risk:"JACKPOT",accent:"jackpot",summary:"Премиальный слот с общим виртуальным Jackpot-банком клуба.",bonusTitle:"GRAND JACKPOT",bonus:"Каждое вращение немного увеличивает общий виртуальный банк. Сам Jackpot выпадает экстремально редко — примерно 1 шанс из 250 000 вращений.",symbols:["🍒","🔔","💎","👑","7️⃣",WILD,SCATTER,"💰"]}
};
let installed=false,busy=false,observer=null;

export function initSlotExpansion(){
  if(installed)return;installed=true;
  document.addEventListener("click",capture,true);
  observer=new MutationObserver(enhance);observer.observe(document.body,{childList:true,subtree:true});enhance();
}

function enhance(){installTiles();installWalletBar();installFixedDock();}

function installTiles(){
  const grid=document.querySelector("#casinoLobby .casino-grid");if(!grid)return;
  const defs=[["moon5","🌙 MOONLIGHT RICHES","3×5 • 25 линий • Moon Ascension","NEW"],["dragon6","🐉 DRAGON FIRE","4×6 • 30 линий • Sticky Respins","HOT"],["grandjackpot","💰 GRAND FORTUNE","3×5 • общий Jackpot банка","JACKPOT"]];
  for(const [id,title,desc,badge] of defs){
    if(grid.querySelector(`[data-casino-game="${id}"]`))continue;
    const b=document.createElement("button");b.dataset.casinoGame=id;b.dataset.category="slots";b.className=`v4-slot-tile v4-${id}`;
    b.innerHTML=`<b>${title}</b><small>${desc}</small><em>${badge}</em><span class="v4-symbol-strip">${catalog[id].symbols.slice(0,6).join(" ")}</span>`;
    grid.appendChild(b);
  }
}

function installWalletBar(){
  const lobby=$("casinoLobby"),hero=lobby?.querySelector(".casino-hero");if(!lobby||!hero||lobby.querySelector(".virtual-wallet-bar"))return;
  const bar=document.createElement("div");bar.className="virtual-wallet-bar";
  bar.innerHTML=`<button id="virtualChipRequest"><small>VIRTUAL CHIPS</small><b>+500K</b><span>ЗАПРОСИТЬ</span></button><button id="jackpotPoolButton" class="jackpot-pool-pill"><small>GRAND JACKPOT</small><b id="globalJackpotPool">—</b><span>ОБЩИЙ БАНК</span></button>`;
  hero.insertAdjacentElement("afterend",bar);
  $("virtualChipRequest").onclick=requestChips;
  $("jackpotPoolButton").onclick=()=>document.querySelector('[data-casino-game="grandjackpot"]')?.click();
  refreshJackpotPool();
}

async function requestChips(){
  const b=$("virtualChipRequest");if(!b)return;b.disabled=true;
  try{const d=await api("/api/virtual-chips/request");toast(d.alreadyPending?"Заявка уже ждёт подтверждения":"Заявка на +500K отправлена администратору");haptic("success");}
  catch(e){toast(e.message==="REQUEST_COOLDOWN"?"Подожди несколько минут перед новой заявкой":e.message);}
  finally{b.disabled=false;}
}
async function refreshJackpotPool(){try{const d=await api("/api/casino/jackpot/status");if($("globalJackpotPool"))$("globalJackpotPool").textContent=chipsShort(d.pool);}catch{}}

function capture(e){
  const tile=e.target.closest?.("#casinoLobby [data-casino-game]");if(tile&&catalog[tile.dataset.casinoGame]){e.preventDefault();e.stopImmediatePropagation();showInfo(tile.dataset.casinoGame);return;}
  const spin=e.target.closest?.("#slotSpin,#megaSpin,#advSpinButton,.v4-spin");if(spin){slotFx("spin");setTimeout(()=>slotFx("reel"),180);setTimeout(()=>slotFx("reel"),350);setTimeout(()=>slotFx("reel"),520);}
}

function showInfo(id){
  const c=catalog[id],lobby=$("casinoLobby"),panel=$("casinoGamePanel"),body=$("casinoGameBody"),title=$("casinoGameTitle");if(!c||!lobby||!panel||!body)return;
  lobby.classList.add("hidden");panel.classList.remove("hidden");title.textContent=`${c.icon} ${c.title}`;
  body.innerHTML=`<article class="slot-info-card v4-info-${c.accent}"><div class="slot-info-art"><span>${c.icon}</span><i>${c.size}</i></div><div class="slot-info-kicker">FIT CASINO • SLOT INFO</div><h3>${c.title}</h3><p>${c.summary}</p><div class="slot-info-stats"><div><small>ПОЛЕ</small><b>${c.size}</b></div><div><small>ЛИНИИ</small><b>${c.lines}</b></div><div><small>РИСК</small><b>${c.risk}</b></div></div><div class="slot-info-symbols">${c.symbols.join(" ")}</div><div class="slot-bonus-info"><small>${c.bonusTitle}</small><b>${c.bonus}</b></div>${id==="grandjackpot"?'<div class="jackpot-info-pool"><small>ТЕКУЩИЙ ВИРТУАЛЬНЫЙ БАНК</small><strong id="infoJackpotPool">ЗАГРУЗКА…</strong></div>':""}<button id="v4InfoPlay" class="casino-main-btn">ИГРАТЬ ${c.icon}</button></article>`;
  if(id==="grandjackpot")api("/api/casino/jackpot/status").then(d=>{if($("infoJackpotPool"))$("infoJackpotPool").textContent=`${Number(d.pool).toLocaleString("ru-RU")} CHIPS`;}).catch(()=>{});
  $("v4InfoPlay").onclick=()=>renderSlot(id);
}

function renderSlot(id){
  const c=catalog[id],body=$("casinoGameBody"),title=$("casinoGameTitle");if(!c||!body)return;title.textContent=`${c.icon} ${c.title}`;
  const cells=Array.from({length:c.rows*c.cols},(_,i)=>`<div class="v4-slot-cell" data-v4-cell="${i}">${c.symbols[i%c.symbols.length]}</div>`).join("");
  body.innerHTML=`<div class="v4-slot-cabinet theme-${c.accent}"><div class="v4-slot-header"><span>${c.lines} LINES</span><b>${c.title}</b><span>${c.size}</span></div>${id==="grandjackpot"?'<div class="v4-jackpot-meter"><small>GRAND JACKPOT</small><strong id="gameJackpotPool">—</strong></div>':""}<div class="v4-slot-screen" style="--rows:${c.rows};--cols:${c.cols}"><div id="v4Grid" class="v4-grid">${cells}</div><svg id="v4Paylines" class="adv-payline-svg" viewBox="0 0 ${c.cols*100} ${c.rows*100}" preserveAspectRatio="none"></svg><div id="v4BonusHud" class="adv-bonus-hud hidden"><small>${c.bonusTitle}</small><b id="v4BonusSpin">BONUS</b><em id="v4BonusMult">1.00×</em></div></div><div id="casinoResult" class="casino-result">Собирай линии слева направо</div></div><div class="casino-bet"><label>СТАВКА</label><input id="casinoBet" type="number" min="1000" max="5000000" step="1000" value="20000" inputmode="numeric"><div class="casino-presets"><button data-cbet="10000">10K</button><button data-cbet="50000">50K</button><button data-cbet="100000">100K</button><button data-cbet="500000">500K</button></div></div><button id="v4Spin" class="casino-main-btn v4-spin">SPIN ${c.icon}</button>`;
  document.querySelectorAll("[data-cbet]").forEach(b=>b.onclick=()=>{$("casinoBet").value=b.dataset.cbet;});$("v4Spin").onclick=()=>spin(id);if(id==="grandjackpot")refreshGameJackpot();enhance();
}

async function refreshGameJackpot(){try{const d=await api("/api/casino/jackpot/status");if($("gameJackpotPool"))$("gameJackpotPool").textContent=Number(d.pool).toLocaleString("ru-RU");}catch{}}
function readBet(){const n=Math.floor(Number($("casinoBet")?.value||0));if(n<1000)throw new Error("Минимальная ставка 1K");if(n>5_000_000)throw new Error("Максимальная ставка 5M");if(n>Number(state.player?.balance||0))throw new Error("Недостаточно фишек");return n;}

async function spin(id){
  if(busy)return;let amount;try{amount=readBet();}catch(e){return toast(e.message)}busy=true;const btn=$("v4Spin");btn.disabled=true;clearVisuals();slotFx("spin");haptic("medium");
  try{
    const path=id==="grandjackpot"?"/api/casino/jackpot/spin":"/api/casino/more-slot/spin",payload=id==="grandjackpot"?{bet:amount,requestId:crypto.randomUUID()}:{slotId:id,bet:amount,requestId:crypto.randomUUID()};
    const d=await api(path,payload);await animate(d.result.grid,catalog[id],520);drawLines(d.result.base?.lines||[],catalog[id]);
    if(id!=="grandjackpot"&&d.result.bonusTriggered&&d.result.bonus){setResult(d.result.base?.payout||0,`🌟 ${d.result.bonus.name} АКТИВИРОВАН`);slotFx("bonus");await wait(650);await animateBonus(d.result.bonus,catalog[id]);}
    if(id==="grandjackpot"&&d.result.jackpotHit){setResult(d.payout,`💰 GRAND JACKPOT ${chipsShort(d.result.jackpotPayout)}!`);slotFx("jackpot");confetti();haptic("success");await wait(850);}else if(d.payout>amount){setResult(d.payout,`WIN ${chipsShort(d.payout)} • ×${Number(d.multiplier||0).toFixed(2)}`);sound("win");confetti();}else if(d.payout>0){setResult(d.payout,`RETURN ${chipsShort(d.payout)}`);sound("click");}else{setResult(0,"NO WIN");sound("lose");slotFx("lose");}
    await refreshBootstrap();if(id==="grandjackpot"){await refreshGameJackpot();await refreshJackpotPool();}
  }catch(e){toast(e.message)}finally{busy=false;btn.disabled=false;}
}

async function animateBonus(bonus,c){
  const hud=$("v4BonusHud");hud?.classList.remove("hidden");let locked=new Set((bonus.initialSticky||[]).map(x=>x.join(":")));
  for(let i=0;i<(bonus.frames||[]).length;i++){const f=bonus.frames[i];if($("v4BonusSpin"))$("v4BonusSpin").textContent=`SPIN ${i+1}/${bonus.frames.length}`;if($("v4BonusMult"))$("v4BonusMult").textContent=`${Number(f.bonusMultiplier||1).toFixed(2)}×`;clearVisuals(false);await animate(f.grid,c,330,locked);locked=new Set((f.sticky||[]).map(x=>x.join(":")));markSticky(locked,c,f.newSticky||[]);drawLines(f.lines||[],c);setResult(f.payout,`BONUS • +${chipsShort(f.payout||0)}${(f.newSticky||[]).length?` • NEW WILD ${(f.newSticky||[]).length}`:""}`);if((f.newSticky||[]).length)slotFx("wild");await wait(280);}hud?.classList.add("hidden");
}

async function animate(grid,c,duration=520,locked=new Set()){
  const cells=[...document.querySelectorAll(".v4-slot-cell")],timers=[];cells.forEach((cell,i)=>{const r=Math.floor(i/c.cols),col=i%c.cols;if(locked.has(`${r}:${col}`))return;cell.classList.add("spinning");timers[i]=setInterval(()=>cell.textContent=c.symbols[Math.floor(Math.random()*c.symbols.length)],42+(col%4)*4);});await wait(duration);
  for(let col=0;col<c.cols;col++){for(let r=0;r<c.rows;r++){const i=r*c.cols+col;if(timers[i]){clearInterval(timers[i]);cells[i].textContent=grid[r][col];cells[i].classList.remove("spinning");cells[i].classList.add("land");setTimeout(()=>cells[i].classList.remove("land"),180);}}slotFx("reel");haptic("light");await wait(45);}timers.forEach(t=>t&&clearInterval(t));
}
function markSticky(set,c,fresh=[]){document.querySelectorAll(".v4-slot-cell").forEach(x=>x.classList.remove("sticky-wild","new-sticky"));for(const k of set){const [r,col]=k.split(":").map(Number);document.querySelector(`[data-v4-cell="${r*c.cols+col}"]`)?.classList.add("sticky-wild");}for(const [r,col] of fresh)document.querySelector(`[data-v4-cell="${r*c.cols+col}"]`)?.classList.add("new-sticky");}
function drawLines(lines,c){const svg=$("v4Paylines");if(!svg)return;svg.innerHTML="";for(const w of lines.slice(0,10)){const pts=w.rows.slice(0,w.count).map((r,col)=>`${50+col*100},${50+r*100}`).join(" ");svg.insertAdjacentHTML("beforeend",`<polyline points="${pts}" class="mega-line"></polyline>`);w.rows.slice(0,w.count).forEach((r,col)=>document.querySelector(`[data-v4-cell="${r*c.cols+col}"]`)?.classList.add("win"));}}
function clearVisuals(clearSticky=true){$("v4Paylines")?.replaceChildren();document.querySelectorAll(".v4-slot-cell").forEach(x=>{x.classList.remove("win","new-sticky");if(clearSticky)x.classList.remove("sticky-wild");});}
function setResult(payout,text){const el=$("casinoResult");if(!el)return;el.textContent=text;el.classList.remove("win","lose","push");el.classList.add(payout>0?"win":"lose");}

function installFixedDock(){
  const body=$("casinoGameBody");if(!body)return;const slot=body.querySelector(".slot-machine,.mega-cabinet,.adv-slot-cabinet,.v4-slot-cabinet");if(!slot)return;
  if(body.querySelector(".slot-control-dock"))return;
  const bet=[...body.children].find(x=>x.classList?.contains("casino-bet")),button=[...body.children].find(x=>x.classList?.contains("casino-main-btn"));if(!bet||!button)return;
  const dock=document.createElement("div");dock.className="slot-control-dock";bet.insertAdjacentElement("beforebegin",dock);dock.append(bet,button);
}

let audioCtx=null;
function slotFx(type){
  try{audioCtx||=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume();const now=audioCtx.currentTime;
    if(type==="spin"){for(let i=0;i<8;i++)tone(105+i*16,.035,now+i*.045,"sawtooth",.018);return;}
    if(type==="reel"){tone(420,.045,now,"square",.025);tone(210,.06,now+.025,"sine",.018);return;}
    if(type==="wild"){tone(680,.08,now,"sine",.03);tone(920,.11,now+.06,"sine",.025);return;}
    if(type==="bonus"){[420,560,720,920].forEach((f,i)=>tone(f,.13,now+i*.09,"triangle",.03));return;}
    if(type==="jackpot"){[440,554,659,880,1108].forEach((f,i)=>tone(f,.3,now+i*.12,"triangle",.045));return;}
    if(type==="lose"){tone(175,.14,now,"sawtooth",.018);tone(120,.2,now+.08,"sine",.015);}
  }catch{}
}
function tone(freq,duration,start,type,gain){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,start);g.gain.setValueAtTime(gain,start);g.gain.exponentialRampToValueAtTime(.001,start+duration);o.connect(g);g.connect(audioCtx.destination);o.start(start);o.stop(start+duration);}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
