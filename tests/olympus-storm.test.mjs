import test from "node:test";
import assert from "node:assert/strict";
import {OLYMPUS_STORM_CONFIG,createOlympusStormResult,createOlympusStormBonusBuyResult,evaluatePayAnywhere,runTumbles} from "../src/games/olympus-storm.js";

test("Olympus Storm uses 6x5 Pay Anywhere and 5000x max win",()=>{
  assert.equal(OLYMPUS_STORM_CONFIG.reels,6);
  assert.equal(OLYMPUS_STORM_CONFIG.rows,5);
  assert.equal(OLYMPUS_STORM_CONFIG.freeSpins,15);
  assert.equal(OLYMPUS_STORM_CONFIG.retriggerSpins,5);
  assert.equal(OLYMPUS_STORM_CONFIG.maxWinMultiplier,5000);
  assert.ok(OLYMPUS_STORM_CONFIG.multiplierValues.includes(500));
});

test("Pay Anywhere pays 8+ identical symbols regardless of position",()=>{
  const grid=Array.from({length:5},()=>Array(6).fill("gem_blue"));
  const result=evaluatePayAnywhere(grid,1000);
  assert.equal(result.wins.length,1);
  assert.equal(result.wins[0].count,30);
  assert.equal(result.wins[0].factor,2);
  assert.equal(result.payout,1700);
});

test("Tumble removes the win and refills the board",()=>{
  const state=Array.from({length:5},()=>Array.from({length:6},()=>({symbol:"crown"})));
  const result=runTumbles(state,1000,{rng:()=>.999999,bonus:false,maxPayout:5_000_000});
  assert.equal(result.cascades.length,1);
  assert.equal(result.cascades[0].removed.length,30);
  assert.equal(result.cascades[0].nextMultipliers.length,30);
  assert.ok(result.cascades[0].nextMultipliers.every(x=>x.value===500));
});

test("Storm orbs sum in base and accumulate in free spins",()=>{
  const state=Array.from({length:5},()=>Array.from({length:6},(_,i)=>({symbol:["gem_blue","gem_green","gem_yellow","gem_purple","gem_red","ring"][i%6]})));
  for(let i=0;i<8;i++)state[Math.floor(i/6)][i%6]={symbol:"crown"};
  state[4][5]={symbol:"orb",value:12};
  const result=runTumbles(state,1000,{bonus:true,rng:()=>.999999,runningMultiplier:5,maxPayout:5_000_000});
  assert.ok(result.cascades.length>=1);
  assert.equal(result.cascades[0].multiplierTotal,12);
  assert.equal(result.cascades[0].runningMultiplierBefore,5);
  assert.equal(result.cascades[0].runningMultiplierAfter,17);
  assert.equal(result.cascades[0].multiplier,17);
});

test("Normal spin and 100x feature buy are server deterministic shapes",()=>{
  const r=createOlympusStormResult(1000,()=>0);
  assert.equal(r.initialGrid.length,5);
  assert.ok(r.initialGrid.every(row=>row.length===6));
  assert.ok(r.payout<=5_000_000);
  let seed=123456789;const rng=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  const b=createOlympusStormBonusBuyResult(1000,rng);
  assert.equal(b.bonusTriggered,true);
  assert.equal(b.bonusPurchased,true);
  assert.ok(b.bonus.frames.length>=15&&b.bonus.frames.length<=40);
  assert.ok(b.payout<=5_000_000);
});
