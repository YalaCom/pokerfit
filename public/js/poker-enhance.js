import {$,state,toast,haptic} from "./core.js";

const bubbles=new Map();
let observedWs=null;

export function initPokerEnhancements(){
  ensureChatComposer();
  setInterval(tick,120);
}

function tick(){
  ensureChatComposer();
  attachSocket();
  renderPrivateCombination();
  renderBubbles();
}

function ensureChatComposer(){
  if($("tableChatComposer"))return;
  const quick=document.querySelector("#view-table .quick-chat");
  if(!quick)return;
  const box=document.createElement("div");box.id="tableChatComposer";box.className="table-chat-composer";
  box.innerHTML='<input id="tableChatFreeInput" maxlength="60" placeholder="Сообщение за столом…"><button id="tableChatFreeSend">SEND</button>';
  quick.insertAdjacentElement("afterend",box);
  $("tableChatFreeSend").onclick=sendFreeChat;
  $("tableChatFreeInput").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();sendFreeChat();}});
}

function attachSocket(){
  const ws=state.ws;
  if(!ws||ws===observedWs)return;
  observedWs=ws;
  ws.addEventListener("message",event=>{
    let msg;try{msg=JSON.parse(event.data);}catch{return;}
    if(msg.type!=="chat")return;
    const id=String(msg.userId),token=crypto.randomUUID();
    bubbles.set(id,{text:String(msg.text||"").slice(0,60),until:Date.now()+4300,token});
    haptic("light");
    setTimeout(()=>{const x=bubbles.get(id);if(x?.token===token)bubbles.delete(id);},4400);
  });
  ws.addEventListener("close",()=>{if(observedWs===ws){observedWs=null;bubbles.clear();}});
}

function sendFreeChat(){
  const input=$("tableChatFreeInput"),text=String(input?.value||"").replace(/\s+/g," ").trim();
  if(!text)return;
  if(text.length>60)return toast("Максимум 60 символов");
  if(!state.ws||state.ws.readyState!==WebSocket.OPEN)return toast("Нет соединения со столом");
  state.ws.send(JSON.stringify({type:"chat",text}));input.value="";
}

function renderBubbles(){
  if(state.currentView!=="table"||!state.table)return;
  const occupied=(state.table.seats||[]).filter(Boolean),nodes=[...document.querySelectorAll("#tableSeats .seat")],now=Date.now();
  occupied.forEach((seat,i)=>{
    const node=nodes[i];if(!node)return;
    const data=bubbles.get(String(seat.id));let bubble=node.querySelector(".seat-chat-bubble");
    if(!data||data.until<=now){bubble?.remove();return;}
    if(!bubble){bubble=document.createElement("div");bubble.className="seat-chat-bubble";node.appendChild(bubble);}
    bubble.textContent=data.text;
  });
}

function renderPrivateCombination(){
  if(state.currentView!=="table"||!state.table||!state.player)return;
  const label=$("handLabel");if(!label)return;
  const own=(state.table.seats||[]).find(s=>s?.id===state.player.telegramId);
  if(!own||own.folded){label.textContent="";return;}
  const hole=(own.hole||[]).filter(Boolean),board=(state.table.board||[]).filter(Boolean);
  let name="";
  if(hole.length===2&&board.length<3&&hole[0].rank===hole[1].rank)name="КАРМАННАЯ ПАРА";
  if(hole.length===2&&board.length>=3)name=bestVisibleHand([...hole,...board]);
  label.textContent=name?`ВАША КОМБИНАЦИЯ • ${name}`:"";
  label.classList.toggle("visible-combo",!!name);
}

function bestVisibleHand(cards){
  if(cards.length<5)return"";let best=null;
  for(let a=0;a<cards.length-4;a++)for(let b=a+1;b<cards.length-3;b++)for(let c=b+1;c<cards.length-2;c++)for(let d=c+1;d<cards.length-1;d++)for(let e=d+1;e<cards.length;e++){
    const s=scoreFive([cards[a],cards[b],cards[c],cards[d],cards[e]]);if(!best||compare(s,best)>0)best=s;
  }
  if(best?.[0]===8&&best?.[1]===14)return"РОЯЛ-ФЛЕШ";
  return ["СТАРШАЯ КАРТА","ПАРА","ДВЕ ПАРЫ","СЕТ","СТРИТ","ФЛЕШ","ФУЛЛ-ХАУС","КАРЕ","СТРИТ-ФЛЕШ"][best?.[0]]||"";
}
function scoreFive(cards){
  const rv={"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13,A:14};
  const ranks=cards.map(c=>rv[c.rank]).sort((a,b)=>b-a),counts=new Map();ranks.forEach(r=>counts.set(r,(counts.get(r)||0)+1));
  const groups=[...counts].map(([rank,count])=>({rank,count})).sort((a,b)=>b.count-a.count||b.rank-a.rank),flush=cards.every(c=>c.suit===cards[0].suit),unique=[...new Set(ranks)].sort((a,b)=>b-a);let straight=0;
  if([14,5,4,3,2].every(r=>unique.includes(r)))straight=5;for(let i=0;i<=unique.length-5;i++)if(unique[i]-unique[i+4]===4)straight=Math.max(straight,unique[i]);
  if(flush&&straight)return[8,straight];if(groups[0].count===4)return[7,groups[0].rank,groups.find(g=>g.rank!==groups[0].rank).rank];if(groups[0].count===3&&groups[1]?.count===2)return[6,groups[0].rank,groups[1].rank];if(flush)return[5,...ranks];if(straight)return[4,straight];if(groups[0].count===3)return[3,groups[0].rank,...groups.filter(g=>g.count===1).map(g=>g.rank).sort((a,b)=>b-a)];
  const pairs=groups.filter(g=>g.count===2).map(g=>g.rank).sort((a,b)=>b-a);if(pairs.length>=2)return[2,pairs[0],pairs[1],groups.filter(g=>!pairs.slice(0,2).includes(g.rank)).map(g=>g.rank).sort((a,b)=>b-a)[0]];if(pairs.length===1)return[1,pairs[0],...groups.filter(g=>g.rank!==pairs[0]).map(g=>g.rank).sort((a,b)=>b-a)];return[0,...ranks];
}
function compare(a,b){for(let i=0;i<Math.max(a?.length||0,b?.length||0);i++){const x=a?.[i]||0,y=b?.[i]||0;if(x!==y)return x>y?1:-1;}return 0;}
