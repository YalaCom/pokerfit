import test from "node:test";
import assert from "node:assert/strict";
import {normalizeWebLogin,validWebPassword,makeSignedInitData} from "../src/web-auth.js";
import {validateTelegramInitData} from "../src/auth.js";

test("web login validation is deterministic",()=>{
  assert.equal(normalizeWebLogin(" Player.One "),"player.one");
  assert.equal(normalizeWebLogin("ab"),"");
  assert.equal(normalizeWebLogin("bad login"),"");
  assert.equal(validWebPassword("12345678"),true);
  assert.equal(validWebPassword("1234567"),false);
});

test("browser session bridge creates Telegram-compatible signed initData",async()=>{
  const token="123456789:TEST_BOT_TOKEN_FOR_UNIT_TEST";
  const user={id:"web_example_player",first_name:"Browser",username:"browser01"};
  const initData=await makeSignedInitData(user,token);
  const verified=await validateTelegramInitData(initData,token,60);
  assert.equal(verified.ok,true);
  assert.equal(String(verified.user.id),"web_example_player");
  assert.equal(verified.user.first_name,"Browser");
});
