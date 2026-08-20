import {A,arcade,openBase,updateBalance,bindBet,lock,toast,sleep} from './arcade-common.js';

let extra=false;
const TOOL_STRENGTH={wood:1,stone_pick:2,gold_pick:3,diamond_pick:5};
const BLOCK_HP={dirt:1,stone:2,ruby:4,gold:5,diamond:6,obsidian:7};
const TOOL_LABEL={wood:'WOOD PICK',stone_pick:'IRON PICK',gold_pick:'GOLD PICK',diamond_pick:'DIAMOND PICK',eye:'EYE',book:'SPELLBOOK',tnt:'TNT',cash:'CASH',blank:'EMPTY'};
let audioCtx=null;

export function mineCardArt(){
  return `<div class="arcade-card-art mine-premium-art">
    <div class="mine-card-sky"><i></i><i></i><i></i></div>
    <div class="mine-card-panel">
      ${toolIcon('eye')} ${toolIcon('diamond_pick')} ${toolIcon('tnt')} ${toolIcon('book')} ${toolIcon('gold_pick')}
    </div>
    <div class="mine-card-pick">${toolIcon('diamond_pick')}</div>
    <div class="mine-card-shaft">
      <span class="mc-block dirt"></span><span class="mc-block stone"></span><span class="mc-block ruby"></span><span class="mc-block gold"></span><span class="mc-block diamond"></span><span class="mc-block obsidian"></span>
    </div>
    <div class="mine-card-chests"><span></span><span></span><span></span><span></span><span></span></div>
    <div class="mine-card-logo">MINE<br><b>DROP</b></div>
  </div>`;
}

