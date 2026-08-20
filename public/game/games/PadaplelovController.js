import {GameState} from "../core/GameStateMachine.js";
export class PadaplelovController{
  constructor(engine){this.engine=engine;this.hud=null;this.columnFx=[];}
  destroy(){this.destroyHud();this.clearColumns();}
  async presentSpin(serverResponse,{onBalance=()=>{},onStatus=()=>{}}={}){
    const e=this.engine,r=serverResponse?.result,bet=Number(serverResponse?.bet||0);if(!r?.initialGrid||!bet)throw new Error("BAD_PADAPLELOV_RESULT");
    try{
      e.fsm.transition(GameState.BASE_SPIN);onStatus("TAP SPIN");e.audio.play("spin",{volume:.8,rate:.96});e.haptics.impact("medium");e.reels.startSpin();
      await e.reels.stopOnGrid(r.initialGrid,{stopDuration:.4,staggerMs:50,onReelStop:()=>{e.audio.play("reel",{volume:.46,rate:.95});e.haptics.reelStop();},onScatterStop:()=>{e.audio.play("scatter",{volume:.86});e.haptics.scatter();}});
      if((r.barrelColumns||[]).length){onStatus("BARREL BLAST");await this.barrelBlast(r.barrelColumns);e.reels.setGrid(r.featureGrid||r.initialGrid);}
      if((r.wins||[]).length){onStatus(`BAR WIN +${fmt(sumWins(r.wins))}`);await e.reels.animateWins(r.wins);}
      if(r.scatterPayout>0)await e.reels.animateWins([{symbol:"tap_scatter",positions:r.scatterPositions||[],amount:r.scatterPayout}]);
      if(r.bonusTriggered&&r.bonus){e.fsm.transition(GameState.BONUS_TRIGGER);await this.playBonus(r.bonus,bet,onStatus);}else this.toIdle();
      onBalance(serverResponse.balance);onStatus(r.maxWinHit?"MAX WIN":label(serverResponse.payout,bet));return serverResponse;
    }catch(error){this.destroyHud();this.clearColumns();try{e.setBonusScene(false);}catch{}e.forceIdle(true);throw error;}
  }
  async playBonus(bonus,bet,onStatus){
    const e=this.engine;e.fsm.transition(GameState.BONUS_INTRO);await this.bonusIntro();await e.audio.enterBonusMusic();e.setBonusScene(true);this.createHud();
    e.fsm.transition(GameState.BONUS_PLAYING);let total=0;
    for(let i=0;i<(bonus.frames||[]).length;i++){
      const f=bonus.frames[i];onStatus(`NIGHT TAP ${i+1}/${bonus.frames.length} • FOAM ×${f.multiplier||1}`);this.updateHud(i+1,bonus.frames.length,total,f.foam||0,f.multiplier||1);
      e.audio.play("spin",{volume:.66,rate:1});e.reels.startSpin();await e.reels.stopOnGrid(f.initialGrid,{stopDuration:.35,staggerMs:40,onReelStop:()=>e.haptics.reelStop(),onScatterStop:()=>e.haptics.scatter()});
      if((f.goldKegs||[]).length)await this.goldKeg(f.goldKegs);
      if((f.barrelColumns||[]).length){await this.barrelBlast(f.barrelColumns,true);e.reels.setGrid(f.featureGrid||f.initialGrid);}
      if((f.wins||[]).length)await e.reels.animateWins(f.wins);
      if(f.scatterPayout>0)await e.reels.animateWins([{symbol:"tap_scatter",positions:f.scatterPositions||[],amount:f.scatterPayout}]);
      if(f.retrigger>0)await this.retrigger(f.retrigger);
      total+=Number(f.payout||0);this.updateHud(i+1,bonus.frames.length,total,f.foam||0,f.multiplier||1);await wait(140);
    }
    if(total>0)await e.win.present(total,bet,{tier:e.win.tier(total,bet)});
    e.fsm.transition(GameState.BONUS_OUTRO);await this.bonusOutro(total,bonus.finalMultiplier||1);this.destroyHud();this.clearColumns();await e.audio.exitBonusMusic();e.setBonusScene(false);e.fsm.transition(GameState.RETURN_BASE);e.fsm.transition(GameState.BASE_IDLE);
  }
  async barrelBlast(cols=[],bonus=false){const e=this.engine;this.clearColumns();e.audio.play("wild",{volume:.88,rate:.66});e.haptics.impact("heavy");for(const c of cols){const top=e.reels.cellRect(0,c),bottom=e.reels.cellRect(e.config.rows-1,c),g=new e.PIXI.Graphics().roundRect(top.x+3,top.y+3,top.width-6,bottom.y+bottom.height-top.y-6,18).fill({color:0xf0b33a,alpha:.08}).stroke({color:bonus?0xffd973:0xe9a83a,width:4,alpha:.96});g.zIndex=1000;e.layers.foreground.addChild(g);this.columnFx.push(g);for(let r=0;r<e.config.rows;r++){const p=e.reels.visibleCenter(r,c);e.particles.emit("starBurst",p.x,p.y,{count:e.quality==="LOW"?5:12,tint:0xffce5a,speed:64,life:.5});}}const W=e.app.screen.width,t=new e.PIXI.Text({text:"BARREL BLAST",style:{fontFamily:"Arial",fontSize:Math.max(24,W*.06),fontWeight:"900",fill:0xffe6a2,stroke:{color:0x4c2600,width:7},letterSpacing:2}});t.anchor.set(.5);t.position.set(W/2,e.app.screen.height*.38);t.zIndex=1400;e.layers.ui.addChild(t);await timeline(gsap.timeline().fromTo(t.scale,{x:.3,y:.3},{x:1,y:1,duration:.22,ease:"back.out(3)"}).to(t,{alpha:0,duration:.25},.45));t.destroy();await wait(100);}
  clearColumns(){for(const x of this.columnFx.splice(0))try{x.destroy({children:true});}catch{}}
  async goldKeg(list){const e=this.engine;e.audio.play("bonus",{volume:.82,rate:1.25});for(const p of list){const c=e.reels.visibleCenter(p.r,p.c);e.particles.emit("symbolExplosion",c.x,c.y,{count:24,tint:0xffe073,speed:90,life:.65});const t=new e.PIXI.Text({text:"GOLD KEG +FOAM",style:{fontFamily:"Arial",fontSize:Math.max(18,e.app.screen.width*.04),fontWeight:"900",fill:0xffffff,stroke:{color:0x8d5600,width:6}}});t.anchor.set(.5);t.position.set(c.x,c.y);t.zIndex=1300;e.layers.ui.addChild(t);gsap.timeline({onComplete:()=>t.destroy()}).fromTo(t.scale,{x:.35,y:.35},{x:1,y:1,duration:.2,ease:"back.out(3)"}).to(t,{alpha:0,y:c.y-45,duration:.35},.35);}await wait(430);}
  async retrigger(n){const e=this.engine,W=e.app.screen.width,H=e.app.screen.height,t=new e.PIXI.Text({text:`+${n} SPINS`,style:{fontFamily:"Arial",fontSize:Math.max(30,W*.072),fontWeight:"900",fill:0xffefb0,stroke:{color:0x5a2900,width:8}}});t.anchor.set(.5);t.position.set(W/2,H*.43);e.layers.ui.addChild(t);e.haptics.bonus();await timeline(gsap.timeline().fromTo(t.scale,{x:.25,y:.25},{x:1,y:1,duration:.28,ease:"back.out(3)"}).to(t,{alpha:0,duration:.25},.78));t.destroy();}
  async bonusIntro(){const e=this.engine,W=e.app.screen.width,H=e.app.screen.height,flash=new e.PIXI.Graphics().rect(0,0,W,H).fill({color:0xe2a833,alpha:0}),t=new e.PIXI.Text({text:"PADAPLELOV\nNIGHT TAP",style:{fontFamily:"Arial",fontSize:Math.max(34,W*.078),fontWeight:"900",fill:0xffefb0,stroke:{color:0x1a0d03,width:10},align:"center",letterSpacing:3,lineHeight:62}});t.anchor.set(.5);t.position.set(W/2,H*.43);t.alpha=0;e.layers.ui.addChild(flash,t);e.particles.emit("starBurst",W/2,H*.43,{count:50,tint:0xffc54d});e.haptics.bonus();await timeline(gsap.timeline().to(flash,{alpha:.58,duration:.12}).to(flash,{alpha:0,duration:.32}).fromTo(t.scale,{x:.25,y:.25},{x:1,y:1,duration:.4,ease:"back.out(3)"},0).to(t,{alpha:1,duration:.08},0).to(t,{alpha:0,duration:.25},1));flash.destroy();t.destroy();}
  async bonusOutro(total,multi){const e=this.engine,W=e.app.screen.width,H=e.app.screen.height,t=new e.PIXI.Text({text:`LAST CALL ×${multi}\n${fmt(total)}`,style:{fontFamily:"Arial",fontSize:Math.max(32,W*.074),fontWeight:"900",fill:0xffefb0,stroke:{color:0x5a2900,width:8},align:"center",lineHeight:58}});t.anchor.set(.5);t.position.set(W/2,H*.44);e.layers.ui.addChild(t);await timeline(gsap.timeline().fromTo(t.scale,{x:.3,y:.3},{x:1,y:1,duration:.3,ease:"back.out(3)"}).to(t,{alpha:0,duration:.25},.92));t.destroy();}
  createHud(){this.destroyHud();const e=this.engine,c=new e.PIXI.Container();c.zIndex=1500;const bg=new e.PIXI.Graphics().roundRect(0,0,560,68,18).fill({color:0x090705,alpha:.9}).stroke({color:0xe8ad42,width:2.5,alpha:.9});c.addChild(bg);const st={fontFamily:"Arial",fontSize:14,fontWeight:"900",fill:0xffffff};c.spin=new e.PIXI.Text({text:"SPIN",style:st});c.foam=new e.PIXI.Text({text:"FOAM 0 · ×1",style:{...st,fill:0xffd26a}});c.win=new e.PIXI.Text({text:"WIN 0",style:st});c.spin.position.set(16,12);c.foam.position.set(190,12);c.win.position.set(410,12);c.addChild(c.spin,c.foam,c.win);c.scale.set(Math.min(1,(e.app.screen.width-20)/560));c.position.set(10,10);e.layers.ui.addChild(c);this.hud=c;}
  updateHud(i,n,win,foam,m){if(!this.hud)return;this.hud.spin.text=`SPIN ${i}/${n}`;this.hud.foam.text=`FOAM ${foam} · ×${m}`;this.hud.win.text=`WIN ${fmt(win)}`;}
  destroyHud(){if(this.hud){try{this.hud.destroy({children:true});}catch{}this.hud=null;}}
  toIdle(){const e=this.engine;if(e.fsm.current!==GameState.BASE_IDLE){if(e.fsm.can(GameState.BASE_IDLE))e.fsm.transition(GameState.BASE_IDLE);else e.fsm.current=GameState.BASE_IDLE;}}
}
function sumWins(w){return (w||[]).reduce((s,x)=>s+Number(x.amount||0),0);}function fmt(n){return Math.floor(Number(n)||0).toLocaleString("ru-RU");}function label(p,b){p=Number(p||0);return p?`WIN ${fmt(p)} • ×${(p/Math.max(1,Number(b)||1)).toFixed(2)}`:"NO WIN";}function wait(ms){return new Promise(r=>setTimeout(r,ms));}function timeline(tl){return new Promise(r=>tl.eventCallback("onComplete",r));}
