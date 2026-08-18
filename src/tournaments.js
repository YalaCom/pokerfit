import { debit, credit, addXp } from "./db.js";
import { awardSeasonScore } from "./season.js";

const DAILY_BLINDS=[
  [100,200],[200,400],[300,600],[500,1000],[1000,2000],[2000,4000],
  [3000,6000],[5000,10000],[8000,16000],[12000,24000],[20000,40000]
];
const SUNDAY_BLINDS=[
  [100,200],[150,300],[200,400],[300,600],[400,800],[500,1000],
  [800,1600],[1200,2400],[2000,4000],[3000,6000],[5000,10000]
];

export async function ensureScheduledTournaments(env,nowMs=Date.now()) {
  const offset=Number(env.APP_TZ_OFFSET_MINUTES||180);
  const local=new Date(nowMs+offset*60000);
  const y=local.getUTCFullYear(),m=local.getUTCMonth(),d=local.getUTCDate();
  const dailyLocal=Date.UTC(y,m,d,20,0,0);
  const dailyUtc=new Date(dailyLocal-offset*60000);
  await ensureTournament(env,{
    id:`daily-${dateKeyLocal(local)}`,name:"DAILY MILLION",slug:"daily-million",
    buyIn:100000,startStack:50000,maxPlayers:81,startsAt:dailyUtc.toISOString(),
    lateMinutes:15,structure:DAILY_BLINDS,levelMinutes:5
  });

  if(local.getUTCDay()===0){
    const sundayUtc=new Date(Date.UTC(y,m,d,20,0,0)-offset*60000);
    await ensureTournament(env,{
      id:`sunday-${dateKeyLocal(local)}`,name:"SUNDAY MAIN EVENT",slug:"sunday-main-event",
      buyIn:500000,startStack:100000,maxPlayers:162,startsAt:sundayUtc.toISOString(),
      lateMinutes:20,structure:SUNDAY_BLINDS,levelMinutes:8
    });
  }

  await processTournamentLifecycle(env,nowMs);
}

async function ensureTournament(env,t) {
  const late=new Date(Date.parse(t.startsAt)+t.lateMinutes*60000).toISOString();
  const structure=JSON.stringify({levels:t.structure.map(([sb,bb])=>({sb,bb})),levelMinutes:t.levelMinutes});
  await env.DB.prepare(`
    INSERT OR IGNORE INTO tournaments
    (id,name,slug,buy_in,start_stack,max_players,starts_at,late_reg_until,status,blind_structure)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'scheduled',?9)
  `).bind(t.id,t.name,t.slug,t.buyIn,t.startStack,t.maxPlayers,t.startsAt,late,structure).run();
}

export async function listTournaments(env,userId) {
  const rows=(await env.DB.prepare(`
    SELECT t.*,
      CASE WHEN tp.telegram_id IS NULL THEN 0 ELSE 1 END AS registered,
      tp.status AS player_status,tp.table_id,tp.stack AS player_stack,tp.placement,tp.prize
    FROM tournaments t
    LEFT JOIN tournament_players tp ON tp.tournament_id=t.id AND tp.telegram_id=?1
    WHERE t.starts_at>=datetime('now','-1 day') OR t.status IN ('running','late_reg')
    ORDER BY t.starts_at ASC LIMIT 30
  `).bind(String(userId)).all()).results||[];
  return rows.map(normalizeTournament);
}

function normalizeTournament(r){
  const structure=safeJson(r.blind_structure)||{levels:[],levelMinutes:5};
  return {
    id:r.id,name:r.name,slug:r.slug,type:r.tournament_type,
    buyIn:Number(r.buy_in),startStack:Number(r.start_stack),maxPlayers:Number(r.max_players),
    registeredPlayers:Number(r.registered_players),prizePool:Number(r.prize_pool),
    startsAt:r.starts_at,lateRegUntil:r.late_reg_until,status:r.status,
    blindStructure:structure,registered:!!r.registered,playerStatus:r.player_status||null,
    tableId:r.table_id||null,playerStack:Number(r.player_stack||0),
    placement:r.placement?Number(r.placement):null,prize:Number(r.prize||0)
  };
}

