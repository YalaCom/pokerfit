import baseWorker,{PokerTableDO as BasePokerTableDO} from "./index.js";
import {authenticateJsonRequest} from "./auth.js";
import {ensurePlayer} from "./db.js";
import {playSlots,playWheel,playDice,startCrash,crashStatus,crashCashout} from "./casino.js";

export class PokerTableDO extends BasePokerTableDO{
  async webSocketMessage(ws,message){
    let data;
    try{data=JSON.parse(typeof message==="string"?message:new TextDecoder().decode(message));}
    catch{return super.webSocketMessage(ws,message);}
    if(data?.type!=="chat")return super.webSocketMessage(ws,message);
    await this.ready;
    const attachment=ws.deserializeAttachment()||{};
    if(attachment.mode!=="player")return;
    const now=Date.now();
    if(now-Number(attachment.lastChatAt||0)<3500)return this.send(ws,{type:"error",error:"CHAT_COOLDOWN"});
    const text=String(data.text||"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim();
    if(!text)return this.send(ws,{type:"error",error:"CHAT_EMPTY"});
    if(text.length>60)return this.send(ws,{type:"error",error:"CHAT_TOO_LONG"});
    attachment.lastChatAt=now;ws.serializeAttachment(attachment);
    const seat=this.findSeat(attachment.userId);
    await this.broadcastEvent({type:"chat",userId:String(attachment.userId),name:seat?.name||"Игрок",text,at:now});
  }
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname.startsWith("/api/casino/"))return handleCasinoApi(request,env,url);
    return baseWorker.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){return baseWorker.scheduled?.(controller,env,ctx);}
};

async function handleCasinoApi(request,env,url){
  if(request.method!=="POST")return json({ok:false,error:"POST_REQUIRED"},405);
  const auth=await authenticateJsonRequest(request,env);
  if(!auth.ok)return json({ok:false,error:auth.error},401);
  try{await ensurePlayer(env,auth.user);}catch(error){return json({ok:false,error:String(error?.message||"PLAYER_ERROR")},403);}
  const userId=String(auth.user.id),body=auth.body||{};
  try{
    if(url.pathname==="/api/casino/slots")return json({ok:true,...await playSlots(env,userId,body.bet,body.requestId||crypto.randomUUID())});
    if(url.pathname==="/api/casino/wheel")return json({ok:true,...await playWheel(env,userId,body.bet,body.requestId||crypto.randomUUID())});
    if(url.pathname==="/api/casino/dice")return json({ok:true,...await playDice(env,userId,body.bet,body.requestId||crypto.randomUUID(),body.choice,body.target)});
    if(url.pathname==="/api/casino/crash/start")return json({ok:true,...await startCrash(env,userId,body.bet,body.requestId||crypto.randomUUID())});
    if(url.pathname==="/api/casino/crash/status")return json({ok:true,...await crashStatus(env,userId,body.token)});
    if(url.pathname==="/api/casino/crash/cashout")return json({ok:true,...await crashCashout(env,userId,body.token,body.actionId||crypto.randomUUID())});
    return json({ok:false,error:"CASINO_ROUTE_NOT_FOUND"},404);
  }catch(error){console.error("CASINO",url.pathname,error);return json({ok:false,error:String(error?.message||"CASINO_ERROR")},400);}
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
