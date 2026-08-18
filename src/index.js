import { authenticateJsonRequest } from "./auth.js";
import { ensurePlayer, getPlayer, publicPlayer, getBalance } from "./db.js";
import { newBlackjack, blackjackAction } from "./blackjack.js";
import {
  rewardsStatus,claimStreak,claimFree,claimLowBalanceHelp,startRescue,claimRescue,
  syncAchievements,claimAchievement
} from "./rewards.js";
import { listFriends,addFriend,removeFriend,notifications,markNotificationRead } from "./social.js";
import {
  ensureScheduledTournaments,listTournaments,registerTournament,
  unregisterTournament,tournamentSeat
} from "./tournaments.js";
import { handleTelegramWebhook,notifyUpcomingTournaments } from "./telegram.js";
import { isAdmin,adminAction } from "./admin.js";
import { PokerTableDO } from "./durable/PokerTableDO.js";
import { ensureSeason,currentSeasonRating } from "./season.js";

export { PokerTableDO };

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(request.method==="POST" && (url.pathname==="/"||url.pathname==="/telegram/webhook"))return handleTelegramWebhook(request,env);
    if(url.pathname.startsWith("/ws/table/"))return handleTableWebSocket(request,env,url);
    if(url.pathname.startsWith("/api/")||url.pathname.startsWith("/admin-api/"))return handleApi(request,env,url);
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller,env,ctx){
    ctx.waitUntil((async()=>{
      await ensureSeason(env,Date.now());
      await ensureScheduledTournaments(env,Date.now());
      await notifyUpcomingTournaments(env,Date.now());
    })());
  }
};

