import {$,state,api,toast,chipsShort,refreshBootstrap,haptic,sound,confetti} from "./core.js";

const WILD="🃏",SCATTER="🌟";
const SLOTS={
  slots:{title:"CLASSIC SLOTS",icon:"🎰",rows:1,cols:3,lines:"CLASSIC",risk:"LOW",kind:"classic",summary:"Классический автомат на три барабана.",bonus:"Три одинаковых символа дают основную выплату.",symbols:["🍒","🍋","🔔","⭐","💎","7️⃣"]},
  mega:{title:"MEGA REELS",icon:"🎰",rows:3,cols:6,lines:20,risk:"HIGH",kind:"mega",summary:"Большой слот 3×6 с 20 линиями.",bonus:"WILD заменяет символы, SCATTER платит независимо от линий.",symbols:["🍒","🍋","🔔","⭐","💎","7️⃣",WILD,SCATTER]},
  royal5:{title:"ROYAL FRUITS",icon:"🍒",rows:3,cols:5,lines:20,risk:"MEDIUM",kind:"advanced",summary:"Фруктовый слот 3×5 со sticky WILD.",bonus:"STICKY PARTY: 3+ SCATTER запускают фриспины, WILD остаются на поле.",symbols:["🍒","🍋","🍇","🔔","💎","7️⃣",WILD,SCATTER]},
  neon8:{title:"NEON EMPIRE",icon:"⚡",rows:4,cols:8,lines:40,risk:"HIGH",kind:"advanced",summary:"Широкий слот 4×8 на 40 линий.",bonus:"WILD REACTOR: WILD фиксируются, бонусный множитель растёт.",symbols:["⚡","💿","💎","👑","🔥","8️⃣",WILD,SCATTER]},
  vault5:{title:"GOLDEN VAULT",icon:"👑",rows:5,cols:5,lines:25,risk:"VERY HIGH",kind:"advanced",summary:"Золотой слот 5×5 с высокой волатильностью.",bonus:"VAULT LOCK: WILD остаются, новые WILD могут открыть дополнительные клетки.",symbols:["🪙","🏺","🐍","🦂","💎","👑",WILD,SCATTER]},
  moon5:{title:"MOONLIGHT RICHES",icon:"🌙",rows:3,cols:5,lines:25,risk:"MEDIUM",kind:"more",summary:"Ночной слот 3×5 с растущим бонусным множителем.",bonus:"MOON ASCENSION: sticky WILD и фриспины.",symbols:["🌙","🔮","💎","🦉","👑","🌌",WILD,SCATTER]},
  dragon6:{title:"DRAGON FIRE",icon:"🐉",rows:4,cols:6,lines:30,risk:"HIGH",kind:"more",summary:"Огненный слот 4×6 с липкими WILD.",bonus:"DRAGON RESPINS: новый WILD остаётся и продлевает бонус.",symbols:["🔥","🪙","🏮","🐉","💎","👑",WILD,SCATTER]},
  grandjackpot:{title:"GRAND FORTUNE",icon:"💰",rows:3,cols:5,lines:20,risk:"JACKPOT",kind:"jackpot",summary:"Отдельный слот с общим GRAND JACKPOT.",bonus:"FORTUNE VAULT: sticky WILD, фриспины и усиление бонуса. Jackpot выпадает крайне редко.",symbols:["🍒","🔔","💎","👑","7️⃣",WILD,SCATTER,"💰"]}
};

let busy=false,gridObserver=null,jackpotTimer=null;

export function initSlotHotfix(){
  injectStyle();
  installTiles();
  bindSlotTiles();
  installCasinoExchange();
  const grid=document.querySelector("#casinoLobby .casino-grid");
  if(grid){
    gridObserver?.disconnect();
    gridObserver=new MutationObserver(()=>{bindSlotTiles();setTimeout(forceSlotCategories,0);});
    gridObserver.observe(grid,{childList:true});
  }
  setTimeout(forceSlotCategories,0);
  refreshJackpot();
  jackpotTimer=setInterval(refreshJackpot,5000);
}

