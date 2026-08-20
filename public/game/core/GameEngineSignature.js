import {GameEngine as HoundGameEngine} from "./GameEngineHound.js";
import {GameState} from "./GameStateMachine.js";
import {KozyrController} from "../games/KozyrController.js";
import {PadaplelovController} from "../games/PadaplelovController.js";
export class GameEngine extends HoundGameEngine{
  async loadGame(gameId,onProgress=()=>{}){
    const config=await super.loadGame(gameId,onProgress);
    if(config?.controller==="KOZYR"){
      this.controller?.destroy?.();this.controller=new KozyrController(this);if(this.fsm.current!==GameState.BASE_IDLE)this.forceIdle(true);
    }else if(config?.controller==="PADAPLELOV"){
      this.controller?.destroy?.();this.controller=new PadaplelovController(this);if(this.fsm.current!==GameState.BASE_IDLE)this.forceIdle(true);
    }
    return config;
  }
}