export function injectMinePremiumStyles(){
  if(document.getElementById('minePremiumStyles'))return;
  const st=document.createElement('style');
  st.id='minePremiumStyles';
  st.textContent=`
  .mine-only-grid{grid-template-columns:1fr!important}.mine-premium-card{display:grid!important;grid-template-columns:minmax(0,1.22fr) minmax(180px,.78fr);min-height:235px;border-color:#3a4656!important;background:linear-gradient(145deg,#09111b,#05080d 60%,#10120c)!important;box-shadow:0 20px 70px #000a,0 0 0 1px #77e4ff18 inset!important}
  .mine-premium-art{height:100%!important;min-height:235px;background:linear-gradient(#78c9f4 0 38%,#b8e5ff 38% 43%,#5b351f 43% 100%)!important;border-right:1px solid #ffffff10}
  .mine-premium-copy{align-self:center;padding:20px!important}.mine-premium-copy h3{font-size:24px!important;letter-spacing:.06em}.mine-premium-copy p{font-size:12px!important;min-height:0!important;line-height:1.5!important}.mine-premium-copy>b{display:inline-flex;margin-top:11px;padding:10px 13px;border-radius:10px;background:#1ea65b;color:#fff;box-shadow:0 8px 22px #0a6a3c55}
  .mine-card-sky i{position:absolute;background:#fff9;border-radius:3px;height:10px}.mine-card-sky i:nth-child(1){width:70px;left:6%;top:25px}.mine-card-sky i:nth-child(2){width:42px;right:12%;top:42px}.mine-card-sky i:nth-child(3){width:25px;left:44%;top:14px}
  .mine-card-panel{position:absolute;top:15px;left:26%;right:7%;height:46px;padding:4px;display:grid;grid-template-columns:repeat(5,1fr);gap:3px;background:#303945;border:3px solid #101820;box-shadow:0 5px 0 #18202a}.mine-card-panel svg{width:100%;height:100%;background:#d7dde4;padding:2px}
  .mine-card-pick{position:absolute;left:53%;top:78px;width:48px;filter:drop-shadow(0 5px 2px #0006);transform:rotate(18deg)}.mine-card-pick svg{width:100%;height:auto}
  .mine-card-shaft{position:absolute;left:31%;right:18%;top:105px;height:92px;display:grid;grid-template-rows:repeat(6,1fr);border:3px solid #2a1b13;box-shadow:0 5px 0 #20140f}.mine-card-shaft span{display:block}
  .mine-card-chests{position:absolute;left:25%;right:12%;bottom:8px;height:25px;display:grid;grid-template-columns:repeat(5,1fr);gap:3px}.mine-card-chests span{background:linear-gradient(#9d5d1a 0 48%,#5f330b 48%);border:2px solid #edaa37;box-shadow:inset 0 0 0 2px #3b2008}.mine-card-logo{position:absolute;left:5%;top:78px;font:1000 21px/0.82 Arial;color:white;text-shadow:3px 3px 0 #243548,-1px -1px 0 #243548}.mine-card-logo b{font-size:27px;color:#ffe072}
  .mc-block.dirt{background:repeating-linear-gradient(45deg,#7b4928 0 5px,#9d6133 5px 9px)}.mc-block.stone{background:repeating-linear-gradient(135deg,#89939f 0 6px,#b1bac2 6px 11px)}.mc-block.ruby{background:linear-gradient(90deg,#a2abb4,#a2abb4 40%,#d64949 40%,#ff6672 58%,#9da7b0 58%)}.mc-block.gold{background:linear-gradient(90deg,#a2abb4 0 25%,#f1b22f 25% 42%,#9ea8b1 42% 65%,#ffd34c 65% 82%,#a2abb4 82%)}.mc-block.diamond{background:linear-gradient(90deg,#8fa0a8 0 20%,#36d6e8 20% 38%,#98f5ff 38% 52%,#8e9da5 52% 72%,#24bfd5 72%)}.mc-block.obsidian{background:repeating-linear-gradient(45deg,#1d1828 0 7px,#352440 7px 12px)}
  .mine-game-v2{position:relative;overflow:hidden;border-radius:22px;background:#05080c;box-shadow:0 20px 80px #000}.mine-game-v2:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 25%,#6ad4ff15,transparent 34%),linear-gradient(180deg,#06131f 0 18%,transparent 42%);z-index:0}
  .mine-hud-v2{position:relative;z-index:3;display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#18212d;padding:1px}.mine-hud-v2>div{background:#091019;padding:10px;text-align:center}.mine-hud-v2 small{display:block;color:#728399;font-size:8px;letter-spacing:.12em}.mine-hud-v2 b{font-size:17px}.mine-hud-v2 .eye-meter b{color:#bd8bff}
  .mine-scene{position:relative;z-index:2;padding:13px 8px 6px;background:linear-gradient(#78c8f1 0 25%,#bce8ff 25% 31%,#6f4a30 31% 100%);min-height:610px;overflow:hidden}.mine-scene:after{content:"";position:absolute;left:0;right:0;top:29%;height:22px;background:linear-gradient(#58ad4a 0 45%,#5f351e 45%);box-shadow:0 5px 0 #3f2618;z-index:0}
  .mine-panel-frame{position:relative;z-index:4;width:min(96%,560px);margin:auto;padding:8px;background:linear-gradient(#505b67,#27313c);border:4px solid #161e27;border-radius:5px;box-shadow:0 8px 0 #17202a,0 15px 30px #0006}.mine-panel-v2{display:grid;grid-template-columns:repeat(5,1fr);gap:5px}.mine-tool{position:relative;aspect-ratio:1.18;background:linear-gradient(#e9eef2,#b9c3cc);border:2px solid #7e8a96;box-shadow:inset 0 0 0 2px #f8fbff,0 2px 0 #4f5963;display:flex;align-items:center;justify-content:center;overflow:hidden}.mine-tool svg{width:74%;height:74%;filter:drop-shadow(2px 3px 0 #0003)}.mine-tool.settle{animation:mineSettle .28s cubic-bezier(.2,1.7,.4,1)}.mine-tool.special{box-shadow:inset 0 0 0 2px #fff,0 0 18px #8ce9ff}.mine-tool.eye{background:linear-gradient(#291b44,#492e79)}.mine-tool.tnt{background:linear-gradient(#471311,#7a1d18)}.mine-tool.book{background:linear-gradient(#22183a,#4a2b77)}
  .mine-gap{height:66px;position:relative;z-index:3}.mine-gap:before{content:"";position:absolute;left:50%;top:8px;width:2px;height:43px;background:linear-gradient(#fff0,#fff8,#fff0)}.mine-gap:after{content:"▼";position:absolute;left:50%;bottom:2px;transform:translateX(-50%);color:#fff9;font-size:17px}
  .mine-shaft-wrap{position:relative;z-index:3;width:min(82%,470px);margin:auto}.mine-grid-v2{display:grid;grid-template-columns:repeat(5,1fr);gap:3px;background:#241912;border:5px solid #392416;padding:4px;box-shadow:0 10px 0 #1b120d,0 18px 40px #0007}.mine-block-v2{position:relative;aspect-ratio:1.05;border:2px solid #ffffff20;overflow:hidden;box-shadow:inset 0 0 0 2px #0002;transition:filter .15s,transform .15s,opacity .28s}.mine-block-v2 .hp{position:absolute;right:3px;bottom:2px;padding:2px 3px;border-radius:4px;background:#0009;color:#fff;font:700 7px Arial;z-index:3}.mine-block-v2 .cracks{position:absolute;inset:0;opacity:0;z-index:2;background:linear-gradient(63deg,transparent 47%,#121212 48% 52%,transparent 53%),linear-gradient(118deg,transparent 53%,#181818 54% 58%,transparent 59%);transform:scale(.35);transition:.16s}.mine-block-v2.crack1 .cracks{opacity:.28;transform:scale(.65)}.mine-block-v2.crack2 .cracks{opacity:.55;transform:scale(.85)}.mine-block-v2.crack3 .cracks{opacity:.9;transform:scale(1)}.mine-block-v2.hit{animation:blockHit .18s}.mine-block-v2.breaking{animation:blockBreak .42s forwards}.mine-block-v2.broken{opacity:.13;filter:brightness(.45);background:#18120f!important}.mine-block-v2.dirt{background:repeating-linear-gradient(45deg,#744326 0 6px,#9c5e31 6px 11px,#82502c 11px 15px)}.mine-block-v2.stone{background:repeating-linear-gradient(135deg,#818a92 0 7px,#aab2b9 7px 12px,#9099a2 12px 16px)}.mine-block-v2.ruby{background:linear-gradient(135deg,#9da6ad 0 27%,#d43d4d 27% 39%,#ff6674 39% 48%,#929ba4 48% 67%,#b92f40 67% 79%,#a3acb3 79%)}.mine-block-v2.gold{background:linear-gradient(135deg,#9ba3aa 0 21%,#d89516 21% 34%,#ffd348 34% 43%,#969fa7 43% 64%,#e8a720 64% 78%,#aab2b8 78%)}.mine-block-v2.diamond{background:linear-gradient(135deg,#89989f 0 22%,#23bfd4 22% 36%,#9df5ff 36% 46%,#8c9ba2 46% 64%,#2fd0e3 64% 79%,#a1adb3 79%)}.mine-block-v2.obsidian{background:repeating-linear-gradient(45deg,#1b1524 0 8px,#342240 8px 13px,#24182e 13px 18px)}
  .mine-chests-v2{display:grid;grid-template-columns:repeat(5,1fr);gap:3px;margin-top:5px}.mine-chest-v2{position:relative;height:52px;background:linear-gradient(#a66318 0 42%,#6a3a0c 42% 100%);border:3px solid #d79026;box-shadow:inset 0 0 0 2px #3c2108,0 4px 0 #301b08;display:flex;align-items:center;justify-content:center;color:#ffd66f;font:1000 8px Arial;transition:.25s}.mine-chest-v2:before{content:"";position:absolute;left:42%;top:16px;width:16%;height:14px;background:#f3c744;border:2px solid #563500}.mine-chest-v2.open{transform:translateY(-3px) scale(1.04);background:#ffb82e;color:#241000;font-size:16px;box-shadow:0 0 28px #ffd65c}.mine-chest-v2.open:after{content:"";position:absolute;left:-5%;right:-5%;top:-16px;height:20px;background:linear-gradient(140deg,#c67a19,#7a410d);border:3px solid #e6a536;transform:rotate(-13deg);transform-origin:left bottom}
  .mine-fx-layer{position:absolute;inset:0;pointer-events:none;z-index:20}.flying-tool{position:absolute;width:62px;height:62px;z-index:30;filter:drop-shadow(0 7px 3px #0007);transform-origin:70% 70%}.flying-tool svg{width:100%;height:100%}.mine-pixel{position:absolute;width:7px;height:7px;background:#fff;z-index:31;pointer-events:none}.tnt-live{position:absolute;width:70px;height:70px;z-index:32;filter:drop-shadow(0 7px 4px #0008)}.tnt-live svg{width:100%;height:100%}.tnt-live:after{content:"";position:absolute;right:5px;top:-6px;width:8px;height:8px;border-radius:50%;background:#fff3a0;box-shadow:0 0 12px #ffb326}.mine-explosion{position:absolute;width:30px;height:30px;border-radius:50%;background:#fff5ba;box-shadow:0 0 0 12px #ffb52aaa,0 0 0 28px #f0522790,0 0 60px 35px #ffb32a;z-index:35;animation:explode .48s forwards}.mine-scene.shake{animation:mineShake .38s}
  .mine-status-v2{position:relative;z-index:4;margin:10px auto 0;width:min(94%,560px);min-height:44px;padding:10px 14px;border-radius:12px;background:#07101ce8;border:1px solid #2b3d50;text-align:center;font-size:11px;font-weight:900;letter-spacing:.06em;display:flex;align-items:center;justify-content:center}.mine-status-v2 strong{color:#ffe076}.mine-win-pop{position:absolute;left:50%;top:58%;transform:translate(-50%,-50%);z-index:50;font:1000 28px Arial;color:#fff1a3;text-shadow:0 4px 0 #3b2500,0 0 24px #ffc74f;animation:winPop .85s forwards;pointer-events:none}
  .mine-controls-v2{position:relative;z-index:4;background:#04080e;border-top:1px solid #162231;padding:10px 8px calc(16px + env(safe-area-inset-bottom))}.mine-actions-v2{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 12px 8px}.mine-actions-v2 button{height:46px;border-radius:13px;border:1px solid #344354;background:#0c121a;color:#c8d4df;font-weight:900;font-size:10px}.mine-actions-v2 button.active{background:linear-gradient(135deg,#5e35a8,#9a5cff);color:#fff;box-shadow:0 0 20px #874fff66}.mine-actions-v2 .mine-buy-v2{border-color:#b77d2d;color:#ffd170;background:linear-gradient(#17120b,#0c0a07)}.mine-play-v2{background:linear-gradient(145deg,#40d674,#118348)!important;box-shadow:0 10px 28px #12874d55, inset 0 2px 0 #9affb7;color:#fff!important}
  .bonus-curtain{position:absolute;inset:0;z-index:80;background:radial-gradient(circle at 50% 42%,#6636a9,#100d20 48%,#030508 78%);display:flex;align-items:center;justify-content:center;text-align:center}.bonus-curtain div{animation:bonusIn .8s cubic-bezier(.15,1.3,.3,1)}.bonus-curtain small{display:block;color:#b99be5;letter-spacing:.25em;font-weight:900}.bonus-curtain h2{margin:8px 0 4px;font-size:39px;color:#fff;text-shadow:0 0 28px #9d5cff}.bonus-curtain b{color:#ffe27b}
  @keyframes mineSettle{0%{transform:translateY(-35%) scale(.8);filter:blur(2px)}100%{transform:none;filter:none}}@keyframes blockHit{50%{transform:scale(.91);filter:brightness(1.65)}}@keyframes blockBreak{40%{transform:scale(.9);filter:brightness(2)}100%{transform:scale(.5) rotate(5deg);opacity:.1}}@keyframes explode{0%{transform:scale(.2);opacity:1}100%{transform:scale(4);opacity:0}}@keyframes mineShake{0%,100%{transform:none}20%{transform:translate(-5px,2px)}40%{transform:translate(6px,-2px)}60%{transform:translate(-4px,-1px)}80%{transform:translate(3px,2px)}}@keyframes winPop{0%{opacity:0;transform:translate(-50%,-30%) scale(.6)}25%{opacity:1;transform:translate(-50%,-50%) scale(1.12)}75%{opacity:1}100%{opacity:0;transform:translate(-50%,-80%) scale(1)}}@keyframes bonusIn{0%{transform:scale(.45);opacity:0}100%{transform:scale(1);opacity:1}}
  @media(max-width:560px){.mine-premium-card{grid-template-columns:1fr!important}.mine-premium-art{min-height:205px!important;border-right:0}.mine-premium-copy{padding:13px!important}.mine-premium-copy h3{font-size:18px!important}.mine-scene{min-height:570px}.mine-panel-v2{gap:3px}.mine-tool{border-width:1px}.mine-grid-v2{width:92%}.mine-shaft-wrap{width:92%}.flying-tool{width:50px;height:50px}}
  `;
  document.head.appendChild(st);
}

