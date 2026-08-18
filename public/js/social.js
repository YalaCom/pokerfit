import {$,state,api,toast,showModal,chipsShort,esc,dateTime,confetti,refreshBootstrap} from "./core.js";
import {connectPokerTable} from "./poker.js";

export function initSocial(){
  $("addFriendButton").onclick=addFriend;$("claimStreakButton").onclick=claimStreak;$("claimFreeButton").onclick=claimFree;$("lowHelpButton").onclick=claimLowHelp;
  $("ratingTabs").querySelectorAll("button").forEach(b=>b.onclick=()=>loadRating(b.dataset.rating,b));
  window.addEventListener("fit-zero-balance",startRescueIfNeeded);
}

export async function loadFeed(){
  try{const d=await api("/api/feed");$("feedList").innerHTML=d.events.length?d.events.map(e=>`<div class="feed-item">${esc(e.text)}<small>${dateTime(e.at)}</small></div>`).join(""):'<div class="empty">Пока нет сыгранных раздач.</div>';}catch{}
}

export async function loadNotifications(){
  try{const d=await api("/api/notifications"),unread=d.notifications.filter(n=>!n.read_at).length;$("notificationDot").classList.toggle("hidden",unread===0);$("notificationsList").innerHTML=d.notifications.length?d.notifications.map(n=>`<button class="notification-card line-card" data-notify="${n.id}"><span><b>${esc(n.title)}</b><small>${esc(n.body)}<br>${dateTime(n.created_at)}</small></span><i>${n.read_at?"":"•"}</i></button>`).join(""):'<div class="empty">Нет уведомлений.</div>';$("notificationsList").querySelectorAll("[data-notify]").forEach(b=>b.onclick=async()=>{await api("/api/notifications/read",{id:Number(b.dataset.notify)});loadNotifications();});}catch{}
}

export async function loadTournaments(){
  $("tournamentsList").innerHTML='<div class="empty">Загрузка…</div>';
  try{const d=await api("/api/tournaments");$("tournamentsList").innerHTML=d.tournaments.length?d.tournaments.map(t=>`<div class="tournament-card"><div class="top"><div><h3>${esc(t.name)}</h3><div class="meta">${dateTime(t.startsAt)}<br>Buy-In ${chipsShort(t.buyIn)} • Stack ${chipsShort(t.startStack)}<br>${t.registeredPlayers}/${t.maxPlayers} • Prize ${chipsShort(t.prizePool)}</div></div><div class="gold">${esc(String(t.status).toUpperCase())}</div></div><div class="actions-row">${t.registered?(["running","late_reg"].includes(t.status)?`<button class="mini-btn gold" data-tplay="${t.id}">К СТОЛУ</button>`:`<button class="mini-btn" data-unreg="${t.id}">ОТМЕНИТЬ</button>`):`<button class="mini-btn gold" data-reg="${t.id}">РЕГИСТРАЦИЯ</button>`}</div></div>`).join(""):'<div class="empty">Турниры появятся автоматически.</div>';
    $("tournamentsList").querySelectorAll("[data-reg]").forEach(b=>b.onclick=()=>registerTournament(b.dataset.reg));$("tournamentsList").querySelectorAll("[data-unreg]").forEach(b=>b.onclick=()=>unregisterTournament(b.dataset.unreg));$("tournamentsList").querySelectorAll("[data-tplay]").forEach(b=>b.onclick=()=>playTournament(b.dataset.tplay));
  }catch(e){$("tournamentsList").innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
}
async function registerTournament(id){try{await api("/api/tournaments/register",{tournamentId:id,requestId:crypto.randomUUID()});await refreshBootstrap();await loadTournaments();toast("Вы зарегистрированы");}catch(e){toast(e.message);}}
async function unregisterTournament(id){try{await api("/api/tournaments/unregister",{tournamentId:id});await refreshBootstrap();await loadTournaments();toast("Регистрация отменена");}catch(e){toast(e.message);}}
async function playTournament(id){try{const d=await api("/api/tournaments/seat",{tournamentId:id});if(!d.seat.tableId||!d.connectToken)return toast("Стол ещё не назначен");state.currentTournamentId=id;connectPokerTable({id:d.seat.tableId,name:d.seat.name||"Tournament",kind:"tournament",tournamentId:id},d.connectToken,false,id);}catch(e){toast(e.message);}}

export async function loadRating(type="balance",button=null){
  if(button)$("ratingTabs").querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===button));$("ratingList").innerHTML='<div class="empty">Загрузка…</div>';
  try{const d=await api("/api/rating",{type});$("ratingList").innerHTML=d.rows.length?d.rows.map(r=>`<div class="ranking-row"><div class="place">#${r.place}</div><div><b>${esc(r.first_name||r.username||"Игрок")}</b><small>LEVEL ${r.level} • ${r.xp||0} XP</small></div><em>${type==="tournaments"?r.tournaments_won:type==="profit"?chipsShort(r.profit):type==="xp"?r.xp:type==="season"?r.season_score:chipsShort(r.balance)}</em></div>`).join(""):'<div class="empty">Рейтинг пока пуст.</div>';}catch(e){$("ratingList").innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
}

