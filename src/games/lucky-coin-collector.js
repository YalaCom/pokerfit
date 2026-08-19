export const LUCKY_COIN_CONFIG={
  id:"lucky_coin_collector",
  name:"LUCKY COIN COLLECTOR",
  rows:5,
  reels:5,
  mechanic:"COIN REVEAL + RAINBOW FREE SPINS",
  feature:"COIN_COLLECTOR",
  maxWin:10000,
  maxWinMultiplier:10000,
  targetRTP:.96,
  targetRtpMin:.957,
  targetRtpMax:.963,
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
  coinValueWeights:[
    {kind:"cash",multiplier:1,weight:850},
    {kind:"cash",multiplier:2,weight:90},
    {kind:"cash",multiplier:3,weight:20},
    {kind:"cash",multiplier:5,weight:7},
    {kind:"cash",multiplier:10,weight:2},
    {kind:"cash",multiplier:15,weight:1},
    {kind:"cash",multiplier:20,weight:.5},
    {kind:"cash",multiplier:25,weight:.2},
    {kind:"cash",multiplier:50,weight:.05},
    {kind:"cash",multiplier:100,weight:.01},
    {kind:"x2",multiplier:2,weight:20},
    {kind:"x5",multiplier:5,weight:2},
    {kind:"collector",multiplier:0,weight:7}
  ]
};

export function createLuckyCoinResult(bet,rng=secureRandom){
  bet=Math.max(1,Math.floor(Number(bet)||1));
  const capX=LUCKY_COIN_CONFIG.maxWinMultiplier;
  const grid=createGrid(LUCKY_COIN_CONFIG.symbolWeights,rng);
  const normal=evaluateBaseWins(grid,bet);
  const coinPositions=findPositions(grid,"coin");
  const rainbowPositions=findPositions(grid,"rainbow_scatter");
  const anticipation=pickAnticipation(grid);
  let usedX=Math.min(capX,normal.multiplier);
  let coinFeature=null;
  if(coinPositions.length>=LUCKY_COIN_CONFIG.coinTriggerCount&&usedX<capX){
    coinFeature=resolveCoinFeature(coinPositions,bet,rng,capX-usedX);
    usedX+=coinFeature.totalX;
  }
  let bonus=null;
  if(rainbowPositions.length>=LUCKY_COIN_CONFIG.rainbowTriggerCount&&usedX<capX){
    bonus=createRainbowBonus(rainbowPositions.length,bet,rng,capX-usedX);
    usedX+=bonus.totalX;
  }
  const payout=Math.min(bet*capX,Math.floor(bet*usedX));
  return {
    initialGrid:grid,
    finalGrid:bonus?.finalGrid||grid,
    normalWins:normal.wins,
    basePayout:Math.floor(bet*normal.multiplier),
    baseMultiplier:round4(normal.multiplier),
    coinPositions,
    coinCount:coinPositions.length,
    coinFeatureTriggered:!!coinFeature,
    coinFeature,
    rainbowPositions,
    rainbowCount:rainbowPositions.length,
    bonusTriggered:!!bonus,
    bonus,
    anticipationType:anticipation.type,
    anticipationReel:anticipation.reel,
    maxWinHit:usedX>=capX,
    payout,
    multiplier:round4(payout/bet)
  };
}

