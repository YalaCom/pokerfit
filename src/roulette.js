import { debit, credit } from "./db.js";

const MIN_BET=1000,MAX_BET=1_000_000,TURN_MS=20000;

export async function createRouletteRoom(env,userId,tgUser,body={}){
  userId=String(userId);await ensureNoOtherActiveRoom(env,userId);
  const bet=validateBet(body.bet||10000),maxPlayers=Math.min(3,Math.max(2,Math.floor(Number(body.maxPlayers||3))));
  const id=`rr-${crypto.randomUUID()}`,code=randomCode();
  await env.DB.prepare(`INSERT INTO casino_roulette_rooms(id,room_code,name,bet,max_players,current_players,status,created_by) VALUES(?1,?2,?3,?4,?5,0,'waiting',?6)`).bind(id,code,String(body.name||"FIT Roulette").slice(0,40),bet,maxPlayers,userId).run();
  return {room:normalizeRoom(await getRoom(env,id)),connectToken:await makeToken(env,{roomId:id,user:tokenUser(tgUser),exp:Date.now()+300000})};
}

export async function joinRouletteRoom(env,userId,tgUser,body={}){
  userId=String(userId);const code=String(body.code||"").trim().toUpperCase();
  const room=await env.DB.prepare(`SELECT * FROM casino_roulette_rooms WHERE room_code=?1 AND status IN ('waiting','playing') LIMIT 1`).bind(code).first();
  if(!room)throw new Error("ROOM_NOT_FOUND");
  const own=await env.DB.prepare(`SELECT status FROM casino_roulette_sessions WHERE room_id=?1 AND telegram_id=?2 LIMIT 1`).bind(room.id,userId).first();
  if(!own){await ensureNoOtherActiveRoom(env,userId);if(Number(room.current_players)>=Number(room.max_players))throw new Error("ROOM_FULL");}
  return {room:normalizeRoom(room),connectToken:await makeToken(env,{roomId:room.id,user:tokenUser(tgUser),exp:Date.now()+300000})};
}

export async function resumeRouletteRoom(env,userId,tgUser){
  const row=await env.DB.prepare(`SELECT r.* FROM casino_roulette_sessions s JOIN casino_roulette_rooms r ON r.id=s.room_id WHERE s.telegram_id=?1 AND s.status IN ('joined','playing') AND r.status IN ('waiting','playing') ORDER BY s.updated_at DESC LIMIT 1`).bind(String(userId)).first();
  if(!row)return {room:null,connectToken:null};
  return {room:normalizeRoom(row),connectToken:await makeToken(env,{roomId:row.id,user:tokenUser(tgUser),exp:Date.now()+300000})};
}

export async function listRouletteRooms(env){const rows=(await env.DB.prepare(`SELECT * FROM casino_roulette_rooms WHERE status IN ('waiting','playing') ORDER BY CASE status WHEN 'waiting' THEN 0 ELSE 1 END,created_at DESC LIMIT 30`).all()).results||[];return rows.map(normalizeRoom);}

export async function rouletteWs(request,env,url){
  if(request.headers.get("Upgrade")!=="websocket")return new Response("Upgrade required",{status:426});
  const roomId=decodeURIComponent(url.pathname.split("/").pop());let payload;
  try{payload=await verifyToken(env,url.searchParams.get("token"));}catch{return new Response("Invalid token",{status:401});}
  if(payload.roomId!==roomId||Date.now()>Number(payload.exp))return new Response("Expired token",{status:401});
  const room=await getRoom(env,roomId);if(!room)return new Response("Room not found",{status:404});
  const stub=env.ROULETTE_ROOMS.getByName(roomId),headers=new Headers(request.headers);headers.set("x-fit-user",JSON.stringify(payload.user));headers.set("x-fit-room",JSON.stringify(room));
  return stub.fetch(new Request("https://roulette-do/connect",{headers}));
}

