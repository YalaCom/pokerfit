export const SWEET_BURST_CONFIG={
  id:"sweet_bonanza",name:"SWEET BONANZA",rows:5,reels:6,
  mechanic:"TUMBLE + PAY ANYWHERE 8+ + CANDY BOMB FREE SPINS",feature:"SWEET_FREE_SPINS",
  maxWin:21175,maxWinMultiplier:21175,volatility:"HIGH",
  regularSymbols:["red_heart","purple_candy","green_candy","blue_candy","apple","plum","watermelon","grapes","banana"],
  symbols:["red_heart","purple_candy","green_candy","blue_candy","apple","plum","watermelon","grapes","banana","lollipop","bomb_2","bomb_3","bomb_5","bomb_10","bomb_25","bomb_50","bomb_100"],
  scatter:"lollipop",
  bombValues:{bomb_2:2,bomb_3:3,bomb_5:5,bomb_10:10,bomb_25:25,bomb_50:50,bomb_100:100},
  baseWeights:{red_heart:4.5,purple_candy:5.5,green_candy:6.5,blue_candy:7.5,apple:9,plum:11,watermelon:15.5,grapes:21,banana:29,lollipop:1.9},
  bonusWeights:{red_heart:4.5,purple_candy:5.5,green_candy:6.5,blue_candy:7.5,apple:9,plum:11,watermelon:15.5,grapes:21,banana:29,lollipop:1.3},
  bombWeights:{bomb_2:420,bomb_3:250,bomb_5:170,bomb_10:95,bomb_25:42,bomb_50:18,bomb_100:5},
  bombCellChance:.046,
  paytable:{
    red_heart:{8:10,10:25,12:50},purple_candy:{8:2.5,10:10,12:25},green_candy:{8:2,10:5,12:15},blue_candy:{8:1.5,10:2,12:12},
    apple:{8:1,10:1.5,12:10},plum:{8:.8,10:1.2,12:8},watermelon:{8:.5,10:1,12:5},grapes:{8:.4,10:.9,12:4},banana:{8:.25,10:.75,12:2}
  },
  scatterPay:{4:3,5:5,6:100},
  freeSpins:10,retriggerSpins:5,bonusBuyCost:100,bonusBuyBoost:1.31
};

const REGULAR=SWEET_BURST_CONFIG.regularSymbols;

export function createSweetBurstResult(bet,rng=secureRandom){
  bet=cleanBet(bet);const cap=bet*SWEET_BURST_CONFIG.maxWinMultiplier;
  const initialGrid=makeGrid(false,rng);
  const tumble=runTumbles(initialGrid,bet,{bonus:false,rng,maxPayout:cap});
  const scatterCount=countSymbol(tumble.finalGrid,SWEET_BURST_CONFIG.scatter),scatterPositions=findPositions(tumble.finalGrid,SWEET_BURST_CONFIG.scatter);
  const scatterPayout=Math.min(Math.max(0,cap-tumble.payout),Math.floor(bet*scatterFactor(scatterCount)));
  const basePayout=Math.min(cap,scatterPayout+tumble.payout),bonusTriggered=scatterCount>=4&&basePayout<cap;
  const bonus=bonusTriggered?createSweetFreeSpins(bet,rng,Math.max(0,cap-basePayout)):null;
  const payout=Math.min(cap,basePayout+Number(bonus?.payout||0));
  return {gameId:SWEET_BURST_CONFIG.id,initialGrid,finalGrid:tumble.finalGrid,cascades:tumble.cascades,scatterPositions,scatterCount,scatterPayout,
    anticipationReel:findAnticipationReel(initialGrid),basePayout,bonusTriggered,bonusType:bonusTriggered?"SWEET_FREE_SPINS":null,
    freeSpinsAwarded:bonusTriggered?SWEET_BURST_CONFIG.freeSpins:0,bonus,payout,multiplier:round4(payout/bet),maxWinHit:payout>=cap};
}

export function createSweetBurstBonusBuyResult(bet,rng=secureRandom){
  bet=cleanBet(bet);const cap=bet*SWEET_BURST_CONFIG.maxWinMultiplier,initialGrid=makeGrid(false,rng);
  forceScatters(initialGrid,4,rng);
  const scatterPositions=findPositions(initialGrid,SWEET_BURST_CONFIG.scatter),featureBet=Math.max(1,Math.floor(bet*SWEET_BURST_CONFIG.bonusBuyBoost)),bonus=createSweetFreeSpins(featureBet,rng,cap),payout=Math.min(cap,bonus.payout);
  return {gameId:SWEET_BURST_CONFIG.id,initialGrid,finalGrid:initialGrid.map(r=>r.slice()),cascades:[],scatterPositions,scatterCount:scatterPositions.length,
    scatterPayout:0,anticipationReel:3,basePayout:0,bonusTriggered:true,bonusPurchased:true,bonusType:"SWEET_FREE_SPINS",
    freeSpinsAwarded:SWEET_BURST_CONFIG.freeSpins,bonus,payout,multiplier:round4(payout/bet),maxWinHit:payout>=cap};
}