export function resolveCoinFeature(positions,bet,rng=secureRandom,maxTotalX=LUCKY_COIN_CONFIG.maxWinMultiplier){
  const active=(positions||[]).map((p,i)=>({key:`${p.r}:${p.c}`,r:p.r,c:p.c,index:i}));
  const used=new Set();
  let queued=[];
  let totalX=0;
  let collectorCycles=0;
  const layers=[];
  while(active.length-used.size>0&&totalX<maxTotalX){
    const layerIndex=layers.length;
    const usable=active.filter(p=>!used.has(p.key));
    const queuedNow=queued.filter(p=>!used.has(p.key));
    queued=[];
    let collectorPosition=queuedNow.shift()||null;
    queued.push(...queuedNow);
    const queuedKeys=new Set([collectorPosition,...queued].filter(Boolean).map(p=>p.key));
    const items=[];
    let cashSumX=0;
    let layerMultiplier=1;
    const newCollectors=[];
    const allowCollectors=collectorCycles<LUCKY_COIN_CONFIG.maxCollectorCycles;
    for(const p of usable){
      if(queuedKeys.has(p.key)){
        items.push({...p,kind:"collector",multiplier:0,status:p.key===collectorPosition?.key?"ACTIVE":"QUEUED"});
        continue;
      }
      const content=drawCoinContent(rng,{allowCollector:allowCollectors});
      const item={...p,...content,status:"REVEALED"};
      items.push(item);
      if(content.kind==="cash")cashSumX+=content.multiplier;
      else if(content.kind==="x2")layerMultiplier=Math.min(LUCKY_COIN_CONFIG.maxLayerMultiplier,layerMultiplier*2);
      else if(content.kind==="x5")layerMultiplier=Math.min(LUCKY_COIN_CONFIG.maxLayerMultiplier,layerMultiplier*5);
      else if(content.kind==="collector")newCollectors.push(p);
    }
    if(!collectorPosition&&newCollectors.length){collectorPosition=newCollectors.shift();const item=items.find(x=>x.key===collectorPosition.key);if(item)item.status="ACTIVE";}
    for(const p of newCollectors){queued.push(p);const item=items.find(x=>x.key===p.key);if(item)item.status="QUEUED";}
    const resolvedX=round4(cashSumX*layerMultiplier);
    const creditedX=round4(Math.max(0,Math.min(resolvedX,maxTotalX-totalX)));
    totalX=round4(totalX+creditedX);
    const hasCollector=!!collectorPosition&&collectorCycles<LUCKY_COIN_CONFIG.maxCollectorCycles;
    if(hasCollector){used.add(collectorPosition.key);collectorCycles++;}
    const layer={
      index:layerIndex,
      items,
      cashSumX:round4(cashSumX),
      layerMultiplier,
      resolvedX,
      creditedX,
      collector:collectorPosition?{...collectorPosition,cycle:collectorCycles}:null,
      queuedCollectors:queued.map(p=>({...p})),
      usedCollectors:[...used],
      refresh:hasCollector&&totalX<maxTotalX&&active.length-used.size>0
    };
    layers.push(layer);
    if(!layer.refresh)break;
  }
  const payout=Math.floor(bet*totalX);
  return {positions:active.map(p=>({r:p.r,c:p.c})),layers,totalX,payout,collectorCycles,maxCollectorCycles:LUCKY_COIN_CONFIG.maxCollectorCycles};
}

export function evaluateBaseWins(grid,bet=1){
  const wins=[];let multiplier=0;
  const wild=LUCKY_COIN_CONFIG.wild;
  for(let lineIndex=0;lineIndex<LUCKY_COIN_CONFIG.paylines.length;lineIndex++){
    const line=LUCKY_COIN_CONFIG.paylines[lineIndex];
    const sequence=line.map((r,c)=>grid[r]?.[c]);
    let target=sequence.find(s=>s!==wild)||wild;
    if(target==="coin"||target==="rainbow_scatter")continue;
    let count=0;
    for(const symbol of sequence){if(symbol===target||symbol===wild)count++;else break;}
    if(count<3)continue;
    const raw=LUCKY_COIN_CONFIG.basePaytable[target]?.[count]||0;
    const payMultiplier=round4(raw*LUCKY_COIN_CONFIG.basePayScale);
    if(payMultiplier<=0)continue;
    const positions=[];for(let c=0;c<count;c++)positions.push({r:line[c],c});
    multiplier+=payMultiplier;
    wins.push({line:lineIndex,symbol:target,count,payMultiplier,amount:Math.floor(Number(bet)*payMultiplier),positions});
  }
  return {wins,multiplier:round4(multiplier),payout:Math.floor(Number(bet)*multiplier)};
}