export function openMine(){
  injectMinePremiumStyles();
  const s=openBase('MINE DROP','PIXEL MINING FEATURE');
  s.innerHTML=`<div class="mine-game-v2">
    <div class="mine-hud-v2">
      <div><small>WIN</small><b id="mineWin">0</b></div>
      <div><small>MODE</small><b id="mineMode">BASE</b></div>
      <div class="eye-meter"><small>EYES</small><b id="mineEyes">0 / 3</b></div>
    </div>
    <div class="mine-scene" id="mineScene">
      <div class="mine-panel-frame"><div id="minePanel" class="mine-panel-v2"></div></div>
      <div class="mine-gap"></div>
      <div class="mine-shaft-wrap">
        <div id="mineGrid" class="mine-grid-v2"></div>
        <div id="mineChests" class="mine-chests-v2"></div>
      </div>
      <div id="mineFx" class="mine-fx-layer"></div>
      <div id="mineStatus" class="mine-status-v2">READY · 3 EYES OPEN BLOCK BONUS</div>
    </div>
    <div class="mine-controls-v2">
      <div class="arcade-controls">
        <button class="bet-down">−</button>
        <div><small>BET</small><b class="arcade-bet">${A.fmt(A.state.bet)}</b></div>
        <button class="bet-up">+</button>
      </div>
      <div class="mine-actions-v2">
        <button id="mineExtra">EXTRA CHANCE · ×3</button>
        <button id="mineBonus" class="mine-buy-v2">BUY BONUS · ×100</button>
      </div>
      <button id="minePlay" class="arcade-play mine-play-v2">DROP TOOLS</button>
    </div>
  </div>`;
  bindBet(s);emptyMine(s);
  s.querySelector('#mineExtra').onclick=()=>{
    extra=!extra;
    s.querySelector('#mineExtra').classList.toggle('active',extra);
    s.querySelector('#mineMode').textContent=extra?'EXTRA ×3':'BASE';
  };
  s.querySelector('#minePlay').onclick=()=>play(s,false);
  s.querySelector('#mineBonus').onclick=()=>play(s,true);
}

