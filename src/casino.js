import { debit, credit, zeroLedger, getBalance } from "./db.js";

const SLOT_SYMBOLS = ["🍒","🍋","🔔","⭐","💎","7️⃣"];
const SLOT_WEIGHTS = [34,26,18,12,7,3];
const MEGA_SYMBOLS = ["🍒","🍋","🔔","⭐","💎","7️⃣","🃏","🌟"];
const MEGA_WEIGHTS = [31,25,18,12,7,3,2.5,1.5];
const WHEEL_SEGMENTS = [
  {label:"0×",multiplier:0,weight:28},{label:"0.5×",multiplier:0.5,weight:18},
  {label:"1×",multiplier:1,weight:22},{label:"1.5×",multiplier:1.5,weight:13},
  {label:"2×",multiplier:2,weight:9},{label:"3×",multiplier:3,weight:5},
  {label:"5×",multiplier:5,weight:3},{label:"10×",multiplier:10,weight:2},
];
const PAYLINES = [
  [0,0,0,0,0,0],[1,1,1,1,1,1],[2,2,2,2,2,2],
  [0,1,2,1,0,1],[2,1,0,1,2,1],[0,0,1,2,2,1],[2,2,1,0,0,1],
  [1,0,0,0,1,2],[1,2,2,2,1,0],[0,1,1,1,0,0],[2,1,1,1,2,2],
  [0,1,0,1,0,1],[2,1,2,1,2,1],[1,0,1,2,1,0],[1,2,1,0,1,2],
  [0,2,0,2,0,2],[2,0,2,0,2,0],[0,1,2,2,1,0],[2,1,0,0,1,2],[1,1,0,1,2,1]
];
const PAYTABLE = {
  "🍒":{3:1,4:2,5:5,6:12},"🍋":{3:1.2,4:3,5:8,6:20},"🔔":{3:2,4:5,5:12,6:35},
  "⭐":{3:3,4:8,5:20,6:60},"💎":{3:5,4:15,5:40,6:120},"7️⃣":{3:10,4:30,5:80,6:250},
  "🃏":{3:15,4:50,5:150,6:500}
};
const PLINKO = {
  low:[0.6,0.8,1,1.2,1.5,2,4,2,1.5,1.2,1,0.8,0.6],
  medium:[0.2,0.5,0.8,1,1.5,3,9,3,1.5,1,0.8,0.5,0.2],
  high:[0,0.2,0.4,0.7,1.2,4,25,4,1.2,0.7,0.4,0.2,0]
};
const MIN_BET = 1000;
const MAX_BET = 5_000_000;
const CRASH_TOKEN_TTL = 5 * 60 * 1000;

export async function playSlots(env,userId,bet,requestId){
  return settleInstantRound(env,userId,"SLOTS",bet,requestId,()=>{
    const reels=[weightedPick(SLOT_SYMBOLS,SLOT_WEIGHTS),weightedPick(SLOT_SYMBOLS,SLOT_WEIGHTS),weightedPick(SLOT_SYMBOLS,SLOT_WEIGHTS)];
    const multiplier=slotMultiplier(reels);
    return {result:{reels,multiplier},multiplier};
  });
}

export async function playMegaSlots(env,userId,bet,requestId){
  return settleInstantRound(env,userId,"MEGA_SLOTS",bet,requestId,()=>{
    const grid=Array.from({length:3},()=>Array(6).fill(null));
    for(let col=0;col<6;col++)for(let row=0;row<3;row++)grid[row][col]=weightedPick(MEGA_SYMBOLS,MEGA_WEIGHTS);
    const payout=megaSlotPayout(grid,Number(bet));
    return {result:{grid,lines:payout.lines,scatterCount:payout.scatterCount,scatterMultiplier:payout.scatterMultiplier,totalMultiplier:payout.multiplier,paylines:PAYLINES.length},multiplier:payout.multiplier};
  });
}

export async function playCoinflip(env,userId,bet,requestId,choice="heads"){
  choice=String(choice||"heads").toLowerCase();
  if(!["heads","tails"].includes(choice))throw new Error("BAD_COIN_CHOICE");
  return settleInstantRound(env,userId,"COINFLIP",bet,requestId,()=>{
    const result=secureInt(2)===0?"heads":"tails",win=result===choice,multiplier=win?1.94:0;
    return {result:{choice,result,win,multiplier},multiplier};
  });
}

export async function playPlinko(env,userId,bet,requestId,risk="medium"){
  risk=String(risk||"medium").toLowerCase();if(!PLINKO[risk])throw new Error("BAD_PLINKO_RISK");
  return settleInstantRound(env,userId,"PLINKO",bet,requestId,()=>{
    const path=[];let slot=0;for(let i=0;i<12;i++){const right=secureInt(2)===1;path.push(right?1:0);if(right)slot++;}
    const multiplier=PLINKO[risk][slot];
    return {result:{risk,path,slot,multiplier,slots:PLINKO[risk]},multiplier};
  });
}

