import { bestTexasHand, compareScores } from "./evaluator.js";

export const STAGES = {
  WAITING:"WAITING_FOR_PLAYERS",
  STARTING:"STARTING",
  PREFLOP:"PREFLOP",
  FLOP:"FLOP",
  TURN:"TURN",
  RIVER:"RIVER",
  SHOWDOWN:"SHOWDOWN",
  COMPLETE:"HAND_COMPLETE",
};

const SUITS = ["S","H","D","C"];
const RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];

export function createDeck() {
  const deck=[];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({rank,suit});
  return deck;
}

export function secureShuffle(deck) {
  for (let i=deck.length-1;i>0;i--) {
    const j = secureRandomInt(i+1);
    [deck[i],deck[j]]=[deck[j],deck[i]];
  }
  return deck;
}

function secureRandomInt(maxExclusive) {
  if (maxExclusive<=1) return 0;
  const max=0x100000000;
  const limit=max-(max%maxExclusive);
  const buf=new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0]>=limit);
  return buf[0]%maxExclusive;
}

export function createTableState(config={}) {
  const maxPlayers = Math.min(9,Math.max(2,Number(config.maxPlayers||9)));
  return {
    version:1,
    id:String(config.id||crypto.randomUUID()),
    name:String(config.name||"FIT Table"),
    mode:config.mode||"cash",
    tournamentId:config.tournamentId||null,
    sb:Math.max(1,Number(config.sb||1000)),
    bb:Math.max(2,Number(config.bb||2000)),
    maxPlayers,
    turnSeconds:Math.min(60,Math.max(10,Number(config.turnSeconds||20))),
    seats:Array.from({length:maxPlayers},()=>null),
    spectators:0,
    handNo:0,
    stage:STAGES.WAITING,
    dealerSeat:-1,
    smallBlindSeat:-1,
    bigBlindSeat:-1,
    actionSeat:-1,
    currentBet:0,
    minRaise:Number(config.bb||2000),
    board:[],
    deck:[],
    handId:null,
    handStartedAt:null,
    lastResult:null,
    actionLog:[],
    shuffleId:null,
  };
}

export function seatPlayer(state, player) {
  const existing = state.seats.find(s=>s?.id===String(player.id));
  if (existing) {
    existing.connected=true;
    existing.name=player.name||existing.name;
    existing.username=player.username||existing.username;
    existing.photoUrl=player.photoUrl||existing.photoUrl;
    return existing.seat;
  }
  const idx=state.seats.findIndex(s=>!s);
  if (idx<0) throw new Error("TABLE_FULL");
  state.seats[idx]={
    id:String(player.id),
    seat:idx,
    name:player.name||"Игрок",
    username:player.username||null,
    photoUrl:player.photoUrl||null,
    stack:Math.max(0,Number(player.stack||0)),
    connected:true,
    sittingOut:false,
    leaveAfterHand:false,
    timeoutCount:0,
    hole:[],
    folded:false,
    allIn:false,
    streetBet:0,
    contribution:0,
    acted:false,
    lastAction:null,
  };
  return idx;
}

export function removeSeat(state, playerId) {
  const idx=state.seats.findIndex(s=>s?.id===String(playerId));
  if (idx<0) return null;
  const old=state.seats[idx];
  state.seats[idx]=null;
  if (state.actionSeat===idx) state.actionSeat=-1;
  return old;
}

export function activeForNextHand(state) {
  return state.seats.filter(s=>s && !s.sittingOut && s.stack>0 && !s.leaveAfterHand);
}

export function canStartHand(state) {
  return activeForNextHand(state).length>=2 && [STAGES.WAITING,STAGES.COMPLETE].includes(state.stage);
}

