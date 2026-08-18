import test from "node:test";
import assert from "node:assert/strict";
import {slotMultiplier,crashPointFromUnit,multiplierAtMs} from "../src/casino.js";

test("slot jackpot",()=>assert.equal(slotMultiplier(["7️⃣","7️⃣","7️⃣"]),25));
test("slot pair",()=>assert.equal(slotMultiplier(["⭐","⭐","🍋"]),1.2));
test("slot miss",()=>assert.equal(slotMultiplier(["⭐","🔔","🍋"]),0));
test("crash point instant floor",()=>assert.equal(crashPointFromUnit(0),1));
test("crash point bounded",()=>{for(const x of [0.02,.2,.5,.9,.999]){const m=crashPointFromUnit(x);assert.ok(m>=1&&m<=100)}});
test("crash multiplier starts at one",()=>assert.equal(multiplierAtMs(0),1));
test("crash multiplier grows",()=>assert.ok(multiplierAtMs(10000)>2.7));
