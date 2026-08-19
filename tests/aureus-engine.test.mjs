import test from "node:test";
import assert from "node:assert/strict";
import {createAureusResult,createAureusBonusBuyResult,AUREUS_CONFIG} from "../src/games/aureus.js";

test("Aureus returns server-authoritative 6x5 grid and bounded payout",()=>{
  const bet=10_000,result=createAureusResult(bet);
  assert.equal(result.initialGrid.length,5);
  assert.ok(result.initialGrid.every(row=>row.length===6));
  assert.ok(result.payout>=0);
  assert.ok(result.payout<=bet*AUREUS_CONFIG.maxWin);
  assert.ok(Array.isArray(result.cascades));
  for(const cascade of result.cascades){
    assert.ok(cascade.multiplier>=1);
    assert.equal(cascade.nextGrid.length,5);
    assert.ok(cascade.nextGrid.every(row=>row.length===6));
    assert.equal(cascade.payout,cascade.wins.reduce((sum,w)=>sum+w.amount,0));
    assert.ok(cascade.removed.length>0);
  }
});

test("Feature Buy produces a real free-spins game mode",()=>{
  const bet=10_000,result=createAureusBonusBuyResult(bet,"premium");
  assert.equal(result.bonusTriggered,true);
  assert.equal(result.bonusPurchased,true);
  assert.equal(result.bonus.type,"FREE_SPINS");
  assert.ok(result.bonus.frames.length>=10);
  assert.ok(result.bonus.frames.every(frame=>frame.initialGrid.length===5));
  assert.equal(result.payout,result.basePayout+result.bonus.payout);
  assert.ok(result.payout<=bet*AUREUS_CONFIG.maxWin);
});
