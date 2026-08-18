export const SLOT_PROFILES={
  slots:{id:"slots",label:"CLASSIC SLOTS",targetRtp:0.95,volatility:"LOW",payoutScale:0.88},
  mega:{id:"mega",label:"MEGA REELS",targetRtp:0.95,volatility:"MEDIUM",payoutScale:5.4},
  royal5:{id:"royal5",label:"ROYAL FRUITS",targetRtp:0.95,volatility:"MEDIUM",payoutScale:5.0},
  neon8:{id:"neon8",label:"NEON EMPIRE",targetRtp:0.95,volatility:"HIGH",payoutScale:9.0},
  vault5:{id:"vault5",label:"GOLDEN VAULT",targetRtp:0.95,volatility:"VERY HIGH",payoutScale:4.0},
  moon5:{id:"moon5",label:"MOONLIGHT RICHES",targetRtp:0.95,volatility:"MEDIUM",payoutScale:3.8},
  dragon6:{id:"dragon6",label:"DRAGON FIRE",targetRtp:0.95,volatility:"HIGH",payoutScale:6.3},
  grandjackpot:{id:"grandjackpot",label:"GRAND FORTUNE",targetRtp:0.94,volatility:"JACKPOT",payoutScale:2.5}
};

export function slotProfile(id){return SLOT_PROFILES[String(id||"")]||{id:String(id||"slot"),targetRtp:0.95,volatility:"MEDIUM",payoutScale:1};}
export function scaleSlotPayout(id,amount){const p=slotProfile(id),n=Math.max(0,Number(amount)||0);return Math.max(0,Math.floor(n*p.payoutScale));}
export function scaleSlotMultiplier(id,multiplier){const p=slotProfile(id),n=Math.max(0,Number(multiplier)||0);return Math.max(0,Math.floor(n*p.payoutScale*100)/100);}

export async function recordSlotRound(env,slotId,userId,roundId,bet,payout){
  slotId=String(slotId);userId=String(userId);roundId=String(roundId);bet=Math.max(0,Math.floor(Number(bet)||0));payout=Math.max(0,Math.floor(Number(payout)||0));
  if(!env?.DB||!roundId||!slotId)return;
  try{
    const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO slot_round_audit(round_id,slot_id,telegram_id,bet,payout) VALUES(?1,?2,?3,?4,?5)`).bind(roundId,slotId,userId,bet,payout).run();
    if(!inserted?.meta?.changes)return;
    await env.DB.prepare(`
      INSERT INTO slot_performance(slot_id,spins,wins,wagered,paid,biggest_win,updated_at)
      VALUES(?1,1,?2,?3,?4,?4,CURRENT_TIMESTAMP)
      ON CONFLICT(slot_id) DO UPDATE SET
        spins=spins+1,
        wins=wins+excluded.wins,
        wagered=wagered+excluded.wagered,
        paid=paid+excluded.paid,
        biggest_win=MAX(biggest_win,excluded.biggest_win),
        updated_at=CURRENT_TIMESTAMP
    `).bind(slotId,payout>0?1:0,bet,payout).run();
  }catch(error){console.error("SLOT_PERFORMANCE",slotId,error);}
}

export async function getSlotPerformance(env,slotId){
  const row=await env.DB.prepare(`SELECT * FROM slot_performance WHERE slot_id=?1 LIMIT 1`).bind(String(slotId)).first();
  const wagered=Number(row?.wagered||0),paid=Number(row?.paid||0),profile=slotProfile(slotId);
  return {slotId:String(slotId),spins:Number(row?.spins||0),wins:Number(row?.wins||0),wagered,paid,net:wagered-paid,actualRtp:wagered>0?Math.floor(paid/wagered*10000)/100:0,targetRtp:profile.targetRtp,volatility:profile.volatility,biggestWin:Number(row?.biggest_win||0)};
}
