import baseWorker from "./casino-feature-main.js";
import {validateTelegramInitData} from "./auth.js";

const BUILD="2026-08-20-arcade-aviamasters-minedrop-v1";
const START_BALANCE=10_000_000,MIN_BET=1_000,MAX_BET=5_000_000;
let schemaReady=false;

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/__fit_version")return json({ok:true,build:BUILD});
    if(request.method==="GET"&&url.pathname==="/casino-app.js")return arcadeCasinoApp(request,env);
    if(request.method==="POST"&&url.pathname.startsWith("/api/arcade/")){
      let body={};try{body=await request.json();}catch{return json({ok:false,error:"BAD_JSON"},400);}
      const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);if(!auth.ok)return json({ok:false,error:auth.error},401);
      try{
        await ensureSchema(env);const player=await ensureUser(env,auth.user);
        if(url.pathname==="/api/arcade/aviamasters/play")return json({ok:true,...await playAviamasters(env,player,body)});
        if(url.pathname==="/api/arcade/minedrop/spin")return json({ok:true,...await playMineDrop(env,player,body,false)});
        if(url.pathname==="/api/arcade/minedrop/bonus-buy")return json({ok:true,...await playMineDrop(env,player,body,true)});
        return json({ok:false,error:"NOT_FOUND"},404);
      }catch(error){console.error("ARCADE",url.pathname,error);return json({ok:false,error:String(error?.message||"SERVER_ERROR")},400);}
    }
    return withBuild(await baseWorker.fetch(request,env));
  }
};

async function arcadeCasinoApp(request,env){
  const res=await baseWorker.fetch(request,env);if(!res.ok)return res;let src=await res.text();
  src += `\n;window.__FIT_ARCADE__={state,api,applyBalance,fmt,requestId,normalizeBet};import("./arcade-games.js?v=1").then(m=>m.installArcades()).catch(e=>console.error("ARCADE_LOAD",e));\n`;
  return new Response(src,{status:res.status,headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});
}

async function playAviamasters(env,player,body){
  const bet=validateBet(body.bet),requestId=validateRequestId(body.requestId),key=`arcade:avia:${player.telegram_id}:${requestId}`,cached=await cachedResponse(env,key);if(cached)return {...cached,duplicate:true};
  if(Number(player.balance||0)<bet)throw new Error("INSUFFICIENT_FUNDS");
  const outcome=createAviaOutcome(),roundId=crypto.randomUUID(),payout=Math.min(bet*1000,Math.floor(bet*outcome.finalMultiplier));
  const debit=await changeBalance(env,player.telegram_id,-bet,"ARCADE_AVIA_BET",roundId,{bet,requestId});let balance=debit.balance;
  if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,"ARCADE_AVIA_PAYOUT",roundId,{bet,payout,requestId})).balance;
  await recordRound(env,player.telegram_id,"aviamasters",bet,payout,roundId,outcome);await syncMarketIndex(env);
  const response={roundId,gameId:"aviamasters",bet,payout,balance,maxWin:bet*1000,result:outcome};await cacheResponse(env,key,player.telegram_id,response);return response;
}

function createAviaOutcome(){
  const count=4+secureInt(4),events=[];let counter=1,altitude=.52,laser=0,nitro=0,life=0,magnet=0;
  for(let i=0;i<count;i++){
    const roll=secureFloat();let type="air",value=0,label="";
    if(roll<.12){type="add";value=1;counter+=1;altitude+=.025;label="+1";}
    else if(roll<.18){type="add";value=2;counter+=2;altitude+=.03;label="+2";}
    else if(roll<.195){type="add";value=5;counter+=5;altitude+=.045;label="+5";}
    else if(roll<.198){type="add";value=10;counter+=10;altitude+=.07;label="+10";}
    else if(roll<.228){type="mul";value=2;counter*=2;altitude+=.04;label="×2";}
    else if(roll<.235){type="mul";value=3;counter*=3;altitude+=.05;label="×3";}
    else if(roll<.237){type="mul";value=4;counter*=4;altitude+=.06;label="×4";}
    else if(roll<.2375){type="mul";value=5;counter*=5;altitude+=.08;label="×5";}
    else if(roll<.3375){type="rocket";label="ROCKET";if(laser>0){laser--;type="rocket_blocked";label="LASER!";}else if(nitro>0){nitro--;type="rocket_blocked";label="NITRO!";}else{counter=Math.max(.05,counter/2);altitude-=.09;}}
    else if(roll<.3675){const b=secureInt(4);type="booster";if(b===0){magnet++;altitude+=.03;label="MAGNET";}else if(b===1){laser++;label="LASER";}else if(b===2){nitro=2;altitude+=.02;label="NITRO";}else{life++;label="LIFE BUOY";}}
    counter=Math.min(1000,Math.max(.05,counter));altitude=Math.min(1,Math.max(.05,altitude));
    events.push({index:i,type,value,label,counter:round2(counter),altitude:round4(altitude),progress:round4((i+1)/(count+1))});
  }
  let landed=secureFloat()<Math.min(.97,.115+.35*altitude+.025*magnet),rescued=false;
  if(!landed&&life>0&&secureFloat()<.70){landed=true;rescued=true;events.push({index:events.length,type:"rescue",label:"LIFE BUOY",counter:round2(counter),altitude:.18,progress:.94});}
  return {rtpTarget:97,maxMultiplier:1000,events,landed,rescued,finalCounter:round2(counter),finalMultiplier:landed?round2(counter):0,landing:landed?"ISLAND":"WATER",speedIndependent:true};
}

