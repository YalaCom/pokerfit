import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";

const ROOT=resolve(new URL("..",import.meta.url).pathname);
const npx=process.platform==="win32"?"npx.cmd":"npx";
const run=(args,capture=false)=>execFileSync(npx,["wrangler",...args],{cwd:ROOT,encoding:"utf8",stdio:capture?["ignore","pipe","pipe"]:"inherit"});

console.log("1/4 Finding D1 database poker-club-db...");
const raw=run(["d1","info","poker-club-db","--json"],true);
const info=JSON.parse(raw);
const databaseId=findId(info);
if(!databaseId)throw new Error("D1 database ID not found");
console.log("D1:",databaseId);

console.log("2/4 Generating Wrangler config...");
const template=readFileSync(resolve(ROOT,"wrangler.template.jsonc"),"utf8");
const config=template.replace("__D1_DATABASE_ID__",databaseId);
writeFileSync(resolve(ROOT,"wrangler.generated.jsonc"),config);

console.log("3/4 Applying casino migrations...");
run(["d1","migrations","apply","poker-club-db","--remote","--config","wrangler.generated.jsonc"]);

console.log("4/4 Deploying FIT Casino...");
run(["deploy","--config","wrangler.generated.jsonc"]);
console.log("FIT Casino deployed.");

function findId(v){
  if(!v)return null;
  if(typeof v==="string"&&/^[0-9a-f-]{30,}$/i.test(v))return v;
  if(Array.isArray(v)){for(const x of v){const r=findId(x);if(r)return r;}return null;}
  if(typeof v==="object"){
    for(const k of ["uuid","database_id","id"]){const x=v[k];if(typeof x==="string"&&/^[0-9a-f-]{30,}$/i.test(x))return x;}
    for(const x of Object.values(v)){const r=findId(x);if(r)return r;}
  }
  return null;
}
