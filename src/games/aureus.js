export const AUREUS_CONFIG={
  id:"aureus",name:"AUREUS CASCADE",rows:5,reels:6,mechanic:"TUMBLE + FREE SPINS",feature:"TUMBLE_FREE_SPINS",maxWin:1000,
  symbols:["high_01","high_02","high_03","high_04","low_01","low_02","low_03","low_04","wild","scatter"],wild:"wild",scatter:"scatter",
  weights:{high_01:4,high_02:6,high_03:8,high_04:10,low_01:18,low_02:18,low_03:17,low_04:16,wild:2.2,scatter:1.35},
  bonusWeights:{high_01:4.5,high_02:6.5,high_03:8.5,high_04:10.5,low_01:17,low_02:17,low_03:16,low_04:15,wild:3.1,scatter:1.1},
  pay:{
    high_01:{3:.16,4:.38,5:1.05,6:2.8},high_02:{3:.12,4:.30,5:.82,6:2.15},high_03:{3:.09,4:.23,5:.62,6:1.55},high_04:{3:.075,4:.18,5:.48,6:1.2},
    low_01:{3:.045,4:.11,5:.28,6:.68},low_02:{3:.04,4:.095,5:.24,6:.58},low_03:{3:.035,4:.085,5:.21,6:.5},low_04:{3:.03,4:.075,5:.18,6:.43}
  },
  cascadeMultipliers:[1,2,3,5,10],bonusMultipliers:[2,3,5,10,20],freeSpins:8
};

export function createAureusResult(bet){
  bet=Math.max(1,Math.floor(Number(bet)||1));
  const initialGrid=makeGrid(false),scatterPositions=findSymbol(initialGrid,AUREUS_CONFIG.scatter),scatterCount=scatterPositions.length;
  const base=runCascades(initialGrid,bet,{steps:AUREUS_CONFIG.cascadeMultipliers,startIndex:0,bonus:false});
  const scatterPayout=scatterCount>=3?Math.floor(bet*scatterFactor(scatterCount)):0;
  const bonusTriggered=scatterCount>=4;
  const bonus=bonusTriggered?createFreeSpins(bet,AUREUS_CONFIG.freeSpins):null;
  const out={
    gameId:AUREUS_CONFIG.id,initialGrid,finalGrid:base.finalGrid,cascades:base.cascades,scatterPositions,scatterCount,scatterPayout,
    anticipationReel:findAnticipationReel(initialGrid),basePayout:base.payout+scatterPayout,bonusTriggered,bonusType:bonusTriggered?"AUREUS_FREE_SPINS":null,
    freeSpinsAwarded:bonus?.frames?.length||0,bonus,payout:base.payout+scatterPayout+Number(bonus?.payout||0)
  };
  return applyMaxWin(out,bet*AUREUS_CONFIG.maxWin);
}

export function createAureusBonusBuyResult(bet,tier="standard"){
  bet=Math.max(1,Math.floor(Number(bet)||1));
  const tierDef=tier==="super"?{spins:12}:tier==="premium"?{spins:10}:{spins:8};
  const initialGrid=makeGrid(false),forced=[[1,0],[3,1],[4,3],[5,4]];
  for(const [c,r] of forced)initialGrid[r][c]=AUREUS_CONFIG.scatter;
  const scatterPositions=findSymbol(initialGrid,AUREUS_CONFIG.scatter),bonus=createFreeSpins(bet,tierDef.spins);
  const out={gameId:AUREUS_CONFIG.id,initialGrid,finalGrid:cloneGrid(initialGrid),cascades:[],scatterPositions,scatterCount:scatterPositions.length,scatterPayout:0,anticipationReel:3,basePayout:0,bonusTriggered:true,bonusPurchased:true,bonusTier:tier,bonusType:"AUREUS_FREE_SPINS",freeSpinsAwarded:bonus.frames.length,bonus,payout:bonus.payout};
  return applyMaxWin(out,bet*AUREUS_CONFIG.maxWin);
}

function createFreeSpins(bet,initialSpins){
  const frames=[];let remaining=initialSpins,multiplierIndex=0,total=0,guard=0;
  while(remaining>0&&guard<14){
    remaining--;guard++;const grid=makeGrid(true),scatterPositions=findSymbol(grid,AUREUS_CONFIG.scatter),scatterCount=scatterPositions.length;
    const startMultiplier=AUREUS_CONFIG.bonusMultipliers[Math.min(multiplierIndex,AUREUS_CONFIG.bonusMultipliers.length-1)];
    const seq=runCascades(grid,bet,{steps:AUREUS_CONFIG.bonusMultipliers,startIndex:multiplierIndex,bonus:true});multiplierIndex=seq.endIndex;
    const retrigger=scatterCount>=3&&frames.length<12?2:0;remaining=Math.min(14-frames.length-1,remaining+retrigger);
    const scatterPayout=scatterCount>=3?Math.floor(bet*scatterFactor(scatterCount)):0,payout=seq.payout+scatterPayout;total+=payout;
    frames.push({spin:frames.length+1,initialGrid:grid,finalGrid:seq.finalGrid,cascades:seq.cascades,scatterPositions,scatterCount,scatterPayout,anticipationReel:findAnticipationReel(grid),startMultiplier,endMultiplier:AUREUS_CONFIG.bonusMultipliers[Math.min(seq.endIndex,AUREUS_CONFIG.bonusMultipliers.length-1)],retrigger,payout});
  }
  return {type:"FREE_SPINS",name:"GOLDEN ASCENSION",frames,payout:total,totalSpins:frames.length};
}

