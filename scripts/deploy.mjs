import {execFileSync} from "node:child_process";
import {resolve} from "node:path";

const ROOT=resolve(new URL("..",import.meta.url).pathname);
const npx=process.platform==="win32"?"npx.cmd":"npx";
console.log("Deploying interactive story app...");
execFileSync(npx,["wrangler","deploy","--config","wrangler.template.jsonc"],{cwd:ROOT,stdio:"inherit"});
console.log("Story app deployed.");
