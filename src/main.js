import baseWorker,{PokerTableDO as BasePokerTableDO} from "./index.js";
import {authenticateJsonRequest} from "./auth.js";
import {ensurePlayer,debit} from "./db.js";
import {playSlots,playMegaSlots,playWheel,playDice,playCoinflip,playBaccarat,startCrash,crashStatus,crashCashout} from "./casino.js";
import {playAdvancedSlot} from "./advanced-slots.js";
import {playMoreSlot} from "./more-slots.js";
import {playJackpotSlot,jackpotStatus} from "./jackpot-slot.js";
import {recordJackpotLoss} from "./jackpot-bank.js";
import {requestVirtualChips} from "./virtual-chips.js";
import {createFriendExchangeRequest} from "./friend-exchange.js";
import {playBalancedPlinko} from "./plinko.js";
import {RussianRouletteDO,createRouletteRoom,joinRouletteRoom,resumeRouletteRoom,listRouletteRooms,rouletteWs} from "./roulette.js";

export {RussianRouletteDO};

export class PokerTableDO extends BasePokerTableDO{
  async webSocketMessage(ws,message){
    let data;try{data=JSON.parse(typeof message==="string"?message:new TextDecoder().decode(message));}catch{return super.webSocketMessage(ws,message);}
    if(data?.type!=="chat")return super.webSocketMessage(ws,message);
    await this.ready;const attachment=ws.deserializeAttachment()||{};if(attachment.mode!=="player")return;
    const now=Date.now();if(now-Number(attachment.lastChatAt||0)<3500)return this.send(ws,{type:"error",error:"CHAT_COOLDOWN"});
    const text=String(data.text||"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim();if(!text)return this.send(ws,{type:"error",error:"CHAT_EMPTY"});if(text.length>60)return this.send(ws,{type:"error",error:"CHAT_TOO_LONG");
    attachment.lastChatAt=now;ws.serializeAttachment(attachment);const seat=this.findSeat(attachment.userId);await this.broadcastEvent({type:"chat",userId:String(attachment.userId),name:seat?.name||"Игрок",text,at:now});
  }
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname.startsWith("/ws/roulette/"))return rouletteWs(request,env,url);
    if(url.pathname==="/api/virtual-chips/request")return handleVirtualChipApi(request,env);
    if(url.pathname==="/api/friend-exchange/topup")return handleFriendExchangeApi(request,env,"topup");
    if(url.pathname==="/api/friend-exchange/withdraw")return handleFriendExchangeApi(request,env,"withdraw");
    if(url.pathname.startsWith("/api/casino/"))return handleCasinoApi(request,env,url);
    return baseWorker.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){return baseWorker.scheduled?.(controller,env,ctx);}
};

async function authenticatePlayer(request,env){
  if(request.method!=="POST")return {response:json({ok:false,error:"POST_REQUIRED"},405)};
  const auth=await authenticateJsonRequest(request,env);if(!auth.ok)return {response:json({ok:false,error:auth.error},401)};
  try{await ensurePlayer(env,auth.user);}catch(error){return {response:json({ok:false,error:String(error?.message||"PLAYER_ERROR")},403)};}
  return {auth,userId:String(auth.user.id),body:auth.body||{}};
}

async function handleVirtualChipApi(request,env){
  const a=await authenticatePlayer(request,env);if(a.response)return a.response;
  try{return json({ok:true,...await requestVirtualChips(env,a.userId,a.auth.user)});}catch(error){console.error("virtual chips",error);return json({ok:false,error:String(error?.message||"REQUEST_ERROR")},400);}
}

async function handleFriendExchangeApi(request,env,kind){
  const a=await authenticatePlayer(request,env);if(a.response)return a.response;
  try{return json({ok:true,...await createFriendExchangeRequest(env,a.userId,a.auth.user,kind)});}catch(error){console.error("friend exchange",kind,error);return json({ok:false,error:String(error?.message||"EXCHANGE_ERROR")},400);}
}

async function capCasinoResult(env,userId,result,source){
  if(!result?.roundId)return result;
  const bet=Math.max(0,Math.floor(Number(result.bet)||0));if(!bet)return result;
  const jackpotPart=source==="GRAND_FORTUNE"?Math.max(0,Math.floor(Number(result.result?.jackpotPayout)||0)):0;
  const total=Math.max(0,Math.floor(Number(result.payout)||0));
  const normal=Math.max(0,total-jackpotPart),maxNormal=bet*1000;
  if(normal<=maxNormal)return result;
  const excess=normal-maxNormal;
  const d=await debit(env,userId,excess,"CASINO_MAX_WIN_CAP",`casino:maxwin:${source}:${result.roundId}`,{source,roundId:result.roundId,bet,maxWin:maxNormal,excess});
  const payout=maxNormal+jackpotPart,multiplier=Math.floor((payout/Math.max(1,bet))*100)/100;
  const nested=result.result?{...result.result,normalPayout:Math.min(maxNormal,Math.max(0,Number(result.result.normalPayout??normal))),multiplier,maxWin:maxNormal,maxWinHit:true}:result.result;
  return {...result,payout,multiplier,balance:d.balance,result:nested,maxWin:maxNormal,maxWinHit:true};
}

