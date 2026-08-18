import {debit,credit,zeroLedger,getBalance} from "./db.js";
import {buildPaylines,evaluateAdvancedGrid} from "./advanced-slots.js";

const WILD="🃏",SCATTER="🌟",JACKPOT="💰";
const BASE_POOL=50_000_000;
const HIT_DENOMINATOR=250_000;
const CONTRIBUTION_RATE=0.005;
const CFG={
  id:"grandjackpot",name:"GRAND FORTUNE",rows:3,cols:5,lineCount:20,
  symbols:["🍒","🔔","💎","👑","7️⃣",WILD,SCATTER,JACKPOT],
  weights:[28,21,14,9,5,2.4,1.4,.2],
  paytable:{"🍒":{3:1.2,4:3,5:8},"🔔":{3:2,4:6,5:18},"💎":{3:4,4:15,5:60},"👑":{3:7,4:30,5:140},"7️⃣":{3:12,4:55,5:300},[WILD]:{3:18,4:90,5:600},[JACKPOT]:{3:20,4:100,5:750}},
  scatterPays:{3:2,4:8,5:30}
};
CFG.paylines=buildPaylines(CFG.rows,CFG.cols,CFG.lineCount);

export async function jackpotStatus(env){
  await ensurePool(env);
  const row=await env.DB.prepare(`SELECT balance,base_balance,updated_at FROM jackpot_pools WHERE id='grand'`).first();
  return {pool:Number(row?.balance||BASE_POOL),basePool:Number(row?.base_balance||BASE_POOL),hitChance:`1:${HIT_DENOMINATOR}`};
}

export async function playJackpotSlot(env,userId,bet,requestId){
  userId=String(userId);bet=validateBet(bet);requestId=String(requestId||crypto.randomUUID());await ensurePool(env);
  const betKey=`casino:JACKPOT:bet:${userId}:${requestId}`;
  const old=await tx(env,betKey);if(old)return replay(env,userId,old);

  const roundId=crypto.randomUUID(),grid=spinGrid(),base=evaluateAdvancedGrid(CFG,grid,bet,1);
  const contribution=Math.max(1,Math.floor(bet*CONTRIBUTION_RATE));
  const jackpotHit=secureInt(HIT_DENOMINATOR)===0;
  const metadata={game:"JACKPOT",roundId,bet,grid,base,contribution,jackpotHit};
  const d=await debit(env,userId,bet,"CASINO_JACKPOT_BET",betKey,metadata);
  if(!d.applied){const existing=await tx(env,betKey);if(existing)return replay(env,userId,existing);throw new Error("DUPLICATE_REQUEST");}

  await applyContribution(env,userId,roundId,contribution);
  let jackpotPayout=0;
  if(jackpotHit)jackpotPayout=await claimPool(env,userId,roundId);
  const normalPayout=Math.max(0,Number(base.payout||0));
  const payout=normalPayout+jackpotPayout;
  const result={grid,base,jackpotHit,jackpotPayout,normalPayout,poolContribution:contribution,multiplier:Math.floor((payout/Math.max(1,bet))*100)/100};
  const settled={...metadata,result,payout,multiplier:result.multiplier};
  await updateBetMetadata(env,betKey,settled);
  let balance=d.balance;
  if(payout>0){const c=await credit(env,userId,payout,"CASINO_JACKPOT_PAYOUT",`casino:JACKPOT:payout:${roundId}`,settled);balance=c.balance;}
  else await zeroLedger(env,userId,"CASINO_JACKPOT_RESULT",`casino:JACKPOT:result:${roundId}`,settled);
  const status=await jackpotStatus(env);
  return {roundId,bet,payout,multiplier:result.multiplier,result,balance,pool:status.pool};
}

async function applyContribution(env,userId,roundId,amount){
  const key=`jackpot:contribution:${roundId}`;
  try{
    const inserted=await env.DB.prepare(`INSERT INTO jackpot_events(request_key,telegram_id,type,amount,metadata) VALUES(?1,?2,'CONTRIBUTION',?3,?4) ON CONFLICT(request_key) DO NOTHING RETURNING id`).bind(key,userId,amount,JSON.stringify({roundId})).first();
    if(inserted)await env.DB.prepare(`UPDATE jackpot_pools SET balance=balance+?1,updated_at=CURRENT_TIMESTAMP WHERE id='grand'`).bind(amount).run();
  }catch(error){console.error("jackpot contribution",error);}
}

