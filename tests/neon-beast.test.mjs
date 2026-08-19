import test from "node:test";
import assert from "node:assert/strict";
import {NEON_BEAST_CONFIG,createNeonBeastResult,createPortalMorph,createRampageBonus,evaluateWays} from "../src/games/neon-beast-rampage.js";

test("Neon Beast uses a 6x4 grid and fixed max win",()=>{assert.equal(NEON_BEAST_CONFIG.reels,6);assert.equal(NEON_BEAST_CONFIG.rows,4);assert.equal(NEON_BEAST_CONFIG.maxWinMultiplier,2000);const r=createNeonBeastResult(10000,()=>0);assert.equal(r.initialGrid.length,4);assert.ok(r.initialGrid.every(row=>row.length===6));assert.ok(r.payout<=20_000_000);});

test("Portal Morph changes only the selected target into Beast",()=>{const grid=Array.from({length:4},()=>["bot","alien","dragon","crystal","eye","bot"]);const morph=createPortalMorph(grid,1000,()=>0,2_000_000);assert.equal(morph.targetSymbol,"bot");assert.equal(morph.changed.length,8);for(const p of morph.changed)assert.equal(morph.grid[p.r][p.c],"beast");});

test("Rampage has five animated server rounds with growing multipliers",()=>{const b=createRampageBonus(1000,()=>.25,2_000_000);assert.equal(b.frames.length,5);assert.deepEqual(b.frames.map(x=>x.round),[1,2,3,4,5]);assert.ok(b.frames.every(x=>Array.isArray(x.attackCells)&&x.attackCells.length>0));assert.ok(b.frames.every(x=>x.grid.length===4&&x.grid.every(row=>row.length===6)));assert.ok(b.frames[4].multiplier>=8);});

test("Ways math is server deterministic",()=>{const grid=Array.from({length:4},()=>Array(6).fill("bot"));const a=evaluateWays(grid,1000),b=evaluateWays(grid,1000);assert.equal(a.payout,b.payout);assert.ok(a.payout>0);assert.ok(a.wins.length>0);});
