import {GameEngine as SweetGameEngine} from "./GameEngineSweet.js";
import {GameState} from "./GameStateMachine.js";
import {BlackHoundController} from "../games/BlackHoundController.js";

export class GameEngine extends SweetGameEngine{
  async loadGame(gameId,onProgress=()=>{}){
    const config=await super.loadGame(gameId,onProgress);
    if(config?.controller==="BLACK_HOUND_OVERDRIVE"){
      this.controller?.destroy?.();
      this.controller=new BlackHoundController(this);
      if(this.fsm.current!==GameState.BASE_IDLE)this.forceIdle(true);
    }
    return config;
  }
}
