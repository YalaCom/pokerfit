import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");

test("home contains exchange controls and jackpot in base HTML",()=>{
  const html=read("public/index.html");
  for(const id of ["homeExchangeBar","homeTopup","homeWithdraw","requiredHomeJackpot","requiredHomeJackpotValue"]){
    assert.match(html,new RegExp(`id=[\\\"']${id}[\\\"']`));
  }
  assert.match(html,/500K/);
  assert.match(html,/1M/);
  assert.match(html,/GRAND JACKPOT/);
});

test("required casino UI is booted by the main app",()=>{
  const app=read("public/app.js");
  assert.match(app,/initRequiredCasinoUI/);
  assert.match(app,/initMaxWinUI/);
});

test("worker serves fresh assets through fresh-main",()=>{
  const wrangler=read("wrangler.template.jsonc");
  const entry=read("src/fresh-main.js");
  assert.match(wrangler,/\"main\"\s*:\s*\"src\/fresh-main\.js\"/);
  assert.match(entry,/no-store, no-cache, must-revalidate/);
  assert.match(entry,/__fit_version/);
});

test("slot max win is stake x1000",()=>{
  assert.match(read("src/advanced-slots.js"),/MAX_WIN_MULTIPLIER=1000/);
  assert.match(read("src/more-slots.js"),/bet\*1000/);
  assert.match(read("src/jackpot-slot.js"),/MAX_WIN_MULTIPLIER=1000/);
});
