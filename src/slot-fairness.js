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
  result=decorateMultiplierWilds(slotId,result,wager);

  const rawNormal=normalPayoutFromResult(result,Math.max(0,Number(base.payout||0)-jackpot));
  const targetNormal=Math.min(cap,Math.max(0,Math.floor(rawNormal*profile.payoutScale)));
  const ratio=rawNormal>0?targetNormal/rawNormal:1;
  const fairTotal=targetNormal+jackpot;
  const balance=await reconcile(env,userId,base.roundId,Number(base.payout||0),fairTotal,slotId);
  result=scaleVisibleMath(result,ratio,fairTotal,wager,jackpot);

  await recordSlotRound(env,slotId,userId,base.roundId,wager,fairTotal);
  return {...base,payout:fairTotal,multiplier:round2(fairTotal/wager),balance,result,maxWin:cap,profile:{targetRtp:profile.targetRtp,volatility:profile.volatility}};
}

async function normalizeStandard(env,userId,slotId,base){
  const profile=slotProfile(slotId),bet=Math.max(1,Number(base.bet||1)),cap=Math.floor(bet*MAX_WIN_MULTIPLIER);

  let result=maybeInjectNaturalBonus(slotId,base.result||{},bet);
  result=decorateMultiplierWilds(slotId,result,bet);

  const raw=normalPayoutFromResult(result,Math.max(0,Number(base.payout||0)));
  const fair=Math.min(cap,Math.max(0,Math.floor(raw*profile.payoutScale)));
  const ratio=raw>0?fair/raw:1;
  const balance=await reconcile(env,userId,base.roundId,Number(base.payout||0),fair,slotId);
  result=scaleVisibleMath(result,ratio,fair,bet,0);

  await recordSlotRound(env,slotId,userId,base.roundId,bet,fair);
  return {...base,payout:fair,multiplier:round2(fair/bet),balance,result,maxWin:cap,profile:{targetRtp:profile.targetRtp,volatility:profile.volatility}};
}

function normalPayoutFromResult(result,fallback){
  const bonus=Math.max(0,Number(result?.bonus?.payout||0));
  if(result?.base?.payout!=null)return Math.max(0,Number(result.base.payout||0)+bonus);
  return Math.max(0,Number(fallback||0)+Number(result?.multiplierWildExtra||0)+Number(result?.syntheticBonusPayout||0));
}

// One ratio is applied to every visible winning line and every bonus frame.
// No SMALL/MEDIUM/MAX post-processing is allowed to contradict the field.
function scaleVisibleMath(result,ratio,totalPayout,bet,jackpotPayout=0){
  const out=clone(result),r=Math.max(0,Number(ratio)||0);

  if(out.base){
    out.base.payout=money(out.base.payout,r);
    if(Array.isArray(out.base.lines))out.base.lines=scaleLines(out.base.lines,r);
    if(out.base.scatterPayout!=null)out.base.scatterPayout=money(out.base.scatterPayout,r);
  }

  if(Array.isArray(out.lines))out.lines=scaleLines(out.lines,r);

  if(out.bonus){
    if(Array.isArray(out.bonus.frames)){
      out.bonus.frames=out.bonus.frames.map(frame=>({
        ...frame,
        payout:money(frame.payout,r),
        lines:scaleLines(frame.lines||[],r)
      }));
      out.bonus.payout=out.bonus.frames.reduce((sum,frame)=>sum+Math.max(0,Number(frame.payout||0)),0);
    }else{
      out.bonus.payout=money(out.bonus.payout,r);
    }
    out.bonus.payoutTier=payoutTier(out.bonus.payout,bet);
  }

  const normal=Math.max(0,totalPayout-jackpotPayout);
  if(out.normalPayout!=null)out.normalPayout=normal;
  if(out.rawNormalPayout!=null)out.rawNormalPayout=normal;
  out.payout=totalPayout;
  out.multiplier=round2(totalPayout/Math.max(1,bet));
  out.fixedProfile=true;
  if(out.bonus)out.bonusTier=out.bonus.payoutTier;
  return out;
}

function payoutTier(payout,bet){
  const mult=Math.max(0,Number(payout||0))/Math.max(1,Number(bet||1));
  if(mult>=1000)return "MAX";
  if(mult>=120)return "BIG";
  if(mult>=30)return "MEDIUM";
  return "SMALL";
}

async function reconcile(env,userId,roundId,rawPayout,fairPayout,slotId){
  rawPayout=Math.max(0,Math.floor(rawPayout));fairPayout=Math.max(0,Math.floor(fairPayout));
  if(fairPayout>rawPayout){
    await credit(env,String(userId),fairPayout-rawPayout,"SLOT_RTP_ADJUSTMENT",`slot-rtp:${roundId}:credit`,{roundId,slotId,rawPayout,fairPayout,mode:"VISIBLE_FIELD_MATH"});
  }else if(fairPayout<rawPayout){
    await debit(env,String(userId),rawPayout-fairPayout,"SLOT_RTP_ADJUSTMENT",`slot-rtp:${roundId}:debit`,{roundId,slotId,rawPayout,fairPayout,mode:"VISIBLE_FIELD_MATH"});
  }
  return getBalance(env,String(userId));
}

function scaleLines(lines,ratio){return lines.map(line=>({...line,amount:money(line.amount,ratio),factor:line.factor!=null?round2(Number(line.factor)*ratio):line.factor}));}
function money(value,ratio){return Math.max(0,Math.floor((Number(value)||0)*ratio));}
function round2(v){return Math.floor((Number(v)||0)*100)/100;}
function clone(v){try{return structuredClone(v);}catch{try{return JSON.parse(JSON.stringify(v));}catch{return{};}}}
