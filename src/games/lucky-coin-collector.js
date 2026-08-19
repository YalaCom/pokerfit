export const LUCKY_COIN_CONFIG={
  id:"lucky_coin_collector",
  name:"LUCKY COIN COLLECTOR",
  rows:5,
  reels:5,
  mechanic:"COIN REVEAL + RAINBOW FREE SPINS",
  feature:"COIN_COLLECTOR",
  maxWin:10000,
  maxWinMultiplier:10000,
  volatility:"HIGH",
  coinTriggerCount:3,
  rainbowTriggerCount:3,
  maxLayerMultiplier:10,
  maxCollectorCycles:4,
  freeSpinsByScatterCount:{3:8,4:10,5:12,6:15},
  symbols:["figure_blue","figure_red","figure_green","figure_purple","figure_gold","figure_crown","wild","coin","rainbow_scatter"],
  wild:"wild",
  scatter:"rainbow_scatter",
  symbolWeights:{figure_blue:230,figure_red:210,figure_green:190,figure_purple:160,figure_gold:100,figure_crown:40,wild:20,coin:35,rainbow_scatter:15},
  bonusSymbolWeights:{figure_blue:220,figure_red:200,figure_green:180,figure_purple:150,figure_gold:80,figure_crown:40,wild:20,coin:100,rainbow_scatter:10},
  basePayScale:14.76,
  basePaytable:{
    figure_blue:{3:.05,4:.12,5:.30},
    figure_red:{3:.055,4:.13,5:.32},
    figure_green:{3:.06,4:.14,5:.35},
    figure_purple:{3:.07,4:.17,5:.42},
    figure_gold:{3:.10,4:.25,5:.65},
    figure_crown:{3:.15,4:.40,5:1.20},
    wild:{3:.25,4:.80,5:3.00}
  },
  paylines:[
    [0,0,0,0,0],[1,1,1,1,1],[2,2,2,2,2],[3,3,3,3,3],[4,4,4,4,4],
    [0,1,2,1,0],[4,3,2,3,4],[0,1,0,1,0],[4,3,4,3,4],[2,1,0,1,2]
  ],
  coinCashWeights:[
    {value:500,weight:260},{value:1000,weight:230},{value:2000,weight:170},{value:3000,weight:120},{value:5000,weight:85},
    {value:7500,weight:48},{value:10000,weight:32},{value:15000,weight:18},{value:25000,weight:8},{value:50000,weight:2}
  ],
  specialCoinWeights:{cash:940,x2:38,x5:6,collector:16}
};

export function createLuckyCoinResult(bet,rng=secureRandom){
  bet=Math.max(1,Math.floor(Number(bet)||1));
  const cap=bet*LUCKY_COIN_CONFIG.maxWinMultiplier;
  const grid=createGrid(LUCKY_COIN_CONFIG.symbolWeights,rng);
  const normal=evaluateBaseWins(grid,bet);
  const coinPositions=findPositions(grid,"coin");
  const rainbowPositions=findPositions(grid,"rainbow_scatter");
  const anticipation=pickAnticipation(grid);
  let paid=Math.min(cap,normal.payout);
  let coinFeature=null;
  if(coinPositions.length>=LUCKY_COIN_CONFIG.coinTriggerCount&&paid<cap){
    coinFeature=resolveCoinFeature(coinPositions,rng,cap-paid);
    paid+=coinFeature.payout;
  }
  let bonus=null;
  if(rainbowPositions.length>=LUCKY_COIN_CONFIG.rainbowTriggerCount&&paid<cap){
    bonus=createRainbowBonus(rainbowPositions.length,bet,rng,cap-paid);
    paid+=bonus.payout;
  }
  const payout=Math.min(cap,Math.floor(paid));
  return {initialGrid:grid,finalGrid:bonus?.finalGrid||grid,normalWins:normal.wins,basePayout:normal.payout,baseMultiplier:round4(normal.multiplier),coinPositions,coinCount:coinPositions.length,coinFeatureTriggered:!!coinFeature,coinFeature,rainbowPositions,rainbowCount:rainbowPositions.length,bonusTriggered:!!bonus,bonus,anticipationType:anticipation.type,anticipationReel:anticipation.reel,maxWinHit:payout>=cap,payout,multiplier:round4(payout/bet)};
}

