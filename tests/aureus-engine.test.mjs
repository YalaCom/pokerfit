import test from "node:test";
import assert from "node:assert/strict";
import {AUREUS_CONFIG,createAureusResult,createAureusBonusBuyResult} from "../src/games/aureus.js";

const BET=10_000;
const allowed=new Set(AUREUS_CONFIG.symbols);

function assertGrid(grid){
  assert.equal(grid.length,AUREUS_CONFIG.rows);
  for(const row of grid){assert.equal(row.length,AUREUS_CONFIG.reels);for(const symbol of row)assert.ok(allowed.has(symbol),`unknown symbol ${symbol}`);}
}

function assertCascade(cascade){
  assert.ok(cascade.multiplier>=1);assert.ok(Array.isArray(cascade.wins)&&cascade.wins.length>0);assert.ok(Array.isArray(cascade.removed)&&cascade.removed.length>0);assertGrid(cascade.nextGrid);
  assert.equal(cascade.payout,cascade.wins.reduce((sum,w)=>sum+Number(w.amount||0),0));
  const removed=new Set(cascade.removed.map(p=>`${p.r}:${p.c}`));assert.equal(removed.size,cascade.removed.length,"removed positions must be unique");
}

test("Aureus regular results are renderable and capped",()=>{
  for(let i=0;i<80;i++){
    const result=createAureusResult(BET);assertGrid(result.initialGrid);assertGrid(result.finalGrid);assert.ok(result.payout>=0);assert.ok(result.payout<=BET*AUREUS_CONFIG.maxWin);
    assert.ok(Number.isInteger(result.anticipationReel)&&result.anticipationReel>=-1&&result.anticipationReel<AUREUS_CONFIG.reels);
    for(const cascade of result.cascades||[])assertCascade(cascade);
    if(result.bonusTriggered){assert.ok(result.bonus);for(const frame of result.bonus.frames){assertGrid(frame.initialGrid);assertGrid(frame.finalGrid);for(const cascade of frame.cascades||[])assertCascade(cascade);}}
  }
});

test("Feature Buy always creates a complete Free Spins game mode",()=>{
  for(const tier of ["standard","premium","super"]){
    const result=createAureusBonusBuyResult(BET,tier);assert.equal(result.bonusTriggered,true);assert.equal(result.bonusPurchased,true);assert.equal(result.bonusTier,tier);assert.ok(result.bonus?.frames?.length>=8);assert.ok(result.bonus.frames.length<=14);assert.ok(result.payout<=BET*AUREUS_CONFIG.maxWin);assertGrid(result.initialGrid);
    for(const frame of result.bonus.frames){assertGrid(frame.initialGrid);assertGrid(frame.finalGrid);for(const cascade of frame.cascades||[])assertCascade(cascade);}
  }
});

test("Game-facing symbol IDs contain no emoji placeholders",()=>{
  const pictographic=/\p{Extended_Pictographic}/u;for(const id of AUREUS_CONFIG.symbols)assert.equal(pictographic.test(id),false,`emoji symbol id: ${id}`);
  assert.equal(AUREUS_CONFIG.rows,5);assert.equal(AUREUS_CONFIG.reels,6);assert.deepEqual(AUREUS_CONFIG.cascadeMultipliers,[1,2,3,5,10]);
});
