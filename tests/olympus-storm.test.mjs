import test from "node:test";
import assert from "node:assert/strict";
import {OLYMPUS_STORM_CONFIG,evaluateOlympusLines,rollOlympusReels,mergeOlympusReels,createOlympusStormResult} from "../src/games/olympus-storm.js";

const blank=()=>Array.from({length:5},()=>Array(6).fill("scatter"));

test("Olympus multipliers use requested rarity order",()=>{
  assert.deepEqual(OLYMPUS_STORM_CONFIG.multiplierValues,[2,5,10,500]);
  const w=OLYMPUS_STORM_CONFIG.multiplierWeights;
  assert.ok(w[0]>w[1]&&w[1]>w[2]&&w[2]>w[3]);
});

test("three natural horizontal symbols win without unrelated Olympus multiplier",()=>{
  const grid=blank();grid[1][0]=grid[1][1]=grid[1][2]="gem_yellow";
  const result=evaluateOlympusLines(grid,1000,[{c:5,value:500}],5_000_000);
  const win=result.wins.find(x=>x.symbol==="gem_yellow"&&x.direction==="H");
  assert.ok(win);assert.equal(win.length,3);assert.equal(win.usesOlympus,false);assert.equal(win.multiplier,1);assert.deepEqual(win.olympusReels,[]);
});

test("yellow then Olympus then yellow is one contiguous multiplied line",()=>{
  const grid=blank();grid[2][0]="gem_yellow";grid[2][2]="gem_yellow";
  const result=evaluateOlympusLines(grid,1000,[{c:1,value:5},{c:5,value:500}],5_000_000);
  const win=result.wins.find(x=>x.symbol==="gem_yellow"&&x.direction==="H"&&x.start.c===0);
  assert.ok(win);assert.equal(win.length,3);assert.equal(win.usesOlympus,true);assert.equal(win.multiplier,5);assert.deepEqual(win.olympusReels,[{c:1,value:5}]);
});

test("three natural symbols followed by Olympus extend to four and use its multiplier",()=>{
  const grid=blank();grid[0][0]=grid[0][1]=grid[0][2]="gem_green";
  const result=evaluateOlympusLines(grid,1000,[{c:3,value:2}],5_000_000);
  const win=result.wins.find(x=>x.symbol==="gem_green"&&x.direction==="H"&&x.start.c===0);
  assert.ok(win);assert.equal(win.length,4);assert.equal(win.multiplier,2);assert.equal(win.usesOlympus,true);
});

test("vertical three-of-a-kind wins and ignores Olympus on another column",()=>{
  const grid=blank();grid[0][0]=grid[1][0]=grid[2][0]="gem_red";
  const result=evaluateOlympusLines(grid,1000,[{c:4,value:10}],5_000_000);
  const win=result.wins.find(x=>x.symbol==="gem_red"&&x.direction==="V");
  assert.ok(win);assert.equal(win.length,3);assert.equal(win.multiplier,1);assert.equal(win.usesOlympus,false);
});

test("downward diagonal can pass through Olympus and receive only its multiplier",()=>{
  const grid=blank();grid[0][0]="gem_blue";grid[2][2]="gem_blue";
  const result=evaluateOlympusLines(grid,1000,[{c:1,value:10},{c:5,value:500}],5_000_000);
  const win=result.wins.find(x=>x.symbol==="gem_blue"&&x.direction==="D_DOWN"&&x.start.r===0&&x.start.c===0);
  assert.ok(win);assert.equal(win.length,3);assert.equal(win.multiplier,10);assert.deepEqual(win.olympusReels,[{c:1,value:10}]);
});

test("upward diagonal also wins",()=>{
  const grid=blank();grid[0][4]=grid[1][3]=grid[2][2]="crown";
  const result=evaluateOlympusLines(grid,1000,[],5_000_000);
  const win=result.wins.find(x=>x.symbol==="crown"&&x.direction==="D_UP");
  assert.ok(win);assert.equal(win.length,3);assert.equal(win.multiplier,1);
});

test("broken or bent symbols do not create a fake line",()=>{
  const grid=blank();grid[0][0]="gem_purple";grid[0][2]="gem_purple";grid[2][1]="gem_purple";
  const result=evaluateOlympusLines(grid,1000,[],5_000_000);
  assert.equal(result.wins.some(x=>x.symbol==="gem_purple"),false);
});

test("multiple Olympus multipliers add only when both are inside the same line",()=>{
  const grid=blank();grid[3][0]="crown";grid[3][3]="crown";
  const result=evaluateOlympusLines(grid,1000,[{c:1,value:2},{c:2,value:5},{c:5,value:500}],5_000_000);
  const win=result.wins.find(x=>x.symbol==="crown"&&x.direction==="H"&&x.start.c===0);
  assert.ok(win);assert.equal(win.length,4);assert.equal(win.multiplier,7);assert.deepEqual(win.olympusReels,[{c:1,value:2},{c:2,value:5}]);
});

test("Sticky Olympus reels merge without changing an existing multiplier",()=>{
  const merged=mergeOlympusReels([{c:2,value:5}],[{c:4,value:10}]);
  assert.deepEqual(merged,[{c:2,value:5},{c:4,value:10}]);
  assert.deepEqual(mergeOlympusReels(merged,[{c:2,value:500}]),merged);
});

test("x2 is common and x500 remains the rare tail",()=>{
  assert.equal(rollOlympusReels(false,()=>0,[])[0]?.value,2);
  let calls=0;const rng=()=>{calls++;return calls%2?0:0.9999999;};
  const reels=rollOlympusReels(false,rng,[]);
  assert.ok(reels.every(x=>[2,5,10,500].includes(x.value)));
});

test("normal server result keeps 6x5 shape and max win cap",()=>{
  let seed=123456789;const rng=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  const r=createOlympusStormResult(1000,rng);
  assert.equal(r.initialGrid.length,5);assert.ok(r.initialGrid.every(row=>row.length===6));assert.ok(r.payout<=5_000_000);
});
