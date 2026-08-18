import {debit,credit,zeroLedger,getBalance} from "./db.js";
import {buildPaylines,evaluateAdvancedGrid} from "./advanced-slots.js";

const WILD="🃏",SCATTER="🌟";
export const MORE_SLOT_CONFIGS={
  moon5:{id:"moon5",name:"MOONLIGHT RICHES",rows:3,cols:5,lineCount:25,scatterTrigger:3,bonusSpins:6,symbols:["🌙","🔮","💎","🦉","👑","🌌",WILD,SCATTER],weights:[27,22,16,12,8,4,2.5,.9],bonusWeights:[20,18,14,10,7,4,14,2],paytable:{"🌙":{3:1.2,4:3,5:9},"🔮":{3:1.8,4:5,5:16},"💎":{3:3,4:10,5:38},"🦉":{3:4,4:16,5:60},"👑":{3:7,4:30,5:140},"🌌":{3:12,4:55,5:300},[WILD]:{3:18,4:90,5:650}},scatterPays:{3:2,4:10,5:40}},
  dragon6:{id:"dragon6",name:"DRAGON FIRE",rows:4,cols:6,lineCount:30,scatterTrigger:4,bonusSpins:5,symbols:["🔥","🪙","🏮","🐉","💎","👑",WILD,SCATTER],weights:[27,23,18,11,8,4,2.5,.9],bonusWeights:[20,18,14,9,7,4,15,2],paytable:{"🔥":{3:.8,4:1.8,5:4,6:10},"🪙":{3:1,4:2.5,5:6,6:16},"🏮":{3:1.6,4:4,5:10,6:28},"🐉":{3:3,4:9,5:30,6:100},"💎":{3:5,4:18,5:65,6:220},"👑":{3:8,4:35,5:140,6:500},[WILD]:{3:14,4:70,5:300,6:1000}},scatterPays:{4:3,5:12,6:50}}
};
for(const c of Object.values(MORE_SLOT_CONFIGS))c.paylines=buildPaylines(c.rows,c.cols,c.lineCount);

export async function playMoreSlot(env,userId,slotId,bet,requestId){
  const cfg=MORE_SLOT_CONFIGS[String(slotId||"")];if(!cfg)throw new Error("SLOT_NOT_FOUND");
  userId=String(userId);bet=validateBet(bet);requestId=String(requestId||crypto.randomUUID());
  const key=`casino:MORE_SLOT:${cfg.id}:bet:${userId}:${requestId}`,old=await tx(env,key);if(old)return replay(env,userId,old);
  const roundId=crypto.randomUUID(),grid=spin(cfg,false,new Set()),base=evaluateAdvancedGrid(cfg,grid,bet,1),triggered=base.scatterCount>=cfg.scatterTrigger;
  const bonus=triggered?bonusRound(cfg,bet,grid):null,payout=Math.min(Math.floor(bet*1000),Math.max(0,base.payout+(bonus?.payout||0))),multiplier=Math.floor(payout/Math.max(1,bet)*100)/100;
  const result={slotId:cfg.id,name:cfg.name,rows:cfg.rows,cols:cfg.cols,lineCount:cfg.lineCount,grid,base,bonusTriggered:triggered,bonus,payout,multiplier,maxWin:bet*1000};
  const meta={game:`MORE_SLOT_${cfg.id}`,roundId,bet,payout,multiplier,result};
  const d=await debit(env,userId,bet,`CASINO_MORE_SLOT_${cfg.id}_BET`,key,meta);if(!d.applied){const ex=await tx(env,key);if(ex)return replay(env,userId,ex);throw new Error("DUPLICATE_REQUEST");}
  let balance=d.balance;if(payout>0){const c=await credit(env,userId,payout,`CASINO_MORE_SLOT_${cfg.id}_PAYOUT`,`casino:MORE_SLOT:${cfg.id}:payout:${roundId}`,meta);balance=c.balance;}else await zeroLedger(env,userId,`CASINO_MORE_SLOT_${cfg.id}_RESULT`,`casino:MORE_SLOT:${cfg.id}:result:${roundId}`,meta);
  return {roundId,bet,payout,multiplier,result,balance,maxWin:bet*1000};
}

function bonusRound(cfg,bet,triggerGrid){
  const sticky=new Set();triggerGrid.forEach((row,r)=>row.forEach((s,c)=>{if(s===WILD)sticky.add(`${r}:${c}`);}));
  let remaining=cfg.bonusSpins,total=0,spinNo=0,mult=1;const frames=[];
  while(remaining>0&&spinNo<14){remaining--;spinNo++;const grid=spin(cfg,true,sticky),fresh=[];
    grid.forEach((row,r)=>row.forEach((s,c)=>{const k=`${r}:${c}`;if(s===WILD&&!sticky.has(k)){sticky.add(k);fresh.push([r,c]);}}));
    if(cfg.id==="moon5")mult=Math.min(4,1+(spinNo-1)*.35);
    if(cfg.id==="dragon6"&&fresh.length){const add=Math.min(fresh.length,Math.max(0,14-spinNo-remaining));remaining+=add;}
    const e=evaluateAdvancedGrid(cfg,grid,bet,mult);total+=e.payout;frames.push({spin:spinNo,grid,sticky:[...sticky].map(x=>x.split(":").map(Number)),newSticky:fresh,remaining,bonusMultiplier:mult,payout:e.payout,lines:e.lines});
  }
  return {name:cfg.id==="moon5"?"MOON ASCENSION":"DRAGON RESPINS",totalSpins:frames.length,payout:total,frames,initialSticky:triggerGrid.flatMap((row,r)=>row.map((s,c)=>s===WILD?[r,c]:null).filter(Boolean))};
}
function spin(cfg,bonus,sticky){const w=bonus?cfg.bonusWeights:cfg.weights,g=Array.from({length:cfg.rows},()=>Array(cfg.cols));for(let r=0;r<cfg.rows;r++)for(let c=0;c<cfg.cols;c++)g[r][c]=sticky.has(`${r}:${c}`)?WILD:pick(cfg.symbols,w);return g;}
function pick(v,w){const s=w.map(x=>Math.round(Math.max(0,Number(x))*100)),t=s.reduce((a,b)=>a+b,0);let n=rand(Math.max(1,t));for(let i=0;i<v.length;i++){n-=s[i];if(n<0)return v[i];}return v.at(-1);}
function rand(max){const ceiling=0x100000000,limit=ceiling-(ceiling%max),b=new Uint32Array(1);do crypto.getRandomValues(b);while(b[0]>=limit);return b[0]%max;}
function validateBet(v){const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<1000)throw new Error("MIN_BET_1000");if(n>5_000_000)throw new Error("MAX_BET_5M");return n;}
async function tx(env,key){return env.DB.prepare(`SELECT metadata FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`).bind(key).first();}
async function replay(env,userId,row){const m=safe(row.metadata),p=Number(m.payout||0);if(p>0)await credit(env,userId,p,`CASINO_${m.game}_PAYOUT`,`casino:MORE_SLOT:${m.result?.slotId}:payout:${m.roundId}`,m);return {roundId:m.roundId,bet:Number(m.bet||0),payout:p,multiplier:Number(m.multiplier||0),result:m.result||{},balance:await getBalance(env,userId),duplicate:true,maxWin:Number(m.bet||0)*1000};}
function safe(v){try{return JSON.parse(v||"{}");}catch{return{};}}
