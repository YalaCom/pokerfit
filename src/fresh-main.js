import worker,{PokerTableDO,RussianRouletteDO} from "./main.js";

export {PokerTableDO,RussianRouletteDO};

const BUILD="2026-08-18-1555-slotfix";

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(request.method==="GET"&&url.pathname==="/__fit_version"){
      return new Response(JSON.stringify({ok:true,build:BUILD}),{
        status:200,
        headers:freshHeaders({"content-type":"application/json; charset=utf-8"})
      });
    }

    if(request.method==="GET"&&!url.pathname.startsWith("/api/")&&!url.pathname.startsWith("/admin-api/")&&!url.pathname.startsWith("/ws/")&&!url.pathname.startsWith("/telegram/")){
      const response=await env.ASSETS.fetch(request);
      const headers=freshHeaders(response.headers);
      const isHtml=(url.pathname==="/"||url.pathname==="/index.html")&&response.ok;
      if(isHtml){
        let html=await response.text();
        const critical=`<script type="module" src="/critical-ui.js?v=${BUILD}"></script>`;
        if(!html.includes("/critical-ui.js")){
          const appTag='<script type="module" src="/app.js"></script>';
          html=html.includes(appTag)?html.replace(appTag,`${critical}\n  ${appTag}`):html.replace("</body>",`  ${critical}\n</body>`);
        }
        return new Response(html,{status:response.status,statusText:response.statusText,headers});
      }
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    }

    return worker.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    return worker.scheduled?.(controller,env,ctx);
  }
};

function freshHeaders(source={}){
  const headers=new Headers(source);
  headers.set("cache-control","no-store, no-cache, must-revalidate, max-age=0");
  headers.set("pragma","no-cache");
  headers.set("expires","0");
  headers.set("x-fit-build",BUILD);
  return headers;
}
