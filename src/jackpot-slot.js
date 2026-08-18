import {debit,credit,zeroLedger,getBalance} from "./db.js";
import {buildPaylines,evaluateAdvancedGrid} from "./advanced-slots.js";
import {getJackpotPool,claimWholeJackpot} from "./jackpot-bank.js";

const WILD="🃏",SCATTER="🌟",JACKPOT="💰";
const HIT_DENOMINATOR=250_000;
const BONUS_SPINS=6;
const MAX_BONUS_SPINS=12;
const CFG={
  id:"grandjackpot",name:"GRAND FORTUNE",rows:3,cols:5,lineCount:20,
  symbols:["🍒","🔔","💎","👑","7️⃣",WILD,SCATTER,JACKPOT],
  weights:[28,21,14,9,5,2.4,1.4,.2],
  bonusWeights:[21,17,12,8,4.5,9,2.2,4],
  scatterTrigger:3,
  paytable:{"🍒":{3:1.2,4:3,5:8},"🔔":{3:2,4:6,5:18},"💎":{3:4,4:15,5:60},"👑":{3:7,4:30,5:140},"7️⃣":{3:12,4:55,5:300},[WILD]:{3:18,4:90,5:600},[JACKPOT]:{3:20,4:100,5:750}},
  scatterPays:{3:2,4:8,5:30}
};
CFG.paylines=buildPaylines(CFG.rows,CFG.cols,CFG.lineCount);

export async function jackpotStatus(env){
  const status=await getJackpotPool(env);
  return {pool:status.pool,basePool:0,hitChance:`1:${HIT_DENOMINATOR}`,funding:"PLAYER_NET_LOSSES"};
}

export async function playJackpotSlot(env,userId,bet,requestId){
  userId=String(userId);bet=validateBet(bet);requestId=String(requestId||crypto.randomUUID());
  const betKey=`casino:JACKPOT:bet:${userId}:${requestId}`;
  const old=await tx(env,betKey);if(old)return replay(env,userId,old);

  const roundId=crypto.randomUUID(),grid=spinGrid(CFG.weights,new Set()),base=evaluateAdvancedGrid(CFG,grid,bet,1);
  const bonusTriggered=base.scatterCount>=CFG.scatterTrigger;
  const bonus=bonusTriggered?bonusRound(bet,grid):null;
  const normalPayout=Math.max(0,Number(base.payout||0)+Number(bonus?.payout||0));
  const poolBefore=(await getJackpotPool(env)).pool;
  const jackpotHit=poolBefore>0&&secureInt(HIT_DENOMINATOR)===0;
  const metadata={game:"JACKPOT",roundId,bet,grid,base,bonusTriggered,bonus,jackpotHit};
  const d=await debit(env,userId,bet,"CASINO_JACKPOT_BET",betKey,metadata);
  if(!d.applied){const existing=await tx(env,betKey);if(existing)return replay(env,userId,existing);throw new Error("DUPLICATE_REQUEST");}

  const jackpotPayout=jackpotHit?await claimWholeJackpot(env,userId,roundId):0;
  const payout=normalPayout+jackpotPayout;
  const multiplier=round2(payout/Math.max(1,bet));
  const result={grid,base,bonusTriggered,bonus,jackpotHit,jackpotPayout,normalPayout,multiplier};
  const settled={...metadata,result,payout,multiplier};
  await updateBetMetadata(env,betKey,settled);
  let balance=d.balance;
  if(payout>0){const c=await credit(env,userId,payout,"CASINO_JACKPOT_PAYOUT",`casino:JACKPOT:payout:${roundId}`,settled);balance=c.balance;}
  else await zeroLedger(env,userId,"CASINO_JACKPOT_RESULT",`casino:JACKPOT:result:${roundId}`,settled);
  const status=await jackpotStatus(env);
  return {roundId,bet,payout,multiplier,result,balance,pool:status.pool};
}

