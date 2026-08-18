import {debit,credit,zeroLedger,getBalance} from "./db.js";

const MIN_BET=1000,MAX_BET=5_000_000,MAX_WIN_MULTIPLIER=1000;
const WILD="🃏",SCATTER="🌟";

export const ADVANCED_SLOT_CONFIGS={
  royal5:{
    id:"royal5",name:"ROYAL FRUITS",rows:3,cols:5,lineCount:20,volatility:"MEDIUM",
    symbols:["🍒","🍋","🍇","🔔","💎","7️⃣",WILD,SCATTER],
    weights:[28,24,19,13,8,4,2.4,1.0],bonusWeights:[23,21,17,12,8,4,12,3],
    scatterTrigger:3,bonusName:"STICKY PARTY",bonusSpins:7,
    paytable:{
      "🍒":{3:1.2,4:3,5:8},"🍋":{3:1.5,4:4,5:10},"🍇":{3:2,4:6,5:16},
      "🔔":{3:3,4:10,5:30},"💎":{3:5,4:18,5:60},"7️⃣":{3:10,4:40,5:150},
      [WILD]:{3:15,4:60,5:250}
    },
    scatterPays:{3:2,4:8,5:30,6:60},
    bonus:{type:"extra-spins",description:"7 фриспинов. Каждый новый WILD фиксируется до конца бонуса и добавляет +1 фриспин. Максимум 12 бонусных вращений."}
  },
  neon8:{
    id:"neon8",name:"NEON EMPIRE",rows:4,cols:8,lineCount:40,volatility:"HIGH",
    symbols:["⚡","💿","💎","👑","🔥","8️⃣",WILD,SCATTER],
    weights:[27,23,18,12,8,4.5,2.6,.8],bonusWeights:[21,18,15,11,8,4,16,2],
    scatterTrigger:4,bonusName:"WILD REACTOR",bonusSpins:6,
    paytable:{
      "⚡":{3:.7,4:1.2,5:2.5,6:5,7:10,8:20},"💿":{3:.8,4:1.5,5:3,6:7,7:14,8:30},
      "💎":{3:1.2,4:2.5,5:6,6:15,7:35,8:80},"👑":{3:1.8,4:4,5:10,6:25,7:60,8:140},
      "🔥":{3:2.5,4:6,5:15,6:40,7:100,8:250},"8️⃣":{3:4,4:10,5:30,6:80,7:220,8:600},
      [WILD]:{3:6,4:18,5:55,6:150,7:450,8:1200}
    },
    scatterPays:{4:3,5:10,6:30,7:80,8:200},
    bonus:{type:"reactor",description:"6 фриспинов. WILD остаются на поле. Каждый новый закреплённый WILD разгоняет общий множитель бонуса на +0.25× до 5×."}
  },
  vault5:{
    id:"vault5",name:"GOLDEN VAULT",rows:5,cols:5,lineCount:25,volatility:"VERY HIGH",
    symbols:["🪙","🏺","🐍","🦂","💎","👑",WILD,SCATTER],
    weights:[29,23,17,12,8,4,2.5,1.0],bonusWeights:[22,18,14,10,7,4,18,2],
    scatterTrigger:3,bonusName:"VAULT LOCK",bonusSpins:7,
    paytable:{
      "🪙":{3:1,4:3,5:10},"🏺":{3:1.4,4:5,5:16},"🐍":{3:2,4:7,5:24},
      "🦂":{3:3,4:12,5:45},"💎":{3:5,4:20,5:90},"👑":{3:9,4:40,5:220},
      [WILD]:{3:14,4:75,5:500}
    },
    scatterPays:{3:2,4:10,5:50,6:100},
    bonus:{type:"vault",description:"7 фриспинов. Все WILD липкие. Каждый 4-й закреплённый WILD открывает дополнительный GOLD LOCK: случайная клетка превращается в WILD и добавляется +1 фриспин."}
  }
};

for(const cfg of Object.values(ADVANCED_SLOT_CONFIGS))cfg.paylines=buildPaylines(cfg.rows,cfg.cols,cfg.lineCount);

