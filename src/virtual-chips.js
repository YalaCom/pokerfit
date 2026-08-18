import {credit,getBalance} from "./db.js";

const REQUEST_AMOUNT=500_000;

export async function requestVirtualChips(env,userId,tgUser){
  userId=String(userId);
  const pending=await env.DB.prepare(`SELECT * FROM virtual_chip_requests WHERE telegram_id=?1 AND status='pending' ORDER BY created_at DESC LIMIT 1`).bind(userId).first();
  if(pending)return {request:normalize(pending),alreadyPending:true};

  const recent=await env.DB.prepare(`SELECT created_at FROM virtual_chip_requests WHERE telegram_id=?1 ORDER BY created_at DESC LIMIT 1`).bind(userId).first();
  if(recent){
    const age=Date.now()-Date.parse(recent.created_at+(/Z$/.test(recent.created_at)?"":"Z"));
    if(Number.isFinite(age)&&age<5*60*1000)throw new Error("REQUEST_COOLDOWN");
  }

  const id=`vc-${crypto.randomUUID()}`;
  await env.DB.prepare(`INSERT INTO virtual_chip_requests(id,telegram_id,amount,status) VALUES(?1,?2,?3,'pending')`).bind(id,userId,REQUEST_AMOUNT).run();
  const request=await env.DB.prepare(`SELECT * FROM virtual_chip_requests WHERE id=?1`).bind(id).first();
  const adminId=await primaryAdminId(env);
  if(adminId)await sendAdminRequest(env,adminId,request,tgUser);
  return {request:normalize(request),alreadyPending:false};
}

export async function resolveVirtualChipRequest(env,actorId,requestId,action){
  actorId=String(actorId);requestId=String(requestId||"");action=String(action||"");
  const adminId=await primaryAdminId(env);
  if(!adminId||actorId!==String(adminId))throw new Error("ADMIN_ONLY");
  const req=await env.DB.prepare(`SELECT * FROM virtual_chip_requests WHERE id=?1 LIMIT 1`).bind(requestId).first();
  if(!req)throw new Error("REQUEST_NOT_FOUND");
  if(req.status!=="pending")return {request:normalize(req),duplicate:true,balance:await getBalance(env,req.telegram_id)};

  if(action==="approve"){
    const changed=await env.DB.prepare(`UPDATE virtual_chip_requests SET status='approved',resolved_at=CURRENT_TIMESTAMP,resolved_by=?2 WHERE id=?1 AND status='pending' RETURNING *`).bind(requestId,actorId).first();
    if(!changed){const latest=await env.DB.prepare(`SELECT * FROM virtual_chip_requests WHERE id=?1`).bind(requestId).first();return {request:normalize(latest),duplicate:true,balance:await getBalance(env,req.telegram_id)};}
    const result=await credit(env,req.telegram_id,Number(req.amount),"VIRTUAL_CHIP_REQUEST",`virtual-chip-request:${requestId}:credit`,{requestId,approvedBy:actorId});
    await addNotification(env,req.telegram_id,`Заявка подтверждена`,`На баланс начислено ${Number(req.amount).toLocaleString("ru-RU")} виртуальных фишек.`,requestId);
    return {request:normalize(changed),balance:result.balance,approved:true};
  }

  if(action==="reject"){
    const changed=await env.DB.prepare(`UPDATE virtual_chip_requests SET status='rejected',resolved_at=CURRENT_TIMESTAMP,resolved_by=?2 WHERE id=?1 AND status='pending' RETURNING *`).bind(requestId,actorId).first();
    await addNotification(env,req.telegram_id,"Заявка отклонена","Запрос виртуальных фишек отклонён администратором.",requestId);
    return {request:normalize(changed||req),balance:await getBalance(env,req.telegram_id),rejected:true};
  }
  throw new Error("BAD_ACTION");
}

export async function primaryAdminId(env){
  const configured=String(env.ADMIN_TELEGRAM_IDS||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(configured.length)return configured[0];
  const first=await env.DB.prepare(`SELECT telegram_id FROM users ORDER BY created_at ASC,telegram_id ASC LIMIT 1`).first();
  return first?.telegram_id?String(first.telegram_id):null;
}

async function sendAdminRequest(env,adminId,request,tgUser){
  const name=[tgUser?.first_name,tgUser?.last_name].filter(Boolean).join(" ")||"Игрок";
  const username=tgUser?.username?`@${tgUser.username}`:"без username";
  const text=`🎟 FIT POKER • ЗАПРОС ФИШЕК\n\n${name} (${username})\nTelegram ID: ${request.telegram_id}\nЗапрашивает: +${Number(request.amount).toLocaleString("ru-RU")} виртуальных фишек\n\nЭто только игровые фишки без денежной стоимости.`;
  await telegramCall(env,"sendMessage",{chat_id:adminId,text,reply_markup:{inline_keyboard:[[{text:"✅ НАЧИСЛИТЬ",callback_data:`vchip:approve:${request.id}`},{text:"❌ ОТКЛОНИТЬ",callback_data:`vchip:reject:${request.id}`}]]}});
}

export async function notifyVirtualChipResolution(env,request,approved,balance){
  const text=approved
    ?`✅ Заявка подтверждена.\n+${Number(request.amount).toLocaleString("ru-RU")} виртуальных фишек\nБаланс: ${Number(balance).toLocaleString("ru-RU")}`
    :`❌ Заявка на виртуальные фишки отклонена.`;
  await telegramCall(env,"sendMessage",{chat_id:request.telegramId,text});
}

export async function answerVirtualChipCallback(env,callback,text){
  await telegramCall(env,"answerCallbackQuery",{callback_query_id:callback.id,text,show_alert:false});
  if(callback.message?.chat?.id&&callback.message?.message_id){
    try{await telegramCall(env,"editMessageReplyMarkup",{chat_id:callback.message.chat.id,message_id:callback.message.message_id,reply_markup:{inline_keyboard:[]}});}catch{}
  }
}

async function addNotification(env,userId,title,body,requestId){
  try{await env.DB.prepare(`INSERT INTO notifications(telegram_id,type,title,body,payload) VALUES(?1,?2,?3,?4,?5)`).bind(String(userId),`virtual-chip:${requestId}`,title,body,JSON.stringify({requestId})).run();}catch{}
}
async function telegramCall(env,method,payload){
  const token=env.TELEGRAM_BOT_TOKEN;if(!token)return null;
  const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  return r.json().catch(()=>null);
}
function normalize(r){return r?{id:r.id,telegramId:String(r.telegram_id),amount:Number(r.amount),status:r.status,createdAt:r.created_at,resolvedAt:r.resolved_at||null}:null;}