async function handleApi(request,env,url){
  if(request.method!=="POST")return json({ok:false,error:"POST_REQUIRED"},405);
  const auth=await authenticateJsonRequest(request,env);
  if(!auth.ok)return json({ok:false,error:auth.error},401);
  try{await ensurePlayer(env,auth.user);}catch(error){return json({ok:false,error:String(error?.message||"PLAYER_ERROR")},403);}
  const userId=String(auth.user.id),body=auth.body||{};
  try{
    if(url.pathname==="/api/bootstrap"){
      const p=await getPlayer(env,userId),rewards=await rewardsStatus(env,userId),online=await onlineStats(env);
      const session=await env.DB.prepare(`SELECT ts.table_id,t.name,t.kind,t.visibility,t.tournament_id FROM table_sessions ts JOIN tables t ON t.id=ts.table_id WHERE ts.telegram_id=?1 AND t.status='open' LIMIT 1`).bind(userId).first();
      return json({ok:true,player:publicPlayer(p),rewards,online,admin:isAdmin(env,userId),activeSession:session?{tableId:session.table_id,name:session.name,kind:session.kind,visibility:session.visibility,tournamentId:session.tournament_id}:null});
    }
    if(url.pathname==="/api/tables")return json({ok:true,tables:await listPublicTables(env)});
    if(url.pathname==="/api/quick-play")return json({ok:true,...await quickPlay(env,userId,auth.user,body)});
    if(url.pathname==="/api/private/create")return json({ok:true,...await createPrivateTable(env,userId,auth.user,body)});
    if(url.pathname==="/api/private/join")return json({ok:true,...await joinPrivateTable(env,userId,auth.user,body)});
    if(url.pathname==="/api/table/connect")return json({ok:true,...await connectExistingTable(env,userId,auth.user,body)});
    if(url.pathname==="/api/table/resume")return json({ok:true,...await resumeTable(env,userId,auth.user)});
    if(url.pathname==="/api/table/spectate")return json({ok:true,...await spectateTable(env,userId,auth.user,body)});
    if(url.pathname==="/api/rating")return json({ok:true,rows:await rating(env,String(body.type||"balance"))});
    if(url.pathname==="/api/feed")return json({ok:true,events:await feed(env)});
    if(url.pathname==="/api/history")return json({ok:true,hands:await history(env,userId)});
    if(url.pathname==="/api/replay")return json({ok:true,replay:await replay(env,userId,String(body.handId||""))});
    if(url.pathname==="/api/blackjack/new")return json({ok:true,...await newBlackjack(env,userId,body.bet,body.requestId||crypto.randomUUID())});
    if(url.pathname==="/api/blackjack/action")return json({ok:true,...await blackjackAction(env,userId,body.gameToken,body.action,body.actionId||crypto.randomUUID())});
    if(url.pathname==="/api/rewards/status")return json({ok:true,rewards:await rewardsStatus(env,userId),achievements:await syncAchievements(env,userId)});
    if(url.pathname==="/api/rewards/streak")return json({ok:true,...await claimStreak(env,userId)});
    if(url.pathname==="/api/rewards/free")return json({ok:true,...await claimFree(env,userId)});
    if(url.pathname==="/api/rewards/low-help")return json({ok:true,...await claimLowBalanceHelp(env,userId)});
    if(url.pathname==="/api/rewards/rescue-start")return json({ok:true,...await startRescue(env,userId)});
    if(url.pathname==="/api/rewards/rescue-claim")return json({ok:true,...await claimRescue(env,userId,body.claimToken)});
    if(url.pathname==="/api/achievements/claim")return json({ok:true,...await claimAchievement(env,userId,body.achievementId)});
    if(url.pathname==="/api/friends")return json({ok:true,friends:await listFriends(env,userId)});
    if(url.pathname==="/api/friends/add")return json({ok:true,...await addFriend(env,userId,body.target)});
    if(url.pathname==="/api/friends/remove")return json({ok:true,...await removeFriend(env,userId,body.friendId)});
    if(url.pathname==="/api/notifications")return json({ok:true,notifications:await notifications(env,userId)});
    if(url.pathname==="/api/notifications/read")return json({ok:true,...await markNotificationRead(env,userId,body.id)});
    if(url.pathname==="/api/tournaments")return json({ok:true,tournaments:await listTournaments(env,userId)});
    if(url.pathname==="/api/tournaments/register")return json({ok:true,...await registerTournament(env,userId,body.tournamentId,body.requestId||crypto.randomUUID())});
    if(url.pathname==="/api/tournaments/unregister")return json({ok:true,...await unregisterTournament(env,userId,body.tournamentId)});
    if(url.pathname==="/api/tournaments/seat"){
      const seat=await tournamentSeat(env,userId,body.tournamentId);
      if(!seat.tableId)return json({ok:true,seat,connectToken:null});
      const table=await getTable(env,seat.tableId),token=await makeConnectToken(env,{user:tokenUser(auth.user),tableId:table.id,buyin:0,mode:"player",exp:Date.now()+300000});
      return json({ok:true,seat,connectToken:token});
    }
    if(url.pathname.startsWith("/admin-api/"))return json({ok:true,...await adminAction(env,userId,url.pathname,body)});
    return json({ok:false,error:"API_NOT_FOUND"},404);
  }catch(error){console.error("API",url.pathname,error);return json({ok:false,error:String(error?.message||"SERVER_ERROR")},400);}
}

async function handleTableWebSocket(request,env,url){
  if(request.headers.get("Upgrade")!=="websocket")return new Response("Upgrade required",{status:426});
  const tableId=decodeURIComponent(url.pathname.split("/").pop()),token=url.searchParams.get("token");
  let payload;try{payload=await verifyConnectToken(env,token);}catch{return new Response("Invalid connection token",{status:401});}
  if(payload.tableId!==tableId||Date.now()>Number(payload.exp))return new Response("Expired token",{status:401});
  const table=await getTable(env,tableId);if(!table||table.status!=="open")return new Response("Table unavailable",{status:404});
  const stub=env.POKER_TABLES.getByName(tableId),headers=new Headers(request.headers);
  headers.set("x-fit-user",JSON.stringify(payload.user));headers.set("x-fit-table",JSON.stringify(table));headers.set("x-fit-mode",payload.mode||"player");headers.set("x-fit-buyin",String(payload.buyin||0));
  return stub.fetch(new Request("https://table-do/connect",{method:"GET",headers}));
}

