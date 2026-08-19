import test from "node:test";
import assert from "node:assert/strict";
import {
  LUCKY_COIN_CONFIG,
  createLuckyCoinResult,
  resolveCoinFeature,
  createRainbowBonus,
  freeSpinsFor,
  findPositions
} from "../src/games/lucky-coin-collector.js";

function seq(values,fallback=0){let i=0;return()=>i<values.length?values[i++]:fallback;}
function positions(n){return Array.from({length:n},(_,i)=>({r:Math.floor(i/5),c:i%5}));}

test("Lucky Coin Collector config is fixed 5x5 with 10000x cap",()=>{
  assert.equal(LUCKY_COIN_CONFIG.reels,5);
  assert.equal(LUCKY_COIN_CONFIG.rows,5);
  assert.equal(LUCKY_COIN_CONFIG.coinTriggerCount,3);
  assert.equal(LUCKY_COIN_CONFIG.rainbowTriggerCount,3);
  assert.equal(LUCKY_COIN_CONFIG.maxLayerMultiplier,10);
  assert.equal(LUCKY_COIN_CONFIG.maxCollectorCycles,4);
  assert.equal(LUCKY_COIN_CONFIG.maxWinMultiplier,10000);
  assert.equal(LUCKY_COIN_CONFIG.targetRTP,.96);
});

test("server result is always a 5x5 authoritative grid and respects max win",()=>{
  const r=createLuckyCoinResult(10_000,()=>0);
  assert.equal(r.initialGrid.length,5);
  assert.ok(r.initialGrid.every(row=>Array.isArray(row)&&row.length===5));
  assert.ok(r.payout>=0);
  assert.ok(r.payout<=10_000*LUCKY_COIN_CONFIG.maxWinMultiplier);
  assert.equal(r.coinCount,findPositions(r.initialGrid,"coin").length);
  assert.equal(r.rainbowCount,findPositions(r.initialGrid,"rainbow_scatter").length);
});

test("free-spin award table follows Rainbow scatter config",()=>{
  assert.equal(freeSpinsFor(2),0);
  assert.equal(freeSpinsFor(3),8);
  assert.equal(freeSpinsFor(4),10);
  assert.equal(freeSpinsFor(5),12);
  assert.equal(freeSpinsFor(6),15);
  assert.equal(freeSpinsFor(9),15);
});

test("Collector collects one layer, becomes used, then eligible coins refresh",()=>{
  const feature=resolveCoinFeature(positions(4),1,seq([.999,0,0,0,0,0,0],0),10000);
  assert.equal(feature.collectorCycles,1);
  assert.equal(feature.layers.length,2);
  assert.ok(feature.layers[0].collector);
  assert.equal(feature.layers[0].creditedX,3);
  assert.equal(feature.layers[0].refresh,true);
  assert.equal(feature.layers[0].usedCollectors.length,1);
  assert.equal(feature.layers[1].collector,null);
  assert.equal(feature.totalX,6);
});

test("multiple Collectors in one layer queue deterministically and do not double-credit a layer",()=>{
  const feature=resolveCoinFeature(positions(4),1,seq([.999,.999,0,0,0,0,0,0],0),10000);
  assert.equal(feature.collectorCycles,2);
  assert.equal(feature.layers[0].creditedX,2);
  assert.equal(feature.layers[1].creditedX,2);
  assert.equal(feature.layers.at(-1).creditedX,2);
  assert.equal(feature.totalX,6);
  assert.equal(new Set(feature.layers.flatMap(x=>x.usedCollectors)).size,2);
});

test("Collector chain never exceeds configured max cycles",()=>{
  const feature=resolveCoinFeature(positions(10),1,()=>.999,10000);
  assert.ok(feature.collectorCycles<=LUCKY_COIN_CONFIG.maxCollectorCycles);
  assert.ok(feature.layers.length<=LUCKY_COIN_CONFIG.maxCollectorCycles+1);
});

test("Rainbow bonus keeps every landed coin sticky and stops on full 25-cell board",()=>{
  const bonus=createRainbowBonus(3,1,()=>.91,10000);
  assert.equal(bonus.awardedSpins,8);
  assert.equal(bonus.fullBoard,true);
  assert.equal(bonus.playedSpins,1);
  assert.equal(bonus.stickyCount,25);
  assert.equal(new Set(bonus.stickyPositions.map(p=>`${p.r}:${p.c}`)).size,25);
  assert.ok(bonus.finalCoinFeature);
  assert.equal(bonus.finalCoinFeature.positions.length,25);
  assert.ok(bonus.payout<=LUCKY_COIN_CONFIG.maxWinMultiplier);
});

test("Coin layer multiplier is capped at x10",()=>{
  const feature=resolveCoinFeature(positions(5),1,seq([.973,.973,.973,0,0],0),10000);
  assert.ok(feature.layers.every(layer=>layer.layerMultiplier<=10));
});
