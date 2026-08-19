export class CollectorController{
  constructor(engine,animator){this.engine=engine;this.animator=animator;this.PIXI=engine.PIXI;}
  async collect(layer,{bonus=false}={}){
    const e=this.engine,p=layer.collector;if(!p)return;const target=this.animator.getNode(p),cell=e.reels.visibleCenter(p.r,p.c),W=e.app.screen.width,H=e.app.screen.height;
    e.audio.play("collectorCharge",{volume:1});e.haptics.impact("heavy");
    const dim=new this.PIXI.Graphics().rect(0,0,W,H).fill({color:0x000000,alpha:.0});e.layers.ui.addChild(dim);await tween(dim,{alpha:.42,duration:.14});
    const title=new this.PIXI.Text({text:"COLLECT!",style:{fontFamily:"Arial",fontSize:Math.max(28,Math.min(58,W*.082)),fontWeight:"900",fill:0xffe077,stroke:{color:0x351500,width:6},letterSpacing:3}});title.anchor.set(.5);title.position.set(W/2,H*.31);title.alpha=0;e.layers.ui.addChild(title);
    gsap.fromTo(title.scale,{x:.35,y:.35},{x:1.12,y:1.12,duration:.24,ease:"back.out(3)"});gsap.to(title,{alpha:1,duration:.1});
    const beams=[];for(const item of layer.items||[]){if(item.kind!=="cash")continue;const from=e.reels.visibleCenter(item.r,item.c),g=new this.PIXI.Graphics().moveTo(from.x,from.y).lineTo(cell.x,cell.y).stroke({color:0xffd45a,width:4,alpha:.0});e.layers.foreground.addChild(g);beams.push(g);gsap.to(g,{alpha:.9,duration:.16,delay:Math.random()*.12});const node=this.animator.getNode(item);if(node)gsap.to(node,{x:cell.x,y:cell.y,alpha:.25,duration:.38,delay:.08+Math.random()*.1,ease:"power2.in"});}
    if(target){gsap.timeline().to(target.scale,{x:target.scale.x*1.22,y:target.scale.y*1.22,duration:.18,ease:"back.out(2.4)"}).to(target.scale,{x:target.scale.x,y:target.scale.y,duration:.16,ease:"power2.out"});}
    e.particles.emit("collectorEnergy",cell.x,cell.y,{count:30,tint:0xffd24d,speed:260,life:.9});await wait(390);e.audio.play("collectorCollect",{volume:1});e.particles.emit("jackpotExplosion",cell.x,cell.y,{count:32,tint:0xffd24f});e.setCameraZoom(1.018,.1);setTimeout(()=>e.setCameraZoom(1,.18),120);
    const result=new this.PIXI.Text({text:`COLLECTED ${Number(layer.creditedX||0).toFixed(layer.creditedX%1?2:0)}×`,style:{fontFamily:"Arial",fontSize:Math.max(20,Math.min(40,W*.058)),fontWeight:"900",fill:0xffffff,stroke:{color:0x5a2b00,width:5},letterSpacing:1}});result.anchor.set(.5);result.position.set(W/2,H*.42);result.alpha=0;e.layers.ui.addChild(result);await timeline(gsap.timeline().fromTo(result.scale,{x:.5,y:.5},{x:1.08,y:1.08,duration:.22,ease:"back.out(3)"}).to(result,{alpha:1,duration:.1},0).to(result.scale,{x:1,y:1,duration:.1}).to(result,{alpha:0,duration:.22},.62));
    for(const g of beams)g.destroy();title.destroy();result.destroy();await tween(dim,{alpha:0,duration:.16});dim.destroy();
  }
}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}function tween(target,vars){return new Promise(r=>gsap.to(target,{...vars,onComplete:r}));}function timeline(tl){return new Promise(r=>tl.eventCallback("onComplete",r));}
