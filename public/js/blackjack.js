import {$,state,api,toast,chipsShort,suitChar,confetti,haptic,sound,refreshBootstrap} from "./core.js";

export function initBlackjack(){
  $("bjDealButton").onclick=deal;$("bjNewGame").onclick=reset;
  $("bjActions").querySelectorAll("button").forEach(b=>b.onclick=()=>act(b.dataset.action));
  $("bjBetPanel").querySelectorAll(".bet-presets button").forEach((b,i)=>b.onclick=()=>{$("bjBet").value=[10000,50000,100000,Math.max(1000,state.player?.balance||1000)][i];});
}

async function deal(){
  const bet=Math.floor(Number($("bjBet").value));if(bet<1000)return toast("Минимальная ставка 1K");if(bet>Number(state.player?.balance||0))return toast("Недостаточно фишек");
  $("bjDealButton").disabled=true;chipFx();try{const d=await api("/api/blackjack/new",{bet,requestId:crypto.randomUUID()});state.bjPrevious=null;state.bj=d.game;await refreshBootstrap();render(true);if(d.game.finished)finished();}catch(e){toast(e.message);}finally{$("bjDealButton").disabled=false;}
}

async function act(action){
  if(!state.bj)return;toggleActions(true);try{const old=state.bj,d=await api("/api/blackjack/action",{gameToken:state.bj.token,action,actionId:crypto.randomUUID()});state.bjPrevious=old;state.bj=d.game;await refreshBootstrap();render(false);if(d.game.finished)finished();}catch(e){toast(e.message);}finally{toggleActions(false);}
}

function render(initial){
  const g=state.bj;if(!g)return;$("bjPot").textContent=chipsShort(g.bet);$("playerValue").textContent=g.playerValue;$("dealerValue").textContent=g.finished?g.dealerValue:`${g.dealerValue} + ?`;
  const oldP=initial?0:(state.bjPrevious?.player?.length||0),oldD=initial?0:(state.bjPrevious?.dealer?.length||0);
  $("playerCards").innerHTML=g.player.map((c,i)=>card(c,i>=oldP?i*105:0,false)).join("");
  $("dealerCards").innerHTML=g.dealer.map((c,i)=>card(c,i>=oldD?i*105:0,g.finished&&state.bjPrevious?.dealer?.[i]===null&&!!c)).join("");
  $("bjBetPanel").classList.add("hidden");$("bjActions").classList.toggle("hidden",g.finished);$("bjNewGame").classList.toggle("hidden",!g.finished);if(!g.finished){$("bjResult").className="result-banner hidden";sound("card");}
}

function card(c,delay,flip){if(!c)return `<div class="bj-card back" style="animation-delay:${delay}ms"></div>`;const red=["H","D"].includes(c.suit);return `<div class="bj-card ${red?"red":""} ${flip?"flip":""}" style="animation-delay:${delay}ms"><span>${c.rank}</span><span class="suit">${suitChar(c.suit)}</span></div>`;}
function finished(){
  const g=state.bj,map={win:["YOU WIN","win"],dealer_bust:["DEALER BUST • YOU WIN","win"],blackjack:["BLACKJACK!","win"],push:["PUSH","push"],bust:["BUST","loss"],loss:["YOU LOSE","loss"],dealer_blackjack:["DEALER BLACKJACK","loss"]},x=map[g.result]||["FINISHED","push"];
  $("bjResult").textContent=`${x[0]}${g.payout?` • ${chipsShort(g.payout)}`:""}`;$("bjResult").className=`result-banner ${x[1]}`;
  if(x[1]==="win"){confetti();sound("win");haptic("success");}else if(x[1]==="loss"){sound("lose");haptic("error");}
  if(Number(state.player?.balance||0)===0)window.dispatchEvent(new CustomEvent("fit-zero-balance"));
}
function reset(){state.bj=null;state.bjPrevious=null;$("dealerCards").innerHTML=$("playerCards").innerHTML="";$("dealerValue").textContent=$("playerValue").textContent="—";$("bjPot").textContent="0";$("bjResult").className="result-banner hidden";$("bjBetPanel").classList.remove("hidden");$("bjActions").classList.add("hidden");$("bjNewGame").classList.add("hidden");}
function toggleActions(disabled){$("bjActions").querySelectorAll("button").forEach(b=>b.disabled=disabled);}
function chipFx(){if(!state.settings.animations)return;const layer=$("fxLayer"),from=$("bjBetPanel").getBoundingClientRect(),to=$("bjPot").getBoundingClientRect(),x=document.createElement("i");x.className="chip-fx";x.style.setProperty("--x1",`${from.left+from.width/2}px`);x.style.setProperty("--y1",`${from.top}px`);x.style.setProperty("--x2",`${to.left}px`);x.style.setProperty("--y2",`${to.top}px`);layer.appendChild(x);setTimeout(()=>x.remove(),800);sound("chip");}
