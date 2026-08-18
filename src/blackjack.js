import { debit, credit, zeroLedger, getBalance, addXp } from "./db.js";
import { awardSeasonScore } from "./season.js";
import {recordJackpotLoss} from "./jackpot-bank.js";

const SUITS=["S","H","D","C"];
const RANKS=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const TTL=2*60*60*1000;

export async function newBlackjack(env,userId,bet,requestId) {
  userId=String(userId);
  bet=Math.floor(Number(bet));
  if (!Number.isFinite(bet)||bet<1000) throw new Error("MIN_BET_1000");

  const gameId=crypto.randomUUID();
  const d=await debit(env,userId,bet,"BLACKJACK_BET",`bj:bet:${userId}:${requestId}`,{gameId});
  if (!d.applied) throw new Error("DUPLICATE_REQUEST");

  const deck=shuffle(makeDeck(6));
  const game={
    v:1,gameId,userId,bet,deck,
    player:[deck.pop(),deck.pop()],
    dealer:[deck.pop(),deck.pop()],
    doubled:false,finished:false,result:null,payout:0,
    exp:Date.now()+TTL,
  };

  const p=value(game.player), dealer=value(game.dealer);
  if (p.blackjack||dealer.blackjack) {
    game.finished=true;
    if (p.blackjack&&dealer.blackjack) { game.result="push"; game.payout=bet; }
    else if (p.blackjack) { game.result="blackjack"; game.payout=Math.floor(bet*2.5); }
    else { game.result="dealer_blackjack"; game.payout=0; }
    await settle(env,game);
  }

  return { game:publicGame(game,await seal(game,env.TELEGRAM_BOT_TOKEN)), balance:await getBalance(env,userId) };
}

export async function blackjackAction(env,userId,gameToken,action,actionId) {
  const game=await open(gameToken,env.TELEGRAM_BOT_TOKEN,String(userId));
  if (game.finished) return {game:publicGame(game,await seal(game,env.TELEGRAM_BOT_TOKEN)),balance:await getBalance(env,userId)};

  const marked=await zeroLedger(env,userId,"BLACKJACK_ACTION",`bj:action:${game.gameId}:${actionId}`,{action});
  if (!marked) throw new Error("ACTION_ALREADY_USED");

  action=String(action||"").toLowerCase();
  if (action==="hit") {
    game.player.push(game.deck.pop());
    const p=value(game.player);
    if (p.total>21) {
      game.finished=true;game.result="bust";game.payout=0;await settle(env,game);
    } else if (p.total===21) {
      dealerFinish(game);await settle(env,game);
    }
  } else if (action==="stand") {
    dealerFinish(game);await settle(env,game);
  } else if (action==="double") {
    if (game.player.length!==2||game.doubled) throw new Error("DOUBLE_NOT_ALLOWED");
    const d=await debit(env,userId,game.bet,"BLACKJACK_DOUBLE",`bj:double:${game.gameId}`,{gameId:game.gameId});
    if (!d.applied) throw new Error("DOUBLE_ALREADY_USED");
    game.bet*=2;game.doubled=true;game.player.push(game.deck.pop());
    if (value(game.player).total>21) { game.finished=true;game.result="bust";game.payout=0; }
    else dealerFinish(game);
    await settle(env,game);
  } else {
    throw new Error("UNKNOWN_ACTION");
  }

  game.exp=Date.now()+TTL;
  return {game:publicGame(game,await seal(game,env.TELEGRAM_BOT_TOKEN)),balance:await getBalance(env,userId)};
}

function dealerFinish(game) {
  while (value(game.dealer).total<17) game.dealer.push(game.deck.pop());
  const p=value(game.player),d=value(game.dealer);
  game.finished=true;
  if (p.total>21) {game.result="bust";game.payout=0;}
  else if (d.total>21) {game.result="dealer_bust";game.payout=game.bet*2;}
  else if (p.total>d.total) {game.result="win";game.payout=game.bet*2;}
  else if (p.total<d.total) {game.result="loss";game.payout=0;}
  else {game.result="push";game.payout=game.bet;}
}