function installTiles(){
  const grid=document.querySelector("#casinoLobby .casino-grid");if(!grid)return;
  const defs=[
    ["royal5","🍒 ROYAL FRUITS","3×5 • 20 линий • Sticky Wild","HOT"],
    ["neon8","⚡ NEON EMPIRE","4×8 • 40 линий • Wild Reactor","WIDE"],
    ["vault5","👑 GOLDEN VAULT","5×5 • 25 линий • Vault Lock","BONUS"],
    ["moon5","🌙 MOONLIGHT RICHES","3×5 • 25 линий • Moon Ascension","NEW"],
    ["dragon6","🐉 DRAGON FIRE","4×6 • 30 линий • Sticky Respins","HOT"],
    ["grandjackpot","💰 GRAND FORTUNE","3×5 • Fortune Vault • общий Jackpot","JACKPOT"]
  ];
  for(const [id,title,desc,badge] of defs){
    if(grid.querySelector(`[data-casino-game="${id}"]`))continue;
    const b=document.createElement("button");b.dataset.casinoGame=id;b.dataset.category="slots";b.className=`hotfix-slot-tile hotfix-${id}`;
    b.innerHTML=`<b>${title}</b><small>${desc}</small><em>${badge}</em><span class="hotfix-symbols">${SLOTS[id].symbols.slice(0,6).join(" ")}</span>`;
    grid.appendChild(b);
  }
}

function bindSlotTiles(){
  document.querySelectorAll("#casinoLobby [data-casino-game]").forEach(tile=>{
    const id=tile.dataset.casinoGame;if(!SLOTS[id]||tile.dataset.slotHotfixBound)return;
    tile.dataset.slotHotfixBound="1";
    tile.addEventListener("click",e=>{
      e.preventDefault();e.stopImmediatePropagation();
      showInfo(id);
    },true);
  });
}

function forceSlotCategories(){
  document.querySelectorAll("#casinoLobby [data-casino-game]").forEach(tile=>{if(SLOTS[tile.dataset.casinoGame])tile.dataset.category="slots";});
}

function showInfo(id){
  const c=SLOTS[id],lobby=$("casinoLobby"),panel=$("casinoGamePanel"),body=$("casinoGameBody"),title=$("casinoGameTitle");
  if(!c||!lobby||!panel||!body)return toast("Не удалось открыть слот");
  lobby.classList.add("hidden");panel.classList.remove("hidden");if(title)title.textContent=`${c.icon} ${c.title}`;
  body.innerHTML=`<article class="hotfix-slot-info"><div class="hotfix-info-art">${c.icon}</div><small>FIT CASINO • SLOT INFO</small><h3>${c.title}</h3><p>${c.summary}</p><div class="hotfix-stats"><div><small>ПОЛЕ</small><b>${c.rows}×${c.cols}</b></div><div><small>ЛИНИИ</small><b>${c.lines}</b></div><div><small>РИСК</small><b>${c.risk}</b></div></div><div class="hotfix-symbol-row">${c.symbols.join(" ")}</div><div class="hotfix-bonus"><small>БОНУС</small><b>${c.bonus}</b></div>${id==="grandjackpot"?'<div class="hotfix-jackpot"><small>GRAND JACKPOT</small><strong id="hotfixInfoJackpot">—</strong></div>':""}<button id="hotfixPlay" class="casino-main-btn">ИГРАТЬ ${c.icon}</button></article>`;
  $("hotfixPlay").onclick=()=>renderSlot(id);
  if(id==="grandjackpot")refreshJackpot();
}

function renderSlot(id){
  const c=SLOTS[id],body=$("casinoGameBody"),title=$("casinoGameTitle");if(!c||!body)return;
  if(title)title.textContent=`${c.icon} ${c.title}`;
  const total=c.rows*c.cols;
  const cells=Array.from({length:total},(_,i)=>`<div class="hotfix-cell" data-hotfix-cell="${i}">${c.symbols[i%c.symbols.length]}</div>`).join("");
  body.innerHTML=`<div class="hotfix-machine"><div class="hotfix-machine-head"><span>${c.lines} LINES</span><b>${c.title}</b><span>${c.rows}×${c.cols}</span></div>${id==="grandjackpot"?'<div class="hotfix-jackpot"><small>GRAND JACKPOT</small><strong id="hotfixGameJackpot">—</strong></div>':""}<div class="hotfix-screen"><div class="hotfix-grid" style="--rows:${c.rows};--cols:${c.cols}">${cells}</div><div id="hotfixBonusHud" class="hotfix-bonus-hud hidden">BONUS</div></div><div id="hotfixResult" class="casino-result">Собирай выигрышные линии слева направо</div></div><div class="hotfix-dock"><div class="hotfix-bet"><label>СТАВКА</label><input id="hotfixBet" type="number" min="1000" max="5000000" step="1000" value="10000" inputmode="numeric"><div class="hotfix-presets"><button data-hotfix-bet="10000">10K</button><button data-hotfix-bet="50000">50K</button><button data-hotfix-bet="100000">100K</button><button data-hotfix-bet="500000">500K</button></div><small>MAX WIN <b id="hotfixMaxWin">10M</b>${id==="grandjackpot"?" + JACKPOT":""}</small></div><button id="hotfixSpin" class="casino-main-btn">SPIN ${c.icon}</button></div>`;
  document.querySelectorAll("[data-hotfix-bet]").forEach(b=>b.onclick=()=>{$("hotfixBet").value=b.dataset.hotfixBet;updateMaxWin();});
  $("hotfixBet").oninput=updateMaxWin;$("hotfixSpin").onclick=()=>spin(id);updateMaxWin();if(id==="grandjackpot")refreshJackpot();
}

