export class AnimatedNumberCounter{
  constructor({gsap=window.gsap,audio=null}={}){this.gsap=gsap;this.audio=audio;}
  async run(target,onUpdate,{duration=null}={}){target=Math.max(0,Math.floor(Number(target)||0));duration=duration??durationFor(target);const state={value:0},started=performance.now();let lastTick=0;await new Promise(resolve=>this.gsap.to(state,{value:target,duration,ease:"power2.out",onUpdate:()=>{const now=performance.now(),value=Math.floor(state.value);onUpdate(value);if(now-lastTick>55){lastTick=now;const p=Math.min(1,(now-started)/(duration*1000));this.audio?.coinTick?.(p);}},onComplete:()=>{onUpdate(target);resolve();}}));}
}
function durationFor(v){if(v>=100_000_000)return 4.4;if(v>=10_000_000)return 3.6;if(v>=1_000_000)return 2.8;if(v>=100_000)return 2.1;return 1.25;}
