import {$,state,api,nav,toast,showModal,closeModal,chips,chipsShort,esc,attr,cardHtml,flash,confetti,haptic,sound,refreshBootstrap} from "./core.js";

let publicTables=[];
export function initPoker(){
  $("quickPokerButton").onclick=quickPlay;$("createPrivateButton").onclick=openPrivateCreate;$("joinPrivateButton").onclick=joinPrivate;$("leaveTableButton").onclick=leaveTable;$("sitoutButton").onclick=toggleSitout;
  $("raiseSlider").oninput=()=>$("raiseValue").textContent=chips(Number($("raiseSlider").value));
  document.querySelectorAll(".pot-presets button").forEach(b=>b.onclick=()=>setPotPreset(Number(b.dataset.pot)));
  document.querySelectorAll(".quick-chat button").forEach(b=>b.onclick=()=>sendTable({type:"chat",text:b.textContent}));
  $("tierTabs").querySelectorAll("button").forEach(b=>b.onclick=()=>filterTables(b.dataset.tier,b));
  setInterval(updateTurnTimer,200);
}

export async function loadTables(){
  $("tablesList").innerHTML='<div class="empty">Загрузка столов…</div>';
  try{const d=await api("/api/tables");publicTables=d.tables;renderTables(publicTables);}catch(e){$("tablesList").innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
}

function renderTables(rows){
  $("tablesList").innerHTML=rows.length?rows.map(t=>`<div class="table-card" data-tier="${tierOf(t.bb)}"><div class="top"><div><h3>${esc(t.name)}</h3><div class="meta">SB ${chipsShort(t.sb)} / BB ${chipsShort(t.bb)}<br>Buy-In ${chipsShort(t.minBuyin)}–${chipsShort(t.maxBuyin)}</div></div><div class="gold">${t.currentPlayers}/${t.maxPlayers}</div></div><div class="actions-row"><button class="mini-btn gold" data-join="${attr(t.id)}">СЕСТЬ</button><button class="mini-btn" data-watch="${attr(t.id)}">СМОТРЕТЬ</button></div></div>`).join(""):'<div class="empty">Нет открытых столов. Быстрая игра создаст новый.</div>';
  $("tablesList").querySelectorAll("[data-join]").forEach(b=>b.onclick=()=>connectPublic(b.dataset.join));$("tablesList").querySelectorAll("[data-watch]").forEach(b=>b.onclick=()=>spectate(b.dataset.watch));
}
function filterTables(tier,button){$("tierTabs").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===button));renderTables(tier==="all"?publicTables:publicTables.filter(t=>tierOf(t.bb)===tier));}
function tierOf(bb){return bb>=200000?"high":bb>=50000?"pro":bb>=10000?"amateur":"novice";}

async function quickPlay(){try{haptic("medium");const d=await api("/api/quick-play",{tier:"auto"});connectPokerTable(d.table,d.connectToken,false);}catch(e){toast(e.message==="BALANCE_TOO_LOW"?"Баланс слишком мал для стола":e.message);}}
async function connectPublic(tableId){try{const d=await api("/api/table/connect",{tableId});connectPokerTable(d.table,d.connectToken,false);}catch(e){toast(e.message);}}
async function spectate(tableId){try{const d=await api("/api/table/spectate",{tableId});connectPokerTable(d.table,d.connectToken,true);}catch(e){toast(e.message);}}
async function joinPrivate(){const code=$("roomCodeInput").value.trim(),password=$("roomPasswordInput").value;if(!code)return toast("Введи код комнаты");try{const d=await api("/api/private/join",{code,password});connectPokerTable(d.table,d.connectToken,false);}catch(e){toast(e.message);}}

function openPrivateCreate(){
  showModal(`<h3>Приватный стол</h3><div class="modal-form"><input id="mName" value="FIT Private" placeholder="Название"><div class="join-code"><input id="mSb" type="number" value="1000" placeholder="SB"><input id="mBb" type="number" value="2000" placeholder="BB"></div><div class="join-code"><input id="mMin" type="number" value="100000" placeholder="Min Buy-In"><input id="mMax" type="number" value="400000" placeholder="Max Buy-In"></div><input id="mPassword" type="password" placeholder="Пароль (необязательно)"><select id="mPlayers"><option>9</option><option>6</option><option>4</option><option>2</option></select><select id="mTimer"><option value="20">20 секунд</option><option value="30">30 секунд</option><option value="15">15 секунд</option></select><button id="mCreate" class="gold-button">СОЗДАТЬ СТОЛ</button></div>`);
  $("mCreate").onclick=async()=>{try{const d=await api("/api/private/create",{name:$("mName").value,sb:Number($("mSb").value),bb:Number($("mBb").value),minBuyin:Number($("mMin").value),maxBuyin:Number($("mMax").value),password:$("mPassword").value,maxPlayers:Number($("mPlayers").value),turnSeconds:Number($("mTimer").value)});closeModal();navigator.clipboard?.writeText(d.table.code||"").catch(()=>{});toast(`Код комнаты: ${d.table.code}`);connectPokerTable(d.table,d.connectToken,false);}catch(e){toast(e.message);}};
}

