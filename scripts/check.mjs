import {execFileSync} from "node:child_process";
import {resolve} from "node:path";

const root=resolve(new URL("..",import.meta.url).pathname);
const files=["src/fresh-main.js","public/app.js","scripts/deploy.mjs","tests/story.test.mjs"];
for(const file of files){const path=resolve(root,file);execFileSync(process.execPath,["--check",path],{stdio:"inherit"});console.log("OK",file);}
console.log("Active story syntax check passed.");
