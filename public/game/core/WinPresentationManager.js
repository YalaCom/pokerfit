import {AnimatedNumberCounter} from "./AnimatedNumberCounter.js";

export class WinPresentationManager{
  constructor({app,rootLayer,particleManager,audio,haptics,camera,thresholds={nice:5,big:15,mega:50,epic:100,max:1000}}){this.app=app;this.PIXI=window.PIXI;this.root=rootLayer;this.particles=particleManager;this.audio=audio;this.haptics=haptics;this.camera=camera;this.thresholds=thresholds;this.counter=new AnimatedNumberCounter({audio});this.overlay=this.#makeOverlay();}
  tier(win,bet){const x=Number(win||0)/Math.max(1,Number(bet||1));if(x>=this.thresholds.max)return "MAX WIN";if(x>=this.thresholds.epic)return "EPIC WIN";if(x>=this.thresholds.mega)return "MEGA WIN";if(x>=this.thresholds.big)return "BIG WIN";if(x>=this.thresholds.nice)return "NICE WIN";return x>0?"WIN":"";}
  async present(win,bet,{tier=null}={}){win=Math.max(0,Math.floor(Number(win)||0));if(!win)return;tier=tier||this.tier(win,bet);if(tier==="WIN"){this.audio.play("smallWin");return;}
    const W=this.app.screen.width,H=this.app.screen.height,tl=gsap.timeline();this.overlay.visible=true;this.overlay.alpha=0;this.overlay.x=W/2;this.overlay.y=H/2;this.overlay.title.text=tier;this.overlay.amount.text="0";this.overlay.burst.scale.set(.2);this.overlay.burst.alpha=0;
    this.audio.play(tier==="NICE WIN"?"smallWin":"bigWin");tier==="MAX WIN"?this.haptics.jackpot():this.haptics.bigWin();
    tl.to(this.overlay,{alpha:1,duration:.18}).to(this.overlay.burst,{alpha:.9,duration:.12},0).to(this.overlay.burst.scale,{x:1,y:1,duration:.55,ease:"back.out(2.5)"},0).fromTo(this.overlay.title.scale,{x:.55,y:.55},{x:1.08,y:1.08,duration:.42,ease:"back.out(3)"},.05).to(this.overlay.title.scale,{x:1,y:1,duration:.15},.46);
    if(this.camera&&tier!=="NICE WIN")tl.to(this.camera,{rotation:.006,duration:.045,yoyo:true,repeat:5,ease:"none"},.08).to(this.camera,{rotation:0,duration:.04});
    await timelineDone(tl);this.particles.emit(tier==="MAX WIN"?"jackpotExplosion":"coinBurst",W/2,H*.48,{count:tier==="NICE WIN"?24:52});this.particles.emit("starBurst",W/2,H*.4,{count:28});
    await this.counter.run(win,v=>this.overlay.amount.text=format(v),{duration:duration(tier)});await wait(tier==="MAX WIN"?900:550);await timelineDone(gsap.timeline().to(this.overlay,{alpha:0,duration:.28}));this.overlay.visible=false;}
  #makeOverlay(){const c=new this.PIXI.Container();c.visible=false;c.zIndex=1000;const dim=new this.PIXI.Graphics().roundRect(-900,-900,1800,1800,0).fill({color:0x03050a,alpha:.76});const burst=new this.PIXI.Graphics();for(let i=0;i<32;i++){const a=i/32*Math.PI*2,inner=86,outer=i%2?260:190;burst.moveTo(Math.cos(a)*inner,Math.sin(a)*inner).lineTo(Math.cos(a+.04)*outer,Math.sin(a+.04)*outer).stroke({color:0xf5c861,width:i%2?3:1,alpha:.35});}const title=new this.PIXI.Text({text:"BIG WIN",style:{fontFamily:"Arial",fontSize:54,fontWeight:"900",fill:0xffdf7b,stroke:{color:0x5d2c00,width:5},letterSpacing:2,align:"center"}});title.anchor.set(.5);title.y=-42;const amount=new this.PIXI.Text({text:"0",style:{fontFamily:"Arial",fontSize:42,fontWeight:"900",fill:0xffffff,stroke:{color:0x07090f,width:5},align:"center"}});amount.anchor.set(.5);amount.y=32;c.addChild(dim,burst,title,amount);c.title=title;c.amount=amount;c.burst=burst;this.root.addChild(c);return c;}
}
function duration(t){return t==="MAX WIN"?4.5:t==="EPIC WIN"?3.8:t==="MEGA WIN"?3.1:t==="BIG WIN"?2.4:1.7;}
function format(n){return Math.floor(n).toLocaleString("ru-RU");}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
function timelineDone(tl){return new Promise(r=>tl.eventCallback("onComplete",r));}
