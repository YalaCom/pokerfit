import test from "node:test";
import assert from "node:assert/strict";
import {SLOT_PROFILES,slotProfile,scaleSlotPayout,scaleSlotMultiplier} from "../src/slot-economy.js";

test("all casino slots use fixed profiles",()=>{
  for(const id of ["slots","mega","royal5","neon8","vault5","moon5","dragon6","grandjackpot"]){
    const p=slotProfile(id);
    assert.equal(p.id,id);
    assert.ok(p.targetRtp>=0.9&&p.targetRtp<1);
    assert.ok(p.payoutScale>0);
  }
});

test("slot payout scale does not depend on bet size or player history",()=>{
  for(const id of Object.keys(SLOT_PROFILES)){
    const scale=slotProfile(id).payoutScale;
    assert.equal(scaleSlotPayout(id,10_000),Math.floor(10_000*scale));
    assert.equal(scaleSlotPayout(id,1_000_000),Math.floor(1_000_000*scale));
    assert.equal(scaleSlotMultiplier(id,2),Math.floor(2*scale*100)/100);
  }
});
