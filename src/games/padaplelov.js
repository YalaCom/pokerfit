export const PADAPLELOV_CONFIG={
  id:"padaplelov",name:"PADAPLELOV",rows:5,reels:5,
  mechanic:"20 LINES + BARREL BLAST + FOAM MULTIPLIER",
  feature:"NIGHT TAP FREE SPINS",maxWin:8000,maxWinMultiplier:8000,volatility:"MEDIUM_HIGH",
  wild:"beer_wild",scatter:"tap_scatter",barrel:"beer_barrel",goldKeg:"gold_keg",
  regularSymbols:["beer_mug","money_bag","cash_stack","beer_bottle","pretzel","sausage","hop","coin"],
  symbols:["beer_mug","money_bag","cash_stack","beer_bottle","pretzel","sausage","hop","coin","beer_barrel","gold_keg","beer_wild","tap_scatter"],
  baseWeights:{beer_mug:8,money_bag:6,cash_stack:8,beer_bottle:11,pretzel:14,sausage:16,hop:18,coin:22,beer_barrel:2.8,gold_keg:.18,tap_scatter:1.4},
  bonusWeights:{beer_mug:9,money_bag:6.5,cash_stack:8.5,beer_bottle:11,pretzel:14,sausage:16,hop:18,coin:21,beer_barrel:4.5,gold_keg:.65,tap_scatter:.8},
  paytable:{
    beer_mug:{3:5,4:14,5:42},money_bag:{3:4,4:11,5:32},cash_stack:{3:3.2,4:8.5,5:24},beer_bottle:{3:2.5,4:6.5,5:18},
    pretzel:{3:2,4:5,5:14},sausage:{3:1.7,4:4.2,5:11},hop:{3:1.4,4:3.5,5:9},coin:{3:1.2,4:3,5:7}
  },
  freeSpins:12,retriggerSpins:4,bonusBuyCost:85
};
export const PADAPLELOV_LINES=[
 [0,0,0,0,0],[1,1,1,1,1],[2,2,2,2,2],[3,3,3,3,3],[4,4,4,4,4],
 [0,1,2,1,0],[4,3,2,3,4],[1,2,3,2,1],[3,2,1,2,3],[0,0,1,0,0],
 [4,4,3,4,4],[1,1,2,1,1],[3,3,2,3,3],[0,1,1,1,0],[4,3,3,3,4],
 [2,1,0,1,2],[2,3,4,3,2],[0,2,4,2,0],[4,2,0,2,4],[1,2,2,2,1]
];
const LINE_SCALE=3.48,LINE_DIV=20;
export function createPadaplelovResult(bet,rng=secureRandom){
  bet=cleanBet(bet);const cap=bet*PADAPLELOV_CONFIG.maxWinMultiplier,initialGrid=makeGrid(false,rng);
  const blast=applyBarrelBlast(initialGrid,rng),evalResult=evaluateLines(blast.grid,bet,1,cap);
  const scatterPositions=findPositions(initialGrid,PADAPLELOV_CONFIG.scatter),scatterCount=scatterPositions.length;
  const scatterPayout=Math.min(Math.max(0,cap-evalResult.payout),Math.floor(bet*scatterFactor(scatterCount)));
  const basePayout=Math.min(cap,evalResult.payout+scatterPayout),bonusTriggered=scatterCount>=3&&basePayout<cap;
  const bonus=bonusTriggered?createPadaplelovBonus(bet,rng,Math.max(0,cap-basePayout)):null,payout=Math.min(cap,basePayout+Number(bonus?.payout||0));
  return {gameId:PADAPLELOV_CONFIG.id,initialGrid,featureGrid:blast.grid,barrelColumns:blast.columns,wins:evalResult.wins,scatterPositions,scatterCount,scatterPayout,
    basePayout,bonusTriggered,bonusType:bonusTriggered?"NIGHT_TAP":null,freeSpinsAwarded:bonusTriggered?PADAPLELOV_CONFIG.freeSpins:0,bonus,payout,multiplier:round4(payout/bet),maxWinHit:payout>=cap};
}
export function createPadaplelovBonusBuyResult(bet,rng=secureRandom){
  bet=cleanBet(bet);const cap=bet*PADAPLELOV_CONFIG.maxWinMultiplier,initialGrid=makeGrid(false,rng);forceScatters(initialGrid,3,rng);
  const scatterPositions=findPositions(initialGrid,PADAPLELOV_CONFIG.scatter),bonus=createPadaplelovBonus(bet,rng,cap),payout=Math.min(cap,bonus.payout);
  return {gameId:PADAPLELOV_CONFIG.id,initialGrid,featureGrid:initialGrid.map(r=>r.slice()),barrelColumns:[],wins:[],scatterPositions,scatterCount:scatterPositions.length,scatterPayout:0,
    basePayout:0,bonusTriggered:true,bonusPurchased:true,bonusType:"NIGHT_TAP",freeSpinsAwarded:PADAPLELOV_CONFIG.freeSpins,bonus,payout,multiplier:round4(payout/bet),maxWinHit:payout>=cap};
}
export function createPadaplelovBonus(bet,rng=secureRandom,maxPayout=Number.MAX_SAFE_INTEGER){
  bet=cleanBet(bet);const frames=[];let remaining=PADAPLELOV_CONFIG.freeSpins,total=0,foam=0,guard=0;
  while(remaining>0&&guard<50&&total<maxPayout){
    remaining--;guard++;const initialGrid=makeGrid(true,rng),barrels=findPositions(initialGrid,PADAPLELOV_CONFIG.barrel),gold=findPositions(initialGrid,PADAPLELOV_CONFIG.goldKeg);
    foam+=barrels.length+gold.length*2;const multiplier=foamMultiplier(foam),blast=applyBarrelBlast(initialGrid,rng,true);
    const room=Math.max(0,maxPayout-total),evaluation=evaluateLines(blast.grid,bet,multiplier,room,.70);
    const scatterPositions=findPositions(initialGrid,PADAPLELOV_CONFIG.scatter),scatterCount=scatterPositions.length;
    let retrigger=scatterCount>=3?PADAPLELOV_CONFIG.retriggerSpins:0;if(gold.length){retrigger+=Math.min(2,gold.length);}if(retrigger)remaining+=retrigger;
    const scatterPayout=Math.min(Math.max(0,room-evaluation.payout),Math.floor(bet*scatterFactor(scatterCount))),payout=Math.min(room,evaluation.payout+scatterPayout);total+=payout;
    frames.push({spin:frames.length+1,initialGrid,featureGrid:blast.grid,barrelColumns:blast.columns,goldKegs:gold,beerBarrels:barrels,wins:evaluation.wins,foam,multiplier,
      scatterPositions,scatterCount,scatterPayout,retrigger,payout,totalWinAfter:total});
  }
  return {type:"NIGHT_TAP",name:"NIGHT TAP",initialSpins:PADAPLELOV_CONFIG.freeSpins,frames,payout:Math.floor(total),totalSpins:frames.length,finalFoam:foam,finalMultiplier:foamMultiplier(foam)};
}
export function applyBarrelBlast(grid,rng=secureRandom,bonus=false){
  const out=grid.map(r=>r.slice()),cols=[...new Set(findPositions(grid,PADAPLELOV_CONFIG.barrel).map(p=>p.c))];
  const goldCols=[...new Set(findPositions(grid,PADAPLELOV_CONFIG.goldKeg).map(p=>p.c))];let chosen=[];
  if(bonus)chosen=[...new Set([...cols,...goldCols])];
  else if(cols.length>=2){chosen=shuffle(cols.slice(),rng).slice(0,Math.min(2,cols.length));}
  for(const c of chosen)for(let r=0;r<PADAPLELOV_CONFIG.rows;r++)if(out[r][c]!==PADAPLELOV_CONFIG.scatter)out[r][c]=PADAPLELOV_CONFIG.wild;
  return {grid:out,columns:chosen};
}
export function evaluateLines(grid,bet=1,multiplier=1,maxPayout=Number.MAX_SAFE_INTEGER,payScale=1){
  bet=cleanBet(bet);let paid=0;const wins=[];
  for(let i=0;i<PADAPLELOV_LINES.length;i++){
    const rows=PADAPLELOV_LINES[i];let best=null;
    for(const symbol of PADAPLELOV_CONFIG.regularSymbols){
      const positions=[];let count=0;for(let c=0;c<PADAPLELOV_CONFIG.reels;c++){const r=rows[c],cell=grid[r][c];if(cell!==symbol&&cell!==PADAPLELOV_CONFIG.wild)break;count++;positions.push({r,c});}
      if(count<3)continue;const factor=payFactor(symbol,count),base=Math.max(1,Math.floor((bet/LINE_DIV)*factor*LINE_SCALE)),amount=Math.floor(base*multiplier*payScale);
      if(!best||amount>best.amount)best={lineIndex:i,symbol,count,factor,baseAmount:base,multiplier,amount,positions};
    }
    if(best){const room=Math.max(0,maxPayout-paid);if(room<=0)break;best.amount=Math.min(room,best.amount);paid+=best.amount;wins.push(best);}
  }
  return {wins,payout:Math.floor(paid)};
}
function foamMultiplier(foam){return foam>=15?8:foam>=10?5:foam>=6?3:foam>=3?2:1;}
function payFactor(s,n){const t=PADAPLELOV_CONFIG.paytable[s];return n>=5?t[5]:n===4?t[4]:n===3?t[3]:0;}
function scatterFactor(n){return n>=5?50:n===4?10:n===3?2:0;}
function makeGrid(bonus,rng){const w=bonus?PADAPLELOV_CONFIG.bonusWeights:PADAPLELOV_CONFIG.baseWeights,g=Array.from({length:PADAPLELOV_CONFIG.rows},()=>Array(PADAPLELOV_CONFIG.reels));for(let c=0;c<PADAPLELOV_CONFIG.reels;c++){let scatter=false;for(let r=0;r<PADAPLELOV_CONFIG.rows;r++){let s=weightedPick(w,rng);if(s===PADAPLELOV_CONFIG.scatter&&scatter)s=weightedPick(without(w,PADAPLELOV_CONFIG.scatter),rng);if(s===PADAPLELOV_CONFIG.scatter)scatter=true;g[r][c]=s;}}return g;}
function forceScatters(g,n,rng){const cols=[0,1,2,3,4];shuffle(cols,rng);for(let i=0;i<Math.min(n,5);i++){const c=cols[i],r=Math.floor(rng()*PADAPLELOV_CONFIG.rows);for(let rr=0;rr<PADAPLELOV_CONFIG.rows;rr++)if(g[rr][c]===PADAPLELOV_CONFIG.scatter)g[rr][c]="coin";g[r][c]=PADAPLELOV_CONFIG.scatter;}}
function findPositions(g,s){const o=[];for(let r=0;r<g.length;r++)for(let c=0;c<g[r].length;c++)if(g[r][c]===s)o.push({r,c});return o;}
function without(w,k){const o={...w};delete o[k];return o;}function weightedPick(w,rng){const e=Object.entries(w),t=e.reduce((s,[,x])=>s+Number(x),0);let v=rng()*t;for(const [id,x] of e){v-=Number(x);if(v<0)return id;}return e.at(-1)[0];}
function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}function cleanBet(v){return Math.max(1,Math.floor(Number(v)||1));}function secureRandom(){try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}catch{return Math.random();}}function round4(v){return Math.round((Number(v)||0)*10000)/10000;}