export async function resumeActiveTable(){try{const d=await api("/api/table/resume");connectPokerTable(d.table,d.connectToken,false);}catch(e){toast(e.message);state.activeSession=null;}}
export function connectPokerTable(table,token,spectator=false,tournamentId=null){
  closePokerSocket();state.tableId=table.id;state.currentTournamentId=tournamentId||table.tournamentId||null;state.table=null;state.lastActionCount=0;nav("table");$("tableName").textContent=table.name||"FIT Table";$("tableMode").textContent=table.kind==="tournament"?"TOURNAMENT":"CASH GAME";$("sitoutButton").classList.toggle("hidden",spectator);
  const scheme=location.protocol==="https:"?"wss":"ws",ws=new WebSocket(`${scheme}://${location.host}/ws/table/${encodeURIComponent(table.id)}?token=${encodeURIComponent(token)}`);state.ws=ws;
  ws.onopen=()=>toast(spectator?"Режим зрителя":"Вы за столом");ws.onmessage=e=>{try{handleMessage(JSON.parse(e.data));}catch{}};ws.onclose=e=>{if(state.currentView==="table"&&e.code!==1000)toast(e.reason||"Соединение со столом закрыто");};ws.onerror=()=>toast("Ошибка соединения со столом");
}

function handleMessage(msg){
  if(msg.type==="snapshot"){
    const prev=state.table;state.table=msg.table;state.serverOffset=Date.now()-Number(msg.serverTime||Date.now());state.turnDeadline=msg.turnDeadline;renderTable(prev,msg.table);
    if(msg.table.stage==="HAND_COMPLETE"&&msg.table.handId!==state.lastHandId){state.lastHandId=msg.table.handId;showResult(msg.table.lastResult);if(state.currentTournamentId)setTimeout(checkTournamentReseat,2600);}
  }else if(msg.type==="chat")appendEvent(`${msg.userId===state.player.telegramId?"Вы":"Игрок"}: ${msg.text}`);else if(msg.type==="table_closed"){toast("Стол закрыт администратором");setTimeout(()=>nav("home"),700);}else if(msg.type==="error")toast(msg.error);
}
function renderTable(prev,t){$("potLabel").textContent=`POT ${chipsShort(t.pot)}`;renderBoard(t.board,prev?.board||[]);renderSeats(t);renderActions(t);renderEvents(t.actionLog);if((t.actionLog?.length||0)>state.lastActionCount){pulsePot();sound("chip");state.lastActionCount=t.actionLog.length;}const last=t.actionLog?.at(-1);if(last?.action==="ALL_IN"){flash($("allInFlash"));haptic("heavy");}const final=t.mode==="tournament"&&String(t.id).endsWith("-final")&&t.handNo<=1;$("finalTableFlash").classList.toggle("hidden",!final);const own=t.seats.find(s=>s?.id===state.player.telegramId),combo=t.lastResult?.combinations?.find(c=>c.id===own?.id);$("handLabel").textContent=combo?.hand||"";}
function renderBoard(cards,old){$("boardCards").innerHTML=cards.map((c,i)=>cardHtml(c,"board-card",i>=old.length?`style="animation-delay:${(i-old.length)*100}ms"`:"")).join("");if(cards.length>old.length)sound("card");}
function renderSeats(t){
  const viewer=t.seats.find(s=>s?.id===state.player.telegramId),viewerSeat=viewer?.seat??0,n=t.maxPlayers;
  $("tableSeats").innerHTML=t.seats.map((s,index)=>{if(!s)return"";const rel=(index-viewerSeat+n)%n,angle=(90+rel*360/n)*Math.PI/180,left=50+42*Math.cos(angle),top=48+39*Math.sin(angle);const badge=index===t.dealerSeat?"D":index===t.smallBlindSeat?"SB":index===t.bigBlindSeat?"BB":"";return `<div class="seat ${index===t.actionSeat?"active":""}" style="left:${left}%;top:${top}%">${s.hole?.length?`<div class="hole-cards">${s.hole.map((c,i)=>cardHtml(c,"mini-card",`style="animation-delay:${i*80}ms"`)).join("")}</div>`:""}<div class="portrait">${s.photoUrl?`<img src="${attr(s.photoUrl)}" alt="">`:esc((s.name||"?")[0])}</div>${badge?`<span class="badge">${badge}</span>`:""}<div class="name">${esc(s.name)}</div><div class="stack">${chipsShort(s.stack)}</div>${s.streetBet?`<div class="bet">${chipsShort(s.streetBet)}</div>`:""}<div class="last-action">${esc(s.lastAction?.type||"")}${s.sittingOut?" • SIT OUT":s.connected?"":" • RECONNECTING"}</div></div>`;}).join("");
}
function renderActions(t){
  const legal=t.legalActions||[];$("actionPanel").classList.toggle("hidden",legal.length===0);const own=t.seats.find(s=>s?.id===state.player.telegramId);if(!own||!legal.length)return;const call=Math.max(0,t.currentBet-own.streetBet),max=own.streetBet+own.stack;
  $("actionButtons").innerHTML=legal.map(a=>{let label=a,cls="";if(a==="FOLD")cls="fold";if(a==="CHECK")cls="primary";if(a==="CALL"){label=`CALL ${chipsShort(Math.min(call,own.stack))}`;cls="primary";}if(a==="BET"||a==="RAISE")cls="primary";if(a==="ALL_IN")label=`ALL-IN ${chipsShort(own.stack)}`;return `<button class="${cls}" data-action="${a}">${label}</button>`;}).join("");
  $("actionButtons").querySelectorAll("button").forEach(b=>b.onclick=()=>act(b.dataset.action));const raiseable=legal.includes("BET")||legal.includes("RAISE");$("raisePanel").classList.toggle("hidden",!raiseable);if(raiseable){const min=legal.includes("BET")?Math.min(max,Math.max(t.bb,t.minRaise)):Math.min(max,t.currentBet+t.minRaise);$("raiseSlider").min=min;$("raiseSlider").max=max;$("raiseSlider").step=Math.max(1,t.bb);if(Number($("raiseSlider").value)<min||Number($("raiseSlider").value)>max)$("raiseSlider").value=min;$("raiseValue").textContent=chips(Number($("raiseSlider").value));}
}
function act(action){const amount=action==="BET"||action==="RAISE"?Number($("raiseSlider").value):0;sendTable({type:"action",action,amount,actionId:crypto.randomUUID()});sound("click");haptic("light");}
function setPotPreset(mult){const t=state.table,own=t?.seats.find(s=>s?.id===state.player.telegramId);if(!t||!own)return;const target=Math.min(own.streetBet+own.stack,Math.max(Number($("raiseSlider").min),Math.round((t.pot*mult+t.currentBet)/t.bb)*t.bb));$("raiseSlider").value=target;$("raiseValue").textContent=chips(target);}
function sendTable(data){if(state.ws?.readyState===WebSocket.OPEN)state.ws.send(JSON.stringify(data));}
async function leaveTable(){sendTable({type:"leave"});closePokerSocket();await refreshBootstrap().catch(()=>{});nav("home");}
function toggleSitout(){const own=state.table?.seats.find(s=>s?.id===state.player.telegramId);sendTable({type:own?.sittingOut?"back":"sitout"});}
export function closePokerSocket(){if(state.ws){try{state.ws.close(1000,"leave");}catch{}state.ws=null;}state.table=null;state.tableId=null;state.turnDeadline=null;}
function renderEvents(log=[]){$("tableEvents").innerHTML=log.slice(-7).map(a=>`${esc(a.action)} ${a.amount?chipsShort(a.amount):""}`).join(" • ");}
function appendEvent(s){$("tableEvents").textContent=`${$("tableEvents").textContent} • ${s}`;}
function updateTurnTimer(){if(!state.turnDeadline||state.currentView!=="table"){return $("turnTimer").classList.add("hidden");}const seconds=Math.max(0,(Number(state.turnDeadline)-(Date.now()-state.serverOffset))/1000),total=state.table?.turnSeconds||20;$("turnTimer").classList.remove("hidden");$("turnTimer").querySelector("span").textContent=Math.ceil(seconds);$("turnTimer").style.setProperty("--progress",`${Math.max(0,Math.min(100,seconds/total*100))}%`);if(seconds<=5&&Math.ceil(seconds)!==state.lastTick){state.lastTick=Math.ceil(seconds);sound("tick");haptic("light");}}
function pulsePot(){if(!state.settings.animations)return;$("potLabel").animate([{transform:"scale(1)"},{transform:"scale(1.18)"},{transform:"scale(1)"}],{duration:320});}
function showResult(result){if(!result)return;const mine=result.winners?.find(w=>w.id===state.player.telegramId);if(mine){toast(`+${chipsShort(mine.amount)} • WIN`);confetti();sound("win");haptic("success");}}
async function checkTournamentReseat(){if(!state.currentTournamentId)return;try{const d=await api("/api/tournaments/seat",{tournamentId:state.currentTournamentId});if(d.seat.tableId&&d.seat.tableId!==state.tableId&&d.connectToken){toast("Пересадка за новый стол");connectPokerTable({id:d.seat.tableId,name:d.seat.name||"Tournament",kind:"tournament",tournamentId:state.currentTournamentId},d.connectToken,false,state.currentTournamentId);}}catch{}}
