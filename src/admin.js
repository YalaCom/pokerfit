import { credit, debit, getPlayer, logAdmin } from "./db.js";

export function isAdmin(env,userId) {
  const ids=String(env.ADMIN_TELEGRAM_IDS||"").split(",").map(x=>x.trim()).filter(Boolean);
  return ids.includes(String(userId));
}

export async function adminAction(env,adminId,path,body) {
  if(!isAdmin(env,adminId))throw new Error("ADMIN_ONLY");

  if(path==="/admin-api/users"){
    const q=String(body.query||"").trim();
    const like=`%${q}%`;
    const rows=(await env.DB.prepare(`
      SELECT u.telegram_id,u.username,u.first_name,u.level,u.xp,u.rating,u.is_banned,w.balance,u.created_at
      FROM users u JOIN wallets w ON w.telegram_id=u.telegram_id
      WHERE (?1='' OR u.telegram_id LIKE ?2 OR u.username LIKE ?2 OR u.first_name LIKE ?2)
      ORDER BY u.created_at DESC LIMIT 100
    `).bind(q,like).all()).results||[];
    return {users:rows};
  }

  if(path==="/admin-api/adjust"){
    const target=String(body.telegramId),amount=Math.trunc(Number(body.amount));
    if(!target||!Number.isFinite(amount)||amount===0)throw new Error("INVALID_ADJUSTMENT");
    let result;
    if(amount>0)result=await credit(env,target,amount,"ADMIN_ADJUSTMENT",`admin:${adminId}:${crypto.randomUUID()}`,{adminId});
    else result=await debit(env,target,-amount,"ADMIN_ADJUSTMENT",`admin:${adminId}:${crypto.randomUUID()}`,{adminId});
    await logAdmin(env,adminId,"BALANCE_ADJUST",target,{amount});
    return {balance:result.balance};
  }

  if(path==="/admin-api/ban"){
    const target=String(body.telegramId),banned=body.banned?1:0;
    await env.DB.prepare(`UPDATE users SET is_banned=?2,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?1`).bind(target,banned).run();
    await logAdmin(env,adminId,banned?"BAN":"UNBAN",target,{});
    return {ok:true};
  }

  if(path==="/admin-api/tables"){
    const rows=(await env.DB.prepare(`SELECT * FROM tables ORDER BY updated_at DESC LIMIT 100`).all()).results||[];
    return {tables:rows};
  }

  if(path==="/admin-api/stop-table"){
    const tableId=String(body.tableId);
    try {
      const stub=env.POKER_TABLES.getByName(tableId);
      await stub.fetch("https://do/control/stop",{method:"POST"});
    } catch {}
    await env.DB.prepare(`UPDATE tables SET status='closed',updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(tableId).run();
    await logAdmin(env,adminId,"STOP_TABLE",tableId,{});
    return {ok:true};
  }

  if(path==="/admin-api/tournament-save"){
    const id=String(body.id||`custom-${crypto.randomUUID()}`);
    const startsAt=new Date(body.startsAt).toISOString();
    const buyIn=Math.max(0,Math.floor(Number(body.buyIn||100000)));
    const startStack=Math.max(1000,Math.floor(Number(body.startStack||50000)));
    const maxPlayers=Math.min(500,Math.max(2,Math.floor(Number(body.maxPlayers||81))));
    const levelMinutes=Math.min(60,Math.max(2,Math.floor(Number(body.levelMinutes||5))));
    const lateMinutes=Math.min(120,Math.max(0,Math.floor(Number(body.lateMinutes||15))));
    const structure=JSON.stringify({levelMinutes,levels:body.levels||[
      {sb:100,bb:200},{sb:200,bb:400},{sb:300,bb:600},{sb:500,bb:1000},
      {sb:1000,bb:2000},{sb:2000,bb:4000}
    ]});
    const late=new Date(Date.parse(startsAt)+lateMinutes*60000).toISOString();
    await env.DB.prepare(`
      INSERT INTO tournaments(id,name,slug,buy_in,start_stack,max_players,starts_at,late_reg_until,status,blind_structure)
      VALUES(?1,?2,'custom',?3,?4,?5,?6,?7,'scheduled',?8)
      ON CONFLICT(id) DO UPDATE SET name=?2,buy_in=?3,start_stack=?4,max_players=?5,
        starts_at=?6,late_reg_until=?7,blind_structure=?8,updated_at=CURRENT_TIMESTAMP
    `).bind(id,String(body.name||"CUSTOM EVENT").slice(0,60),buyIn,startStack,maxPlayers,startsAt,late,structure).run();
    await logAdmin(env,adminId,"TOURNAMENT_SAVE",id,{name:body.name,startsAt,buyIn});
    return {id};
  }

  if(path==="/admin-api/tournament-cancel"){
    const id=String(body.id);
    await env.DB.prepare(`UPDATE tournaments SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?1 AND status='scheduled'`).bind(id).run();
    await logAdmin(env,adminId,"TOURNAMENT_CANCEL",id,{});
    return {ok:true};
  }

  if(path==="/admin-api/tournaments"){
    const rows=(await env.DB.prepare(`SELECT * FROM tournaments ORDER BY starts_at DESC LIMIT 100`).all()).results||[];
    return {tournaments:rows};
  }

  if(path==="/admin-api/logs"){
    const rows=(await env.DB.prepare(`SELECT * FROM admin_logs ORDER BY id DESC LIMIT 100`).all()).results||[];
    return {logs:rows};
  }

  throw new Error("ADMIN_ROUTE_NOT_FOUND");
}