export async function registerTournament(env,userId,tournamentId,requestId) {
  userId=String(userId);tournamentId=String(tournamentId);
  const t=await env.DB.prepare(`SELECT * FROM tournaments WHERE id=?1 LIMIT 1`).bind(tournamentId).first();
  if(!t)throw new Error("TOURNAMENT_NOT_FOUND");
  const now=Date.now();
  if(!["scheduled","late_reg"].includes(t.status))throw new Error("REGISTRATION_CLOSED");
  if(now>Date.parse(t.late_reg_until||t.starts_at))throw new Error("REGISTRATION_CLOSED");
  if(Number(t.registered_players)>=Number(t.max_players))throw new Error("TOURNAMENT_FULL");
  const existing=await env.DB.prepare(`SELECT 1 AS ok FROM tournament_players WHERE tournament_id=?1 AND telegram_id=?2`)
    .bind(tournamentId,userId).first();
  if(existing)throw new Error("ALREADY_REGISTERED");

  const d=await debit(env,userId,Number(t.buy_in),"TOURNAMENT_BUYIN",`tbuy:${tournamentId}:${userId}:${requestId}`,{tournamentId});
  if(!d.applied)throw new Error("DUPLICATE_REQUEST");
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO tournament_players(tournament_id,telegram_id,stack,status)
      VALUES(?1,?2,?3,'registered')
    `).bind(tournamentId,userId,Number(t.start_stack)),
    env.DB.prepare(`
      UPDATE tournaments SET registered_players=registered_players+1,prize_pool=prize_pool+?2,updated_at=CURRENT_TIMESTAMP
      WHERE id=?1
    `).bind(tournamentId,Number(t.buy_in))
  ]);
  return {balance:d.balance};
}

export async function unregisterTournament(env,userId,tournamentId) {
  userId=String(userId);tournamentId=String(tournamentId);
  const t=await env.DB.prepare(`SELECT * FROM tournaments WHERE id=?1 LIMIT 1`).bind(tournamentId).first();
  if(!t)throw new Error("TOURNAMENT_NOT_FOUND");
  if(Date.now()>=Date.parse(t.starts_at))throw new Error("TOURNAMENT_STARTED");
  const p=await env.DB.prepare(`SELECT status FROM tournament_players WHERE tournament_id=?1 AND telegram_id=?2`)
    .bind(tournamentId,userId).first();
  if(!p)throw new Error("NOT_REGISTERED");
  const c=await credit(env,userId,Number(t.buy_in),"TOURNAMENT_REFUND",`trefund:${tournamentId}:${userId}`,{tournamentId});
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM tournament_players WHERE tournament_id=?1 AND telegram_id=?2`).bind(tournamentId,userId),
    env.DB.prepare(`
      UPDATE tournaments SET registered_players=MAX(0,registered_players-1),prize_pool=MAX(0,prize_pool-?2),updated_at=CURRENT_TIMESTAMP
      WHERE id=?1
    `).bind(tournamentId,Number(t.buy_in))
  ]);
  return {balance:c.balance};
}

export async function tournamentSeat(env,userId,tournamentId) {
  const row=await env.DB.prepare(`
    SELECT tp.table_id,tp.seat_no,tp.status,tp.stack,t.status AS tournament_status,t.name
    FROM tournament_players tp JOIN tournaments t ON t.id=tp.tournament_id
    WHERE tp.tournament_id=?1 AND tp.telegram_id=?2 LIMIT 1
  `).bind(String(tournamentId),String(userId)).first();
  if(!row)throw new Error("NOT_REGISTERED");
  return {
    tableId:row.table_id,seatNo:row.seat_no?Number(row.seat_no):null,status:row.status,
    stack:Number(row.stack||0),tournamentStatus:row.tournament_status,name:row.name
  };
}

