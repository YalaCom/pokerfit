const COOKIE_NAME="fit_casino_session";
const SESSION_DAYS=30;
const LOGIN_TTL_MS=5*60*1000;
const PASSWORD_ITERATIONS=100000;
const BOT_USERNAME_FALLBACK="fitpokerclubbot";
const START_BALANCE=10_000_000;

export async function handleWebAuthRequest(request,env,url){
  if(request.method!=="POST")return json({ok:false,error:"POST_REQUIRED"},405);
  let body={};try{body=await request.json();}catch{return json({ok:false,error:"BAD_JSON"},400);}
  try{
    if(url.pathname==="/api/web-auth/status")return await status(request,env);
    if(url.pathname==="/api/web-auth/register")return await register(body,env);
    if(url.pathname==="/api/web-auth/login")return await login(body,env);
    if(url.pathname==="/api/web-auth/logout")return await logout(request,env);
    if(url.pathname==="/api/web-auth/telegram/start")return await telegramStart(env);
    if(url.pathname==="/api/web-auth/telegram/status")return await telegramStatus(body,env);
    if(url.pathname==="/api/web-auth/telegram/health")return await telegramHealth(env);
    return json({ok:false,error:"NOT_FOUND"},404);
  }catch(error){console.error("WEB_AUTH",url.pathname,error);return json({ok:false,error:String(error?.message||"WEB_AUTH_FAILED")},400);}
}

export async function rewriteBrowserApiRequest(request,env){
  if(request.method!=="POST")return request;
  let body;try{body=await request.clone().json();}catch{return request;}
  if(body?.initData)return request;
  const session=await resolveSession(request,env);if(!session)return request;
  const user={id:String(session.telegram_id),first_name:session.first_name||"Игрок",last_name:session.last_name||undefined,username:session.username||undefined};
  const initData=await makeSignedInitData(user,env.TELEGRAM_BOT_TOKEN);
  const headers=new Headers(request.headers);headers.set("content-type","application/json");headers.set("x-fit-auth-source","web-session");
  return new Request(request.url,{method:"POST",headers,body:JSON.stringify({...body,initData})});
}

export async function looksLikeTelegramUpdate(request){
  if(request.method!=="POST")return false;
  try{const body=await request.clone().json();return Number.isInteger(body?.update_id)&&!!(body?.message||body?.callback_query);}catch{return false;}
}

export async function handleTelegramUpdate(request,env){
  let update;try{update=await request.json();}catch{return json({ok:true});}
  try{
    if(update?.message?.text)await handleStartMessage(update.message,env);
    if(update?.callback_query)await handleCallback(update.callback_query,env);
  }catch(error){console.error("BOT_WEB_AUTH",error);}
  return json({ok:true});
}

async function status(request,env){
  const session=await resolveSession(request,env);
  if(!session)return json({ok:true,authenticated:false});
  return json({ok:true,authenticated:true,player:{id:String(session.telegram_id),firstName:session.first_name,username:session.username||null}});
}

