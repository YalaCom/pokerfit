export const BLACK_HOUND_CONFIG={
  id:"black_hound_overdrive",name:"BLACK HOUND: OVERDRIVE",rows:4,reels:6,
  mechanic:"20 LINES + CHAIN LINK + STICKY MULTIPLIER HOUNDS",feature:"TRIPLE_BONUS_SELECT",
  maxWin:12000,maxWinMultiplier:12000,volatility:"HIGH",
  wild:"hound_wild",scatter:"kennel_scatter",chain:"chain",
  regularSymbols:["alpha_head","red_hound","steel_hound","gold_collar","bone","meat","paw","chain","cash_tag","neon_ball"],
  symbols:["alpha_head","red_hound","steel_hound","gold_collar","bone","meat","paw","chain","cash_tag","neon_ball","hound_wild","kennel_scatter"],
  baseWeights:{alpha_head:4.8,red_hound:6,steel_hound:7.2,gold_collar:9,bone:11,meat:13,paw:15,chain:3.3,cash_tag:17,neon_ball:20,hound_wild:1.7,kennel_scatter:1.5},
  bonusWeights:{alpha_head:5.2,red_hound:6.3,steel_hound:7.5,gold_collar:9,bone:11,meat:13,paw:15,chain:3.8,cash_tag:17,neon_ball:19,hound_wild:.5,kennel_scatter:.9},
  paytable:{
    alpha_head:{3:12,4:35,5:110,6:320},red_hound:{3:7,4:22,5:65,6:170},steel_hound:{3:6,4:18,5:50,6:125},
    gold_collar:{3:4,4:11,5:28,6:70},bone:{3:3.2,4:8,5:21,6:50},meat:{3:2.6,4:6.5,5:16,6:38},
    paw:{3:2.1,4:5.2,5:13,6:30},chain:{3:1.8,4:4.5,5:11,6:25},cash_tag:{3:1.5,4:3.8,5:9,6:20},neon_ball:{3:1.2,4:3,5:7,6:16},
    hound_wild:{3:12,4:35,5:110,6:320}
  },
  scatterPay:{3:2,4:10,5:35,6:100},
  bonusTiers:{
    hellhound:{id:"hellhound",name:"HELLHOUND",spins:6,buyCost:60,wildChance:.32,maxSticky:3,multipliers:[5,8,10,15,25],growth:1,cap:30,accent:"#ff3b32"},
    night_pack:{id:"night_pack",name:"NIGHT PACK",spins:10,buyCost:80,wildChance:.28,maxSticky:4,multipliers:[3,3,4,5,7],growth:1,cap:10,accent:"#9d5cff"},
    iron_kennel:{id:"iron_kennel",name:"IRON KENNEL",spins:16,buyCost:80,wildChance:.23,maxSticky:5,multipliers:[2,2,2,3],growth:0,cap:3,accent:"#76e6ff"}
  }
};

export const PAYLINES=[
 [0,0,0,0,0,0],[1,1,1,1,1,1],[2,2,2,2,2,2],[3,3,3,3,3,3],
 [0,1,2,3,2,1],[3,2,1,0,1,2],[0,1,0,1,0,1],[3,2,3,2,3,2],
 [1,0,1,0,1,0],[2,3,2,3,2,3],[0,0,1,2,3,3],[3,3,2,1,0,0],
 [1,1,2,2,1,1],[2,2,1,1,2,2],[0,1,1,1,1,0],[3,2,2,2,2,3],
 [1,2,3,2,1,0],[2,1,0,1,2,3],[0,1,2,2,1,0],[3,2,1,1,2,3]
];

const REGULAR=BLACK_HOUND_CONFIG.regularSymbols.filter(s=>s!==BLACK_HOUND_CONFIG.chain);
const LINE_DIVISOR=20;
const LINE_PAY_SCALE=3.62;

export function createBlackHoundResult(bet,rng=secureRandom){
  bet=cleanBet(bet);const cap=bet*BLACK_HOUND_CONFIG.maxWinMultiplier;
  const initialGrid=makeGrid(false,rng);const chain=resolveChainLinks(initialGrid);const evalResult=evaluateHoundLines(chain.grid,bet,new Map(),cap);
  const scatterPositions=findPositions(initialGrid,BLACK_HOUND_CONFIG.scatter),scatterCount=scatterPositions.length;
  const scatterPayout=Math.min(Math.max(0,cap-evalResult.payout),Math.floor(bet*scatterFactor(scatterCount)));
  const basePayout=Math.min(cap,evalResult.payout+scatterPayout),bonusTriggered=scatterCount>=3&&basePayout<cap;
  const naturalTier=scatterCount>=4?"hellhound":"night_pack";
  const bonus=bonusTriggered?createHoundBonus(bet,naturalTier,rng,Math.max(0,cap-basePayout)):null;
  const payout=Math.min(cap,basePayout+Number(bonus?.payout||0));
  return {gameId:BLACK_HOUND_CONFIG.id,initialGrid,featureGrid:chain.grid,chainLinks:chain.links,wins:evalResult.wins,scatterPositions,scatterCount,scatterPayout,
    basePayout,bonusTriggered,bonusType:bonusTriggered?naturalTier:null,bonus,payout,multiplier:round4(payout/bet),maxWinHit:payout>=cap};
}