export function createRainbowBonus(scatterCount,bet,rng=secureRandom,maxTotalX=LUCKY_COIN_CONFIG.maxWinMultiplier){
  const awarded=freeSpinsFor(scatterCount);
  const sticky=new Map();
  const frames=[];
  let symbolX=0;
  let finalGrid=null;
  for(let spin=1;spin<=awarded&&sticky.size<25&&symbolX<maxTotalX;spin++){
    const grid=Array.from({length:5},()=>Array(5));
    const newSticky=[];
    for(let r=0;r<5;r++)for(let c=0;c<5;c++){
      const key=`${r}:${c}`;
      if(sticky.has(key)){grid[r][c]="coin";continue;}
      const symbol=weightedPick(LUCKY_COIN_CONFIG.bonusSymbolWeights,rng);
      grid[r][c]=symbol;
      if(symbol==="coin"){const p={r,c,landedSpin:spin};sticky.set(key,p);newSticky.push(p);}
    }
    const normal=evaluateBaseWins(grid,bet);
    const available=Math.max(0,maxTotalX-symbolX);
    const creditedX=round4(Math.min(normal.multiplier,available));
    symbolX=round4(symbolX+creditedX);
    finalGrid=grid;
    frames.push({spin,grid,normalWins:normal.wins,symbolWinX:creditedX,symbolPayout:Math.floor(bet*creditedX),newSticky,stickyCount:sticky.size,fullBoard:sticky.size===25});
  }
  const remaining=Math.max(0,maxTotalX-symbolX);
  const stickyPositions=[...sticky.values()].map(({r,c,landedSpin})=>({r,c,landedSpin}));
  const finalCoinFeature=stickyPositions.length?resolveCoinFeature(stickyPositions,bet,rng,remaining):null;
  const coinX=finalCoinFeature?.totalX||0;
  const totalX=round4(Math.min(maxTotalX,symbolX+coinX));
  return {
    scatterCount,
    awardedSpins:awarded,
    playedSpins:frames.length,
    frames,
    stickyPositions,
    stickyCount:stickyPositions.length,
    fullBoard:stickyPositions.length===25,
    symbolWinX:round4(symbolX),
    symbolPayout:Math.floor(bet*symbolX),
    finalCoinFeature,
    coinWinX:coinX,
    coinPayout:finalCoinFeature?.payout||0,
    totalX,
    payout:Math.floor(bet*totalX),
    finalGrid
  };
}

export function drawCoinContent(rng=secureRandom,{allowCollector=true}={}){
  const pool=allowCollector?LUCKY_COIN_CONFIG.coinValueWeights:LUCKY_COIN_CONFIG.coinValueWeights.filter(x=>x.kind!=="collector");
  const total=pool.reduce((a,x)=>a+x.weight,0);let n=rng()*total;
  for(const item of pool){n-=item.weight;if(n<0)return {kind:item.kind,multiplier:item.multiplier};}
  const last=pool[pool.length-1];return {kind:last.kind,multiplier:last.multiplier};
}

export function freeSpinsFor(count){if(count>=6)return LUCKY_COIN_CONFIG.freeSpinsByScatterCount[6];return LUCKY_COIN_CONFIG.freeSpinsByScatterCount[count]||0;}
export function createGrid(weights,rng=secureRandom){return Array.from({length:5},()=>Array.from({length:5},()=>weightedPick(weights,rng)));}
export function weightedPick(weights,rng=secureRandom){const entries=Object.entries(weights),total=entries.reduce((a,[,w])=>a+Number(w),0);let n=rng()*total;for(const [id,w] of entries){n-=Number(w);if(n<0)return id;}return entries[entries.length-1][0];}
export function findPositions(grid,symbol){const out=[];for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++)if(grid[r][c]===symbol)out.push({r,c});return out;}

function pickAnticipation(grid){
  let coins=0,rainbows=0;
  for(let c=0;c<5;c++){
    if(c>0&&rainbows>=2)return {type:"RAINBOW",reel:c};
    if(c>1&&coins>=2)return {type:"COIN",reel:c};
    for(let r=0;r<5;r++){if(grid[r][c]==="coin")coins++;if(grid[r][c]==="rainbow_scatter")rainbows++;}
  }
  return {type:null,reel:-1};
}
function secureRandom(){try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}catch{return Math.random();}}
function round4(v){return Math.round((Number(v)||0)*10000)/10000;}
