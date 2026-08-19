export const HONEY_FRUITS_CONFIG={
  id:"honey_fruits",name:"HONEY FRUITS",rows:10,reels:18,mechanic:"WAYS + GIANT BEE",feature:"HONEY_BEE_BONUS",maxWin:1000,
  symbols:["apple","orange","lemon","grapes","watermelon","cherry","strawberry","honey","wild","bee_scatter"],wild:"wild",scatter:"bee_scatter",
  initialBonusSpins:6,growthExtraSpins:2,maxLevelBeeExtraSpins:1,
  beeSizes:[[2,2],[3,3],[4,4],[5,5],[6,5]],growthRequirements:[1,2,3,4],
  baseWeights:{apple:18,orange:17,lemon:17,grapes:15,watermelon:14,cherry:16,strawberry:14,honey:7,wild:1.25,bee_scatter:.32},
  bonusWeights:{apple:18,orange:17,lemon:17,grapes:15,watermelon:14,cherry:16,strawberry:14,honey:7,wild:1.55,bee_scatter:.18},
  pay:{
    apple:{3:.020,4:.035,5:.055,6:.080,7:.12,8:.18,9:.26,10:.38,11:.55,12:.80,13:1.15,14:1.65,15:2.3,16:3.2,17:4.5,18:6.2},
    orange:{3:.022,4:.038,5:.060,6:.088,7:.13,8:.20,9:.29,10:.42,11:.61,12:.88,13:1.25,14:1.78,15:2.5,16:3.5,17:4.9,18:6.8},
    lemon:{3:.024,4:.041,5:.064,6:.094,7:.14,8:.21,9:.31,10:.45,11:.65,12:.94,13:1.34,14:1.9,15:2.7,16:3.75,17:5.25,18:7.3},
    grapes:{3:.027,4:.046,5:.072,6:.105,7:.155,8:.235,9:.34,10:.50,11:.72,12:1.04,13:1.48,14:2.1,15:2.95,16:4.1,17:5.75,18:8.0},
    watermelon:{3:.030,4:.051,5:.080,6:.116,7:.17,8:.255,9:.37,10:.54,11:.78,12:1.12,13:1.60,14:2.26,15:3.18,16:4.42,17:6.15,18:8.55},
    cherry:{3:.034,4:.058,5:.090,6:.132,7:.195,8:.29,9:.42,10:.61,11:.88,12:1.27,13:1.82,14:2.58,15:3.62,16:5.02,17:7.0,18:9.7},
    strawberry:{3:.040,4:.068,5:.105,6:.154,7:.225,8:.335,9:.49,10:.71,11:1.02,12:1.47,13:2.10,14:2.98,15:4.18,16:5.8,17:8.05,18:11.1},
    honey:{3:.055,4:.092,5:.142,6:.21,7:.31,8:.46,9:.67,10:.98,11:1.42,12:2.04,13:2.9,14:4.1,15:5.75,16:8.0,17:11.0,18:15.0}
  }
};

export function createHoneyFruitsResult(bet){
  bet=cleanBet(bet);const initialGrid=makeGrid(false),scatterPositions=findSymbol(initialGrid,HONEY_FRUITS_CONFIG.scatter),scatterCount=scatterPositions.length;
  const evalBase=evaluateWays(initialGrid,bet,null),scatterPayout=scatterCount>=3?Math.floor(bet*scatterFactor(scatterCount)):0,basePayout=evalBase.payout+scatterPayout;
  const bonusTriggered=scatterCount>=3,bonus=bonusTriggered?createHoneyBonus(bet):null;
  const out={gameId:HONEY_FRUITS_CONFIG.id,initialGrid,finalGrid:cloneGrid(initialGrid),wins:evalBase.wins,cascades:[],scatterPositions,scatterCount,scatterPayout,anticipationReel:findAnticipationReel(initialGrid),basePayout,bonusTriggered,bonusType:bonusTriggered?"HONEY_BEE_BONUS":null,freeSpinsAwarded:bonus?.initialSpins||0,bonus,payout:basePayout+Number(bonus?.payout||0)};
  return capOutcome(out,bet*HONEY_FRUITS_CONFIG.maxWin);
}

