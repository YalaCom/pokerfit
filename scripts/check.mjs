import {execFileSync} from "node:child_process";
import {accessSync,readFileSync} from "node:fs";
import {resolve} from "node:path";

const root=resolve(new URL("..",import.meta.url).pathname);
const jsFiles=[
  "src/auth.js","src/casino-main.js","src/games/aureus.js",
  "public/casino-app.js",
  "public/game/core/AnimatedNumberCounter.js","public/game/core/AssetManager.js","public/game/core/AudioManager.js","public/game/core/GameEngine.js","public/game/core/GameStateMachine.js","public/game/core/HapticManager.js","public/game/core/ParticleManager.js","public/game/core/ReelEngine.js","public/game/core/WinPresentationManager.js",
  "scripts/deploy.mjs","tests/aureus-engine.test.mjs"
];
for(const file of jsFiles){const path=resolve(root,file);accessSync(path);execFileSync(process.execPath,["--check",path],{stdio:"inherit"});console.log("OK",file);}

const jsonFiles=["public/assets/assets.manifest.json","public/assets/games/aureus/config.json","public/assets/games/aureus/atlas/symbols.json"];
for(const file of jsonFiles){const path=resolve(root,file);JSON.parse(readFileSync(path,"utf8"));console.log("JSON OK",file);}

const manifest=JSON.parse(readFileSync(resolve(root,"public/assets/assets.manifest.json"),"utf8"));
for(const [id,entry] of Object.entries(manifest.games||{}))for(const [key,url] of Object.entries(entry)){if(typeof url!=="string"||!url.startsWith("/"))continue;const path=resolve(root,"public",url.slice(1));accessSync(path);console.log("ASSET OK",id,key,url);}
for(const [id,url] of Object.entries(manifest.covers||{})){const path=resolve(root,"public",String(url).replace(/^\//,""));accessSync(path);console.log("COVER OK",id,url);}

execFileSync(process.execPath,["--test",resolve(root,"tests/aureus-engine.test.mjs")],{stdio:"inherit"});
console.log("Active FIT Casino engine check passed.");