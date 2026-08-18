import {$,state,api,toast,chipsShort,refreshBootstrap,haptic,sound,confetti} from "./core.js";

const WILD="🃏",SCATTER="🌟";
const configs={
  slots:{title:"CLASSIC SLOTS",icon:"🎰",size:"3 REELS",lines:"CLASSIC",risk:"LOW",legacy:"classic",summary:"Классический автомат на три барабана.",bonus:"Собирай одинаковые символы. 7️⃣ — самый дорогой символ.",symbols:["🍒","🍋","🔔","⭐","💎","7️⃣"]},
  mega:{title:"MEGA REELS",icon:"🎰",size:"3×6",rows:3,cols:6,lines:20,risk:"HIGH",legacy:"mega",summary:"Большой слот на 18 клеток и 20 линий.",bonus:"WILD заменяет обычные символы, SCATTER платит независимо от линии. Редкие WILD могут получить ×2 / ×5 / ×10.",symbols:["🍒","🍋","🔔","⭐","💎","7️⃣",WILD,SCATTER]},
  royal5:{title:"ROYAL FRUITS",icon:"🍒",size:"3×5",rows:3,cols:5,lines:20,risk:"MEDIUM",api:"advanced",buyable:true,feature:"STICKY PARTY",summary:"Фруктовый слот со sticky-WILD бонусом.",bonus:"SCATTER запускают фриспины. WILD остаются на месте; редкие WILD ×2 / ×5 / ×10 умножают линии.",symbols:["🍒","🍋","🍇","🔔","💎","7️⃣",WILD,SCATTER]},
  neon8:{title:"NEON EMPIRE",icon:"⚡",size:"4×8",rows:4,cols:8,lines:40,risk:"HIGH",api:"advanced",buyable:true,feature:"WILD REACTOR",summary:"Широкий слот на 32 клетки с длинными линиями.",bonus:"WILD REACTOR: sticky WILD разгоняют общий множитель; ×5 и ×10 встречаются заметно реже ×2.",symbols:["⚡","💿","💎","👑","🔥","8️⃣",WILD,SCATTER]},
  vault5:{title:"GOLDEN VAULT",icon:"👑",size:"5×5",rows:5,cols:5,lines:25,risk:"VERY HIGH",api:"advanced",buyable:true,feature:"VAULT LOCK",summary:"Золотой высоковолатильный слот 5×5.",bonus:"VAULT LOCK: WILD остаются, накопленные WILD открывают дополнительные GOLD LOCK. Multiplier-WILD участвуют в линиях.",symbols:["🪙","🏺","🐍","🦂","💎","👑",WILD,SCATTER]},
  moon5:{title:"MOONLIGHT RICHES",icon:"🌙",size:"3×5",rows:3,cols:5,lines:25,risk:"MEDIUM",api:"more",buyable:true,feature:"MOON ASCENSION",summary:"Ночной линейный слот с растущим бонусным множителем.",bonus:"MOON ASCENSION: WILD остаются, общий множитель растёт по мере бонуса; редкие WILD ×2/×5/×10 усиливают линии.",symbols:["🌙","🔮","💎","🦉","👑","🌌",WILD,SCATTER]},
  dragon6:{title:"DRAGON FIRE",icon:"🐉",size:"4×6",rows:4,cols:6,lines:30,risk:"HIGH",api:"more",buyable:true,feature:"DRAGON RESPINS",summary:"Огненный слот с длинными линиями и sticky-WILD.",bonus:"DRAGON RESPINS: новый WILD фиксируется и может продлить бонус. ×10 WILD — самый редкий.",symbols:["🔥","🪙","🏮","🐉","💎","👑",WILD,SCATTER]},
  grandjackpot:{title:"GRAND FORTUNE",icon:"💰",size:"3×5",rows:3,cols:5,lines:20,risk:"JACKPOT",api:"jackpot",buyable:true,feature:"FORTUNE VAULT",summary:"Отдельный слот общего GRAND JACKPOT.",bonus:"FORTUNE VAULT: sticky WILD, денежные символы и multiplier-WILD. Покупка бонуса не меняет редкий шанс самого GRAND JACKPOT.",symbols:["🍒","🔔","💎","👑","7️⃣",WILD,SCATTER,"💰"]}
};