async function play(s,buy){
  if(arcade.busy)return;
  const bet=A.normalizeBet(A.state.bet),cost=bet*(buy?100:(extra?3:1));
  if(cost>Number(A.state.player?.balance||0))return toast('Недостаточно фишек');
  arcade.busy=true;lock(s,true);s.querySelector('#mineWin').textContent='0';s.querySelector('#mineEyes').textContent='0 / 3';
  setStatus(s,buy?'PREPARING BLOCK BONUS…':'SPINNING TOOL RACK…');
  try{
    const r=await A.api(buy?'/api/arcade/minedrop/bonus-buy':'/api/arcade/minedrop/spin',{bet,extraChance:extra,requestId:A.requestId()});
    let shown=0;
    if(r.result.frame){
      await animateFrame(s,r.result.frame,{bonus:false});
      shown+=Number(r.result.frame.payout||0);setWin(s,shown);
    }
    if(r.result.bonusTriggered&&r.result.bonus){
      await bonusIntro(s,!!buy);
      let i=0;
      const frames=r.result.bonus.frames||[];
      for(const f of frames){
        i++;
        s.querySelector('#mineMode').textContent=`FREE ${i}/${frames.length}`;
        setStatus(s,`FREE SPIN ${i}/${frames.length} · DAMAGE PERSISTS`);
        await animateFrame(s,f,{bonus:true});
        shown+=Number(f.payout||0);setWin(s,shown);
        await sleep(520);
      }
      await bonusOutro(s,shown);
      s.querySelector('#mineMode').textContent=extra?'EXTRA ×3':'BASE';
    }
    A.applyBalance(r.balance);updateBalance();setStatus(s,`TOTAL WIN · ${A.fmt(r.payout)}`);
    if(Number(r.payout||0)>0)await winPop(s,Number(r.payout||0));
  }catch(e){toast(String(e.message||e));setStatus(s,'ERROR · TRY AGAIN');}
  finally{arcade.busy=false;lock(s,false);}
}

