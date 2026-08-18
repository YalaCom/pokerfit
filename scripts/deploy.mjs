import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT=resolve(new URL("..",import.meta.url).pathname);
const run=(args,opts={})=>execFileSync(process.platform==="win32"?"npx.cmd":"npx",["wrangler",...args],{cwd:ROOT,encoding:"utf8",stdio:opts.capture?["ignore","pipe","pipe"]:"inherit"});

console.log("1/4 Finding existing D1 database poker-club-db...");
let raw;
try{raw=run(["d1","info","poker-club-db","--json"],{capture:true})}
catch(error){
  console.error("Cannot find poker-club-db. Create it in Cloudflare D1 first.");
  process.exit(1);
}
let info;
try{info=JSON.parse(raw)}catch{console.error(raw);process.exit(1)}
const databaseId=findId(info);
if(!databaseId){console.error("D1 database ID was not found in Wrangler output.");process.exit(1)}
console.log("D1:",databaseId);

console.log("2/4 Generating Wrangler config...");
const template=readFileSync(resolve(ROOT,"wrangler.template.jsonc"),"utf8");
const config=template.replace("__D1_DATABASE_ID__",databaseId);
const configPath=resolve(ROOT,"wrangler.generated.jsonc");
writeFileSync(configPath,config);

console.log("3/4 Applying D1 migrations...");
run(["d1","migrations","apply","poker-club-db","--remote","--config","wrangler.generated.jsonc"]);

console.log("4/4 Deploying Worker + Static Assets + Durable Object...");
run(["deploy","--config","wrangler.generated.jsonc"]);
console.log("FIT Poker Club deployed.");

function findId(value){
  if(!value)return null;
  if(typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value))return value;
  if(Array.isArray(value)){for(const x of value){const r=findId(x);if(r)return r}return null}
  if(typeof value==="object"){
    for(const k of ["uuid","database_id","id"]){const v=value[k];if(typeof v==="string"&&/^[0-9a-f-]{30,}$/i.test(v))return v}
    for(const v of Object.values(value)){const r=findId(v);if(r)return r}
  }
  return null;
}