function createHoneyBonus(bet){
  const cfg=HONEY_FRUITS_CONFIG,frames=[];let remaining=cfg.initialBonusSpins,level=0,progress=0,total=0,spin=0,guard=0;
  let [widthCells,heightCells]=cfg.beeSizes[level],position=randomBeePosition(widthCells,heightCells,null);
  while(remaining>0&&guard<48){
    guard++;spin++;remaining--;
    if(spin>1)position=randomBeePosition(widthCells,heightCells,position);
    const beeBefore={level,widthCells,heightCells,position:{...position},progress,required:level<cfg.growthRequirements.length?cfg.growthRequirements[level]:0};
    const grid=makeGrid(true),wildCells=beeWildCells(position,widthCells,heightCells,grid),evaluation=evaluateWays(grid,bet,new Set(wildCells.map(p=>`${p.r}:${p.c}`))),scatterPositions=findSymbol(grid,cfg.scatter),scatterCount=scatterPositions.length;
    const scatterPayout=scatterCount>=3?Math.floor(bet*scatterFactor(scatterCount)*.5):0,payout=evaluation.payout+scatterPayout;total+=payout;
    const growths=[];let extraSpins=0,maxBeeExtraSpins=0;
    for(let i=0;i<scatterCount;i++){
      if(level<cfg.beeSizes.length-1){
        progress++;
        const required=cfg.growthRequirements[level]||999;
        if(progress>=required){
          progress-=required;const fromLevel=level;level++;const [nextW,nextH]=cfg.beeSizes[level];position=fitBeePosition(position,nextW,nextH);widthCells=nextW;heightCells=nextH;remaining+=cfg.growthExtraSpins;extraSpins+=cfg.growthExtraSpins;
          growths.push({fromLevel,toLevel:level,widthCells,heightCells,position:{...position},extraSpins:cfg.growthExtraSpins,progressAfter:progress,requiredNext:level<cfg.growthRequirements.length?cfg.growthRequirements[level]:0});
        }
      }else{
        remaining+=cfg.maxLevelBeeExtraSpins;extraSpins+=cfg.maxLevelBeeExtraSpins;maxBeeExtraSpins+=cfg.maxLevelBeeExtraSpins;
      }
    }
    frames.push({spin,grid,finalGrid:cloneGrid(grid),wins:evaluation.wins,payout,scatterPayout,scatterPositions,scatterCount,anticipationReel:findAnticipationReel(grid),beeBefore,wildCells,collectedBees:scatterCount,growths,extraSpins,maxBeeExtraSpins,remainingAfter:remaining,totalWinAfter:total,beeAfter:{level,widthCells,heightCells,position:{...position},progress,required:level<cfg.growthRequirements.length?cfg.growthRequirements[level]:0,maxed:level===cfg.beeSizes.length-1}});
  }
  return {type:"HONEY_BEE_BONUS",name:"HONEY BEE BONUS",initialSpins:cfg.initialBonusSpins,frames,payout:total,totalSpins:frames.length,finalBee:{level,widthCells,heightCells,position:{...position},progress,maxed:level===cfg.beeSizes.length-1}};
}

function evaluateWays(grid,bet,giantWildSet){
  const cfg=HONEY_FRUITS_CONFIG,wins=[];
  for(const [symbol,table] of Object.entries(cfg.pay)){
    const perReel=[];let reelCount=0;
    for(let c=0;c<cfg.reels;c++){
      const positions=[];
      for(let r=0;r<cfg.rows;r++){
        const key=`${r}:${c}`,cell=grid[r][c],giantWild=giantWildSet?.has(key)&&cell!==cfg.scatter;
        if(cell===symbol||cell===cfg.wild||giantWild)positions.push({r,c,giantWild});
      }
      if(!positions.length)break;perReel.push(positions);reelCount++;
    }
    if(reelCount<3)continue;const factor=Number(table[reelCount]||0);if(!factor)continue;
    const rawWays=perReel.reduce((n,a)=>n*a.length,1),ways=Math.min(rawWays,250),amount=Math.max(1,Math.floor(bet*factor*ways/100));
    wins.push({symbol,reels:reelCount,ways,rawWays,factor,amount,positions:uniquePositions(perReel.flat())});
  }
  return {wins,payout:wins.reduce((s,w)=>s+w.amount,0)};
}

