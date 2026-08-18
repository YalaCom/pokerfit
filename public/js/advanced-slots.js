import {$,state,api,toast,chipsShort,refreshBootstrap,haptic,sound,confetti} from "./core.js";

const WILD="🃏",SCATTER="🌟";
const catalog={
  slots:{legacy:true,title:"CLASSIC SLOTS",icon:"🎰",size:"3 REELS",lines:"CLASSIC",volatility:"LOW",summary:"Быстрый классический автомат на три барабана.",bonus:"Три одинаковых символа дают основную выплату. 7️⃣ — самый дорогой символ.",symbols:"🍒 🍋 🔔 ⭐ 💎 7️⃣"},
  mega:{legacy:true,title:"MEGA REELS",icon:"🎰",size:"3×6",lines:"20 LINES",volatility:"HIGH",summary:"Большой линейный слот на 18 клеток.",bonus:"WILD 🃏 заменяет обычные символы. SCATTER 🌟 платит независимо от линий.",symbols:"🍒 🍋 🔔 ⭐ 💎 7️⃣ 🃏 🌟"},
  royal5:{title:"ROYAL FRUITS",icon:"🍒",size:"3×5",rows:3,cols:5,lines:20,volatility:"MEDIUM",summary:"Классический фруктовый слот с современной sticky-бонуской.",bonusTitle:"STICKY PARTY",bonus:"3+ SCATTER 🌟 запускают 7 фриспинов. Каждый выпавший WILD 🃏 остаётся до конца бонуса. Каждый новый WILD добавляет +1 фриспин, максимум 12.",symbols:["🍒","🍋","🍇","🔔","💎","7️⃣",WILD,SCATTER],accent:"ruby"},
  neon8:{title:"NEON EMPIRE",icon:"⚡",size:"4×8",rows:4,cols:8,lines:40,volatility:"HIGH",summary:"Широкий 32-клеточный слот с длинными линиями и растущим множителем.",bonusTitle:"WILD REACTOR",bonus:"4+ SCATTER 🌟 запускают 6 фриспинов. WILD 🃏 фиксируются. Каждый новый WILD повышает общий бонусный множитель на +0.25× вплоть до 5×.",symbols:["⚡","💿","💎","👑","🔥","8️⃣",WILD,SCATTER],accent:"neon"},
  vault5:{title:"GOLDEN VAULT",icon:"👑",size:"5×5",rows:5,cols:5,lines:25,volatility:"VERY HIGH",summary:"Высоковолатильный золотой слот с большим потенциалом бонуса.",bonusTitle:"VAULT LOCK",bonus:"3+ SCATTER 🌟 запускают 7 фриспинов. WILD 🃏 остаются. Каждый 4-й закреплённый WILD открывает GOLD LOCK: ещё одна клетка становится WILD и добавляется +1 фриспин.",symbols:["🪙","🏺","🐍","🦂","💎","👑",WILD,SCATTER],accent:"gold"}
};

let installed=false,bypass=null,busy=false;

export function initAdvancedSlots(){
  if(!installed){document.addEventListener("click",captureSlotClick,true);installed=true;}
  installTiles();
  const observer=new MutationObserver(installTiles);observer.observe(document.body,{childList:true,subtree:true});
}

function installTiles(){
  const grid=document.querySelector("#casinoLobby .casino-grid");if(!grid)return;
  const entries=[
    ["royal5","🍒 ROYAL FRUITS","3×5 • 20 линий • Sticky Wild","HOT"],
    ["neon8","⚡ NEON EMPIRE","4×8 • 40 линий • Wild Reactor","WIDE"],
    ["vault5","👑 GOLDEN VAULT","5×5 • 25 линий • Vault Lock","BONUS"]
  ];
  for(const [id,title,desc,badge] of entries){
    if(grid.querySelector(`[data-casino-game="${id}"]`))continue;
    const tile=document.createElement("button");tile.dataset.casinoGame=id;tile.dataset.category="slots";tile.className=`advanced-slot-tile adv-${id}`;
    tile.innerHTML=`<b>${title}</b><small>${desc}</small><em>${badge}</em><span class="slot-preview-mini">${catalog[id].symbols.slice(0,5).join(" ")}</span>`;
    const mega=grid.querySelector('[data-casino-game="mega"]');
    if(mega)mega.insertAdjacentElement("afterend",tile);else grid.prepend(tile);
  }
}

function captureSlotClick(event){
  const tile=event.target.closest?.("#casinoLobby [data-casino-game]");if(!tile)return;
  const game=tile.dataset.casinoGame;if(!catalog[game])return;
  if(bypass===game){bypass=null;return;}
  event.preventDefault();event.stopImmediatePropagation();showSlotInfo(game,tile);
}

