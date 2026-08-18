import {$,state,api,toast,chipsShort,refreshBootstrap,haptic,sound,confetti} from "./core.js";

const WILD="🃏",SCATTER="🌟";
const configs={
  slots:{title:"CLASSIC SLOTS",icon:"🎰",size:"3 REELS",lines:"CLASSIC",risk:"LOW",legacy:"classic",summary:"Классический автомат на три барабана.",bonus:"Собирай одинаковые символы. 7️⃣ — самый дорогой символ.",symbols:["🍒","🍋","🔔","⭐","💎","7️⃣"]},
  mega:{title:"MEGA REELS",icon:"🎰",size:"3×6",rows:3,cols:6,lines:20,risk:"HIGH",legacy:"mega",summary:"Большой слот на 18 клеток и 20 линий.",bonus:"WILD заменяет обычные символы, SCATTER платит независимо от линии.",symbols:["🍒","🍋","🔔","⭐","💎","7️⃣",WILD,SCATTER]},
  royal5:{title:"ROYAL FRUITS",icon:"🍒",size:"3×5",rows:3,cols:5,lines:20,risk:"MEDIUM",api:"advanced",summary:"Фруктовый слот со sticky-WILD бонусом.",bonus:"3+ SCATTER запускают фриспины. Выпавшие WILD остаются на месте до конца бонуса.",symbols:["🍒","🍋","🍇","🔔","💎","7️⃣",WILD,SCATTER]},
  neon8:{title:"NEON EMPIRE",icon:"⚡",size:"4×8",rows:4,cols:8,lines:40,risk:"HIGH",api:"advanced",summary:"Широкий слот на 32 клетки с длинными линиями.",bonus:"4+ SCATTER запускают WILD REACTOR. Sticky WILD увеличивают множитель бонуса.",symbols:["⚡","💿","💎","👑","🔥","8️⃣",WILD,SCATTER]},
  vault5:{title:"GOLDEN VAULT",icon:"👑",size:"5×5",rows:5,cols:5,lines:25,risk:"VERY HIGH",api:"advanced",summary:"Золотой высоковолатильный слот 5×5.",bonus:"3+ SCATTER запускают VAULT LOCK. WILD остаются, дополнительные WILD открывают GOLD LOCK.",symbols:["🪙","🏺","🐍","🦂","💎","👑",WILD,SCATTER]},
  moon5:{title:"MOONLIGHT RICHES",icon:"🌙",size:"3×5",rows:3,cols:5,lines:25,risk:"MEDIUM",api:"more",summary:"Ночной линейный слот с растущим бонусным множителем.",bonus:"3+ SCATTER запускают MOON ASCENSION. WILD остаются на поле.",symbols:["🌙","🔮","💎","🦉","👑","🌌",WILD,SCATTER]},
  dragon6:{title:"DRAGON FIRE",icon:"🐉",size:"4×6",rows:4,cols:6,lines:30,risk:"HIGH",api:"more",summary:"Огненный слот с длинными линиями и sticky-WILD.",bonus:"SCATTER запускают DRAGON RESPINS. Каждый новый WILD фиксируется и продлевает бонус.",symbols:["🔥","🪙","🏮","🐉","💎","👑",WILD,SCATTER]},
  grandjackpot:{title:"GRAND FORTUNE",icon:"💰",size:"3×5",rows:3,cols:5,lines:20,risk:"JACKPOT",api:"jackpot",summary:"Отдельный слот общего GRAND JACKPOT.",bonus:"FORTUNE VAULT: SCATTER запускают фриспины, WILD остаются. GRAND JACKPOT выпадает крайне редко и забирает весь банк.",symbols:["🍒","🔔","💎","👑","7️⃣",WILD,SCATTER,"💰"]}
};

let installed=false,busy=false,grid=null;

export function initSafeSlots(){
  if(installed)return;installed=true;
  ensureTiles();bindGrid();
  const observer=new MutationObserver(()=>{ensureTiles();bindGrid();});
  observer.observe(document.body,{childList:true,subtree:true});
}

