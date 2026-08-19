const tg=window.Telegram?.WebApp;

const STATE_LABELS={
  BOOT:"START",
  LOADING:"LOADING",
  IDLE:"READY",
  BETTING:"BET",
  SPIN_START:"SPIN",
  SPINNING:"SPIN",
  ANTICIPATION:"BONUS?",
  REEL_STOP:"STOP",
  EVALUATING:"CHECK",
  SMALL_WIN:"PAYOUT",
  BIG_WIN:"BIG WIN",
  MAX_WIN:"MAX WIN",
  BONUS_TRIGGER:"BONUS",
  BONUS_INTRO:"BONUS",
  BONUS_PLAYING:"BONUS",
  FREE_SPINS:"FREE SPINS",
  BONUS_OUTRO:"BONUS END",
  RETURN_TO_BASE_GAME:"RETURN",
  ERROR:"RECOVERING"
};

function ready(fn){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",fn,{once:true});else fn();}

ready(()=>{
  const app=document.getElementById("app"),slot=document.getElementById("slotView"),balance=document.getElementById("balance"),gameBalance=document.getElementById("gameBalance"),engineState=document.getElementById("engineState");
  if(!app||!slot)return;

  const syncMode=()=>app.classList.toggle("game-mode",slot.classList.contains("active"));
  const syncBalance=()=>{if(gameBalance&&balance)gameBalance.textContent=balance.textContent||"0";};
  const syncState=()=>{if(!engineState)return;const raw=(engineState.textContent||"").trim();if(STATE_LABELS[raw])engineState.textContent=STATE_LABELS[raw];};

  new MutationObserver(syncMode).observe(slot,{attributes:true,attributeFilter:["class"]});
  if(balance)new MutationObserver(syncBalance).observe(balance,{childList:true,characterData:true,subtree:true});
  if(engineState)new MutationObserver(syncState).observe(engineState,{childList:true,characterData:true,subtree:true});

  syncMode();syncBalance();syncState();syncTelegramInsets();
  try{tg?.onEvent?.("contentSafeAreaChanged",syncTelegramInsets);tg?.onEvent?.("safeAreaChanged",syncTelegramInsets);tg?.onEvent?.("viewportChanged",syncTelegramInsets);}catch{}
  window.addEventListener("resize",syncTelegramInsets,{passive:true});
});

function syncTelegramInsets(){
  const root=document.documentElement,styles=getComputedStyle(root),content=tg?.contentSafeAreaInset||{},safe=tg?.safeAreaInset||{};
  const cssTop=px(styles.getPropertyValue("--tg-content-safe-area-inset-top")),cssBottom=px(styles.getPropertyValue("--tg-content-safe-area-inset-bottom"));
  const top=Math.max(0,Number(content.top)||0,Number(safe.top)||0,cssTop);
  const bottom=Math.max(0,Number(content.bottom)||0,Number(safe.bottom)||0,cssBottom);
  root.style.setProperty("--tg-top",`${Math.round(top)}px`);root.style.setProperty("--tg-bottom",`${Math.round(bottom)}px`);
}
function px(v){const n=parseFloat(String(v||""));return Number.isFinite(n)?n:0;}