async function register(body,env){
  const login=normalizeWebLogin(body?.login),displayName=normalizeDisplayName(body?.displayName),password=String(body?.password||"");
  if(!login)throw new Error("BAD_WEB_LOGIN");if(!displayName)throw new Error("BAD_DISPLAY_NAME");if(!validWebPassword(password))throw new Error("BAD_WEB_PASSWORD");
  const exists=await env.DB.prepare(`SELECT player_id FROM casino_web_accounts WHERE login=?1 LIMIT 1`).bind(login).first();if(exists)throw new Error("WEB_LOGIN_TAKEN");
  const playerId=`web_${randomToken(12)}`,salt=randomToken(16),hash=await hashPassword(password,salt);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO casino_users(telegram_id,username,first_name,last_name,balance,role) VALUES(?1,?2,?3,NULL,?4,'PLAYER')`).bind(playerId,login,displayName,START_BALANCE),
    env.DB.prepare(`INSERT OR IGNORE INTO casino_daily(telegram_id,streak) VALUES(?1,0)`).bind(playerId),
    env.DB.prepare(`INSERT INTO casino_web_accounts(player_id,login,password_hash,password_salt,display_name) VALUES(?1,?2,?3,?4,?5)`).bind(playerId,login,hash,salt,displayName)
  ]);
  return sessionResponse(env,playerId,{created:true});
}

async function login(body,env){
  const login=normalizeWebLogin(body?.login),password=String(body?.password||"");if(!login||!password)throw new Error("WEB_LOGIN_FAILED");
  const row=await env.DB.prepare(`SELECT a.player_id,a.password_hash,a.password_salt,u.is_banned FROM casino_web_accounts a JOIN casino_users u ON u.telegram_id=a.player_id WHERE a.login=?1 LIMIT 1`).bind(login).first();
  if(!row||!(await verifyPassword(password,row.password_salt,row.password_hash)))throw new Error("WEB_LOGIN_FAILED");if(Number(row.is_banned||0))throw new Error("PLAYER_BANNED");
  return sessionResponse(env,String(row.player_id),{created:false});
}

async function logout(request,env){
  const token=cookieValue(request,COOKIE_NAME);if(token){const hash=await sha256Hex(token);await env.DB.prepare(`DELETE FROM casino_web_sessions WHERE token_hash=?1`).bind(hash).run();}
  return json({ok:true},{"set-cookie":clearCookie()});
}

async function telegramStart(env){
  const webhook=await ensureTelegramWebhook(env);
  if(!webhook.ok)throw new Error("TELEGRAM_WEBHOOK_FAILED");
  const token=randomToken(18),tokenHash=await sha256Hex(token),expiresAt=new Date(Date.now()+LOGIN_TTL_MS).toISOString();
  await env.DB.prepare(`INSERT INTO casino_telegram_login_requests(token_hash,status,expires_at) VALUES(?1,'PENDING',?2)`).bind(tokenHash,expiresAt).run();
  const bot=String(env.TELEGRAM_BOT_USERNAME||BOT_USERNAME_FALLBACK).replace(/^@/,"");
  return json({ok:true,token,deepLink:`https://t.me/${bot}?start=web_${token}`,expiresIn:Math.floor(LOGIN_TTL_MS/1000),webhookReady:true});
}