export function startHand(state) {
  const active = activeForNextHand(state);
  if (active.length<2) {
    state.stage=STAGES.WAITING;
    state.actionSeat=-1;
    return state;
  }

  state.handNo += 1;
  state.handId = crypto.randomUUID();
  state.shuffleId = crypto.randomUUID();
  state.handStartedAt = new Date().toISOString();
  state.lastResult=null;
  state.board=[];
  state.actionLog=[];
  state.currentBet=0;
  state.minRaise=state.bb;
  state.deck=secureShuffle(createDeck());

  for (const s of state.seats) {
    if (!s) continue;
    s.hole=[];
    s.folded=false;
    s.allIn=false;
    s.streetBet=0;
    s.contribution=0;
    s.acted=false;
    s.lastAction=null;
  }

  const eligible = eligibleSeatIndexes(state);
  state.dealerSeat = nextFrom(state, state.dealerSeat, i=>eligible.includes(i));
  const headsUp=eligible.length===2;

  if (headsUp) {
    state.smallBlindSeat=state.dealerSeat;
    state.bigBlindSeat=nextFrom(state,state.dealerSeat,i=>eligible.includes(i));
  } else {
    state.smallBlindSeat=nextFrom(state,state.dealerSeat,i=>eligible.includes(i));
    state.bigBlindSeat=nextFrom(state,state.smallBlindSeat,i=>eligible.includes(i));
  }

  for (let round=0;round<2;round++) {
    let cursor=state.dealerSeat;
    for (let n=0;n<eligible.length;n++) {
      cursor=nextFrom(state,cursor,i=>eligible.includes(i));
      state.seats[cursor].hole.push(state.deck.pop());
    }
  }

  postForcedBet(state,state.smallBlindSeat,state.sb,"SMALL_BLIND");
  postForcedBet(state,state.bigBlindSeat,state.bb,"BIG_BLIND");

  state.currentBet=Math.max(
    state.seats[state.smallBlindSeat]?.streetBet||0,
    state.seats[state.bigBlindSeat]?.streetBet||0
  );
  state.minRaise=state.bb;
  state.stage=STAGES.PREFLOP;

  state.actionSeat = headsUp
    ? state.dealerSeat
    : nextCanActFrom(state,state.bigBlindSeat);

  autoAdvanceIfNoDecisions(state);
  return state;
}

function eligibleSeatIndexes(state) {
  const arr=[];
  state.seats.forEach((s,i)=>{
    if (s && !s.sittingOut && !s.leaveAfterHand && s.stack>0) arr.push(i);
  });
  return arr;
}

function nextFrom(state,start,predicate) {
  const len=state.seats.length;
  for (let step=1;step<=len;step++) {
    const i=(start+step+len)%len;
    if (predicate(i)) return i;
  }
  return -1;
}

function nextCanActFrom(state,start) {
  return nextFrom(state,start,i=>{
    const s=state.seats[i];
    return !!s && !s.folded && !s.allIn && !s.sittingOut && !s.leaveAfterHand;
  });
}

function pay(state,seatIndex,amount) {
  const s=state.seats[seatIndex];
  const actual=Math.max(0,Math.min(Number(amount)||0,s.stack));
  s.stack-=actual;
  s.streetBet+=actual;
  s.contribution+=actual;
  if (s.stack===0) s.allIn=true;
  return actual;
}

function postForcedBet(state,seatIndex,amount,action) {
  const paid=pay(state,seatIndex,amount);
  const s=state.seats[seatIndex];
  s.lastAction={type:action,amount:paid};
  state.actionLog.push(logEntry(state,s,action,paid));
}

function logEntry(state,seat,action,amount=0,actionId=null) {
  return {
    actionId:actionId||crypto.randomUUID(),
    handId:state.handId,
    playerId:seat.id,
    seat:seat.seat,
    street:state.stage,
    action,
    amount:Number(amount||0),
    pot:potSize(state),
    at:new Date().toISOString(),
  };
}

export function potSize(state) {
  return state.seats.reduce((sum,s)=>sum+(s?.contribution||0),0);
}

export function legalActions(state,playerId) {
  const seat=state.seats[state.actionSeat];
  if (!seat || seat.id!==String(playerId) || state.stage===STAGES.COMPLETE) return [];
  const toCall=Math.max(0,state.currentBet-seat.streetBet);
  const actions=["FOLD"];
  if (toCall===0) actions.push("CHECK");
  else actions.push("CALL");
  if (seat.stack>toCall) {
    if (state.currentBet===0) actions.push("BET");
    else actions.push("RAISE");
  }
  if (seat.stack>0) actions.push("ALL_IN");
  return [...new Set(actions)];
}