export function resolveCoinFeature(positions,rng=secureRandom,maxPayout=Number.MAX_SAFE_INTEGER){
  const active=(positions||[]).map((p,i)=>({key:`${p.r}:${p.c}`,r:p.r,c:p.c,index:i}));
  const usedCollectors=new Set();
  let queuedCollectors=[];
  let total=0;
  let collectorCycles=0;
  const layers=[];
  while(active.length-usedCollectors.size>0&&total<maxPayout){
    const usable=active.filter(p=>!usedCollectors.has(p.key));
    const queuedNow=queuedCollectors.filter(p=>!usedCollectors.has(p.key));
    queuedCollectors=[];
    let collectorPosition=queuedNow.shift()||null;
    queuedCollectors.push(...queuedNow);
    const queuedKeys=new Set([collectorPosition,...queuedCollectors].filter(Boolean).map(p=>p.key));
    const items=[];
    const newlyRevealedCollectors=[];
    let cashSum=0;
    let layerMultiplier=1;
    const allowCollectors=collectorCycles<LUCKY_COIN_CONFIG.maxCollectorCycles;
    for(const p of usable){
      if(queuedKeys.has(p.key)){items.push({...p,kind:"collector",status:p.key===collectorPosition?.key?"ACTIVE":"QUEUED"});continue;}
      const content=drawCoinContent(rng,{allowCollector:allowCollectors});
      const item={...p,...content,status:"REVEALED"};items.push(item);
      if(content.kind==="cash")cashSum+=content.value;
      else if(content.kind==="x2")layerMultiplier=Math.min(LUCKY_COIN_CONFIG.maxLayerMultiplier,layerMultiplier*2);
      else if(content.kind==="x5")layerMultiplier=Math.min(LUCKY_COIN_CONFIG.maxLayerMultiplier,layerMultiplier*5);
      else if(content.kind==="collector")newlyRevealedCollectors.push(p);
    }
    if(!collectorPosition&&newlyRevealedCollectors.length){collectorPosition=newlyRevealedCollectors.shift();const item=items.find(x=>x.key===collectorPosition.key);if(item)item.status="ACTIVE";}
    for(const p of newlyRevealedCollectors){queuedCollectors.push(p);const item=items.find(x=>x.key===p.key);if(item)item.status="QUEUED";}
    const multipliedAmount=Math.floor(cashSum*layerMultiplier);
    const creditedAmount=Math.max(0,Math.min(multipliedAmount,maxPayout-total));
    total+=creditedAmount;
    const collectorActive=!!collectorPosition&&collectorCycles<LUCKY_COIN_CONFIG.maxCollectorCycles;
    if(collectorActive){usedCollectors.add(collectorPosition.key);collectorCycles++;}
    const refresh=collectorActive&&total<maxPayout&&active.length-usedCollectors.size>0;
    layers.push({index:layers.length,items,cashSum,layerMultiplier,multipliedAmount,creditedAmount,collector:collectorPosition?{...collectorPosition,cycle:collectorCycles}:null,queuedCollectors:queuedCollectors.map(p=>({...p})),usedCollectors:[...usedCollectors],refresh});
    if(!refresh)break;
  }
  return {positions:active.map(p=>({r:p.r,c:p.c})),layers,payout:Math.floor(total),collectorCycles,maxCollectorCycles:LUCKY_COIN_CONFIG.maxCollectorCycles};
}

export function evaluateBaseWins(grid,bet=1){
  const wins=[];let multiplier=0;const wild=LUCKY_COIN_CONFIG.wild;
  for(let lineIndex=0;lineIndex<LUCKY_COIN_CONFIG.paylines.length;lineIndex++){
    const line=LUCKY_COIN_CONFIG.paylines[lineIndex],sequence=line.map((r,c)=>grid[r]?.[c]),target=sequence.find(s=>s!==wild)||wild;
    if(target==="coin"||target==="rainbow_scatter")continue;
    let count=0;for(const symbol of sequence){if(symbol===target||symbol===wild)count++;else break;}
    if(count<3)continue;
    const raw=LUCKY_COIN_CONFIG.basePaytable[target]?.[count]||0,payMultiplier=round4(raw*LUCKY_COIN_CONFIG.basePayScale);if(payMultiplier<=0)continue;
    const positions=[];for(let c=0;c<count;c++)positions.push({r:line[c],c});multiplier+=payMultiplier;wins.push({line:lineIndex,symbol:target,count,payMultiplier,amount:Math.floor(Number(bet)*payMultiplier),positions});
  }
  return {wins,multiplier:round4(multiplier),payout:Math.floor(Number(bet)*multiplier)};
}

