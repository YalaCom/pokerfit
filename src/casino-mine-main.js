import arcadeWorker from "./casino-arcade-main.js";

const BUILD="2026-08-20-mine-drop-premium-v2";

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/__fit_version")return json({ok:true,build:BUILD});
    if(request.method==="POST"&&url.pathname==="/api/arcade/aviamasters/play"){
      return json({ok:false,error:"GAME_REMOVED"},404);
    }
    const res=await arcadeWorker.fetch(request,env);
    if(request.method==="GET"&&url.pathname==="/casino-app.js"&&res.ok){
      let src=await res.text();
      src=src.replace('arcade-games.js?v=1','arcade-games.js?v=2');
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
