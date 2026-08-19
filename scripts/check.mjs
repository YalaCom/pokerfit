import {execFileSync} from "node:child_process";
import {accessSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
const root=resolve(new URL("..",import.meta.url).pathname);
const jsFiles=[
  "src/auth.js","src/casino-main.js","src/games/aureus.js","src/games/honey-fruits.js","src/games/lucky-coin-collector.js","src/games/neon-beast-rampage.js",
  "public/casino-app.js","public/game/core/AnimatedNumberCounter.js","public/game/core/AssetManager.js","public/game/core/AudioManager.js","public/game/core/GameEngine.js","public/game/core/GameStateMachine.js","public/game/core/HapticManager.js","public/game/core/ParticleManager.js","public/game/core/ReelEngine.js","public/game/core/WinPresentationManager.js",
  "public/game/games/GiantBeeController.js","public/game/games/HoneyFruitsController.js","public/game/games/LuckyCoinCollectorController.js","public/game/games/NeonBeastController.js",
  "public/game/games/lucky/CoinFeatureController.js","public/game/games/lucky/CoinRevealAnimator.js","public/game/games/lucky/CollectorController.js","public/game/games/lucky/StickyCoinManager.js",
  "scripts/deploy.mjs","scripts/simulate-lucky-coin.mjs","tests/aureus-engine.test.mjs","tests/honey-fruits.test.mjs","tests/lucky-coin-collector.test.mjs","tests/neon-beast.test.mjs"
];
for(const file of jsFiles){const path=resolve(root,file);accessSync(path);execFileSync(process.execPath,["--check",path],{stdio:"inherit"});console.log("OK",file);}
const jsonFiles=["public/assets/assets.manifest.json","public/assets/games/aureus/config.json","public/assets/games/aureus/atlas/symbols.json","public/assets/games/honey-fruits/config.json","public/assets/games/honey-fruits/atlas/symbols.json","public/assets/games/lucky-coin-collector/config.json","public/assets/games/neon-beast-rampage/config.json","reports/lucky-coin-collector-10m.json"];
for(const file of jsonFiles){const path=resolve(root,file);JSON.parse(readFileSync(path,"utf8"));console.log("JSON OK",file);}
const manifest=JSON.parse(readFileSync(resolve(root,"public/assets/assets.manifest.json"),"utf8"));
for(const [id,entry] of Object.entries(manifest.games||{})){for(const [key,url] of Object.entries(entry)){if(key==="extras"||typeof url!=="string"||!url.startsWith("/"))continue;const path=resolve(root,"public",url.slice(1));accessSync(path);console.log("ASSET OK",id,key,url);}for(const [key,url] of Object.entries(entry.extras||{})){const path=resolve(root,"public",String(url).replace(/^\//,""));accessSync(path);console.log("EXTRA OK",id,key,url);}}
for(const [id,url] of Object.entries(manifest.covers||{})){accessSync(resolve(root,"public",String(url).replace(/^\//,"")));console.log("COVER OK",id,url);}
const lucky=JSON.parse(readFileSync(resolve(root,"public/assets/games/lucky-coin-collector/config.json"),"utf8"));if(lucky.reels!==5||lucky.rows!==5)throw new Error("LUCKY_GRID_CONFIG_INVALID");if(lucky.maxWinMultiplier!==10000)throw new Error("LUCKY_MAX_WIN_INVALID");if(!lucky.emojiSymbols||!lucky.symbols.every(id=>lucky.emojiSymbols[id]))throw new Error("LUCKY_EMOJI_SYMBOLS_INCOMPLETE");
const neon=JSON.parse(readFileSync(resolve(root,"public/assets/games/neon-beast-rampage/config.json"),"utf8"));if(neon.reels!==6||neon.rows!==4)throw new Error("NEON_GRID_CONFIG_INVALID");if(neon.controller!=="NEON_BEAST_RAMPAGE")throw new Error("NEON_CONTROLLER_INVALID");if(!neon.emojiSymbols||!neon.symbols.every(id=>neon.emojiSymbols[id]))throw new Error("NEON_SYMBOLS_INCOMPLETE");
execFileSync(process.execPath,["--test",resolve(root,"tests/aureus-engine.test.mjs"),resolve(root,"tests/honey-fruits.test.mjs"),resolve(root,"tests/lucky-coin-collector.test.mjs"),resolve(root,"tests/neon-beast.test.mjs")],{stdio:"inherit"});
console.log("Active FIT Casino check passed: Aureus + Honey Fruits + Lucky Coin Collector + Neon Beast Rampage.");