function bonusRound(bet,triggerGrid){
  const sticky=new Set();
  triggerGrid.forEach((row,r)=>row.forEach((symbol,c)=>{if(symbol===WILD)sticky.add(`${r}:${c}`);}));
  const initialSticky=[...sticky].map(parseKey);
  let remaining=BONUS_SPINS,spinNo=0,total=0,moneyCollected=0,extraAwarded=0;
  const frames=[];
  while(remaining>0&&spinNo<MAX_BONUS_SPINS){
    remaining--;spinNo++;
    const grid=spinGrid(CFG.bonusWeights,sticky),newSticky=[];
    grid.forEach((row,r)=>row.forEach((symbol,c)=>{
      const k=`${r}:${c}`;
      if(symbol===WILD&&!sticky.has(k)){sticky.add(k);newSticky.push([r,c]);}
    }));
    const moneyThisSpin=grid.flat().filter(x=>x===JACKPOT).length;
    moneyCollected+=moneyThisSpin;
    const earnedThreshold=Math.floor(moneyCollected/3);
    let addedSpins=Math.max(0,earnedThreshold-extraAwarded);
    if(spinNo+remaining+addedSpins>MAX_BONUS_SPINS)addedSpins=Math.max(0,MAX_BONUS_SPINS-spinNo-remaining);
    if(addedSpins>0){remaining+=addedSpins;extraAwarded+=addedSpins;}
    const bonusMultiplier=Math.min(5,round2(1+moneyCollected*.2));
    const evaluated=evaluateAdvancedGrid(CFG,grid,bet,bonusMultiplier);
    total+=evaluated.payout;
    frames.push({
      spin:spinNo,grid,sticky:[...sticky].map(parseKey),newSticky,remaining,addedSpins,
      moneyThisSpin,moneyCollected,bonusMultiplier,payout:evaluated.payout,lines:evaluated.lines,scatterCount:evaluated.scatterCount
    });
  }
  return {
    name:"FORTUNE VAULT",type:"fortune-vault",totalSpins:frames.length,payout:total,frames,initialSticky,
    finalSticky:frames.at(-1)?.sticky||initialSticky,moneyCollected,finalMultiplier:frames.at(-1)?.bonusMultiplier||1
  };
}

async function replay(env,userId,betTx){
  const meta=safeJson(betTx.metadata),roundId=meta.roundId;
  let result=meta.result||{};
  let jackpotPayout=Number(result.jackpotPayout||0);
  if(meta.jackpotHit&&!jackpotPayout)jackpotPayout=await claimWholeJackpot(env,userId,roundId);
  const normalPayout=Number(result.normalPayout??(Number(meta.base?.payout||0)+Number(meta.bonus?.payout||0)));
  const payout=Math.max(Number(meta.payout||0),normalPayout+jackpotPayout);
  const multiplier=round2(payout/Math.max(1,Number(meta.bet||1)));
  result={...result,grid:result.grid||meta.grid,base:result.base||meta.base,bonusTriggered:result.bonusTriggered??meta.bonusTriggered,bonus:result.bonus||meta.bonus,jackpotHit:result.jackpotHit??meta.jackpotHit,jackpotPayout,normalPayout,multiplier};
  if(payout>0)await credit(env,userId,payout,"CASINO_JACKPOT_PAYOUT",`casino:JACKPOT:payout:${roundId}`,{...meta,result,payout,multiplier});
  return {roundId,bet:Number(meta.bet||0),payout,multiplier,result,balance:await getBalance(env,userId),pool:(await jackpotStatus(env)).pool,duplicate:true};
}

async function updateBetMetadata(env,key,metadata){try{await env.DB.prepare(`UPDATE wallet_transactions SET metadata=?2 WHERE idempotency_key=?1`).bind(key,JSON.stringify(metadata)).run();}catch{}}
async function tx(env,key){return env.DB.prepare(`SELECT amount,metadata,balance_after FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`).bind(key).first();}
function spinGrid(weights,sticky){const grid=Array.from({length:CFG.rows},()=>Array(CFG.cols));for(let r=0;r<CFG.rows;r++)for(let c=0;c<CFG.cols;c++)grid[r][c]=sticky.has(`${r}:${c}`)?WILD:weightedPick(CFG.symbols,weights);return grid;}
function weightedPick(values,weights){const scaled=weights.map(w=>Math.max(0,Math.round(Number(w||0)*100))),total=scaled.reduce((a,b)=>a+b,0);let roll=secureInt(Math.max(1,total));for(let i=0;i<values.length;i++){roll-=scaled[i];if(roll<0)return values[i];}return values.at(-1);}
function secureInt(max){max=Math.max(1,Math.floor(max));const ceiling=0x100000000,limit=ceiling-(ceiling%max),buf=new Uint32Array(1);do crypto.getRandomValues(buf);while(buf[0]>=limit);return buf[0]%max;}
function parseKey(v){return String(v).split(":").map(Number);}
function validateBet(v){const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<1000)throw new Error("MIN_BET_1000");if(n>5_000_000)throw new Error("MAX_BET_5M");return n;}
function round2(v){return Math.floor(Number(v||0)*100)/100;}
function safeJson(v){try{return JSON.parse(v||"{}");}catch{return{};}}
