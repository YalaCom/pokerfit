export const OLYMPUS_STORM_CONFIG={
  id:"olympus_storm",name:"OLYMPUS STORM",rows:5,reels:6,mechanic:"3+ STRAIGHT LINES + OLYMPUS REELS + STICKY BONUS",feature:"STORM_FREE_SPINS",maxWin:5000,maxWinMultiplier:5000,volatility:"HIGH",
  symbols:["crown","hourglass","ring","goblet","gem_red","gem_purple","gem_yellow","gem_green","gem_blue","scatter","orb"],scatter:"scatter",olympusSymbol:"orb",
  weights:{crown:44,hourglass:54,ring:64,goblet:74,gem_red:104,gem_purple:116,gem_yellow:130,gem_green:145,gem_blue:158,scatter:15},
  bonusWeights:{crown:43,hourglass:52,ring:61,goblet:71,gem_red:101,gem_purple:113,gem_yellow:126,gem_green:140,gem_blue:152,scatter:11},
  paytable:{
    crown:{3:1.2,4:3,5:7.5,6:20},hourglass:{3:.9,4:2.2,5:5.5,6:15},ring:{3:.7,4:1.8,5:4.5,6:12},goblet:{3:.6,4:1.5,5:3.8,6:10},
    gem_red:{3:.5,4:1.25,5:3,6:8},gem_purple:{3:.45,4:1.1,5:2.6,6:7},gem_yellow:{3:.4,4:1,5:2.3,6:6},gem_green:{3:.35,4:.9,5:2,6:5.5},gem_blue:{3:.3,4:.8,5:1.8,6:5}
  },
  linePayoutScale:1.25,
  multiplierValues:[2,5,10,500],multiplierWeights:[800,150,49,1],
  olympusChanceBase:.004,olympusChanceBonus:.012,freeSpins:15,retriggerSpins:5,bonusBuyCost:100,bonusBuyBoost:1.18
};
const REGULAR=Object.keys(OLYMPUS_STORM_CONFIG.paytable);
const LINE_DIRECTIONS=[
  {id:"H",dr:0,dc:1},
  {id:"V",dr:1,dc:0},
  {id:"D_DOWN",dr:1,dc:1},
  {id:"D_UP",dr:1,dc:-1}
];

export function createOlympusStormResult(bet,rng=secureRandom){
  bet=cleanBet(bet);const cap=bet*OLYMPUS_STORM_CONFIG.maxWinMultiplier,state=createState(false,rng),plainGrid=gridOf(state),olympusReels=rollOlympusReels(false,rng,[]),initialGrid=gridWithOlympus(state,olympusReels),evaluation=evaluateOlympusLines(plainGrid,bet,olympusReels,cap);
  const scatterPositions=findVisiblePositions(state,"scatter",olympusReels),scatterCount=scatterPositions.length,scatterPayout=Math.min(Math.max(0,cap-evaluation.payout),Math.floor(bet*scatterFactor(scatterCount))),basePayout=Math.min(cap,evaluation.payout+scatterPayout),bonusTriggered=scatterCount>=4&&basePayout<cap,bonus=bonusTriggered?createFreeSpins(bet,rng,Math.max(0,cap-basePayout)):null,payout=Math.min(cap,basePayout+Number(bonus?.payout||0));
  return {gameId:OLYMPUS_STORM_CONFIG.id,initialGrid,plainGrid,olympusReels,wins:evaluation.wins,linePayout:evaluation.payout,waysPayout:evaluation.payout,finalGrid:plainGrid,scatterPositions,scatterCount,scatterPayout,anticipationReel:findAnticipationReel(initialGrid),basePayout,bonusTriggered,bonusType:bonusTriggered?"STORM_FREE_SPINS":null,freeSpinsAwarded:bonus?.frames?.length||0,bonus,payout,multiplier:round4(payout/bet),maxWinHit:payout>=cap};
}

export function createOlympusStormBonusBuyResult(bet,rng=secureRandom){
  bet=cleanBet(bet);const cap=bet*OLYMPUS_STORM_CONFIG.maxWinMultiplier,state=createState(false,rng),forced=[[0,0],[1,2],[3,1],[5,4]];for(const [c,r] of forced)state[r][c]={symbol:"scatter"};
  const initialGrid=gridOf(state),scatterPositions=findPositions(initialGrid,"scatter"),featureBet=Math.max(1,Math.floor(bet*OLYMPUS_STORM_CONFIG.bonusBuyBoost)),bonus=createFreeSpins(featureBet,rng,cap),payout=Math.min(cap,bonus.payout);
  return {gameId:OLYMPUS_STORM_CONFIG.id,initialGrid,plainGrid:initialGrid,olympusReels:[],wins:[],linePayout:0,waysPayout:0,finalGrid:bonus.finalGrid||initialGrid,scatterPositions,scatterCount:scatterPositions.length,scatterPayout:0,anticipationReel:3,basePayout:0,bonusTriggered:true,bonusPurchased:true,bonusType:"STORM_FREE_SPINS",freeSpinsAwarded:bonus.frames.length,bonus,payout,multiplier:round4(payout/bet),maxWinHit:payout>=cap};
}

