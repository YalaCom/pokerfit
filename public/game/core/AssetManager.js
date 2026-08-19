export class AssetManager{
  constructor(PIXI,{manifestUrl="/assets/assets.manifest.json"}={}){this.PIXI=PIXI;this.manifestUrl=manifestUrl;this.manifest=null;this.loaded=new Map();}
  async loadManifest(){if(this.manifest)return this.manifest;const r=await fetch(this.manifestUrl,{cache:"no-store"});if(!r.ok)throw new Error("ASSET_MANIFEST_FAILED");this.manifest=await r.json();return this.manifest;}
  async loadGame(gameId,onProgress=()=>{}){
    const manifest=await this.loadManifest();const entry=manifest.games?.[gameId];if(!entry)throw new Error(`ASSET_GAME_MISSING:${gameId}`);
    if(this.loaded.has(gameId)){onProgress(1);return this.loaded.get(gameId);}
    const config=await this.#json(entry.config);onProgress(.08);
    const urls=[entry.atlas,entry.background,entry.bonusBackground,entry.cover].filter(Boolean);
    const resources={config,entry,textures:{}};let done=0;
    for(const url of urls){
      const asset=await this.PIXI.Assets.load(url);resources[this.#key(url,entry)]=asset;done++;onProgress(.08+(done/urls.length)*.9);
    }
    const sheet=resources.atlas;
    if(sheet?.textures)resources.textures=sheet.textures;
    else if(sheet?.data?.frames&&sheet?.texture){resources.textures=sheet.textures||{};}
    this.loaded.set(gameId,resources);onProgress(1);return resources;
  }
  getGame(gameId){return this.loaded.get(gameId)||null;}
  async unloadGame(gameId){const r=this.loaded.get(gameId);if(!r)return;for(const url of [r.entry?.atlas,r.entry?.background,r.entry?.bonusBackground,r.entry?.cover].filter(Boolean)){try{await this.PIXI.Assets.unload(url);}catch{}}this.loaded.delete(gameId);}
  async #json(url){const r=await fetch(url,{cache:"no-store"});if(!r.ok)throw new Error(`ASSET_JSON_FAILED:${url}`);return r.json();}
  #key(url,entry){if(url===entry.atlas)return "atlas";if(url===entry.background)return "background";if(url===entry.bonusBackground)return "bonusBackground";if(url===entry.cover)return "cover";return url;}
}
