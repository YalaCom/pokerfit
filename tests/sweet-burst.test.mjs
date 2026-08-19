import test from "node:test";
import assert from "node:assert/strict";
import {SWEET_BURST_CONFIG,evaluateSweetAnywhere,runTumbles,createSweetBurstResult,createSweetFreeSpins} from "../src/games/sweet-burst.js";

const blank=()=>Array.from({length:5},()=>Array(6).fill("banana"));

test("classic 6x5 pay-anywhere uses 8 / 10 / 12+ tiers",()=>{
  const g=blank();for(let i=0;i<8;i++)g[Math.floor(i/6)][i%6]="red_heart";
  let r=evaluateSweetAnywhere(g,1000);let w=r.wins.find(x=>x.symbol==="red_heart");assert.equal(w.count,8);assert.equal(w.amount,10000);
  g[1][2]="red_heart";g[1][3]="red_heart";r=evaluateSweetAnywhere(g,1000);w=r.wins.find(x=>x.symbol==="red_heart");assert.equal(w.count,10);assert.equal(w.amount,25000);
  g[1][4]="red_heart";g[1][5]="red_heart";r=evaluateSweetAnywhere(g,1000);w=r.wins.find(x=>x.symbol==="red_heart");assert.equal(w.count,12);assert.equal(w.amount,50000);
});

test("seven matching symbols do not pay",()=>{
  const g=Array.from({length:5},()=>Array(6).fill("lollipop"));for(let i=0;i<7;i++)g[Math.floor(i/6)][i%6]="apple";
  const r=evaluateSweetAnywhere(g,1000);assert.equal(r.wins.some(x=>x.symbol==="apple"),false);
});

test("bonus bomb values are classic 2x through 100x discrete set",()=>{
  assert.deepEqual(Object.values(SWEET_BURST_CONFIG.bombValues),[2,3,5,10,25,50,100]);
});

test("bombs multiply the whole tumble sequence only when there was a win",()=>{
  const g=Array.from({length:5},()=>Array(6).fill("lollipop"));
  for(let i=0;i<8;i++)g[Math.floor(i/6)][i%6]="banana";
  g[4][5]="bomb_10";
  const constant=()=>.999999;
  const r=runTumbles(g,1000,{bonus:true,rng:constant,maxPayout:1_000_000});
  assert.ok(r.rawPayout>0);assert.ok(r.bombMultiplier>=10);assert.equal(r.payout,Math.min(1_000_000,r.rawPayout*r.bombMultiplier));
});

test("normal result is capped to 21175x and has 6x5 shape",()=>{
  let seed=987654321;const rng=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  const r=createSweetBurstResult(1000,rng);assert.equal(r.initialGrid.length,5);assert.ok(r.initialGrid.every(row=>row.length===6));assert.ok(r.payout<=21_175_000);
});

test("free spins start at ten and retrigger logic never exceeds guard",()=>{
  let seed=123456789;const rng=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  const b=createSweetFreeSpins(1000,rng,10_000_000);assert.ok(b.frames.length>=10);assert.ok(b.frames.length<=60);
});