export function createRainbowBonus(scatterCount,bet,rng=secureRandom,maxPayout=Number.MAX_SAFE_INTEGER){
  const awarded=freeSpinsFor(scatterCount),sticky=new Map(),frames=[];let symbolPayout=0,finalGrid=null;
  for(let spin=1;spin<=awarded&&sticky.size<25&&symbolPayout<maxPayout;spin++){
    const grid=Array.from({length:5},()=>Array(5)),newSticky=[];
    for(let r=0;r<5;r++)for(let c=0;c<5;c++){const key=`${r}:${c}`;if(sticky.has(key)){grid[r][c]="coin";continue;}const symbol=weightedPick(LUCKY_COIN_CONFIG.bonusSymbolWeights,rng);grid[r][c]=symbol;if(symbol==="coin"){const p={r,c,landedSpin:spin};sticky.set(key,p);newSticky.push(p);}}
    const normal=evaluateBaseWins(grid,bet),credited=Math.max(0,Math.min(normal.payout,maxPayout-symbolPayout));symbolPayout+=credited;finalGrid=grid;frames.push({spin,grid,normalWins:normal.wins,symbolPayout:credited,newSticky,stickyCount:sticky.size,fullBoard:sticky.size===25});
  }
  const stickyPositions=[...sticky.values()].map(({r,c,landedSpin})=>({r,c,landedSpin})),remaining=Math.max(0,maxPayout-symbolPayout),finalCoinFeature=stickyPositions.length?resolveCoinFeature(stickyPositions,rng,remaining):null,coinPayout=finalCoinFeature?.payout||0,payout=Math.min(maxPayout,symbolPayout+coinPayout);
  return {scatterCount,awardedSpins:awarded,playedSpins:frames.length,frames,stickyPositions,stickyCount:stickyPositions.length,fullBoard:stickyPositions.length===25,symbolPayout,finalCoinFeature,coinPayout,payout,finalGrid};
}

export function drawCoinContent(rng=secureRandom,{allowCollector=true}={}){
  const specialWeights={...LUCKY_COIN_CONFIG.specialCoinWeights};if(!allowCollector)specialWeights.collector=0;const kind=weightedPick(specialWeights,rng);
  if(kind==="cash")return {kind:"cash",value:weightedValue(LUCKY_COIN_CONFIG.coinCashWeights,rng)};
  if(kind==="x2")return {kind:"x2",multiplier:2};if(kind==="x5")return {kind:"x5",multiplier:5};return {kind:"collector"};
}
export function freeSpinsFor(count){if(count>=6)return LUCKY_COIN_CONFIG.freeSpinsByScatterCount[6];return LUCKY_COIN_CONFIG.freeSpinsByScatterCount[count]||0;}
export function createGrid(weights,rng=secureRandom){return Array.from({length:5},()=>Array.from({length:5},()=>weightedPick(weights,rng)));}
export function weightedPick(weights,rng=secureRandom){const entries=Object.entries(weights),total=entries.reduce((a,[,w])=>a+Number(w),0);let n=rng()*total;for(const [id,w] of entries){n-=Number(w);if(n<0)return id;}return entries[entries.length-1][0];}
export function findPositions(grid,symbol){const out=[];for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++)if(grid[r][c]===symbol)out.push({r,c});return out;}
function weightedValue(table,rng){const total=table.reduce((a,x)=>a+Number(x.weight),0);let n=rng()*total;for(const item of table){n-=Number(item.weight);if(n<0)return Number(item.value);}return Number(table[table.length-1].value);}
function pickAnticipation(grid){let coins=0,rainbows=0;for(let c=0;c<5;c++){if(c>0&&rainbows>=2)return {type:"RAINBOW",reel:c};if(c>1&&coins>=2)return {type:"COIN",reel:c};for(let r=0;r<5;r++){if(grid[r][c]==="coin")coins++;if(grid[r][c]==="rainbow_scatter")rainbows++;}}return {type:null,reel:-1};}
function secureRandom(){try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}catch{return Math.random();}}
function round4(v){return Math.round((Number(v)||0)*10000)/10000;}
