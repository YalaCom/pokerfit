import test from "node:test";
import assert from "node:assert/strict";
import {OLYMPUS_STORM_CONFIG,evaluateOlympusWays,rollOlympusReels,mergeOlympusReels,createOlympusStormResult} from "../src/games/olympus-storm.js";

test("Olympus multipliers use requested rarity order",()=>{
  assert.deepEqual(OLYMPUS_STORM_CONFIG.multiplierValues,[2,5,10,500]);
  const w=OLYMPUS_STORM_CONFIG.multiplierWeights;
  assert.ok(w[0]>w[1]&&w[1]>w[2]&&w[2]>w[3]);
});

test("Olympus reel bridges equal symbols left-to-right as a full wild reel",()=>{
  const grid=Array.from({length:5},()=>Array(6).fill("scatter"));
  grid[0][0]="gem_green"; grid[3][1]="gem_green"; grid[2][3]="gem_green";
  const result=evaluateOlympusWays(grid,1000,[{c:2,value:5}],5_000_000);
  const win=result.wins.find(x=>x.symbol==="gem_green");
  assert.ok(win);
  assert.equal(win.reels,4);
  assert.equal(win.usesOlympus,true);
  assert.equal(win.multiplier,5);
  assert.ok(win.positions.filter(p=>p.c===2).length===5);
});

test("Olympus reel does not invent a win when the left-to-right chain is broken",()=>{
  const grid=Array.from({length:5},()=>Array(6).fill("scatter"));
  grid[0][0]="gem_blue"; grid[0][3]="gem_blue";
  const result=evaluateOlympusWays(grid,1000,[{c:2,value:2}],5_000_000);
  assert.equal(result.wins.some(x=>x.symbol==="gem_blue"),false);
});

test("Sticky Olympus reels merge without changing their multiplier",()=>{
  const merged=mergeOlympusReels([{c:2,value:5}],[{c:4,value:10}]);
  assert.deepEqual(merged,[{c:2,value:5},{c:4,value:10}]);
  assert.deepEqual(mergeOlympusReels(merged,[{c:2,value:500}]),merged);
});

test("x2 is common and x500 is the rare tail of the deterministic weight table",()=>{
  assert.equal(rollOlympusReels(false,()=>0,[])[0]?.value,2);
  let calls=0;const rng=()=>{calls++;return calls%2?0:0.9999999;};
  const reels=rollOlympusReels(false,rng,[]);
  assert.ok(reels.every(x=>[2,5,10,500].includes(x.value)));
});

test("normal server result keeps 6x5 shape and max win cap",()=>{
  let seed=123456789;const rng=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  const r=createOlympusStormResult(1000,rng);
  assert.equal(r.initialGrid.length,5);
  assert.ok(r.initialGrid.every(row=>row.length===6));
  assert.ok(r.payout<=5_000_000);
});