function readBet(){const n=Math.floor(Number($("hotfixBet")?.value||0));if(n<1000)throw new Error("Минимальная ставка 1K");if(n>5_000_000)throw new Error("Максимальная ставка 5M");if(n>Number(state.player?.balance||0))throw new Error("Недостаточно фишек");return n;}
function updateMaxWin(){const n=Math.max(0,Math.floor(Number($("hotfixBet")?.value||0)));if($("hotfixMaxWin"))$("hotfixMaxWin").textContent=chipsShort(n*1000);}

async function spin(id){
  if(busy)return;let amount;try{amount=readBet();}catch(e){return toast(e.message)}
  const c=SLOTS[id],btn=$("hotfixSpin"),cells=[...document.querySelectorAll(".hotfix-cell")];if(!c||!btn||!cells.length)return;
  busy=true;btn.disabled=true;clearCells();haptic("medium");sound("click");
  const timers=cells.map((el,i)=>setInterval(()=>{el.textContent=c.symbols[Math.floor(Math.random()*c.symbols.length)];},55+(i%c.cols)*3));
  try{
    const {path,payload}=requestFor(id,amount);
    const d=await api(path,payload);await wait(520);timers.forEach(clearInterval);
    const grid=normalizeGrid(id,d,c);renderGrid(grid,c);markWins(extractLines(id,d),c);
    if(d.result?.bonusTriggered&&d.result?.bonus?.frames?.length){await wait(260);await playBonus(d.result.bonus,c);}
    const payout=Number(d.payout||0);
    if(id==="grandjackpot"&&d.result?.jackpotHit&&Number(d.result?.jackpotPayout||0)>0){setResult(`💰 GRAND JACKPOT +${chipsShort(d.result.jackpotPayout)}`,true);sound("win");confetti();haptic("success");}
    else if(payout>amount){setResult(`WIN ${chipsShort(payout)} • ×${Number(d.multiplier||0).toFixed(2)}`,true);sound("win");confetti();haptic("success");}
    else if(payout>0){setResult(`RETURN ${chipsShort(payout)}`,false);sound("click");}
    else{setResult("NO WIN",false);sound("lose");}
    await refreshBootstrap();if(id==="grandjackpot")await refreshJackpot();
  }catch(e){timers.forEach(clearInterval);toast(e.message||"Ошибка слота");sound("lose");}
  finally{busy=false;btn.disabled=false;}
}

function requestFor(id,bet){
  const requestId=crypto.randomUUID();
  if(id==="slots")return {path:"/api/casino/slots",payload:{bet,requestId}};
  if(id==="mega")return {path:"/api/casino/mega-slots",payload:{bet,requestId}};
  if(["royal5","neon8","vault5"].includes(id))return {path:"/api/casino/advanced-slot/spin",payload:{slotId:id,bet,requestId}};
  if(["moon5","dragon6"].includes(id))return {path:"/api/casino/more-slot/spin",payload:{slotId:id,bet,requestId}};
  return {path:"/api/casino/jackpot/spin",payload:{bet,requestId}};
}

