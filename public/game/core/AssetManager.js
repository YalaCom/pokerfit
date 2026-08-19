export class AssetManager{
  constructor(PIXI,{manifestUrl="/assets/assets.manifest.json"}={}){this.PIXI=PIXI;this.manifestUrl=manifestUrl;this.manifest=null;this.loaded=new Map();}
  async loadManifest(){if(this.manifest)return this.manifest;const r=await fetch(this.manifestUrl,{cache:"no-store"});if(!r.ok)throw new Error("ASSET_MANIFEST_FAILED");this.manifest=await r.json();return this.manifest;}
  async loadGame(gameId,onProgress=()=>{}){
    const manifest=await this.loadManifest(),entry=manifest.games?.[gameId];if(!entry)throw new Error(`ASSET_GAME_MISSING:${gameId}`);
    if(this.loaded.has(gameId)){onProgress(1);return this.loaded.get(gameId);}
    const config=await this.#json(entry.config);onProgress(.08);
    const resources={config,entry,textures:{},extras:{}};
    const emojiOnly=(config.symbols||[]).length>0&&(config.symbols||[]).every(id=>config.emojiSymbols?.[id]);
    if(emojiOnly){resources.atlas=null;onProgress(.46);}else{
      if(!entry.atlas)throw new Error(`ATLAS_MISSING:${gameId}`);
      const atlasData=await this.#json(entry.atlas);onProgress(.18);
      let sheet=null;try{sheet=await this.PIXI.Assets.load(entry.atlas);}catch(error){console.warn("PIXIJ_SPRITESHEET_FALLBACK",error);}
      if(sheet?.textures&&this.#hasAllTextures(sheet.textures,config.symbols))resources.textures=sheet.textures;
      else resources.textures=await this.#manualAtlas(entry.atlas,atlasData,config.symbols);
      resources.atlas=sheet||{textures:resources.textures};onProgress(.46);
    }
    const loadList=[["background",entry.background],["bonusBackground",entry.bonusBackground],["cover",entry.cover]].filter(([,url])=>url);let done=0;
    const extraEntries=Object.entries(entry.extras||{});const totalLoads=Math.max(1,loadList.length+extraEntries.length);
    for(const [key,url] of loadList){const asset=await this.PIXI.Assets.load(url);if(!asset)throw new Error(`ASSET_LOAD_FAILED:${url}`);resources[key]=asset;done++;onProgress(.46+(done/totalLoads)*.52);}
    for(const [key,url] of extraEntries){const asset=await this.PIXI.Assets.load(url);if(!asset)throw new Error(`ASSET_LOAD_FAILED:${url}`);resources.extras[key]=asset;done++;onProgress(.46+(done/totalLoads)*.52);}
    this.#validate(resources);this.loaded.set(gameId,resources);onProgress(1);return resources;
  }
  getGame(gameId){return this.loaded.get(gameId)||null;}
  async unloadGame(gameId){const r=this.loaded.get(gameId);if(!r)return;for(const url of [r.entry?.atlas,r.entry?.background,r.entry?.bonusBackground,r.entry?.cover,...Object.values(r.entry?.extras||{})].filter(Boolean)){try{await this.PIXI.Assets.unload(url);}catch{}}for(const t of Object.values(r.textures||{}))try{t.destroy?.(false);}catch{}this.loaded.delete(gameId);}
  async #manualAtlas(atlasUrl,data,required){
    const image=data?.meta?.image;if(!image)throw new Error(`ATLAS_IMAGE_MISSING:${atlasUrl}`);const imageUrl=new URL(image,new URL(atlasUrl,location.origin)).href,base=await this.PIXI.Assets.load(imageUrl);if(!base?.source)throw new Error(`ATLAS_SOURCE_FAILED:${imageUrl}`);
    try{base.source.scaleMode="linear";}catch{}
    const textures={};for(const id of required||Object.keys(data.frames||{})){const def=data.frames?.[id],f=def?.frame;if(!f)throw new Error(`ATLAS_FRAME_MISSING:${id}`);const orig=def.sourceSize||{w:f.w,h:f.h};textures[id]=new this.PIXI.Texture({source:base.source,frame:new this.PIXI.Rectangle(f.x,f.y,f.w,f.h),orig:new this.PIXI.Rectangle(0,0,orig.w,orig.h),label:`${id}@${atlasUrl}`});}
    return textures;
  }
  #hasAllTextures(textures,ids){return (ids||[]).every(id=>textures?.[id]&&textures[id]!==this.PIXI.Texture.WHITE);}
  #validate(resources){const missing=(resources.config.symbols||[]).filter(id=>!resources.config.emojiSymbols?.[id]&&(!resources.textures?.[id]||resources.textures[id]===this.PIXI.Texture.WHITE));if(missing.length)throw new Error(`MISSING_SYMBOL_TEXTURES:${missing.join(",")}`);if(!resources.background)throw new Error("BACKGROUND_TEXTURE_MISSING");if(!resources.bonusBackground)throw new Error("BONUS_BACKGROUND_TEXTURE_MISSING");}
  async #json(url){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error(`ASSET_JSON_FAILED:${url}`);return r.json();}
}