function ensureTiles(){
  const g=document.querySelector("#casinoLobby .casino-grid");if(!g)return;
  const defs=[
    ["royal5","🍒 ROYAL FRUITS","3×5 • 20 линий • STICKY WILD","HOT"],
    ["neon8","⚡ NEON EMPIRE","4×8 • 40 линий • WILD REACTOR","WIDE"],
    ["vault5","👑 GOLDEN VAULT","5×5 • 25 линий • VAULT LOCK","BONUS"],
    ["moon5","🌙 MOONLIGHT RICHES","3×5 • 25 линий • MOON ASCENSION","NEW"],
    ["dragon6","🐉 DRAGON FIRE","4×6 • 30 линий • DRAGON RESPINS","HOT"],
    ["grandjackpot","💰 GRAND FORTUNE","3×5 • FORTUNE VAULT • GRAND JACKPOT","JACKPOT"]
  ];
  for(const [id,title,desc,badge] of defs){
    if(g.querySelector(`[data-casino-game="${id}"]`))continue;
    const b=document.createElement("button");b.dataset.casinoGame=id;b.dataset.category="slots";b.className=`safe-slot-tile safe-slot-${id}`;
    b.innerHTML=`<b>${title}</b><small>${desc}</small><em>${badge}</em><span class="safe-slot-symbols">${configs[id].symbols.slice(0,6).join(" ")}</span>`;
    g.appendChild(b);
  }
}

function bindGrid(){
  const g=document.querySelector("#casinoLobby .casino-grid");if(!g||g===grid)return;grid=g;
  g.addEventListener("click",onGridClick,true);
}

function onGridClick(e){
  const tile=e.target.closest?.("[data-casino-game]");if(!tile||!configs[tile.dataset.casinoGame])return;
  e.preventDefault();e.stopImmediatePropagation();openInfo(tile.dataset.casinoGame);
}

function openInfo(id){
  const c=configs[id],lobby=$("casinoLobby"),panel=$("casinoGamePanel"),body=$("casinoGameBody");if(!c||!lobby||!panel||!body)return;
  lobby.classList.add("hidden");panel.classList.remove("hidden");if($("casinoGameTitle"))$("casinoGameTitle").textContent=`${c.icon} ${c.title}`;
  body.innerHTML=`<article class="slot-info-card safe-slot-info"><div class="slot-info-art"><span>${c.icon}</span><i>${c.size}</i></div><div class="slot-info-kicker">FIT CASINO • SLOT INFO</div><h3>${c.title}</h3><p>${c.summary}</p><div class="slot-info-stats"><div><small>ПОЛЕ</small><b>${c.size}</b></div><div><small>ЛИНИИ</small><b>${c.lines}</b></div><div><small>РИСК</small><b>${c.risk}</b></div></div><div class="slot-info-symbols">${c.symbols.join(" ")}</div><div class="slot-bonus-info"><small>БОНУС</small><b>${c.bonus}</b></div>${id==="grandjackpot"?'<div class="jackpot-info-pool"><small>ТЕКУЩИЙ JACKPOT</small><strong id="safeInfoJackpot">ЗАГРУЗКА…</strong></div>':""}<button id="safeSlotPlay" class="casino-main-btn">ИГРАТЬ ${c.icon}</button></article>`;
  $("safeSlotPlay").onclick=()=>renderSlot(id);
  if(id==="grandjackpot")refreshJackpot("safeInfoJackpot");
}

function renderSlot(id){
  const c=configs[id],body=$("casinoGameBody");if(!c||!body)return;if($("casinoGameTitle"))$("casinoGameTitle").textContent=`${c.icon} ${c.title}`;
  if(id==="slots")return renderClassic();
  const cells=Array.from({length:c.rows*c.cols},(_,i)=>`<div class="safe-slot-cell" data-safe-cell="${i}">${c.symbols[i%c.symbols.length]}</div>`).join("");
  body.innerHTML=`<div class="safe-slot-machine safe-${id}">${id==="grandjackpot"?'<div class="v4-jackpot-meter"><small>GRAND JACKPOT</small><strong id="safeGameJackpot">0</strong></div>':""}<div class="safe-slot-head"><span>${c.lines} LINES</span><b>${c.title}</b><span>${c.size}</span></div><div class="safe-slot-screen" style="--rows:${c.rows};--cols:${c.cols}"><div class="safe-slot-grid">${cells}</div><div id="safeBonusHud" class="adv-bonus-hud hidden"><small>BONUS</small><b id="safeBonusText">FREE SPINS</b></div></div><div id="safeSlotResult" class="casino-result">Собирай линии слева направо</div></div>${betBox()}<div class="safe-spin-dock"><button id="safeSpin" class="casino-main-btn">SPIN ${c.icon}</button></div>`;
  bindBet();$("safeSpin").onclick=()=>spinGrid(id);if(id==="grandjackpot")refreshJackpot("safeGameJackpot");
}

