import {tg,$,state,refreshBootstrap,nav,routeFromHash,registerView,bindSettings,closeModal,toast} from "./js/core.js";
import {initPoker,loadTables,resumeActiveTable,closePokerSocket} from "./js/poker.js";
import {initBlackjack} from "./js/blackjack.js";
import {initSocial,loadFeed,loadNotifications,loadTournaments,loadRating,loadFriends,loadRewards,loadProfile,startRescueIfNeeded} from "./js/social.js";
import {initCasino,loadCasino} from "./js/casino.js";
import {initPokerEnhancements} from "./js/poker-enhance.js";
import {initLuxuryUI} from "./js/luxury-ui.js";

boot();

async function boot(){
  if(!tg?.initData)return fail("Открой FIT Poker через Telegram.");
  tg.ready();tg.expand();state.initData=tg.initData;bindSettings();bindGlobal();initPoker();initBlackjack();initSocial();initCasino();initPokerEnhancements();initLuxuryUI();
  registerView("tables",loadTables);registerView("tournaments",loadTournaments);registerView("rating",()=>loadRating("balance"));registerView("friends",loadFriends);registerView("rewards",loadRewards);registerView("profile",loadProfile);registerView("notifications",loadNotifications);registerView("casino",loadCasino);
  try{await refreshBootstrap();await Promise.allSettled([loadFeed(),loadNotifications()]);routeFromHash();$("app").classList.remove("hidden");setTimeout(()=>$("splash").classList.add("hide"),450);setTimeout(startRescueIfNeeded,650);}catch(error){fail(`Ошибка запуска: ${error.message}`);}
}

function bindGlobal(){
  document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>{if(state.currentView==="table"&&b.dataset.nav!=="table"&&state.ws?.readyState===WebSocket.OPEN){if(!confirm("Выйти из игрового стола?"))return;closePokerSocket();}nav(b.dataset.nav);}));
  $("notificationButton").onclick=()=>nav("notifications");$("modalClose").onclick=closeModal;$("modal").onclick=e=>{if(e.target===$("modal"))closeModal();};
  $("adminLink").onclick=()=>location.href="/admin.html";window.addEventListener("hashchange",routeFromHash);window.addEventListener("fit-resume-table",resumeActiveTable);
}
function fail(text){$("splash").innerHTML=`<div class="empty splash-error">${String(text)}</div>`;}
