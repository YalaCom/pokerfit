export class HapticManager{
  constructor(tg=window.Telegram?.WebApp){this.tg=tg;this.enabled=true;}
  setEnabled(v){this.enabled=!!v;}
  impact(style="light"){if(!this.enabled)return;try{this.tg?.HapticFeedback?.impactOccurred?.(style);}catch{}}
  notify(type="success"){if(!this.enabled)return;try{this.tg?.HapticFeedback?.notificationOccurred?.(type);}catch{}}
  selection(){if(!this.enabled)return;try{this.tg?.HapticFeedback?.selectionChanged?.();}catch{}}
  reelStop(){this.impact("light");}
  scatter(){this.impact("medium");}
  bonus(){this.impact("heavy");setTimeout(()=>this.notify("success"),120);}
  bigWin(){this.notify("success");}
  jackpot(){this.impact("heavy");setTimeout(()=>this.notify("success"),160);setTimeout(()=>this.impact("heavy"),320);}
}