function normalizeGrid(id,d,c){
  if(id==="slots")return [Array.isArray(d.result?.reels)?d.result.reels:Array(c.cols).fill("?")];
  const grid=d.result?.grid;if(Array.isArray(grid))return grid;
  return Array.from({length:c.rows},()=>Array(c.cols).fill("?"));
}
function extractLines(id,d){if(id==="mega")return d.result?.lines||[];return d.result?.base?.lines||[];}
function renderGrid(grid,c,locked=new Set()){const cells=[...document.querySelectorAll(".hotfix-cell")];for(let r=0;r<c.rows;r++)for(let col=0;col<c.cols;col++){const i=r*c.cols+col,el=cells[i];if(!el)continue;el.textContent=grid?.[r]?.[col]||"?";el.classList.toggle("sticky",locked.has(`${r}:${col}`));el.classList.add("land");setTimeout(()=>el.classList.remove("land"),180);}}
function markWins(lines,c){for(const line of (lines||[]).slice(0,10)){const rows=line.rows||[];const count=Math.min(Number(line.count||rows.length),rows.length);for(let col=0;col<count;col++){const r=rows[col],i=r*c.cols+col;document.querySelector(`[data-hotfix-cell="${i}"]`)?.classList.add("win");}}}
function clearCells(){document.querySelectorAll(".hotfix-cell").forEach(el=>el.classList.remove("win","sticky","land"));}
function setResult(text,win){const el=$("hotfixResult");if(!el)return;el.textContent=text;el.classList.toggle("win",!!win);el.classList.toggle("lose",!win);}

async function playBonus(bonus,c){
  const hud=$("hotfixBonusHud");hud?.classList.remove("hidden");let locked=new Set((bonus.initialSticky||[]).map(x=>x.join(":")));
  for(let i=0;i<bonus.frames.length;i++){
    const f=bonus.frames[i];if(hud)hud.textContent=`${bonus.name||"BONUS"} • ${i+1}/${bonus.frames.length} • ×${Number(f.bonusMultiplier||1).toFixed(2)}`;
    renderGrid(f.grid,c,locked);locked=new Set((f.sticky||[]).map(x=>x.join(":")));renderGrid(f.grid,c,locked);markWins(f.lines||[],c);setResult(`BONUS +${chipsShort(f.payout||0)}`,Number(f.payout||0)>0);await wait(220);
  }
  hud?.classList.add("hidden");
}

function installCasinoExchange(){
  const lobby=$("casinoLobby"),hero=lobby?.querySelector(".casino-hero");if(!lobby||!hero||$("hotfixCasinoExchange"))return;
  const bar=document.createElement("div");bar.id="hotfixCasinoExchange";bar.className="hotfix-exchange";bar.innerHTML='<button id="hotfixTopup"><small>ПОПОЛНИТЬ</small><b>500K</b><span>ЗА 1 ₽</span></button><button id="hotfixWithdraw"><small>ВЫВЕСТИ</small><b>1M</b><span>ЗА 1 ₽</span></button><button id="hotfixJackpotOpen"><small>GRAND JACKPOT</small><b id="hotfixLobbyJackpot">—</b><span>ИГРАТЬ →</span></button>';
  hero.insertAdjacentElement("afterend",bar);
  $("hotfixTopup").onclick=()=>exchange("topup");$("hotfixWithdraw").onclick=()=>exchange("withdraw");$("hotfixJackpotOpen").onclick=()=>showInfo("grandjackpot");
}
async function exchange(kind){const b=$(kind==="topup"?"hotfixTopup":"hotfixWithdraw");if(!b)return;b.disabled=true;try{const d=await api(kind==="topup"?"/api/friend-exchange/topup":"/api/friend-exchange/withdraw");toast(d.alreadyPending?"Заявка уже ждёт подтверждения":kind==="topup"?"Пополнение 500K за 1 ₽ отправлено":"1M списан, заявка на вывод отправлена");await refreshBootstrap();}catch(e){toast(e.message)}finally{b.disabled=false;}}

async function refreshJackpot(){try{const d=await api("/api/casino/jackpot/status"),v=Number(d.pool||0),text=v.toLocaleString("ru-RU");["hotfixLobbyJackpot","hotfixInfoJackpot","hotfixGameJackpot","requiredHomeJackpotValue"].forEach(id=>{if($(id))$(id).textContent=text;});}catch{}}

