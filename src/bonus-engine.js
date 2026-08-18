import {credit,debit,zeroLedger,getBalance} from "./db.js";
import {ADVANCED_SLOT_CONFIGS,buildPaylines,evaluateAdvancedGrid} from "./advanced-slots.js";
import {MORE_SLOT_CONFIGS} from "./more-slots.js";
import {recordSlotRound} from "./slot-economy.js";

const WILD="🃏",SCATTER="🌟",MONEY="💰";
const MIN_BET=1000,MAX_BET=5_000_000,MAX_WIN_MULTIPLIER=1000;

const BUY_TIERS={
  standard:{id:"standard",label:"FREE SPINS",costMultiplier:60,extraSpins:0,initialWilds:0,wildBoost:1},
  premium:{id:"premium",label:"WILD BOOST",costMultiplier:100,extraSpins:2,initialWilds:1,wildBoost:1.35},
  super:{id:"super",label:"SUPER MULTI",costMultiplier:180,extraSpins:4,initialWilds:2,wildBoost:1.75}
};

const NATURAL_CHANCE={
  royal5:90,neon8:120,vault5:105,moon5:95,dragon6:125,grandjackpot:115
};

const GRAND_CFG={
  id:"grandjackpot",name:"GRAND FORTUNE",rows:3,cols:5,lineCount:20,
  symbols:["🍒","🔔","💎","👑","7️⃣",WILD,SCATTER,MONEY],
  bonusWeights:[21,17,12,8,4.5,9,2.4,4],
  scatterTrigger:3,bonusSpins:6,
  paytable:{"🍒":{3:1.2,4:3,5:8},"🔔":{3:2,4:6,5:18},"💎":{3:4,4:15,5:60},"👑":{3:7,4:30,5:140},"7️⃣":{3:12,4:55,5:300},[WILD]:{3:18,4:90,5:600},[MONEY]:{3:20,4:100,5:750}},
  scatterPays:{3:2,4:8,5:30}
};
GRAND_CFG.paylines=buildPaylines(GRAND_CFG.rows,GRAND_CFG.cols,GRAND_CFG.lineCount);

export function bonusBuyOptions(slotId,bet){
  const cfg=featureConfig(slotId);if(!cfg)return [];
  bet=validateBet(bet);
  return Object.values(BUY_TIERS).map(t=>({...t,cost:Math.floor(bet*t.costMultiplier)}));
}

export function maybeInjectNaturalBonus(slotId,result,bet){
  slotId=String(slotId||"");const cfg=featureConfig(slotId);
  if(!cfg||result?.bonusTriggered||result?.bonus)return result;
  const denom=NATURAL_CHANCE[slotId]||120;
  if(secureInt(denom)!==0)return result;
  const feature=createFeature(slotId,bet,"standard",{natural:true});
  const out=clone(result||{});
  out.grid=forceScatters(out.grid,cfg,cfg.scatterTrigger||3);
  out.bonusTriggered=true;
  out.bonus=feature.bonus;
  out.syntheticBonusPayout=feature.payout;
  out.naturalBonus=true;
  return out;
}

export function decorateMultiplierWilds(slotId,result){
  const out=clone(result||{});let extra=0;
  if(Array.isArray(out.grid)){
    const promoted=promoteGrid(out.grid,false,new Map());
    out.grid=promoted.grid;
    if(out.base?.lines){const adj=applyLineMultipliers(out.base.lines,out.grid);out.base.lines=adj.lines;out.base.payout=Math.max(0,Number(out.base.payout||0)+adj.extra);extra+=adj.extra;}
    else if(Array.isArray(out.lines)){const adj=applyLineMultipliers(out.lines,out.grid);out.lines=adj.lines;extra+=adj.extra;}
  }
  if(out.bonus?.frames?.length){
    const stickyMult=new Map();
    for(const frame of out.bonus.frames){
      if(!Array.isArray(frame.grid))continue;
      const promoted=promoteGrid(frame.grid,true,stickyMult,frame.sticky||[]);
      frame.grid=promoted.grid;
      const adj=applyLineMultipliers(frame.lines||[],frame.grid);
      frame.lines=adj.lines;frame.payout=Math.max(0,Number(frame.payout||0)+adj.extra);
      extra+=adj.extra;
    }
    out.bonus.payout=(out.bonus.frames||[]).reduce((s,f)=>s+Math.max(0,Number(f.payout||0)),0);
  }
  out.multiplierWildExtra=extra;
  return out;
}

