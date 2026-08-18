import test from "node:test";
import assert from "node:assert/strict";
import { scoreFive,bestTexasHand,compareScores,handName } from "../src/poker/evaluator.js";
import { buildSidePots,createTableState,seatPlayer,startHand,applyAction,timeoutAction,STAGES } from "../src/poker/engine.js";

const C=s=>({rank:s.slice(0,-1),suit:s.slice(-1)});
const hand=s=>s.split(" ").map(C);

test("Royal Flush",()=>{
  const s=scoreFive(hand("10S JS QS KS AS"));
  assert.equal(handName(s),"ROYAL FLUSH");
});
test("Straight Flush",()=>assert.equal(handName(scoreFive(hand("5H 6H 7H 8H 9H"))),"STRAIGHT FLUSH"));
test("Four of a Kind",()=>assert.equal(handName(scoreFive(hand("AS AH AD AC KD"))),"FOUR OF A KIND"));
test("Full House",()=>assert.equal(handName(scoreFive(hand("KS KH KD 2S 2D"))),"FULL HOUSE"));
test("Flush",()=>assert.equal(handName(scoreFive(hand("AS JS 8S 4S 2S"))),"FLUSH"));
test("Straight",()=>assert.equal(handName(scoreFive(hand("5S 6H 7D 8C 9S"))),"STRAIGHT"));
test("Wheel A2345",()=>assert.deepEqual(scoreFive(hand("AS 2H 3D 4C 5S")),[4,5]));
test("Trips",()=>assert.equal(handName(scoreFive(hand("7S 7H 7D KC 2S"))),"THREE OF A KIND"));
test("Two Pair",()=>assert.equal(handName(scoreFive(hand("AS AH KD KC 2S"))),"TWO PAIR"));
test("Pair",()=>assert.equal(handName(scoreFive(hand("AS AH KD QC 2S"))),"ONE PAIR"));
test("High Card",()=>assert.equal(handName(scoreFive(hand("AS JH 9D 6C 2S"))),"HIGH CARD"));
test("Pair kicker works",()=>{
  const a=bestTexasHand(hand("AS AH KS 7C 5D 3S 2H"));
  const b=bestTexasHand(hand("AD AC QS 7H 5C 3D 2S"));
  assert.equal(compareScores(a.score,b.score),1);
});
test("Seven-card best hand",()=>{
  const x=bestTexasHand(hand("AS KS QS JS 10S 2H 3D"));
  assert.equal(x.name,"ROYAL FLUSH");
});
test("Side pots with multiple all-ins",()=>{
  const seats=[
    {id:"A",contribution:100,folded:false},
    {id:"B",contribution:300,folded:false},
    {id:"C",contribution:500,folded:false},
  ];
  assert.deepEqual(buildSidePots(seats),[
    {amount:300,eligible:["A","B","C"],level:100},
    {amount:400,eligible:["B","C"],level:300},
    {amount:200,eligible:["C"],level:500},
  ]);
});
test("Folded player contributes but cannot win side pot",()=>{
  const pots=buildSidePots([
    {id:"A",contribution:100,folded:true},
    {id:"B",contribution:100,folded:false},
  ]);
  assert.equal(pots[0].amount,200);
  assert.deepEqual(pots[0].eligible,["B"]);
});
test("Heads-up dealer posts small blind and acts first preflop",()=>{
  const t=createTableState({maxPlayers:2,sb:50,bb:100});
  seatPlayer(t,{id:"1",name:"A",stack:1000});
  seatPlayer(t,{id:"2",name:"B",stack:1000});
  startHand(t);
  assert.equal(t.smallBlindSeat,t.dealerSeat);
  assert.equal(t.actionSeat,t.dealerSeat);
  assert.equal(t.stage,STAGES.PREFLOP);
});
test("Preflop call/check advances to flop",()=>{
  const t=createTableState({maxPlayers:2,sb:50,bb:100});
  seatPlayer(t,{id:"1",name:"A",stack:1000});
  seatPlayer(t,{id:"2",name:"B",stack:1000});
  startHand(t);
  const first=t.seats[t.actionSeat];
  applyAction(t,first.id,"CALL",0,"a1");
  const second=t.seats[t.actionSeat];
  applyAction(t,second.id,"CHECK",0,"a2");
  assert.equal(t.stage,STAGES.FLOP);
  assert.equal(t.board.length,3);
});

test("Exact tie compares equal",()=>{
  const a=bestTexasHand(hand("AS KD QH JC 10S 2D 3C"));
  const b=bestTexasHand(hand("AH KC QS JD 10H 4D 5C"));
  assert.equal(compareScores(a.score,b.score),0);
});
test("Fold immediately completes heads-up hand",()=>{
  const t=createTableState({maxPlayers:2,sb:50,bb:100});
  seatPlayer(t,{id:"1",name:"A",stack:1000});seatPlayer(t,{id:"2",name:"B",stack:1000});
  startHand(t);
  const actor=t.seats[t.actionSeat];
  applyAction(t,actor.id,"FOLD",0,"fold1");
  assert.equal(t.stage,STAGES.COMPLETE);
  assert.equal(t.lastResult.type,"FOLD_WIN");
});
test("Two all-ins automatically run to showdown",()=>{
  const t=createTableState({maxPlayers:2,sb:50,bb:100});
  seatPlayer(t,{id:"1",name:"A",stack:500});seatPlayer(t,{id:"2",name:"B",stack:500});
  startHand(t);
  let actor=t.seats[t.actionSeat];
  applyAction(t,actor.id,"ALL_IN",0,"all1");
  actor=t.seats[t.actionSeat];
  applyAction(t,actor.id,"ALL_IN",0,"all2");
  assert.equal(t.stage,STAGES.COMPLETE);
  assert.equal(t.board.length,5);
});
test("Timeout checks when free and folds facing a bet",()=>{
  const t=createTableState({maxPlayers:2,sb:50,bb:100});
  seatPlayer(t,{id:"1",name:"A",stack:1000});seatPlayer(t,{id:"2",name:"B",stack:1000});
  startHand(t);
  const first=t.seats[t.actionSeat];applyAction(t,first.id,"CALL",0,"c1");
  const second=t.seats[t.actionSeat];applyAction(t,second.id,"CHECK",0,"c2");
  const flopActor=t.seats[t.actionSeat];
  timeoutAction(t);
  assert.equal(flopActor.lastAction?.type,"CHECK");
});
