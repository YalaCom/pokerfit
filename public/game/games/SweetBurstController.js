import {GameState} from "../core/GameStateMachine.js";

export class SweetBurstController{
  constructor(engine){this.engine=engine;this.hud=null;this.bombGlow=[];}
  destroy(){this.destroyHud();this.clearBombGlow();}
  async presentSpin(serverResponse,{onBalance=()=>{},onStatus=()=>{}}={}){
    const e=this.engine,result=serverResponse?.result,bet=Number(serverResponse?.bet||0);
    if(!result?.initialGrid||!bet)throw new Error("BAD_SWEET_RESULT");
    try{
      e.fsm.transition(GameState.BASE_SPIN);onStatus("SWEET SPIN");e.audio.play("spin",{volume:.82,rate:1.05});e.haptics.impact("medium");e.reels.startSpin();
      await e.reels.stopOnGrid(result.initialGrid,{
        anticipationReel:Number.isInteger(result.anticipationReel)?result.anticipationReel:-1,stopDuration:.38,staggerMs:50,
        onAnticipation:async c=>{e.audio.startAnticipation();e.setCameraZoom(1.018,.22);this.reelGlow(c);onStatus("LOLLIPOP?");},
        onReelStop:c=>{e.audio.play("reel",{volume:.46,rate:1.02+c*.025});e.haptics.reelStop();},
        onScatterStop:()=>{e.audio.play("scatter",{volume:.92,rate:1.08});e.haptics.scatter();}
      });
      e.audio.stopAnticipation({restore:!result.bonusTriggered});e.setCameraZoom(1,.16);
      let cascadeNo=0;
      for(const cascade of result.cascades||[]){
        cascadeNo++;onStatus(`TUMBLE ${cascadeNo} • +${fmt(cascade.payout)}`);
        await e.reels.animateWins(cascade.wins||[]);
        await this.sugarBurst(cascade.removed||[]);
        await e.reels.animateCascade(cascade,e.particles);
        e.audio.play("burst",{volume:.78,rate:1.08});
      }
      const baseWin=Number(result.basePayout||0);
      if(baseWin>0&&!result.bonusTriggered){
        const tier=e.win.tier(baseWin,bet);
        if(tier!=="RETURN")await e.win.present(baseWin,bet,{tier});
      }
      if(result.bonusTriggered&&result.bonus){
        if(!e.fsm.is(GameState.BONUS_TRIGGER))e.fsm.transition(GameState.BONUS_TRIGGER);
        await this.playBonus(result,bet,onStatus);
      }else this.toIdle();
      onBalance(serverResponse.balance);onStatus(result.maxWinHit?"MAX WIN":label(serverResponse.payout,bet));return serverResponse;
    }catch(error){
      try{e.audio.stopAnticipation({restore:true});e.setCameraZoom(1,.1);e.setBonusScene(false);e.reels.setGrid(result.finalGrid||result.initialGrid);}catch{}
      this.destroyHud();this.clearBombGlow();e.forceIdle(true);throw error;
    }
  }
  async playBonus(result,bet,onStatus){
    const e=this.engine,bonus=result.bonus;
    e.fsm.transition(GameState.BONUS_INTRO);await this.bonusIntro();await e.audio.enterBonusMusic();e.setBonusScene(true);this.createHud();
    e.fsm.transition(GameState.BONUS_PLAYING);let total=0;
    for(let i=0;i<(bonus.frames||[]).length;i++){
      const frame=bonus.frames[i];this.updateHud(i+1,bonus.frames.length,total,0);onStatus(`FREE SPIN ${i+1}/${bonus.frames.length}`);
      this.clearBombGlow();e.audio.play("spin",{volume:.64,rate:1.12});e.reels.startSpin();
      await e.reels.stopOnGrid(frame.initialGrid,{
        anticipationReel:Number.isInteger(frame.anticipationReel)?frame.anticipationReel:-1,stopDuration:.34,staggerMs:43,
        onAnticipation:async c=>{e.audio.startAnticipation();this.reelGlow(c);onStatus(`FREE SPIN ${i+1} • LOLLIPOP?`);},
        onReelStop:c=>{e.audio.play("reel",{volume:.37,rate:1.05+c*.02});e.haptics.reelStop();},
        onScatterStop:()=>{e.audio.play("scatter",{volume:.84,rate:1.1});e.haptics.scatter();}
      });
      e.audio.stopAnticipation({restore:false});
      await this.syncBombGlow(findBombs(frame.initialGrid));
      for(const cascade of frame.cascades||[]){
        onStatus(`FREE SPIN ${i+1} • TUMBLE ${cascade.index}`);
        await e.reels.animateWins(cascade.wins||[]);
        await this.sugarBurst(cascade.removed||[]);
        await e.reels.animateCascade(cascade,e.particles);
        await this.syncBombGlow(cascade.bombsAfter||[]);
        e.audio.play("burst",{volume:.74,rate:1.12});
      }
      if(frame.bombMultiplier>0&&frame.tumbleWin>0){
        onStatus(`CANDY BOMBS ×${frame.bombMultiplier}`);
        await this.collectBombs(frame.bombPositions||[],frame.bombMultiplier);
      }else if((frame.bombPositions||[]).length){
        await this.dudBombs(frame.bombPositions||[]);
      }
      if(frame.payout>0){
        const tier=e.win.tier(frame.payout,bet);
        if(!["RETURN","WIN"].includes(tier))await e.win.present(frame.payout,bet,{tier});
      }
      total+=Number(frame.payout||0);this.updateHud(i+1,bonus.frames.length,total,frame.bombMultiplier||0);
      if(frame.retrigger>0)await this.retrigger(frame.retrigger);
      await wait(160);this.clearBombGlow();
    }
    if(total>0){const tier=e.win.tier(total,bet);await e.win.present(total,bet,{tier});}
    e.fsm.transition(GameState.BONUS_OUTRO);await this.bonusOutro(total);this.destroyHud();this.clearBombGlow();
    await e.audio.exitBonusMusic();e.setBonusScene(false);e.fsm.transition(GameState.RETURN_BASE);e.fsm.transition(GameState.BASE_IDLE);
  }
  async sugarBurst(positions){
    const e=this.engine,p=(positions||[]).slice(0,e.quality==="LOW"?10:24);
    for(const pos of p){const c=e.reels.visibleCenter(pos.r,pos.c);e.particles.emit("starBurst",c.x,c.y,{count:e.quality==="LOW"?3:7,tint:0xff8fd8,speed:64,life:.48});}
    if(p.length){e.haptics.impact("light");await wait(75);}
  }
  async syncBombGlow(bombs=[]){
    this.clearBombGlow();const e=this.engine;
    for(const b of bombs||[]){
      const rect=e.reels.cellRect(b.r,b.c),g=new e.PIXI.Graphics().circle(rect.x+rect.width/2,rect.y+rect.height/2,Math.min(rect.width,rect.height)*.42)
        .fill({color:0xff78d5,alpha:.06}).stroke({color:0xfff09a,width:3,alpha:.86});
      g.zIndex=130;g.alpha=.25;e.layers.foreground.addChild(g);gsap.to(g,{alpha:.9,duration:.45,yoyo:true,repeat:-1,ease:"sine.inOut"});this.bombGlow.push(g);
    }
  }
  clearBombGlow(){for(const g of this.bombGlow.splice(0)){try{gsap.killTweensOf(g);g.destroy();}catch{}}}
  async collectBombs(bombs,total){
    const e=this.engine,W=e.app.screen.width,H=e.app.screen.height;if(!bombs.length)return;
    e.audio.play(total>=50?"bigWin":"wild",{volume:1,rate:total>=50?.9:1.12});e.haptics.impact(total>=50?"heavy":"medium");
    const pieces=[];
    for(const b of bombs.slice(0,12)){
      const c=e.reels.visibleCenter(b.r,b.c),t=new e.PIXI.Text({text:`×${b.value}`,style:{fontFamily:"Arial",fontSize:Math.max(17,W*.04),fontWeight:"900",fill:0xffffbc,stroke:{color:0x8b2268,width:5}}});
      t.anchor.set(.5);t.position.set(c.x,c.y);t.zIndex=1200;e.layers.ui.addChild(t);pieces.push(t);
      gsap.to(t,{x:W/2,y:H*.39,duration:.35+Math.random()*.16,delay:Math.random()*.12,ease:"power2.in"});
    }
    await wait(430);for(const t of pieces)t.destroy();
    const tag=new e.PIXI.Container(),bg=new e.PIXI.Graphics().roundRect(-150,-48,300,96,30).fill({color:0x6d194f,alpha:.93}).stroke({color:0xffffa8,width:4,alpha:.96});
    const text=new e.PIXI.Text({text:`SUGAR ×${total}`,style:{fontFamily:"Arial",fontSize:Math.max(30,Math.min(62,W*.085)),fontWeight:"900",fill:0xffffce,stroke:{color:0x742255,width:7},letterSpacing:2}});
    text.anchor.set(.5);tag.addChild(bg,text);tag.position.set(W/2,H*.39);tag.alpha=0;tag.zIndex=1300;e.layers.ui.addChild(tag);
    e.particles.emit("starBurst",W/2,H*.39,{count:e.quality==="LOW"?16:38,tint:0xffed9b});
    await timeline(gsap.timeline().fromTo(tag.scale,{x:.38,y:.38},{x:1.08,y:1.08,duration:.25,ease:"back.out(3)"}).to(tag,{alpha:1,duration:.08},0).to(tag.scale,{x:1,y:1,duration:.1}).to(tag,{alpha:0,duration:.2},.7));
    tag.destroy({children:true});
  }
  async dudBombs(bombs){
    const e=this.engine;if(!bombs.length)return;for(const b of bombs.slice(0,8)){const c=e.reels.visibleCenter(b.r,b.c);e.particles.emit("magicTrail",c.x,c.y,{count:4,tint:0xff8fd9,speed:30,life:.35});}await wait(160);
  }
  async bonusIntro(){
    const e=this.engine,W=e.app.screen.width,H=e.app.screen.height,flash=new e.PIXI.Graphics().rect(0,0,W,H).fill({color:0xff74c8,alpha:0});
    const title=new e.PIXI.Text({text:"SWEET FREE SPINS\n10 SPINS",style:{fontFamily:"Arial",fontSize:Math.max(32,Math.min(68,W*.082)),fontWeight:"900",fill:0xffffd2,stroke:{color:0x7b1d65,width:8},align:"center",letterSpacing:2,lineHeight:62}});
    title.anchor.set(.5);title.position.set(W/2,H*.44);title.alpha=0;e.layers.ui.addChild(flash,title);e.haptics.bonus();e.audio.play("bonus",{volume:1,rate:1.08});
    e.particles.emit("starBurst",W/2,H*.43,{count:e.quality==="LOW"?22:54,tint:0xfff0a1});
    await timeline(gsap.timeline().to(flash,{alpha:.72,duration:.1}).to(flash,{alpha:0,duration:.32}).fromTo(title.scale,{x:.3,y:.3},{x:1.08,y:1.08,duration:.4,ease:"back.out(3)"},0).to(title,{alpha:1,duration:.1},0).to(title,{alpha:0,duration:.22},1.0));
    flash.destroy();title.destroy();
  }
  async retrigger(n){
    const e=this.engine,W=e.app.screen.width,H=e.app.screen.height,t=new e.PIXI.Text({text:`+${n} FREE SPINS`,style:{fontFamily:"Arial",fontSize:Math.max(34,W*.078),fontWeight:"900",fill:0xffffbd,stroke:{color:0x861f68,width:8},letterSpacing:2}});
    t.anchor.set(.5);t.position.set(W/2,H*.43);t.alpha=0;e.layers.ui.addChild(t);e.audio.play("bonus",{volume:.9,rate:1.18});e.haptics.bonus();e.particles.emit("starBurst",W/2,H*.43,{count:30,tint:0xff94dc});
    await timeline(gsap.timeline().fromTo(t.scale,{x:.3,y:.3},{x:1.06,y:1.06,duration:.3,ease:"back.out(3)"}).to(t,{alpha:1,duration:.1},0).to(t,{alpha:0,duration:.2},.72));t.destroy();
  }
  async bonusOutro(total){
    const e=this.engine,W=e.app.screen.width,H=e.app.screen.height,t=new e.PIXI.Text({text:`BONUS COMPLETE\n${fmt(total)}`,style:{fontFamily:"Arial",fontSize:Math.max(30,W*.072),fontWeight:"900",fill:0xffffcf,stroke:{color:0x7c1f63,width:8},align:"center",lineHeight:56}});
    t.anchor.set(.5);t.position.set(W/2,H*.44);t.alpha=0;e.layers.ui.addChild(t);e.particles.emit("starBurst",W/2,H*.44,{count:38,tint:0xffe59d});
    await timeline(gsap.timeline().fromTo(t.scale,{x:.4,y:.4},{x:1,y:1,duration:.3,ease:"back.out(2.8)"}).to(t,{alpha:1,duration:.1},0).to(t,{alpha:0,duration:.22},.9));t.destroy();
  }
  reelGlow(column){const e=this.engine,r=e.reels;if(!r||column<0||column>=r.reels.length)return;const x=r.originX+column*(r.cellW+r.gap),y=r.originY,g=new e.PIXI.Graphics().roundRect(x-4,y-6,r.cellW+8,r.boardH+12,15).fill({color:0xff6fcd,alpha:.05}).stroke({color:0xffffa8,width:4,alpha:.95});g.alpha=0;e.layers.foreground.addChild(g);gsap.timeline({onComplete:()=>g.destroy()}).to(g,{alpha:1,duration:.08}).to(g,{alpha:.25,duration:.16,yoyo:true,repeat:5}).to(g,{alpha:0,duration:.1});}
  createHud(){this.destroyHud();const e=this.engine,W=e.app.screen.width,c=new e.PIXI.Container();c.zIndex=180;const bg=new e.PIXI.Graphics().roundRect(0,0,540,64,20).fill({color:0x53113f,alpha:.82}).stroke({color:0xffffb2,width:2.5,alpha:.8});c.addChild(bg);const style={fontFamily:"Arial",fontSize:14,fontWeight:"900",fill:0xffffd4},spin=new e.PIXI.Text({text:"FREE SPIN 1/10",style}),mult=new e.PIXI.Text({text:"BOMBS ×0",style:{...style,fill:0xff9fe3}}),win=new e.PIXI.Text({text:"WIN 0",style:{...style,fill:0xffffff}});spin.position.set(16,10);mult.position.set(220,10);win.position.set(16,38);c.addChild(spin,mult,win);c.spin=spin;c.mult=mult;c.win=win;c.scale.set(Math.min(1,(W-20)/540));c.position.set(10,10);e.layers.ui.addChild(c);this.hud=c;}
  updateHud(spin,totalSpins,win,mult){if(!this.hud)return;this.hud.spin.text=`FREE SPIN ${spin}/${totalSpins}`;this.hud.mult.text=`BOMBS ×${mult||0}`;this.hud.win.text=`WIN ${fmt(win)}`;}
  destroyHud(){if(this.hud){try{this.hud.destroy({children:true});}catch{}this.hud=null;}}
  toIdle(){const e=this.engine;if(e.fsm.current!==GameState.BASE_IDLE){if(e.fsm.can(GameState.BASE_IDLE))e.fsm.transition(GameState.BASE_IDLE);else e.fsm.current=GameState.BASE_IDLE;}}
}
function findBombs(grid){const out=[];for(let r=0;r<(grid||[]).length;r++)for(let c=0;c<(grid[r]||[]).length;c++){const m=String(grid[r][c]||"").match(/^bomb_(\d+)$/);if(m)out.push({r,c,value:Number(m[1])});}return out;}
function label(payout,bet){payout=Number(payout)||0;return payout?`${payout<bet?"RETURN":"WIN"} ${fmt(payout)} • ×${(payout/bet).toFixed(2)}`:"NO WIN";}
function fmt(n){return Math.floor(Number(n)||0).toLocaleString("ru-RU");}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function timeline(tl){return new Promise(r=>tl.eventCallback("onComplete",r));}