export function createSweetFreeSpins(bet,rng=secureRandom,maxPayout=Number.MAX_SAFE_INTEGER){
  bet=cleanBet(bet);const frames=[];let remaining=SWEET_BURST_CONFIG.freeSpins,total=0,guard=0,finalGrid=null;
  while(remaining>0&&guard<60&&total<maxPayout){
    remaining--;guard++;
    const initialGrid=makeGrid(true,rng),room=Math.max(0,maxPayout-total);
    const tumble=runTumbles(initialGrid,bet,{bonus:true,rng,maxPayout:room});
    const scatterCount=countSymbol(tumble.finalGrid,SWEET_BURST_CONFIG.scatter),scatterPositions=findPositions(tumble.finalGrid,SWEET_BURST_CONFIG.scatter);
    const scatterPayout=Math.min(Math.max(0,room-tumble.payout),Math.floor(bet*scatterFactor(scatterCount)));
    let retrigger=scatterCount>=3?SWEET_BURST_CONFIG.retriggerSpins:0;
    if(retrigger){const maxAdd=Math.max(0,60-(frames.length+1)-remaining);retrigger=Math.min(retrigger,maxAdd);remaining+=retrigger;}
    const payout=Math.min(room,scatterPayout+tumble.payout);total+=payout;finalGrid=tumble.finalGrid;
    frames.push({spin:frames.length+1,initialGrid,finalGrid:tumble.finalGrid,cascades:tumble.cascades,scatterPositions,scatterCount,scatterPayout,
      anticipationReel:findAnticipationReel(initialGrid),tumbleWin:tumble.rawPayout,bombMultiplier:tumble.bombMultiplier,bombPositions:tumble.bombPositions,
      retrigger,payout,totalWinAfter:total});
  }
  return {type:"SWEET_FREE_SPINS",name:"SUGAR RUSH FREE SPINS",initialSpins:SWEET_BURST_CONFIG.freeSpins,frames,payout:Math.floor(total),totalSpins:frames.length,finalGrid};
}

export function runTumbles(startGrid,bet,{bonus=false,rng=secureRandom,maxPayout=Number.MAX_SAFE_INTEGER}={}){
  let current=cloneGrid(startGrid),rawPayout=0;const cascades=[];let guard=0;
  while(guard<30){
    guard++;const evaluation=evaluateSweetAnywhere(current,bet,Math.max(0,maxPayout-rawPayout));
    if(!evaluation.wins.length)break;
    rawPayout+=evaluation.payout;
    const removed=uniquePositions(evaluation.wins.flatMap(w=>w.positions));
    const collapsed=collapseAndRefill(current,removed,bonus,rng);
    cascades.push({index:cascades.length+1,wins:evaluation.wins,removed,drops:collapsed.drops,nextGrid:collapsed.grid,payout:evaluation.payout,
      bombsAfter:findBombs(collapsed.grid)});
    current=collapsed.grid;
    if(rawPayout>=maxPayout)break;
  }
  const bombPositions=bonus?findBombs(current):[],bombMultiplier=bonus&&rawPayout>0?bombPositions.reduce((s,b)=>s+b.value,0):0;
  const finalRaw=bonus&&bombMultiplier>0?rawPayout*bombMultiplier:rawPayout,payout=Math.min(maxPayout,Math.floor(finalRaw));
  if(payout<finalRaw&&rawPayout>0){const ratio=payout/finalRaw;for(const c of cascades)for(const w of c.wins||[])w.displayAmount=Math.floor(Number(w.amount||0)*(bonus&&bombMultiplier>0?bombMultiplier:1)*ratio);}
  else for(const c of cascades)for(const w of c.wins||[])w.displayAmount=Math.floor(Number(w.amount||0)*(bonus&&bombMultiplier>0?bombMultiplier:1));
  return {cascades,finalGrid:current,rawPayout:Math.floor(rawPayout),bombMultiplier,bombPositions,payout};
}

export function evaluateSweetAnywhere(grid,bet=1,maxPayout=Number.MAX_SAFE_INTEGER){
  bet=cleanBet(bet);const wins=[];let paid=0;
  for(const symbol of REGULAR){
    const positions=findPositions(grid,symbol),count=positions.length;if(count<8)continue;
    const factor=payFactor(symbol,count);if(!factor)continue;
    const amount=Math.min(Math.max(0,maxPayout-paid),Math.max(1,Math.floor(bet*factor)));if(amount<=0)break;
    paid+=amount;wins.push({symbol,count,factor,amount,positions});
  }
  return {wins,payout:Math.floor(paid)};
}

function payFactor(symbol,count){const t=SWEET_BURST_CONFIG.paytable[symbol];return count>=12?t[12]:count>=10?t[10]:count>=8?t[8]:0;}
function scatterFactor(n){return n>=6?100:n===5?5:n===4?3:0;}