const BUY_TIERS=[
  {id:"standard",name:"FREE SPINS",cost:60,badge:"STANDARD",text:"Базовая версия бонуса. Обычное число фриспинов и стандартная частота multiplier-WILD."},
  {id:"premium",name:"WILD BOOST",cost:100,badge:"BOOST",text:"Больше фриспинов, стартовый sticky-WILD и повышенный шанс ×2/×5."},
  {id:"super",name:"SUPER MULTI",cost:180,badge:"SUPER",text:"Ещё больше фриспинов, дополнительные стартовые WILD и доступ к более редким ×10."}
];

let installed=false,busy=false,grid=null,currentSlot=null;
let autoRemaining=0,autoStopRequested=false;

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
  e.preventDefault();e.stopImmediatePropagation();stopAuto();openInfo(tile.dataset.casinoGame);
}

function openInfo(id){
  const c=configs[id],lobby=$("casinoLobby"),panel=$("casinoGamePanel"),body=$("casinoGameBody");if(!c||!lobby||!panel||!body)return;
  currentSlot=id;lobby.classList.add("hidden");panel.classList.remove("hidden");if($("casinoGameTitle"))$("casinoGameTitle").textContent=`${c.icon} ${c.title}`;
  body.innerHTML=`<article class="slot-info-card safe-slot-info">
    <div class="slot-info-art"><span>${c.icon}</span><i>${c.size}</i></div>
    <div class="slot-info-kicker">FIT CASINO • SLOT INFO</div>
    <h3>${c.title}</h3><p>${c.summary}</p>
    <div class="slot-info-stats"><div><small>ПОЛЕ</small><b>${c.size}</b></div><div><small>ЛИНИИ</small><b>${c.lines}</b></div><div><small>РИСК</small><b>${c.risk}</b></div></div>
    <div class="slot-info-symbols">${c.symbols.join(" ")} <span class="safe-info-multi">🃏×2 🃏×5 🃏×10</span></div>
    <div class="slot-bonus-info"><small>${c.feature||"БОНУС"}</small><b>${c.bonus}</b></div>
    ${c.buyable?'<div class="safe-buy-note"><b>BONUS BUY</b><span>Внутри слота доступны 3 варианта покупки бонуса за виртуальные фишки.</span></div>':""}
    ${id==="grandjackpot"?'<div class="jackpot-info-pool"><small>ТЕКУЩИЙ JACKPOT</small><strong id="safeInfoJackpot">ЗАГРУЗКА…</strong></div>':""}
    <button id="safeSlotPlay" class="casino-main-btn">ИГРАТЬ ${c.icon}</button>
  </article>`;
  $("safeSlotPlay").onclick=()=>renderSlot(id);
  if(id==="grandjackpot")refreshJackpot("safeInfoJackpot");
}

function renderSlot(id){
  const c=configs[id],body=$("casinoGameBody");if(!c||!body)return;currentSlot=id;stopAuto();
  if($("casinoGameTitle"))$("casinoGameTitle").textContent=`${c.icon} ${c.title}`;
  if(id==="slots")return renderClassic();
  const cells=Array.from({length:c.rows*c.cols},(_,i)=>`<div class="safe-slot-cell" data-safe-cell="${i}">${c.symbols[i%c.symbols.length]}</div>`).join("");
  body.innerHTML=`<div class="safe-slot-machine safe-${id}">
    ${id==="grandjackpot"?'<div class="v4-jackpot-meter"><small>GRAND JACKPOT</small><strong id="safeGameJackpot">0</strong></div>':""}
    <div class="safe-slot-head"><span>${c.lines} LINES</span><b>${c.title}</b><span>${c.size}</span></div>
    <div class="safe-slot-screen" style="--rows:${c.rows};--cols:${c.cols}">
      <div class="safe-slot-grid">${cells}</div>
      <div id="safeBonusHud" class="safe-bonus-hud hidden"><small>${c.feature||"BONUS"}</small><b id="safeBonusText">FREE SPINS</b><em id="safeBonusTier"></em></div>
    </div>
    <div id="safeSlotResult" class="casino-result">Собирай линии слева направо</div>
  </div>
  <div class="safe-control-dock">
    ${betBox()}
    <div class="safe-main-actions">
      <button id="safeSpin" class="casino-main-btn safe-spin-main">SPIN ${c.icon}</button>
      <div class="safe-side-actions">
        ${c.buyable?'<button id="safeBuyBonus" class="safe-feature-btn"><span>⚡</span><b>КУПИТЬ БОНУС</b></button>':""}
        <button id="safeAuto" class="safe-feature-btn"><span>↻</span><b>АВТО</b></button>
      </div>
      <button id="safeStopAuto" class="safe-stop-auto hidden">STOP AUTO <b id="safeAutoCount">0</b></button>
    </div>
  </div>`;
  bindBet();
  $("safeSpin").onclick=()=>spinGrid(id,false);
  if($("safeBuyBonus"))$("safeBuyBonus").onclick=()=>openBonusBuy(id);
  $("safeAuto").onclick=()=>openAutoMenu(id);
  $("safeStopAuto").onclick=stopAuto;
  if(id==="grandjackpot")refreshJackpot("safeGameJackpot");
}

