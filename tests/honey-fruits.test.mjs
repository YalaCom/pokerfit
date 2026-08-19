import test from "node:test";
import assert from "node:assert/strict";
import {HONEY_FRUITS_CONFIG,createHoneyFruitsResult,getValidBeePositions} from "../src/games/honey-fruits.js";

test("Honey Fruits returns a server-authoritative 18x10 field",()=>{
  for(let i=0;i<12;i++){
    const r=createHoneyFruitsResult(10_000);
    assert.equal(r.initialGrid.length,10);
    assert.ok(r.initialGrid.every(row=>row.length===18));
    assert.ok(Array.isArray(r.wins));
    assert.ok(r.payout>=0&&r.payout<=10_000*HONEY_FRUITS_CONFIG.maxWin);
    assert.equal(r.scatterCount,r.scatterPositions.length);
  }
});

test("Giant Bee valid positions never leave the 18x10 board",()=>{
  for(const [w,h] of HONEY_FRUITS_CONFIG.beeSizes){
    const positions=getValidBeePositions(w,h);assert.ok(positions.length>0);
    for(const p of positions){assert.ok(p.x>=0&&p.y>=0);assert.ok(p.x+w<=18);assert.ok(p.y+h<=10);}
  }
});

test("A naturally triggered Honey Bee Bonus preserves growth rules",()=>{
  let result=null;
  for(let i=0;i<3000;i++){const r=createHoneyFruitsResult(1_000);if(r.bonusTriggered){result=r;break;}}
  assert.ok(result?.bonus,"expected a naturally generated 3+ Bee Scatter bonus within sample");
  const bonus=result.bonus;assert.equal(bonus.initialSpins,6);assert.ok(bonus.frames.length>=6);
  for(const frame of bonus.frames){
    const b=frame.beeBefore;assert.ok(b.widthCells>=2&&b.widthCells<=6);assert.ok(b.heightCells>=2&&b.heightCells<=5);assert.ok(b.position.x+b.widthCells<=18);assert.ok(b.position.y+b.heightCells<=10);assert.equal(frame.collectedBees,frame.scatterPositions.length);
    const scatter=new Set(frame.scatterPositions.map(p=>`${p.r}:${p.c}`));for(const p of frame.wildCells)assert.ok(!scatter.has(`${p.r}:${p.c}`),"Giant Bee must not replace Scatter");
    for(const g of frame.growths){assert.equal(g.toLevel,g.fromLevel+1);assert.equal(g.extraSpins,2);assert.deepEqual([g.widthCells,g.heightCells],HONEY_FRUITS_CONFIG.beeSizes[g.toLevel]);assert.ok(g.position.x+g.widthCells<=18);assert.ok(g.position.y+g.heightCells<=10);}
    assert.ok(frame.remainingAfter>=0);assert.ok(frame.beeAfter.widthCells<=6&&frame.beeAfter.heightCells<=5);
  }
});
