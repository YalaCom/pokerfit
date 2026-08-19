import test from "node:test";
import assert from "node:assert/strict";
import {LUCKY_COIN_CONFIG,createLuckyCoinResult,resolveCoinFeature,createRainbowBonus,freeSpinsFor,findPositions,drawCoinContent} from "../src/games/lucky-coin-collector.js";
function seq(values,fallback=.1){let i=0;return()=>i<values.length?values[i++]:fallback;}
function positions(n){return Array.from({length:n},(_,i)=>({r:Math.floor(i/5),c:i%5}));}

test("Lucky Coin Collector stays 5x5 with 10000x global cap",()=>{assert.equal(LUCKY_COIN_CONFIG.reels,5);assert.equal(LUCKY_COIN_CONFIG.rows,5);assert.equal(LUCKY_COIN_CONFIG.coinTriggerCount,3);assert.equal(LUCKY_COIN_CONFIG.maxLayerMultiplier,10);assert.equal(LUCKY_COIN_CONFIG.maxCollectorCycles,4);assert.equal(LUCKY_COIN_CONFIG.maxWinMultiplier,10000);});

test("cash coins are absolute values from 500 to 50000",()=>{for(const r of [0,.2,.45,.7,.9,.999]){const c=drawCoinContent(()=>r,{allowCollector:false});if(c.kind==="cash"){assert.ok(c.value>=500);assert.ok(c.value<=50000);assert.equal(c.multiplier,undefined);}}});

test("server result is authoritative and respects cap",()=>{const r=createLuckyCoinResult(10000,()=>0);assert.equal(r.initialGrid.length,5);assert.ok(r.initialGrid.every(row=>row.length===5));assert.ok(r.payout>=0&&r.payout<=10000*LUCKY_COIN_CONFIG.maxWinMultiplier);assert.equal(r.coinCount,findPositions(r.initialGrid,"coin").length);assert.equal(r.rainbowCount,findPositions(r.initialGrid,"rainbow_scatter").length);});

test("Rainbow award table is unchanged",()=>{assert.equal(freeSpinsFor(2),0);assert.equal(freeSpinsFor(3),8);assert.equal(freeSpinsFor(4),10);assert.equal(freeSpinsFor(5),12);assert.equal(freeSpinsFor(6),15);assert.equal(freeSpinsFor(9),15);});

test("x5 applies before Collector and used Collector never collects refresh again",()=>{const rng=seq([.999,.98,.1,.1,.1,.1, .95,.1,.1,.1,.1],.1);const feature=resolveCoinFeature(positions(4),rng,1_000_000);assert.equal(feature.collectorCycles,1);assert.equal(feature.layers.length,2);const first=feature.layers[0],second=feature.layers[1];assert.ok(first.collector);assert.equal(first.layerMultiplier,5);assert.equal(first.cashSum,1000);assert.equal(first.creditedAmount,5000);assert.equal(first.refresh,true);assert.equal(first.usedCollectors.length,1);assert.equal(second.collector,null);assert.equal(second.layerMultiplier,2);assert.equal(second.creditedAmount,2000);assert.equal(feature.payout,7000);});

test("Collector chains use new Collectors only and never exceed four cycles",()=>{const feature=resolveCoinFeature(positions(10),()=>.999,10_000_000);assert.ok(feature.collectorCycles<=4);assert.ok(feature.layers.length<=5);const used=feature.layers.flatMap(x=>x.usedCollectors);assert.equal(new Set(used).size,feature.collectorCycles);});

test("Rainbow bonus keeps landed coins sticky and final reveal uses same cash resolver",()=>{const bonus=createRainbowBonus(3,1000,()=>.91,10_000_000);assert.equal(bonus.awardedSpins,8);assert.equal(bonus.fullBoard,true);assert.equal(bonus.playedSpins,1);assert.equal(bonus.stickyCount,25);assert.equal(new Set(bonus.stickyPositions.map(p=>`${p.r}:${p.c}`)).size,25);assert.ok(bonus.finalCoinFeature);assert.equal(bonus.finalCoinFeature.positions.length,25);assert.ok(bonus.payout<=10_000_000);});