export function applyAction(state,playerId,action,amount=0,actionId=crypto.randomUUID()) {
  const seat=state.seats[state.actionSeat];
  if (!seat || seat.id!==String(playerId)) throw new Error("NOT_YOUR_TURN");
  action=String(action||"").toUpperCase();
  if (!legalActions(state,playerId).includes(action)) throw new Error("ILLEGAL_ACTION");

  const toCall=Math.max(0,state.currentBet-seat.streetBet);
  const beforeCurrent=state.currentBet;
  let paid=0;

  if (action==="FOLD") {
    seat.folded=true;
    seat.acted=true;
  } else if (action==="CHECK") {
    if (toCall!==0) throw new Error("CANNOT_CHECK");
    seat.acted=true;
  } else if (action==="CALL") {
    paid=pay(state,seat.seat,toCall);
    seat.acted=true;
  } else if (action==="BET") {
    if (state.currentBet!==0) throw new Error("USE_RAISE");
    const target=Math.max(state.bb,Math.floor(Number(amount)||0));
    paid=pay(state,seat.seat,target-seat.streetBet);
    if (seat.streetBet<state.bb && !seat.allIn) throw new Error("BET_TOO_SMALL");
    state.currentBet=seat.streetBet;
    state.minRaise=Math.max(state.bb,state.currentBet);
    resetActedAfterRaise(state,seat.seat);
    seat.acted=true;
  } else if (action==="RAISE") {
    let target=Math.floor(Number(amount)||0);
    target=Math.min(seat.streetBet+seat.stack,target);
    if (target<=state.currentBet) throw new Error("RAISE_TOO_SMALL");
    const raiseSize=target-state.currentBet;
    paid=pay(state,seat.seat,target-seat.streetBet);
    state.currentBet=Math.max(state.currentBet,seat.streetBet);
    if (raiseSize>=state.minRaise) {
      state.minRaise=raiseSize;
      resetActedAfterRaise(state,seat.seat);
    }
    seat.acted=true;
  } else if (action==="ALL_IN") {
    const target=seat.streetBet+seat.stack;
    paid=pay(state,seat.seat,seat.stack);
    if (target>beforeCurrent) {
      const raiseSize=target-beforeCurrent;
      state.currentBet=target;
      if (raiseSize>=state.minRaise) {
        state.minRaise=raiseSize;
        resetActedAfterRaise(state,seat.seat);
      }
    }
    seat.acted=true;
  }

  seat.lastAction={type:action,amount:paid};
  seat.timeoutCount=0;
  state.actionLog.push(logEntry(state,seat,action,paid,actionId));

  if (remainingNotFolded(state).length===1) {
    finishByFold(state);
    return state;
  }

  if (bettingRoundComplete(state)) {
    advanceStreet(state);
  } else {
    state.actionSeat=nextCanActFrom(state,seat.seat);
  }

  autoAdvanceIfNoDecisions(state);
  return state;
}

function resetActedAfterRaise(state,raiserSeat) {
  for (const s of state.seats) {
    if (!s || s.seat===raiserSeat || s.folded || s.allIn) continue;
    s.acted=false;
  }
}

function remainingNotFolded(state) {
  return state.seats.filter(s=>s && !s.folded && s.hole.length===2);
}

function canActSeats(state) {
  return state.seats.filter(s=>s && !s.folded && !s.allIn && s.hole.length===2);
}

function bettingRoundComplete(state) {
  const canAct=canActSeats(state);
  if (canAct.length===0) return true;
  return canAct.every(s=>s.acted && s.streetBet===state.currentBet);
}

function resetStreetBets(state) {
  for (const s of state.seats) {
    if (!s) continue;
    s.streetBet=0;
    s.acted=false;
    s.lastAction=null;
  }
  state.currentBet=0;
  state.minRaise=state.bb;
}

function firstPostflopActor(state) {
  return nextCanActFrom(state,state.dealerSeat);
}

function advanceStreet(state) {
  resetStreetBets(state);
  if (state.stage===STAGES.PREFLOP) {
    state.board.push(state.deck.pop(),state.deck.pop(),state.deck.pop());
    state.stage=STAGES.FLOP;
  } else if (state.stage===STAGES.FLOP) {
    state.board.push(state.deck.pop());
    state.stage=STAGES.TURN;
  } else if (state.stage===STAGES.TURN) {
    state.board.push(state.deck.pop());
    state.stage=STAGES.RIVER;
  } else if (state.stage===STAGES.RIVER) {
    runShowdown(state);
    return;
  }
  state.actionSeat=firstPostflopActor(state);
}

function autoAdvanceIfNoDecisions(state) {
  let guard=0;
  while (guard++<10 && ![STAGES.COMPLETE,STAGES.WAITING].includes(state.stage)) {
    if (remainingNotFolded(state).length<=1) {
      finishByFold(state);
      return;
    }
    const canAct=canActSeats(state);
    if (canAct.length<=1) {
      const only=canAct[0];
      if (!only || only.streetBet===state.currentBet || only.stack===0) {
        if (state.stage===STAGES.RIVER) {
          runShowdown(state);
          return;
        }
        advanceStreet(state);
        continue;
      }
    }
    if (state.actionSeat<0) state.actionSeat=firstPostflopActor(state);
    break;
  }
}

function finishByFold(state) {
  const winner=remainingNotFolded(state)[0];
  const pot=potSize(state);
  winner.stack+=pot;
  state.stage=STAGES.COMPLETE;
  state.actionSeat=-1;
  state.lastResult={
    type:"FOLD_WIN",
    pot,
    board:[...state.board],
    winners:[{id:winner.id,seat:winner.seat,amount:pot,name:winner.name}],
    combinations:[],
    completedAt:new Date().toISOString(),
  };
}