async function animateFrame(s,f,{bonus=false}={}){
  renderMine(s,f.mineBefore,[]);
  await spinPanel(s,f.panel||[]);
  const eyeCount=Number(f.scatterCount||0);
  s.querySelector('#mineEyes').textContent=`${Math.min(eyeCount,3)} / 3`;

  const shadow=shadowFrom(f.mineBefore);
  const upgrades=new Map((f.upgrades||[]).map(x=>[x.c,x.row]));
  for(let c=0;c<5;c++){
    const column=[f.panel?.[0]?.[c],f.panel?.[1]?.[c],f.panel?.[2]?.[c]];
    if(column.includes('book')){
      await animateBook(s,c);
      if(upgrades.has(c)){
        const row=upgrades.get(c);
        const cell=s.querySelectorAll('.mine-tool')[row*5+c];
        cell?.classList.add('special');
        setStatus(s,`SPELLBOOK · COLUMN ${c+1} PICK → POWER 5`);
        await sleep(360);
      }
    }
    for(let r=0;r<3;r++){
      const sym=column[r];
      if(TOOL_STRENGTH[sym]){
        let strength=TOOL_STRENGTH[sym];
        if(upgrades.get(c)===r)strength=5;
        await animatePick(s,shadow,c,r,sym,strength);
      }else if(sym==='tnt'){
        await animateTnt(s,shadow,c,r);
      }else if(sym==='eye'){
        await animateEye(s,c,r);
      }else if(sym==='cash'){
        pulseTool(s,c,r,'CASH');
        await sleep(150);
      }
    }
  }
  renderMine(s,f.mineAfter,f.chests||[]);
  for(const ch of f.chests||[])await animateChest(s,ch);
  if((f.breaks||[]).length){
    setStatus(s,`BROKE ${f.breaks.length} BLOCK${f.breaks.length===1?'':'S'} · +${A.fmt(f.payout||0)}`);
  }else setStatus(s,bonus?'FREE SPIN COMPLETE · SHAFT SAVED':'NO BLOCK BROKE · SHAFT SAVED');
  if(Number(f.payout||0)>0)await winPop(s,Number(f.payout||0));
  await sleep(650);
}

async function spinPanel(s,p){
  const symbols=['wood','stone_pick','gold_pick','diamond_pick','eye','book','tnt','cash','blank'];
  for(let cycle=0;cycle<5;cycle++){
    const fake=Array.from({length:3},()=>Array.from({length:5},()=>symbols[Math.floor(Math.random()*symbols.length)]));
    renderPanel(s,fake,false);
    await sleep(65+cycle*12);
  }
  renderPanel(s,p,true);
  for(let c=0;c<5;c++){
    for(let r=0;r<3;r++)s.querySelectorAll('.mine-tool')[r*5+c]?.classList.add('settle');
    haptic('selection');
    sfx('tick');
    await sleep(115);
  }
  await sleep(180);
}

function renderPanel(s,p,final=true){
  s.querySelector('#minePanel').innerHTML=(p||[]).flat().map((x,i)=>{
    const cls=['eye','tnt','book'].includes(x)?` ${x}`:'';
    return `<div class="mine-tool${cls}" data-tool="${x||'blank'}" data-i="${i}" title="${TOOL_LABEL[x]||x}">${toolIcon(x)}</div>`;
  }).join('');
}

async function animatePick(s,shadow,c,r,sym,strength){
  const target=topBlock(shadow[c]);if(!target)return;
  const panelCell=s.querySelectorAll('.mine-tool')[r*5+c];
  pulseTool(s,c,r,`PICK ×${strength}`);
  setStatus(s,`${TOOL_LABEL[sym]} · COLUMN ${c+1} · ${strength} HIT${strength===1?'':'S'}`);
  for(let hit=0;hit<strength;hit++){
    const cur=topBlock(shadow[c]);if(!cur)break;
    const blockEl=blockElement(s,c,cur.depth);if(!blockEl)break;
    const tool=spawnFlyingTool(s,sym,panelCell,blockEl);
    await swingTool(tool,blockEl);
    sfx('hit');haptic('light');
    applyShadowDamage(shadow[c],1);
    updateShadowBlock(blockEl,shadow[c],cur.depth);
    burstPixels(s,blockEl,blockColor(cur.id),7);
    await sleep(105);
  }
}

async function animateTnt(s,shadow,c,r){
  pulseTool(s,c,r,'TNT');
  setStatus(s,`TNT · COLUMN ${c+1} · FUSE LIT`);
  const cur=topBlock(shadow[c]);if(!cur)return;
  const blockEl=blockElement(s,c,cur.depth);if(!blockEl)return;
  const t=spawnTnt(s,blockEl);
  sfx('fuse');haptic('medium');
  await sleep(520);
  t.remove();
  explosion(s,blockEl);sfx('boom');haptic('heavy');
  s.querySelector('#mineScene')?.classList.add('shake');
  setTimeout(()=>s.querySelector('#mineScene')?.classList.remove('shake'),420);
  for(let i=0;i<3;i++){applyShadowDamage(shadow[c],1);const now=topBlock(shadow[c]);updateColumnVisual(s,shadow,c,now?.depth);await sleep(70);}
  for(const nc of [c-1,c+1])if(nc>=0&&nc<5){applyShadowDamage(shadow[nc],1);updateColumnVisual(s,shadow,nc,topBlock(shadow[nc])?.depth);}
  await sleep(420);
}