async function playMineDrop(env,player,body,buyBonus){
  const bet=validateBet(body.bet),extraChance=!buyBonus&&!!body.extraChance,cost=buyBonus?bet*100:bet*(extraChance?3:1),requestId=validateRequestId(body.requestId),key=`arcade:mine:${buyBonus?"buy":"spin"}:${player.telegram_id}:${requestId}`,cached=await cachedResponse(env,key);if(cached)return {...cached,duplicate:true};
  if(Number(player.balance||0)<cost)throw new Error("INSUFFICIENT_FUNDS");
  const outcome=buyBonus?createMineBonusBuy(bet):createMineBase(bet,extraChance),cap=bet*5000,payout=Math.min(cap,Math.max(0,Math.floor(outcome.payout))),roundId=crypto.randomUUID();
  const debit=await changeBalance(env,player.telegram_id,-cost,buyBonus?"ARCADE_MINE_BONUS_BUY":"ARCADE_MINE_BET",roundId,{bet,cost,extraChance,requestId});let balance=debit.balance;
  if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,"ARCADE_MINE_PAYOUT",roundId,{bet,payout,buyBonus,requestId})).balance;
  await recordRound(env,player.telegram_id,buyBonus?"minedrop:bonus":"minedrop",cost,payout,roundId,outcome);await syncMarketIndex(env);
  const response={roundId,gameId:"minedrop",bet,cost,payout,balance,maxWin:cap,result:outcome};await cacheResponse(env,key,player.telegram_id,response);return response;
}