export function createFreeSpins(bet,rng=secureRandom,maxPayout=Number.MAX_SAFE_INTEGER){
  const frames=[];let remaining=OLYMPUS_STORM_CONFIG.freeSpins,total=0,guard=0,stickyOlympus=[],finalGrid=null;
  while(remaining>0&&guard<40&&total<maxPayout){
    remaining--;guard++;const state=createState(true,rng),plainGrid=gridOf(state),stickyBefore=stickyOlympus.map(x=>({...x})),newOlympus=rollOlympusReels(true,rng,stickyBefore),activeOlympus=mergeOlympusReels(stickyBefore,newOlympus),initialGrid=gridWithOlympus(state,activeOlympus),room=Math.max(0,maxPayout-total),evaluation=evaluateOlympusLines(plainGrid,bet,activeOlympus,room),scatterPositions=findVisiblePositions(state,"scatter",activeOlympus),scatterCount=scatterPositions.length,scatterPayout=Math.min(Math.max(0,room-evaluation.payout),Math.floor(bet*scatterFactor(scatterCount))),payout=Math.min(room,evaluation.payout+scatterPayout);
    stickyOlympus=activeOlympus;let retrigger=scatterCount>=3?OLYMPUS_STORM_CONFIG.retriggerSpins:0;if(retrigger){const frameRoom=Math.max(0,40-(frames.length+1)-remaining);retrigger=Math.min(retrigger,frameRoom);remaining+=retrigger;}total+=payout;finalGrid=initialGrid;
    frames.push({spin:frames.length+1,initialGrid,plainGrid,stickyBefore,newOlympus,activeOlympus,wins:evaluation.wins,linePayout:evaluation.payout,waysPayout:evaluation.payout,scatterPositions,scatterCount,scatterPayout,anticipationReel:findAnticipationReel(initialGrid),startMultiplier:sumOlympus(stickyBefore),endMultiplier:sumOlympus(activeOlympus),retrigger,payout});
  }
  return {type:"FREE_SPINS",name:"STORM ASCENSION",frames,payout:Math.floor(total),totalSpins:frames.length,finalMultiplier:sumOlympus(stickyOlympus),finalGrid,stickyOlympus};
}

export function evaluateOlympusLines(grid,bet=1,olympusReels=[],maxPayout=Number.MAX_SAFE_INTEGER){
  bet=cleanBet(bet);const active=normalizeOlympus(olympusReels),byCol=new Map(active.map(x=>[x.c,x])),wins=[];let paid=0;
  if(active.length===OLYMPUS_STORM_CONFIG.reels){
    const positions=[];for(let c=0;c<OLYMPUS_STORM_CONFIG.reels;c++)for(let r=0;r<OLYMPUS_STORM_CONFIG.rows;r++)positions.push({r,c});
    const amount=Math.min(maxPayout,bet*OLYMPUS_STORM_CONFIG.maxWinMultiplier);
    return {wins:[{symbol:"olympus",direction:"FULL",length:6,factor:5000,baseAmount:amount,amount,positions,naturalPositions:[],usesOlympus:true,olympusReels:active,multiplier:sumOlympus(active),fullOlympus:true}],payout:amount};
  }

  for(const symbol of REGULAR){
    for(const direction of LINE_DIRECTIONS){
      for(let r=0;r<OLYMPUS_STORM_CONFIG.rows;r++)for(let c=0;c<OLYMPUS_STORM_CONFIG.reels;c++){
        if(!cellMatches(grid,r,c,symbol,byCol))continue;
        const prevR=r-direction.dr,prevC=c-direction.dc;
        if(inBounds(prevR,prevC)&&cellMatches(grid,prevR,prevC,symbol,byCol))continue;

        const positions=[];let rr=r,cc=c;
        while(inBounds(rr,cc)&&cellMatches(grid,rr,cc,symbol,byCol)){
          positions.push({r:rr,c:cc});rr+=direction.dr;cc+=direction.dc;
        }
        if(positions.length<3)continue;

        const naturalPositions=positions.filter(p=>!byCol.has(p.c)&&grid[p.r]?.[p.c]===symbol);
        if(!naturalPositions.length)continue;

        const usedColumns=new Set(positions.filter(p=>byCol.has(p.c)).map(p=>p.c));
        const usedOlympus=active.filter(x=>usedColumns.has(x.c));
        const usesOlympus=usedOlympus.length>0;
        const length=Math.min(6,positions.length),factor=OLYMPUS_STORM_CONFIG.paytable[symbol][length];
        if(!factor)continue;
        const baseAmount=Math.max(1,Math.floor(bet*factor*OLYMPUS_STORM_CONFIG.linePayoutScale));
        const multiplier=usesOlympus?sumOlympus(usedOlympus):1;
        const calculated=Math.max(1,Math.floor(baseAmount*multiplier)),room=Math.max(0,maxPayout-paid),amount=Math.min(room,calculated);
        if(amount<=0)return {wins,payout:Math.floor(paid)};
        paid+=amount;
        wins.push({symbol,direction:direction.id,length:positions.length,factor,baseAmount,amount,positions,naturalPositions,usesOlympus,olympusReels:usedOlympus,multiplier,start:positions[0],end:positions.at(-1)});
      }
    }
  }
  return {wins,payout:Math.floor(paid)};
}