export async function playBaccarat(env,userId,bet,requestId,choice="player"){
  choice=String(choice||"player").toLowerCase();if(!["player","banker","tie"].includes(choice))throw new Error("BAD_BACCARAT_CHOICE");
  return settleInstantRound(env,userId,"BACCARAT",bet,requestId,()=>{
    const round=baccaratRound();
    const multiplier=round.winner===choice?(choice==="tie"?9:choice==="banker"?1.95:2):0;
    return {result:{...round,choice,multiplier},multiplier};
  });
}

export async function playWheel(env,userId,bet,requestId){
  return settleInstantRound(env,userId,"WHEEL",bet,requestId,()=>{
    const picked=weightedPick(WHEEL_SEGMENTS,WHEEL_SEGMENTS.map(x=>x.weight));
    const index=WHEEL_SEGMENTS.indexOf(picked);
    return {result:{index,label:picked.label,multiplier:picked.multiplier},multiplier:picked.multiplier};
  });
}

export async function playDice(env,userId,bet,requestId,choice="under",target=50){
  choice=String(choice||"under").toLowerCase();target=Math.floor(Number(target));
  if(!["under","over"].includes(choice))throw new Error("BAD_DICE_CHOICE");
  if(target<10||target>90)throw new Error("DICE_TARGET_10_90");
  return settleInstantRound(env,userId,"DICE",bet,requestId,()=>{
    const roll=secureInt(100)+1,probability=choice==="under"?(target-1)/100:(100-target)/100;
    const shownMultiplier=round2(Math.min(50,0.97/probability)),win=choice==="under"?roll<target:roll>target;
    return {result:{roll,choice,target,win,multiplier:win?shownMultiplier:0,shownMultiplier},multiplier:win?shownMultiplier:0};
  });
}

export async function startCrash(env,userId,bet,requestId){
  userId=String(userId);bet=validateBet(bet);requestId=String(requestId||crypto.randomUUID());
  const betKey=`casino:CRASH:bet:${userId}:${requestId}`,old=await getTransaction(env,betKey);
  if(old){const meta=safeJson(old.metadata)||{};if(!meta.token)throw new Error("CRASH_RETRY_UNAVAILABLE");return {game:meta.publicGame,balance:await getBalance(env,userId),duplicate:true};}
  const roundId=crypto.randomUUID(),crashAt=crashPointFromUnit(randomUnit()),startAt=Date.now();
  const secret={v:1,roundId,userId,bet,crashAt,startAt,exp:startAt+CRASH_TOKEN_TTL};
  const token=await sealCrash(secret,env.TELEGRAM_BOT_TOKEN),publicGame={token,roundId,bet,startAt,commit:await crashCommit(roundId,crashAt),minMultiplier:1};
  const d=await debit(env,userId,bet,"CASINO_CRASH_BET",betKey,{game:"CRASH",roundId,token,publicGame});
  if(!d.applied)return {game:publicGame,balance:await getBalance(env,userId),duplicate:true};
  return {game:publicGame,balance:d.balance};
}

export async function crashStatus(env,userId,token){
  const game=await openCrash(token,env.TELEGRAM_BOT_TOKEN,String(userId));
  const elapsed=Math.max(0,Date.now()-game.startAt),current=multiplierAtMs(elapsed),crashed=current>=game.crashAt;
  if(crashed)await zeroLedger(env,userId,"CASINO_CRASH_RESULT",`casino:CRASH:result:${game.roundId}`,{game:"CRASH",roundId:game.roundId,result:"crash",crashAt:game.crashAt});
  return {roundId:game.roundId,crashed,multiplier:crashed?game.crashAt:round2(current),crashAt:crashed?game.crashAt:null,reveal:crashed?{crashAt:game.crashAt}:null};
}

