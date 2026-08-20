import signatureWorker from "./casino-signature-main.js";

const BUILD="2026-08-20-live-signature-slots-v5";
const RESET_KEY="tuning_requests_reset_v5";
let prepared=false;

export default {
  async fetch(request,env){
    try{await prepareRelease(env);}catch(error){console.warn("LIVE_PREPARE",error);}
    const url=new URL(request.url);
    if(url.pathname==="/__fit_version"){
      return new Response(JSON.stringify({ok:true,build:BUILD}),{status:200,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});
    }
    const res=await signatureWorker.fetch(request,env);
    try{
      const headers=new Headers(res.headers);
      headers.set("x-fit-build",BUILD);
      return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
    }catch{return res;}
  }
};

async function prepareRelease(env){
  if(prepared)return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS casino_tuning_requests(id TEXT PRIMARY KEY,telegram_id TEXT NOT NULL,game_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',applied_percent INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,resolved_at TEXT,resolved_by TEXT)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS casino_tuning_callbacks(token TEXT PRIMARY KEY,request_id TEXT NOT NULL,admin_id TEXT NOT NULL,chat_id TEXT,message_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,resolved_at TEXT)").run();
  const marker=await env.DB.prepare("SELECT value FROM casino_meta WHERE key=?1 LIMIT 1").bind(RESET_KEY).first();
  if(!marker){
    await env.DB.batch([
      env.DB.prepare("UPDATE casino_tuning_requests SET status='RESET',resolved_at=CURRENT_TIMESTAMP WHERE status='PENDING'"),
      env.DB.prepare("DELETE FROM casino_tuning_callbacks WHERE resolved_at IS NULL"),
      env.DB.prepare("INSERT INTO casino_meta(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(RESET_KEY,new Date().toISOString())
    ]);
  }
  const admin=await env.DB.prepare("SELECT telegram_id FROM casino_users WHERE role='ADMIN' ORDER BY updated_at DESC LIMIT 1").first();
  if(admin?.telegram_id){
    await env.DB.prepare("INSERT INTO casino_meta(key,value) VALUES('admin_telegram_id',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(admin.telegram_id)).run();
  }
  prepared=true;
}