export async function loadFriends(){
  try{const d=await api("/api/friends");$("friendsList").innerHTML=d.friends.length?d.friends.map(f=>`<div class="friend-card"><div class="top"><div><h3>${esc(f.firstName||f.username||"Игрок")}</h3><div class="meta"><span class="${f.online?"status-online":"status-offline"}">${f.online?"ONLINE":"OFFLINE"}</span> • LEVEL ${f.level}</div></div></div><div class="actions-row">${f.tableId?`<button class="mini-btn gold" data-watch-friend="${f.tableId}">СМОТРЕТЬ</button>`:""}<button class="mini-btn" data-remove="${f.telegramId}">УДАЛИТЬ</button></div></div>`).join(""):'<div class="empty">Добавь друзей по @username или Telegram ID.</div>';$("friendsList").querySelectorAll("[data-watch-friend]").forEach(b=>b.onclick=async()=>{try{const d=await api("/api/table/spectate",{tableId:b.dataset.watchFriend});connectPokerTable(d.table,d.connectToken,true);}catch(e){toast(e.message);}});$("friendsList").querySelectorAll("[data-remove]").forEach(b=>b.onclick=async()=>{await api("/api/friends/remove",{friendId:b.dataset.remove});loadFriends();});}catch(e){toast(e.message);}
}
async function addFriend(){const target=$("friendInput").value.trim();if(!target)return;try{await api("/api/friends/add",{target});$("friendInput").value="";await loadFriends();toast("Друг добавлен");}catch(e){toast(e.message);}}

