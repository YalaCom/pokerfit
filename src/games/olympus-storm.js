export const OLYMPUS_STORM_CONFIG={
  id:"olympus_storm",name:"OLYMPUS STORM",rows:5,reels:6,mechanic:"PAY ANYWHERE + TUMBLE + STORM MULTIPLIERS",feature:"STORM_FREE_SPINS",maxWin:5000,maxWinMultiplier:5000,volatility:"HIGH",
  symbols:["crown","hourglass","ring","goblet","gem_red","gem_purple","gem_yellow","gem_green","gem_blue","scatter","orb"],scatter:"scatter",orb:"orb",
  weights:{crown:44,hourglass:54,ring:64,goblet:74,gem_red:104,gem_purple:116,gem_yellow:130,gem_green:145,gem_blue:158,scatter:15,orb:16},
  bonusWeights:{crown:43,hourglass:52,ring:61,goblet:71,gem_red:101,gem_purple:113,gem_yellow:126,gem_green:140,gem_blue:152,scatter:11,orb:24},
  paytable:{
    crown:{8:10,10:25,12:50},hourglass:{8:2.5,10:10,12:25},ring:{8:2,10:5,12:15},goblet:{8:1.5,10:2,12:12},
    gem_red:{8:1,10:1.5,12:10},gem_purple:{8:.8,10:1.2,12:8},gem_yellow:{8:.5,10:1,12:5},gem_green:{8:.4,10:.9,12:4},gem_blue:{8:.25,10:.75,12:2}
  },
  multiplierValues:[2,3,4,5,6,8,10,12,15,20,25,50,100,250,500],
  multiplierWeights:[190,150,130,112,90,72,58,42,34,28,20,10,5,2,1],
  freeSpins:15,retriggerSpins:5,bonusBuyCost:100,bonusBuyBoost:1.27,mathScale:.85
};
const REGULAR=Object.keys(OLYMPUS_STORM_CONFIG.paytable);
export function createOlympusStormResult(bet,rng=secureRandom){
  bet=cleanBet(bet);const cap=bet*OLYMPUS_STORM_CONFIG.maxWinMultiplier,initial=createState(false,rng),initialGrid=gridOf(initial);
  const base=runTumbles(initial,bet,{bonus:false,rng,runningMultiplier:0,maxPayout:cap}),scatterPositions=findPositions(base.finalGrid,"scatter"),scatterCount=scatterPositions.length;
  const scatterPayout=Math.min(Math.max(0,cap-base.payout),Math.floor(bet*scatterFactor(scatterCount)));
  const bonusTriggered=scatterCount>=4&&base.payout+scatterPayout<cap;
  const bonus=bonusTriggered?createFreeSpins(bet,rng,Math.max(0,cap-base.payout-scatterPayout)):null;
  const payout=Math.min(cap,base.payout+scatterPayout+Number(bonus?.payout||0));
  return {gameId:OLYMPUS_STORM_CONFIG.id,initialGrid,initialMultipliers:orbList(initial),finalGrid:bonus?.finalGrid||base.finalGrid,finalMultipliers:bonus?.finalMultipliers||base.finalMultipliers,cascades:base.cascades,scatterPositions,scatterCount,scatterPayout,anticipationReel:findAnticipationReel(initialGrid),basePayout:base.payout+scatterPayout,bonusTriggered,bonusType:bonusTriggered?"STORM_FREE_SPINS":null,freeSpinsAwarded:bonus?.frames?.length||0,bonus,payout,multiplier:round4(payout/bet),maxWinHit:payout>=cap};
}
export function createOlympusStormBonusBuyResult(bet,rng=secureRandom){
  bet=cleanBet(bet);const cap=bet*OLYMPUS_STORM_CONFIG.maxWinMultiplier,initial=createState(false,rng),forced=[[0,0],[1,2],[3,1],[5,4]];for(const [c,r] of forced)initial[r][c]={symbol:"scatter"};
  const initialGrid=gridOf(initial),scatterPositions=findPositions(initialGrid,"scatter"),featureBet=Math.max(1,Math.floor(bet*OLYMPUS_STORM_CONFIG.bonusBuyBoost)),bonus=createFreeSpins(featureBet,rng,cap),payout=Math.min(cap,bonus.payout);
  return {gameId:OLYMPUS_STORM_CONFIG.id,initialGrid,initialMultipliers:orbList(initial),finalGrid:bonus.finalGrid||initialGrid,finalMultipliers:bonus.finalMultipliers||[],cascades:[],scatterPositions,scatterCount:scatterPositions.length,scatterPayout:0,anticipationReel:3,basePayout:0,bonusTriggered:true,bonusPurchased:true,bonusType:"STORM_FREE_SPINS",freeSpinsAwarded:bonus.frames.length,bonus,payout,multiplier:round4(payout/bet),maxWinHit:payout>=cap};
}
export function createFreeSpins(bet,rng=secureRandom,maxPayout=Number.MAX_SAFE_INTEGER){
  const frames=[];let remaining=OLYMPUS_STORM_CONFIG.freeSpins,runningMultiplier=0,total=0,guard=0,finalGrid=null,finalMultipliers=[];
  while(remaining>0&&guard<40&&total<maxPayout){
    remaining--;guard++;const state=createState(true,rng),initialGrid=gridOf(state),startMultiplier=runningMultiplier;
    const room=Math.max(0,maxPayout-total),seq=runTumbles(state,bet,{bonus:true,rng,runningMultiplier,maxPayout:room}),scatterPositions=findPositions(seq.finalGrid,"scatter"),scatterCount=scatterPositions.length;runningMultiplier=seq.runningMultiplier;let retrigger=scatterCount>=3?OLYMPUS_STORM_CONFIG.retriggerSpins:0;
    if(retrigger){const roomForFrames=Math.max(0,40-(frames.length+1)-remaining);retrigger=Math.min(retrigger,roomForFrames);remaining+=retrigger;}
    total+=seq.payout;finalGrid=seq.finalGrid;finalMultipliers=seq.finalMultipliers;frames.push({spin:frames.length+1,initialGrid,initialMultipliers:orbList(state),finalGrid:seq.finalGrid,finalMultipliers:seq.finalMultipliers,cascades:seq.cascades,scatterPositions,scatterCount,anticipationReel:findAnticipationReel(initialGrid),startMultiplier,endMultiplier:runningMultiplier,retrigger,payout:seq.payout});
  }
  return {type:"FREE_SPINS",name:"STORM ASCENSION",frames,payout:Math.floor(total),totalSpins:frames.length,finalMultiplier:runningMultiplier,finalGrid,finalMultipliers};
}
export function runTumbles(startState,bet,{bonus=false,rng=secureRandom,runningMultiplier=0,maxPayout=Number.MAX_SAFE_INTEGER}={}){
  let current=cloneState(startState),paid=0,cascades=[],runMult=Math.max(0,Number(runningMultiplier)||0);
  for(let tumble=0;tumble<12&&paid<maxPayout;tumble++){
    const grid=gridOf(current),evaluation=evaluatePayAnywhere(grid,bet);if(!evaluation.wins.length)break;
    const multiplierSymbols=orbList(current),orbTotal=multiplierSymbols.reduce((s,x)=>s+x.value,0);if(bonus&&orbTotal>0)runMult+=orbTotal;
    const appliedMultiplier=bonus?Math.max(1,runMult):Math.max(1,orbTotal),rawPayout=evaluation.payout,room=Math.max(0,maxPayout-paid),cascadePayout=Math.min(room,Math.floor(rawPayout*appliedMultiplier));
    const removed=uniquePositions([...evaluation.wins.flatMap(w=>w.positions),...multiplierSymbols.map(({r,c})=>({r,c}))]),collapsed=collapseAndRefill(current,removed,bonus,rng);paid+=cascadePayout;
    cascades.push({index:tumble+1,wins:evaluation.wins,removed,drops:collapsed.drops,nextGrid:gridOf(collapsed.state),nextMultipliers:orbList(collapsed.state),multiplierSymbols,multiplierTotal:orbTotal,multiplier:appliedMultiplier,runningMultiplierBefore:bonus?Math.max(0,runMult-orbTotal):0,runningMultiplierAfter:bonus?runMult:0,rawPayout,payout:cascadePayout});current=collapsed.state;
  }
  return {cascades,finalGrid:gridOf(current),finalMultipliers:orbList(current),payout:Math.floor(paid),runningMultiplier:runMult};
}
export function evaluatePayAnywhere(grid,bet=1){
  bet=cleanBet(bet);const wins=[];for(const symbol of REGULAR){const positions=findPositions(grid,symbol),count=positions.length;if(count<8)continue;const table=OLYMPUS_STORM_CONFIG.paytable[symbol],factor=count>=12?table[12]:count>=10?table[10]:table[8],amount=Math.max(1,Math.floor(bet*factor*OLYMPUS_STORM_CONFIG.mathScale));wins.push({symbol,count,factor,amount,positions});}return {wins,payout:wins.reduce((s,w)=>s+w.amount,0)};
}
export function createState(bonus=false,rng=secureRandom){const weights=bonus?OLYMPUS_STORM_CONFIG.bonusWeights:OLYMPUS_STORM_CONFIG.weights;return Array.from({length:OLYMPUS_STORM_CONFIG.rows},()=>Array.from({length:OLYMPUS_STORM_CONFIG.reels},()=>createCell(weights,rng)));}
function createCell(weights,rng){const symbol=weightedPick(weights,rng);return symbol==="orb"?{symbol,value:weightedMultiplier(rng)}:{symbol};}
function collapseAndRefill(state,removed,bonus,rng){const removeSet=new Set(removed.map(p=>`${p.r}:${p.c}`)),next=Array.from({length:OLYMPUS_STORM_CONFIG.rows},()=>Array(OLYMPUS_STORM_CONFIG.reels)),drops=[],weights=bonus?OLYMPUS_STORM_CONFIG.bonusWeights:OLYMPUS_STORM_CONFIG.weights;
  for(let c=0;c<OLYMPUS_STORM_CONFIG.reels;c++){
    const survivors=[];for(let r=OLYMPUS_STORM_CONFIG.rows-1;r>=0;r--)if(!removeSet.has(`${r}:${c}`))survivors.push({r,cell:{...state[r][c]}});
    let target=OLYMPUS_STORM_CONFIG.rows-1;for(const item of survivors){next[target][c]=item.cell;drops.push({from:{r:item.r,c},to:{r:target,c},symbol:item.cell.symbol,new:false,multiplier:item.cell.value||0});target--;}
    for(let r=target;r>=0;r--){const cell=createCell(weights,rng);next[r][c]=cell;drops.push({from:null,to:{r,c},symbol:cell.symbol,new:true,multiplier:cell.value||0});}
  }return {state:next,drops};
}
function weightedMultiplier(rng){const vals=OLYMPUS_STORM_CONFIG.multiplierValues,w=OLYMPUS_STORM_CONFIG.multiplierWeights,total=w.reduce((a,b)=>a+b,0);let n=rng()*total;for(let i=0;i<vals.length;i++){n-=w[i];if(n<0)return vals[i];}return vals.at(-1);}
function weightedPick(weights,rng){const entries=Object.entries(weights),total=entries.reduce((a,[,w])=>a+Number(w),0);let n=rng()*total;for(const [id,w] of entries){n-=Number(w);if(n<0)return id;}return entries.at(-1)[0];}
function gridOf(state){return state.map(row=>row.map(cell=>cell.symbol));}function cloneState(s){return s.map(row=>row.map(cell=>({...cell})));}
function orbList(state){const out=[];for(let r=0;r<state.length;r++)for(let c=0;c<state[r].length;c++)if(state[r][c].symbol==="orb")out.push({r,c,value:Number(state[r][c].value)||2});return out;}
function findPositions(grid,symbol){const out=[];for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++)if(grid[r][c]===symbol)out.push({r,c});return out;}
function findAnticipationReel(grid){let seen=0;for(let c=0;c<OLYMPUS_STORM_CONFIG.reels;c++){if(c>0&&seen>=3)return c;for(let r=0;r<OLYMPUS_STORM_CONFIG.rows;r++)if(grid[r][c]==="scatter")seen++;}return -1;}
function scatterFactor(n){return n>=6?100:n===5?5:n===4?3:0;}function uniquePositions(list){const map=new Map();for(const p of list)map.set(`${p.r}:${p.c}`,{r:p.r,c:p.c});return [...map.values()];}
function cleanBet(v){return Math.max(1,Math.floor(Number(v)||1));}function secureRandom(){try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}catch{return Math.random();}}function round4(v){return Math.round((Number(v)||0)*10000)/10000;}
