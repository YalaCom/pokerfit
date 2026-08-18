const tg=window.Telegram?.WebApp;
const $=id=>document.getElementById(id);
const initData=tg?.initData||"";
if(tg){tg.ready();tg.expand();}

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const chips=n=>Number(n||0).toLocaleString("ru-RU");

async function api(path,payload={}){
  const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({initData,...payload})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.ok===false)throw new Error(d.error||"ERROR");
  return d;
}

function toast(text){
  $("toast").textContent=text;
  $("toast").classList.add("show");
  setTimeout(()=>$("toast").classList.remove("show"),1800);
}

async function boot(){
  if(!initData)return $("status").textContent="Открой админку из Mini App.";
  try{
    const b=await api("/api/bootstrap");
    if(!b.admin)throw new Error("Нет доступа");
    $("status").classList.add("hidden");
    $("panel").classList.remove("hidden");
    loadUsers();
  }catch(e){$("status").textContent=e.message;}
}

async function loadUsers(){
  const d=await api("/admin-api/users",{query:$("q").value});
  $("users").innerHTML=d.users.map(u=>`
    <div class="admin-row" data-user-row="${u.telegram_id}">
      <div class="top">
        <div>
          <b>${esc(u.first_name||u.username||u.telegram_id)}</b>
          <div class="meta">${esc(u.username?"@"+u.username:"")} • ID ${u.telegram_id}<br>LEVEL ${u.level} • XP ${u.xp}</div>
        </div>
        <div class="gold">${chips(u.balance)}</div>
      </div>
      <div class="admin-controls">
        <button data-add="${u.telegram_id}">+100K</button>
        <button data-sub="${u.telegram_id}">-100K</button>
        <button class="danger" data-ban="${u.telegram_id}" data-state="${u.is_banned}">${u.is_banned?"UNBAN":"BAN"}</button>
      </div>
      <div class="admin-deduct">
        <input data-deduct-input="${u.telegram_id}" type="number" min="1" step="1" inputmode="numeric" placeholder="Сколько списать">
        <button class="danger" data-deduct="${u.telegram_id}">СПИСАТЬ</button>
        <button class="danger admin-zero" data-zero="${u.telegram_id}" data-balance="${Number(u.balance)||0}">ОБНУЛИТЬ</button>
      </div>
    </div>`).join("");

  $("users").querySelectorAll("[data-add]").forEach(b=>b.onclick=()=>adjust(b.dataset.add,100000));
  $("users").querySelectorAll("[data-sub]").forEach(b=>b.onclick=()=>adjust(b.dataset.sub,-100000));
  $("users").querySelectorAll("[data-ban]").forEach(b=>b.onclick=()=>ban(b.dataset.ban,b.dataset.state!=="1"));
  $("users").querySelectorAll("[data-deduct]").forEach(b=>b.onclick=()=>deductCustom(b.dataset.deduct));
  $("users").querySelectorAll("[data-zero]").forEach(b=>b.onclick=()=>zeroBalance(b.dataset.zero,Number(b.dataset.balance||0)));
}

async function deductCustom(id){
  const input=document.querySelector(`[data-deduct-input="${CSS.escape(String(id))}"]`);
  const amount=Math.trunc(Number(input?.value||0));
  if(!Number.isFinite(amount)||amount<=0)return toast("Введи сумму списания");
  try{
    const d=await api("/admin-api/adjust",{telegramId:id,amount:-amount});
    toast(`Списано ${chips(amount)} • баланс ${chips(d.balance)}`);
    loadUsers();
  }catch(e){toast(e.message);}
}

async function zeroBalance(id,balance){
  const amount=Math.trunc(Number(balance||0));
  if(amount<=0)return toast("Баланс уже 0");
  if(!confirm(`Обнулить баланс игрока?\nБудет списано ${chips(amount)} фишек.`))return;
  try{
    const d=await api("/admin-api/adjust",{telegramId:id,amount:-amount});
    toast(`Баланс обнулён • ${chips(d.balance)}`);
    loadUsers();
  }catch(e){toast(e.message);}
}

async function adjust(id,amount){
  try{await api("/admin-api/adjust",{telegramId:id,amount});toast("Готово");loadUsers();}
  catch(e){toast(e.message);}
}

async function ban(id,banned){
  try{await api("/admin-api/ban",{telegramId:id,banned});toast("Готово");loadUsers();}
  catch(e){toast(e.message);}
}

async function loadTables(){
  const d=await api("/admin-api/tables");
  $("tables").innerHTML=d.tables.map(t=>`<div class="admin-row"><div class="top"><div><b>${esc(t.name)}</b><div class="meta">${t.id}<br>${t.sb}/${t.bb} • ${t.current_players}/${t.max_players}</div></div><div class="gold">${esc(t.status)}</div></div><div class="admin-controls"><button class="danger" data-stop="${t.id}">STOP</button></div></div>`).join("");
  $("tables").querySelectorAll("[data-stop]").forEach(b=>b.onclick=async()=>{await api("/admin-api/stop-table",{tableId:b.dataset.stop});loadTables();});
}

async function loadTournaments(){
  const d=await api("/admin-api/tournaments");
  $("tournaments").innerHTML=d.tournaments.map(t=>`<div class="admin-row"><div class="top"><div><b>${esc(t.name)}</b><div class="meta">${esc(t.starts_at)}<br>${t.registered_players}/${t.max_players} • ${t.buy_in}</div></div><div class="gold">${esc(t.status)}</div></div>${t.status==="scheduled"?`<div class="admin-controls"><button class="danger" data-tcancel="${t.id}">CANCEL</button></div>`:""}</div>`).join("");
  $("tournaments").querySelectorAll("[data-tcancel]").forEach(b=>b.onclick=async()=>{await api("/admin-api/tournament-cancel",{id:b.dataset.tcancel});loadTournaments();});
}

$("tcreate").onclick=async()=>{
  try{
    await api("/admin-api/tournament-save",{name:$("tn").value,startsAt:new Date($("ts").value).toISOString(),buyIn:Number($("tb").value),startStack:Number($("tstack").value),maxPlayers:Number($("tmax").value)});
    toast("Создан");loadTournaments();
  }catch(e){toast(e.message);}
};

async function loadLogs(){
  const d=await api("/admin-api/logs");
  $("logs").innerHTML=d.logs.map(l=>`<div class="admin-row"><b>${esc(l.action)}</b><div class="meta">${esc(l.target||"")} • ${esc(l.created_at)}</div></div>`).join("");
}

$("search").onclick=loadUsers;
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("[data-tab]").forEach(x=>x.classList.toggle("active",x===b));
  ["users","tables","tournaments","logs"].forEach(n=>$(`${n}Tab`).classList.toggle("hidden",n!==b.dataset.tab));
  if(b.dataset.tab==="tables")loadTables();
  if(b.dataset.tab==="tournaments")loadTournaments();
  if(b.dataset.tab==="logs")loadLogs();
});

boot();