export function buildSidePots(seats) {
  const contributed=seats.filter(s=>s && s.contribution>0);
  const levels=[...new Set(contributed.map(s=>s.contribution))].sort((a,b)=>a-b);
  const pots=[];
  let previous=0;
  for (const level of levels) {
    const contributors=contributed.filter(s=>s.contribution>=level);
    const amount=(level-previous)*contributors.length;
    if (amount>0) {
      pots.push({
        amount,
        eligible:contributors.filter(s=>!s.folded).map(s=>s.id),
        level,
      });
    }
    previous=level;
  }
  return pots;
}

export function runShowdown(state) {
  state.stage=STAGES.SHOWDOWN;
  while (state.board.length<5) state.board.push(state.deck.pop());

  const contenders=remainingNotFolded(state);
  const evaluated=new Map();
  for (const s of contenders) {
    evaluated.set(s.id,bestTexasHand([...s.hole,...state.board]));
  }

  const sidePots=buildSidePots(state.seats);
  const awards=new Map();

  for (const pot of sidePots) {
    const eligible=pot.eligible
      .map(id=>state.seats.find(s=>s?.id===id))
      .filter(Boolean);
    let best=null;
    let winners=[];
    for (const s of eligible) {
      const ev=evaluated.get(s.id);
      if (!best || compareScores(ev.score,best.score)>0) {
        best=ev;
        winners=[s];
      } else if (compareScores(ev.score,best.score)===0) {
        winners.push(s);
      }
    }
    if (!winners.length) continue;
    const base=Math.floor(pot.amount/winners.length);
    let odd=pot.amount-base*winners.length;
    const ordered=oddChipOrder(state,winners);
    for (const s of winners) awards.set(s.id,(awards.get(s.id)||0)+base);
    for (let i=0;i<odd;i++) {
      const s=ordered[i%ordered.length];
      awards.set(s.id,(awards.get(s.id)||0)+1);
    }
  }

  const winners=[];
  for (const [id,amount] of awards) {
    const s=state.seats.find(x=>x?.id===id);
    s.stack+=amount;
    winners.push({id,seat:s.seat,name:s.name,amount});
  }

  state.stage=STAGES.COMPLETE;
  state.actionSeat=-1;
  state.lastResult={
    type:"SHOWDOWN",
    pot:potSize(state),
    board:[...state.board],
    winners,
    combinations:contenders.map(s=>{
      const ev=evaluated.get(s.id);
      return {id:s.id,seat:s.seat,name:s.name,hand:ev.name,bestCards:ev.cards};
    }),
    completedAt:new Date().toISOString(),
  };
  return state;
}

function oddChipOrder(state,winners) {
  const ids=new Set(winners.map(w=>w.id));
  const out=[];
  let cursor=state.dealerSeat;
  for (let n=0;n<state.seats.length;n++) {
    cursor=(cursor+1)%state.seats.length;
    const s=state.seats[cursor];
    if (s && ids.has(s.id)) out.push(s);
  }
  return out.length?out:winners;
}

export function timeoutAction(state) {
  const s=state.seats[state.actionSeat];
  if (!s) return state;
  s.timeoutCount=(s.timeoutCount||0)+1;
  const toCall=Math.max(0,state.currentBet-s.streetBet);
  const action=toCall===0?"CHECK":"FOLD";
  applyAction(state,s.id,action,0,`timeout:${state.handId}:${s.id}:${s.timeoutCount}`);
  if (s.timeoutCount>=3) s.sittingOut=true;
  return state;
}

export function publicSnapshot(state,viewerId=null,spectator=false) {
  const showdown=state.stage===STAGES.COMPLETE && state.lastResult?.type==="SHOWDOWN";
  return {
    id:state.id,
    name:state.name,
    mode:state.mode,
    tournamentId:state.tournamentId,
    sb:state.sb,
    bb:state.bb,
    maxPlayers:state.maxPlayers,
    turnSeconds:state.turnSeconds,
    handNo:state.handNo,
    handId:state.handId,
    stage:state.stage,
    dealerSeat:state.dealerSeat,
    smallBlindSeat:state.smallBlindSeat,
    bigBlindSeat:state.bigBlindSeat,
    actionSeat:state.actionSeat,
    currentBet:state.currentBet,
    minRaise:state.minRaise,
    pot:potSize(state),
    board:state.board,
    lastResult:state.lastResult,
    actionLog:state.actionLog.slice(-30),
    seats:state.seats.map(s=>s?{
      id:s.id,seat:s.seat,name:s.name,username:s.username,photoUrl:s.photoUrl,
      stack:s.stack,connected:s.connected,sittingOut:s.sittingOut,folded:s.folded,
      allIn:s.allIn,streetBet:s.streetBet,contribution:s.contribution,lastAction:s.lastAction,
      hole:(!spectator && s.id===String(viewerId)) || (showdown && !s.folded) ? s.hole : s.hole.map(()=>null),
    }:null),
    legalActions:viewerId?legalActions(state,viewerId):[],
  };
}