const BLOCKS=[
  {id:"dirt",hp:1,m:0},{id:"stone",hp:2,m:.1},{id:"ruby",hp:4,m:1},{id:"gold",hp:5,m:3},{id:"diamond",hp:6,m:5},{id:"obsidian",hp:7,m:25}
];
const BLOCK_SCALE=4.03,CHEST_SCALE=1;
function createMineBase(bet,extraChance=false){
  const mine=newMine(),frame=mineSpin(mine,bet,false,extraChance),scatterCount=frame.scatterCount,bonusTriggered=scatterCount>=3;
  const bonus=bonusTriggered?runMineBonus(bet,frame.mineAfter,false):null,payout=frame.payout+Number(bonus?.payout||0);
  return {rtpTarget:95.5,maxWinMultiplier:5000,mode:extraChance?"EXTRA_CHANCE":"BASE",extraChance,initialMine:frame.mineBefore,panel:frame.panel,frame,scatterCount,bonusTriggered,bonus,payout:Math.floor(payout)};
}
function createMineBonusBuy(bet){
  const mine=preDamagedMine();const triggerPanel=makeMinePanel(false,false);forceEyes(triggerPanel,3);const bonus=runMineBonus(bet,mine,true);
  return {rtpTarget:96,maxWinMultiplier:5000,mode:"BONUS_BUY",bonusPurchased:true,initialMine:snapshotMine(mine),panel:triggerPanel,scatterCount:3,bonusTriggered:true,bonus,payout:Math.floor(bonus.payout)};
}
function runMineBonus(bet,startMine,purchased){
  const mine=cloneMine(startMine),frames=[];let total=0;
  for(let spin=0;spin<4;spin++){const f=mineSpin(mine,bet,true,false);f.spin=spin+1;frames.push(f);total+=f.payout;}
  return {type:"BLOCK_BONUS",name:"BLOCK BONUS",initialSpins:4,persistentMine:true,purchased,frames,payout:Math.floor(total),finalMine:snapshotMine(mine)};
}
function mineSpin(mine,bet,bonus=false,extraChance=false){
  const before=snapshotMine(mine),panel=makeMinePanel(bonus,extraChance),breaks=[],chests=[],tnts=[],upgrades=[];let payout=0,scatterCount=0;
  for(let r=0;r<3;r++)for(let c=0;c<5;c++)if(panel[r][c]==="eye")scatterCount++;
  for(let c=0;c<5;c++){
    const sy=[panel[0][c],panel[1][c],panel[2][c]],strengths=sy.map(toolStrength);
    if(sy.includes("book")&&strengths.some(x=>x>0)){let idx=0;for(let i=1;i<strengths.length;i++)if(strengths[i]>strengths[idx])idx=i;strengths[idx]=5;upgrades.push({c,row:idx});}
    let damage=strengths.reduce((a,b)=>a+b,0)+sy.filter(x=>x==="tnt").length*3;
    if(sy.includes("tnt"))tnts.push({c});
    payout+=applyMineDamage(mine,c,damage,bet,breaks,chests);
    if(sy.includes("tnt")){for(const nc of [c-1,c+1])if(nc>=0&&nc<5)payout+=applyMineDamage(mine,nc,1,bet,breaks,chests,true);}
  }
  return {spin:0,panel,mineBefore:before,mineAfter:snapshotMine(mine),breaks,chests,tnts,upgrades,scatterCount,payout:Math.floor(payout)};
}
function applyMineDamage(mine,c,damage,bet,breaks,chests,side=false){
  const col=mine[c];let payout=0;
  while(damage>0&&col.index<BLOCKS.length){const def=BLOCKS[col.index],use=Math.min(damage,col.hp);col.hp-=use;damage-=use;if(col.hp<=0){const amount=Math.floor(bet*def.m*BLOCK_SCALE);payout+=amount;breaks.push({c,depth:col.index,block:def.id,amount,side});col.index++;if(col.index<BLOCKS.length)col.hp=BLOCKS[col.index].hp;}}
  if(col.index>=BLOCKS.length&&!col.open){col.open=true;const mult=chestMultiplier(),amount=Math.floor(bet*mult*CHEST_SCALE);payout+=amount;chests.push({c,multiplier:mult,amount});}
  return payout;
}
function makeMinePanel(bonus=false,extraChance=false){const p=[];for(let r=0;r<3;r++){const row=[];for(let c=0;c<5;c++)row.push(mineSymbol(bonus,extraChance));p.push(row);}return p;}
function mineSymbol(bonus,extraChance){
  const u=secureFloat(),eye=extraChance?.07:(bonus?.018:.014),probs=bonus?[["wood",.20],["stone_pick",.11],["gold_pick",.06],["diamond_pick",.018],["eye",eye],["book",.014],["tnt",.020]]:[["wood",.16],["stone_pick",.09],["gold_pick",.045],["diamond_pick",.012],["eye",eye],["book",.008],["tnt",.014]];
  let sum=0;for(const [id,p] of probs){sum+=p;if(u<sum)return id;}return secureFloat()<.45?"cash":"blank";
}
function toolStrength(s){return s==="wood"?1:s==="stone_pick"?2:s==="gold_pick"?3:s==="diamond_pick"?5:0;}
function newMine(){return Array.from({length:5},()=>({index:0,hp:BLOCKS[0].hp,open:false}));}
function preDamagedMine(){const m=newMine();for(let c=0;c<5;c++){let damage=3+secureInt(6);applyPredamage(m[c],damage);}return m;}
function applyPredamage(col,damage){while(damage>0&&col.index<BLOCKS.length){const use=Math.min(damage,col.hp);col.hp-=use;damage-=use;if(col.hp<=0){col.index++;if(col.index<BLOCKS.length)col.hp=BLOCKS[col.index].hp;}}if(col.index>=BLOCKS.length)col.open=false;}
function cloneMine(m){return m.map(x=>({...x}));}function snapshotMine(m){return m.map((x,c)=>({c,index:x.index,hp:x.hp,open:!!x.open,blocks:BLOCKS.map((b,i)=>({id:b.id,hp:b.hp,remaining:i<x.index?0:i===x.index?x.hp:b.hp,broken:i<x.index}))}));}
function forceEyes(panel,n){const cells=[];for(let r=0;r<3;r++)for(let c=0;c<5;c++)cells.push([r,c]);shuffle(cells);for(let i=0;i<n;i++){const [r,c]=cells[i];panel[r][c]="eye";}}
function chestMultiplier(){const vals=[2,3,5,10,25,50,100],w=[45,25,15,9,4,1.5,.5],total=w.reduce((a,b)=>a+b,0);let x=secureFloat()*total;for(let i=0;i<vals.length;i++){x-=w[i];if(x<0)return vals[i];}return 2;}

