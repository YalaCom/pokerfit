import {validateTelegramInitData} from "./auth.js";

const BUILD="2026-08-19-casino-pixi-v1";
const START_BALANCE=10_000_000;
const MIN_BET=1_000;
const MAX_BET=5_000_000;
const MAX_WIN_X=1000;

const SLOTS={
  olympus:{name:"OLYMPUS THUNDER",rows:5,cols:6,lines:20,mechanic:"MULTIPLIER",symbols:["CROWN","RING","GOBLET","GEM","A","K","Q","J","WILD","SC"],weights:[5,7,9,11,14,16,18,20,2.2,1.5],pay:{CROWN:[0,0,0,14,32,80,180],RING:[0,0,0,10,24,55,120],GOBLET:[0,0,0,7,18,40,90],GEM:[0,0,0,5,12,28,65],A:[0,0,0,3,7,15,35],K:[0,0,0,2.6,6,13,30],Q:[0,0,0,2.2,5,11,25],J:[0,0,0,2,4.5,10,22]},bonusSpins:8,wildMode:"MULTI"},
  bonanza:{name:"CANDY BONANZA",rows:5,cols:6,lines:20,mechanic:"TUMBLE",symbols:["LOLLIPOP","HEART","MELON","GRAPE","PLUM","BANANA","A","K","Q","SC"],weights:[5,7,9,11,13,15,17,19,21,1.7],pay:{LOLLIPOP:[0,0,0,12,28,65,150],HEART:[0,0,0,9,22,50,110],MELON:[0,0,0,7,17,38,85],GRAPE:[0,0,0,5,12,28,60],PLUM:[0,0,0,4,10,22,50],BANANA:[0,0,0,3.2,8,18,42],A:[0,0,0,2.6,6,14,32],K:[0,0,0,2.3,5.5,12,28],Q:[0,0,0,2,5,11,25]},bonusSpins:10,wildMode:"MULTI"},
  fruit:{name:"FRUIT PARTY",rows:5,cols:6,lines:20,mechanic:"CLUSTER",symbols:["APPLE","ORANGE","GRAPE","PLUM","STRAWBERRY","HEART","STAR","SC"],weights:[18,17,16,15,11,8,5,1.8],pay:{STAR:[0,0,0,12,28,70,170],HEART:[0,0,0,8,20,48,110],STRAWBERRY:[0,0,0,6,14,34,78],PLUM:[0,0,0,4.5,11,25,58],GRAPE:[0,0,0,3.5,8,20,45],ORANGE:[0,0,0,3,7,17,38],APPLE:[0,0,0,2.5,6,14,32]},bonusSpins:8,wildMode:"MULTI"},
  starlight:{name:"STARLIGHT QUEEN",rows:5,cols:6,lines:20,mechanic:"RANDOM MULTIPLIER",symbols:["CROWN","HEART","GEM","MOON","A","K","Q","J","WILD","SC"],weights:[5,7,10,12,15,17,19,21,2,1.5],pay:{CROWN:[0,0,0,13,30,72,165],HEART:[0,0,0,9,21,50,112],GEM:[0,0,0,6.5,15,36,82],MOON:[0,0,0,5,12,28,65],A:[0,0,0,3,7,16,36],K:[0,0,0,2.6,6,14,32],Q:[0,0,0,2.2,5,12,28],J:[0,0,0,2,4.5,10,24]},bonusSpins:8,wildMode:"MULTI"},
  sugar:{name:"SUGAR RUSH",rows:5,cols:6,lines:20,mechanic:"TUMBLE + PROGRESSIVE",symbols:["RED","PURPLE","BLUE","GREEN","YELLOW","PINK","STAR","SC"],weights:[18,18,17,16,15,13,6,1.6],pay:{STAR:[0,0,0,11,27,64,145],PINK:[0,0,0,8,19,45,100],YELLOW:[0,0,0,6,14,33,74],GREEN:[0,0,0,4.5,11,25,58],BLUE:[0,0,0,3.5,8,19,43],PURPLE:[0,0,0,3,7,16,37],RED:[0,0,0,2.5,6,14,32]},bonusSpins:10,wildMode:"MULTI"},
  bass:{name:"BIG BASS HUNT",rows:3,cols:5,lines:20,mechanic:"FREE SPINS",symbols:["FISH","TACKLE","BOAT","BASS","A","K","Q","J","WILD","SC"],weights:[7,9,11,13,16,18,20,22,2,1.8],pay:{BASS:[0,0,0,14,42,120],BOAT:[0,0,0,8,24,70],TACKLE:[0,0,0,6,18,52],FISH:[0,0,0,5,14,40],A:[0,0,0,3,8,22],K:[0,0,0,2.6,7,19],Q:[0,0,0,2.3,6,17],J:[0,0,0,2,5,15]},bonusSpins:10,wildMode:"STICKY"},
  doghouse:{name:"DOG HOUSE",rows:3,cols:5,lines:20,mechanic:"STICKY WILD",symbols:["DOG","COLLAR","BONE","HOUSE","A","K","Q","J","WILD","SC"],weights:[6,8,10,12,15,17,19,21,2,1.7],pay:{DOG:[0,0,0,15,45,135],HOUSE:[0,0,0,9,27,78],COLLAR:[0,0,0,7,20,58],BONE:[0,0,0,5,15,44],A:[0,0,0,3,8,23],K:[0,0,0,2.7,7,20],Q:[0,0,0,2.3,6,17],J:[0,0,0,2,5,15]},bonusSpins:9,wildMode:"STICKY"},
  wanted:{name:"WANTED WILDS",rows:4,cols:5,lines:20,mechanic:"STICKY MULTIPLIER",symbols:["OUTLAW","REVOLVER","WHISKEY","HAT","A","K","Q","J","WILD","SC"],weights:[5,7,9,12,15,17,19,21,2,1.5],pay:{OUTLAW:[0,0,0,16,48,150],REVOLVER:[0,0,0,10,30,88],WHISKEY:[0,0,0,7,21,62],HAT:[0,0,0,5,15,45],A:[0,0,0,3,9,25],K:[0,0,0,2.6,7,21],Q:[0,0,0,2.3,6,18],J:[0,0,0,2,5,15]},bonusSpins:8,wildMode:"MULTI_STICKY"}
};

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/__fit_version")return json({ok:true,build:BUILD});
    if(url.pathname.startsWith("/api/"))return api(request,env,url);
    const res=await env.ASSETS.fetch(request);
    const headers=new Headers(res.headers);headers.set("cache-control","no-store, max-age=0");headers.set("x-fit-build",BUILD);
    return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
  }
};