export async function playAdvancedSlot(env,userId,slotId,bet,requestId){
  userId=String(userId);const cfg=ADVANCED_SLOT_CONFIGS[String(slotId||"")];if(!cfg)throw new Error("SLOT_NOT_FOUND");
  bet=validateBet(bet);requestId=String(requestId||crypto.randomUUID());
  const betKey=`casino:ADV_SLOT:${cfg.id}:bet:${userId}:${requestId}`;
  const existing=await getTransaction(env,betKey);if(existing)return replay(env,userId,existing);

  const roundId=crypto.randomUUID();
  const baseGrid=spinGrid(cfg,false,new Set());
  const base=evaluateAdvancedGrid(cfg,baseGrid,bet,1);
  const triggered=base.scatterCount>=cfg.scatterTrigger;
  const bonus=triggered?simulateBonus(cfg,bet,baseGrid):null;
  const rawPayout=base.payout+(bonus?.payout||0);
  const cap=Math.floor(bet*MAX_WIN_MULTIPLIER),payout=Math.min(cap,Math.max(0,rawPayout));
  const multiplier=round2(payout/bet);
  const result={
    slotId:cfg.id,name:cfg.name,rows:cfg.rows,cols:cfg.cols,lineCount:cfg.lineCount,
    grid:baseGrid,base:{...base,payout:Math.min(base.payout,payout)},bonus,
    bonusTriggered:triggered,payout,multiplier,capped:rawPayout>cap,maxWin:cap
  };
  const metadata={game:`ADV_SLOT_${cfg.id}`,roundId,bet,payout,multiplier,result};
  const d=await debit(env,userId,bet,`CASINO_ADV_SLOT_${cfg.id}_BET`,betKey,metadata);
  if(!d.applied){const tx=await getTransaction(env,betKey);if(tx)return replay(env,userId,tx);throw new Error("DUPLICATE_REQUEST");}
  let balance=d.balance;
  if(payout>0){const c=await credit(env,userId,payout,`CASINO_ADV_SLOT_${cfg.id}_PAYOUT`,`casino:ADV_SLOT:${cfg.id}:payout:${roundId}`,metadata);balance=c.balance;}
  else await zeroLedger(env,userId,`CASINO_ADV_SLOT_${cfg.id}_RESULT`,`casino:ADV_SLOT:${cfg.id}:result:${roundId}`,metadata);
  return {roundId,bet,payout,multiplier,result,balance,maxWin:cap};
}

export function evaluateAdvancedGrid(configOrId,grid,bet=10000,bonusMultiplier=1){
  const cfg=typeof configOrId==="string"?ADVANCED_SLOT_CONFIGS[configOrId]:configOrId;
  if(!cfg||!validGrid(cfg,grid))return {payout:0,multiplier:0,lines:[],scatterCount:0,scatterPayout:0};
  const lineBet=Number(bet)/cfg.lineCount,wins=[];let linePayout=0;
  for(let i=0;i<cfg.paylines.length;i++){
    const rows=cfg.paylines[i],cells=rows.map((row,col)=>grid[row][col]);
    if(cells[0]===SCATTER)continue;
    const base=cells.find(s=>s!==WILD&&s!==SCATTER)||(cells[0]===WILD?WILD:null);if(!base)continue;
    let count=0;for(const symbol of cells){if(symbol===WILD||symbol===base)count++;else break;}
    if(count<3)continue;
    const factor=lookupPay(cfg.paytable[base],count);if(factor<=0)continue;
    const amount=Math.floor(lineBet*factor*bonusMultiplier);linePayout+=amount;
    wins.push({line:i+1,symbol:base,count,factor,amount,rows});
  }
  const scatterCount=grid.flat().filter(s=>s===SCATTER).length;
  const scatterFactor=lookupPay(cfg.scatterPays,scatterCount);
  const scatterPayout=Math.floor(Number(bet)*scatterFactor*bonusMultiplier);
  const payout=linePayout+scatterPayout;
  return {payout,multiplier:round2(payout/Math.max(1,Number(bet))),lines:wins,scatterCount,scatterFactor,scatterPayout};
}

export function buildPaylines(rows,cols,count){
  rows=Math.max(1,Math.floor(rows));cols=Math.max(3,Math.floor(cols));count=Math.max(rows,Math.floor(count));
  const lines=[],seen=new Set();
  const add=line=>{const normalized=line.map(r=>Math.max(0,Math.min(rows-1,Math.floor(r))));const key=normalized.join("");if(!seen.has(key)){seen.add(key);lines.push(normalized);}};
  for(let r=0;r<rows;r++)add(Array(cols).fill(r));
  for(let amplitude=1;lines.length<count&&amplitude<=rows*4;amplitude++){
    for(let phase=0;phase<rows&&lines.length<count;phase++){
      add(Array.from({length:cols},(_,c)=>(phase+c*amplitude)%rows));
      add(Array.from({length:cols},(_,c)=>(phase-c*amplitude%rows+rows*20)%rows));
      add(Array.from({length:cols},(_,c)=>bounceRow(phase+c*amplitude,rows)));
      add(Array.from({length:cols},(_,c)=>bounceRow(phase-c*amplitude,rows)));
    }
  }
  let seed=1;while(lines.length<count){add(Array.from({length:cols},(_,c)=>{seed=(seed*1103515245+12345)>>>0;return(seed+c)%rows;}));}
  return lines.slice(0,count);
}