function renderClassic(){
  const body=$("casinoGameBody");currentSlot="slots";stopAuto();
  body.innerHTML=`<div class="slot-machine"><div class="slot-reels"><div class="safe-classic-reel">🍒</div><div class="safe-classic-reel">💎</div><div class="safe-classic-reel">7️⃣</div></div><div id="safeSlotResult" class="casino-result">Собери три одинаковых символа</div></div>
  <div class="safe-control-dock">${betBox()}<div class="safe-main-actions"><button id="safeSpin" class="casino-main-btn safe-spin-main">SPIN 🎰</button><div class="safe-side-actions"><button id="safeAuto" class="safe-feature-btn"><span>↻</span><b>АВТО</b></button></div><button id="safeStopAuto" class="safe-stop-auto hidden">STOP AUTO <b id="safeAutoCount">0</b></button></div></div>`;
  bindBet();$("safeSpin").onclick=()=>spinClassic(false);$("safeAuto").onclick=()=>openAutoMenu("slots");$("safeStopAuto").onclick=stopAuto;
}

function betBox(){return `<div class="casino-bet safe-bet"><label>СТАВКА</label><input id="safeBet" type="number" min="1000" max="5000000" step="1000" value="10000" inputmode="numeric"><div class="casino-presets"><button data-safe-bet="10000">10K</button><button data-safe-bet="50000">50K</button><button data-safe-bet="100000">100K</button><button data-safe-bet="500000">500K</button></div><div class="required-maxwin">MAX WIN <b id="safeMaxWin">10M</b></div></div>`;}
function bindBet(){document.querySelectorAll("[data-safe-bet]").forEach(b=>b.onclick=()=>{if($("safeBet"))$("safeBet").value=b.dataset.safeBet;updateMax();});if($("safeBet"))$("safeBet").oninput=updateMax;updateMax();}
function updateMax(){const n=Math.max(0,Math.floor(Number($("safeBet")?.value||0)));if($("safeMaxWin"))$("safeMaxWin").textContent=chipsShort(n*1000);}
function readBet(checkBalance=true){const n=Math.floor(Number($("safeBet")?.value||0));if(n<1000)throw new Error("Минимальная ставка 1K");if(n>5_000_000)throw new Error("Максимальная ставка 5M");if(checkBalance&&n>Number(state.player?.balance||0))throw new Error("Недостаточно фишек");return n;}

async function spinClassic(fromAuto=false){
  if(busy)return false;if(autoRemaining&&!fromAuto)return false;
  let amount;try{amount=readBet();}catch(e){toast(e.message);return false;}
  busy=true;const btn=$("safeSpin");if(btn)btn.disabled=true;slotSound("spin");
  const reels=[...document.querySelectorAll(".safe-classic-reel")],symbols=configs.slots.symbols,timers=reels.map((el,i)=>setInterval(()=>el.textContent=symbols[Math.floor(Math.random()*symbols.length)],60+i*10));
  try{
    const d=await api("/api/casino/slots",{bet:amount,requestId:crypto.randomUUID()});
    await wait(780);
    for(let i=0;i<reels.length;i++){clearInterval(timers[i]);reels[i].textContent=d.result.reels[i];slotSound("reel");await wait(155);}
    await finish(d,amount);return true;
  }catch(e){timers.forEach(clearInterval);toast(e.message);return false;}
  finally{timers.forEach(clearInterval);busy=false;if(btn)btn.disabled=false;}
}

