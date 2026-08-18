import {$,state,nav} from "./core.js";

let casinoObserver=null;
let balanceObserver=null;

export function initLuxuryUI(){
  document.body.classList.add("luxury-skin");
  enhanceTopbar();
  enhanceHome();
  enhanceBottomNav();
  watchCasinoLobby();
  watchBalance();
  watchViews();
}

function enhanceTopbar(){
  const top=document.querySelector(".topbar");
  if(!top||document.querySelector(".vip-ribbon"))return;
  const ribbon=document.createElement("div");
  ribbon.className="vip-ribbon";
  ribbon.innerHTML=`
    <span>PRIVATE CLUB</span>
    <span>LIVE TABLES</span>
    <span>TOURNAMENTS</span>
    <span>CASINO LOUNGE</span>
    <span>VIRTUAL CHIPS</span>`;
  top.insertAdjacentElement("afterend",ribbon);
}

function enhanceHome(){
  const home=$("view-home"),live=home?.querySelector(".live-strip");
  if(!home||!live||home.querySelector(".club-promo"))return;
  const promo=document.createElement("article");
  promo.className="club-promo";
  promo.innerHTML=`
    <div class="club-promo-head"><small>FIT PRIVATE GAMING CLUB</small><b>VIP LOUNGE</b></div>
    <h3>Один клуб. Все игры.</h3>
    <p>Poker, live-столы, турниры и casino games в одном премиальном лобби.</p>
    <div class="club-promo-actions">
      <button class="play" id="luxPoker">♠ LIVE POKER</button>
      <button class="casino" id="luxCasino">◆ CASINO</button>
    </div>`;
  live.insertAdjacentElement("afterend",promo);
  promo.querySelector("#luxPoker").onclick=()=>$("quickPokerButton")?.click();
  promo.querySelector("#luxCasino").onclick=()=>$("casinoEntry")?.click();
}

function enhanceBottomNav(){
  const bar=$("bottomNav");
  if(!bar||bar.querySelector(".casino-nav"))return;
  const btn=document.createElement("button");
  btn.dataset.nav="casino";
  btn.className="casino-nav";
  btn.innerHTML="<span>◆</span>Casino";
  const rating=bar.querySelector('[data-nav="rating"]');
  if(rating)rating.insertAdjacentElement("afterend",btn);else bar.appendChild(btn);
  btn.onclick=()=>nav("casino");
}

function watchCasinoLobby(){
  const root=document.body;
  const enhance=()=>{
    const lobby=$("casinoLobby");
    if(!lobby)return;
    addCasinoCategories(lobby);
    decorateCasinoTiles(lobby);
  };
  enhance();
  casinoObserver?.disconnect();
  casinoObserver=new MutationObserver(enhance);
  casinoObserver.observe(root,{childList:true,subtree:true});
}

function addCasinoCategories(lobby){
  if(lobby.querySelector(".casino-category-bar"))return;
  const hero=lobby.querySelector(".casino-hero");
  const grid=lobby.querySelector(".casino-grid");
  if(!hero||!grid)return;
  const bar=document.createElement("div");
  bar.className="casino-category-bar";
  bar.innerHTML=`
    <button class="active" data-cat="all">ВСЕ</button>
    <button data-cat="live">LIVE</button>
    <button data-cat="slots">SLOTS</button>
    <button data-cat="table">TABLE</button>
    <button data-cat="instant">INSTANT</button>`;
  hero.insertAdjacentElement("afterend",bar);
  bar.querySelectorAll("button").forEach(button=>button.onclick=()=>{
    bar.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===button));
    filterCasino(grid,button.dataset.cat);
  });
}

function decorateCasinoTiles(lobby){
  lobby.querySelectorAll("[data-casino-game]").forEach(tile=>{
    const game=tile.dataset.casinoGame;
    tile.classList.add(`casino-game-${game}`);
    if(tile.dataset.luxuryDone)return;
    tile.dataset.luxuryDone="1";
    const category=categoryFor(game);
    tile.dataset.category=category;
    const badge=document.createElement("span");
    badge.className="lux-game-badge";
    badge.textContent=category==="live"?"LIVE":category==="slots"?"SLOT":category==="table"?"TABLE":"FAST";
    tile.appendChild(badge);
  });
}

function filterCasino(grid,cat){
  grid.querySelectorAll("[data-casino-game]").forEach(tile=>{
    const visible=cat==="all"||tile.dataset.category===cat;
    tile.style.display=visible?"":"none";
  });
}

function categoryFor(game){
  if(["roulette"].includes(game))return"live";
  if(["slots","mega"].includes(game))return"slots";
  if(["blackjack","baccarat"].includes(game))return"table";
  return"instant";
}

function watchBalance(){
  const balance=$("topBalance");
  if(!balance)return;
  balanceObserver?.disconnect();
  balanceObserver=new MutationObserver(()=>{
    balance.classList.remove("balance-flash");
    void balance.offsetWidth;
    balance.classList.add("balance-flash");
  });
  balanceObserver.observe(balance,{childList:true,characterData:true,subtree:true});
}

function watchViews(){
  const views=[...document.querySelectorAll(".view")];
  const observer=new MutationObserver(entries=>{
    for(const entry of entries){
      const view=entry.target;
      if(view.classList.contains("active")){
        view.classList.remove("luxury-enter");
        void view.offsetWidth;
        view.classList.add("luxury-enter");
      }
    }
  });
  views.forEach(view=>observer.observe(view,{attributes:true,attributeFilter:["class"]}));
}
