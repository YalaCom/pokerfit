import {GameEngine as BaseGameEngine} from "./GameEngine.js";
import {GameState} from "./GameStateMachine.js";
import {SweetBurstController} from "../games/SweetBurstController.js";

export class GameEngine extends BaseGameEngine{
  async loadGame(gameId,onProgress=()=>{}){
    const config=await super.loadGame(gameId,onProgress);
    if(config?.controller==="SWEET_BURST"){
      this.controller?.destroy?.();
      this.controller=new SweetBurstController(this);
      if(this.fsm.current!==GameState.BASE_IDLE)this.forceIdle(true);
    }
    return config;
  }
}