async function api(request,env,url){
  if(request.method!=="POST")return json({ok:false,error:"POST_REQUIRED"},405);
  let body;try{body=await request.json();}catch{return json({ok:false,error:"BAD_JSON"},400)}
  const auth=await validateTelegramInitData(body?.initData,env.TELEGRAM_BOT_TOKEN);
  if(!auth.ok)return json({ok:false,error:auth.error},401);
  try{
    const player=await ensureUser(env,auth.user);
    if(url.pathname==="/api/bootstrap")return json({ok:true,player:publicUser(player),slots:slotCatalog()});
    if(url.pathname==="/api/slot/spin")return json({ok:true,...await playSlotRound(env,player,body)});
    if(url.pathname==="/api/slot/bonus-buy")return json({ok:true,...await playBonusBuy(env,player,body)});
    if(url.pathname==="/api/game/play")return json({ok:true,...await playClassicGame(env,player,body)});
    if(url.pathname==="/api/admin/users")return json({ok:true,...await adminUsers(env,player)});
    if(url.pathname==="/api/admin/adjust")return json({ok:true,...await adminAdjust(env,player,body)});
    if(url.pathname==="/api/admin/stats")return json({ok:true,...await adminStats(env,player)});
    return json({ok:false,error:"NOT_FOUND"},404);
  }catch(error){console.error(url.pathname,error);return json({ok:false,error:String(error?.message||"SERVER_ERROR")},400)}
}