async function spinGrid(id,fromAuto=false){
  if(busy)return false;if(autoRemaining&&!fromAuto)return false;
  let amount;try{amount=readBet();}catch(e){toast(e.message);return false;}
  const c=configs[id],btn=$("safeSpin");busy=true;if(btn)btn.disabled=true;slotSound("spin");clearWins();
  try{
    let path,payload={bet:amount,requestId:crypto.randomUUID()};
    if(c.legacy==="mega")path="/api/casino/mega-slots";
    else if(c.api==="advanced"){path="/api/casino/advanced-slot/spin";payload.slotId=id;}
    else if(c.api==="more"){path="/api/casino/more-slot/spin";payload.slotId=id;}
    else if(c.api==="jackpot")path="/api/casino/jackpot/spin";
    const d=await api(path,payload);
    await animateGrid(d.result.grid,c);
    const lines=d.result.base?.lines||d.result.lines||[];markWins(lines,c);
    if(hasMultiplierWild(d.result.grid)){slotSound("multi");haptic("medium");}
    if(d.result.bonusTriggered&&d.result.bonus){slotSound("bonus");await wait(650);await playBonus(d.result.bonus,c);}
    await finish(d,amount);if(id==="grandjackpot")await refreshJackpot("safeGameJackpot");return true;
  }catch(e){toast(e.message);return false;}
  finally{busy=false;if(btn)btn.disabled=false;}
}

async function animateGrid(grid,c){
  const cells=[...document.querySelectorAll(".safe-slot-cell")],timers=[];
  cells.forEach((cell,i)=>{const col=i%c.cols;timers[i]=setInterval(()=>{cell.textContent=c.symbols[Math.floor(Math.random()*c.symbols.length)];decorateCell(cell,cell.textContent);},55+(col%4)*5);});
  await wait(720);
  for(let col=0;col<c.cols;col++){
    for(let r=0;r<c.rows;r++){const i=r*c.cols+col;clearInterval(timers[i]);if(cells[i]){cells[i].textContent=grid?.[r]?.[col]||"?";decorateCell(cells[i],cells[i].textContent);cells[i].classList.add("land");setTimeout(()=>cells[i]?.classList.remove("land"),220);}}
    slotSound("reel");await wait(85);
  }
  timers.forEach(clearInterval);
}

async function playBonus(bonus,c){
  const hud=$("safeBonusHud");hud?.classList.remove("hidden");
  if($("safeBonusTier"))$("safeBonusTier").textContent=bonus.payoutTier||bonus.purchaseTier||"";
  let sticky=new Set((bonus.initialSticky||[]).map(x=>`${x[0]}:${x[1]}`));
  const frames=bonus.frames||[];
  for(let i=0;i<frames.length;i++){
    const f=frames[i];clearWins(false);
    if($("safeBonusText"))$("safeBonusText").textContent=`SPIN ${i+1}/${frames.length} • ×${Number(f.bonusMultiplier||1).toFixed(2)}`;
    await renderBonusFrame(f.grid,c,sticky);
    sticky=new Set((f.sticky||[]).map(x=>`${x[0]}:${x[1]}`));markSticky(sticky,c,f.grid);
    markWins(f.lines||[],c);
    const lineMulti=Math.max(1,...(f.lines||[]).map(x=>Number(x.wildMultiplier||1)));
    setText(`BONUS +${chipsShort(f.payout||0)}${lineMulti>1?` • WILD ×${lineMulti}`:""}`,Number(f.payout||0)>0);
    if(hasMultiplierWild(f.grid))slotSound("multi");
    await wait(520);
  }
  if($("safeBonusText"))$("safeBonusText").textContent=`BONUS COMPLETE • ${chipsShort(bonus.payout||0)}`;
  await wait(650);hud?.classList.add("hidden");
}

async function renderBonusFrame(grid,c,sticky){
  const cells=[...document.querySelectorAll(".safe-slot-cell")],timers=[];
  cells.forEach((cell,i)=>{
    const r=Math.floor(i/c.cols),col=i%c.cols;
    if(sticky.has(`${r}:${col}`))return;
    timers[i]=setInterval(()=>{cell.textContent=c.symbols[Math.floor(Math.random()*c.symbols.length)];decorateCell(cell,cell.textContent);},70+(col%3)*8);
  });
  await wait(620);
  for(let col=0;col<c.cols;col++){
    for(let r=0;r<c.rows;r++){const i=r*c.cols+col;if(timers[i])clearInterval(timers[i]);if(cells[i]){cells[i].textContent=grid?.[r]?.[col]||"?";decorateCell(cells[i],cells[i].textContent);}}
    slotSound("reel");await wait(75);
  }
  timers.forEach(t=>t&&clearInterval(t));
}