export async function crashCashout(env,userId,token,actionId){
  userId=String(userId);const game=await openCrash(token,env.TELEGRAM_BOT_TOKEN,userId),payoutKey=`casino:CRASH:payout:${game.roundId}`;
  const oldPayout=await getTransaction(env,payoutKey);
  if(oldPayout){const meta=safeJson(oldPayout.metadata)||{};return {won:true,cashoutMultiplier:Number(meta.cashoutMultiplier||1),payout:Number(oldPayout.amount||0),balance:await getBalance(env,userId),duplicate:true};}
  const current=multiplierAtMs(Math.max(0,Date.now()-game.startAt));
  if(current>=game.crashAt){await zeroLedger(env,userId,"CASINO_CRASH_RESULT",`casino:CRASH:result:${game.roundId}`,{game:"CRASH",roundId:game.roundId,result:"crash",crashAt:game.crashAt,actionId:String(actionId||"")});return {won:false,crashed:true,crashAt:game.crashAt,multiplier:game.crashAt,balance:await getBalance(env,userId)};}
  const cashoutMultiplier=round2(Math.max(1,current)),payout=Math.max(1,Math.floor(game.bet*cashoutMultiplier));
  const c=await credit(env,userId,payout,"CASINO_CRASH_PAYOUT",payoutKey,{game:"CRASH",roundId:game.roundId,cashoutMultiplier,actionId:String(actionId||"")});
  await zeroLedger(env,userId,"CASINO_CRASH_RESULT",`casino:CRASH:result:${game.roundId}`,{game:"CRASH",roundId:game.roundId,result:"cashout",cashoutMultiplier,payout});
  return {won:true,cashoutMultiplier,payout,balance:c.balance};
}

async function settleInstantRound(env,userId,game,bet,requestId,outcomeFactory){
  userId=String(userId);bet=validateBet(bet);requestId=String(requestId||crypto.randomUUID());
  const betKey=`casino:${game}:bet:${userId}:${requestId}`,existing=await getTransaction(env,betKey);
  if(existing)return replayInstantRound(env,userId,existing);
  const roundId=crypto.randomUUID(),outcome=outcomeFactory(),multiplier=Math.max(0,Number(outcome.multiplier||0)),payout=Math.max(0,Math.floor(bet*multiplier));
  const metadata={game,roundId,bet,payout,multiplier,result:outcome.result};
  const d=await debit(env,userId,bet,`CASINO_${game}_BET`,betKey,metadata);
  if(!d.applied){const tx=await getTransaction(env,betKey);if(tx)return replayInstantRound(env,userId,tx);throw new Error("DUPLICATE_REQUEST");}
  let balance=d.balance;
  if(payout>0){const c=await credit(env,userId,payout,`CASINO_${game}_PAYOUT`,`casino:${game}:payout:${roundId}`,metadata);balance=c.balance;}
  else await zeroLedger(env,userId,`CASINO_${game}_RESULT`,`casino:${game}:result:${roundId}`,metadata);
  return {roundId,bet,payout,multiplier,result:outcome.result,balance};
}

async function replayInstantRound(env,userId,tx){
  const meta=safeJson(tx.metadata)||{},payoutKey=`casino:${meta.game}:payout:${meta.roundId}`;
  if(Number(meta.payout||0)>0)await credit(env,userId,Number(meta.payout),`CASINO_${meta.game}_PAYOUT`,payoutKey,meta);
  return {roundId:meta.roundId,bet:Number(meta.bet||0),payout:Number(meta.payout||0),multiplier:Number(meta.multiplier||0),result:meta.result||{},balance:await getBalance(env,userId),duplicate:true};
}

async function getTransaction(env,key){return env.DB.prepare(`SELECT amount,metadata,balance_after FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`).bind(key).first();}

export function slotMultiplier(reels){
  if(!Array.isArray(reels)||reels.length!==3)return 0;
  if(reels[0]===reels[1]&&reels[1]===reels[2])return ({"7️⃣":25,"💎":15,"⭐":8,"🔔":6,"🍒":5,"🍋":4})[reels[0]]||3;
  if(reels.filter(x=>x==="🍒").length>=2)return 1.8;if(reels[0]===reels[1]||reels[1]===reels[2]||reels[0]===reels[2])return 1.2;return 0;
}

export function megaSlotPayout(grid,bet=10000){
  if(!Array.isArray(grid)||grid.length!==3||grid.some(r=>!Array.isArray(r)||r.length!==6))return {multiplier:0,lines:[],scatterCount:0,scatterMultiplier:0};
  const lineBet=Math.max(1,Number(bet)/PAYLINES.length),wins=[];let linePayout=0;
  for(let lineIndex=0;lineIndex<PAYLINES.length;lineIndex++){
    const cells=PAYLINES[lineIndex].map((row,col)=>grid[row][col]);
    const base=cells.find(s=>s!=="🃏"&&s!=="🌟")||"🃏";if(base==="🌟")continue;
    let count=0;for(const s of cells){if(s===base||s==="🃏")count++;else break;}
    if(count>=3){const factor=PAYTABLE[base]?.[count]||PAYTABLE["🃏"]?.[count]||0;if(factor>0){const amount=Math.floor(lineBet*factor);linePayout+=amount;wins.push({line:lineIndex+1,symbol:base,count,factor,amount,rows:PAYLINES[lineIndex]});}}
  }
  const scatterCount=grid.flat().filter(s=>s==="🌟").length;
  const scatterMultiplier=scatterCount>=6?100:scatterCount===5?25:scatterCount===4?8:scatterCount===3?2:0;
  const total=linePayout+Math.floor(Number(bet)*scatterMultiplier),multiplier=round2(total/Math.max(1,Number(bet)));
  return {multiplier,lines:wins,scatterCount,scatterMultiplier};
}