async function settle(env,game) {
  const key=`bj:result:${game.gameId}`;
  let applied=false;
  if (game.payout>0) {
    const c=await credit(env,game.userId,game.payout,"BLACKJACK_RESULT",key,{result:game.result,bet:game.bet});
    applied=c.applied;
  } else {
    applied=await zeroLedger(env,game.userId,"BLACKJACK_RESULT",key,{result:game.result,bet:game.bet});
  }
  if (!applied) return;

  await recordJackpotLoss(env,game.userId,game.gameId,game.bet,game.payout,"BLACKJACK");

  const win=["win","dealer_bust","blackjack"].includes(game.result)?1:0;
  const push=game.result==="push"?1:0;
  const loss=!win&&!push?1:0;
  const profit=Math.max(0,game.payout-game.bet);
  await env.DB.prepare(`
    UPDATE user_stats SET
      blackjack_games=blackjack_games+1,
      blackjack_wins=blackjack_wins+?2,
      blackjack_losses=blackjack_losses+?3,
      blackjack_pushes=blackjack_pushes+?4,
      blackjack_biggest_win=MAX(blackjack_biggest_win,?5),
      updated_at=CURRENT_TIMESTAMP
    WHERE telegram_id=?1
  `).bind(game.userId,win,loss,push,profit).run();
  await addXp(env,game.userId,win?15:5);
  await awardSeasonScore(env,game.userId,win?10:2);
}

function publicGame(game,token) {
  const reveal=game.finished;
  return {
    token,gameId:game.gameId,bet:game.bet,
    player:game.player,
    dealer:reveal?game.dealer:[game.dealer[0],null],
    playerValue:value(game.player).total,
    dealerValue:reveal?value(game.dealer).total:value([game.dealer[0]]).total,
    doubled:game.doubled,finished:game.finished,result:game.result,payout:game.payout,
  };
}

function makeDeck(copies) {
  const deck=[];
  for(let n=0;n<copies;n++) for(const suit of SUITS) for(const rank of RANKS) deck.push({rank,suit});
  return deck;
}
function randomInt(maxExclusive) {
  if(maxExclusive<=1)return 0;
  const max=0x100000000,limit=max-(max%maxExclusive),b=new Uint32Array(1);
  do crypto.getRandomValues(b); while(b[0]>=limit);
  return b[0]%maxExclusive;
}
function shuffle(deck) {
  for(let i=deck.length-1;i>0;i--){const j=randomInt(i+1);[deck[i],deck[j]]=[deck[j],deck[i]];}
  return deck;
}
export function value(cards) {
  let total=0,aces=0;
  for(const c of cards){if(!c)continue;if(c.rank==="A"){total+=11;aces++;}else if(["K","Q","J"].includes(c.rank))total+=10;else total+=Number(c.rank);}
  while(total>21&&aces>0){total-=10;aces--;}
  return {total,soft:aces>0,blackjack:cards.length===2&&total===21};
}

async function stateKey(token) {
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("FIT_BJ_STATE:"+token));
  return crypto.subtle.importKey("raw",digest,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
async function seal(game,token) {
  const key=await stateKey(token),iv=crypto.getRandomValues(new Uint8Array(12));
  const data=new TextEncoder().encode(JSON.stringify(game));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,data));
  return `${b64(iv)}.${b64(encrypted)}`;
}
async function open(token,botToken,userId) {
  try{
    const [a,b]=String(token||"").split(".");
    const key=await stateKey(botToken);
    const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(a)},key,unb64(b));
    const game=JSON.parse(new TextDecoder().decode(plain));
    if(String(game.userId)!==String(userId)||Date.now()>Number(game.exp))throw new Error();
    return game;
  }catch{throw new Error("INVALID_GAME_STATE");}
}
function b64(bytes){let s="";for(const x of bytes)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function unb64(s){s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const b=atob(s),o=new Uint8Array(b.length);for(let i=0;i<b.length;i++)o[i]=b.charCodeAt(i);return o;}
