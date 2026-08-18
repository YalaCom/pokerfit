import {credit,debit,getBalance} from "./db.js";
import {playSlots,playMegaSlots} from "./casino.js";
import {playAdvancedSlot} from "./advanced-slots.js";
import {playMoreSlot} from "./more-slots.js";
import {playJackpotSlot} from "./jackpot-slot.js";
import {recordSlotRound,slotProfile} from "./slot-economy.js";
import {maybeInjectNaturalBonus,decorateMultiplierWilds} from "./bonus-engine.js";

const MAX_WIN_MULTIPLIER=1000;

export async function playFairClassic(env,userId,bet,requestId){
  const base=await playSlots(env,userId,bet,requestId);
  return normalizeStandard(env,userId,"slots",base);
}

export async function playFairMega(env,userId,bet,requestId){
  const base=await playMegaSlots(env,userId,bet,requestId);
  return normalizeStandard(env,userId,"mega",base);
}

export async function playFairAdvanced(env,userId,slotId,bet,requestId){
  const base=await playAdvancedSlot(env,userId,slotId,bet,requestId);
  return normalizeStandard(env,userId,String(slotId),base);
}

export async function playFairMore(env,userId,slotId,bet,requestId){
  const base=await playMoreSlot(env,userId,slotId,bet,requestId);
  return normalizeStandard(env,userId,String(slotId),base);
}

export async function playFairJackpot(env,userId,bet,requestId){
  const base=await playJackpotSlot(env,userId,bet,requestId);
  const slotId="grandjackpot",profile=slotProfile(slotId),wager=Math.max(1,Number(base.bet||bet)),cap=Math.floor(wager*MAX_WIN_MULTIPLIER);
  const jackpot=Math.max(0,Number(base.result?.jackpotPayout||0));
  let result=maybeInjectNaturalBonus(slotId,base.result||{},wager);
  result=decorateMultiplierWilds(slotId,result);
  const rawNormal=normalPayoutFromResult(result,Math.max(0,Number(base.payout||0)-jackpot));
  const shaped=shapeNormalPayout(result,wager,profile.payoutScale,cap,rawNormal);
  const fairTotal=shaped.normalPayout+jackpot;
  const balance=await reconcile(env,userId,base.roundId,Number(base.payout||0),fairTotal,slotId);
  result=scaleResult(result,shaped,fairTotal,wager,jackpot);
  await recordSlotRound(env,slotId,userId,base.roundId,wager,fairTotal);
  return {...base,payout:fairTotal,multiplier:round2(fairTotal/wager),balance,result,maxWin:cap,profile:{targetRtp:profile.targetRtp,volatility:profile.volatility}};
}

async function normalizeStandard(env,userId,slotId,base){
  const profile=slotProfile(slotId),bet=Math.max(1,Number(base.bet||1)),cap=Math.floor(bet*MAX_WIN_MULTIPLIER);
  let result=maybeInjectNaturalBonus(slotId,base.result||{},bet);
  result=decorateMultiplierWilds(slotId,result);
  const raw=normalPayoutFromResult(result,Math.max(0,Number(base.payout||0)));
  const hasBonus=!!(result?.bonusTriggered&&result?.bonus);
  let fair,shaped;
  if(hasBonus){
    shaped=shapeNormalPayout(result,bet,profile.payoutScale,cap,raw);
    fair=shaped.normalPayout;
  }else{
    fair=Math.min(cap,Math.floor(raw*profile.payoutScale));
    shaped={baseRatio:raw>0?fair/raw:1,bonusRatio:1,bonusTier:null,normalPayout:fair,basePayout:fair,bonusPayout:0};
  }
  const balance=await reconcile(env,userId,base.roundId,Number(base.payout||0),fair,slotId);
  result=scaleResult(result,shaped,fair,bet,0);
  await recordSlotRound(env,slotId,userId,base.roundId,bet,fair);
  return {...base,payout:fair,multiplier:round2(fair/bet),balance,result,maxWin:cap,profile:{targetRtp:profile.targetRtp,volatility:profile.volatility}};
}

function normalPayoutFromResult(result,fallback){
  const bonus=Math.max(0,Number(result?.bonus?.payout||0));
  if(result?.base?.payout!=null)return Math.max(0,Number(result.base.payout||0)+bonus);
  return Math.max(0,Number(fallback||0)+Number(result?.multiplierWildExtra||0)+Number(result?.syntheticBonusPayout||0));
}

