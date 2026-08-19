export class AudioManager{
  constructor({Howl=window.Howl,Howler=window.Howler,gsap=window.gsap}={}){
    this.Howl=Howl;this.Howler=Howler;this.gsap=gsap;this.master=1;this.musicVolume=.5;this.sfxVolume=.9;this.muted=false;this.sounds=new Map();this.music=null;this.bonusMusic=null;this.ready=false;
  }
  async init(){if(this.ready)return;const defs={
    button:{freq:460,duration:.055,gain:.28},spin:{freq:150,duration:.16,gain:.25,sweep:90},reel:{freq:235,duration:.055,gain:.2},scatter:{freq:720,duration:.16,gain:.3,sweep:180},wild:{freq:520,duration:.13,gain:.24,sweep:260},burst:{freq:260,duration:.09,gain:.2,sweep:380},smallWin:{freq:620,duration:.22,gain:.2,sweep:210},bigWin:{freq:330,duration:.75,gain:.3,sweep:640},coin:{freq:880,duration:.05,gain:.18},bonus:{freq:390,duration:.8,gain:.3,sweep:720},impact:{freq:110,duration:.22,gain:.32},anticipation:{freq:94,duration:1.1,gain:.18,sweep:36},ambient:{freq:68,duration:4,gain:.08,sweep:18},bonusAmbient:{freq:102,duration:3.4,gain:.08,sweep:45}
  };
  for(const [name,d] of Object.entries(defs)){const loop=name==="anticipation"||name==="ambient"||name==="bonusAmbient";const howl=new this.Howl({src:[synthWav(d)],format:["wav"],loop,volume:loop?this.musicVolume:this.sfxVolume,preload:true});this.sounds.set(name,howl);}
  this.music=this.sounds.get("ambient");this.bonusMusic=this.sounds.get("bonusAmbient");this.ready=true;}
  play(name,{volume=1,rate=1}={}){if(this.muted)return null;const h=this.sounds.get(name);if(!h)return null;const id=h.play();h.volume(Math.max(0,Math.min(1,volume*(name.includes("Ambient")||name==="ambient"||name==="anticipation"?this.musicVolume:this.sfxVolume)*this.master)),id);h.rate(rate,id);return id;}
  stop(name){const h=this.sounds.get(name);if(h)h.stop();}
  startBaseMusic(){if(this.muted)return;this.stop("bonusAmbient");if(this.music&&!this.music.playing())this.music.play();this.music?.volume(this.musicVolume*this.master);}
  async enterBonusMusic(){this.stop("anticipation");await this.duckMusic(0,.28);this.stop("ambient");if(!this.muted){this.bonusMusic.play();this.bonusMusic.volume(this.musicVolume*this.master);} }
  async exitBonusMusic(){this.stop("bonusAmbient");if(!this.muted){this.music.play();this.music.volume(0);}await this.duckMusic(1,.42);}
  async duckMusic(level=.2,duration=.25){const target=this.musicVolume*this.master*level;const h=this.music;if(!h)return;if(!h.playing()&&!this.muted)h.play();if(this.gsap){const o={v:h.volume()||0};await new Promise(r=>this.gsap.to(o,{v:target,duration,onUpdate:()=>h.volume(o.v),onComplete:r}));}else h.volume(target);}
  startAnticipation(){this.duckMusic(.2,.25);this.play("anticipation",{volume:.9});}
  stopAnticipation({restore=true}={}){this.stop("anticipation");if(restore)this.duckMusic(1,.35);}
  coinTick(progress=0){const h=this.sounds.get("coin");if(!h||this.muted)return;const id=h.play();h.rate(.85+Math.min(1,progress)*.75,id);h.volume(this.sfxVolume*this.master*.6,id);}
  setMaster(v){this.master=clamp(v);this.Howler?.volume(this.muted?0:this.master);}
  setMusic(v){this.musicVolume=clamp(v);if(this.music?.playing())this.music.volume(this.musicVolume*this.master);if(this.bonusMusic?.playing())this.bonusMusic.volume(this.musicVolume*this.master);}
  setSfx(v){this.sfxVolume=clamp(v);}
  setMuted(v){this.muted=!!v;this.Howler?.mute(this.muted);}
}
function clamp(v){return Math.max(0,Math.min(1,Number(v)||0));}
function synthWav({freq=440,duration=.1,gain=.2,sweep=0}){const sr=12000,n=Math.max(32,Math.floor(sr*duration)),bytes=new Uint8Array(44+n*2),dv=new DataView(bytes.buffer);write(dv,0,"RIFF");dv.setUint32(4,36+n*2,true);write(dv,8,"WAVE");write(dv,12,"fmt ");dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);write(dv,36,"data");dv.setUint32(40,n*2,true);let phase=0;for(let i=0;i<n;i++){const t=i/(n-1),f=freq+sweep*t,env=Math.pow(1-t,1.6)*Math.min(1,t*20);phase+=2*Math.PI*f/sr;const sample=Math.sin(phase)*gain*env;dv.setInt16(44+i*2,Math.max(-32767,Math.min(32767,Math.round(sample*32767))),true);}let bin="",chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)bin+=String.fromCharCode(...bytes.subarray(i,i+chunk));return `data:audio/wav;base64,${btoa(bin)}`;}
function write(dv,o,s){for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));}
