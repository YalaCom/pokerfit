import {AnimatedNumberCounter} from "./AnimatedNumberCounter.js";

export class WinPresentationManager{
  constructor({app,rootLayer,particleManager,audio,haptics,camera,thresholds={nice:5,big:15,mega:50,epic:100,max:1000}}){this.app=app;this.PIXI=window.PIXI;this.root=rootLayer;this.particles=particleManager;this.audio=audio;this.haptics=haptics;this.camera=camera;this.thresholds=thresholds;this.counter=new AnimatedNumberCounter({audio});this.overlay=this.#makeOverlay();}
  tier(win,bet){const x=Number(win||0)/Math.max(1,Number(bet||1));if(x>=this.thresholds.max)return "MAX WIN";if(x>=this.thresholds.epic)return "EPIC WIN";if(x>=this.thresholds.mega)return "MEGA WIN";if(x>=this.thresholds.big)return "BIG WIN";if(x>=this.thresholds.nice)return "NICE WIN";if(x>=1)return "WIN";return x>0?"RETURN":"";}
  async present(win,bet,{tier=null}={}){
    win=Math.max(0,Math.floor(Number(win)||0));if(!win)return;tier=tier||this.tier(win,bet);
    // A payout smaller than the bet is feedback, not a celebration. Keep the board visible.
    if(tier==="RETURN"){this.audio.play("coin",{volume:.34,rate:.88});return;}
    const compact=tier==="WIN",W=this.app.screen.width,H=this.app.screen.height;
    this.overlay.visible=true;this.overlay.alpha=0;this.overlay.position.set(W/2,H/2);this.overlay.title.text=tier;this.overlay.amount.text="0";this.overlay.burst.alpha=0;this.overlay.burst.scale.set(compact?.32:.18);this.overlay.dim.alpha=compact?.18:.74;
    this.overlay.title.style.fontSize=compact?Math.max(26,Math.min(38,W*.07)):Math.max(38,Math.min(58,W*.105));this.overlay.amount.style.fontSize=compact?Math.max(28,Math.min(42,W*.08)):Math.max(38,Math.min(52,W*.095));
    this.audio.play(compact?"smallWin":"bigWin");if(!compact)(tier==="MAX WIN"?this.haptics.jackpot():this.haptics.bigWin());
    const tl=gsap.timeline().to(this.overlay,{alpha:1,duration:.14}).to(this.overlay.burst,{alpha:compact?.24:.9,duration:.12},0).to(this.overlay.burst.scale,{x:compact?.68:1,y:compact?.68:1,duration:compact?.32:.55,ease:"back.out(2.5)"},0).fromTo(this.overlay.title.scale,{x:.65,y:.65},{x:1.05,y:1.05,duration:compact?.24:.42,ease:"back.out(3)"},.03).to(this.overlay.title.scale,{x:1,y:1,duration:.12},compact?.26:.46);
    if(this.camera&&!compact)tl.to(this.camera,{rotation:.005,duration:.045,yoyo:true,repeat:tier==="MAX WIN"?7:5,ease:"none"},.08).to(this.camera,{rotation:0,duration:.04});
    await timelineDone(tl);
    if(compact)this.particles.emit("sparkBurst",W/2,H*.48,{count:10,tint:0xffd36a});
    else{this.particles.emit(tier==="MAX WIN"?"jackpotExplosion":"coinBurst",W/2,H*.48,{count:tier==="NICE WIN"?24:52});this.particles.emit("starBurst",W/2,H*.4,{count:28});}
    await this.counter.run(win,v=>this.overlay.amount.text=format(v),{duration:duration(tier)});await wait(compact?220:tier==="MAX WIN"?900:520);await timelineDone(gsap.timeline().to(this.overlay,{alpha:0,duration:compact?.18:.28}));this.overlay.visible=false;
  }
  #makeOverlay(){
    const c=new this.PIXI.Container();c.visible=false;c.zIndex=1000;
    const dim=new this.PIXI.Graphics().rect(-1000,-1000,2000,2000).fill({color:0x03050a,alpha:1});
    const burst=new this.PIXI.Graphics();for(let i=0;i<32;i++){const a=i/32*Math.PI*2,inner=86,outer=i%2?260:190;burst.moveTo(Math.cos(a)*inner,Math.sin(a)*inner).lineTo(Math.cos(a+.04)*outer,Math.sin(a+.04)*outer).stroke({color:0xf5c861,width:i%2?3:1,alpha:.35});}
    const title=new this.PIXI.Text({text:"BIG WIN",style:{fontFamily:"Arial",fontSize:54,fontWeight:"900",fill:0xffdf7b,stroke:{color:0x5d2c00,width:5},letterSpacing:2,align:"center"}});title.anchor.set(.5);title.y=-42;
    const amount=new this.PIXI.Text({text:"0",style:{fontFamily:"Arial",fontSize:42,fontWeight:"900",fill:0xffffff,stroke:{color:0x07090f,width:5},align:"center"}});amount.anchor.set(.5);amount.y=32;
    c.addChild(dim,burst,title,amount);c.title=title;c.amount=amount;c.burst=burst;c.dim=dim;this.root.addChild(c);return c;
  }
}
function duration(t){return t==="MAX WIN"?4.5:t==="EPIC WIN"?3.8:t==="MEGA WIN"?3.1:t==="BIG WIN"?2.4:t==="NICE WIN"?1.6:1.0;}
function format(n){return Math.floor(n).toLocaleString("ru-RU");}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function timelineDone(tl){return new Promise(r=>tl.eventCallback("onComplete",r));}