function injectStyle(){if($("slotHotfixStyle"))return;const s=document.createElement("style");s.id="slotHotfixStyle";s.textContent=`
.hotfix-slot-tile{position:relative;min-height:132px;border-radius:22px!important;overflow:hidden;background:radial-gradient(circle at 90% 0,rgba(234,194,83,.18),transparent 45%),linear-gradient(145deg,#17120b,#080807)!important}.hotfix-grandjackpot{grid-column:1/-1!important;background:radial-gradient(circle at 85% 0,rgba(255,202,64,.28),transparent 45%),linear-gradient(145deg,#3a2408,#0b0805)!important}.hotfix-symbols{display:block;margin-top:13px;font-size:19px;letter-spacing:2px}.hotfix-slot-info{padding:22px;border:1px solid rgba(226,194,105,.22);border-radius:25px;background:radial-gradient(circle at 80% 0,rgba(216,184,95,.15),transparent 40%),linear-gradient(145deg,#15120d,#080807)}.hotfix-info-art{font-size:54px;text-align:center}.hotfix-slot-info>small{display:block;text-align:center;letter-spacing:2px;color:#9f9477;font-size:7px}.hotfix-slot-info h3{text-align:center;font-size:24px;margin:9px 0}.hotfix-slot-info p{color:#a8a49a;font-size:11px;line-height:1.55}.hotfix-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:14px 0}.hotfix-stats div,.hotfix-bonus,.hotfix-jackpot{padding:12px;border-radius:14px;border:1px solid rgba(255,255,255,.07);background:#090907}.hotfix-stats small,.hotfix-bonus small,.hotfix-jackpot small{display:block;color:#8e8879;font-size:7px}.hotfix-stats b,.hotfix-bonus b{display:block;margin-top:4px;font-size:10px;color:#eee4c7}.hotfix-symbol-row{text-align:center;font-size:24px;letter-spacing:4px;margin:14px 0}.hotfix-jackpot strong{display:block;color:#ffe18a;font-size:23px;margin-top:5px}.hotfix-machine{padding:9px;border-radius:25px;border:1px solid rgba(225,190,92,.2);background:linear-gradient(155deg,#18130b,#060606);box-shadow:0 20px 55px rgba(0,0,0,.4)}.hotfix-machine-head{height:43px;display:flex;align-items:center;justify-content:space-between;color:#a49670;font-size:7px}.hotfix-machine-head b{color:#f4df9f;font-size:11px}.hotfix-screen{position:relative;padding:6px;border-radius:17px;background:#030303;overflow:hidden}.hotfix-grid{display:grid;grid-template-columns:repeat(var(--cols),1fr);grid-template-rows:repeat(var(--rows),minmax(43px,64px));gap:3px}.hotfix-cell{display:grid;place-items:center;border-radius:8px;background:linear-gradient(180deg,#f7f2e7,#d4c9b3);border:2px solid #292218;font-size:clamp(18px,6.5vw,30px);box-shadow:inset 0 0 9px rgba(0,0,0,.12)}.hotfix-cell.land{animation:hotfixLand .18s ease-out}.hotfix-cell.win{box-shadow:0 0 0 2px #ffe476,0 0 20px rgba(255,213,76,.75);z-index:2}.hotfix-cell.sticky{background:radial-gradient(circle,#fff3ae,#d3a52c)}.hotfix-bonus-hud{position:absolute;top:9px;left:50%;transform:translateX(-50%);z-index:10;background:rgba(10,7,3,.9);border:1px solid #dfbd59;border-radius:999px;padding:7px 12px;color:#ffe28a;font-size:9px;font-weight:900}.hotfix-dock{position:sticky;bottom:calc(env(safe-area-inset-bottom) + 78px);z-index:90;display:grid;grid-template-columns:1.2fr .8fr;gap:7px;margin-top:10px;padding:8px;border-radius:19px;border:1px solid rgba(226,194,105,.22);background:rgba(7,7,6,.94);backdrop-filter:blur(16px)}.hotfix-bet{min-width:0}.hotfix-bet label{display:block;color:#918b7c;font-size:7px}.hotfix-bet input{width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:#0b0b09;color:#fff}.hotfix-presets{display:flex;gap:3px;margin-top:4px}.hotfix-presets button{flex:1;padding:5px 2px;border-radius:8px;border:1px solid rgba(255,255,255,.07);background:#11100d;color:#bcb59f;font-size:7px}.hotfix-bet>small{display:block;margin-top:4px;color:#8f897a;font-size:7px}.hotfix-bet>small b{color:#f2d674}.hotfix-dock>.casino-main-btn{margin:0;min-height:62px}.hotfix-exchange{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:10px 0}.hotfix-exchange button{padding:11px;border-radius:15px;border:1px solid rgba(218,188,99,.18);background:#0d0c09;color:#fff;text-align:left}.hotfix-exchange button small,.hotfix-exchange button span{display:block;font-size:7px}.hotfix-exchange button b{display:block;font-size:17px;margin:3px 0;color:#f0d475}.hotfix-exchange button:last-child{grid-column:1/-1}.hotfix-exchange button:disabled{opacity:.5}@keyframes hotfixLand{from{transform:translateY(-10px) scale(.95)}to{transform:none}}`;
  document.head.appendChild(s);
}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
