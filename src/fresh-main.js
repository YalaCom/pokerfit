import worker,{PokerTableDO,RussianRouletteDO} from "./main.js";

export {PokerTableDO,RussianRouletteDO};

const BUILD="2026-08-18-1451-ready";

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(request.method==="GET"&&url.pathname==="/__fit_version"){
      return new Response(JSON.stringify({ok:true,build:BUILD}),{
        status:200,
        headers:{
          "content-type":"application/json; charset=utf-8",
          "cache-control":"no-store, no-cache, must-revalidate, max-age=0",
          "pragma":"no-cache",
          "expires":"0",
          "x-fit-build":BUILD
        }
      });
    }

    if(request.method==="GET"&&!url.pathname.startsWith("/api/")&&!url.pathname.startsWith("/admin-api/")&&!url.pathname.startsWith("/ws/")&&!url.pathname.startsWith("/telegram/")){
      const response=await env.ASSETS.fetch(request);
      const headers=new Headers(response.headers);
      headers.set("cache-control","no-store, no-cache, must-revalidate, max-age=0");
      headers.set("pragma","no-cache");
      headers.set("expires","0");
      headers.set("x-fit-build",BUILD);
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    }

    return worker.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    return worker.scheduled?.(controller,env,ctx);
  }
};
