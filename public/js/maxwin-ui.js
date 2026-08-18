import {$,chipsShort} from "./core.js";
let installed=false,observer=null;
export function initMaxWinUI(){
  if(installed)return;installed=true;
  const sync=()=>{
    const body=$("casinoGameBody");if(!body)return;
    const isSlot=!!body.querySelector(".slot-machine,.mega-cabinet,.adv-slot-cabinet,.v4-slot-cabinet,.required-jp-machine");
    if(!isSlot)return;
    const betBox=body.querySelector(".casino-bet"),input=body.querySelector("#casinoBet,#requiredJpBet");if(!betBox||!input)return;
    let hint=betBox.querySelector(".global-slot-maxwin");if(!hint){hint=document.createElement("div");hint.className="global-slot-maxwin";betBox.appendChild(hint);}
    const bet=Math.max(0,Math.floor(Number(input.value||0)));hint.innerHTML=`MAX WIN <b>${chipsShort(bet*1000)}</b>${body.querySelector(".required-jp-machine")?" + JACKPOT":""}`;
  };
  observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener("input",e=>{if(e.target?.matches?.("#casinoBet,#requiredJpBet"))sync();});
  document.addEventListener("click",e=>{if(e.target?.matches?.("[data-cbet],[data-rjp-bet]"))setTimeout(sync,0);});
  sync();
}