async function ensureSchema(env){if(schemaReady)return;schemaReady=true;}
async function ensureUser(env,tg){const id=String(tg.id),username=tg.username||null,first=tg.first_name||"Игрок",last=tg.last_name||null;await env.DB.batch([env.DB.prepare(`INSERT INTO casino_users(telegram_id,username,first_name,last_name,balance,role) VALUES(?1,?2,?3,?4,?5,'PLAYER') ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,updated_at=CURRENT_TIMESTAMP`).bind(id,username,first,last,START_BALANCE),env.DB.prepare(`INSERT OR IGNORE INTO casino_daily(telegram_id,streak) VALUES(?1,0)`).bind(id)]);const row=await env.DB.prepare(`SELECT * FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(id).first();if(!row)throw new Error("PLAYER_NOT_FOUND");if(Number(row.is_banned||0))throw new Error("PLAYER_BANNED");return row;}
async function changeBalance(env,id,delta,type,roundId,meta){id=String(id);delta=Math.floor(Number(delta));const before=await env.DB.prepare(`SELECT balance FROM casino_users WHERE telegram_id=?1`).bind(id).first();if(!before)throw new Error("PLAYER_NOT_FOUND");const old=Number(before.balance||0);if(delta<0&&(old<0||old<-delta))throw new Error("INSUFFICIENT_FUNDS");const next=old+delta;await env.DB.batch([env.DB.prepare(`UPDATE casino_users SET balance=?2,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?1`).bind(id,next),env.DB.prepare(`INSERT INTO casino_ledger(telegram_id,type,amount,balance_before,balance_after,round_id,metadata) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(id,type,delta,old,next,roundId||null,JSON.stringify(meta||{}))]);return {balance:next};}
async function recordRound(env,id,gameId,bet,payout,roundId,result){await env.DB.batch([env.DB.prepare(`INSERT INTO casino_rounds(round_id,telegram_id,game_id,bet,payout,multiplier,result_json) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(roundId,String(id),gameId,bet,payout,round4(payout/Math.max(1,bet)),JSON.stringify(result)),env.DB.prepare(`INSERT INTO casino_game_totals(game_id,rounds,wagered,paid) VALUES(?1,1,?2,?3) ON CONFLICT(game_id) DO UPDATE SET rounds=rounds+1,wagered=wagered+excluded.wagered,paid=paid+excluded.paid,updated_at=CURRENT_TIMESTAMP`).bind(gameId,bet,payout)]);}
async function syncMarketIndex(env){let state=await env.DB.prepare(`SELECT * FROM casino_market_state WHERE id=1`).first();if(!state)return;const last=Number(state.last_round_rowid||0),agg=await env.DB.prepare(`SELECT COALESCE(MAX(rowid),?1) max_id,COALESCE(SUM(bet),0) wagered,COALESCE(SUM(bet-payout),0) house_net FROM casino_rounds WHERE rowid>?1`).bind(last).first(),maxId=Number(agg?.max_id||last);if(maxId<=last)return;const wagered=Number(agg?.wagered||0),houseNet=Number(agg?.house_net||0),ratio=wagered>0?houseNet/wagered:0,impact=Math.max(-.03,Math.min(.03,ratio*.018)),next=Math.max(10,round4(Number(state.price||1000)*(1+impact)));await env.DB.batch([env.DB.prepare(`UPDATE casino_market_state SET price=?1,last_round_rowid=?2,updated_at=CURRENT_TIMESTAMP WHERE id=1`).bind(next,maxId),env.DB.prepare(`INSERT INTO casino_market_points(price,house_net,wagered,created_ms) VALUES(?1,?2,?3,?4)`).bind(next,Math.floor(houseNet),Math.floor(wagered),Date.now())]);}
async function cachedResponse(env,key){const r=await env.DB.prepare(`SELECT response_json FROM casino_request_cache WHERE request_key=?1 LIMIT 1`).bind(key).first();if(!r?.response_json)return null;try{return JSON.parse(r.response_json);}catch{return null;}}
async function cacheResponse(env,key,id,response){await env.DB.prepare(`INSERT OR IGNORE INTO casino_request_cache(request_key,telegram_id,response_json) VALUES(?1,?2,?3)`).bind(key,String(id),JSON.stringify(response)).run();}
function validateBet(v){const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<MIN_BET)throw new Error("MIN_BET_1000");if(n>MAX_BET)throw new Error("MAX_BET_5M");return n;}function validateRequestId(v){const s=String(v||"");if(!/^[a-zA-Z0-9:_-]{8,100}$/.test(s))throw new Error("BAD_REQUEST_ID");return s;}
function secureInt(max){max=Math.max(1,Math.floor(max));const a=new Uint32Array(1),ceiling=0x100000000,limit=ceiling-(ceiling%max);do crypto.getRandomValues(a);while(a[0]>=limit);return a[0]%max;}function secureFloat(){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}function shuffle(a){for(let i=a.length-1;i>0;i--){const j=secureInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function round2(n){return Math.floor(Number(n||0)*100)/100;}function round4(n){return Math.round(Number(n||0)*10000)/10000;}
function withBuild(res){try{const h=new Headers(res.headers);h.set("x-fit-build",BUILD);return new Response(res.body,{status:res.status,statusText:res.statusText,headers:h});}catch{return res;}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});}