async function onlineStats(env){
  const [players,tables,tournaments]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS c FROM table_sessions WHERE status IN ('seated','playing','joining')`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS c FROM tables WHERE status='open' AND current_players>0`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS c FROM tournaments WHERE status IN ('running','late_reg')`).first()
  ]);
  return {players:Number(players?.c||0),tables:Number(tables?.c||0),tournaments:Number(tournaments?.c||0)};
}

const TIERS={
  novice:{name:"Новичок",sb:1000,bb:2000,min:100000,max:400000},
  amateur:{name:"Любитель",sb:5000,bb:10000,min:500000,max:2000000},
  pro:{name:"Профессионал",sb:25000,bb:50000,min:2500000,max:10000000},
  high:{name:"High Roller",sb:100000,bb:200000,min:10000000,max:40000000}
};

async function quickPlay(env,userId,tgUser,body){
  const balance=await getBalance(env,userId);let tierKey=String(body.tier||"auto");
  if(tierKey==="auto")tierKey=balance>=TIERS.high.min?"high":balance>=TIERS.pro.min?"pro":balance>=TIERS.amateur.min?"amateur":"novice";
  const tier=TIERS[tierKey];if(!tier)throw new Error("UNKNOWN_TIER");if(balance<tier.min)throw new Error("BALANCE_TOO_LOW");
  const buyin=Math.min(tier.max,Math.max(tier.min,Math.floor(Number(body.buyin||tier.min))));
  let table=await env.DB.prepare(`SELECT * FROM tables WHERE kind='cash' AND visibility='public' AND status='open' AND sb=?1 AND bb=?2 AND current_players<max_players ORDER BY current_players DESC,created_at ASC LIMIT 1`).bind(tier.sb,tier.bb).first();
  if(!table){
    const id=`pub-${tierKey}-${crypto.randomUUID().slice(0,8)}`;
    await env.DB.prepare(`INSERT INTO tables(id,name,kind,visibility,sb,bb,min_buyin,max_buyin,max_players,turn_seconds,status,created_by) VALUES(?1,?2,'cash','public',?3,?4,?5,?6,9,20,'open',?7)`).bind(id,`${tier.name} #${id.slice(-4).toUpperCase()}`,tier.sb,tier.bb,tier.min,tier.max,userId).run();
    table=await getTable(env,id);
  }
  return {table:normalizeTable(table),connectToken:await makeConnectToken(env,{user:tokenUser(tgUser),tableId:table.id,buyin,mode:"player",exp:Date.now()+300000}),buyin};
}

async function createPrivateTable(env,userId,tgUser,body){
  const sb=Math.max(1,Math.floor(Number(body.sb||1000))),bb=Math.max(sb*2,Math.floor(Number(body.bb||sb*2)));
  const min=Math.max(bb*10,Math.floor(Number(body.minBuyin||bb*50))),max=Math.max(min,Math.floor(Number(body.maxBuyin||bb*200)));
  const maxPlayers=Math.min(9,Math.max(2,Math.floor(Number(body.maxPlayers||9)))),turnSeconds=Math.min(60,Math.max(10,Math.floor(Number(body.turnSeconds||20))));
  const id=`private-${crypto.randomUUID()}`,code=randomCode(),password=String(body.password||""),passwordHash=password?await hashPassword(id,password):null;
  await env.DB.prepare(`INSERT INTO tables(id,room_code,name,kind,visibility,password_hash,sb,bb,min_buyin,max_buyin,max_players,turn_seconds,status,created_by) VALUES(?1,?2,?3,'cash','private',?4,?5,?6,?7,?8,?9,?10,'open',?11)`).bind(id,code,String(body.name||"Private Table").slice(0,40),passwordHash,sb,bb,min,max,maxPlayers,turnSeconds,userId).run();
  const buyin=Math.min(max,Math.max(min,Math.floor(Number(body.buyin||min))));
  return {table:normalizeTable(await getTable(env,id)),connectToken:await makeConnectToken(env,{user:tokenUser(tgUser),tableId:id,buyin,mode:"player",exp:Date.now()+300000}),inviteLink:`https://t.me/${env.BOT_USERNAME||"fitpokerclubbot"}?start=room_${code}`};
}