async function ensureUser(env,tg){
  const id=String(tg.id),username=tg.username||null,first=tg.first_name||"Игрок",last=tg.last_name||null;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO casino_users(telegram_id,username,first_name,last_name,balance,role) VALUES(?1,?2,?3,?4,?5,'PLAYER') ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,updated_at=CURRENT_TIMESTAMP`).bind(id,username,first,last,START_BALANCE),
    env.DB.prepare(`INSERT OR IGNORE INTO casino_meta(key,value) VALUES('admin_telegram_id',?1)`).bind(id)
  ]);
  await env.DB.prepare(`UPDATE casino_users SET role='ADMIN' WHERE telegram_id=(SELECT value FROM casino_meta WHERE key='admin_telegram_id')`).run();
  const row=await env.DB.prepare(`SELECT * FROM casino_users WHERE telegram_id=?1 LIMIT 1`).bind(id).first();
  if(!row)throw new Error("PLAYER_NOT_FOUND");if(Number(row.is_banned||0))throw new Error("PLAYER_BANNED");return row;
}

function publicUser(p){return {telegramId:String(p.telegram_id),username:p.username,firstName:p.first_name,lastName:p.last_name,balance:Number(p.balance||0),role:p.role||"PLAYER",isAdmin:p.role==="ADMIN",createdAt:p.created_at};}
function slotCatalog(){return Object.entries(SLOTS).map(([id,s])=>({id,name:s.name,rows:s.rows,cols:s.cols,mechanic:s.mechanic,bonusBuy:true,maxWin:MAX_WIN_X}));}

async function playSlotRound(env,player,body){
  const gameId=String(body.gameId||"");const cfg=SLOTS[gameId];if(!cfg)throw new Error("SLOT_NOT_FOUND");
  const bet=validateBet(body.bet),roundId=crypto.randomUUID();
  const debitResult=await changeBalance(env,player.telegram_id,-bet,"SLOT_BET",roundId,{gameId,bet});
  const outcome=slotOutcome(cfg,bet,{forcedBonus:false,tier:"standard"});
  const payout=Math.min(bet*MAX_WIN_X,Math.max(0,Math.floor(outcome.payout)));
  let balance=debitResult.balance;if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,"SLOT_PAYOUT",roundId,{gameId,bet,payout})).balance;
  await recordRound(env,player.telegram_id,gameId,bet,payout,roundId,outcome);
  return {roundId,gameId,bet,payout,balance,multiplier:round2(payout/bet),maxWin:bet*MAX_WIN_X,result:outcome};
}

async function playBonusBuy(env,player,body){
  const gameId=String(body.gameId||"");const cfg=SLOTS[gameId];if(!cfg)throw new Error("SLOT_NOT_FOUND");
  const bet=validateBet(body.bet),tier=String(body.tier||"standard");
  const tierDef=tier==="super"?{cost:180,spins:14,wildBoost:1.8}:tier==="premium"?{cost:100,spins:11,wildBoost:1.35}:{cost:60,spins:8,wildBoost:1};
  const cost=bet*tierDef.cost,roundId=crypto.randomUUID();
  const d=await changeBalance(env,player.telegram_id,-cost,"BONUS_BUY",roundId,{gameId,bet,tier,cost});
  const outcome=slotOutcome(cfg,bet,{forcedBonus:true,tier,bonusSpins:tierDef.spins,wildBoost:tierDef.wildBoost});
  const payout=Math.min(bet*MAX_WIN_X,Math.max(0,Math.floor(outcome.payout)));
  let balance=d.balance;if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,"BONUS_BUY_PAYOUT",roundId,{gameId,bet,tier,payout})).balance;
  await recordRound(env,player.telegram_id,`${gameId}:bonus:${tier}`,cost,payout,roundId,outcome);
  return {roundId,gameId,bet,cost,tier,payout,balance,multiplier:round2(payout/bet),maxWin:bet*MAX_WIN_X,result:outcome};
}

function slotOutcome(cfg,bet,opts){
  const baseGrid=grid(cfg,false,opts.wildBoost||1);const base=evaluate(cfg,baseGrid,bet);let payout=base.payout;
  const scatters=countSymbol(baseGrid,"SC");const bonusTriggered=opts.forcedBonus||scatters>=3;
  const tumbles=[];
  if((cfg.mechanic.includes("TUMBLE")||cfg.mechanic==="CLUSTER")&&base.payout>0){let current=base;for(let i=0;i<Math.min(4,1+secureInt(4));i++){const g=grid(cfg,false,opts.wildBoost||1),ev=evaluate(cfg,g,bet*(1+i*.12));tumbles.push({grid:g,...ev});payout+=ev.payout;if(!ev.payout)break;current=ev;}}
  const bonusFrames=[];
  if(bonusTriggered){const spins=opts.bonusSpins||cfg.bonusSpins;const sticky=new Map();let prog=1;for(let i=0;i<spins;i++){const g=grid(cfg,true,opts.wildBoost||1,sticky);if(cfg.wildMode.includes("STICKY")){for(let r=0;r<cfg.rows;r++)for(let c=0;c<cfg.cols;c++){if(isWild(g[r][c]))sticky.set(`${r}:${c}`,g[r][c]);}}
      if(cfg.mechanic.includes("PROGRESSIVE"))prog=Math.min(10,prog+.25);
      const ev=evaluate(cfg,g,bet*prog);bonusFrames.push({spin:i+1,grid:g,sticky:[...sticky.keys()],progressive:round2(prog),...ev});payout+=ev.payout;}}
  const total=Math.floor(payout);return {grid:baseGrid,lines:base.lines,scatters,bonusTriggered,tumbles,bonus:bonusTriggered?{spins:bonusFrames.length,frames:bonusFrames,payout:Math.floor(bonusFrames.reduce((s,x)=>s+x.payout,0))}:null,payout:total,winLevel:winLevel(total,bet)};
}

function grid(cfg,bonus,wildBoost=1,sticky=new Map()){
  const g=[];for(let r=0;r<cfg.rows;r++){const row=[];for(let c=0;c<cfg.cols;c++){const k=`${r}:${c}`;if(sticky.has(k)){row.push(sticky.get(k));continue;}let s=weighted(cfg.symbols,cfg.weights);if(s==="WILD"&&cfg.wildMode.includes("MULTI")){const roll=secureInt(100000),boost=bonus?wildBoost:0.45;s=roll<Math.floor(120*boost)?"W10":roll<Math.floor(850*boost)?"W5":roll<Math.floor(4200*boost)?"W2":"WILD";}row.push(s);}g.push(row);}return g;
}

function evaluate(cfg,g,bet){
  const lines=makeLines(cfg.rows,cfg.cols,cfg.lines);const lineBet=bet/Math.max(1,lines.length);let payout=0;const wins=[];
  for(let li=0;li<lines.length;li++){const rows=lines[li];let target=null,count=0,multi=1;for(let c=0;c<cfg.cols;c++){const s=g[rows[c]][c];if(s==="SC")break;if(isWild(s)){count++;multi*=wildMult(s);continue;}if(!target){target=s;count++;continue;}if(s===target){count++;continue;}break;}if(!target)target="CROWN";const table=cfg.pay[target];const factor=table?.[Math.min(count,table.length-1)]||0;if(count>=3&&factor>0){const amount=Math.floor(lineBet*factor*multi);payout+=amount;wins.push({line:li,rows,count,symbol:target,multiplier:multi,amount});}}
  const sc=countSymbol(g,"SC");if(sc>=3)payout+=Math.floor(bet*({3:2,4:5,5:15,6:40}[Math.min(6,sc)]||2));return {payout:Math.floor(payout),lines:wins};
}

function makeLines(rows,cols,count){const out=[];const mid=Math.floor(rows/2);const patterns=[Array(cols).fill(mid),Array(cols).fill(0),Array(cols).fill(rows-1),Array.from({length:cols},(_,i)=>i%rows),Array.from({length:cols},(_,i)=>(rows-1)-(i%rows)),Array.from({length:cols},(_,i)=>Math.min(rows-1,Math.abs(mid-(i%3-1))))];for(let i=0;i<count;i++)out.push(patterns[i%patterns.length].map((r,c)=>(r+i+Math.floor(c/2))%rows));return out;}
function countSymbol(g,s){return g.flat().filter(x=>x===s).length;}function isWild(s){return String(s).startsWith("W");}function wildMult(s){return s==="W10"?10:s==="W5"?5:s==="W2"?2:1;}

async function playClassicGame(env,player,body){
  const gameId=String(body.gameId||""),bet=validateBet(body.bet),roundId=crypto.randomUUID();
  const d=await changeBalance(env,player.telegram_id,-bet,"GAME_BET",roundId,{gameId,bet});let payout=0,result={};
  if(gameId==="roulette"){const n=secureInt(37),choice=String(body.choice||"red");const red=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);const won=choice==="number"?n===Number(body.number):choice==="red"?red.has(n):choice==="black"?n!==0&&!red.has(n):choice==="even"?n!==0&&n%2===0:n!==0&&n%2===1;payout=won?Math.floor(bet*(choice==="number"?36:2)):0;result={number:n,color:n===0?"green":red.has(n)?"red":"black",won};}
  else if(gameId==="dice"){const roll=1+secureInt(100),choice=String(body.choice||"over");const won=choice==="over"?roll>50:roll<=50;payout=won?Math.floor(bet*1.96):0;result={roll,choice,won};}
  else if(gameId==="coinflip"){const side=secureInt(2)?"heads":"tails",choice=String(body.choice||"heads"),won=side===choice;payout=won?Math.floor(bet*1.96):0;result={side,choice,won};}
  else if(gameId==="plinko"){const mults=[8,3,1.5,.6,.25,.6,1.5,3,8],weights=[1,4,10,22,30,22,10,4,1],bucket=weightedIndex(weights),mult=mults[bucket];payout=Math.floor(bet*mult);result={bucket,multiplier:mult,path:Array.from({length:10},()=>secureInt(2))};}
  else if(gameId==="blackjack"){const deck=shuffleCards(),p=[deck.pop(),deck.pop()],dealer=[deck.pop(),deck.pop()];while(score(p)<16)p.push(deck.pop());while(score(dealer)<17)dealer.push(deck.pop());const ps=score(p),ds=score(dealer),blackjack=ps===21&&p.length===2,won=ps<=21&&(ds>21||ps>ds),push=ps<=21&&ps===ds;payout=blackjack?Math.floor(bet*2.5):won?bet*2:push?bet:0;result={player:p,dealer,playerScore:ps,dealerScore:ds,blackjack,won,push};}
  else if(gameId==="baccarat"){const p=secureInt(10),b=secureInt(10),choice=String(body.choice||"player"),winner=p===b?"tie":p>b?"player":"banker",won=choice===winner;payout=won?Math.floor(bet*(winner==="tie"?8:1.95)):0;result={player:p,banker:b,winner,won};}
  else throw new Error("GAME_NOT_FOUND");
  let balance=d.balance;if(payout>0)balance=(await changeBalance(env,player.telegram_id,payout,"GAME_PAYOUT",roundId,{gameId,bet,payout})).balance;await recordRound(env,player.telegram_id,gameId,bet,payout,roundId,result);return {roundId,gameId,bet,payout,balance,multiplier:round2(payout/bet),result};
}

async function changeBalance(env,id,delta,type,roundId,meta){
  id=String(id);delta=Math.floor(Number(delta));const before=await env.DB.prepare(`SELECT balance FROM casino_users WHERE telegram_id=?1`).bind(id).first();if(!before)throw new Error("PLAYER_NOT_FOUND");const old=Number(before.balance||0);if(delta<0&&old<-delta)throw new Error("INSUFFICIENT_FUNDS");const next=Math.max(0,old+delta);
  await env.DB.batch([env.DB.prepare(`UPDATE casino_users SET balance=?2,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?1`).bind(id,next),env.DB.prepare(`INSERT INTO casino_ledger(telegram_id,type,amount,balance_before,balance_after,round_id,metadata) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(id,type,delta,old,next,roundId||null,JSON.stringify(meta||{}))]);return {balance:next,delta};
}
async function recordRound(env,id,gameId,bet,payout,roundId,result){await env.DB.batch([env.DB.prepare(`INSERT INTO casino_rounds(round_id,telegram_id,game_id,bet,payout,multiplier,result_json) VALUES(?1,?2,?3,?4,?5,?6,?7)`).bind(roundId,String(id),gameId,bet,payout,round2(payout/Math.max(1,bet)),JSON.stringify(result)),env.DB.prepare(`INSERT INTO casino_game_totals(game_id,rounds,wagered,paid) VALUES(?1,1,?2,?3) ON CONFLICT(game_id) DO UPDATE SET rounds=rounds+1,wagered=wagered+excluded.wagered,paid=paid+excluded.paid,updated_at=CURRENT_TIMESTAMP`).bind(gameId,bet,payout)]);}

