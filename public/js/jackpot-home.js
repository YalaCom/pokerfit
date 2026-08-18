import {$,api,nav,chipsShort} from "./core.js";

let timer=null,lastPool=null;

export function initJackpotHome(){
  installCard();
  refreshJackpot();
  if(!timer)timer=setInterval(refreshJackpot,5000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshJackpot();});
}

function installCard(){
  const home=$("view-home");if(!home||$("homeGrandJackpot"))return;
  const anchor=home.querySelector(".club-promo")||home.querySelector(".live-strip")||home.firstElementChild;
  const card=document.createElement("button");
  card.id="homeGrandJackpot";card.className="home-grand-jackpot";
  card.innerHTML=`
    <span class="home-jp-glow"></span>
    <div class="home-jp-top"><small>FIT CASINO • GRAND JACKPOT</small><em>УЛЬТРАРЕДКИЙ</em></div>
    <div class="home-jp-value"><i>💰</i><strong id="homeJackpotValue">0</strong></div>
    <p>Банк растёт только на чистые проигрыши игроков. Выигрыши его не уменьшают.</p>
    <div class="home-jp-bottom"><span>GRAND FORTUNE</span><b>ИГРАТЬ →</b></div>`;
  anchor?.insertAdjacentElement("afterend",card);
  card.onclick=()=>{
    nav("casino");
    setTimeout(()=>document.querySelector('[data-casino-game="grandjackpot"]')?.click(),260);
  };
}

export async function refreshJackpot(){
  installCard();
  try{
    const d=await api("/api/casino/jackpot/status"),pool=Number(d.pool||0);
    updateValue($("homeJackpotValue"),pool);
    if($("globalJackpotPool"))$("globalJackpotPool").textContent=chipsShort(pool);
    if($("gameJackpotPool"))$("gameJackpotPool").textContent=pool.toLocaleString("ru-RU");
    if($("infoJackpotPool"))$("infoJackpotPool").textContent=`${pool.toLocaleString("ru-RU")} CHIPS`;
    lastPool=pool;
  }catch{}
}

function updateValue(el,pool){
  if(!el)return;
  const old=lastPool==null?pool:lastPool;
  if(old===pool){el.textContent=pool.toLocaleString("ru-RU");return;}
  const started=performance.now(),duration=450;
  const tick=now=>{
    const t=Math.min(1,(now-started)/duration),eased=1-Math.pow(1-t,3);
    el.textContent=Math.floor(old+(pool-old)*eased).toLocaleString("ru-RU");
    if(t<1)requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