async function animateBook(s,c){
  const cells=s.querySelectorAll('.mine-tool');for(let r=0;r<3;r++)if(cells[r*5+c]?.dataset.tool==='book')cells[r*5+c].classList.add('special');
  setStatus(s,`SPELLBOOK · COLUMN ${c+1} POWER SURGE`);
  sfx('magic');haptic('selection');await sleep(430);
}

async function animateEye(s,c,r){
  pulseTool(s,c,r,'EYE SCATTER');
  const cell=s.querySelectorAll('.mine-tool')[r*5+c];if(!cell)return;
  const ghost=document.createElement('div');ghost.className='flying-tool';ghost.innerHTML=toolIcon('eye');positionFromToLayer(s,ghost,cell);s.querySelector('#mineFx').appendChild(ghost);
  const meter=s.querySelector('#mineEyes'),a=rectInScene(s,cell),b=rectInScene(s,meter);
  await ghost.animate([{transform:'translate(0,0) scale(1)'},{transform:`translate(${b.x-a.x}px,${b.y-a.y}px) scale(.45)`,opacity:.35}],{duration:520,easing:'cubic-bezier(.2,.8,.2,1)'}).finished.catch(()=>{});
  ghost.remove();sfx('eye');haptic('selection');await sleep(120);
}

function pulseTool(s,c,r,text){
  const el=s.querySelectorAll('.mine-tool')[r*5+c];el?.animate([{transform:'scale(1)'},{transform:'scale(1.1)',filter:'brightness(1.7)'},{transform:'scale(1)'}],{duration:300});
  if(text)setStatus(s,text);
}

function renderMine(s,m,chests=[]){
  const by=new Map((m||[]).map(x=>[x.c,x]));let h='';
  for(let d=0;d<6;d++)for(let c=0;c<5;c++){
    const b=by.get(c)?.blocks?.[d],broken=!!b?.broken,ratio=broken?0:Number(b?.remaining||0)/Math.max(1,BLOCK_HP[b?.id]||1);
    const crack=broken?'':ratio<.34?' crack3':ratio<.67?' crack2':ratio<1?' crack1':'';
    h+=`<div class="mine-block-v2 ${b?.id||'dirt'}${broken?' broken':''}${crack}" data-c="${c}" data-d="${d}">
      <div class="cracks"></div>${broken?'':`<span class="hp">${b?.remaining||0}</span>`}
    </div>`;
  }
  s.querySelector('#mineGrid').innerHTML=h;
  s.querySelector('#mineChests').innerHTML=Array.from({length:5},(_,c)=>{
    const col=by.get(c),ch=chests.find(x=>x.c===c);
    return `<div class="mine-chest-v2 ${col?.open?'open':''}" data-chest="${c}">${ch?`×${ch.multiplier}`:'CHEST'}</div>`;
  }).join('');
}

function emptyMine(s){
  renderPanel(s,Array.from({length:3},()=>Array(5).fill('blank')),true);
  const m=Array.from({length:5},(_,c)=>({c,open:false,blocks:['dirt','stone','ruby','gold','diamond','obsidian'].map((id,i)=>({id,remaining:[1,2,4,5,6,7][i],broken:false}))}));
  renderMine(s,m);
}

function shadowFrom(m){
  return (m||[]).map(col=>({c:col.c,blocks:(col.blocks||[]).map(b=>({...b})),open:!!col.open}));
}
function topBlock(col){for(let d=0;d<(col?.blocks||[]).length;d++){const b=col.blocks[d];if(!b.broken&&Number(b.remaining||0)>0)return {...b,depth:d};}return null;}
function applyShadowDamage(col,amount){
  while(amount>0){
    const cur=topBlock(col);if(!cur){col.open=true;break;}
    const b=col.blocks[cur.depth],use=Math.min(amount,Number(b.remaining||0));b.remaining-=use;amount-=use;
    if(b.remaining<=0)b.broken=true;
  }
}
function updateShadowBlock(el,col,depth){
  const b=col.blocks[depth];if(!b)return;
  el.classList.remove('crack1','crack2','crack3','hit');void el.offsetWidth;el.classList.add('hit');
  if(b.broken){
    el.classList.add('breaking');burstPixelsFromCenter(el,blockColor(b.id),15);
    setTimeout(()=>{el.classList.remove('breaking');el.classList.add('broken');el.querySelector('.hp')?.remove();},350);
  }else{
    const ratio=Number(b.remaining||0)/Math.max(1,BLOCK_HP[b.id]||1);
    if(ratio<.34)el.classList.add('crack3');else if(ratio<.67)el.classList.add('crack2');else if(ratio<1)el.classList.add('crack1');
    let hp=el.querySelector('.hp');if(!hp){hp=document.createElement('span');hp.className='hp';el.appendChild(hp);}hp.textContent=b.remaining;
  }
}
function updateColumnVisual(s,shadow,c){
  for(let d=0;d<6;d++){const el=blockElement(s,c,d);if(el)updateShadowBlock(el,shadow[c],d);}
}
function blockElement(s,c,d){return s.querySelector(`.mine-block-v2[data-c="${c}"][data-d="${d}"]`);}