function renderClassic(){
  const body=$("casinoGameBody");body.innerHTML=`<div class="slot-machine"><div class="slot-reels"><div class="safe-classic-reel">🍒</div><div class="safe-classic-reel">💎</div><div class="safe-classic-reel">7️⃣</div></div><div id="safeSlotResult" class="casino-result">Собери три одинаковых символа</div></div>${betBox()}<div class="safe-spin-dock"><button id="safeSpin" class="casino-main-btn">SPIN 🎰</button></div>`;bindBet();$("safeSpin").onclick=spinClassic;
}

function betBox(){return `<div class="casino-bet safe-bet"><label>СТАВКА</label><input id="safeBet" type="number" min="1000" max="5000000" step="1000" value="10000" inputmode="numeric"><div class="casino-presets"><button data-safe-bet="10000">10K</button><button data-safe-bet="50000">50K</button><button data-safe-bet="100000">100K</button><button data-safe-bet="500000">500K</button></div><div class="required-maxwin">MAX WIN <b id="safeMaxWin">10M</b></div></div>`;}
function bindBet(){document.querySelectorAll("[data-safe-bet]").forEach(b=>b.onclick=()=>{$("safeBet").value=b.dataset.safeBet;updateMax();});$("safeBet").oninput=updateMax;updateMax();}
function updateMax(){const n=Math.max(0,Math.floor(Number($("safeBet")?.value||0)));if($("safeMaxWin"))$("safeMaxWin").textContent=chipsShort(n*1000);}
function readBet(){const n=Math.floor(Number($("safeBet")?.value||0));if(n<1000)throw new Error("Минимальная ставка 1K");if(n>5_000_000)throw new Error("Максимальная ставка 5M");if(n>Number(state.player?.balance||0))throw new Error("Недостаточно фишек");return n;}

async function spinClassic(){
  if(busy)return;let amount;try{amount=readBet();}catch(e){return toast(e.message)}busy=true;const btn=$("safeSpin");btn.disabled=true;slotSound("spin");
  const reels=[...document.querySelectorAll(".safe-classic-reel")],symbols=configs.slots.symbols,timers=reels.map((el,i)=>setInterval(()=>el.textContent=symbols[Math.floor(Math.random()*symbols.length)],55+i*10));
  try{const d=await api("/api/casino/slots",{bet:amount,requestId:crypto.randomUUID()});await wait(620);for(let i=0;i<reels.length;i++){clearInterval(timers[i]);reels[i].textContent=d.result.reels[i];slotSound("reel");await wait(100);}finish(d,amount);}
  catch(e){timers.forEach(clearInterval);toast(e.message);}finally{timers.forEach(clearInterval);busy=false;btn.disabled=false;}
}

async function spinGrid(id){
  if(busy)return;let amount;try{amount=readBet();}catch(e){return toast(e.message)}const c=configs[id],btn=$("safeSpin");busy=true;btn.disabled=true;slotSound("spin");clearWins();
  try{
    let path,payload={bet:amount,requestId:crypto.randomUUID()};
    if(c.legacy==="mega")path="/api/casino/mega-slots";
    else if(c.api==="advanced"){path="/api/casino/advanced-slot/spin";payload.slotId=id;}
    else if(c.api==="more"){path="/api/casino/more-slot/spin";payload.slotId=id;}
    else if(c.api==="jackpot")path="/api/casino/jackpot/spin";
    const d=await api(path,payload);await animateGrid(d.result.grid,c);
    const lines=d.result.base?.lines||d.result.lines||[];markWins(lines,c);
    if(d.result.bonusTriggered&&d.result.bonus)await playBonus(d.result.bonus,c);
    finish(d,amount);if(id==="grandjackpot")await refreshJackpot("safeGameJackpot");
  }catch(e){toast(e.message);}finally{busy=false;btn.disabled=false;}
}