function showSlotInfo(game,tile){
  const info=catalog[game],lobby=$("casinoLobby"),panel=$("casinoGamePanel"),body=$("casinoGameBody"),title=$("casinoGameTitle");if(!info||!lobby||!panel||!body)return;
  lobby.classList.add("hidden");panel.classList.remove("hidden");title.textContent=`${info.icon} ${info.title}`;
  const lines=typeof info.lines==="number"?`${info.lines} PAYLINES`:info.lines;
  body.innerHTML=`
    <article class="slot-info-card slot-info-${info.accent||"classic"}">
      <div class="slot-info-art"><span>${info.icon}</span><i>${info.size}</i></div>
      <div class="slot-info-kicker">FIT CASINO • SLOT INFO</div>
      <h3>${info.title}</h3><p>${info.summary}</p>
      <div class="slot-info-stats"><div><small>ПОЛЕ</small><b>${info.size}</b></div><div><small>ЛИНИИ</small><b>${lines}</b></div><div><small>РИСК</small><b>${info.volatility}</b></div></div>
      <div class="slot-info-symbols">${Array.isArray(info.symbols)?info.symbols.join(" "):info.symbols}</div>
      <div class="slot-bonus-info"><small>${info.bonusTitle||"КАК ИГРАТЬ"}</small><b>${info.bonus}</b></div>
      ${!info.legacy?`<div class="slot-rule-row"><span><i>${WILD}</i><b>WILD</b><small>заменяет символы и остаётся липким в бонусе</small></span><span><i>${SCATTER}</i><b>SCATTER</b><small>запускает бонус независимо от линии</small></span></div>`:""}
      <button id="slotInfoPlay" class="casino-main-btn slot-info-play">ИГРАТЬ ${info.icon}</button>
    </article>`;
  $("slotInfoPlay").onclick=()=>{
    if(info.legacy){bypass=game;tile.click();return;}
    renderAdvancedSlot(game);
  };
}

function renderAdvancedSlot(id){
  const cfg=catalog[id],body=$("casinoGameBody"),title=$("casinoGameTitle");if(!cfg||!body)return;
  title.textContent=`${cfg.icon} ${cfg.title}`;
  const cells=Array.from({length:cfg.rows*cfg.cols},(_,i)=>`<div class="adv-slot-cell" data-adv-cell="${i}">${cfg.symbols[i%Math.min(6,cfg.symbols.length)]}</div>`).join("");
  body.innerHTML=`
    <div class="adv-slot-cabinet adv-theme-${cfg.accent}">
      <div class="adv-slot-top"><span>${cfg.lines} LINES</span><b>${cfg.title}</b><span>${cfg.size}</span></div>
      <div class="adv-slot-screen" style="--rows:${cfg.rows};--cols:${cfg.cols}">
        <div id="advSlotGrid" class="adv-slot-grid">${cells}</div>
        <svg id="advPaylineSvg" class="adv-payline-svg" viewBox="0 0 ${cfg.cols*100} ${cfg.rows*100}" preserveAspectRatio="none"></svg>
        <div id="advBonusHud" class="adv-bonus-hud hidden"><small>${cfg.bonusTitle}</small><b id="advFreeSpins">FREE SPINS</b><em id="advBonusMultiplier">1.00×</em></div>
      </div>
      <div class="adv-slot-footer"><span>${WILD} STICKY WILD</span><span>${SCATTER} BONUS</span><span>${cfg.volatility}</span></div>
      <div id="casinoResult" class="casino-result">Собирай одинаковые символы слева направо по активным линиям</div>
    </div>
    ${betBox()}
    <button id="advSpinButton" class="casino-main-btn adv-spin-button">SPIN ${cfg.icon}</button>`;
  bindBet();$("advSpinButton").onclick=()=>spinAdvanced(id);
}

function betBox(){return `<div class="casino-bet"><label>СТАВКА</label><input id="casinoBet" type="number" min="1000" max="5000000" step="1000" value="20000" inputmode="numeric"><div class="casino-presets"><button data-cbet="10000">10K</button><button data-cbet="50000">50K</button><button data-cbet="100000">100K</button><button data-cbet="500000">500K</button></div></div>`;}
function bindBet(){document.querySelectorAll("[data-cbet]").forEach(b=>b.onclick=()=>{$("casinoBet").value=b.dataset.cbet;});}
function readBet(){const n=Math.floor(Number($("casinoBet")?.value||0));if(n<1000)throw new Error("Минимальная ставка 1K");if(n>5_000_000)throw new Error("Максимальная ставка 5M");if(n>Number(state.player?.balance||0))throw new Error("Недостаточно фишек");return n;}

async function spinAdvanced(id){
  if(busy)return;const cfg=catalog[id];let amount;try{amount=readBet();}catch(e){return toast(e.message)}
  const btn=$("advSpinButton");busy=true;btn.disabled=true;clearWins();haptic("medium");sound("click");
  try{
    const d=await api("/api/casino/advanced-slot/spin",{slotId:id,bet:amount,requestId:crypto.randomUUID()});
    await animateGrid(d.result.grid,cfg,new Set(),650);drawWins(d.result.base?.lines||[],cfg);
    setResult(d.result.base?.payout||0,`ОСНОВНАЯ ИГРА • ${d.result.base?.lines?.length||0} линий`);
    if(d.result.bonusTriggered&&d.result.bonus){await wait(450);await playBonus(d.result.bonus,cfg);}
    const finalText=d.payout?`TOTAL WIN ${chipsShort(d.payout)} • ×${Number(d.multiplier).toFixed(2)}`:"НЕТ ВЫИГРЫША";
    setResult(d.payout,finalText);if(d.payout>amount){confetti();sound("win");haptic("success");}else sound("lose");
    await refreshBootstrap();
  }catch(e){toast(e.message)}finally{busy=false;btn.disabled=false;}
}