async function telegramStatus(body,env){
  const token=String(body?.token||"");if(!/^[A-Za-z0-9_-]{16,64}$/.test(token))throw new Error("BAD_LOGIN_TOKEN");
  const tokenHash=await sha256Hex(token),row=await env.DB.prepare(`SELECT * FROM casino_telegram_login_requests WHERE token_hash=?1 LIMIT 1`).bind(tokenHash).first();
  if(!row)return json({ok:true,status:"EXPIRED"});
  if(Date.parse(row.expires_at)<=Date.now()){await env.DB.prepare(`UPDATE casino_telegram_login_requests SET status='EXPIRED' WHERE token_hash=?1 AND consumed_at IS NULL`).bind(tokenHash).run();return json({ok:true,status:"EXPIRED"});}
  if(row.status==="APPROVED"&&!row.consumed_at&&row.telegram_id){
    const player=await env.DB.prepare(`SELECT telegram_id,is_banned FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(String(row.telegram_id)).first();
    if(!player)throw new Error("PLAYER_NOT_FOUND");if(Number(player.is_banned||0))throw new Error("PLAYER_BANNED");
    await env.DB.prepare(`UPDATE casino_telegram_login_requests SET consumed_at=CURRENT_TIMESTAMP WHERE token_hash=?1 AND consumed_at IS NULL`).bind(tokenHash).run();
    return sessionResponse(env,String(row.telegram_id),{telegramLinked:true});
  }
  return json({ok:true,status:String(row.status||"PENDING")});
}

async function telegramHealth(env){
  const result=await ensureTelegramWebhook(env);
  return json({ok:result.ok,configured:result.ok,url:result.url||null,error:result.error||null},result.ok?200:503);
}

async function ensureTelegramWebhook(env){
  try{
    if(!env.TELEGRAM_BOT_TOKEN)return {ok:false,error:"BOT_TOKEN_MISSING"};
    const desired=String(env.APP_URL||"").replace(/\/+$/g,"");if(!desired)return {ok:false,error:"APP_URL_MISSING"};
    const info=await sendBot(env,"getWebhookInfo",{});
    const current=String(info?.result?.url||"").replace(/\/+$/g,"");
    if(current!==desired){
      const set=await sendBot(env,"setWebhook",{url:desired,drop_pending_updates:false});
      if(!set?.ok)return {ok:false,error:"SET_WEBHOOK_FAILED",url:current};
    }
    return {ok:true,url:desired};
  }catch(error){console.error("TELEGRAM_WEBHOOK",error);return {ok:false,error:String(error?.message||"WEBHOOK_FAILED")};}
}

async function handleStartMessage(message,env){
  const text=String(message.text||"");const match=text.match(/^\/start(?:@\w+)?\s+web_([A-Za-z0-9_-]{16,64})$/);
  if(!match){
    if(/^\/start(?:@\w+)?(?:\s|$)/.test(text)){const chatId=String(message.chat?.id||message.from?.id||"");if(chatId)await sendBot(env,"sendMessage",{chat_id:chatId,text:"Для входа на сайт откройте сайт FIT Casino, нажмите «Войти через Telegram», затем вернитесь сюда и нажмите START / ЗАПУСТИТЬ по новой ссылке."});}
    return;
  }
  const tokenHash=await sha256Hex(match[1]),row=await env.DB.prepare(`SELECT * FROM casino_telegram_login_requests WHERE token_hash=?1 LIMIT 1`).bind(tokenHash).first();
  const chatId=String(message.chat?.id||message.from?.id||"");if(!chatId)return;
  if(!row||Date.parse(row.expires_at)<=Date.now()){await sendBot(env,"sendMessage",{chat_id:chatId,text:"Ссылка на вход истекла. Вернитесь на сайт и нажмите «Войти через Telegram» ещё раз."});return;}
  const telegramId=String(message.from?.id||"");const player=await env.DB.prepare(`SELECT telegram_id FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(telegramId).first();
  if(!player){await env.DB.prepare(`UPDATE casino_telegram_login_requests SET status='NOT_FOUND',telegram_id=?2 WHERE token_hash=?1`).bind(tokenHash,telegramId).run();await sendBot(env,"sendMessage",{chat_id:chatId,text:"Аккаунт казино в Telegram не найден. Для нового аккаунта зарегистрируйтесь прямо на сайте."});return;}
  const confirm=randomToken(10),confirmHash=await sha256Hex(confirm);
  await env.DB.prepare(`UPDATE casino_telegram_login_requests SET status='AWAITING_CONFIRM',telegram_id=?2,confirm_hash=?3 WHERE token_hash=?1 AND consumed_at IS NULL`).bind(tokenHash,telegramId,confirmHash).run();
  await sendBot(env,"sendMessage",{chat_id:chatId,text:"Найден ваш существующий аккаунт FIT Casino. Разрешить вход на сайте с этим же балансом и историей?",reply_markup:{inline_keyboard:[[{text:"✅ Разрешить вход",callback_data:`web_login:${confirm}`}]]}});
}

async function handleCallback(callback,env){
  const data=String(callback.data||"");const match=data.match(/^web_login:([A-Za-z0-9_-]{8,32})$/);if(!match)return;
  const confirmHash=await sha256Hex(match[1]),telegramId=String(callback.from?.id||"");
  const row=await env.DB.prepare(`SELECT * FROM casino_telegram_login_requests WHERE confirm_hash=?1 AND telegram_id=?2 AND status='AWAITING_CONFIRM' AND consumed_at IS NULL LIMIT 1`).bind(confirmHash,telegramId).first();
  if(!row||Date.parse(row.expires_at)<=Date.now()){await sendBot(env,"answerCallbackQuery",{callback_query_id:callback.id,text:"Ссылка уже истекла",show_alert:true});return;}
  await env.DB.prepare(`UPDATE casino_telegram_login_requests SET status='APPROVED',approved_at=CURRENT_TIMESTAMP WHERE token_hash=?1`).bind(row.token_hash).run();
  await sendBot(env,"answerCallbackQuery",{callback_query_id:callback.id,text:"Вход разрешён"});
  if(callback.message?.chat?.id)await sendBot(env,"sendMessage",{chat_id:String(callback.message.chat.id),text:"✅ Вход разрешён. Возвращайтесь на сайт — аккаунт синхронизируется автоматически."});
  if(callback.message?.chat?.id&&callback.message?.message_id)await sendBot(env,"editMessageReplyMarkup",{chat_id:String(callback.message.chat.id),message_id:callback.message.message_id,reply_markup:{inline_keyboard:[]}});
}

async function resolveSession(request,env){
  const token=cookieValue(request,COOKIE_NAME);if(!token)return null;const tokenHash=await sha256Hex(token),now=new Date().toISOString();
  const row=await env.DB.prepare(`SELECT s.player_id,u.telegram_id,u.username,u.first_name,u.last_name,u.role,u.is_banned FROM casino_web_sessions s JOIN casino_users u ON u.telegram_id=s.player_id WHERE s.token_hash=?1 AND s.expires_at>?2 LIMIT 1`).bind(tokenHash,now).first();
  if(!row||Number(row.is_banned||0))return null;await env.DB.prepare(`UPDATE casino_web_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE token_hash=?1`).bind(tokenHash).run();return row;
}

async function sessionResponse(env,playerId,extra={}){
  const token=randomToken(32),tokenHash=await sha256Hex(token),expiresAt=new Date(Date.now()+SESSION_DAYS*86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM casino_web_sessions WHERE player_id=?1 AND expires_at<=?2`).bind(playerId,new Date().toISOString()),
    env.DB.prepare(`INSERT INTO casino_web_sessions(token_hash,player_id,expires_at) VALUES(?1,?2,?3)`).bind(tokenHash,playerId,expiresAt)
  ]);
  return json({ok:true,authenticated:true,...extra},{"set-cookie":sessionCookie(token)});
}

export function normalizeWebLogin(value){const s=String(value||"").trim().toLowerCase();return /^[a-z0-9_.-]{3,32}$/.test(s)?s:"";}
export function validWebPassword(value){const s=String(value||"");return s.length>=8&&s.length<=72;}
function normalizeDisplayName(value){const s=String(value||"").trim().replace(/\s+/g," ");return s.length>=2&&s.length<=40?s:"";}

async function hashPassword(password,salt){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:base64UrlToBytes(salt),iterations:PASSWORD_ITERATIONS},key,256);return bytesToHex(new Uint8Array(bits));}
async function verifyPassword(password,salt,expected){const actual=await hashPassword(password,salt);return safeEqual(actual,String(expected||""));}

export async function makeSignedInitData(user,botToken){if(!botToken)throw new Error("BOT_TOKEN_MISSING");const params=new URLSearchParams();params.set("auth_date",String(Math.floor(Date.now()/1000)));params.set("user",JSON.stringify(user));const dataCheck=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");const enc=new TextEncoder();const secret=await hmac(enc.encode("WebAppData"),enc.encode(botToken));const signature=await hmac(secret,enc.encode(dataCheck));params.set("hash",bytesToHex(signature));return params.toString();}
async function hmac(keyBytes,dataBytes){const key=await crypto.subtle.importKey("raw",keyBytes,{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",key,dataBytes));}
async function sha256Hex(value){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value)));return bytesToHex(new Uint8Array(digest));}

async function sendBot(env,method,payload){if(!env.TELEGRAM_BOT_TOKEN)throw new Error("BOT_TOKEN_MISSING");const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload||{})});let data=null;try{data=await r.json();}catch{}if(!r.ok||data?.ok===false){console.error("TELEGRAM_API",method,r.status,data?.description||"");return null;}return data;}
function randomToken(bytes=24){const a=new Uint8Array(bytes);crypto.getRandomValues(a);let s="";for(const b of a)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function base64UrlToBytes(value){let s=String(value).replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const bin=atob(s),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a;}
function bytesToHex(bytes){return [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");}
function safeEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function cookieValue(request,name){const raw=request.headers.get("cookie")||"";for(const part of raw.split(";")){const [k,...v]=part.trim().split("=");if(k===name)return decodeURIComponent(v.join("="));}return "";}
function sessionCookie(token){return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS*86400}`;}
function clearCookie(){return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;}
function json(data,statusOrHeaders=200,maybeHeaders={}){const status=typeof statusOrHeaders==="number"?statusOrHeaders:200,extra=typeof statusOrHeaders==="object"?statusOrHeaders:maybeHeaders;return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...extra}});}
