export const KOZYR_CONFIG={
  id:"kozyr",name:"KOZYR",rows:5,reels:6,
  mechanic:"CLUSTER 5+ + INK SPLASH + PERMANENT TATTOO WILDS",
  feature:"BLACK INK FREE SPINS",maxWin:10000,maxWinMultiplier:10000,volatility:"HIGH",
  wild:"ink_wild",scatter:"crown_scatter",
  regularSymbols:["doberman","tattoo_face","cash_bag","cash_stack","skull_ring","black_rose","spade","chain","diamond","watch"],
  symbols:["doberman","tattoo_face","cash_bag","cash_stack","skull_ring","black_rose","spade","chain","diamond","watch","ink_wild","crown_scatter"],
  baseWeights:{doberman:4.2,tattoo_face:5.4,cash_bag:7,cash_stack:9,skull_ring:11,black_rose:13,spade:16,chain:18,diamond:21,watch:24,ink_wild:1.1,crown_scatter:3.0},
  bonusWeights:{doberman:4.6,tattoo_face:5.8,cash_bag:7.4,cash_stack:9.4,skull_ring:11.5,black_rose:13.5,spade:16,chain:18,diamond:21,watch:24,ink_wild:.45,crown_scatter:1.8},
  paytable:{
    doberman:{5:.85,7:1.7,9:3.8,12:9,15:22},tattoo_face:{5:.6,7:1.25,9:2.8,12:6.5,15:16},
    cash_bag:{5:.48,7:1.0,9:2.2,12:5.2,15:12},cash_stack:{5:.38,7:.82,9:1.8,12:4.1,15:9.5},
    skull_ring:{5:.32,7:.68,9:1.45,12:3.2,15:7.5},black_rose:{5:.27,7:.56,9:1.2,12:2.7,15:6.2},
    spade:{5:.22,7:.46,9:1.0,12:2.2,15:5},chain:{5:.19,7:.39,9:.82,12:1.8,15:4.2},
    diamond:{5:.16,7:.33,9:.7,12:1.55,15:3.5},watch:{5:.14,7:.29,9:.6,12:1.3,15:3}
  },
  freeSpins:8,retriggerSpins:3,bonusBuyCost:100,stickyChance:.30,stickyMax:5,stickyMultipliers:[2,2,3,3,5]
};
const REG=KOZYR_CONFIG.regularSymbols;
const PAY_SCALE=17.0;
export function createKozyrResult(bet,rng=secureRandom){
  bet=cleanBet(bet);const cap=bet*KOZYR_CONFIG.maxWinMultiplier;
  const initialGrid=makeGrid(false,rng);
  const tumble=runInkCascades(initialGrid,bet,{bonus:false,rng,maxPayout:cap});
  const scatterPositions=findPositions(tumble.finalGrid,KOZYR_CONFIG.scatter),scatterCount=scatterPositions.length;
  const scatterPayout=Math.min(Math.max(0,cap-tumble.payout),Math.floor(bet*scatterFactor(scatterCount)));
  const basePayout=Math.min(cap,tumble.payout+scatterPayout),bonusTriggered=scatterCount>=4&&basePayout<cap;
  const bonus=bonusTriggered?createKozyrBonus(bet,rng,Math.max(0,cap-basePayout)):null;
  const payout=Math.min(cap,basePayout+Number(bonus?.payout||0));
  return {gameId:KOZYR_CONFIG.id,initialGrid,finalGrid:tumble.finalGrid,cascades:tumble.cascades,scatterPositions,scatterCount,scatterPayout,
    basePayout,bonusTriggered,bonusType:bonusTriggered?"BLACK_INK":null,freeSpinsAwarded:bonusTriggered?KOZYR_CONFIG.freeSpins:0,bonus,payout,multiplier:round4(payout/bet),maxWinHit:payout>=cap};
}
export function createKozyrBonusBuyResult(bet,rng=secureRandom){
  bet=cleanBet(bet);const cap=bet*KOZYR_CONFIG.maxWinMultiplier,initialGrid=makeGrid(false,rng);forceScatters(initialGrid,4,rng);
  const scatterPositions=findPositions(initialGrid,KOZYR_CONFIG.scatter),bonus=createKozyrBonus(bet,rng,cap),payout=Math.min(cap,bonus.payout);
  return {gameId:KOZYR_CONFIG.id,initialGrid,finalGrid:initialGrid.map(r=>r.slice()),cascades:[],scatterPositions,scatterCount:scatterPositions.length,scatterPayout:0,
    basePayout:0,bonusTriggered:true,bonusPurchased:true,bonusType:"BLACK_INK",freeSpinsAwarded:KOZYR_CONFIG.freeSpins,bonus,payout,multiplier:round4(payout/bet),maxWinHit:payout>=cap};
}
export function createKozyrBonus(bet,rng=secureRandom,maxPayout=Number.MAX_SAFE_INTEGER){
  bet=cleanBet(bet);const sticky=new Map(),frames=[];let remaining=KOZYR_CONFIG.freeSpins,total=0,guard=0;
  while(remaining>0&&guard<40&&total<maxPayout){
    remaining--;guard++;const initialGrid=makeGrid(true,rng);
    for(const [key,w] of sticky){const [r,c]=key.split(":").map(Number);initialGrid[r][c]=KOZYR_CONFIG.wild;}
    const newSticky=[];
    if(sticky.size<KOZYR_CONFIG.stickyMax&&rng()<KOZYR_CONFIG.stickyChance){
      const count=rng()<.18?2:1;
      for(let i=0;i<count&&sticky.size<KOZYR_CONFIG.stickyMax;i++){
        const free=[];for(let r=0;r<KOZYR_CONFIG.rows;r++)for(let c=0;c<KOZYR_CONFIG.reels;c++){const key=`${r}:${c}`;if(!sticky.has(key)&&initialGrid[r][c]!==KOZYR_CONFIG.scatter)free.push({r,c});}
        if(!free.length)break;const p=pick(free,rng),multiplier=pick(KOZYR_CONFIG.stickyMultipliers,rng),key=`${p.r}:${p.c}`;
        sticky.set(key,{...p,multiplier,hits:0});initialGrid[p.r][p.c]=KOZYR_CONFIG.wild;newSticky.push({...p,multiplier});
      }
    }
    const room=Math.max(0,maxPayout-total),spinRoom=Math.min(room,bet*60),tumble=runInkCascades(initialGrid,bet,{bonus:true,rng,maxPayout:spinRoom,sticky});
    const scatterPositions=findPositions(tumble.finalGrid,KOZYR_CONFIG.scatter),scatterCount=scatterPositions.length;
    let retrigger=scatterCount>=3?KOZYR_CONFIG.retriggerSpins:0;if(retrigger){remaining+=retrigger;}
    const scatterPayout=Math.min(Math.max(0,room-tumble.payout),Math.floor(bet*scatterFactor(scatterCount)));
    const payout=Math.min(room,tumble.payout+scatterPayout);total+=payout;
    const usedKeys=new Set(tumble.cascades.flatMap(c=>c.wins||[]).flatMap(w=>w.stickyWilds||[]).map(w=>`${w.r}:${w.c}`)),upgraded=[];
    for(const key of usedKeys){const w=sticky.get(key);if(!w)continue;const from=w.multiplier;w.hits++;w.multiplier=Math.min(6,w.multiplier+1);if(w.multiplier!==from)upgraded.push({r:w.r,c:w.c,from,to:w.multiplier});}
    frames.push({spin:frames.length+1,initialGrid,finalGrid:tumble.finalGrid,cascades:tumble.cascades,newSticky,sticky:[...sticky.values()].map(x=>({...x})),
      upgraded,scatterPositions,scatterCount,scatterPayout,retrigger,payout,totalWinAfter:total});
  }
  return {type:"BLACK_INK",name:"BLACK INK",initialSpins:KOZYR_CONFIG.freeSpins,frames,payout:Math.floor(total),totalSpins:frames.length,finalSticky:[...sticky.values()].map(x=>({...x}))};
}
export function runInkCascades(startGrid,bet,{bonus=false,rng=secureRandom,maxPayout=Number.MAX_SAFE_INTEGER,sticky=new Map()}={}){
  let current=cloneGrid(startGrid),paid=0;const cascades=[];let guard=0,cascadeMultiplier=1;
  while(guard<16&&paid<maxPayout){
    guard++;const evaluation=evaluateClusters(current,bet,sticky,Math.max(0,maxPayout-paid),cascadeMultiplier);
    if(!evaluation.wins.length)break;paid+=evaluation.payout;
    const removed=uniquePositions(evaluation.wins.flatMap(w=>w.positions).filter(p=>!sticky.has(`${p.r}:${p.c}`)));
    const collapsed=collapseAndRefill(current,removed,bonus,rng,sticky);
    const splash=pickInkSplash(collapsed.grid,evaluation.wins,sticky,rng);
    if(splash){collapsed.grid[splash.r][splash.c]=KOZYR_CONFIG.wild;}
    cascades.push({index:cascades.length+1,wins:evaluation.wins,removed,drops:collapsed.drops,nextGrid:cloneGrid(collapsed.grid),payout:evaluation.payout,cascadeMultiplier,inkSplash:splash?[splash]:[]});
    current=collapsed.grid;cascadeMultiplier=Math.min(5,cascadeMultiplier+.5);
  }
  return {cascades,finalGrid:current,payout:Math.floor(paid)};
}
export function evaluateClusters(grid,bet=1,sticky=new Map(),maxPayout=Number.MAX_SAFE_INTEGER,multi=1){
  bet=cleanBet(bet);const wins=[];let paid=0;
  for(const symbol of REG){
    const seen=new Set();
    for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++){
      const key=`${r}:${c}`;if(seen.has(key)||grid[r][c]!==symbol)continue;
      const stack=[{r,c}],positions=[];seen.add(key);
      while(stack.length){const p=stack.pop();positions.push(p);for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){const rr=p.r+dr,cc=p.c+dc,k=`${rr}:${cc}`;if(rr<0||cc<0||rr>=grid.length||cc>=grid[0].length||seen.has(k)||!matches(grid[rr][cc],symbol))continue;seen.add(k);stack.push({r:rr,c:cc});}}
      if(positions.length<5)continue;
      const factor=clusterFactor(symbol,positions.length);if(!factor)continue;
      const stickyWilds=positions.map(p=>sticky.get(`${p.r}:${p.c}`)).filter(Boolean).map(x=>({...x}));
      const wildMulti=stickyWilds.length?stickyWilds.reduce((s,w)=>s+Number(w.multiplier||0),0):1;
      let amount=Math.floor(bet*factor*PAY_SCALE*multi*Math.max(1,wildMulti));const room=Math.max(0,maxPayout-paid);amount=Math.min(room,amount);
      if(amount<=0)return {wins,payout:Math.floor(paid)};paid+=amount;wins.push({symbol,count:positions.length,factor,amount,positions,cluster:true,cascadeMultiplier:multi,multiplier:Math.max(1,wildMulti),stickyWilds});
    }
  }
  return {wins,payout:Math.floor(paid)};
}
function matches(cell,symbol){return cell===symbol||cell===KOZYR_CONFIG.wild;}
function clusterFactor(symbol,n){const t=KOZYR_CONFIG.paytable[symbol];if(n>=15)return t[15];if(n>=12)return t[12];if(n>=9)return t[9];if(n>=7)return t[7];return n>=5?t[5]:0;}
function pickInkSplash(grid,wins,sticky,rng){if(rng()>.6)return null;const candidates=[];for(const w of wins)for(const p of w.positions)for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){const r=p.r+dr,c=p.c+dc,key=`${r}:${c}`;if(r>=0&&c>=0&&r<grid.length&&c<grid[0].length&&!sticky.has(key)&&grid[r][c]!==KOZYR_CONFIG.scatter&&grid[r][c]!==KOZYR_CONFIG.wild)candidates.push({r,c});}return candidates.length?pick(candidates,rng):null;}
function collapseAndRefill(grid,removed,bonus,rng,sticky){const rem=new Set(removed.map(p=>`${p.r}:${p.c}`)),next=Array.from({length:KOZYR_CONFIG.rows},()=>Array(KOZYR_CONFIG.reels)),drops=[];for(let c=0;c<KOZYR_CONFIG.reels;c++){const survivors=[];for(let r=KOZYR_CONFIG.rows-1;r>=0;r--){const key=`${r}:${c}`;if(sticky.has(key)){survivors.push({r,symbol:KOZYR_CONFIG.wild,sticky:true,key});continue;}if(!rem.has(key))survivors.push({r,symbol:grid[r][c],sticky:false});}let target=KOZYR_CONFIG.rows-1;for(const item of survivors){while(target>=0&&sticky.has(`${target}:${c}`))target--;if(target<0)break;next[target][c]=item.symbol;drops.push({from:{r:item.r,c},to:{r:target,c},symbol:item.symbol,new:false});target--;}for(let r=0;r<KOZYR_CONFIG.rows;r++)if(sticky.has(`${r}:${c}`))next[r][c]=KOZYR_CONFIG.wild;for(let r=KOZYR_CONFIG.rows-1;r>=0;r--)if(!next[r][c]){next[r][c]=weightedPick(bonus?KOZYR_CONFIG.bonusWeights:KOZYR_CONFIG.baseWeights,rng);drops.push({from:null,to:{r,c},symbol:next[r][c],new:true});}}return {grid:next,drops};}
function makeGrid(bonus,rng){const weights=bonus?KOZYR_CONFIG.bonusWeights:KOZYR_CONFIG.baseWeights,grid=Array.from({length:KOZYR_CONFIG.rows},()=>Array(KOZYR_CONFIG.reels));for(let c=0;c<KOZYR_CONFIG.reels;c++){let scatter=false;for(let r=0;r<KOZYR_CONFIG.rows;r++){let s=weightedPick(weights,rng);if(s===KOZYR_CONFIG.scatter&&scatter)s=weightedPick(without(weights,KOZYR_CONFIG.scatter),rng);if(s===KOZYR_CONFIG.scatter)scatter=true;grid[r][c]=s;}}return grid;}
function forceScatters(grid,count,rng){const cols=[0,1,2,3,4,5];shuffle(cols,rng);for(let i=0;i<Math.min(count,cols.length);i++){const c=cols[i],r=Math.floor(rng()*KOZYR_CONFIG.rows);for(let rr=0;rr<KOZYR_CONFIG.rows;rr++)if(grid[rr][c]===KOZYR_CONFIG.scatter)grid[rr][c]="watch";grid[r][c]=KOZYR_CONFIG.scatter;}}
function scatterFactor(n){return n>=6?50:n===5?12:n===4?3:0;}
function findPositions(grid,s){const out=[];for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++)if(grid[r][c]===s)out.push({r,c});return out;}
function uniquePositions(a){const m=new Map();for(const p of a)m.set(`${p.r}:${p.c}`,{r:p.r,c:p.c});return [...m.values()];}
function without(w,k){const o={...w};delete o[k];return o;}function weightedPick(w,rng){const e=Object.entries(w),t=e.reduce((s,[,x])=>s+Number(x),0);let v=rng()*t;for(const [id,x] of e){v-=Number(x);if(v<0)return id;}return e.at(-1)[0];}
function pick(a,rng){return a[Math.min(a.length-1,Math.floor(rng()*a.length))];}function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function cloneGrid(g){return g.map(r=>r.slice());}function cleanBet(v){return Math.max(1,Math.floor(Number(v)||1));}function secureRandom(){try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}catch{return Math.random();}}function round4(v){return Math.round((Number(v)||0)*10000)/10000;}