function markSticky(set,c,gridData){document.querySelectorAll(".safe-slot-cell").forEach(x=>x.classList.remove("sticky-wild"));for(const k of set){const [r,col]=k.split(":").map(Number),el=document.querySelector(`[data-safe-cell="${r*c.cols+col}"]`);if(el){el.classList.add("sticky-wild");if(gridData?.[r]?.[col]){el.textContent=gridData[r][col];decorateCell(el,el.textContent);}}}}
function markWins(lines,c){for(const w of (lines||[]).slice(0,12)){(w.rows||[]).slice(0,w.count||c.cols).forEach((r,col)=>document.querySelector(`[data-safe-cell="${r*c.cols+col}"]`)?.classList.add("win"));}}
function clearWins(clearSticky=true){document.querySelectorAll(".safe-slot-cell").forEach(x=>{x.classList.remove("win","multi-x2","multi-x5","multi-x10");if(clearSticky)x.classList.remove("sticky-wild");});}
function decorateCell(el,symbol){if(!el)return;el.classList.remove("multi-x2","multi-x5","multi-x10");const s=String(symbol||"");if(s.includes("×10"))el.classList.add("multi-x10");else if(s.includes("×5"))el.classList.add("multi-x5");else if(s.includes("×2"))el.classList.add("multi-x2");}
function hasMultiplierWild(gridData){return Array.isArray(gridData)&&gridData.flat(Infinity).some(x=>/🃏×(2|5|10)/.test(String(x||"")));}

function openBonusBuy(id){
  stopAuto();const c=configs[id];if(!c?.buyable)return;
  let bet;try{bet=readBet(false);}catch(e){return toast(e.message);}
  closeFeatureModal();
  const overlay=document.createElement("div");overlay.id="safeFeatureModal";overlay.className="safe-feature-modal";
  overlay.innerHTML=`<div class="safe-feature-sheet"><button class="safe-feature-close" id="safeFeatureClose">×</button><small>FEATURE BUY • ${c.title}</small><h3>ВЫБЕРИ БОНУС</h3><p>${c.feature}: покупка сразу запускает бонус. Результат всё равно случайный.</p><div class="safe-buy-grid">${BUY_TIERS.map(t=>`<button class="safe-buy-card tier-${t.id}" data-buy-tier="${t.id}"><em>${t.badge}</em><b>${t.name}</b><span>${t.text}</span><strong>${chipsShort(bet*t.cost)}</strong><small>${t.cost}× СТАВКИ</small></button>`).join("")}</div></div>`;
  document.body.appendChild(overlay);$("safeFeatureClose").onclick=closeFeatureModal;overlay.onclick=e=>{if(e.target===overlay)closeFeatureModal();};
  overlay.querySelectorAll("[data-buy-tier]").forEach(b=>b.onclick=()=>buyBonus(id,b.dataset.buyTier,bet));
}

async function buyBonus(id,tier,bet){
  const def=BUY_TIERS.find(x=>x.id===tier);if(!def)return;
  const cost=bet*def.cost;if(cost>Number(state.player?.balance||0))return toast(`Для покупки нужно ${chipsShort(cost)} фишек`);
  const buttons=[...document.querySelectorAll("[data-buy-tier]")];buttons.forEach(b=>b.disabled=true);
  closeFeatureModal();busy=true;const spin=$("safeSpin");if(spin)spin.disabled=true;slotSound("bonus");
  try{
    setText(`ПОКУПКА ${def.name} • ${chipsShort(cost)}`,false);
    const d=await api("/api/casino/bonus-buy",{slotId:id,bet,tier,requestId:crypto.randomUUID()});
    if(d.result?.bonus){d.result.bonus.purchaseTier=def.name;await playBonus(d.result.bonus,configs[id]);}
    await finish(d,d.cost||cost);if(id==="grandjackpot")await refreshJackpot("safeGameJackpot");
  }catch(e){toast(e.message);}
  finally{busy=false;if(spin)spin.disabled=false;}
}

