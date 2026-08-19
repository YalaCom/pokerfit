import {GameState} from "../../core/GameStateMachine.js";
import {CoinRevealAnimator} from "./CoinRevealAnimator.js";
import {CollectorController} from "./CollectorController.js";

export class CoinFeatureController{
  constructor(engine){this.engine=engine;this.animator=new CoinRevealAnimator(engine);this.collector=new CollectorController(engine,this.animator);}
  destroy(){this.animator?.destroy();this.animator=null;this.collector=null;}
  async play(feature,{mode="base",onStatus=()=>{}}={}){
    if(!feature?.layers?.length)return 0;
    const e=this.engine,bonus=mode==="bonus";
    this.animator.clear();this.animator.ensureCoins(feature.positions||[]);this.animator.setDimmed(true);
    if(!bonus){e.fsm.transition(GameState.COIN_FEATURE_TRIGGER);e.audio.play("coinTrigger",{volume:1});e.haptics.impact("medium");}
    for(let i=0;i<feature.layers.length;i++){
      const layer=feature.layers[i];
      if(bonus){if(!e.fsm.is(GameState.FINAL_COIN_REVEAL))e.fsm.transition(GameState.FINAL_COIN_REVEAL);}else{if(i===0)e.fsm.transition(GameState.COIN_REVEAL);else if(e.fsm.is(GameState.COIN_REFRESH))e.fsm.transition(GameState.COIN_REVEAL);}
      onStatus(`${bonus?"FINAL":"COIN"} REVEAL • LAYER ${i+1}`);await this.animator.revealLayer(layer);
      if(Number(layer.layerMultiplier||1)>1){if(!bonus&&e.fsm.is(GameState.COIN_REVEAL))e.fsm.transition(GameState.COIN_MULTIPLIER);await this.animator.showMultiplier(layer.layerMultiplier);}
      if(layer.collector){
        if(bonus){if(!e.fsm.is(GameState.BONUS_COLLECTOR))e.fsm.transition(GameState.BONUS_COLLECTOR);}else{if(e.fsm.is(GameState.COIN_REVEAL,GameState.COIN_MULTIPLIER))e.fsm.transition(GameState.COLLECTOR_TRIGGER);e.fsm.transition(GameState.COLLECTING);}
        onStatus(`COLLECTOR • ${Number(layer.creditedX||0).toFixed(layer.creditedX%1?2:0)}x`);await this.collector.collect(layer,{bonus});
      }
      if(layer.refresh){
        if(bonus){if(!e.fsm.is(GameState.BONUS_COIN_REFRESH))e.fsm.transition(GameState.BONUS_COIN_REFRESH);}else{if(!e.fsm.is(GameState.COIN_REFRESH))e.fsm.transition(GameState.COIN_REFRESH);}
        onStatus("COIN REFRESH");await this.animator.refresh(layer.usedCollectors||[]);
      }
    }
    if(!bonus){if(!e.fsm.is(GameState.COIN_FEATURE_END))e.fsm.transition(GameState.COIN_FEATURE_END);}this.animator.setDimmed(false);await wait(100);this.animator.clear();return Number(feature.payout||0);
  }
}
function wait(ms){return new Promise(r=>setTimeout(r,ms));}
