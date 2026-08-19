import {GameState,GameStateMachine} from "./GameStateMachine.js";
import {AssetManager} from "./AssetManager.js";
import {AudioManager} from "./AudioManager.js";
import {HapticManager} from "./HapticManager.js";
import {ParticleManager} from "./ParticleManager.js";
import {WinPresentationManager} from "./WinPresentationManager.js";
import {ReelEngine} from "./ReelEngine.js";
import {HoneyFruitsController} from "../games/HoneyFruitsController.js";
import {LuckyCoinCollectorController} from "../games/LuckyCoinCollectorController.js";

export class GameEngine extends EventTarget{
  constructor({PIXI=window.PIXI,container,tg=window.Telegram?.WebApp,quality="AUTO"}={}){
    super();this.PIXI=PIXI;this.container=container;this.quality=quality;this.fsm=new GameStateMachine();this.assets=new AssetManager(PIXI);this.audio=new AudioManager();this.haptics=new HapticManager(tg);
    this.app=null;this.resources=null;this.config=null;this.reels=null;this.particles=null;this.win=null;this.controller=null;this.layers={};this.gameId=null;this._resizeObserver=null;this._idleStarted=false;this.#wireState();
  }
  async init(){
    if(this.app)return;this.fsm.transition(GameState.LOADING);this.app=new this.PIXI.Application();
    await this.app.init({resizeTo:this.container,background:0x030509,antialias:this.quality!=="LOW",autoDensity:true,resolution:this.quality==="LOW"?1:Math.min(2,devicePixelRatio||1),preference:"webgl"});
    this.container.replaceChildren(this.app.canvas);this.app.stage.sortableChildren=true;
    this.layers.background=new this.PIXI.Container();this.layers.mid=new this.PIXI.Container();this.layers.game=new this.PIXI.Container();this.layers.foreground=new this.PIXI.Container();this.layers.particles=new this.PIXI.Container();this.layers.ui=new this.PIXI.Container();
    this.layers.background.zIndex=0;this.layers.mid.zIndex=10;this.layers.game.zIndex=20;this.layers.foreground.zIndex=30;this.layers.particles.zIndex=40;this.layers.ui.zIndex=50;
    for(const layer of Object.values(this.layers))this.app.stage.addChild(layer);await this.audio.init();
    this._resizeObserver=new ResizeObserver(()=>{if(this.reels&&this.fsm.is(GameState.IDLE,GameState.BASE_IDLE)){this.#buildScene(this._bonusScene===true);this.reels.layout(this.app.screen.width,this.app.screen.height);}});this._resizeObserver.observe(this.container);
  }
  async loadGame(gameId,onProgress=()=>{}){
    await this.init();
    if(this.fsm.current!==GameState.LOADING){if(!this.fsm.is(GameState.IDLE,GameState.BASE_IDLE,GameState.ERROR))throw new Error(`GAME_LOAD_BLOCKED:${this.fsm.current}`);if(this.fsm.is(GameState.ERROR))this.fsm.current=GameState.IDLE;this.fsm.transition(GameState.LOADING);}
    this.controller?.destroy?.();this.controller=null;this.reels?.destroy();this.reels=null;this.particles?.destroy();this.particles=null;this.win=null;this._bonusScene=false;
    for(const layer of Object.values(this.layers))layer.removeChildren();
    try{
      this.gameId=gameId;this.resources=await this.assets.loadGame(gameId,onProgress);this.config=this.resources.config;this.audio.setTheme(this.config.audioTheme||"default");this.#buildScene(false);
      this.reels=new ReelEngine({app:this.app,layer:this.layers.game,textures:this.resources.textures,config:this.config,quality:this.quality});this.reels.layout(this.app.screen.width,this.app.screen.height);
      this.particles=new ParticleManager(this.app,this.layers.particles,{quality:this.quality});
      this.win=new WinPresentationManager({app:this.app,rootLayer:this.layers.ui,particleManager:this.particles,audio:this.audio,haptics:this.haptics,camera:this.layers.game,thresholds:this.config.winThresholds});
      if(this.config.controller==="HONEY_FRUITS")this.controller=new HoneyFruitsController(this);
      else if(this.config.controller==="LUCKY_COIN_COLLECTOR")this.controller=new LuckyCoinCollectorController(this);
      this.audio.startBaseMusic();this.fsm.transition(this.controller?GameState.BASE_IDLE:GameState.IDLE);this.#idleLoop();return this.config;
    }catch(error){this.#toError();throw error;}
  }
  canSpin(){return this.fsm.is(GameState.IDLE,GameState.BETTING,GameState.BASE_IDLE);}
  async presentSpin(serverResponse,callbacks={}){
    if(!this.canSpin())throw new Error(`SPIN_BLOCKED:${this.fsm.current}`);if(this.controller?.presentSpin)return this.controller.presentSpin(serverResponse,callbacks);
    const {onBalance=()=>{},onStatus=()=>{}}=callbacks,result=serverResponse?.result,bet=Number(serverResponse?.bet||0);if(!result?.initialGrid||!bet)throw new Error("BAD_GAME_RESULT");
    try{
      this.fsm.transition(GameState.SPIN_START);onStatus("SPIN");this.audio.play("spin");this.haptics.impact("medium");this.reels.startSpin();this.fsm.transition(GameState.SPINNING);
      await this.reels.stopOnGrid(result.initialGrid,{anticipationReel:Number.isInteger(result.anticipationReel)?result.anticipationReel:-1,onAnticipation:async()=>{this.fsm.transition(GameState.ANTICIPATION);this.audio.startAnticipation();this.setCameraZoom(1.025,.35);onStatus("ANTICIPATION");},onScatterStop:()=>{this.audio.play("scatter");this.haptics.scatter();this.particles.emit("magicTrail",this.app.screen.width*.5,this.app.screen.height*.35,{count:12,tint:0x6be7ff});},onReelStop:()=>{this.audio.play("reel");this.haptics.reelStop();}});
      this.audio.stopAnticipation({restore:!result.bonusTriggered});this.setCameraZoom(1,.25);if(this.fsm.is(GameState.SPINNING,GameState.ANTICIPATION))this.fsm.transition(GameState.REEL_STOP);this.fsm.transition(GameState.EVALUATING);
      let cascadeNo=0;for(const cascade of result.cascades||[]){cascadeNo++;onStatus(`TUMBLE ${cascadeNo} • x${cascade.multiplier}`);await this.reels.animateWins(cascade.wins||[]);await this.reels.animateCascade(cascade,this.particles);this.audio.play("burst");}
      const baseWin=Number(result.basePayout||0);if(baseWin>0&&!result.bonusTriggered){const tier=this.win.tier(baseWin,bet);if(tier==="RETURN"||tier==="WIN")this.fsm.transition(GameState.SMALL_WIN);else{this.fsm.transition(GameState.BIG_WIN);if(tier==="MAX WIN")this.fsm.transition(GameState.MAX_WIN);}await this.win.present(baseWin,bet,{tier});}
      if(result.bonusTriggered&&result.bonus)await this.#playFreeSpins(result.bonus,bet,onStatus);
      this.#finishToIdle();onBalance(serverResponse.balance);onStatus(resultLabel(serverResponse.payout,bet,serverResponse.multiplier));return serverResponse;
    }catch(error){this.audio.stopAnticipation({restore:true});this.setCameraZoom(1,.12);this.#toError();try{if(result?.finalGrid)this.reels?.setGrid(result.finalGrid);}catch{}if(this.fsm.is(GameState.ERROR))this.fsm.transition(GameState.IDLE);throw error;}
  }
  setQuality(q){this.quality=q||"AUTO";this.particles?.setQuality(this.quality);this.reels?.setQuality(this.quality);localStorage.setItem("fit_casino_quality",this.quality);}
  setBonusScene(bonus=false){this._bonusScene=!!bonus;this.#buildScene(this._bonusScene);}
  setCameraZoom(scale,duration=.25){const layer=this.layers.game;layer.pivot.set(this.app.screen.width/2,this.app.screen.height/2);layer.position.set(this.app.screen.width/2,this.app.screen.height/2);gsap.to(layer.scale,{x:scale,y:scale,duration,ease:"power2.out"});}
  forceIdle(honey=false){try{this.audio.stopAnticipation({restore:true});}catch{}this.fsm.current=honey?GameState.BASE_IDLE:GameState.IDLE;this.dispatchEvent(new CustomEvent("statechange",{detail:{previous:GameState.ERROR,current:this.fsm.current}}));}
  async #playFreeSpins(bonus,bet,onStatus){
    this.fsm.transition(GameState.BONUS_TRIGGER);this.audio.play("bonus");this.haptics.bonus();this.fsm.transition(GameState.BONUS_INTRO);await this.#bonusIntro();await this.audio.enterBonusMusic();this.setBonusScene(true);this.fsm.transition(GameState.FREE_SPINS);
    let i=0;for(const frame of bonus.frames||[]){i++;onStatus(`FREE SPIN ${i}/${bonus.frames.length} • MULTI x${frame.startMultiplier||2}`);this.reels.startSpin();await this.reels.stopOnGrid(frame.initialGrid,{anticipationReel:Number.isInteger(frame.anticipationReel)?frame.anticipationReel:-1,onAnticipation:async()=>{this.audio.startAnticipation();onStatus(`FREE SPIN ${i}/${bonus.frames.length} • ANTICIPATION`);},onReelStop:()=>{this.audio.play("reel");this.haptics.reelStop();},onScatterStop:()=>{this.audio.play("scatter");this.haptics.scatter();}});this.audio.stopAnticipation({restore:false});for(const cascade of frame.cascades||[]){onStatus(`FREE SPIN ${i}/${bonus.frames.length} • TUMBLE x${cascade.multiplier}`);await this.reels.animateWins(cascade.wins||[]);await this.reels.animateCascade(cascade,this.particles);this.audio.play("burst");}await wait(150);}
    const total=Number(bonus.payout||0);if(total>0){const tier=this.win.tier(total,bet);await this.win.present(total,bet,{tier});}this.fsm.transition(GameState.BONUS_OUTRO);await this.#bonusOutro();await this.audio.exitBonusMusic();this.setBonusScene(false);
  }
  async #bonusIntro(){const W=this.app.screen.width,H=this.app.screen.height,flash=new this.PIXI.Graphics().rect(0,0,W,H).fill({color:0xffd56a,alpha:0});this.layers.ui.addChild(flash);const title=new this.PIXI.Text({text:"GOLDEN ASCENSION",style:{fontFamily:"Arial",fontSize:Math.max(28,Math.min(58,W*.078)),fontWeight:"900",fill:0xffe69c,stroke:{color:0x3d1b00,width:6},letterSpacing:2,align:"center"}});title.anchor.set(.5);title.x=W/2;title.y=H/2;title.alpha=0;this.layers.ui.addChild(title);this.particles.emit("starBurst",W/2,H/2,{count:48});await timelineDone(gsap.timeline().to(flash,{alpha:.82,duration:.12}).to(flash,{alpha:0,duration:.35}).fromTo(title.scale,{x:.42,y:.42},{x:1,y:1,duration:.45,ease:"back.out(2.8)"},0).to(title,{alpha:1,duration:.18},0).to(title,{alpha:0,duration:.3},.92));flash.destroy();title.destroy();}
  async #bonusOutro(){const W=this.app.screen.width,H=this.app.screen.height,t=new this.PIXI.Text({text:"FEATURE COMPLETE",style:{fontFamily:"Arial",fontSize:Math.max(16,W*.04),fontWeight:"800",fill:0xffdf8a,letterSpacing:2}});t.anchor.set(.5);t.x=W/2;t.y=H*.45;t.alpha=0;this.layers.ui.addChild(t);await timelineDone(gsap.timeline().to(t,{alpha:1,duration:.2}).to(t,{alpha:0,duration:.25},.65));t.destroy();}
  #buildScene(bonus=false){const layer=this.layers.background;layer.removeChildren();const tex=bonus?this.resources?.bonusBackground:this.resources?.background;if(tex){const s=new this.PIXI.Sprite(tex);const scale=Math.max(this.app.screen.width/Math.max(1,tex.width),this.app.screen.height/Math.max(1,tex.height));s.scale.set(scale);s.x=(this.app.screen.width-s.width)/2;s.y=(this.app.screen.height-s.height)/2;layer.addChild(s);}const shade=new this.PIXI.Graphics().rect(0,0,this.app.screen.width,this.app.screen.height).fill({color:0x020407,alpha:bonus ? .14 : .26});layer.addChild(shade);}
  #finishToIdle(){if(this.fsm.current===GameState.BONUS_OUTRO)this.fsm.transition(GameState.RETURN_TO_BASE_GAME);if(this.fsm.current===GameState.RETURN_TO_BASE_GAME)this.fsm.transition(GameState.IDLE);else if([GameState.SMALL_WIN,GameState.BIG_WIN,GameState.MAX_WIN,GameState.EVALUATING].includes(this.fsm.current))this.fsm.transition(GameState.IDLE);}
  #toError(){try{if(!this.fsm.is(GameState.ERROR)){if(this.fsm.can(GameState.ERROR))this.fsm.transition(GameState.ERROR);else this.fsm.current=GameState.ERROR;}}catch{this.fsm.current=GameState.ERROR;}}
  #idleLoop(){if(this._idleStarted)return;this._idleStarted=true;let last=0;const tick=t=>{if(t-last>2800&&this.fsm?.is(GameState.IDLE,GameState.BASE_IDLE)){last=t;const lucky=this.config?.controller==="LUCKY_COIN_COLLECTOR",honey=this.config?.controller==="HONEY_FRUITS",preset=lucky?"goldDust":honey?"pollen":"magicTrail",tint=lucky?0xffd766:honey?0xffdf77:0xd5b65f;this.particles?.emit(preset,this.app.screen.width*(.15+Math.random()*.7),this.app.screen.height*(.18+Math.random()*.45),{count:this.quality==="LOW"?2:4,tint,speed:26,life:1.25});}requestAnimationFrame(tick);};requestAnimationFrame(tick);}
  #wireState(){this.fsm.addEventListener("change",e=>this.dispatchEvent(new CustomEvent("statechange",{detail:e.detail})));}
}
function resultLabel(payout,bet,multiplier){payout=Math.max(0,Number(payout)||0);bet=Math.max(1,Number(bet)||1);if(!payout)return "NO WIN";const prefix=payout<bet?"RETURN":"WIN";return `${prefix} ${format(payout)} • x${Number(multiplier||payout/bet).toFixed(2)}`;}
function format(n){return Math.floor(Number(n)||0).toLocaleString("ru-RU");}function wait(ms){return new Promise(r=>setTimeout(r,ms));}function timelineDone(tl){return new Promise(r=>tl.eventCallback("onComplete",r));}
