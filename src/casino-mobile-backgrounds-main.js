import mineWorker from "./casino-mine-main.js";

const BUILD="2026-08-20-mobile-slot-backgrounds-v1";
const BACKGROUNDS={
  aureus:"/assets/game-backgrounds/mobile/aureus-mobile.webp",
  honey_fruits:"/assets/game-backgrounds/mobile/honey-fruits-mobile.webp",
  lucky_coin_collector:"/assets/game-backgrounds/mobile/lucky-coin-mobile.webp",
  neon_beast_rampage:"/assets/game-backgrounds/mobile/neon-beast-mobile.webp",
  olympus_storm:"/assets/game-backgrounds/mobile/olympus-storm-mobile.webp",
  sweet_bonanza:"/assets/game-backgrounds/mobile/sweet-bonanza-mobile.webp",
  black_hound_overdrive:"/assets/game-backgrounds/mobile/black-hound-mobile.webp",
  kozyr:"/assets/game-backgrounds/mobile/kozyr-mobile.webp",
  padaplelov:"/assets/game-backgrounds/mobile/padaplelov-mobile.webp"
};

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/__fit_version")return json({ok:true,build:BUILD});
    if(request.method==="GET"&&url.pathname==="/assets/assets.manifest.json"){
      const res=await mineWorker.fetch(request,env);
      if(!res.ok)return res;
      const data=await res.json();
      data.version=Math.max(20,Number(data.version||0)+1);
      data.games=data.games||{};
      for(const [gameId,bg] of Object.entries(BACKGROUNDS)){
        if(data.games[gameId]){
          data.games[gameId].background=bg;
          data.games[gameId].bonusBackground=bg;
        }
      }
      return json(data);
    }
    const res=await mineWorker.fetch(request,env);
    const headers=new Headers(res.headers);
    headers.set("x-fit-build",BUILD);
    if(url.pathname.startsWith("/assets/game-backgrounds/mobile/"))headers.set("cache-control","public, max-age=31536000, immutable");
    return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
  }
};

function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-fit-build":BUILD}});}
