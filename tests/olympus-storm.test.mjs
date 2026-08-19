import test from "node:test";
import assert from "node:assert/strict";
import {OLYMPUS_STORM_CONFIG,createOlympusStormResult,createOlympusStormBonusBuyResult,createFreeSpins,evaluatePayAnywhere,runTumbles} from "../src/games/olympus-storm.js";

test("Olympus Storm keeps 6x5 Pay Anywhere and 5000x max win",()=>{
  assert.equal(OLYMPUS_STORM_CONFIG.reels,6);assert.equal(OLYMPUS_STORM_CONFIG.rows,5);assert.equal(OLYMPUS_STORM_CONFIG.freeSpins,15);assert.equal(OLYMPUS_STORM_CONFIG.retriggerSpins,5);assert.equal(OLYMPUS_STORM_CONFIG.maxWinMultiplier,5000);assert.equal(OLYMPUS_STORM_CONFIG.olympusSymbol,"orb");assert.equal(Object.hasOwn(OLYMPUS_STORM_CONFIG.weights,"orb"),false);assert.ok(OLYMPUS_STORM_CONFIG.multiplierValues.includes(500));
});

test("Pay Anywhere still pays 8+ identical symbols",()=>{
  const grid=Array.from({length:5},()=>Array(6).fill("gem_blue")),result=evaluatePayAnywhere(grid,1000,[]);assert.equal(result.wins.length,1);assert.equal(result.wins[0].count,30);assert.equal(result.wins[0].factor,2);assert.equal(result.payout,5200);
});

test("Olympus full reel bridges a short symbol set and applies its own x",()=>{
  const symbols=["gem_blue","gem_green","gem_yellow","gem_purple","gem_red","ring","hourglass","goblet"],state=Array.from({length:5},(_,r)=>Array.from({length:6},(_,c)=>({symbol:symbols[(r*6+c)%symbols.length]})));const crownCells=[[0,0],[0,2],[0,3],[0,4],[1,0],[1,2],[1,3]];for(const [r,c] of crownCells)state[r][c]={symbol:"crown"};
  const plain=state.map(row=>row.map(x=>x.symbol)),evalResult=evaluatePayAnywhere(plain,1000,[{c:1,value:5}]),crown=evalResult.wins.find(w=>w.symbol==="crown");assert.ok(crown);assert.equal(crown.naturalCount,7);assert.equal(crown.count,8);assert.equal(crown.usesOlympus,true);
  const round=runTumbles(state,1000,{bonus:false,rng:()=>.999999,olympusReels:[{c:1,value:5}],maxPayout:5_000_000});assert.ok(round.cascades.length>=1);assert.equal(round.cascades[0].multiplier,5);assert.equal(round.cascades[0].payout,crown.amount*5);assert.ok(round.cascades[0].nextGrid.every(row=>row[1]==="orb"));
});

test("Base Olympus disappears when the spin has no win",()=>{
  const symbols=["gem_blue","gem_green","gem_yellow","gem_purple","gem_red","ring","hourglass","goblet","crown"],state=Array.from({length:5},(_,r)=>Array.from({length:6},(_,c)=>({symbol:symbols[(r*6+c)%symbols.length]}))),round=runTumbles(state,1000,{bonus:false,rng:()=>.5,olympusReels:[{c:5,value:10}]});assert.equal(round.cascades.length,0);assert.ok(round.finalGrid.every(row=>row[5]!=="orb"));
});

test("Bonus Olympus reels become sticky and can fill all six reels",()=>{
  const bonus=createFreeSpins(1,()=>0,Number.MAX_SAFE_INTEGER);assert.equal(bonus.frames.length,15);assert.equal(bonus.frames[0].newOlympus.length,6);assert.equal(bonus.frames[0].activeOlympus.length,6);assert.equal(bonus.frames[1].stickyBefore.length,6);assert.equal(bonus.finalMultiplier,12);assert.ok(bonus.frames[1].initialGrid.every(row=>row.every(cell=>cell==="orb")));
});

test("Normal spin and 100x feature buy keep server shapes",()=>{
  const r=createOlympusStormResult(1000,()=>.5);assert.equal(r.initialGrid.length,5);assert.ok(r.initialGrid.every(row=>row.length===6));assert.ok(r.payout<=5_000_000);let seed=123456789;const rng=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296),b=createOlympusStormBonusBuyResult(1000,rng);assert.equal(b.bonusTriggered,true);assert.equal(b.bonusPurchased,true);assert.ok(b.bonus.frames.length>=15&&b.bonus.frames.length<=40);assert.ok(b.payout<=5_000_000);
});