function runCascades(startGrid,bet,{steps,startIndex=0,bonus=false}){
  let current=cloneGrid(startGrid),index=startIndex,payout=0;const cascades=[];
  for(let tumble=0;tumble<8;tumble++){
    const multiplier=steps[Math.min(index,steps.length-1)],evaluation=evaluateWays(current,bet,multiplier);
    if(!evaluation.wins.length)break;
    const removed=uniquePositions(evaluation.wins.flatMap(w=>w.positions)),collapsed=collapseAndRefill(current,removed,bonus),cascadePayout=evaluation.wins.reduce((s,w)=>s+w.amount,0);
    payout+=cascadePayout;cascades.push({index:tumble+1,multiplier,wins:evaluation.wins,removed,drops:collapsed.drops,nextGrid:collapsed.grid,payout:cascadePayout});current=collapsed.grid;index++;
  }
  return {cascades,finalGrid:current,payout,endIndex:index};
}

function evaluateWays(grid,bet,multiplier){
  const wins=[];
  for(const [symbol,table] of Object.entries(AUREUS_CONFIG.pay)){
    const perReel=[];let reelCount=0;
    for(let c=0;c<AUREUS_CONFIG.reels;c++){
      const positions=[];for(let r=0;r<AUREUS_CONFIG.rows;r++){const cell=grid[r][c];if(cell===symbol||cell===AUREUS_CONFIG.wild)positions.push({r,c});}
      if(!positions.length)break;perReel.push(positions);reelCount++;
    }
    if(reelCount<3)continue;
    const ways=perReel.reduce((n,a)=>n*a.length,1),factor=Number(table[reelCount]||0);if(!factor)continue;
    const amount=Math.max(1,Math.floor(bet*factor*ways*multiplier/20));wins.push({symbol,reels:reelCount,ways,multiplier,factor,amount,positions:uniquePositions(perReel.flat())});
  }
  return {wins,payout:wins.reduce((s,w)=>s+w.amount,0)};
}

function collapseAndRefill(grid,removed,bonus){
  const removeSet=new Set(removed.map(p=>`${p.r}:${p.c}`)),next=Array.from({length:AUREUS_CONFIG.rows},()=>Array(AUREUS_CONFIG.reels)),drops=[];
  for(let c=0;c<AUREUS_CONFIG.reels;c++){
    const survivors=[];for(let r=AUREUS_CONFIG.rows-1;r>=0;r--)if(!removeSet.has(`${r}:${c}`))survivors.push({r,symbol:grid[r][c]});
    let target=AUREUS_CONFIG.rows-1;for(const item of survivors){next[target][c]=item.symbol;drops.push({from:{r:item.r,c},to:{r:target,c},symbol:item.symbol,new:false});target--;}
    for(let r=target;r>=0;r--){const symbol=pickSymbol(bonus);next[r][c]=symbol;drops.push({from:null,to:{r,c},symbol,new:true});}
  }
  return {grid:next,drops};
}

function makeGrid(bonus){return Array.from({length:AUREUS_CONFIG.rows},()=>Array.from({length:AUREUS_CONFIG.reels},()=>pickSymbol(bonus)));}
function pickSymbol(bonus){const weights=bonus?AUREUS_CONFIG.bonusWeights:AUREUS_CONFIG.weights,values=Object.keys(weights),ints=values.map(k=>Math.max(1,Math.round(weights[k]*100))),total=ints.reduce((a,b)=>a+b,0);let roll=secureInt(total);for(let i=0;i<values.length;i++){roll-=ints[i];if(roll<0)return values[i];}return values.at(-1);}
function findSymbol(grid,symbol){const out=[];for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++)if(grid[r][c]===symbol)out.push({r,c});return out;}
function findAnticipationReel(grid){let seen=0;for(let c=0;c<AUREUS_CONFIG.reels;c++){if(c>0&&seen>=2)return c;for(let r=0;r<AUREUS_CONFIG.rows;r++)if(grid[r][c]===AUREUS_CONFIG.scatter)seen++;}return -1;}
function scatterFactor(n){return n>=6?25:n===5?10:n===4?4:n===3?1.5:0;}
function uniquePositions(list){const map=new Map();for(const p of list)map.set(`${p.r}:${p.c}`,{r:p.r,c:p.c});return [...map.values()];}
function cloneGrid(g){return g.map(r=>[...r]);}
function secureInt(max){max=Math.max(1,Math.floor(max));const ceiling=0x100000000,limit=ceiling-(ceiling%max),a=new Uint32Array(1);do crypto.getRandomValues(a);while(a[0]>=limit);return a[0]%max;}
function applyMaxWin(out,cap){
  const raw=Math.max(0,Number(out.payout||0));if(raw<=cap)return out;const ratio=cap/raw;scaleCascades(out.cascades,ratio);out.scatterPayout=Math.floor(Number(out.scatterPayout||0)*ratio);out.basePayout=Math.floor(Number(out.basePayout||0)*ratio);
  if(out.bonus){for(const frame of out.bonus.frames){scaleCascades(frame.cascades,ratio);frame.scatterPayout=Math.floor(Number(frame.scatterPayout||0)*ratio);frame.payout=Math.floor(Number(frame.payout||0)*ratio);}out.bonus.payout=out.bonus.frames.reduce((s,f)=>s+f.payout,0);}
  let total=out.basePayout+Number(out.bonus?.payout||0),delta=cap-total;if(delta!==0){if(out.bonus?.frames?.length){const f=out.bonus.frames.at(-1);f.payout=Math.max(0,f.payout+delta);out.bonus.payout+=delta;}else out.basePayout=Math.max(0,out.basePayout+delta);}out.payout=cap;out.maxWinReached=true;return out;
}
function scaleCascades(cascades,ratio){for(const c of cascades||[]){for(const w of c.wins||[])w.amount=Math.floor(Number(w.amount||0)*ratio);c.payout=(c.wins||[]).reduce((s,w)=>s+w.amount,0);}}