export async function playBonusBuy(env,userId,slotId,bet,tierId,requestId){
  userId=String(userId);slotId=String(slotId||"");bet=validateBet(bet);
  const cfg=featureConfig(slotId);if(!cfg)throw new Error("BONUS_BUY_NOT_AVAILABLE");
  const tier=BUY_TIERS[String(tierId||"standard")];if(!tier)throw new Error("BAD_BONUS_TIER");
  requestId=String(requestId||crypto.randomUUID());
  const key=`casino:BONUS_BUY:${slotId}:${userId}:${requestId}`;
  const old=await tx(env,key);if(old)return replay(env,userId,old);

  const cost=Math.floor(bet*tier.costMultiplier),roundId=crypto.randomUUID();
  const feature=createFeature(slotId,bet,tier.id,{natural:false});
  const strength=pickPurchaseStrength(tier.id);
  const cap=Math.floor(bet*strength.capMultiplier);
  const rawPayout=Math.max(0,Math.floor(feature.payout));
  const payout=Math.min(bet*MAX_WIN_MULTIPLIER,rawPayout,cap);
  scaleFeatureTo(feature.bonus,payout);
  const metadata={game:`BONUS_BUY_${slotId}`,slotId,roundId,bet,cost,tier:tier.id,payout,rawPayout,strength,result:{bonusTriggered:true,purchasedBonus:true,bonus:feature.bonus,slotId}};
  const d=await debit(env,userId,cost,`CASINO_BONUS_BUY_${slotId}`,key,metadata);
  if(!d.applied){const existing=await tx(env,key);if(existing)return replay(env,userId,existing);throw new Error("DUPLICATE_REQUEST");}
  let balance=d.balance;
  if(payout>0){const c=await credit(env,userId,payout,`CASINO_BONUS_BUY_${slotId}_PAYOUT`,`casino:BONUS_BUY:${slotId}:payout:${roundId}`,metadata);balance=c.balance;}
  else await zeroLedger(env,userId,`CASINO_BONUS_BUY_${slotId}_RESULT`,`casino:BONUS_BUY:${slotId}:result:${roundId}`,metadata);
  await recordSlotRound(env,slotId,userId,roundId,cost,payout);
  return {roundId,slotId,bet,cost,tier:tier.id,payout,multiplier:round2(payout/Math.max(1,bet)),balance,maxWin:bet*MAX_WIN_MULTIPLIER,result:metadata.result};
}

function createFeature(slotId,bet,tierId,{natural=false}={}){
  const cfg=featureConfig(slotId),tier=BUY_TIERS[tierId]||BUY_TIERS.standard;
  if(!cfg)throw new Error("BONUS_BUY_NOT_AVAILABLE");
  const sticky=new Map();
  const initialCount=natural?0:tier.initialWilds;
  for(let i=0;i<initialCount;i++){const pos=randomOpen(cfg,sticky);if(pos)sticky.set(key(...pos),pickWildMultiplier(true,tier.wildBoost));}

  let remaining=Math.min(14,Number(cfg.bonusSpins||6)+tier.extraSpins),spinNo=0,total=0,reactor=1,moneyCount=0,lastVault=Math.floor(sticky.size/4);
  const frames=[],maxFrames=tierId==="super"?16:14;
  while(remaining>0&&spinNo<maxFrames){
    remaining--;spinNo++;
    const baseGrid=spinGrid(cfg,sticky),newSticky=[];
    for(let r=0;r<cfg.rows;r++)for(let c=0;c<cfg.cols;c++){
      if(baseGrid[r][c]===WILD&&!sticky.has(key(r,c))){
        const mult=pickWildMultiplier(true,tier.wildBoost);
        sticky.set(key(r,c),mult);newSticky.push([r,c,mult]);
      }
    }

    let addedSpins=0,globalMultiplier=1,lockAdded=null;
    if(slotId==="royal5"&&newSticky.length){addedSpins=Math.min(newSticky.length,Math.max(0,maxFrames-spinNo-remaining));remaining+=addedSpins;}
    if(slotId==="neon8"){reactor=Math.min(5,round2(1+sticky.size*.18+sumStickyBoost(sticky)*.03));globalMultiplier=reactor;}
    if(slotId==="vault5"){
      const threshold=Math.floor(sticky.size/4);
      if(threshold>lastVault&&spinNo+remaining<maxFrames){const pos=randomOpen(cfg,sticky);if(pos){const mult=pickWildMultiplier(true,tier.wildBoost);sticky.set(key(...pos),mult);baseGrid[pos[0]][pos[1]]=WILD;lockAdded=[...pos,mult];remaining++;addedSpins++;}lastVault=Math.floor(sticky.size/4);}
      globalMultiplier=Math.min(4,1+Math.floor(sticky.size/6)*.5);
    }
    if(slotId==="moon5")globalMultiplier=Math.min(4,round2(1+(spinNo-1)*.35));
    if(slotId==="dragon6"&&newSticky.length){addedSpins=Math.min(newSticky.length,Math.max(0,maxFrames-spinNo-remaining));remaining+=addedSpins;}
    if(slotId==="grandjackpot"){
      const m=baseGrid.flat().filter(x=>x===MONEY).length;moneyCount+=m;
      const earned=Math.floor(moneyCount/3),already=frames.reduce((s,f)=>s+Number(f.moneyExtraSpin||0),0);
      if(earned>already&&spinNo+remaining<maxFrames){remaining++;addedSpins++;}
      globalMultiplier=Math.min(5,round2(1+moneyCount*.2));
    }

    const evaluated=evaluateAdvancedGrid(cfg,baseGrid,bet,globalMultiplier);
    const display=displayGrid(baseGrid,sticky);
    const adjusted=applyLineMultipliers(evaluated.lines||[],display);
    const framePayout=Math.max(0,Number(evaluated.payout||0)+adjusted.extra);
    total+=framePayout;
    frames.push({spin:spinNo,grid:display,sticky:[...sticky.entries()].map(([k,m])=>[...parseKey(k),m]),newSticky,lockAdded,addedSpins,remaining,bonusMultiplier:globalMultiplier,payout:framePayout,lines:adjusted.lines,scatterCount:evaluated.scatterCount,moneyCollected:moneyCount,moneyExtraSpin:slotId==="grandjackpot"&&addedSpins?1:0});
  }
  const bonus={name:bonusName(slotId),type:slotId,initialSticky:[],frames,payout:total,totalSpins:frames.length,finalSticky:frames.at(-1)?.sticky||[],purchased:!natural};
  return {bonus,payout:total};
}

