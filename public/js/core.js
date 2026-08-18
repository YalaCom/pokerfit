export const tg=window.Telegram?.WebApp;
export const $=id=>document.getElementById(id);
export const state={initData:"",player:null,online:null,admin:false,activeSession:null,currentView:"home",settings:loadSettings(),ws:null,table:null,tableId:null,currentTournamentId:null,turnDeadline:null,serverOffset:0,lastTick:null,lastHandId:null,lastActionCount:0,bj:null,bjPrevious:null};
const loaders=new Map();

export function registerView(name,loader){loaders.set(name,loader);}
export async function api(path,payload={}){const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({initData:state.initData,...payload})});const d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.error||`HTTP_${r.status}`);return d;}

export async function refreshBootstrap(){
  const d=await api("/api/bootstrap");state.player=d.player;state.online=d.online;state.admin=d.admin;state.activeSession=d.activeSession||null;renderPlayer();renderResume();return d;
}

export function renderPlayer(){
  const p=state.player;if(!p)return;
  setText("topBalance",chipsShort(p.balance));setText("homeName",p.firstName||"Игрок");setText("homeLevel",`LEVEL ${p.level}`);setText("homeBalance",chips(p.balance));
  setText("profileName",p.firstName||"Игрок");setText("profileLevel",`LEVEL ${p.level}`);setText("profileBalance",chips(p.balance));
  renderAvatar($("homeAvatar"),p);renderAvatar($("profileAvatar"),p);if($("profileAvatar"))$("profileAvatar").className=`avatar xl ${p.profileFrame?`frame-${p.profileFrame}`:""}`;
  setText("onlinePlayers",state.online?.players||0);setText("onlineTables",state.online?.tables||0);setText("onlineTournaments",state.online?.tournaments||0);
  $("adminLink")?.classList.toggle("hidden",!state.admin);
}

export function renderResume(){
  const h=$("resumeHolder");if(!h)return;if(!state.activeSession){h.innerHTML="";return;}
  h.innerHTML=`<button id="resumeTableButton" class="line-card resume-card"><span><b>ВЕРНУТЬСЯ ЗА СТОЛ</b><small>${esc(state.activeSession.name||"Активный стол")}</small></span><i>→</i></button>`;
  h.querySelector("button").addEventListener("click",()=>window.dispatchEvent(new CustomEvent("fit-resume-table")));
}

export function nav(name,{silent=false}={}){
  state.currentView=name;document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===`view-${name}`));
  document.querySelectorAll("#bottomNav [data-nav]").forEach(b=>b.classList.toggle("active",b.dataset.nav===name));
  $("bottomNav")?.classList.toggle("hidden",name==="table");window.scrollTo(0,0);
  if(!silent&&location.hash!==`#${name}`)history.replaceState(null,"",`#${name}`);
  Promise.resolve(loaders.get(name)?.()).catch(e=>toast(e.message));
}
export function routeFromHash(){const name=location.hash.replace("#","")||"home";const allowed=["home","tables","blackjack","casino","tournaments","rating","friends","rewards","profile","settings","notifications","club-agreement"];nav(allowed.includes(name)?name:"home",{silent:true});}

export function renderAvatar(el,p){if(!el)return;el.innerHTML="";if(p?.photoUrl){const img=document.createElement("img");img.src=p.photoUrl;img.alt="";el.appendChild(img);}else el.textContent=(p?.firstName||"P")[0].toUpperCase();}
export function showModal(html){$("modalBody").innerHTML=html;$("modal").classList.remove("hidden");}
export function closeModal(){$("modal")?.classList.add("hidden");if($("modalBody"))$("modalBody").innerHTML="";}
let toastTimer;export function toast(text){const el=$("toast");if(!el)return;el.textContent=text;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2200);}
export function flash(el,ms=800){if(!el)return;el.classList.remove("hidden");setTimeout(()=>el.classList.add("hidden"),ms);}

export function confetti(){if(!state.settings.animations)return;const layer=$("fxLayer");if(!layer)return;for(let i=0;i<48;i++){const x=document.createElement("i");x.className="confetti";x.style.left=`${Math.random()*100}%`;x.style.top=`-${10+Math.random()*80}px`;x.style.setProperty("--dx",`${(Math.random()-.5)*240}px`);x.style.animationDelay=`${Math.random()*250}ms`;layer.appendChild(x);setTimeout(()=>x.remove(),1900);}}
export function haptic(type="light"){if(!state.settings.haptics)return;try{if(["success","warning","error"].includes(type))tg?.HapticFeedback?.notificationOccurred(type);else tg?.HapticFeedback?.impactOccurred(type);}catch{}}
let audioCtx=null;export function sound(type){if(!state.settings.sound)return;try{audioCtx||=new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain(),cfg={card:[520,.025],chip:[260,.04],click:[380,.025],tick:[780,.02],win:[660,.12],lose:[170,.09]}[type]||[400,.03];o.connect(g);g.connect(audioCtx.destination);o.frequency.value=cfg[0];g.gain.setValueAtTime(.045,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+cfg[1]);o.start();o.stop(audioCtx.currentTime+cfg[1]);}catch{}}

export function bindSettings(){document.querySelectorAll("[data-setting]").forEach(el=>{el.checked=!!state.settings[el.dataset.setting];el.onchange=()=>{state.settings[el.dataset.setting]=el.checked;saveSettings();applySettings();};});applySettings();}
export function applySettings(){document.body.classList.toggle("no-anim",!state.settings.animations);document.body.classList.toggle("fast",state.settings.fastAnimations);}
function loadSettings(){try{return{sound:true,haptics:true,animations:true,fastAnimations:false,...JSON.parse(localStorage.getItem("fit-settings")||"{}")};}catch{return{sound:true,haptics:true,animations:true,fastAnimations:false};}}
function saveSettings(){localStorage.setItem("fit-settings",JSON.stringify(state.settings));}

export function cardHtml(c,cls="board-card",extra=""){if(!c)return `<div class="${cls} back" ${extra}></div>`;const red=["H","D"].includes(c.suit);return `<div class="${cls} ${red?"red":""}" ${extra}>${esc(c.rank)}<small>${suitChar(c.suit)}</small></div>`;}
export function suitChar(s){return({S:"♠",H:"♥",D:"♦",C:"♣"})[s]||"";}
export function chips(n){return Number(n||0).toLocaleString("ru-RU");}
export function chipsShort(n){n=Number(n||0);const sign=n<0?"-":"";n=Math.abs(n);if(n>=1e9)return sign+trim(n/1e9,2)+"B";if(n>=1e6)return sign+trim(n/1e6,2)+"M";if(n>=1e3)return sign+trim(n/1e3,1)+"K";return sign+String(n);}
function trim(n,d){return Number(n).toFixed(d).replace(/\.00$/," ").replace(/\.0$/," ").trim();}
export function dateTime(v){if(!v)return"";try{return new Date(v).toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}catch{return String(v);}}
export function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
export function attr(v){return esc(v).replace(/`/g,"");}
function setText(id,value){const el=$(id);if(el)el.textContent=value;}