function makeGrid(bonus){return Array.from({length:HONEY_FRUITS_CONFIG.rows},()=>Array.from({length:HONEY_FRUITS_CONFIG.reels},()=>pickSymbol(bonus)));}
function pickSymbol(bonus){const weights=bonus?HONEY_FRUITS_CONFIG.bonusWeights:HONEY_FRUITS_CONFIG.baseWeights,values=Object.keys(weights),ints=values.map(k=>Math.max(1,Math.round(weights[k]*1000))),total=ints.reduce((a,b)=>a+b,0);let roll=secureInt(total);for(let i=0;i<values.length;i++){roll-=ints[i];if(roll<0)return values[i];}return values.at(-1);}
function beeWildCells(position,width,height,grid){const out=[];for(let r=position.y;r<position.y+height;r++)for(let c=position.x;c<position.x+width;c++)if(grid[r][c]!==HONEY_FRUITS_CONFIG.scatter)out.push({r,c});return out;}
export function getValidBeePositions(width,height){const out=[];for(let y=0;y<=HONEY_FRUITS_CONFIG.rows-height;y++)for(let x=0;x<=HONEY_FRUITS_CONFIG.reels-width;x++)out.push({x,y});return out;}
function randomBeePosition(width,height,avoid){const positions=getValidBeePositions(width,height),filtered=avoid?positions.filter(p=>p.x!==avoid.x||p.y!==avoid.y):positions,pool=filtered.length?filtered:positions;return {...pool[secureInt(pool.length)]};}
function fitBeePosition(position,width,height){return {x:Math.max(0,Math.min(HONEY_FRUITS_CONFIG.reels-width,position.x)),y:Math.max(0,Math.min(HONEY_FRUITS_CONFIG.rows-height,position.y))};}
function findSymbol(grid,symbol){const out=[];for(let r=0;r<grid.length;r++)for(let c=0;c<grid[r].length;c++)if(grid[r][c]===symbol)out.push({r,c});return out;}
function findAnticipationReel(grid){let seen=0;for(let c=0;c<HONEY_FRUITS_CONFIG.reels;c++){if(c>0&&seen>=2)return c;for(let r=0;r<HONEY_FRUITS_CONFIG.rows;r++)if(grid[r][c]===HONEY_FRUITS_CONFIG.scatter)seen++;}return -1;}
function scatterFactor(n){return n>=7?12:n===6?8:n===5?5:n===4?3:n===3?1.5:0;}
function uniquePositions(list){const m=new Map();for(const p of list||[])m.set(`${p.r}:${p.c}`,{r:p.r,c:p.c,giantWild:!!p.giantWild});return [...m.values()];}
function cloneGrid(grid){return grid.map(r=>[...r]);}
function cleanBet(v){return Math.max(1,Math.floor(Number(v)||1));}
function secureInt(max){max=Math.max(1,Math.floor(max));const ceiling=0x100000000,limit=ceiling-(ceiling%max),a=new Uint32Array(1);do crypto.getRandomValues(a);while(a[0]>=limit);return a[0]%max;}
function capOutcome(out,cap){
  let total=Math.max(0,Math.floor(Number(out.payout)||0));if(total<=cap)return out;let remaining=cap;
  const base=Math.min(remaining,Math.max(0,Math.floor(out.basePayout||0)));out.basePayout=base;remaining-=base;
  if(out.bonus){for(const frame of out.bonus.frames){const allowed=Math.min(remaining,Math.max(0,Math.floor(frame.payout||0)));if(allowed<frame.payout){const ratio=allowed/Math.max(1,frame.payout);for(const w of frame.wins||[])w.amount=Math.floor(w.amount*ratio);frame.scatterPayout=Math.floor((frame.scatterPayout||0)*ratio);}frame.payout=allowed;remaining-=allowed;frame.totalWinAfter=cap-remaining;if(remaining<=0){remaining=0;}}
    out.bonus.payout=out.bonus.frames.reduce((s,f)=>s+f.payout,0);
  }
  out.payout=cap;out.maxWinReached=true;return out;
}