async function claimPool(env,userId,roundId){
  const key=`jackpot:claim:${roundId}`;
  const existing=await env.DB.prepare(`SELECT amount FROM jackpot_events WHERE request_key=?1 LIMIT 1`).bind(key).first();
  if(existing)return Number(existing.amount||0);
  const row=await env.DB.prepare(`SELECT balance,base_balance FROM jackpot_pools WHERE id='grand'`).first();
  const amount=Math.max(BASE_POOL,Number(row?.balance||BASE_POOL));
  const inserted=await env.DB.prepare(`INSERT INTO jackpot_events(request_key,telegram_id,type,amount,metadata) VALUES(?1,?2,'JACKPOT_WIN',?3,?4) ON CONFLICT(request_key) DO NOTHING RETURNING id`).bind(key,userId,amount,JSON.stringify({roundId})).first();
  if(!inserted){const old=await env.DB.prepare(`SELECT amount FROM jackpot_events WHERE request_key=?1`).bind(key).first();return Number(old?.amount||0);}
  await env.DB.prepare(`UPDATE jackpot_pools SET balance=base_balance,updated_at=CURRENT_TIMESTAMP WHERE id='grand'`).run();
  return amount;
}

async function replay(env,userId,betTx){
  const meta=safeJson(betTx.metadata),roundId=meta.roundId,payout=Number(meta.payout||0),result=meta.result||{};
  if(meta.contribution)await applyContribution(env,userId,roundId,Number(meta.contribution));
  let jackpotPayout=Number(result.jackpotPayout||0);
  if(meta.jackpotHit&&!jackpotPayout)jackpotPayout=await claimPool(env,userId,roundId);
  const total=Math.max(payout,Number(result.normalPayout||meta.base?.payout||0)+jackpotPayout);
  if(total>0)await credit(env,userId,total,"CASINO_JACKPOT_PAYOUT",`casino:JACKPOT:payout:${roundId}`,meta);
  return {roundId,bet:Number(meta.bet||0),payout:total,multiplier:Number(meta.multiplier||0),result:{...result,jackpotPayout},balance:await getBalance(env,userId),pool:(await jackpotStatus(env)).pool,duplicate:true};
}

async function updateBetMetadata(env,key,metadata){try{await env.DB.prepare(`UPDATE wallet_transactions SET metadata=?2 WHERE idempotency_key=?1`).bind(key,JSON.stringify(metadata)).run();}catch{}}
async function ensurePool(env){await env.DB.prepare(`INSERT OR IGNORE INTO jackpot_pools(id,balance,base_balance) VALUES('grand',?1,?1)`).bind(BASE_POOL).run();}
async function tx(env,key){return env.DB.prepare(`SELECT amount,metadata,balance_after FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`).bind(key).first();}
function spinGrid(){const grid=Array.from({length:CFG.rows},()=>Array(CFG.cols));for(let r=0;r<CFG.rows;r++)for(let c=0;c<CFG.cols;c++)grid[r][c]=weightedPick(CFG.symbols,CFG.weights);return grid;}
function weightedPick(values,weights){const scaled=weights.map(w=>Math.max(0,Math.round(Number(w||0)*100))),total=scaled.reduce((a,b)=>a+b,0);let roll=secureInt(Math.max(1,total));for(let i=0;i<values.length;i++){roll-=scaled[i];if(roll<0)return values[i];}return values.at(-1);}
function secureInt(max){max=Math.max(1,Math.floor(max));const ceiling=0x100000000,limit=ceiling-(ceiling%max),buf=new Uint32Array(1);do crypto.getRandomValues(buf);while(buf[0]>=limit);return buf[0]%max;}
function validateBet(v){const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<1000)throw new Error("MIN_BET_1000");if(n>5_000_000)throw new Error("MAX_BET_5M");return n;}
function safeJson(v){try{return JSON.parse(v||"{}");}catch{return{};}}