async function houseResult(env,userId,result,source){
  const capped=await capCasinoResult(env,userId,result,source);
  if(!capped?.roundId)return capped;
  const status=await recordJackpotLoss(env,userId,capped.roundId,capped.bet,capped.payout,source);
  return {...capped,jackpotPool:status.pool,jackpotAdded:status.added,maxWin:Math.max(0,Number(capped.bet||0))*1000};
}

async function handleCasinoApi(request,env,url){
  const a=await authenticatePlayer(request,env);if(a.response)return a.response;
  const {auth,userId,body}=a;
  try{
    if(url.pathname==="/api/casino/slots")return json({ok:true,...await houseResult(env,userId,await playSlots(env,userId,body.bet,body.requestId||crypto.randomUUID()),"SLOTS")});
    if(url.pathname==="/api/casino/mega-slots")return json({ok:true,...await houseResult(env,userId,await playMegaSlots(env,userId,body.bet,body.requestId||crypto.randomUUID()),"MEGA_SLOTS")});
    if(url.pathname==="/api/casino/advanced-slot/spin")return json({ok:true,...await houseResult(env,userId,await playAdvancedSlot(env,userId,body.slotId,body.bet,body.requestId||crypto.randomUUID()),`ADV_${String(body.slotId||"")}`)});
    if(url.pathname==="/api/casino/more-slot/spin")return json({ok:true,...await houseResult(env,userId,await playMoreSlot(env,userId,body.slotId,body.bet,body.requestId||crypto.randomUUID()),`MORE_${String(body.slotId||"")}`)});
    if(url.pathname==="/api/casino/jackpot/status")return json({ok:true,...await jackpotStatus(env)});
    if(url.pathname==="/api/casino/jackpot/spin")return json({ok:true,...await houseResult(env,userId,await playJackpotSlot(env,userId,body.bet,body.requestId||crypto.randomUUID()),"GRAND_FORTUNE")});
    if(url.pathname==="/api/casino/wheel")return json({ok:true,...await houseResult(env,userId,await playWheel(env,userId,body.bet,body.requestId||crypto.randomUUID()),"WHEEL")});
    if(url.pathname==="/api/casino/dice")return json({ok:true,...await houseResult(env,userId,await playDice(env,userId,body.bet,body.requestId||crypto.randomUUID(),body.choice,body.target),"DICE")});
    if(url.pathname==="/api/casino/coinflip")return json({ok:true,...await houseResult(env,userId,await playCoinflip(env,userId,body.bet,body.requestId||crypto.randomUUID(),body.choice),"COINFLIP")});
    if(url.pathname==="/api/casino/plinko")return json({ok:true,...await houseResult(env,userId,await playBalancedPlinko(env,userId,body.bet,body.requestId||crypto.randomUUID(),body.risk),"PLINKO")});
    if(url.pathname==="/api/casino/baccarat")return json({ok:true,...await houseResult(env,userId,await playBaccarat(env,userId,body.bet,body.requestId||crypto.randomUUID(),body.choice),"BACCARAT")});
    if(url.pathname==="/api/casino/crash/start")return json({ok:true,...await startCrash(env,userId,body.bet,body.requestId||crypto.randomUUID())});
    if(url.pathname==="/api/casino/crash/status")return json({ok:true,...await crashStatus(env,userId,body.token)});
    if(url.pathname==="/api/casino/crash/cashout")return json({ok:true,...await crashCashout(env,userId,body.token,body.actionId||crypto.randomUUID())});
    if(url.pathname==="/api/casino/roulette/list")return json({ok:true,rooms:await listRouletteRooms(env)});
    if(url.pathname==="/api/casino/roulette/create")return json({ok:true,...await createRouletteRoom(env,userId,auth.user,body)});
    if(url.pathname==="/api/casino/roulette/join")return json({ok:true,...await joinRouletteRoom(env,userId,auth.user,body)});
    if(url.pathname==="/api/casino/roulette/resume")return json({ok:true,...await resumeRouletteRoom(env,userId,auth.user)});
    return json({ok:false,error:"CASINO_ROUTE_NOT_FOUND"},404);
  }catch(error){console.error("CASINO",url.pathname,error);return json({ok:false,error:String(error?.message||"CASINO_ERROR")},400);}
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