async function playBonus(bonus,cfg){
  const hud=$("advBonusHud");hud.classList.remove("hidden");hud.classList.add("bonus-pop");
  $("casinoResult").textContent=`🌟 ${bonus.name} АКТИВИРОВАН • ${bonus.totalSpins} FREE SPINS`;
  haptic("success");sound("win");await wait(850);
  let locked=new Set((bonus.initialSticky||[]).map(([r,c])=>`${r}:${c}`));
  markSticky(locked,cfg);
  for(let i=0;i<bonus.frames.length;i++){
    const frame=bonus.frames[i];$("advFreeSpins").textContent=`SPIN ${i+1}/${bonus.frames.length}`;$("advBonusMultiplier").textContent=`${Number(frame.bonusMultiplier||1).toFixed(2)}×`;
    clearWins(false);await animateGrid(frame.grid,cfg,locked,420);
    const next=new Set((frame.sticky||[]).map(([r,c])=>`${r}:${c}`));markSticky(next,cfg,frame.newSticky||[],frame.lockAdded);
    drawWins(frame.lines||[],cfg);locked=next;
    let msg=`FREE SPIN ${i+1} • +${chipsShort(frame.payout||0)}`;
    if((frame.newSticky||[]).length)msg+=` • ${frame.newSticky.length} NEW WILD`;
    if(frame.addedSpins)msg+=` • +${frame.addedSpins} SPIN`;
    if(frame.lockAdded)msg+=` • GOLD LOCK`;
    setResult(frame.payout,msg);await wait(430);
  }
  $("advFreeSpins").textContent="BONUS COMPLETE";$("advBonusMultiplier").textContent=`${Number(bonus.finalMultiplier||1).toFixed(2)}×`;await wait(500);hud.classList.add("hidden");
}

async function animateGrid(grid,cfg,locked,duration){
  const cells=[...document.querySelectorAll(".adv-slot-cell")],symbols=cfg.symbols.filter(x=>x!==SCATTER);const timers=[];
  cells.forEach((cell,i)=>{const r=Math.floor(i/cfg.cols),c=i%cfg.cols;if(locked.has(`${r}:${c}`))return;cell.classList.add("spinning");timers[i]=setInterval(()=>cell.textContent=symbols[Math.floor(Math.random()*symbols.length)],45+(c%4)*5);});
  await wait(duration);
  for(let c=0;c<cfg.cols;c++){
    for(let r=0;r<cfg.rows;r++){const i=r*cfg.cols+c;if(timers[i]){clearInterval(timers[i]);cells[i].textContent=grid[r][c];cells[i].classList.remove("spinning");cells[i].classList.add("land");setTimeout(()=>cells[i].classList.remove("land"),220);}}
    haptic("light");await wait(Math.max(28,90-cfg.cols*5));
  }
  timers.forEach(t=>t&&clearInterval(t));
}

function markSticky(sticky,cfg,newSticky=[],lockAdded=null){
  document.querySelectorAll(".adv-slot-cell").forEach(c=>c.classList.remove("sticky-wild","new-sticky","gold-lock"));
  for(const k of sticky){const [r,c]=k.split(":").map(Number),el=document.querySelector(`[data-adv-cell="${r*cfg.cols+c}"]`);el?.classList.add("sticky-wild");}
  for(const [r,c] of newSticky){const el=document.querySelector(`[data-adv-cell="${r*cfg.cols+c}"]`);el?.classList.add("new-sticky");}
  if(lockAdded){const [r,c]=lockAdded;document.querySelector(`[data-adv-cell="${r*cfg.cols+c}"]`)?.classList.add("gold-lock");}
}

function drawWins(lines,cfg){
  const svg=$("advPaylineSvg");if(!svg)return;svg.innerHTML="";
  for(const win of lines.slice(0,10)){
    const pts=win.rows.slice(0,win.count).map((row,col)=>`${50+col*100},${50+row*100}`).join(" ");
    svg.insertAdjacentHTML("beforeend",`<polyline points="${pts}" class="adv-winning-line"></polyline>`);
    win.rows.slice(0,win.count).forEach((row,col)=>document.querySelector(`[data-adv-cell="${row*cfg.cols+col}"]`)?.classList.add("line-win"));
  }
}
function clearWins(clearSticky=true){$("advPaylineSvg")&&($("advPaylineSvg").innerHTML="");document.querySelectorAll(".adv-slot-cell").forEach(c=>{c.classList.remove("line-win","new-sticky","gold-lock");if(clearSticky)c.classList.remove("sticky-wild");});}
function setResult(payout,text){const el=$("casinoResult");if(!el)return;el.textContent=text;el.className=`casino-result ${payout>0?"win":"lose"}`;}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
