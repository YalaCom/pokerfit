import {GameState} from "../core/GameStateMachine.js";

export class BlackHoundController{
  constructor(engine){this.engine=engine;this.hud=null;this.sticky=[];this.chainFx=[];}
  destroy(){this.destroyHud();this.clearSticky();this.clearChainFx();}
  async presentSpin(serverResponse,{onBalance=()=>{},onStatus=()=>{}}={}){
    const e=this.engine,result=serverResponse?.result,bet=Number(serverResponse?.bet||0);
    if(!result?.initialGrid||!bet)throw new Error("BAD_BLACK_HOUND_RESULT");
    try{
      e.fsm.transition(GameState.BASE_SPIN);onStatus("HOUND SPIN");e.audio.play("spin",{volume:.85,rate:.94});e.haptics.impact("medium");e.reels.startSpin();
      await e.reels.stopOnGrid(result.initialGrid,{stopDuration:.42,staggerMs:58,onReelStop:c=>{e.audio.play("reel",{volume:.5,rate:.88+c*.025});e.haptics.reelStop();},onScatterStop:()=>{e.audio.play("scatter",{volume:.9,rate:.82});e.haptics.scatter();}});
      if((result.chainLinks||[]).length){onStatus("CHAIN LINK");await this.animateChains(result.chainLinks);e.reels.setGrid(result.featureGrid||result.initialGrid);}
      if((result.wins||[]).length){onStatus(`PACK WIN +${fmt(sumWins(result.wins))}`);await e.reels.animateWins(result.wins);await this.biteHits(result.wins);}
      if(result.scatterPayout>0)await e.reels.animateWins([{symbol:"kennel_scatter",positions:result.scatterPositions||[],amount:result.scatterPayout}]);
      if(result.bonusTriggered&&result.bonus){e.fsm.transition(GameState.BONUS_TRIGGER);await this.playBonus(result.bonus,bet,onStatus);}else this.toIdle();
      onBalance(serverResponse.balance);onStatus(result.maxWinHit?"MAX WIN":label(serverResponse.payout,bet));return serverResponse;
    }catch(error){try{e.setBonusScene(false);e.reels.setGrid(result.featureGrid||result.initialGrid);}catch{}this.destroyHud();this.clearSticky();this.clearChainFx();e.forceIdle(true);throw error;}
  }
  async playBonus(bonus,bet,onStatus){
    const e=this.engine,tier=bonus.tier||{};
    e.fsm.transition(GameState.BONUS_INTRO);await this.bonusIntro(tier);await e.audio.enterBonusMusic();e.setBonusScene(true);this.createHud(tier);this.clearSticky();
    e.fsm.transition(GameState.BONUS_PLAYING);let total=0;
    for(let i=0;i<(bonus.frames||[]).length;i++){
      const frame=bonus.frames[i];onStatus(`${tier.name||"BONUS"} ${i+1}/${bonus.frames.length}`);this.updateHud(i+1,bonus.frames.length,total,frame.stickyAfter?.length||0,tier);
      e.audio.play("spin",{volume:.68,rate:.96});e.reels.startSpin();await e.reels.stopOnGrid(frame.initialGrid,{stopDuration:.36,staggerMs:44,onReelStop:c=>{e.audio.play("reel",{volume:.4,rate:.9+c*.02});e.haptics.reelStop();},onScatterStop:()=>{e.audio.play("scatter",{volume:.78,rate:.86});e.haptics.scatter();}});
      if((frame.newSticky||[]).length)await this.stickyLand(frame.newSticky,tier);
      this.syncSticky(frame.stickyBefore||frame.stickyAfter||[],tier);
      if((frame.chainLinks||[]).length){await this.animateChains(frame.chainLinks);e.reels.setGrid(frame.featureGrid||frame.initialGrid);this.syncSticky(frame.stickyBefore||frame.stickyAfter||[],tier);}
      if((frame.wins||[]).length){await e.reels.animateWins(frame.wins);await this.biteHits(frame.wins);}
      if(frame.scatterPayout>0)await e.reels.animateWins([{symbol:"kennel_scatter",positions:frame.scatterPositions||[],amount:frame.scatterPayout}]);
      if((frame.upgraded||[]).length)await this.upgradeSticky(frame.upgraded,tier);
      total+=Number(frame.payout||0);this.syncSticky(frame.stickyAfter||[],tier,frame.upgraded||[]);this.updateHud(i+1,bonus.frames.length,total,frame.stickyAfter?.length||0,tier);await wait(160);
    }
    if(total>0){const wt=e.win.tier(total,bet);await e.win.present(total,bet,{tier:wt});}
    e.fsm.transition(GameState.BONUS_OUTRO);await this.bonusOutro(total,tier);this.destroyHud();this.clearSticky();await e.audio.exitBonusMusic();e.setBonusScene(false);e.fsm.transition(GameState.RETURN_BASE);e.fsm.transition(GameState.BASE_IDLE);
  }
  async animateChains(links=[]){
    const e=this.engine,W=e.app.screen.width;this.clearChainFx();e.audio.play("wild",{volume:.9,rate:.72});e.haptics.impact("heavy");
    for(const link of links){const a=e.reels.visibleCenter(link.row,link.from),b=e.reels.visibleCenter(link.row,link.to);const g=new e.PIXI.Graphics();g.zIndex=900;g.moveTo(a.x,a.y).lineTo(b.x,b.y).stroke({color:0xff493d,width:9,alpha:.25});g.moveTo(a.x,a.y).lineTo(b.x,b.y).stroke({color:0xffcf80,width:3,alpha:.98});e.layers.foreground.addChild(g);this.chainFx.push(g);
      const dog=new e.PIXI.Text({text:"◆",style:{fontFamily:"Arial",fontSize:Math.max(28,W*.055),fontWeight:"900",fill:0x08090c,stroke:{color:0xff4c3f,width:5}}});dog.anchor.set(.5);dog.position.set(a.x,a.y);dog.zIndex=920;e.layers.foreground.addChild(dog);this.chainFx.push(dog);gsap.to(dog,{x:b.x,duration:.34,ease:"power3.inOut"});for(const p of link.positions||[]){const c=e.reels.visibleCenter(p.r,p.c);e.particles.emit("symbolExplosion",c.x,c.y,{count:e.quality==="LOW"?4:9,tint:0xff4b3d,speed:70,life:.45});}}
    await wait(390);this.clearChainFx();
  }
  async stickyLand(list,tier){const e=this.engine;for(const w of list){const c=e.reels.visibleCenter(w.r,w.c);e.particles.emit("starBurst",c.x,c.y,{count:e.quality==="LOW"?10:22,tint:hex(tier.accent,0xff4538),speed:80,life:.65});}e.audio.play("bonus",{volume:.75,rate:.72});e.haptics.impact("heavy");await wait(240);}
  syncSticky(list=[],tier,upgrades=[]){
    this.clearSticky();const e=this.engine,tint=hex(tier.accent,0xff4538),upgradeMap=new Map((upgrades||[]).map(x=>[`${x.r}:${x.c}`,x.to]));
    for(const w of list){const rect=e.reels.cellRect(w.r,w.c),wrap=new e.PIXI.Container();wrap.zIndex=980;const bg=new e.PIXI.Graphics().roundRect(rect.x+4,rect.y+4,rect.width-8,rect.height-8,14).fill({color:0x050609,alpha:.18}).stroke({color:tint,width:3.5,alpha:.96});const tag=new e.PIXI.Text({text:`×${upgradeMap.get(`${w.r}:${w.c}`)||w.multiplier}`,style:{fontFamily:"Arial",fontSize:Math.max(16,Math.min(28,rect.width*.28)),fontWeight:"900",fill:0xffffff,stroke:{color:tint,width:5}}});tag.anchor.set(.5);tag.position.set(rect.x+rect.width/2,rect.y+rect.height*.79);wrap.addChild(bg,tag);e.layers.foreground.addChild(wrap);this.sticky.push(wrap);}
  }
  clearSticky(){for(const x of this.sticky.splice(0))try{x.destroy({children:true});}catch{}}
  clearChainFx(){for(const x of this.chainFx.splice(0))try{x.destroy({children:true});}catch{}}
  async biteHits(wins=[]){
    const e=this.engine,used=new Map();for(const w of wins)for(const s of w.stickyWilds||[])used.set(`${s.r}:${s.c}`,s);if(!used.size)return;
    e.audio.play("wild",{volume:.88,rate:.7});e.haptics.impact("heavy");for(const s of used.values()){const c=e.reels.visibleCenter(s.r,s.c);e.particles.emit("starBurst",c.x,c.y,{count:16,tint:0xff5b43,speed:88,life:.55});const t=new e.PIXI.Text({text:`BITE ×${s.multiplier}`,style:{fontFamily:"Arial",fontSize:Math.max(18,e.app.screen.width*.043),fontWeight:"900",fill:0xfff0d1,stroke:{color:0x7d0d13,width:6}}});t.anchor.set(.5);t.position.set(c.x,c.y);t.zIndex=1200;e.layers.ui.addChild(t);gsap.timeline({onComplete:()=>t.destroy()}).fromTo(t.scale,{x:.35,y:.35},{x:1.12,y:1.12,duration:.2,ease:"back.out(3)"}).to(t,{alpha:0,y:c.y-38,duration:.36},.34);}await wait(520);
  }
  async upgradeSticky(upgrades,tier){if(!upgrades.length)return;const e=this.engine;e.audio.play("bonus",{volume:.68,rate:1.22});for(const u of upgrades){const c=e.reels.visibleCenter(u.r,u.c);const t=new e.PIXI.Text({text:`RAGE ${u.from}→${u.to}`,style:{fontFamily:"Arial",fontSize:Math.max(16,e.app.screen.width*.038),fontWeight:"900",fill:0xffffff,stroke:{color:hex(tier.accent,0xff4538),width:6}}});t.anchor.set(.5);t.position.set(c.x,c.y-16);t.zIndex=1300;e.layers.ui.addChild(t);gsap.timeline({onComplete:()=>t.destroy()}).fromTo(t.scale,{x:.5,y:.5},{x:1,y:1,duration:.18,ease:"back.out(2.8)"}).to(t,{alpha:0,y:c.y-60,duration:.35},.38);}await wait(480);}
  async bonusIntro(tier){
    const e=this.engine,W=e.app.screen.width,H=e.app.screen.height,tint=hex(tier.accent,0xff4538),flash=new e.PIXI.Graphics().rect(0,0,W,H).fill({color:tint,alpha:0});const title=new e.PIXI.Text({text:`${tier.name||"BLACK HOUND"}\n${tier.spins||0} FREE SPINS`,style:{fontFamily:"Arial",fontSize:Math.max(30,Math.min(66,W*.078)),fontWeight:"900",fill:0xffffff,stroke:{color:0x050506,width:9},align:"center",letterSpacing:3,lineHeight:58}});title.anchor.set(.5);title.position.set(W/2,H*.43);title.alpha=0;e.layers.ui.addChild(flash,title);e.audio.play("bonus",{volume:1,rate:.78});e.haptics.bonus();e.particles.emit("starBurst",W/2,H*.43,{count:e.quality==="LOW"?24:52,tint});await timeline(gsap.timeline().to(flash,{alpha:.6,duration:.1}).to(flash,{alpha:0,duration:.28}).fromTo(title.scale,{x:.25,y:.25},{x:1.06,y:1.06,duration:.38,ease:"back.out(3)"},0).to(title,{alpha:1,duration:.08},0).to(title,{alpha:0,duration:.22},1));flash.destroy();title.destroy();
  }
  createHud(tier){this.destroyHud();const e=this.engine,W=e.app.screen.width,tint=hex(tier.accent,0xff4538),c=new e.PIXI.Container();c.zIndex=1500;const bg=new e.PIXI.Graphics().roundRect(0,0,560,66,18).fill({color:0x05070a,alpha:.86}).stroke({color:tint,width:2.5,alpha:.9});c.addChild(bg);const style={fontFamily:"Arial",fontSize:14,fontWeight:"900",fill:0xffffff};const name=new e.PIXI.Text({text:tier.name||"BONUS",style:{...style,fill:tint}}),spin=new e.PIXI.Text({text:"1/1",style}),wilds=new e.PIXI.Text({text:"HOUNDS 0",style:{...style,fill:0xffd39a}}),win=new e.PIXI.Text({text:"WIN 0",style});name.position.set(16,9);spin.position.set(300,9);wilds.position.set(16,39);win.position.set(300,39);c.addChild(name,spin,wilds,win);c.name=name;c.spin=spin;c.wilds=wilds;c.win=win;c.scale.set(Math.min(1,(W-20)/560));c.position.set(10,10);e.layers.ui.addChild(c);this.hud=c;}
  updateHud(spin,total,win,wilds,tier){if(!this.hud)return;this.hud.name.text=tier.name||"BONUS";this.hud.spin.text=`SPIN ${spin}/${total}`;this.hud.wilds.text=`LOCKED HOUNDS ${wilds}`;this.hud.win.text=`WIN ${fmt(win)}`;}
  destroyHud(){if(this.hud){try{this.hud.destroy({children:true});}catch{}this.hud=null;}}
  async bonusOutro(total,tier){const e=this.engine,W=e.app.screen.width,H=e.app.screen.height,tint=hex(tier.accent,0xff4538),t=new e.PIXI.Text({text:`PACK PAID\n${fmt(total)}`,style:{fontFamily:"Arial",fontSize:Math.max(32,W*.074),fontWeight:"900",fill:0xffffff,stroke:{color:tint,width:8},align:"center",lineHeight:58}});t.anchor.set(.5);t.position.set(W/2,H*.43);t.alpha=0;e.layers.ui.addChild(t);e.particles.emit("starBurst",W/2,H*.43,{count:42,tint});await timeline(gsap.timeline().fromTo(t.scale,{x:.3,y:.3},{x:1,y:1,duration:.3,ease:"back.out(3)"}).to(t,{alpha:1,duration:.08},0).to(t,{alpha:0,duration:.22},.92));t.destroy();}
  toIdle(){const e=this.engine;if(e.fsm.current!==GameState.BASE_IDLE){if(e.fsm.can(GameState.BASE_IDLE))e.fsm.transition(GameState.BASE_IDLE);else e.fsm.current=GameState.BASE_IDLE;}}
}
function sumWins(wins){return (wins||[]).reduce((s,w)=>s+Number(w.amount||0),0);}function fmt(n){return Math.floor(Number(n)||0).toLocaleString("ru-RU");}function label(p,b){p=Number(p||0);return p?`WIN ${fmt(p)} • ×${(p/Math.max(1,Number(b)||1)).toFixed(2)}`:"NO WIN";}function wait(ms){return new Promise(r=>setTimeout(r,ms));}function timeline(tl){return new Promise(r=>tl.eventCallback("onComplete",r));}function hex(v,f){if(typeof v==="number")return v;const s=String(v||"").replace("#","");const n=parseInt(s,16);return Number.isFinite(n)?n:f;}
