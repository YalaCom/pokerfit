const BUILD="2026-08-19-two-alexeys-v1";

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(request.method==="GET"&&url.pathname==="/__story_version"){
      return new Response(JSON.stringify({ok:true,build:BUILD,app:"two-alexeys"}),{headers:noCache({"content-type":"application/json; charset=utf-8"})});
    }
    if(request.method!=="GET")return new Response("Not found",{status:404,headers:noCache()});
    if(!["/","/index.html","/styles.css","/app.js"].includes(url.pathname))return new Response("Not found",{status:404,headers:noCache()});
    const assetRequest=url.pathname==="/"?new Request(new URL("/index.html",url),request):request;
    const response=await env.ASSETS.fetch(assetRequest);
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers:noCache(response.headers)});
  }
};

function noCache(source={}){
  const headers=new Headers(source);
  headers.set("cache-control","no-store, no-cache, must-revalidate, max-age=0");
  headers.set("pragma","no-cache");
  headers.set("expires","0");
  headers.set("x-story-build",BUILD);
  return headers;
}