async function adminUsers(env,player){requireAdmin(player);const rows=(await env.DB.prepare(`SELECT telegram_id,username,first_name,last_name,balance,role,is_banned,created_at FROM casino_users ORDER BY created_at DESC LIMIT 200`).all()).results||[];return {users:rows.map(publicUser)};}
async function adminAdjust(env,player,body){requireAdmin(player);const id=String(body.telegramId||""),delta=Math.trunc(Number(body.delta));if(!id||!Number.isFinite(delta)||delta===0)throw new Error("BAD_ADJUSTMENT");const target=await env.DB.prepare(`SELECT balance FROM casino_users WHERE telegram_id=?1`).bind(id).first();if(!target)throw new Error("PLAYER_NOT_FOUND");let actual=delta;if(delta<0)actual=-Math.min(Math.abs(delta),Number(target.balance||0));const r=await changeBalance(env,id,actual,"ADMIN_ADJUST",crypto.randomUUID(),{admin:String(player.telegram_id),requested:delta});return {telegramId:id,balance:r.balance,applied:actual};}
async function adminStats(env,player){requireAdmin(player);const totals=await env.DB.prepare(`SELECT COUNT(*) players,COALESCE(SUM(balance),0) chips FROM casino_users`).first();const games=(await env.DB.prepare(`SELECT game_id,rounds,wagered,paid,CASE WHEN wagered>0 THEN ROUND(paid*100.0/wagered,2) ELSE 0 END rtp FROM casino_game_totals ORDER BY wagered DESC`).all()).results||[];return {totals,games};}
function requireAdmin(p){if(p.role!=="ADMIN")throw new Error("ADMIN_ONLY");}