function openAutoMenu(id){
  if(busy)return;closeFeatureModal();
  const overlay=document.createElement("div");overlay.id="safeFeatureModal";overlay.className="safe-feature-modal";
  overlay.innerHTML=`<div class="safe-feature-sheet safe-auto-sheet"><button class="safe-feature-close" id="safeFeatureClose">×</button><small>AUTO PLAY</small><h3>АВТОПРОКРУТКИ</h3><p>Выбери количество вращений. Каждое вращение проигрывается с обычной скоростью; бонус полностью доигрывается перед следующим спином.</p><div class="safe-auto-grid">${[10,25,50,100].map(n=>`<button data-auto-count="${n}"><b>${n}</b><span>SPINS</span></button>`).join("")}</div></div>`;
  document.body.appendChild(overlay);$("safeFeatureClose").onclick=closeFeatureModal;overlay.onclick=e=>{if(e.target===overlay)closeFeatureModal();};
  overlay.querySelectorAll("[data-auto-count]").forEach(b=>b.onclick=()=>{const count=Number(b.dataset.autoCount);closeFeatureModal();startAuto(id,count);});
}

async function startAuto(id,count){
  if(autoRemaining||busy)return;autoRemaining=Math.max(1,Math.floor(count));autoStopRequested=false;setAutoUi(true);
  while(autoRemaining>0&&!autoStopRequested&&currentSlot===id&&document.body.contains($("safeSpin"))){
    updateAutoUi();
    const ok=id==="slots"?await spinClassic(true):await spinGrid(id,true);
    if(!ok)break;
    autoRemaining--;updateAutoUi();
    if(autoRemaining>0&&!autoStopRequested)await wait(550);
  }
  autoRemaining=0;autoStopRequested=false;setAutoUi(false);
}

function stopAuto(){if(autoRemaining)autoStopRequested=true;else{autoRemaining=0;autoStopRequested=false;}setAutoUi(!!autoRemaining);}
function setAutoUi(running){$("safeStopAuto")?.classList.toggle("hidden",!running);if($("safeAuto"))$("safeAuto").disabled=running;if($("safeBuyBonus"))$("safeBuyBonus").disabled=running;updateAutoUi();}
function updateAutoUi(){if($("safeAutoCount"))$("safeAutoCount").textContent=String(autoRemaining);}

async function finish(d,amount){
  const payout=Number(d.payout||0);
  if(d.result?.jackpotHit){setText(`💰 GRAND JACKPOT +${chipsShort(d.result.jackpotPayout||0)}`,true);confetti();sound("win");haptic("success");}
  else if(payout>amount){setText(`WIN ${chipsShort(payout)} • ×${Number(d.multiplier||0).toFixed(2)}`,true);confetti();sound("win");haptic("success");}
  else if(payout>0){setText(`RETURN ${chipsShort(payout)}`,false);sound("click");}
  else{setText("NO WIN",false);sound("lose");}
  await refreshBootstrap();
}
function setText(text,win){const el=$("safeSlotResult");if(!el)return;el.textContent=text;el.classList.toggle("win",!!win);el.classList.toggle("lose",!win);}
async function refreshJackpot(id){try{const d=await api("/api/casino/jackpot/status");if($(id))$(id).textContent=Number(d.pool||0).toLocaleString("ru-RU");}catch{}}
function closeFeatureModal(){$("safeFeatureModal")?.remove();}

let audioCtx=null;
function slotSound(type){
  try{
    audioCtx||=new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume();const now=audioCtx.currentTime;
    if(type==="spin"){for(let i=0;i<7;i++)tone(110+i*17,.04,now+i*.05,.018);return;}
    if(type==="multi"){tone(620,.1,now,.028);tone(860,.12,now+.06,.026);return;}
    if(type==="bonus"){[360,480,640,840].forEach((f,i)=>tone(f,.16,now+i*.1,.03));return;}
    tone(390,.05,now,.02);
  }catch{}
}
function tone(freq,duration,start,gain=.02){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.setValueAtTime(freq,start);g.gain.setValueAtTime(gain,start);g.gain.exponentialRampToValueAtTime(.001,start+duration);o.connect(g);g.connect(audioCtx.destination);o.start(start);o.stop(start+duration);}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
