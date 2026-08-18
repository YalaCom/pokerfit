import test from "node:test";
import assert from "node:assert/strict";
import {bonusBuyOptions,decorateMultiplierWilds} from "../src/bonus-engine.js";

test("bonus buy tiers scale from current bet",()=>{
  const options=bonusBuyOptions("royal5",10_000);
  assert.deepEqual(options.map(x=>x.cost),[600_000,1_000_000,1_800_000]);
  assert.deepEqual(options.map(x=>x.id),["standard","premium","super"]);
});

test("slots without feature buy return no buy options",()=>{
  assert.deepEqual(bonusBuyOptions("slots",10_000),[]);
  assert.deepEqual(bonusBuyOptions("mega",10_000),[]);
});

test("multiplier wild decorator preserves ordinary grids",()=>{
  const result={grid:[["🍒","🍋","🍇"],["🔔","💎","7️⃣"],["🍒","🍋","🍇"]],base:{payout:0,lines:[]}};
  const decorated=decorateMultiplierWilds("royal5",result);
  assert.deepEqual(decorated.grid,result.grid);
  assert.equal(decorated.multiplierWildExtra,0);
});