function spawnFlyingTool(s,sym,from,to){
  const layer=s.querySelector('#mineFx'),el=document.createElement('div');el.className='flying-tool';el.innerHTML=toolIcon(sym);layer.appendChild(el);
  const a=rectInScene(s,from),b=rectInScene(s,to);el.style.left=`${a.x+a.w/2-31}px`;el.style.top=`${a.y+a.h/2-31}px`;el.dataset.tx=String(b.x+b.w/2-(a.x+a.w/2));el.dataset.ty=String(b.y+b.h/2-(a.y+a.h/2));return el;
}
async function swingTool(tool,blockEl){
  const tx=Number(tool.dataset.tx||0),ty=Number(tool.dataset.ty||0);
  await tool.animate([
    {transform:'translate(0,0) rotate(-25deg) scale(.8)'},
    {transform:`translate(${tx}px,${ty-34}px) rotate(-35deg) scale(1.08)`,offset:.62},
    {transform:`translate(${tx+5}px,${ty}px) rotate(28deg) scale(1.08)`}
  ],{duration:300,easing:'cubic-bezier(.2,.75,.25,1)'}).finished.catch(()=>{});
  blockEl.animate([{transform:'translateX(0)'},{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:150});
  tool.remove();
}
function spawnTnt(s,blockEl){
  const layer=s.querySelector('#mineFx'),el=document.createElement('div');el.className='tnt-live';el.innerHTML=toolIcon('tnt');const b=rectInScene(s,blockEl);el.style.left=`${b.x+b.w/2-35}px`;el.style.top=`${b.y+b.h/2-35}px`;layer.appendChild(el);el.animate([{transform:'scale(.4)',opacity:0},{transform:'scale(1)',opacity:1}],{duration:220});return el;
}
function explosion(s,blockEl){const layer=s.querySelector('#mineFx'),b=rectInScene(s,blockEl),x=document.createElement('div');x.className='mine-explosion';x.style.left=`${b.x+b.w/2-15}px`;x.style.top=`${b.y+b.h/2-15}px`;layer.appendChild(x);burstPixels(s,blockEl,'#ffb331',28);setTimeout(()=>x.remove(),520);}
function burstPixels(s,el,color,count=12){const layer=s.querySelector('#mineFx'),r=rectInScene(s,el);for(let i=0;i<count;i++){const p=document.createElement('i');p.className='mine-pixel';p.style.background=color;p.style.left=`${r.x+r.w/2}px`;p.style.top=`${r.y+r.h/2}px`;layer.appendChild(p);const a=Math.random()*Math.PI*2,dist=25+Math.random()*55;p.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${Math.cos(a)*dist}px,${Math.sin(a)*dist}px) rotate(${Math.random()*360}deg) scale(.3)`,opacity:0}],{duration:380+Math.random()*280,easing:'ease-out'}).finished.finally(()=>p.remove());}}
function burstPixelsFromCenter(el,color,count){const s=el.closest('.mine-game-v2');if(s)burstPixels(s,el,color,count);}
async function animateChest(s,ch){const el=s.querySelector(`[data-chest="${ch.c}"]`);if(!el)return;el.classList.add('open');el.textContent=`×${ch.multiplier}`;sfx('chest');haptic('success');await winPop(s,Number(ch.amount||0));await sleep(420);}
async function winPop(s,amount){if(!amount)return;const p=document.createElement('div');p.className='mine-win-pop';p.textContent=`+ ${A.fmt(amount)}`;s.querySelector('#mineScene').appendChild(p);sfx('win');await sleep(830);p.remove();}
async function bonusIntro(s,buy){const c=document.createElement('div');c.className='bonus-curtain';c.innerHTML=`<div><small>${buy?'BONUS BUY':'3 EYES OPENED THE GATE'}</small><h2>BLOCK BONUS</h2><b>4 FREE SPINS · DAMAGE PERSISTS</b></div>`;s.querySelector('#mineScene').appendChild(c);sfx('bonus');haptic('success');await sleep(1450);await c.animate([{opacity:1},{opacity:0}],{duration:330}).finished.catch(()=>{});c.remove();}
async function bonusOutro(s,total){setStatus(s,`BLOCK BONUS COMPLETE · ${A.fmt(total)}`);await sleep(700);}

function toolIcon(type){
  const svg=(body,view='0 0 64 64')=>`<svg viewBox="${view}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  if(type==='wood')return svg(`<g shape-rendering="crispEdges"><path fill="#7b512e" d="M31 25h6v34h-6z"/><path fill="#a86d38" d="M26 21h16v7H26z"/><path fill="#8b97a1" d="M8 9h31v7H8z"/><path fill="#c6d0d8" d="M13 5h28v7H13z"/><path fill="#69737d" d="M7 12h8v8H7z"/></g>`);
  if(type==='stone_pick')return svg(`<g shape-rendering="crispEdges"><path fill="#8c5a31" d="M31 24h6v35h-6z"/><path fill="#b67a43" d="M26 21h16v7H26z"/><path fill="#6f7880" d="M8 9h32v8H8z"/><path fill="#b8c1c8" d="M13 5h28v8H13z"/><path fill="#555e66" d="M7 13h8v8H7z"/></g>`);
  if(type==='gold_pick')return svg(`<g shape-rendering="crispEdges"><path fill="#86512d" d="M31 24h6v35h-6z"/><path fill="#d69020" d="M8 9h32v8H8z"/><path fill="#ffd34d" d="M13 5h28v8H13z"/><path fill="#b77712" d="M7 13h8v8H7z"/></g>`);
  if(type==='diamond_pick')return svg(`<g shape-rendering="crispEdges"><path fill="#74452a" d="M31 24h6v35h-6z"/><path fill="#168fa7" d="M8 9h32v8H8z"/><path fill="#72eff7" d="M13 5h28v8H13z"/><path fill="#0d7289" d="M7 13h8v8H7z"/><path fill="#d8ffff" d="M20 5h8v5h-8z"/></g>`);
  if(type==='tnt')return svg(`<g shape-rendering="crispEdges"><rect x="13" y="14" width="38" height="40" rx="2" fill="#cc2d25"/><path fill="#f05245" d="M13 14h10v40H13zM31 14h9v40h-9z"/><rect x="13" y="28" width="38" height="12" fill="#eee5d1"/><text x="32" y="37" text-anchor="middle" font-family="Arial" font-size="11" font-weight="900" fill="#5a1613">TNT</text><path d="M43 13c0-8 7-6 7-11" fill="none" stroke="#44291a" stroke-width="3"/><circle cx="51" cy="3" r="3" fill="#ffd65c"/></g>`);
  if(type==='eye')return svg(`<g><path d="M6 32C16 15 48 15 58 32 48 49 16 49 6 32Z" fill="#d6b9ff" stroke="#6d35b4" stroke-width="5"/><circle cx="32" cy="32" r="11" fill="#7438c0"/><circle cx="32" cy="32" r="5" fill="#140b22"/><circle cx="28" cy="27" r="3" fill="#fff"/></g>`);
  if(type==='book')return svg(`<g shape-rendering="crispEdges"><rect x="13" y="9" width="38" height="47" rx="3" fill="#5c3696"/><rect x="17" y="13" width="30" height="39" fill="#7d4cc5"/><rect x="22" y="18" width="20" height="4" fill="#d9c7ff"/><path d="M32 25l3 7 7 1-5 5 1 8-6-4-7 4 2-8-6-5 8-1z" fill="#ffd85a"/></g>`);
  if(type==='cash')return svg(`<g shape-rendering="crispEdges"><rect x="8" y="15" width="48" height="34" rx="3" fill="#2ca65d"/><rect x="13" y="20" width="38" height="24" fill="#68dc91"/><circle cx="32" cy="32" r="8" fill="#dff7b1"/><text x="32" y="36" text-anchor="middle" font-family="Arial" font-size="11" font-weight="900" fill="#227447">$</text></g>`);
  return svg(`<g opacity=".25" shape-rendering="crispEdges"><rect x="10" y="10" width="44" height="44" fill="#5f6972"/><rect x="17" y="17" width="30" height="30" fill="#838d95"/></g>`);
}
function positionFromToLayer(s,el,from){const r=rectInScene(s,from);el.style.left=`${r.x}px`;el.style.top=`${r.y}px`;}
function rectInScene(s,el){const base=s.querySelector('#mineScene').getBoundingClientRect(),r=el.getBoundingClientRect();return {x:r.left-base.left,y:r.top-base.top,w:r.width,h:r.height};}
function blockColor(id){return {dirt:'#9c5e31',stone:'#aab2b9',ruby:'#e44b58',gold:'#ffc53b',diamond:'#66e9f6',obsidian:'#392747'}[id]||'#bbb';}
function setStatus(s,text){s.querySelector('#mineStatus').innerHTML=String(text).replace(/(\+\s?[\d\s]+|×\d+|\d+\/\d+)/g,'<strong>$1</strong>');}
function setWin(s,n){s.querySelector('#mineWin').textContent=A.fmt(n);}
function haptic(kind){try{const h=window.Telegram?.WebApp?.HapticFeedback;if(kind==='heavy')h?.impactOccurred('heavy');else if(kind==='medium')h?.impactOccurred('medium');else if(kind==='success')h?.notificationOccurred('success');else if(kind==='selection')h?.selectionChanged();else h?.impactOccurred('light');}catch{}}
function sfx(kind){try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();const ctx=audioCtx,o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);const now=ctx.currentTime,table={hit:[180,.045],tick:[480,.025],fuse:[700,.08],boom:[65,.18],magic:[620,.08],eye:[840,.07],chest:[520,.11],win:[740,.08],bonus:[330,.16]},[f,d]=table[kind]||[300,.04];o.frequency.setValueAtTime(f,now);if(kind==='boom')o.frequency.exponentialRampToValueAtTime(35,now+d);else o.frequency.exponentialRampToValueAtTime(f*1.25,now+d);g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(kind==='boom'?.16:.05,now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+d);o.start(now);o.stop(now+d+.01);}catch{}}
