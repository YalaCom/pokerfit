import test from "node:test";
import assert from "node:assert/strict";
import {ADVANCED_SLOT_CONFIGS,buildPaylines,evaluateAdvancedGrid} from "../src/advanced-slots.js";

test("3x5 slot has 20 valid paylines",()=>{
  const lines=buildPaylines(3,5,20);assert.equal(lines.length,20);
  assert.ok(lines.every(line=>line.length===5&&line.every(r=>r>=0&&r<3)));
});

test("4x8 slot has 40 valid paylines",()=>{
  const lines=buildPaylines(4,8,40);assert.equal(lines.length,40);
  assert.ok(lines.every(line=>line.length===8&&line.every(r=>r>=0&&r<4)));
});

test("5x5 slot has 25 valid paylines",()=>{
  const lines=buildPaylines(5,5,25);assert.equal(lines.length,25);
  assert.ok(lines.every(line=>line.length===5&&line.every(r=>r>=0&&r<5)));
});

test("royal slot pays consecutive symbols from left",()=>{
  const g=[
    ["💎","💎","💎","🍋","🍒"],
    ["🍋","🍒","🔔","🍇","7️⃣"],
    ["🔔","🍇","🍋","🍒","💎"]
  ];
  const r=evaluateAdvancedGrid("royal5",g,10000);
  assert.ok(r.lines.some(x=>x.line===1&&x.symbol==="💎"&&x.count===3));
  assert.ok(r.payout>0);
});

test("wild substitutes on a payline",()=>{
  const g=[
    ["🃏","💎","💎","💎","🍋"],
    ["🍋","🍒","🔔","🍇","7️⃣"],
    ["🔔","🍇","🍋","🍒","💎"]
  ];
  const r=evaluateAdvancedGrid(ADVANCED_SLOT_CONFIGS.royal5,g,10000);
  assert.ok(r.lines.some(x=>x.line===1&&x.symbol==="💎"&&x.count===4));
});

test("three scatters trigger Royal Fruits bonus condition",()=>{
  const g=[
    ["🌟","🍋","🍇","🔔","💎"],
    ["🍋","🌟","🔔","🍇","7️⃣"],
    ["🔔","🍇","🌟","🍒","💎"]
  ];
  const r=evaluateAdvancedGrid("royal5",g,10000);
  assert.equal(r.scatterCount,3);
  assert.ok(r.scatterCount>=ADVANCED_SLOT_CONFIGS.royal5.scatterTrigger);
});