// Backward-compatible export for existing imports/tests while the engine now uses straight-line evaluation.
export function evaluateOlympusWays(grid,bet=1,olympusReels=[],maxPayout=Number.MAX_SAFE_INTEGER){return evaluateOlympusLines(grid,bet,olympusReels,maxPayout);}

export function createState(bonus=false,rng=secureRandom){
  const weights=bonus?OLYMPUS_STORM_CONFIG.bonusWeights:OLYMPUS_STORM_CONFIG.weights;
  return Array.from({length:OLYMPUS_STORM_CONFIG.rows},()=>Array.from({length:OLYMPUS_STORM_CONFIG.reels},()=>({symbol:weightedPick(weights,rng)})));
}
export function rollOlympusReels(bonus=false,rng=secureRandom,locked=[]){
  const taken=new Set((locked||[]).map(x=>Number(x.c))),chance=bonus?OLYMPUS_STORM_CONFIG.olympusChanceBonus:OLYMPUS_STORM_CONFIG.olympusChanceBase,out=[];
  for(let c=0;c<OLYMPUS_STORM_CONFIG.reels;c++){if(taken.has(c))continue;if(rng()<chance)out.push({c,value:weightedMultiplier(rng)});}return out;
}
export function mergeOlympusReels(a,b){return normalizeOlympus([...(a||[]),...(b||[])]);}

function cellMatches(grid,r,c,symbol,byCol){return inBounds(r,c)&&(byCol.has(c)||grid[r]?.[c]===symbol);}
function inBounds(r,c){return r>=0&&r<OLYMPUS_STORM_CONFIG.rows&&c>=0&&c<OLYMPUS_STORM_CONFIG.reels;}
function weightedMultiplier(rng){const vals=OLYMPUS_STORM_CONFIG.multiplierValues,w=OLYMPUS_STORM_CONFIG.multiplierWeights,total=w.reduce((a,b)=>a+b,0);let n=rng()*total;for(let i=0;i<vals.length;i++){n-=w[i];if(n<0)return vals[i];}return vals.at(-1);}
function weightedPick(weights,rng){const entries=Object.entries(weights),total=entries.reduce((a,[,w])=>a+Number(w),0);let n=rng()*total;for(const [id,w] of entries){n-=Number(w);if(n<0)return id;}return entries.at(-1)[0];}
function normalizeOlympus(list=[]){const map=new Map();for(const x of list||[]){const c=Math.floor(Number(x?.c));if(c>=0&&c<OLYMPUS_STORM_CONFIG.reels&&!map.has(c))map.set(c,{c,value:allowedMultiplier(x?.value)});}return [...map.values()].sort((a,b)=>a.c-b.c);}
function allowedMultiplier(value){const n=Math.floor(Number(value)||2);return OLYMPUS_STORM_CONFIG.multiplierValues.includes(n)?n:2;}
function sumOlympus(list){return normalizeOlympus(list).reduce((s,x)=>s+x.value,0);}
function gridWithOlympus(state,list=[]){const grid=gridOf(state);for(const x of normalizeOlympus(list))for(let r=0;r<OLYMPUS_STORM_CONFIG.rows;r++)grid[r][x.c]=OLYMPUS_STORM_CONFIG.olympusSymbol;return grid;}
function gridOf(state){return state.map(row=>row.map(cell=>cell.symbol));}
function findVisiblePositions(state,symbol,olympusReels=[]){const locked=new Set(normalizeOlympus(olympusReels).map(x=>x.c)),out=[];for(let r=0;r<state.length;r++)for(let c=0;c<state[r].length;c++)if(!locked.has(c)&&state[r][c].symbol===symbol)out.push({r,c});return out;}
function findPositions(grid,symbol){const out=[];for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++)if(grid[r][c]===symbol)out.push({r,c});return out;}
function findAnticipationReel(grid){let seen=0;for(let c=0;c<OLYMPUS_STORM_CONFIG.reels;c++){if(c>0&&seen>=3)return c;for(let r=0;r<OLYMPUS_STORM_CONFIG.rows;r++)if(grid[r][c]==="scatter")seen++;}return -1;}
function scatterFactor(n){return n>=6?100:n===5?5:n===4?3:0;}
function cleanBet(v){return Math.max(1,Math.floor(Number(v)||1));}
function secureRandom(){try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]/4294967296;}catch{return Math.random();}}
function round4(v){return Math.round((Number(v)||0)*10000)/10000;}
