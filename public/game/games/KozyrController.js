import {GameState} from "../core/GameStateMachine.js";
export class KozyrController{
  constructor(engine){this.engine=engine;this.hud=null;this.stickyFx=[];}
  destroy(){this.destroyHud();this.clearSticky();}
  async presentSpin(serverResponse,{onBalance=()=>{},onStatus=()=>{}}={}){
    const e=this.engine,r=serverResponse?.result,bet=Number(serverResponse?.bet||0);if(!r?.initialGrid||!bet)throw new Error("BAD_KOZYR_RESULT");
    try{
      e.fsm.transition(GameState.BASE_SPIN);onStatus("KOZYR SPIN");e.audio.play("spin",{volume:.82,rate:.9});e.haptics.impact("medium");e.reels.startSpin();
      await e.reels.stopOnGrid(r.initialGrid,{stopDuration:.42,staggerMs:54,onReelStop:()=>{e.audio.play("reel",{volume:.5,rate:.88});e.haptics.reelStop();},onScatterStop:()=>{e.audio.play("scatter",{volume:.9});e.haptics.scatter();}});
      await this.playCascades(r.cascades||[],onStatus,false);
      if(r.scatterPayout>0)await e.reels.animateWins([{symbol:"crown_scatter",positions:r.scatterPositions||[],amount:r.scatterPayout}]);
      if(r.bonusTriggered&&r.bonus){e.fsm.transition(GameState.BONUS_TRIGGER);await this.playBonus(r.bonus,bet,onStatus);}else this.toIdle();
      onBalance(serverResponse.balance);onStatus(r.maxWinHit?"MAX WIN":label(serverResponse.payout,bet));return serverResponse;
    }catch(error){this.destroyHud();this.clearSticky();try{e.setBonusScene(false);}catch{}e.forceIdle(true);throw error;}
  }
  async playCascades(cascades,onStatus,bonus){
    const e=this.engine;let no=0;
    for(const c of cascades){no++;onStatus(`${bonus?"BLACK INK":"INK"} • CASCADE ${no} ×${Number(c.cascadeMultiplier||1).toFixed(1)}`);if((c.wins||[]).length)await e.reels.animateWins(c.wins||[]);
      if((c.inkSplash||[]).length)await this.inkSplash(c.inkSplash);
      if(c.nextGrid){await e.reels.animateCascade(c,e.particles);e.audio.play("burst",{volume:.7,rate:.86+no*.03});}
    }
  }
  async playBonus(bonus,bet,onStatus){
    const e=this.engine;e.fsm.transition(GameState.BONUS_INTRO);await this.bonusIntro();await e.audio.enterBonusMusic();e.setBonusScene(true);this.createHud();this.clearSticky();
    e.fsm.transition(GameState.BONUS_PLAYING);let total=0;
    for(let i=0;i<(bonus.frames||[]).length;i++){
      const f=bonus.frames[i];onStatus(`BLACK INK ${i+1}/${bonus.frames.length}`);this.updateHud(i+1,bonus.frames.length,total,f.sticky?.length||0);
      e.audio.play("spin",{volume:.66,rate:.92});e.reels.startSpin();await e.reels.stopOnGrid(f.initialGrid,{stopDuration:.36,staggerMs:42,onReelStop:()=>{e.audio.play("reel",{volume:.42});e.haptics.reelStop();},onScatterStop:()=>e.haptics.scatter()});
      if((f.newSticky||[]).length)await this.newTattoo(f.newSticky);this.syncSticky(f.sticky||[]);
      await this.playCascades(f.cascades||[],onStatus,true);this.syncSticky(f.sticky||[]);
      if((f.upgraded||[]).length)await this.upgrade(f.upgraded);
      if(f.scatterPayout>0)await e.reels.animateWins([{symbol:"crown_scatter",positions:f.scatterPositions||[],amount:f.scatterPayout}]);
      if(f.retrigger>0)await this.retrigger(f.retrigger);
      total+=Number(f.payout||0);this.updateHud(i+1,bonus.frames.length,total,f.sticky?.length||0);await wait(130);
    }
    if(total>0)await e.win.present(total,bet,{tier:e.win.tier(total,bet)});
    e.fsm.transition(GameState.BONUS_OUTRO);await this.bonusOutro(total);this.destroyHud();this.clearSticky();await e.audio.exitBonusMusic();e.setBonusScene(false);e.fsm.transition(GameState.RETURN_BASE);e.fsm.transition(GameState.BASE_IDLE);
  }
  async inkSplash(list=[]){const e=this.engine;e.audio.play("wild",{volume:.78,rate:.7});for(const p of list){const c=e.reels.visibleCenter(p.r,p.c);e.particles.emit("starBurst",c.x,c.y,{count:e.quality==="LOW"?8:20,tint:0xa74cff,speed:74,life:.6});const ring=new e.PIXI.Graphics().circle(c.x,c.y,8).stroke({color:0x050505,width:10,alpha:.85});ring.zIndex=1100;e.layers.foreground.addChild(ring);gsap.to(ring.scale,{x:5,y:5,duration:.28,ease:"power2.out"});gsap.to(ring,{alpha:0,duration:.3,onComplete:()=>ring.destroy()});}await wait(290);}
  async newTattoo(list){const e=this.engine;e.audio.play("bonus",{volume:.72,rate:.75});e.haptics.impact("heavy");for(const p of list){const c=e.reels.visibleCenter(p.r,p.c);e.particles.emit("symbolExplosion",c.x,c.y,{count:20,tint:0xff315d,speed:85,life:.62});}await wait(250);}
  syncSticky(list=[]){this.clearSticky();const e=this.engine;for(const w of list){const rect=e.reels.cellRect(w.r,w.c),wrap=new e.PIXI.Container();wrap.zIndex=980;const bg=new e.PIXI.Graphics().roundRect(rect.x+4,rect.y+4,rect.width-8,rect.height-8,16).fill({color:0x050507,alpha:.18}).stroke({color:0xff315d,width:3,alpha:.96});const tag=new e.PIXI.Text({text:`×${w.multiplier}`,style:{fontFamily:"Arial",fontSize:Math.max(16,rect.width*.25),fontWeight:"900",fill:0xffffff,stroke:{color:0x5a0017,width:5}}});tag.anchor.set(.5);tag.position.set(rect.x+rect.width/2,rect.y+rect.height*.78);wrap.addChild(bg,tag);e.layers.foreground.addChild(wrap);this.stickyFx.push(wrap);}}
  clearSticky(){for(const x of this.stickyFx.splice(0))try{x.destroy({children:true});}catch{}}
  async upgrade(list){const e=this.engine;e.audio.play("wild",{volume:.75,rate:1.18});for(const u of list){const c=e.reels.visibleCenter(u.r,u.c);const t=new e.PIXI.Text({text:`INK RAGE ×${u.to}`,style:{fontFamily:"Arial",fontSize:Math.max(18,e.app.screen.width*.04),fontWeight:"900",fill:0xffd7e2,stroke:{color:0x640019,width:6}}});t.anchor.set(.5);t.position.set(c.x,c.y);t.zIndex=1300;e.layers.ui.addChild(t);gsap.timeline({onComplete:()=>t.destroy()}).fromTo(t.scale,{x:.35,y:.35},{x:1.1,y:1.1,duration:.2,ease:"back.out(3)"}).to(t,{alpha:0,y:c.y-46,duration:.35},.4);}await wait(450);}
  async retrigger(n){const e=this.engine,W=e.app.screen.width,H=e.app.screen.height,t=new e.PIXI.Text({text:`+${n} FREE SPINS`,style:{fontFamily:"Arial",fontSize:Math.max(30,W*.07),fontWeight:"900",fill:0xffffff,stroke:{color:0xff315d,width:8}}});t.anchor.set(.5);t.position.set(W/2,H*.43);e.layers.ui.addChild(t);e.haptics.bonus();await timeline(gsap.timeline().fromTo(t.scale,{x:.3,y:.3},{x:1,y:1,duration:.28,ease:"back.out(3)"}).to(t,{alpha:0,duration:.28},.75));t.destroy();}
  async bonusIntro(){const e=this.engine,W=e.app.screen.width,H=e.app.screen.height,flash=new e.PIXI.Graphics().rect(0,0,W,H).fill({color:0x9d173b,alpha:0}),t=new e.PIXI.Text({text:"KOZYR\nBLACK INK",style:{fontFamily:"Arial",fontSize:Math.max(34,W*.08),fontWeight:"900",fill:0xffffff,stroke:{color:0x050506,width:10},align:"center",letterSpacing:4,lineHeight:64}});t.anchor.set(.5);t.position.set(W/2,H*.43);t.alpha=0;e.layers.ui.addChild(flash,t);e.haptics.bonus();e.particles.emit("starBurst",W/2,H*.43,{count:48,tint:0xff315d});await timeline(gsap.timeline().to(flash,{alpha:.65,duration:.12}).to(flash,{alpha:0,duration:.3}).fromTo(t.scale,{x:.25,y:.25},{x:1,y:1,duration:.4,ease:"back.out(3)"},0).to(t,{alpha:1,duration:.08},0).to(t,{alpha:0,duration:.25},1));flash.destroy();t.destroy();}
  async bonusOutro(total){const e=this.engine,W=e.app.screen.width,H=e.app.screen.height,t=new e.PIXI.Text({text:`BLACK INK PAID\n${fmt(total)}`,style:{fontFamily:"Arial",fontSize:Math.max(32,W*.075),fontWeight:"900",fill:0xffffff,stroke:{color:0xff315d,width:8},align:"center",lineHeight:58}});t.anchor.set(.5);t.position.set(W/2,H*.44);e.layers.ui.addChild(t);await timeline(gsap.timeline().fromTo(t.scale,{x:.3,y:.3},{x:1,y:1,duration:.3,ease:"back.out(3)"}).to(t,{alpha:0,duration:.25},.9));t.destroy();}
  createHud(){this.destroyHud();const e=this.engine,c=new e.PIXI.Container();c.zIndex=1500;const bg=new e.PIXI.Graphics().roundRect(0,0,560,64,18).fill({color:0x050507,alpha:.88}).stroke({color:0xff315d,width:2.5,alpha:.9});c.addChild(bg);const st={fontFamily:"Arial",fontSize:14,fontWeight:"900",fill:0xffffff};c.spin=new e.PIXI.Text({text:"SPIN",style:st});c.wilds=new e.PIXI.Text({text:"TATTOOS 0",style:{...st,fill:0xff97b0}});c.win=new e.PIXI.Text({text:"WIN 0",style:st});c.spin.position.set(16,12);c.wilds.position.set(205,12);c.win.position.set(390,12);c.addChild(c.spin,c.wilds,c.win);c.scale.set(Math.min(1,(e.app.screen.width-20)/560));c.position.set(10,10);e.layers.ui.addChild(c);this.hud=c;}
  updateHud(i,n,win,w){if(!this.hud)return;this.hud.spin.text=`SPIN ${i}/${n}`;this.hud.wilds.text=`TATTOOS ${w}`;this.hud.win.text=`WIN ${fmt(win)}`;}
  destroyHud(){if(this.hud){try{this.hud.destroy({children:true});}catch{}this.hud=null;}}
  toIdle(){const e=this.engine;if(e.fsm.current!==GameState.BASE_IDLE){if(e.fsm.can(GameState.BASE_IDLE))e.fsm.transition(GameState.BASE_IDLE);else e.fsm.current=GameState.BASE_IDLE;}}
}
function fmt(n){return Math.floor(Number(n)||0).toLocaleString("ru-RU");}function label(p,b){p=Number(p||0);return p?`WIN ${fmt(p)} • ×${(p/Math.max(1,Number(b)||1)).toFixed(2)}`:"NO WIN";}function wait(ms){return new Promise(r=>setTimeout(r,ms));}function timeline(tl){return new Promise(r=>tl.eventCallback("onComplete",r));}
