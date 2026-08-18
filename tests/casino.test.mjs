import test from "node:test";
import assert from "node:assert/strict";
import {slotMultiplier,megaSlotPayout,baccaratRound,crashPointFromUnit,multiplierAtMs} from "../src/casino.js";

test("slot jackpot",()=>assert.equal(slotMultiplier(["7️⃣","7️⃣","7️⃣"]),25));
test("slot pair",()=>assert.equal(slotMultiplier(["⭐","⭐","🍋"]),1.2));
test("slot miss",()=>assert.equal(slotMultiplier(["⭐","🔔","🍋"]),0));

test("mega slot six sevens pays lines",()=>{
  const grid=Array.from({length:3},()=>Array(6).fill("🍋"));
  grid[1]=Array(6).fill("7️⃣");
  const r=megaSlotPayout(grid,20000);
  assert.ok(r.lines.some(x=>x.symbol==="7️⃣"&&x.count===6));
  assert.ok(r.multiplier>0);
});

test("mega scatter bonus",()=>{
  const grid=[Array(6).fill("🍒"),Array(6).fill("🍋"),Array(6).fill("🔔")];
  grid[0][0]="🌟";grid[1][2]="🌟";grid[2][5]="🌟";
  const r=megaSlotPayout(grid,10000);
  assert.equal(r.scatterCount,3);
  assert.equal(r.scatterMultiplier,2);
});

test("baccarat produces valid totals and winner",()=>{
  for(let i=0;i<25;i++){
    const r=baccaratRound();
    assert.ok(r.playerValue>=0&&r.playerValue<=9);
    assert.ok(r.bankerValue>=0&&r.bankerValue<=9);
    assert.ok(["player","banker","tie"].includes(r.winner));
    assert.ok(r.player.length>=2&&r.player.length<=3);
    assert.ok(r.banker.length>=2&&r.banker.length<=3);
  }
});

test("crash point instant floor",()=>assert.equal(crashPointFromUnit(0),1));
test("crash point bounded",()=>{for(const x of [0.02,.2,.5,.9,.999]){const m=crashPointFromUnit(x);assert.ok(m>=1&&m<=100)}});
test("crash multiplier starts at one",()=>assert.equal(multiplierAtMs(0),1));
test("crash multiplier grows",()=>assert.ok(multiplierAtMs(10000)>2.7));
