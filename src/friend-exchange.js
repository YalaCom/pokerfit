import {credit,debit,getBalance} from "./db.js";
import {primaryAdminId} from "./virtual-chips.js";

const TOPUP_CHIPS=500_000;
const WITHDRAW_CHIPS=1_000_000;
const DISPLAY_RUBLES=1;

export async function createFriendExchangeRequest(env,userId,tgUser,kind){
  userId=String(userId);kind=String(kind||"");
  if(!["topup","withdraw"].includes(kind))throw new Error("BAD_EXCHANGE_KIND");

  const pending=await env.DB.prepare(`SELECT * FROM friend_exchange_requests WHERE telegram_id=?1 AND kind=?2 AND status='pending' ORDER BY created_at DESC LIMIT 1`).bind(userId,kind).first();
  if(pending)return {request:normalize(pending),alreadyPending:true,balance:await getBalance(env,userId)};

  const chipAmount=kind==="topup"?TOPUP_CHIPS:WITHDRAW_CHIPS;
  const id=`fx-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO friend_exchange_requests(id,telegram_id,kind,chip_amount,display_rubles,status) VALUES(?1,?2,?3,?4,?5,'pending')`).bind(id,userId,kind,chipAmount,DISPLAY_RUBLES).run();

  let balance=await getBalance(env,userId);
  if(kind==="withdraw"){
    try{
      const d=await debit(env,userId,WITHDRAW_CHIPS,"FRIEND_WITHDRAW_REQUEST",`friend-exchange:${id}:debit`,{requestId:id,displayRubles:DISPLAY_RUBLES});
      balance=d.balance;
      await env.DB.batch([
        env.DB.prepare(`UPDATE jackpot_pools SET balance=balance+?2,updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind("grand",WITHDRAW_CHIPS),
        env.DB.prepare(`INSERT OR IGNORE INTO jackpot_events(request_key,telegram_id,type,amount,metadata) VALUES(?1,?2,'FRIEND_WITHDRAW_TO_JACKPOT',?3,?4)`).bind(`friend-exchange:${id}:jackpot`,userId,WITHDRAW_CHIPS,JSON.stringify({requestId:id,displayRubles:DISPLAY_RUBLES}))
      ]);
    }catch(error){
      try{await env.DB.prepare(`DELETE FROM friend_exchange_requests WHERE id=?1 AND status='pending'`).bind(id).run();}catch{}
      throw error;
    }
  }

  const request=await env.DB.prepare(`SELECT * FROM friend_exchange_requests WHERE id=?1`).bind(id).first();
  const adminId=await primaryAdminId(env);if(adminId)await notifyAdmin(env,adminId,request,tgUser);
  return {request:normalize(request),alreadyPending:false,balance};
}

export async function approveFriendExchangeRequest(env,actorId,requestId){
  actorId=String(actorId);requestId=String(requestId||"");
  const adminId=await primaryAdminId(env);if(!adminId||actorId!==String(adminId))throw new Error("ADMIN_ONLY");
  const req=await env.DB.prepare(`SELECT * FROM friend_exchange_requests WHERE id=?1 LIMIT 1`).bind(requestId).first();
  if(!req)throw new Error("REQUEST_NOT_FOUND");
  if(req.status!=="pending")return {request:normalize(req),duplicate:true,balance:await getBalance(env,req.telegram_id)};

  const changed=await env.DB.prepare(`UPDATE friend_exchange_requests SET status='approved',resolved_at=CURRENT_TIMESTAMP,resolved_by=?2 WHERE id=?1 AND status='pending' RETURNING *`).bind(requestId,actorId).first();
  if(!changed)return {request:normalize(req),duplicate:true,balance:await getBalance(env,req.telegram_id)};

  let balance=await getBalance(env,req.telegram_id);
  if(req.kind==="topup"){
    const c=await credit(env,req.telegram_id,Number(req.chip_amount),"FRIEND_TOPUP_APPROVED",`friend-exchange:${requestId}:credit`,{requestId,displayRubles:Number(req.display_rubles)});
    balance=c.balance;
  }
  await addNotification(env,req.telegram_id,req.kind==="topup"?"Пополнение подтверждено":"Вывод подтвержден",req.kind==="topup"?`+${Number(req.chip_amount).toLocaleString("ru-RU")} фишек за 1 ₽.`:`${Number(req.chip_amount).toLocaleString("ru-RU")} фишек списано. Вывод на 1 ₽ подтвержден.`,requestId);
  return {request:normalize(changed),approved:true,balance};
}

export async function notifyFriendExchangeResolution(env,request,balance){
  const text=request.kind==="topup"
    ?`✅ ПОПОЛНЕНИЕ ПОДТВЕРЖДЕНО\n\n1 ₽ → +${Number(request.chipAmount).toLocaleString("ru-RU")} фишек\nБаланс: ${Number(balance).toLocaleString("ru-RU")}`
    :`✅ ВЫВОД ПОДТВЕРЖДЕН\n\n${Number(request.chipAmount).toLocaleString("ru-RU")} фишек → 1 ₽\nБаланс: ${Number(balance).toLocaleString("ru-RU")}`;
  await telegramCall(env,"sendMessage",{chat_id:request.telegramId,text});
}

export async function answerFriendExchangeCallback(env,callback,text){
  await telegramCall(env,"answerCallbackQuery",{callback_query_id:callback.id,text,show_alert:false});
  if(callback.message?.chat?.id&&callback.message?.message_id){try{await telegramCall(env,"editMessageReplyMarkup",{chat_id:callback.message.chat.id,message_id:callback.message.message_id,reply_markup:{inline_keyboard:[]}});}catch{}}
}

async function notifyAdmin(env,adminId,request,tgUser){
  const name=[tgUser?.first_name,tgUser?.last_name].filter(Boolean).join(" ")||"Игрок";
  const username=tgUser?.username?`@${tgUser.username}`:"без username";
  const isTopup=request.kind==="topup";
  const text=isTopup
    ?`💳 FIT POKER • ПОПОЛНЕНИЕ\n\n${name} (${username})\nTelegram ID: ${request.telegram_id}\n1 ₽ → +${Number(request.chip_amount).toLocaleString("ru-RU")} фишек\n\nНажми подтвердить.`
    :`💸 FIT POKER • ВЫВОД\n\n${name} (${username})\nTelegram ID: ${request.telegram_id}\n${Number(request.chip_amount).toLocaleString("ru-RU")} фишек → 1 ₽\n\nФишки уже списаны и добавлены в Jackpot-банк. Нажми подтвердить.`;
  await telegramCall(env,"sendMessage",{chat_id:adminId,text,reply_markup:{inline_keyboard:[[{text:"✅ ПОДТВЕРДИТЬ",callback_data:`fx:approve:${request.id}`}]]}});
}

async function addNotification(env,userId,title,body,requestId){try{await env.DB.prepare(`INSERT INTO notifications(telegram_id,type,title,body,payload) VALUES(?1,?2,?3,?4,?5)`).bind(String(userId),`friend-exchange:${requestId}`,title,body,JSON.stringify({requestId})).run();}catch{}}
async function telegramCall(env,method,payload){const token=env.TELEGRAM_BOT_TOKEN;if(!token)return null;const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});return r.json().catch(()=>null);}
function normalize(r){return r?{id:r.id,telegramId:String(r.telegram_id),kind:r.kind,chipAmount:Number(r.chip_amount),displayRubles:Number(r.display_rubles),status:r.status,createdAt:r.created_at,resolvedAt:r.resolved_at||null}:null;}
