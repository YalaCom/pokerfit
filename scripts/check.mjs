import { readdirSync, statSync } from "node:fs";
import { resolve, extname } from "node:path";
import { execFileSync } from "node:child_process";

const root=resolve(new URL("..",import.meta.url).pathname);
const files=[];
walk(resolve(root,"src"));walk(resolve(root,"public"));walk(resolve(root,"scripts"));walk(resolve(root,"tests"));
let failed=false;
for(const f of files.filter(f=>[".js",".mjs"].includes(extname(f)))){
  try{execFileSync(process.execPath,["--check",f],{stdio:"pipe"});console.log("OK",f.replace(root,"."))}
  catch(e){failed=true;console.error("FAIL",f.replace(root,"."));console.error(e.stderr?.toString()||e.message)}
}
if(failed)process.exit(1);
console.log("Syntax check passed.");
function walk(dir){for(const name of readdirSync(dir)){const p=resolve(dir,name);statSync(p).isDirectory()?walk(p):files.push(p)}}