function shapeNormalPayout(result,bet,payoutScale,cap,fallbackRaw){
  const rawBonus=Math.max(0,Number(result?.bonus?.payout||0));
  const rawBase=Math.max(0,Number(result?.base?.payout??Math.max(0,Number(fallbackRaw||0)-rawBonus)));
  const scaledBase=Math.min(cap,Math.max(0,Math.floor(rawBase*payoutScale)));
  const scaledBonus=Math.max(0,Math.floor(rawBonus*payoutScale));
  const tier=pickBonusTier();
  let bonusPayout=0;

  if(rawBonus>0){
    if(tier.forceMax){
      bonusPayout=Math.max(0,cap-scaledBase);
    }else{
      const tierCap=Math.floor(bet*tier.capMultiplier);
      bonusPayout=Math.min(scaledBonus,tierCap,Math.max(0,cap-scaledBase));
    }
  }

  const normalPayout=Math.min(cap,scaledBase+bonusPayout);
  return {
    normalPayout,
    basePayout:scaledBase,
    bonusPayout,
    baseRatio:rawBase>0?scaledBase/rawBase:1,
    bonusRatio:rawBonus>0?bonusPayout/rawBonus:1,
    bonusTier:tier
  };
}

function pickBonusTier(){
  const roll=secureInt(10000);
  if(roll<6900)return {name:"SMALL",capMultiplier:5+secureInt(26),forceMax:false};
  if(roll<9350)return {name:"MEDIUM",capMultiplier:30+secureInt(91),forceMax:false};
  if(roll<9965)return {name:"BIG",capMultiplier:120+secureInt(281),forceMax:false};
  return {name:"MAX",capMultiplier:MAX_WIN_MULTIPLIER,forceMax:true};
}

async function reconcile(env,userId,roundId,rawPayout,fairPayout,slotId){
  rawPayout=Math.max(0,Math.floor(rawPayout));fairPayout=Math.max(0,Math.floor(fairPayout));
  if(fairPayout>rawPayout){
    await credit(env,String(userId),fairPayout-rawPayout,"SLOT_RTP_ADJUSTMENT",`slot-rtp:${roundId}:credit`,{roundId,slotId,rawPayout,fairPayout,mode:"FIXED_PROFILE_BONUS_VARIANCE"});
  }else if(fairPayout<rawPayout){
    await debit(env,String(userId),rawPayout-fairPayout,"SLOT_RTP_ADJUSTMENT",`slot-rtp:${roundId}:debit`,{roundId,slotId,rawPayout,fairPayout,mode:"FIXED_PROFILE_BONUS_VARIANCE"});
  }
  return getBalance(env,String(userId));
}

function scaleResult(result,shape,totalPayout,bet,jackpotPayout=0){
  const out=clone(result),baseRatio=Number(shape?.baseRatio??1),bonusRatio=Number(shape?.bonusRatio??1);
  if(out.base){
    out.base.payout=money(out.base.payout,baseRatio);
    if(Array.isArray(out.base.lines))out.base.lines=scaleLines(out.base.lines,baseRatio);
    if(out.base.scatterPayout!=null)out.base.scatterPayout=money(out.base.scatterPayout,baseRatio);
  }
  if(Array.isArray(out.lines))out.lines=scaleLines(out.lines,baseRatio);
  if(out.bonus){
    out.bonus.payout=Math.max(0,Math.floor(Number(shape?.bonusPayout??money(out.bonus.payout,bonusRatio))));
    out.bonus.payoutTier=shape?.bonusTier?.name||"NORMAL";
    out.bonus.payoutCapMultiplier=Number(shape?.bonusTier?.capMultiplier||0);
    if(Array.isArray(out.bonus.frames))out.bonus.frames=scaleBonusFrames(out.bonus.frames,bonusRatio,out.bonus.payout);
  }
  if(out.normalPayout!=null)out.normalPayout=Math.max(0,totalPayout-jackpotPayout);
  out.payout=totalPayout;
  out.multiplier=round2(totalPayout/Math.max(1,bet));
  out.fixedProfile=true;
  if(shape?.bonusTier)out.bonusTier=shape.bonusTier.name;
  return out;
}

function scaleBonusFrames(frames,ratio,targetTotal){
  const scaled=frames.map(frame=>({...frame,payout:money(frame.payout,ratio),lines:scaleLines(frame.lines||[],ratio)}));
  const current=scaled.reduce((sum,frame)=>sum+Math.max(0,Number(frame.payout||0)),0);
  const delta=Math.floor(Number(targetTotal||0))-current;
  if(scaled.length&&delta!==0){
    const last=scaled[scaled.length-1];
    last.payout=Math.max(0,Math.floor(Number(last.payout||0)+delta));
  }
  return scaled;
}

function scaleLines(lines,ratio){return lines.map(line=>({...line,amount:money(line.amount,ratio),factor:line.factor!=null?round2(Number(line.factor)*ratio):line.factor}));}
function money(value,ratio){return Math.max(0,Math.floor((Number(value)||0)*ratio));}
function round2(v){return Math.floor((Number(v)||0)*100)/100;}
function secureInt(max){max=Math.max(1,Math.floor(max));const ceiling=0x100000000,limit=ceiling-(ceiling%max),buf=new Uint32Array(1);do crypto.getRandomValues(buf);while(buf[0]>=limit);return buf[0]%max;}
function clone(v){try{return structuredClone(v);}catch{try{return JSON.parse(JSON.stringify(v));}catch{return{};}}}
