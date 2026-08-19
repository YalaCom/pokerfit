import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync("public/index.html","utf8");
const app=readFileSync("public/app.js","utf8");
const worker=readFileSync("src/fresh-main.js","utf8");
const wrangler=readFileSync("wrangler.template.jsonc","utf8");

test("poker UI is replaced by Alexey interactive story",()=>{
  assert.match(html,/ДВА АЛЕКСЕЯ/);
  assert.match(html,/АЛЕКСЕЯ КОЗЫРЯ/);
  assert.match(html,/АЛЕКСЕЯ ХАРЛАМОВА/);
  assert.doesNotMatch(html,/FIT POKER/);
});

test("story has long branching narrative and multiple endings",()=>{
  const sceneCount=(app.match(/chapter:/g)||[]).length;
  assert.ok(sceneCount>=35,`expected at least 35 scenes, got ${sceneCount}`);
  assert.match(app,/ЛЕГЕНДЫ ХАОСА/);
  assert.match(app,/КОМАНДА ИЗ ДВУХ/);
  assert.match(app,/ТОТ САМЫЙ ДЕНЬ/);
});

test("deployment no longer needs poker database or durable objects",()=>{
  assert.doesNotMatch(wrangler,/d1_databases/);
  assert.doesNotMatch(wrangler,/durable_objects/);
  assert.doesNotMatch(worker,/PokerTableDO/);
  assert.match(worker,/two-alexeys/);
});