function simulateBonus(cfg,bet,triggerGrid){
  const sticky=new Set();triggerGrid.forEach((row,r)=>row.forEach((s,c)=>{if(s===WILD)sticky.add(key(r,c));}));
  let remaining=cfg.bonusSpins,spin=0,total=0,reactorMultiplier=1,lastVaultThreshold=Math.floor(sticky.size/4),awardedExtra=0;
  const frames=[];const maxFrames=15;
  while(remaining>0&&spin<maxFrames){
    remaining--;spin++;
    const before=new Set(sticky),grid=spinGrid(cfg,true,sticky),newSticky=[];
    grid.forEach((row,r)=>row.forEach((s,c)=>{const k=key(r,c);if(s===WILD&&!sticky.has(k)){sticky.add(k);newSticky.push([r,c]);}}));
    let addedSpins=0,bonusMultiplier=1,lockAdded=null;
    if(cfg.bonus.type==="extra-spins"&&newSticky.length){addedSpins=Math.min(newSticky.length,Math.max(0,maxFrames-spin-remaining));remaining+=addedSpins;}
    if(cfg.bonus.type==="reactor"){reactorMultiplier=Math.min(5,round2(1+sticky.size*.25));bonusMultiplier=reactorMultiplier;}
    if(cfg.bonus.type==="vault"){
      const threshold=Math.floor(sticky.size/4);
      if(threshold>lastVaultThreshold&&spin+remaining<maxFrames){
        const free=randomOpenCell(cfg,sticky);if(free){sticky.add(key(free[0],free[1]));grid[free[0]][free[1]]=WILD;lockAdded=free;remaining++;addedSpins++;awardedExtra++;}
        lastVaultThreshold=Math.floor(sticky.size/4);
      }
      bonusMultiplier=Math.min(4,1+Math.floor(sticky.size/6)*.5);
    }
    const evalResult=evaluateAdvancedGrid(cfg,grid,bet,bonusMultiplier);total+=evalResult.payout;
    frames.push({spin,grid,sticky:[...sticky].map(parseKey),newSticky,lockAdded,addedSpins,remaining,bonusMultiplier,payout:evalResult.payout,lines:evalResult.lines,scatterCount:evalResult.scatterCount});
    if(sticky.size===cfg.rows*cfg.cols)remaining=0;
    if(before.size===sticky.size&&cfg.bonus.type==="vault"&&awardedExtra>4)remaining=Math.min(remaining,1);
  }
  return {name:cfg.bonusName,type:cfg.bonus.type,initialSticky:triggerGrid.flatMap((row,r)=>row.map((s,c)=>s===WILD?[r,c]:null).filter(Boolean)),frames,payout:total,totalSpins:frames.length,finalSticky:frames.at(-1)?.sticky||[],finalMultiplier:frames.at(-1)?.bonusMultiplier||1};
}

function spinGrid(cfg,bonusMode,sticky){
  const weights=bonusMode?cfg.bonusWeights:cfg.weights;
  const grid=Array.from({length:cfg.rows},()=>Array(cfg.cols));
  for(let r=0;r<cfg.rows;r++)for(let c=0;c<cfg.cols;c++)grid[r][c]=sticky.has(key(r,c))?WILD:weightedPick(cfg.symbols,weights);
  return grid;
}
function randomOpenCell(cfg,sticky){const open=[];for(let r=0;r<cfg.rows;r++)for(let c=0;c<cfg.cols;c++)if(!sticky.has(key(r,c)))open.push([r,c]);return open.length?open[secureInt(open.length)]:null;}
function validGrid(cfg,grid){return Array.isArray(grid)&&grid.length===cfg.rows&&grid.every(row=>Array.isArray(row)&&row.length===cfg.cols);}
function lookupPay(table,count){if(!table)return 0;for(let n=Math.floor(count);n>=0;n--)if(table[n]!=null)return Number(table[n])||0;return 0;}
function bounceRow(value,rows){if(rows<=1)return 0;const period=(rows-1)*2,n=((value%period)+period)%period;return n<rows?n:period-n;}
function key(r,c){return `${r}:${c}`;}function parseKey(v){return v.split(":").map(Number);}
function validateBet(v){const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<MIN_BET)throw new Error("MIN_BET_1000");if(n>MAX_BET)throw new Error("MAX_BET_5M");return n;}
function weightedPick(values,weights){const scaled=weights.map(w=>Math.max(0,Math.round(Number(w||0)*100))),total=scaled.reduce((a,b)=>a+b,0);let roll=secureInt(Math.max(1,total));for(let i=0;i<values.length;i++){roll-=scaled[i];if(roll<0)return values[i];}return values.at(-1);}
function secureInt(max){max=Math.max(1,Math.floor(max));const ceiling=0x100000000,limit=ceiling-(ceiling%max),buf=new Uint32Array(1);do crypto.getRandomValues(buf);while(buf[0]>=limit);return buf[0]%max;}
function round2(v){return Math.floor(Number(v||0)*100)/100;}
function safeJson(v){try{return JSON.parse(v||"{}");}catch{return{};}}
async function getTransaction(env,key){return env.DB.prepare(`SELECT amount,metadata,balance_after FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`).bind(key).first();}
async function replay(env,userId,tx){const meta=safeJson(tx.metadata),payout=Number(meta.payout||0),payoutKey=`casino:ADV_SLOT:${meta.result?.slotId}:payout:${meta.roundId}`;if(payout>0)await credit(env,userId,payout,`CASINO_ADV_SLOT_${meta.result?.slotId}_PAYOUT`,payoutKey,meta);return {roundId:meta.roundId,bet:Number(meta.bet||0),payout,multiplier:Number(meta.multiplier||0),result:meta.result||{},balance:await getBalance(env,userId),duplicate:true,maxWin:Number(meta.bet||0)*MAX_WIN_MULTIPLIER};}