async function processTournamentLifecycle(env,nowMs) {
  const rows=(await env.DB.prepare(`
    SELECT * FROM tournaments WHERE status IN ('scheduled','late_reg','running')
    ORDER BY starts_at ASC
  `).all()).results||[];

  for(const t of rows){
    const starts=Date.parse(t.starts_at),late=Date.parse(t.late_reg_until||t.starts_at);
    if(t.status==="scheduled"&&nowMs>=starts){
      if(Number(t.registered_players)<2){
        await cancelTournament(env,t);
        continue;
      }
      await startTournament(env,t);
    }else if(t.status==="late_reg"&&nowMs>=late){
      await env.DB.prepare(`UPDATE tournaments SET status='running',updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(t.id).run();
    }

    if(["late_reg","running"].includes(t.status)||nowMs>=starts){
      await updateBlindLevels(env,t,nowMs);
      await rebalanceTournament(env,t);
      await maybeCompleteTournament(env,t);
    }
  }
}

async function startTournament(env,t) {
  const players=(await env.DB.prepare(`
    SELECT telegram_id,stack FROM tournament_players WHERE tournament_id=?1 AND status='registered'
    ORDER BY registered_at ASC
  `).bind(t.id).all()).results||[];
  const groupSize=9;
  for(let i=0;i<players.length;i+=groupSize){
    const group=players.slice(i,i+groupSize);
    const tableId=`tour-${t.id}-${Math.floor(i/groupSize)+1}`;
    const structure=safeJson(t.blind_structure);
    const first=structure?.levels?.[0]||{sb:100,bb:200};
    await env.DB.prepare(`
      INSERT OR IGNORE INTO tables
      (id,room_code,name,kind,visibility,sb,bb,min_buyin,max_buyin,max_players,turn_seconds,current_players,status,tournament_id)
      VALUES(?1,NULL,?2,'tournament','private',?3,?4,0,0,9,20,?5,'open',?6)
    `).bind(tableId,`${t.name} #${Math.floor(i/groupSize)+1}`,first.sb,first.bb,group.length,t.id).run();
    for(let j=0;j<group.length;j++){
      await env.DB.prepare(`
        UPDATE tournament_players SET table_id=?3,seat_no=?4,status='playing'
        WHERE tournament_id=?1 AND telegram_id=?2
      `).bind(t.id,group[j].telegram_id,tableId,j).run();
    }
  }
  for(const p of players){
    await env.DB.prepare(`UPDATE user_stats SET tournaments_played=tournaments_played+1 WHERE telegram_id=?1`).bind(p.telegram_id).run();
  }
  const status=Date.now()<Date.parse(t.late_reg_until||t.starts_at)?"late_reg":"running";
  await env.DB.prepare(`UPDATE tournaments SET status=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(t.id,status).run();
}

async function cancelTournament(env,t) {
  const players=(await env.DB.prepare(`SELECT telegram_id FROM tournament_players WHERE tournament_id=?1`).bind(t.id).all()).results||[];
  for(const p of players){
    await credit(env,p.telegram_id,Number(t.buy_in),"TOURNAMENT_CANCEL_REFUND",`tcancel:${t.id}:${p.telegram_id}`,{tournamentId:t.id});
  }
  await env.DB.prepare(`UPDATE tournaments SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(t.id).run();
}

async function updateBlindLevels(env,t,nowMs) {
  const structure=safeJson(t.blind_structure);
  if(!structure?.levels?.length)return;
  const minutes=Math.max(1,Number(structure.levelMinutes||5));
  const level=Math.min(structure.levels.length-1,Math.floor((nowMs-Date.parse(t.starts_at))/(minutes*60000)));
  if(level<0)return;
  const blinds=structure.levels[level];
  const tableRows=(await env.DB.prepare(`SELECT id FROM tables WHERE tournament_id=?1 AND status='open'`).bind(t.id).all()).results||[];
  for(const table of tableRows){
    await env.DB.prepare(`UPDATE tables SET sb=?2,bb=?3,updated_at=CURRENT_TIMESTAMP WHERE id=?1`)
      .bind(table.id,Number(blinds.sb),Number(blinds.bb)).run();
    try{
      const stub=env.POKER_TABLES.getByName(table.id);
      await stub.fetch("https://do/control/blinds",{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({sb:Number(blinds.sb),bb:Number(blinds.bb),level:level+1})});
    }catch{}
  }
}

async function rebalanceTournament(env,t) {
  const alive=(await env.DB.prepare(`
    SELECT telegram_id,stack,table_id FROM tournament_players
    WHERE tournament_id=?1 AND status='playing' AND stack>0 ORDER BY stack DESC
  `).bind(t.id).all()).results||[];
  if(alive.length===0)return;

  if(alive.length<=9){
    const finalId=`tour-${t.id}-final`;
    const existing=await env.DB.prepare(`SELECT id FROM tables WHERE id=?1`).bind(finalId).first();
    if(!existing){
      const structure=safeJson(t.blind_structure),first=structure?.levels?.[0]||{sb:100,bb:200};
      await env.DB.prepare(`
        INSERT INTO tables(id,name,kind,visibility,sb,bb,min_buyin,max_buyin,max_players,turn_seconds,current_players,status,tournament_id)
        VALUES(?1,?2,'tournament','private',?3,?4,0,0,9,20,?5,'open',?6)
      `).bind(finalId,`${t.name} FINAL TABLE`,first.sb,first.bb,alive.length,t.id).run();
      for(let i=0;i<alive.length;i++){
        await env.DB.prepare(`UPDATE tournament_players SET table_id=?3,seat_no=?4 WHERE tournament_id=?1 AND telegram_id=?2`)
          .bind(t.id,alive[i].telegram_id,finalId,i).run();
      }
      await env.DB.prepare(`UPDATE user_stats SET final_tables=final_tables+1 WHERE telegram_id IN (${alive.map(()=>"?").join(",")})`)
        .bind(...alive.map(x=>x.telegram_id)).run().catch(()=>{});
    }
  }
}

async function maybeCompleteTournament(env,t) {
  const alive=(await env.DB.prepare(`
    SELECT telegram_id,stack FROM tournament_players
    WHERE tournament_id=?1 AND status='playing' AND stack>0 ORDER BY stack DESC
  `).bind(t.id).all()).results||[];
  if(alive.length!==1)return;
  const winner=alive[0];
  await env.DB.prepare(`
    UPDATE tournament_players SET placement=1,status='winner' WHERE tournament_id=?1 AND telegram_id=?2
  `).bind(t.id,winner.telegram_id).run();
  await payoutTournament(env,t);
  await env.DB.prepare(`UPDATE tournaments SET status='complete',updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(t.id).run();
}

async function payoutTournament(env,t) {
  const players=(await env.DB.prepare(`
    SELECT telegram_id,placement FROM tournament_players WHERE tournament_id=?1 AND placement IS NOT NULL
    ORDER BY placement ASC
  `).bind(t.id).all()).results||[];
  if(!players.length)return;
  const base=[35,22,15,10,7,3,2.5,2,1.8,1.7];
  const paid=players.filter(p=>Number(p.placement)<=10);
  const weights=paid.map(p=>base[Number(p.placement)-1]||0);
  const totalWeight=weights.reduce((a,b)=>a+b,0);
  let remaining=Number(t.prize_pool);
  for(let i=0;i<paid.length;i++){
    const p=paid[i];
    const prize=i===paid.length-1?remaining:Math.floor(Number(t.prize_pool)*weights[i]/totalWeight);
    remaining-=prize;
    if(prize>0){
      await credit(env,p.telegram_id,prize,"TOURNAMENT_PRIZE",`tprize:${t.id}:${p.telegram_id}`,{tournamentId:t.id,placement:p.placement});
      await env.DB.prepare(`UPDATE tournament_players SET prize=?3 WHERE tournament_id=?1 AND telegram_id=?2`)
        .bind(t.id,p.telegram_id,prize).run();
    }
  }
  await env.DB.prepare(`UPDATE user_stats SET tournaments_won=tournaments_won+1 WHERE telegram_id=?1`).bind(players[0].telegram_id).run();
  await addXp(env,players[0].telegram_id,1000);
  await awardSeasonScore(env,players[0].telegram_id,500);
}

function safeJson(s){try{return JSON.parse(s)}catch{return null}}
function dateKeyLocal(d){return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`}
