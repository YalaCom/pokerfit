const tg=window.Telegram?.WebApp;
const $=id=>document.getElementById(id);
let toastTimer=null,jackpotTimer=null;

bootCritical();

function bootCritical(){
  bindExchange("homeTopup","topup");
  bindExchange("homeWithdraw","withdraw");
  bindJackpotCard();
  refreshJackpot();
  jackpotTimer=setInterval(refreshJackpot,5000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshJackpot();});
}

function bindExchange(id,kind){
  const button=$(id);if(!button)return;
  button.dataset.exchangeBound="critical";
  button.addEventListener("click",async()=>{
    if(button.disabled)return;
    button.disabled=true;
    try{
      const data=await api(kind==="topup"?"/api/friend-exchange/topup":"/api/friend-exchange/withdraw",{});
      if(data.alreadyPending)toast("Такая заявка уже ждёт подтверждения");
      else toast(kind==="topup"?"Пополнение 500K за 1 ₽ отправлено на подтверждение":"1M фишек списан. Вывод на 1 ₽ ждёт подтверждения");
      if(Number.isFinite(Number(data.balance)))updateBalance(Number(data.balance));
    }catch(error){toast(error.message==="INSUFFICIENT_FUNDS"?"Для вывода нужен баланс минимум 1M":error.message);}
    finally{button.disabled=false;}
  });
}

function bindJackpotCard(){
  const card=$("requiredHomeJackpot");if(!card)return;
  card.dataset.jackpotBound="critical";
  card.addEventListener("click",()=>{
    location.hash="#casino";
    let tries=0;
    const timer=setInterval(()=>{
      tries++;
      const tile=$("requiredJackpotTile")||document.querySelector('[data-casino-game="grandjackpot"]');
      if(tile){clearInterval(timer);tile.click();return;}
      if(tries>=20)clearInterval(timer);
    },120);
  });
}

async function refreshJackpot(){
  try{
    const data=await api("/api/casino/jackpot/status",{}),pool=Math.max(0,Number(data.pool||0)),text=pool.toLocaleString("ru-RU");
    for(const id of ["requiredHomeJackpotValue","requiredCasinoJackpotValue","requiredInfoJackpot","requiredGameJackpot"]){if($(id))$(id).textContent=text;}
  }catch{}
}

async function api(path,payload){
  const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({initData:tg?.initData||"",...payload}),cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw new Error(data.error||`HTTP_${response.status}`);
  return data;
}

function updateBalance(balance){
  if($("homeBalance"))$("homeBalance").textContent=balance.toLocaleString("ru-RU");
  if($("topBalance"))$("topBalance").textContent=short(balance);
}

function short(n){n=Number(n||0);if(n>=1e9)return trim(n/1e9,2)+"B";if(n>=1e6)return trim(n/1e6,2)+"M";if(n>=1e3)return trim(n/1e3,1)+"K";return String(n);}
function trim(n,d){return Number(n).toFixed(d).replace(/\.00$/g,"").replace(/\.0$/g,"");}
function toast(text){const el=$("toast");if(!el)return;el.textContent=String(text||"");el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2400);}