function makeGrid(bonus,rng){
  const rows=SWEET_BURST_CONFIG.rows,reels=SWEET_BURST_CONFIG.reels,grid=Array.from({length:rows},()=>Array(reels));
  for(let c=0;c<reels;c++){
    let scatterUsed=false;
    for(let r=0;r<rows;r++){
      if(bonus&&rng()<SWEET_BURST_CONFIG.bombCellChance){grid[r][c]=weightedPick(SWEET_BURST_CONFIG.bombWeights,rng);continue;}
      let symbol=weightedPick(bonus?SWEET_BURST_CONFIG.bonusWeights:SWEET_BURST_CONFIG.baseWeights,rng);
      if(symbol===SWEET_BURST_CONFIG.scatter&&scatterUsed)symbol=weightedPick(withoutScatter(bonus?SWEET_BURST_CONFIG.bonusWeights:SWEET_BURST_CONFIG.baseWeights),rng);
      if(symbol===SWEET_BURST_CONFIG.scatter)scatterUsed=true;grid[r][c]=symbol;
    }
  }
  return grid;
}

function collapseAndRefill(grid,removed,bonus,rng){
  const removeSet=new Set(removed.map(p=>`${p.r}:${p.c}`)),next=Array.from({length:SWEET_BURST_CONFIG.rows},()=>Array(SWEET_BURST_CONFIG.reels)),drops=[];
  for(let c=0;c<SWEET_BURST_CONFIG.reels;c++){
    const survivors=[];for(let r=SWEET_BURST_CONFIG.rows-1;r>=0;r--)if(!removeSet.has(`${r}:${c}`))survivors.push({r,symbol:grid[r][c]});
    let target=SWEET_BURST_CONFIG.rows-1;let scatterUsed=survivors.some(x=>x.symbol===SWEET_BURST_CONFIG.scatter);
    for(const item of survivors){next[target][c]=item.symbol;drops.push({from:{r:item.r,c},to:{r:target,c},symbol:item.symbol,new:false});target--;}
    for(let r=target;r>=0;r--){
      let symbol;
      if(bonus&&rng()<SWEET_BURST_CONFIG.bombCellChance)symbol=weightedPick(SWEET_BURST_CONFIG.bombWeights,rng);
      else {symbol=weightedPick(bonus?SWEET_BURST_CONFIG.bonusWeights:SWEET_BURST_CONFIG.baseWeights,rng);
        if(symbol===SWEET_BURST_CONFIG.scatter&&scatterUsed)symbol=weightedPick(withoutScatter(bonus?SWEET_BURST_CONFIG.bonusWeights:SWEET_BURST_CONFIG.baseWeights),rng);
      }
      if(symbol===SWEET_BURST_CONFIG.scatter)scatterUsed=true;
      next[r][c]=symbol;drops.push({from:null,to:{r,c},symbol,new:true});
    }
  }
  return {grid:next,drops};
}

function forceScatters(grid,count,rng){
  const cols=[0,1,2,3,4,5];shuffle(cols,rng);for(let i=0;i<Math.min(count,6);i++){const c=cols[i],r=Math.floor(rng()*SWEET_BURST_CONFIG.rows);for(let rr=0;rr<SWEET_BURST_CONFIG.rows;rr++)if(grid[rr][c]===SWEET_BURST_CONFIG.scatter)grid[rr][c]="banana";grid[r][c]=SWEET_BURST_CONFIG.scatter;}
}
function findBombs(grid){const out=[];for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++){const value=SWEET_BURST_CONFIG.bombValues[grid[r][c]];if(value)out.push({r,c,symbol:grid[r][c],value});}return out;}
function findPositions(grid,symbol){const out=[];for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++)if(grid[r][c]===symbol)out.push({r,c});return out;}
function countSymbol(grid,symbol){return findPositions(grid,symbol).length;}
function findAnticipationReel(grid){let seen=0;for(let c=0;c<SWEET_BURST_CONFIG.reels;c++){if(c>0&&seen>=3)return c;for(let r=0;r<SWEET_BURST_CONFIG.rows;r++)if(grid[r][c]===SWEET_BURST_CONFIG.scatter)seen++;}return -1;}
function withoutScatter(weights){const out={...weights};delete out[SWEET_BURST_CONFIG.scatter];return out;}
function weightedPick(weights,rng){const entries=Object.entries(weights),total=entries.reduce((s,[,w])=>s+Number(w),0);let roll=rng()*total;for(const [id,w] of entries){roll-=Number(w);if(roll<0)return id;}return entries.at(-1)[0];}
function uniquePositions(list){const m=new Map();for(const p of list||[])m.set(`${p.r}:${p.c}`,{r:p.r,c:p.c});return [...m.values()];}
function cloneGrid(g){return g.map(r=>r.slice());}
function shuffle(a,rng){for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function cleanBet(v){return Math.max(1,Math.floor(Number(v)||1));}
function secureRandom(){try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}catch{return Math.random();}}
function round4(v){return Math.round((Number(v)||0)*10000)/10000;}