async function animateGrid(grid,c){
  const cells=[...document.querySelectorAll(".safe-slot-cell")],timers=[];cells.forEach((cell,i)=>{const col=i%c.cols;timers[i]=setInterval(()=>cell.textContent=c.symbols[Math.floor(Math.random()*c.symbols.length)],45+(col%4)*4);});await wait(480);
  for(let col=0;col<c.cols;col++){for(let r=0;r<c.rows;r++){const i=r*c.cols+col;clearInterval(timers[i]);if(cells[i])cells[i].textContent=grid?.[r]?.[col]||"?";}slotSound("reel");await wait(45);}timers.forEach(clearInterval);
}

async function playBonus(bonus,c){
  const hud=$("safeBonusHud");hud?.classList.remove("hidden");let sticky=new Set((bonus.initialSticky||[]).map(x=>x.join(":")));
  const frames=bonus.frames||[];for(let i=0;i<frames.length;i++){const f=frames[i];if($("safeBonusText"))$("safeBonusText").textContent=`${i+1}/${frames.length}`;await renderBonusFrame(f.grid,c,sticky);sticky=new Set((f.sticky||[]).map(x=>x.join(":")));markSticky(sticky,c);setText(`BONUS +${chipsShort(f.payout||0)}`,Number(f.payout||0)>0);await wait(220);}hud?.classList.add("hidden");
}

async function renderBonusFrame(grid,c,sticky){const cells=[...document.querySelectorAll(".safe-slot-cell")];for(let r=0;r<c.rows;r++)for(let col=0;col<c.cols;col++){const i=r*c.cols+col;if(cells[i]&&!sticky.has(`${r}:${col}`))cells[i].textContent=grid?.[r]?.[col]||"?";}await wait(250);}
function markSticky(set,c){document.querySelectorAll(".safe-slot-cell").forEach(x=>x.classList.remove("sticky-wild"));for(const k of set){const [r,col]=k.split(":").map(Number);document.querySelector(`[data-safe-cell="${r*c.cols+col}"]`)?.classList.add("sticky-wild");}}
function markWins(lines,c){for(const w of lines.slice(0,10)){(w.rows||[]).slice(0,w.count||c.cols).forEach((r,col)=>document.querySelector(`[data-safe-cell="${r*c.cols+col}"]`)?.classList.add("win"));}}
function clearWins(){document.querySelectorAll(".safe-slot-cell").forEach(x=>x.classList.remove("win","sticky-wild"));}

async function finish(d,amount){const payout=Number(d.payout||0);if(d.result?.jackpotHit){setText(`💰 GRAND JACKPOT +${chipsShort(d.result.jackpotPayout||0)}`,true);confetti();sound("win");haptic("success");}else if(payout>amount){setText(`WIN ${chipsShort(payout)} • ×${Number(d.multiplier||0).toFixed(2)}`,true);confetti();sound("win");haptic("success");}else if(payout>0){setText(`RETURN ${chipsShort(payout)}`,false);sound("click");}else{setText("NO WIN",false);sound("lose");}await refreshBootstrap();}
function setText(text,win){const el=$("safeSlotResult");if(!el)return;el.textContent=text;el.classList.toggle("win",!!win);el.classList.toggle("lose",!win);}
async function refreshJackpot(id){try{const d=await api("/api/casino/jackpot/status");if($(id))$(id).textContent=Number(d.pool||0).toLocaleString("ru-RU");}catch{}}

let audioCtx=null;
function slotSound(type){try{audioCtx||=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume();const now=audioCtx.currentTime;if(type==="spin"){for(let i=0;i<6;i++)tone(120+i*18,.035,now+i*.045);return;}tone(390,.045,now);}catch{}}
function tone(freq,duration,start){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.setValueAtTime(freq,start);g.gain.setValueAtTime(.02,start);g.gain.exponentialRampToValueAtTime(.001,start+duration);o.connect(g);g.connect(audioCtx.destination);o.start(start);o.stop(start+duration);}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
