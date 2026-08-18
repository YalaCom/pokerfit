import test from "node:test";
import assert from "node:assert/strict";
import { value } from "../src/blackjack.js";
test("Blackjack ace handling",()=>assert.equal(value([{rank:"A",suit:"S"},{rank:"9",suit:"H"},{rank:"5",suit:"D"}]).total,15));
test("Natural blackjack",()=>assert.equal(value([{rank:"A",suit:"S"},{rank:"K",suit:"H"}]).blackjack,true));
test("Multiple aces",()=>assert.equal(value([{rank:"A",suit:"S"},{rank:"A",suit:"H"},{rank:"9",suit:"D"}]).total,21));
