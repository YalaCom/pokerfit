import { debit, credit, zeroLedger, getBalance } from "./db.js";

const MIN_BET=1000;
const MAX_BET=5_000_000;
const PAYOUTS={
  low:[5,2.2,1.5,1.15,1.02,0.92,0.86,0.92,1.02,1.15,1.5,2.2,5],
  medium:[16.7,5.6,2.8,1.7,1.1,0.72,0.5,0.72,1.1,1.7,2.8,5.6,16.7],
  high:[110,22,5.5,2.2,0.9,0.33,0.13,0.33,0.9,2.2,5.5,22,110]
};

export async function playBalancedPlinko(env,userId,bet,requestId,risk="medium"){
  userId=String(userId);bet=validateBet(bet);risk=String(risk||"medium").toLowerCase();
  if(!PAYOUTS[risk])throw new Error("BAD_PLINKO_RISK");
  requestId=String(requestId||crypto.randomUUID());
  const betKey=`casino:PLINKO:bet:${userId}:${requestId}`;
  const existing=await env.DB.prepare(`SELECT metadata FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`).bind(betKey).first();
  if(existing)return replay(env,userId,existing.metadata);

  const path=[];let slot=0;
  for(let i=0;i<12;i++){const right=secureInt(2)===1;path.push(right?1:0);if(right)slot++;}
  const multiplier=Number(PAYOUTS[risk][slot]);
  const payout=Math.max(0,Math.floor(bet*multiplier));
  const roundId=crypto.randomUUID();
  const result={risk,path,slot,multiplier,slots:PAYOUTS[risk]};
  const metadata={game:"PLINKO",roundId,bet,payout,multiplier,result};

  const d=await debit(env,userId,bet,"CASINO_PLINKO_BET",betKey,metadata);
  if(!d.applied){const old=await env.DB.prepare(`SELECT metadata FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`).bind(betKey).first();if(old)return replay(env,userId,old.metadata);throw new Error("DUPLICATE_REQUEST");}
  let balance=d.balance;
  if(payout>0){const c=await credit(env,userId,payout,"CASINO_PLINKO_PAYOUT",`casino:PLINKO:payout:${roundId}`,metadata);balance=c.balance;}
  else await zeroLedger(env,userId,"CASINO_PLINKO_RESULT",`casino:PLINKO:result:${roundId}`,metadata);
  return {roundId,bet,payout,multiplier,result,balance};
}

async function replay(env,userId,raw){
  const meta=safeJson(raw)||{};
  if(Number(meta.payout||0)>0)await credit(env,userId,Number(meta.payout),"CASINO_PLINKO_PAYOUT",`casino:PLINKO:payout:${meta.roundId}`,meta);
  return {roundId:meta.roundId,bet:Number(meta.bet||0),payout:Number(meta.payout||0),multiplier:Number(meta.multiplier||0),result:meta.result||{},balance:await getBalance(env,userId),duplicate:true};
}
function validateBet(v){const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<MIN_BET)throw new Error("MIN_BET_1000");if(n>MAX_BET)throw new Error("MAX_BET_5M");return n;}
function secureInt(max){const top=0x100000000,limit=top-(top%max),b=new Uint32Array(1);do crypto.getRandomValues(b);while(b[0]>=limit);return b[0]%max;}
function safeJson(v){try{return JSON.parse(v||"{}");}catch{return null;}}