export function createBlackHoundBonusBuyResult(bet,tierId="night_pack",rng=secureRandom){
  bet=cleanBet(bet);const tier=getTier(tierId),cap=bet*BLACK_HOUND_CONFIG.maxWinMultiplier;
  const initialGrid=makeGrid(false,rng);forceScatters(initialGrid,3,rng);
  const scatterPositions=findPositions(initialGrid,BLACK_HOUND_CONFIG.scatter),bonus=createHoundBonus(bet,tier.id,rng,cap);
  const payout=Math.min(cap,bonus.payout);
  return {gameId:BLACK_HOUND_CONFIG.id,initialGrid,featureGrid:initialGrid.map(r=>r.slice()),chainLinks:[],wins:[],scatterPositions,scatterCount:scatterPositions.length,
    scatterPayout:0,basePayout:0,bonusTriggered:true,bonusPurchased:true,bonusType:tier.id,bonus,payout,multiplier:round4(payout/bet),maxWinHit:payout>=cap};
}

export function createHoundBonus(bet,tierId="night_pack",rng=secureRandom,maxPayout=Number.MAX_SAFE_INTEGER){
  bet=cleanBet(bet);const tier=getTier(tierId),sticky=new Map(),frames=[];let total=0;
  for(let spin=1;spin<=tier.spins&&total<maxPayout;spin++){
    const initialGrid=makeGrid(true,rng);
    for(const [key,info] of sticky){const [r,c]=key.split(":").map(Number);initialGrid[r][c]=BLACK_HOUND_CONFIG.wild;}
    const newSticky=[];
    if(sticky.size<tier.maxSticky&&rng()<tier.wildChance){
      const free=[];for(let r=0;r<BLACK_HOUND_CONFIG.rows;r++)for(let c=1;c<BLACK_HOUND_CONFIG.reels-1;c++){const key=`${r}:${c}`;if(!sticky.has(key)&&initialGrid[r][c]!==BLACK_HOUND_CONFIG.scatter)free.push({r,c});}
      if(free.length){const spot=pick(free,rng),multiplier=pick(tier.multipliers,rng),key=`${spot.r}:${spot.c}`;sticky.set(key,{...spot,multiplier,hits:0});initialGrid[spot.r][spot.c]=BLACK_HOUND_CONFIG.wild;newSticky.push({...spot,multiplier});}
    }
    const stickyBefore=[...sticky.values()].map(x=>({...x}));
    const chain=resolveChainLinks(initialGrid),room=Math.max(0,maxPayout-total),evaluation=evaluateHoundLines(chain.grid,bet,sticky,room);
    const scatterPositions=findPositions(initialGrid,BLACK_HOUND_CONFIG.scatter),scatterCount=scatterPositions.length;
    const scatterPayout=Math.min(Math.max(0,room-evaluation.payout),Math.floor(bet*scatterFactor(scatterCount)));
    const payout=Math.min(room,evaluation.payout+scatterPayout);total+=payout;
    const hitKeys=new Set(evaluation.wins.flatMap(w=>(w.stickyWilds||[]).map(x=>`${x.r}:${x.c}`)));
    const upgraded=[];
    if(tier.growth>0)for(const key of hitKeys){const info=sticky.get(key);if(!info)continue;const before=info.multiplier;info.hits++;info.multiplier=Math.min(tier.cap,info.multiplier+tier.growth);if(info.multiplier!==before)upgraded.push({r:info.r,c:info.c,from:before,to:info.multiplier});}
    frames.push({spin,initialGrid,featureGrid:chain.grid,chainLinks:chain.links,wins:evaluation.wins,scatterPositions,scatterCount,scatterPayout,
      newSticky,stickyBefore,stickyAfter:[...sticky.values()].map(x=>({...x})),upgraded,payout,totalWinAfter:total});
  }
  return {type:tier.id,name:tier.name,spins:tier.spins,frames,payout:Math.floor(total),tier:{...tier},finalSticky:[...sticky.values()].map(x=>({...x}))};
}

export function resolveChainLinks(grid){
  const out=grid.map(r=>r.slice()),links=[];
  for(let r=0;r<out.length;r++){
    const cols=[];for(let c=0;c<out[r].length;c++)if(out[r][c]===BLACK_HOUND_CONFIG.chain)cols.push(c);
    if(cols.length<2)continue;const from=Math.min(...cols),to=Math.max(...cols),positions=[];
    for(let c=from;c<=to;c++){if(out[r][c]===BLACK_HOUND_CONFIG.scatter)continue;out[r][c]=BLACK_HOUND_CONFIG.wild;positions.push({r,c});}
    links.push({row:r,from,to,positions});
  }
  return {grid:out,links};
}

