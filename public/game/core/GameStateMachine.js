export const GameState=Object.freeze({
  BOOT:"BOOT",LOADING:"LOADING",IDLE:"IDLE",BETTING:"BETTING",SPIN_START:"SPIN_START",SPINNING:"SPINNING",ANTICIPATION:"ANTICIPATION",REEL_STOP:"REEL_STOP",EVALUATING:"EVALUATING",SMALL_WIN:"SMALL_WIN",BIG_WIN:"BIG_WIN",BONUS_TRIGGER:"BONUS_TRIGGER",BONUS_INTRO:"BONUS_INTRO",BONUS_PLAYING:"BONUS_PLAYING",BONUS_OUTRO:"BONUS_OUTRO",FREE_SPINS:"FREE_SPINS",MAX_WIN:"MAX_WIN",RETURN_TO_BASE_GAME:"RETURN_TO_BASE_GAME",ERROR:"ERROR"
});

const FLOW={
  BOOT:["LOADING","ERROR"],
  LOADING:["IDLE","ERROR"],
  IDLE:["BETTING","SPIN_START","LOADING","ERROR"],
  BETTING:["IDLE","SPIN_START","ERROR"],
  SPIN_START:["SPINNING","ERROR"],
  SPINNING:["ANTICIPATION","REEL_STOP","ERROR"],
  ANTICIPATION:["REEL_STOP","BONUS_TRIGGER","ERROR"],
  REEL_STOP:["EVALUATING","ERROR"],
  EVALUATING:["SMALL_WIN","BIG_WIN","BONUS_TRIGGER","IDLE","ERROR"],
  SMALL_WIN:["BONUS_TRIGGER","IDLE","ERROR"],
  BIG_WIN:["BONUS_TRIGGER","MAX_WIN","IDLE","ERROR"],
  MAX_WIN:["BONUS_TRIGGER","IDLE","ERROR"],
  BONUS_TRIGGER:["BONUS_INTRO","ERROR"],
  BONUS_INTRO:["BONUS_PLAYING","FREE_SPINS","ERROR"],
  BONUS_PLAYING:["BONUS_OUTRO","ERROR"],
  FREE_SPINS:["BONUS_OUTRO","ERROR"],
  BONUS_OUTRO:["RETURN_TO_BASE_GAME","ERROR"],
  RETURN_TO_BASE_GAME:["IDLE","ERROR"],
  ERROR:["LOADING","IDLE"]
};

export class GameStateMachine extends EventTarget{
  constructor(initial=GameState.BOOT){super();this.current=initial;this.previous=null;}
  can(next){return next===this.current||(FLOW[this.current]||[]).includes(next);}
  transition(next,detail={}){
    if(!this.can(next))throw new Error(`INVALID_GAME_STATE:${this.current}->${next}`);
    if(next===this.current)return this.current;
    const previous=this.current;this.previous=previous;this.current=next;
    this.dispatchEvent(new CustomEvent("change",{detail:{previous,current:next,...detail}}));
    return next;
  }
  is(...states){return states.includes(this.current);}
  assert(...states){if(!this.is(...states))throw new Error(`STATE_BLOCKED:${this.current}`);}
}