export async function loadRewards(){
  try{const d=await api("/api/rewards/status"),r=d.rewards;$("streakDay").textContent=`DAY ${r.streakNextDay}`;$("streakAmount").textContent=chipsShort(r.streakNextAmount);$("claimStreakButton").disabled=!r.streakAvailable;$("claimStreakButton").textContent=r.streakAvailable?"ЗАБРАТЬ":"ПОЛУЧЕНО";$("claimFreeButton").disabled=!r.freeAvailable;$("claimFreeButton").style.opacity=r.freeAvailable?"1":".45";$("lowHelpButton").classList.toggle("hidden",!r.lowHelpAvailable);
    $("achievementsList").innerHTML=d.achievements.map(a=>`<div class="achievement-card ${a.rare?"rare":""}"><div class="top"><div><h3>${esc(a.name)}</h3><div class="meta">${esc(a.description)} • ${chipsShort(a.reward)}</div></div>${a.unlocked&&!a.claimed?`<button class="mini-btn gold" data-ach="${a.id}">ЗАБРАТЬ</button>`:a.claimed?'<span class="gold">✓</span>':""}</div><div class="progress"><i style="width:${Math.min(100,a.progress/a.threshold*100)}%"></i></div><div class="meta">${a.progress}/${a.threshold}</div></div>`).join("");
    $("achievementsList").querySelectorAll("[data-ach]").forEach(b=>b.onclick=async()=>{try{const x=await api("/api/achievements/claim",{achievementId:b.dataset.ach});toast(`+${chipsShort(x.amount)}`);confetti();await refreshBootstrap();loadRewards();}catch(e){toast(e.message);}});
  }catch(e){toast(e.message);}
}
async function claimStreak(){try{const d=await api("/api/rewards/streak");toast(`+${chipsShort(d.amount)}`);confetti();await refreshBootstrap();loadRewards();}catch(e){toast(e.message);}}
async function claimFree(){try{const d=await api("/api/rewards/free");toast(`+${chipsShort(d.amount)}`);await refreshBootstrap();loadRewards();}catch(e){toast(e.message);}}
async function claimLowHelp(){try{const d=await api("/api/rewards/low-help");toast(`+${chipsShort(d.amount)}`);await refreshBootstrap();loadRewards();}catch(e){toast(e.message);}}

export async function loadProfile(){
  await refreshBootstrap();const p=state.player;$("profileStats").innerHTML=[["Рук",p.handsPlayed],["Win Rate",`${p.winRate}%`],["Biggest Pot",chipsShort(p.biggestPot)],["Poker Win",p.handsWon],["Blackjack",p.blackjackWins],["Турниры",p.tournamentsWon],["All-In",`${p.allInsWon}/${p.allIns}`],["XP",p.xp]].map(x=>`<div class="stat-box"><b>${x[1]}</b><small>${x[0]}</small></div>`).join("");
  try{const d=await api("/api/history");$("historyList").innerHTML=d.hands.length?d.hands.map(h=>`<button class="history-card line-card" data-replay="${h.id}"><span><b>${esc(h.combination||`Hand #${h.hand_no}`)}</b><small>Pot ${chipsShort(h.pot)} • ${h.result>=0?"+":""}${chipsShort(h.result)} • ${dateTime(h.completed_at)}</small></span><i>▶</i></button>`).join(""):'<div class="empty">История появится после первой раздачи.</div>';$("historyList").querySelectorAll("[data-replay]").forEach(b=>b.onclick=()=>openReplay(b.dataset.replay));}catch{}
}
async function openReplay(handId){try{const d=await api("/api/replay",{handId}),r=d.replay;showModal(`<h3>Replay #${r.hand.hand_no}</h3><div class="meta">Board: ${(r.hand.board||[]).map(c=>`${c.rank}${({S:"♠",H:"♥",D:"♦",C:"♣"})[c.suit]||""}`).join(" ")}</div><div class="cards-list replay-list">${r.actions.map(a=>`<div class="feed-item"><b>${esc(a.street)}</b> • ${esc(a.action)} ${a.amount?chipsShort(a.amount):""}<small>Pot ${chipsShort(a.pot_after)}</small></div>`).join("")}</div>`);}catch(e){toast(e.message);}}

export async function startRescueIfNeeded(){
  if(Number(state.player?.balance||0)!==0)return;
  try{const d=await api("/api/rewards/rescue-start"),overlay=$("rescueOverlay"),end=Date.parse(d.eligibleAt);overlay.classList.remove("hidden");const timer=setInterval(async()=>{const sec=Math.max(0,Math.ceil((end-Date.now())/1000));$("rescueCountdown").textContent=sec;if(sec<=0){clearInterval(timer);try{const x=await api("/api/rewards/rescue-claim",{claimToken:d.claimToken});overlay.classList.add("hidden");toast(`+${chipsShort(x.amount)}`);await refreshBootstrap();}catch(e){overlay.classList.add("hidden");toast(e.message);}}},200);}catch{}
}
