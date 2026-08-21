import arcadeWorker from "./casino-arcade-main.js";
import {handleWebAuthRequest,rewriteBrowserApiRequest,looksLikeTelegramUpdate,handleTelegramUpdate} from "./web-auth.js";

const BUILD="2026-08-21-web-browser-auth-v1";

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/__fit_version")return json({ok:true,build:BUILD});

    if(url.pathname.startsWith("/api/web-auth/")){
      return handleWebAuthRequest(request,env,url);
    }

    if(request.method==="POST"&&!url.pathname.startsWith("/api/")&&await looksLikeTelegramUpdate(request)){
      return handleTelegramUpdate(request,env);
    }

    if(request.method==="POST"&&url.pathname.startsWith("/api/")){
      request=await rewriteBrowserApiRequest(request,env);
    }

    if(request.method==="POST"&&url.pathname==="/api/arcade/aviamasters/play"){
      return json({ok:false,error:"GAME_REMOVED"},404);
    }

    const res=await arcadeWorker.fetch(request,env);
    if(request.method==="GET"&&url.pathname==="/casino-app.js"&&res.ok){
      let src=await res.text();
      src=src.replace('arcade-games.js?v=1','arcade-games.js?v=2');
      src=`import {ensureBrowserAuth} from "./web-auth-client.js";\n${src}`;
      src=src.replace(
`  setBoot(8,"TELEGRAM SESSION");
  if(!tg?.initData){$("bootText").textContent="OPEN INSIDE TELEGRAM";return;}
  tg.ready();tg.expand();
  syncTelegramInsets();
  try{tg.setHeaderColor?.("#020304");tg.setBackgroundColor?.("#020304");}catch{}`,
`  setBoot(8,tg?.initData?"TELEGRAM SESSION":"WEB SESSION");
  if(tg?.initData){
    tg.ready();tg.expand();
    try{tg.setHeaderColor?.("#020304");tg.setBackgroundColor?.("#020304");}catch{}
  }else{
    setBoot(14,"WEB AUTH");
    const authenticated=await ensureBrowserAuth({onStatus:text=>{$("bootText").textContent=text||"WEB AUTH";}});
    if(!authenticated){$("bootText").textContent="AUTH REQUIRED";return;}
  }
  syncTelegramInsets();`
      );
      src=src.replace(
`const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({initData:tg.initData,...payload})});`,
`const r=await fetch(path,{method:"POST",credentials:"include",headers:{"content-type":"application/json"},body:JSON.stringify({initData:tg?.initData||"",...payload})});`
      );
      const headers=new Headers(res.headers);
      headers.set("content-type","application/javascript; charset=utf-8");
      headers.set("cache-control","no-store, no-cache, must-revalidate, max-age=0");
      headers.set("x-fit-build",BUILD);
      return new Response(src,{status:res.status,statusText:res.statusText,headers});
    }
    const headers=new Headers(res.headers);headers.set("x-fit-build",BUILD);
    return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
  }
};

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});}