export class RussianRouletteDO{
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.state=null;this.ready=this.load();}
  async load(){this.state=await this.ctx.storage.get("state")||null;}
  async fetch(request){await this.ready;const url=new URL(request.url);if(url.pathname==="/connect"&&request.headers.get("Upgrade")==="websocket")return this.connect(request);return new Response("Not found",{status:404});}
  async connect(request){
    const user=JSON.parse(request.headers.get("x-fit-user")||"{}"),room=JSON.parse(request.headers.get("x-fit-room")||"{}");if(!user.id)return new Response("Unauthorized",{status:401});
    if(!this.state)this.state={id:room.id,code:room.room_code,name:room.name,bet:Number(room.bet),maxPlayers:Number(room.max_players),creatorId:String(room.created_by||""),status:room.status||"waiting",players:[],turnIndex:0,chamber:0,bullet:secureInt(6),history:[],pot:0,round:1,turnDeadline:null,winner:null};
    const userId=String(user.id);let player=this.state.players.find(p=>p.id===userId);
    if(!player){
      const known=await this.env.DB.prepare(`SELECT status FROM casino_roulette_sessions WHERE room_id=?1 AND telegram_id=?2 LIMIT 1`).bind(this.state.id,userId).first();
      if(this.state.status!=="waiting"&&!known)return new Response("Round already started",{status:409});
      if(this.state.players.length>=this.state.maxPlayers&&!known)return new Response("Room full",{status:409});
      if(!known){
        const d=await debit(this.env,userId,this.state.bet,"ROULETTE_BUYIN",`roulette:buyin:${this.state.id}:${userId}`,{roomId:this.state.id});if(!d.applied)return new Response("Join already processed",{status:409});
        await this.env.DB.prepare(`INSERT OR REPLACE INTO casino_roulette_sessions(room_id,telegram_id,status,updated_at) VALUES(?1,?2,'joined',CURRENT_TIMESTAMP)`).bind(this.state.id,userId).run();
      }
      player={id:userId,name:user.name||"Игрок",username:user.username||null,photoUrl:user.photoUrl||null,alive:true,connected:true,seat:this.state.players.length};this.state.players.push(player);this.reseat();this.state.pot=this.state.players.length*this.state.bet;await this.syncRoom();
    }else player.connected=true;
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];this.ctx.acceptWebSocket(server);server.serializeAttachment({userId});await this.persist();await this.broadcast();return new Response(null,{status:101,webSocket:client});
  }
  async webSocketMessage(ws,message){
    await this.ready;let data;try{data=JSON.parse(typeof message==="string"?message:new TextDecoder().decode(message));}catch{return;}
    const a=ws.deserializeAttachment()||{},userId=String(a.userId||"");
    try{if(data.type==="start")return await this.start(userId);if(data.type==="pull")return await this.pull(userId,false);if(data.type==="leave")return await this.leave(userId);}catch(error){this.send(ws,{type:"error",error:String(error?.message||"ACTION_FAILED")});}
  }
  async webSocketClose(ws){await this.ready;const a=ws.deserializeAttachment()||{},p=this.state?.players.find(x=>x.id===String(a.userId));if(p){p.connected=false;await this.persist();await this.broadcast();}}
  async webSocketError(ws){return this.webSocketClose(ws);}
  async start(userId){
    if(this.state.status!=="waiting")throw new Error("ALREADY_STARTED");if(this.state.players.length<2)throw new Error("NEED_TWO_PLAYERS");if(userId!==this.state.creatorId&&this.state.players.length<this.state.maxPlayers)throw new Error("ONLY_CREATOR_CAN_START_EARLY");
    this.state.status="playing";this.state.turnIndex=0;this.state.chamber=0;this.state.bullet=secureInt(6);this.state.history=[];this.state.winner=null;this.state.players.forEach(p=>p.alive=true);
    for(const p of this.state.players)await this.env.DB.prepare(`UPDATE casino_roulette_sessions SET status='playing',updated_at=CURRENT_TIMESTAMP WHERE room_id=?1 AND telegram_id=?2`).bind(this.state.id,p.id).run();
    this.scheduleTurn();await this.syncRoom();await this.persist();await this.broadcast();
  }
  async pull(userId,automatic=false){
    if(this.state.status!=="playing")throw new Error("NOT_PLAYING");const player=this.current();if(!player||player.id!==userId)throw new Error("NOT_YOUR_TURN");
    const fired=this.state.chamber===this.state.bullet;this.state.history.push({id:crypto.randomUUID(),playerId:player.id,name:player.name,fired,automatic,chamber:this.state.chamber,at:Date.now()});
    if(fired){player.alive=false;const alive=this.alive();if(alive.length===1)return await this.finish(alive[0]);this.state.bullet=secureInt(6);this.state.chamber=0;this.moveNext();}else{this.state.chamber=(this.state.chamber+1)%6;this.moveNext();}
    this.scheduleTurn();await this.persist();await this.broadcast();
  }
  async leave(userId){
    const idx=this.state.players.findIndex(p=>p.id===String(userId));if(idx<0)return;
    if(this.state.status!=="waiting")throw new Error("CANNOT_LEAVE_ACTIVE_ROUND");
    const p=this.state.players[idx];this.state.players.splice(idx,1);this.reseat();this.state.pot=this.state.players.length*this.state.bet;
    await credit(this.env,p.id,this.state.bet,"ROULETTE_REFUND",`roulette:refund:${this.state.id}:${p.id}`,{roomId:this.state.id});
    await this.env.DB.prepare(`DELETE FROM casino_roulette_sessions WHERE room_id=?1 AND telegram_id=?2`).bind(this.state.id,p.id).run();
    if(this.state.creatorId===p.id)this.state.creatorId=this.state.players[0]?.id||"";
    if(this.state.players.length===0){this.state.status="cancelled";await this.env.DB.prepare(`UPDATE casino_roulette_rooms SET status='cancelled',current_players=0,updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(this.state.id).run();}else await this.syncRoom();
    await this.persist();await this.broadcast();
  }
  reseat(){this.state.players.forEach((p,i)=>p.seat=i);if(this.state.turnIndex>=this.state.players.length)this.state.turnIndex=0;}
  moveNext(){const n=this.state.players.length;for(let step=1;step<=n;step++){const i=(this.state.turnIndex+step)%n;if(this.state.players[i]?.alive){this.state.turnIndex=i;return;}}}
  current(){return this.state.players[this.state.turnIndex]||null;}alive(){return this.state.players.filter(p=>p.alive);}
  scheduleTurn(){this.state.turnDeadline=Date.now()+TURN_MS;this.ctx.storage.setAlarm(this.state.turnDeadline);}
  async alarm(){await this.ready;if(this.state?.status==="playing"&&this.state.turnDeadline&&Date.now()>=this.state.turnDeadline){const p=this.current();if(p)await this.pull(p.id,true);}}
  async finish(winner){
    this.state.status="finished";this.state.winner={id:winner.id,name:winner.name,payout:this.state.pot};this.state.turnDeadline=null;
    await credit(this.env,winner.id,this.state.pot,"ROULETTE_WIN",`roulette:win:${this.state.id}:${this.state.round}`,{roomId:this.state.id,players:this.state.players.length});
    await this.env.DB.batch(this.state.players.map(p=>this.env.DB.prepare(`UPDATE casino_roulette_sessions SET status='finished',updated_at=CURRENT_TIMESTAMP WHERE room_id=?1 AND telegram_id=?2`).bind(this.state.id,p.id)));
    await this.env.DB.prepare(`UPDATE casino_roulette_rooms SET status='finished',updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(this.state.id).run();await this.persist();await this.broadcast();
  }
  async syncRoom(){await this.env.DB.prepare(`UPDATE casino_roulette_rooms SET current_players=?2,status=?3,created_by=?4,updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(this.state.id,this.state.players.length,this.state.status,this.state.creatorId).run();}
  snapshot(){return {id:this.state.id,code:this.state.code,name:this.state.name,bet:this.state.bet,maxPlayers:this.state.maxPlayers,creatorId:this.state.creatorId,status:this.state.status,pot:this.state.pot,turnIndex:this.state.turnIndex,turnDeadline:this.state.turnDeadline,winner:this.state.winner,history:this.state.history.slice(-12),players:this.state.players.map(p=>({...p}))};}
  async broadcast(){const payload=JSON.stringify({type:"snapshot",room:this.snapshot(),serverTime:Date.now()});for(const ws of this.ctx.getWebSockets())try{ws.send(payload);}catch{}}
  send(ws,data){try{ws.send(JSON.stringify(data));}catch{}}async persist(){await this.ctx.storage.put("state",this.state);}
}

async function ensureNoOtherActiveRoom(env,userId){const active=await env.DB.prepare(`SELECT s.room_id FROM casino_roulette_sessions s JOIN casino_roulette_rooms r ON r.id=s.room_id WHERE s.telegram_id=?1 AND s.status IN ('joined','playing') AND r.status IN ('waiting','playing') LIMIT 1`).bind(String(userId)).first();if(active)throw new Error("ALREADY_IN_ROULETTE_ROOM");}
function normalizeRoom(r){return {id:r.id,code:r.room_code,name:r.name,bet:Number(r.bet),maxPlayers:Number(r.max_players),currentPlayers:Number(r.current_players),status:r.status,createdBy:String(r.created_by||"")};}
async function getRoom(env,id){return env.DB.prepare(`SELECT * FROM casino_roulette_rooms WHERE id=?1 LIMIT 1`).bind(String(id)).first();}
function validateBet(v){const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<MIN_BET)throw new Error("MIN_BET_1K");if(n>MAX_BET)throw new Error("MAX_BET_1M");return n;}
function tokenUser(u){return {id:String(u.id),name:u.first_name||"Игрок",username:u.username||null,photoUrl:u.photo_url||null};}
function randomCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",b=new Uint8Array(6);crypto.getRandomValues(b);return [...b].map(x=>chars[x%chars.length]).join("");}
function secureInt(max){const lim=0x100000000-(0x100000000%max),b=new Uint32Array(1);do crypto.getRandomValues(b);while(b[0]>=lim);return b[0]%max;}
async function makeToken(env,payload){const body=b64(new TextEncoder().encode(JSON.stringify(payload))),sig=await sign(env.TELEGRAM_BOT_TOKEN,body);return `${body}.${sig}`;}
async function verifyToken(env,token){const [body,sig]=String(token||"").split(".");if(!body||!sig||sig!==await sign(env.TELEGRAM_BOT_TOKEN,body))throw new Error();return JSON.parse(new TextDecoder().decode(unb64(body)));}
async function sign(secret,text){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(new Uint8Array(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(text))));}
function b64(bytes){let s="";for(const x of bytes)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function unb64(s){s=String(s||"").replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const b=atob(s),o=new Uint8Array(b.length);for(let i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o;}