export function baccaratRound(){
  const deck=shuffle(makeCasinoDeck(6)),player=[deck.pop(),deck.pop()],banker=[deck.pop(),deck.pop()];
  let p=baccaratValue(player),b=baccaratValue(banker);let playerThird=null;
  if(p<8&&b<8){if(p<=5){playerThird=deck.pop();player.push(playerThird);p=baccaratValue(player);}if(playerThird){const t=baccaratCardValue(playerThird);if(shouldBankerDraw(b,t)){banker.push(deck.pop());b=baccaratValue(banker);}}else if(b<=5){banker.push(deck.pop());b=baccaratValue(banker);}}
  const winner=p>b?"player":b>p?"banker":"tie";
  return {player,banker,playerValue:p,bankerValue:b,winner};
}

function makeCasinoDeck(copies){const suits=["S","H","D","C"],ranks=["A","2","3","4","5","6","7","8","9","10","J","Q","K"],deck=[];for(let n=0;n<copies;n++)for(const suit of suits)for(const rank of ranks)deck.push({rank,suit});return deck;}
function baccaratCardValue(c){if(c.rank==="A")return 1;if(["10","J","Q","K"].includes(c.rank))return 0;return Number(c.rank);}
function baccaratValue(cards){return cards.reduce((s,c)=>s+baccaratCardValue(c),0)%10;}
function shouldBankerDraw(b,t){if(b<=2)return true;if(b===3)return t!==8;if(b===4)return t>=2&&t<=7;if(b===5)return t>=4&&t<=7;if(b===6)return t===6||t===7;return false;}
function shuffle(deck){for(let i=deck.length-1;i>0;i--){const j=secureInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}

export function crashPointFromUnit(unit){unit=Math.max(0,Math.min(0.999999999,Number(unit)||0));if(unit<0.02)return 1;const normalized=(unit-0.02)/0.98;return round2(Math.min(100,Math.max(1.01,0.98/(1-normalized))));}
export function multiplierAtMs(ms){ms=Math.max(0,Number(ms)||0);return Math.max(1,Math.exp(ms/10000));}
function validateBet(bet){bet=Math.floor(Number(bet));if(!Number.isFinite(bet)||bet<MIN_BET)throw new Error("MIN_BET_1000");if(bet>MAX_BET)throw new Error("MAX_BET_5M");return bet;}
function weightedPick(values,weights){const total=Math.max(1,Math.round(weights.reduce((a,b)=>a+Math.max(0,Number(b)||0),0)*10));let roll=secureInt(total);for(let i=0;i<values.length;i++){roll-=Math.round(Math.max(0,Number(weights[i])||0)*10);if(roll<0)return values[i];}return values.at(-1);}
function secureInt(maxExclusive){maxExclusive=Math.max(1,Math.floor(maxExclusive));const max=0x100000000,limit=max-(max%maxExclusive),buf=new Uint32Array(1);do crypto.getRandomValues(buf);while(buf[0]>=limit);return buf[0]%maxExclusive;}
function randomUnit(){const b=new Uint32Array(1);crypto.getRandomValues(b);return b[0]/0x100000000;}
function round2(n){return Math.floor(Number(n)*100)/100;}
function safeJson(v){try{return JSON.parse(v||"{}");}catch{return null;}}
async function crashCommit(roundId,crashAt){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${roundId}:${crashAt}`));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function crashKey(token){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`FIT_CRASH_STATE:${token}`));return crypto.subtle.importKey("raw",digest,{name:"AES-GCM"},false,["encrypt","decrypt"]);}
async function sealCrash(game,token){const key=await crashKey(token),iv=crypto.getRandomValues(new Uint8Array(12)),data=new TextEncoder().encode(JSON.stringify(game));const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,data));return `${b64(iv)}.${b64(encrypted)}`;}
async function openCrash(token,botToken,userId){try{const [a,b]=String(token||"").split("."),key=await crashKey(botToken);const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(a)},key,unb64(b));const game=JSON.parse(new TextDecoder().decode(plain));if(String(game.userId)!==String(userId)||Date.now()>Number(game.exp))throw new Error();return game;}catch{throw new Error("INVALID_CRASH_STATE");}}
function b64(bytes){let s="";for(const x of bytes)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function unb64(s){s=String(s||"").replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const b=atob(s),o=new Uint8Array(b.length);for(let i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o;}
