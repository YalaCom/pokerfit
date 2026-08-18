import {credit,debit,getBalance} from "./db.js";
import {playSlots,playMegaSlots} from "./casino.js";
import {playAdvancedSlot} from "./advanced-slots.js";
import {playMoreSlot} from "./more-slots.js";
import {playJackpotSlot} from "./jackpot-slot.js";
import {recordSlotRound,slotProfile} from "./slot-economy.js";

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
  const profile=slotProfile("grandjackpot"),rawNormal=Math.max(0,Number(base.result?.normalPayout||0)),jackpot=Math.max(0,Number(base.result?.jackpotPayout||0));
  const cap=Math.max(0,Math.floor(Number(base.bet||bet)*MAX_WIN_MULTIPLIER));
  const fairNormal=Math.min(cap,Math.floor(rawNormal*profile.payoutScale));
  const fairTotal=fairNormal+jackpot;
  const balance=await reconcile(env,userId,base.roundId,Number(base.payout||0),fairTotal,"grandjackpot");
  const ratio=rawNormal>0?fairNormal/rawNormal:1;
  const result=scaleResult(base.result||{},ratio,fairNormal+jackpot,Number(base.bet||bet),jackpot);
  await recordSlotRound(env,"grandjackpot",userId,base.roundId,Number(base.bet||bet),fairTotal);
  return {...base,payout:fairTotal,multiplier:round2(fairTotal/Math.max(1,Number(base.bet||bet))),balance,result,maxWin:cap,profile:{targetRtp:profile.targetRtp,volatility:profile.volatility}};
}

async function normalizeStandard(env,userId,slotId,base){
  const profile=slotProfile(slotId),raw=Math.max(0,Number(base.payout||0)),bet=Math.max(1,Number(base.bet||1)),cap=Math.floor(bet*MAX_WIN_MULTIPLIER);
  const fair=Math.min(cap,Math.floor(raw*profile.payoutScale));
  const balance=await reconcile(env,userId,base.roundId,raw,fair,slotId);
  const ratio=raw>0?fair/raw:1;
  const result=scaleResult(base.result||{},ratio,fair,bet,0);
  await recordSlotRound(env,slotId,userId,base.roundId,bet,fair);
  return {...base,payout:fair,multiplier:round2(fair/bet),balance,result,maxWin:cap,profile:{targetRtp:profile.targetRtp,volatility:profile.volatility}};
}

async function reconcile(env,userId,roundId,rawPayout,fairPayout,slotId){
  rawPayout=Math.max(0,Math.floor(rawPayout));fairPayout=Math.max(0,Math.floor(fairPayout));
  if(fairPayout>rawPayout){
    await credit(env,String(userId),fairPayout-rawPayout,"SLOT_RTP_ADJUSTMENT",`slot-rtp:${roundId}:credit`,{roundId,slotId,rawPayout,fairPayout,mode:"FIXED_PROFILE"});
  }else if(fairPayout<rawPayout){
    await debit(env,String(userId),rawPayout-fairPayout,"SLOT_RTP_ADJUSTMENT",`slot-rtp:${roundId}:debit`,{roundId,slotId,rawPayout,fairPayout,mode:"FIXED_PROFILE"});
  }
  return getBalance(env,String(userId));
}

function scaleResult(result,ratio,totalPayout,bet,jackpotPayout=0){
  const out=structuredCloneSafe(result);
  if(out.base){out.base.payout=money(out.base.payout,ratio);if(Array.isArray(out.base.lines))out.base.lines=scaleLines(out.base.lines,ratio);if(out.base.scatterPayout!=null)out.base.scatterPayout=money(out.base.scatterPayout,ratio);}
  if(Array.isArray(out.lines))out.lines=scaleLines(out.lines,ratio);
  if(out.bonus){
    out.bonus.payout=money(out.bonus.payout,ratio);
    if(Array.isArray(out.bonus.frames))out.bonus.frames=out.bonus.frames.map(frame=>({...frame,payout:money(frame.payout,ratio),lines:scaleLines(frame.lines||[],ratio)}));
  }
  if(out.normalPayout!=null)out.normalPayout=Math.max(0,totalPayout-jackpotPayout);
  out.payout=totalPayout;out.multiplier=round2(totalPayout/Math.max(1,bet));out.fixedProfile=true;
  return out;
}
function scaleLines(lines,ratio){return lines.map(line=>({...line,amount:money(line.amount,ratio),factor:line.factor!=null?round2(Number(line.factor)*ratio):line.factor}));}
function money(value,ratio){return Math.max(0,Math.floor((Number(value)||0)*ratio));}
function round2(v){return Math.floor((Number(v)||0)*100)/100;}
function structuredCloneSafe(v){try{return structuredClone(v);}catch{try{return JSON.parse(JSON.stringify(v));}catch{return{};}}}