function featureConfig(slotId){
  return ADVANCED_SLOT_CONFIGS[slotId]||MORE_SLOT_CONFIGS[slotId]||(slotId==="grandjackpot"?GRAND_CFG:null);
}

function bonusName(id){
  return ({royal5:"STICKY PARTY",neon8:"WILD REACTOR",vault5:"VAULT LOCK",moon5:"MOON ASCENSION",dragon6:"DRAGON RESPINS",grandjackpot:"FORTUNE VAULT"})[id]||"FREE SPINS";
}

function spinGrid(cfg,sticky){
  const weights=cfg.bonusWeights||cfg.weights,symbols=cfg.symbols;
  const grid=Array.from({length:cfg.rows},()=>Array(cfg.cols));
  for(let r=0;r<cfg.rows;r++)for(let c=0;c<cfg.cols;c++){
    const k=key(r,c);grid[r][c]=sticky.has(k)?WILD:weightedPick(symbols,weights);
  }
  return grid;
}

function promoteGrid(grid,bonusMode,stickyMap,stickyPositions=[]){
  const out=clone(grid),stickySet=new Set((stickyPositions||[]).map(p=>`${p[0]}:${p[1]}`));
  for(let r=0;r<out.length;r++)for(let c=0;c<out[r].length;c++){
    const k=key(r,c);
    if(stickyMap.has(k)){out[r][c]=wildLabel(stickyMap.get(k));continue;}
    if(out[r][c]!==WILD)continue;
    const mult=pickWildMultiplier(bonusMode,1);
    if(mult>1)out[r][c]=wildLabel(mult);
    if(bonusMode&&(stickySet.has(k)||stickyPositions.length===0)&&mult>1)stickyMap.set(k,mult);
  }
  return {grid:out};
}

function displayGrid(grid,sticky){
  return grid.map((row,r)=>row.map((symbol,c)=>symbol===WILD&&sticky.has(key(r,c))?wildLabel(sticky.get(key(r,c))):symbol));
}

function pickWildMultiplier(bonusMode,boost=1){
  const roll=secureInt(100000);
  const x10=Math.min(4000,Math.floor((bonusMode?1800:350)*boost));
  const x5=x10+Math.min(12000,Math.floor((bonusMode?8000:2200)*boost));
  const x2=x5+Math.min(40000,Math.floor((bonusMode?26000:10000)*boost));
  if(roll<x10)return 10;if(roll<x5)return 5;if(roll<x2)return 2;return 1;
}

function applyLineMultipliers(lines,grid){
  let extra=0;
  const adjusted=(lines||[]).map(line=>{
    const rows=line.rows||[];const count=Math.min(Number(line.count||rows.length),rows.length);
    let mult=1;
    for(let c=0;c<count;c++)mult=Math.min(1000,mult*wildMultiplier(grid?.[rows[c]]?.[c]));
    const old=Math.max(0,Number(line.amount||0)),amount=Math.floor(old*mult);extra+=Math.max(0,amount-old);
    return {...line,amount,wildMultiplier:mult};
  });
  return {lines:adjusted,extra};
}