async function joinPrivateTable(env,userId,tgUser,body){
  const code=String(body.code||"").trim().toUpperCase(),table=await env.DB.prepare(`SELECT * FROM tables WHERE room_code=?1 AND visibility='private' AND status='open' LIMIT 1`).bind(code).first();
  if(!table)throw new Error("ROOM_NOT_FOUND");if(table.password_hash&&await hashPassword(table.id,String(body.password||""))!==table.password_hash)throw new Error("WRONG_PASSWORD");
  const balance=await getBalance(env,userId),buyin=Math.min(Number(table.max_buyin),Math.max(Number(table.min_buyin),Math.floor(Number(body.buyin||table.min_buyin))));if(balance<buyin)throw new Error("INSUFFICIENT_FUNDS");
  return {table:normalizeTable(table),connectToken:await makeConnectToken(env,{user:tokenUser(tgUser),tableId:table.id,buyin,mode:"player",exp:Date.now()+300000}),buyin};
}

async function connectExistingTable(env,userId,tgUser,body){
  const table=await getTable(env,String(body.tableId||""));if(!table||table.status!=="open")throw new Error("TABLE_NOT_FOUND");if(table.visibility!=="public")throw new Error("USE_ROOM_CODE");
  const balance=await getBalance(env,userId),buyin=Math.min(Number(table.max_buyin),Math.max(Number(table.min_buyin),Math.floor(Number(body.buyin||table.min_buyin))));if(balance<buyin)throw new Error("INSUFFICIENT_FUNDS");
  return {table:normalizeTable(table),connectToken:await makeConnectToken(env,{user:tokenUser(tgUser),tableId:table.id,buyin,mode:"player",exp:Date.now()+300000}),buyin};
}

async function resumeTable(env,userId,tgUser){
  const session=await env.DB.prepare(`SELECT ts.table_id,ts.buyin,t.* FROM table_sessions ts JOIN tables t ON t.id=ts.table_id WHERE ts.telegram_id=?1 AND t.status='open' LIMIT 1`).bind(String(userId)).first();if(!session)throw new Error("NO_ACTIVE_TABLE");
  return {table:normalizeTable(session),connectToken:await makeConnectToken(env,{user:tokenUser(tgUser),tableId:session.table_id,buyin:Number(session.buyin||0),mode:"player",exp:Date.now()+300000})};
}

async function spectateTable(env,userId,tgUser,body){
  const table=await getTable(env,String(body.tableId||""));if(!table||table.status!=="open"||table.visibility!=="public")throw new Error("TABLE_NOT_PUBLIC");
  return {table:normalizeTable(table),connectToken:await makeConnectToken(env,{user:tokenUser(tgUser),tableId:table.id,buyin:0,mode:"spectator",exp:Date.now()+300000})};
}

async function listPublicTables(env){const rows=(await env.DB.prepare(`SELECT * FROM tables WHERE visibility='public' AND kind='cash' AND status='open' ORDER BY bb ASC,current_players DESC LIMIT 50`).all()).results||[];return rows.map(normalizeTable);}
function normalizeTable(t){return {id:t.id,code:t.room_code,name:t.name,kind:t.kind,visibility:t.visibility,sb:Number(t.sb),bb:Number(t.bb),minBuyin:Number(t.min_buyin),maxBuyin:Number(t.max_buyin),maxPlayers:Number(t.max_players),turnSeconds:Number(t.turn_seconds),currentPlayers:Number(t.current_players),status:t.status,tournamentId:t.tournament_id||null};}
async function getTable(env,id){return env.DB.prepare(`SELECT * FROM tables WHERE id=?1 LIMIT 1`).bind(String(id)).first();}

