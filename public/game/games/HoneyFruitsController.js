import {GameState} from "../core/GameStateMachine.js";
import {GiantBeeController} from "./GiantBeeController.js";

export class HoneyFruitsController{
  constructor(engine){this.engine=engine;this.giant=null;}
  destroy(){this.giant?.destroy();this.giant=null;}
  async presentSpin(serverResponse,{onBalance=()=>{},onStatus=()=>{}}={}){
    const e=this.engine,result=serverResponse?.result,bet=Number(serverResponse?.bet||0);if(!result?.initialGrid||!bet)throw new Error("BAD_HONEY_RESULT");
    try{
      e.fsm.transition(GameState.BASE_SPINNING);onStatus("SPIN");e.audio.play("honeySpin",{volume:.78});e.haptics.impact("medium");e.reels.startSpin();
      await e.reels.stopOnGrid(result.initialGrid,{anticipationReel:Number.isInteger(result.anticipationReel)?result.anticipationReel:-1,stopDuration:.24,staggerMs:32,onAnticipation:async()=>{e.fsm.transition(GameState.SCATTER_ANTICIPATION);e.audio.startAnticipation();e.setCameraZoom(1.025,.32);onStatus("BEE ANTICIPATION");e.particles.emit("pollen",e.app.screen.width*.5,e.app.screen.height*.32,{count:18,tint:0xffda5e});},onScatterStop:()=>{e.audio.play("beeScatter",{volume:.9});e.haptics.scatter();e.particles.emit("beeTrail",e.app.screen.width*.5,e.app.screen.height*.36,{count:10,tint:0xffdf6a});},onReelStop:()=>{e.audio.play("honeyReel",{volume:.45});e.haptics.reelStop();}});
      e.audio.stopAnticipation({restore:!result.bonusTriggered});e.setCameraZoom(1,.22);if(e.fsm.is(GameState.BASE_SPINNING,GameState.SCATTER_ANTICIPATION))e.fsm.transition(GameState.EVALUATING);
      if(result.wins?.length){await e.reels.animateWins(result.wins);e.particles.emit("fruitJuice",e.app.screen.width*.5,e.app.screen.height*.44,{count:14,tint:0xff9c43});}
      const baseWin=Number(result.basePayout||0);if(baseWin>0){const tier=e.win.tier(baseWin,bet);if(tier==="RETURN"||tier==="WIN")e.fsm.transition(GameState.SMALL_WIN);else{e.fsm.transition(GameState.BIG_WIN);if(tier==="MAX WIN")e.fsm.transition(GameState.MAX_WIN);}await e.win.present(baseWin,bet,{tier});}
      if(result.bonusTriggered&&result.bonus){if(!e.fsm.is(GameState.BONUS_TRIGGER))e.fsm.transition(GameState.BONUS_TRIGGER);await this.#playBonus(result,bet,onStatus);}else this.#toBaseIdle();
      onBalance(serverResponse.balance);onStatus(resultLabel(serverResponse.payout,bet));return serverResponse;
    }catch(error){e.audio.stopAnticipation({restore:true});e.setCameraZoom(1,.12);try{e.reels?.setGrid(result?.finalGrid||result?.initialGrid);}catch{}e.forceIdle(true);throw error;}
  }
  async #playBonus(result,bet,onStatus){
    const e=this.engine,bonus=result.bonus;e.fsm.transition(GameState.BONUS_INTRO);e.audio.play("honeyBonus",{volume:1});e.haptics.bonus();await this.#intro(result.scatterPositions||[]);await e.audio.enterBonusMusic();e.setBonusScene(true);
    this.giant?.destroy();this.giant=new GiantBeeController(e);this.giant.showHud(true);let totalWin=0;
    e.fsm.transition(GameState.BONUS_IDLE);
    for(let i=0;i<(bonus.frames||[]).length;i++){
      const frame=bonus.frames[i],before=frame.beeBefore,spinsBefore=Math.max(1,Number(frame.remainingAfter||0)+1-Number(frame.extraSpins||0));
      this.giant.setHud({spins:spinsBefore,progress:before.progress,required:before.required,level:before.level,totalWin,maxed:before.level>=4});
      e.fsm.transition(GameState.BEE_RELOCATING);onStatus(`BEE MOVE • SPINS ${spinsBefore}`);
      if(i===0)this.giant.mount(before,{instant:false});else await this.giant.relocate(before);
      e.fsm.transition(GameState.BONUS_SPINNING);onStatus(`BONUS SPIN ${frame.spin}`);e.audio.play("honeyBonusSpin",{volume:.72});e.reels.startSpin();
      await e.reels.stopOnGrid(frame.grid,{anticipationReel:Number.isInteger(frame.anticipationReel)?frame.anticipationReel:-1,stopDuration:.21,staggerMs:24,onAnticipation:async()=>{e.audio.startAnticipation();e.particles.emit("pollen",e.app.screen.width*.5,e.app.screen.height*.32,{count:12,tint:0xffd766});onStatus(`BONUS SPIN ${frame.spin} • BEE?`);},onScatterStop:()=>{e.audio.play("beeScatter",{volume:.82});e.haptics.scatter();},onReelStop:()=>e.audio.play("honeyReel",{volume:.38})});e.audio.stopAnticipation({restore:false});
      if(frame.wins?.length)await e.reels.animateWins(frame.wins);totalWin+=Number(frame.payout||0);
      const tier=e.win.tier(Number(frame.payout||0),bet);if(frame.payout>0&&!["RETURN","WIN"].includes(tier)){e.fsm.transition(GameState.BONUS_WIN_PRESENTATION);await e.win.present(frame.payout,bet,{tier});e.fsm.transition(GameState.BEE_COLLECTING);}else e.fsm.transition(GameState.BEE_COLLECTING);
      if(frame.scatterPositions?.length){onStatus(`BEE COLLECT +${frame.scatterPositions.length}`);await this.giant.collect(frame.scatterPositions);}
      for(const growth of frame.growths||[]){e.fsm.transition(GameState.BEE_GROWING);onStatus(`BEE GROWTH • LEVEL ${growth.toLevel+1}`);await this.giant.grow(growth);}
      if(frame.maxBeeExtraSpins>0)await this.giant.maxBeeExtra(frame.maxBeeExtraSpins);
      const after=frame.beeAfter||before;this.giant.setHud({spins:frame.remainingAfter,progress:after.progress,required:after.required,level:after.level,totalWin,maxed:after.maxed});
      if(i<(bonus.frames.length-1))e.fsm.transition(GameState.BONUS_IDLE);await wait(180);
    }
    if(!e.fsm.is(GameState.BONUS_IDLE))e.fsm.current=GameState.BONUS_IDLE;e.fsm.transition(GameState.BONUS_OUTRO);onStatus("BONUS COMPLETE");await this.#outro(bonus.payout,bet);this.giant.hide();await e.audio.exitBonusMusic();e.setBonusScene(false);e.fsm.transition(GameState.RETURN_BASE);e.fsm.transition(GameState.BASE_IDLE);
  }
  async #intro(scatterPositions){
    const e=this.engine,W=e.app.screen.width,H=e.app.screen.height,flash=new e.PIXI.Graphics().rect(0,0,W,H).fill({color:0xffc229,alpha:0});e.layers.ui.addChild(flash);
    const title=new e.PIXI.Text({text:"HONEY BEE BONUS",style:{fontFamily:"Arial",fontSize:Math.max(26,Math.min(54,W*.082)),fontWeight:"900",fill:0xffec91,stroke:{color:0x6b3100,width:6},letterSpacing:2,align:"center"}});title.anchor.set(.5);title.x=W/2;title.y=H*.46;title.alpha=0;e.layers.ui.addChild(title);
    for(const p of scatterPositions.slice(0,5)){const cell=e.reels.visibleCenter(p.r,p.c),s=new e.PIXI.Sprite(e.resources.textures.bee_scatter);s.anchor.set(.5);const sc=Math.min(e.reels.cellW*.8/Math.max(1,s.texture.width),e.reels.cellH*.8/Math.max(1,s.texture.height));s.scale.set(sc);s.position.set(cell.x,cell.y);e.layers.ui.addChild(s);gsap.to(s,{x:W/2,y:H*.44,duration:.55+Math.random()*.2,delay:Math.random()*.14,ease:"power2.inOut",onComplete:()=>s.destroy()});}
    e.audio.play("beeBuzz",{volume:.9});e.particles.emit("goldenExplosion",W/2,H*.44,{count:38,tint:0xffcf41});await done(gsap.timeline().to(flash,{alpha:.72,duration:.13}).to(flash,{alpha:0,duration:.34}).fromTo(title.scale,{x:.35,y:.35},{x:1,y:1,duration:.44,ease:"back.out(2.8)"},0).to(title,{alpha:1,duration:.15},0).to(title,{alpha:0,duration:.28},1.0));flash.destroy();title.destroy();
  }
  async #outro(total,bet){const e=this.engine,W=e.app.screen.width,H=e.app.screen.height;if(this.giant?.bee){await done(gsap.timeline().to(this.giant.bee,{x:W/2,y:H*.42,duration:.48,ease:"power2.inOut"}).to(this.giant.bee.scale,{x:this.giant.bee.scale.x*1.12,y:this.giant.bee.scale.y*1.12,duration:.18,yoyo:true,repeat:1}));}e.audio.play("bonusComplete",{volume:1});e.particles.emit("goldenExplosion",W/2,H*.45,{count:52,tint:0xffd14a});const tier=e.win.tier(total,bet);if(total>0)await e.win.present(total,bet,{tier});}
  #toBaseIdle(){const e=this.engine;if([GameState.SMALL_WIN,GameState.BIG_WIN,GameState.MAX_WIN,GameState.EVALUATING].includes(e.fsm.current))e.fsm.transition(GameState.BASE_IDLE);else if(e.fsm.current!==GameState.BASE_IDLE)e.fsm.current=GameState.BASE_IDLE;}
}
function resultLabel(payout,bet){payout=Math.max(0,Number(payout)||0);bet=Math.max(1,Number(bet)||1);if(!payout)return "NO WIN";return `${payout<bet?"RETURN":"WIN"} ${fmt(payout)} • x${(payout/bet).toFixed(2)}`;}
function fmt(n){return Math.floor(Number(n)||0).toLocaleString("ru-RU");}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function done(tl){return new Promise(r=>tl.eventCallback("onComplete",r));}