function wildMultiplier(symbol){
  const m=String(symbol||"").match(/🃏×(2|5|10)/);return m?Number(m[1]):1;
}
function wildLabel(mult){return mult>1?`🃏×${mult}`:WILD;}

function forceScatters(grid,cfg,count){
  const out=Array.isArray(grid)?clone(grid):Array.from({length:cfg.rows},()=>Array(cfg.cols).fill(cfg.symbols[0]));
  const positions=[];for(let r=0;r<cfg.rows;r++)for(let c=0;c<cfg.cols;c++)positions.push([r,c]);
  shuffle(positions);for(const [r,c] of positions.slice(0,count))out[r][c]=SCATTER;return out;
}

function pickPurchaseStrength(tier){
  const roll=secureInt(10000);
  if(tier==="super"){
    if(roll<4500)return {name:"SMALL",capMultiplier:60};
    if(roll<8300)return {name:"MEDIUM",capMultiplier:180};
    if(roll<9850)return {name:"BIG",capMultiplier:500};
    return {name:"MAX",capMultiplier:1000};
  }
  if(tier==="premium"){
    if(roll<5600)return {name:"SMALL",capMultiplier:40};
    if(roll<9000)return {name:"MEDIUM",capMultiplier:130};
    if(roll<9900)return {name:"BIG",capMultiplier:400};
    return {name:"MAX",capMultiplier:1000};
  }
  if(roll<6800)return {name:"SMALL",capMultiplier:25};
  if(roll<9300)return {name:"MEDIUM",capMultiplier:90};
  if(roll<9950)return {name:"BIG",capMultiplier:300};
  return {name:"MAX",capMultiplier:1000};
}

function scaleFeatureTo(bonus,target){
  const raw=Math.max(0,Number(bonus?.payout||0)),ratio=raw>0?Math.min(1,target/raw):1;
  if(Array.isArray(bonus?.frames)){
    let sum=0;
    bonus.frames=bonus.frames.map(f=>{const payout=Math.floor(Number(f.payout||0)*ratio);sum+=payout;return {...f,payout,lines:(f.lines||[]).map(l=>({...l,amount:Math.floor(Number(l.amount||0)*ratio)}))};});
    const delta=Math.max(0,target-sum);if(delta&&bonus.frames.length)bonus.frames[bonus.frames.length-1].payout+=delta;
  }
  bonus.payout=target;
}

function sumStickyBoost(sticky){let n=0;for(const v of sticky.values())n+=Math.max(0,Number(v)-1);return n;}
function randomOpen(cfg,sticky){const open=[];for(let r=0;r<cfg.rows;r++)for(let c=0;c<cfg.cols;c++)if(!sticky.has(key(r,c)))open.push([r,c]);return open.length?open[secureInt(open.length)]:null;}
function key(r,c){return `${r}:${c}`;}function parseKey(v){return String(v).split(":").map(Number);}
function weightedPick(values,weights){const scaled=weights.map(w=>Math.max(0,Math.round(Number(w||0)*100))),total=scaled.reduce((a,b)=>a+b,0);let roll=secureInt(Math.max(1,total));for(let i=0;i<values.length;i++){roll-=scaled[i];if(roll<0)return values[i];}return values.at(-1);}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=secureInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function secureInt(max){max=Math.max(1,Math.floor(max));const ceiling=0x100000000,limit=ceiling-(ceiling%max),buf=new Uint32Array(1);do crypto.getRandomValues(buf);while(buf[0]>=limit);return buf[0]%max;}
function validateBet(v){const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<MIN_BET)throw new Error("MIN_BET_1000");if(n>MAX_BET)throw new Error("MAX_BET_5M");return n;}
function round2(v){return Math.floor(Number(v||0)*100)/100;}
function clone(v){try{return structuredClone(v);}catch{try{return JSON.parse(JSON.stringify(v));}catch{return{};}}}
function safe(v){try{return JSON.parse(v||"{}");}catch{return{};}}
async function tx(env,key){return env.DB.prepare(`SELECT metadata FROM wallet_transactions WHERE idempotency_key=?1 LIMIT 1`).bind(key).first();}
async function replay(env,userId,row){const m=safe(row.metadata),p=Number(m.payout||0),slotId=String(m.slotId||"");if(p>0)await credit(env,userId,p,`CASINO_BONUS_BUY_${slotId}_PAYOUT`,`casino:BONUS_BUY:${slotId}:payout:${m.roundId}`,m);return {roundId:m.roundId,slotId,bet:Number(m.bet||0),cost:Number(m.cost||0),tier:m.tier,payout:p,multiplier:round2(p/Math.max(1,Number(m.bet||1))),result:m.result||{},balance:await getBalance(env,userId),duplicate:true,maxWin:Number(m.bet||0)*MAX_WIN_MULTIPLIER};}