async function rating(env,type){
  if(type==="season"){const data=await currentSeasonRating(env);return data.rows.map(r=>({place:r.place,telegram_id:r.telegram_id,first_name:r.first_name,username:r.username,photo_url:r.photo_url,level:r.level,xp:0,rating:0,balance:0,profit:0,tournaments_won:0,season_score:r.score}));}
  const order={balance:"w.balance DESC",tournaments:"s.tournaments_won DESC,s.final_tables DESC",profit:"(s.total_won-s.total_lost) DESC",xp:"u.xp DESC",weekly:"u.rating DESC"}[type]||"w.balance DESC";
  const rows=(await env.DB.prepare(`SELECT u.telegram_id,u.username,u.first_name,u.photo_url,u.level,u.xp,u.rating,w.balance,s.tournaments_won,(s.total_won-s.total_lost) AS profit FROM users u JOIN wallets w ON w.telegram_id=u.telegram_id JOIN user_stats s ON s.telegram_id=u.telegram_id WHERE u.is_banned=0 ORDER BY ${order} LIMIT 100`).all()).results||[];
  return rows.map((r,i)=>({place:i+1,...r,balance:Number(r.balance),xp:Number(r.xp),rating:Number(r.rating),profit:Number(r.profit),tournaments_won:Number(r.tournaments_won)}));
}

async function feed(env){const hands=(await env.DB.prepare(`SELECT id,pot,winners,completed_at FROM hands ORDER BY completed_at DESC LIMIT 15`).all()).results||[];return hands.flatMap(h=>{let winners=[];try{winners=JSON.parse(h.winners||"[]");}catch{}return winners.slice(0,2).map(w=>({type:"pot",text:`${w.name||"Игрок"} выиграл банк ${formatShort(h.pot)}`,at:h.completed_at,handId:h.id}));});}
async function history(env,userId){const rows=(await env.DB.prepare(`SELECT h.id,h.table_id,h.hand_no,h.board,h.pot,h.winners,h.completed_at,hp.hole_cards,hp.result,hp.combination FROM hand_players hp JOIN hands h ON h.id=hp.hand_id WHERE hp.telegram_id=?1 ORDER BY h.completed_at DESC LIMIT 50`).bind(userId).all()).results||[];return rows.map(r=>({...r,board:safeJson(r.board),winners:safeJson(r.winners),hole_cards:safeJson(r.hole_cards),pot:Number(r.pot),result:Number(r.result)}));}
async function replay(env,userId,handId){const allowed=await env.DB.prepare(`SELECT 1 AS ok FROM hand_players WHERE hand_id=?1 AND telegram_id=?2 LIMIT 1`).bind(handId,userId).first();if(!allowed)throw new Error("HAND_NOT_FOUND");const hand=await env.DB.prepare(`SELECT * FROM hands WHERE id=?1 LIMIT 1`).bind(handId).first(),actions=(await env.DB.prepare(`SELECT * FROM hand_actions WHERE hand_id=?1 ORDER BY id ASC`).bind(handId).all()).results||[];return {hand:{...hand,board:safeJson(hand.board),winners:safeJson(hand.winners)},actions};}
function tokenUser(u){return {id:String(u.id),name:u.first_name||"Игрок",username:u.username||null,photoUrl:u.photo_url||null};}

async function makeConnectToken(env,payload){const body=b64(new TextEncoder().encode(JSON.stringify(payload))),sig=await sign(env.TELEGRAM_BOT_TOKEN,body);return `${body}.${sig}`;}
async function verifyConnectToken(env,token){const [body,sig]=String(token||"").split(".");if(!body||!sig||sig!==await sign(env.TELEGRAM_BOT_TOKEN,body))throw new Error("BAD_TOKEN");return JSON.parse(new TextDecoder().decode(unb64(body)));}
async function sign(secret,text){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(new Uint8Array(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(text))));}
function b64(bytes){let s="";for(const x of bytes)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function unb64(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const b=atob(s),o=new Uint8Array(b.length);for(let i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o;}
async function hashPassword(id,password){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(`${id}:${password}`));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function randomCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",b=new Uint8Array(6);crypto.getRandomValues(b);let s="";for(const x of b)s+=chars[x%chars.length];return s;}
function safeJson(v){try{return JSON.parse(v);}catch{return null;}}
function formatShort(n){n=Number(n||0);if(n>=1e9)return `${(n/1e9).toFixed(2)}B`;if(n>=1e6)return `${(n/1e6).toFixed(2)}M`;if(n>=1e3)return `${(n/1e3).toFixed(1)}K`;return String(n);}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