function validateBet(v){const n=Math.floor(Number(v));if(!Number.isFinite(n)||n<MIN_BET)throw new Error("MIN_BET_1000");if(n>MAX_BET)throw new Error("MAX_BET_5M");return n;}
function weighted(values,weights){return values[weightedIndex(weights)];}function weightedIndex(weights){const ints=weights.map(x=>Math.max(0,Math.round(Number(x)*100))),total=ints.reduce((a,b)=>a+b,0);let roll=secureInt(Math.max(1,total));for(let i=0;i<ints.length;i++){roll-=ints[i];if(roll<0)return i;}return ints.length-1;}
function secureInt(max){max=Math.max(1,Math.floor(max));const lim=0x100000000-(0x100000000%max),a=new Uint32Array(1);do crypto.getRandomValues(a);while(a[0]>=lim);return a[0]%max;}
function round2(n){return Math.floor(Number(n||0)*100)/100;}function winLevel(p,b){const x=p/Math.max(1,b);return x>=1000?"MAX WIN":x>=250?"EPIC WIN":x>=100?"SUPER WIN":x>=40?"MEGA WIN":x>=15?"BIG WIN":x>1?"WIN":"";}
function shuffleCards(){const vals=[2,3,4,5,6,7,8,9,10,10,10,10,11],d=[];for(let s=0;s<4;s++)for(const v of vals)d.push(v);for(let i=d.length-1;i>0;i--){const j=secureInt(i+1);[d[i],d[j]]=[d[j],d[i]];}return d;}function score(hand){let s=hand.reduce((a,b)=>a+b,0),aces=hand.filter(x=>x===11).length;while(s>21&&aces--){s-=10;}return s;}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