export function evaluateHoundLines(grid,bet=1,stickyMap=new Map(),maxPayout=Number.MAX_SAFE_INTEGER){
  bet=cleanBet(bet);const wins=[];let paid=0;
  for(let lineIndex=0;lineIndex<PAYLINES.length;lineIndex++){
    const rows=PAYLINES[lineIndex],candidates=[...REGULAR,BLACK_HOUND_CONFIG.chain,BLACK_HOUND_CONFIG.wild];let best=null;
    for(const symbol of candidates){
      let count=0;const positions=[],stickyWilds=[];
      for(let c=0;c<BLACK_HOUND_CONFIG.reels;c++){
        const r=rows[c],cell=grid[r][c];if(cell!==symbol&&cell!==BLACK_HOUND_CONFIG.wild)break;
        count++;positions.push({r,c});const s=stickyMap.get(`${r}:${c}`);if(s&&cell===BLACK_HOUND_CONFIG.wild)stickyWilds.push({...s});
      }
      if(count<3)continue;const factor=payFactor(symbol,count);if(!factor)continue;
      const base=Math.max(1,Math.floor((bet/LINE_DIVISOR)*factor*LINE_PAY_SCALE)),multiplier=stickyWilds.length?stickyWilds.reduce((s,w)=>s+Number(w.multiplier||0),0):1;
      const amount=Math.floor(base*Math.max(1,multiplier));
      if(!best||amount>best.amount)best={lineIndex,symbol,count,factor,baseAmount:base,multiplier:Math.max(1,multiplier),amount,positions,stickyWilds};
    }
    if(best){const room=Math.max(0,maxPayout-paid);if(room<=0)break;if(best.amount>room){best.amount=room;best.capped=true;}paid+=best.amount;wins.push(best);}
  }
  return {wins,payout:Math.floor(paid)};
}

function payFactor(symbol,count){const t=BLACK_HOUND_CONFIG.paytable[symbol]||BLACK_HOUND_CONFIG.paytable.hound_wild;return count>=6?t[6]:count===5?t[5]:count===4?t[4]:count===3?t[3]:0;}
function scatterFactor(n){return n>=6?100:n===5?35:n===4?10:n===3?2:0;}
function getTier(id){const t=BLACK_HOUND_CONFIG.bonusTiers[String(id||"").toLowerCase()];if(!t)throw new Error("BAD_HOUND_BONUS_TIER");return t;}
function makeGrid(bonus,rng){const weights=bonus?BLACK_HOUND_CONFIG.bonusWeights:BLACK_HOUND_CONFIG.baseWeights,grid=Array.from({length:BLACK_HOUND_CONFIG.rows},()=>Array(BLACK_HOUND_CONFIG.reels));for(let c=0;c<BLACK_HOUND_CONFIG.reels;c++){let scatterUsed=false;for(let r=0;r<BLACK_HOUND_CONFIG.rows;r++){let symbol=weightedPick(weights,rng);if(symbol===BLACK_HOUND_CONFIG.scatter&&scatterUsed)symbol=weightedPick(without(weights,BLACK_HOUND_CONFIG.scatter),rng);if(symbol===BLACK_HOUND_CONFIG.scatter)scatterUsed=true;grid[r][c]=symbol;}}return grid;}
function forceScatters(grid,count,rng){const cols=[0,1,2,3,4,5];shuffle(cols,rng);for(let i=0;i<Math.min(count,6);i++){const c=cols[i],r=Math.floor(rng()*BLACK_HOUND_CONFIG.rows);for(let rr=0;rr<BLACK_HOUND_CONFIG.rows;rr++)if(grid[rr][c]===BLACK_HOUND_CONFIG.scatter)grid[rr][c]="neon_ball";grid[r][c]=BLACK_HOUND_CONFIG.scatter;}}
function findPositions(grid,symbol){const out=[];for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++)if(grid[r][c]===symbol)out.push({r,c});return out;}
function without(weights,key){const out={...weights};delete out[key];return out;}function weightedPick(weights,rng){const e=Object.entries(weights),total=e.reduce((s,[,w])=>s+Number(w),0);let x=rng()*total;for(const [id,w] of e){x-=Number(w);if(x<0)return id;}return e.at(-1)[0];}function pick(a,rng){return a[Math.min(a.length-1,Math.floor(rng()*a.length))];}function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}function cleanBet(v){return Math.max(1,Math.floor(Number(v)||1));}function secureRandom(){try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}catch{return Math.random();}}function round4(v){return Math.round((Number(v)||0)*10000)/10000;}
