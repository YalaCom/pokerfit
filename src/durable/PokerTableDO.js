import {
  STAGES,createTableState,seatPlayer,removeSeat,canStartHand,startHand,
  applyAction,timeoutAction,publicSnapshot,potSize
} from "../poker/engine.js";
import { debit,credit,addXp } from "../db.js";
import { awardSeasonScore } from "../season.js";

export class PokerTableDO {
  constructor(ctx,env){
    this.ctx=ctx;
    this.env=env;
    this.state=null;
    this.ready=this.load();
  }

  async load(){ this.state=await this.ctx.storage.get("table")||null; }

  async fetch(request){
    await this.ready;
    const url=new URL(request.url);
    if(url.pathname==="/connect"&&request.headers.get("Upgrade")==="websocket")return this.connect(request);
    if(url.pathname==="/snapshot")return Response.json(this.state||{});
    if(url.pathname==="/control/start"&&request.method==="POST"){
      if(this.state&&canStartHand(this.state)){startHand(this.state);await this.afterMutation();}
      return Response.json({ok:true});
    }
    if(url.pathname==="/control/blinds"&&request.method==="POST"){
      const body=await request.json();
      if(this.state){
        this.state.sb=Math.max(1,Number(body.sb||this.state.sb));
        this.state.bb=Math.max(this.state.sb*2,Number(body.bb||this.state.bb));
        this.state.minRaise=Math.max(this.state.minRaise||0,this.state.bb);
        this.state.blindLevel=Number(body.level||this.state.blindLevel||1);
        await this.persist();await this.broadcast();
      }
      return Response.json({ok:true});
    }
    if(url.pathname==="/control/stop"&&request.method==="POST"){
      await this.safeStop();return Response.json({ok:true});
    }
    return new Response("Not found",{status:404});
  }

  async connect(request){
    const user=safeJson(request.headers.get("x-fit-user"))||{};
    const config=safeJson(request.headers.get("x-fit-table"))||{};
    const mode=request.headers.get("x-fit-mode")||"player";
    const buyin=Number(request.headers.get("x-fit-buyin")||0);
    if(!user.id)return new Response("Unauthorized",{status:401});

    if(!this.state){
      this.state=createTableState({
        id:config.id,name:config.name,mode:config.kind||"cash",
        tournamentId:config.tournament_id||null,sb:Number(config.sb),bb:Number(config.bb),
        maxPlayers:Number(config.max_players),turnSeconds:Number(config.turn_seconds)
      });
    }

    const pair=new WebSocketPair(),client=pair[0],server=pair[1];
    this.ctx.acceptWebSocket(server);

    if(mode==="spectator"){
      server.serializeAttachment({mode:"spectator",userId:String(user.id),lastChatAt:0});
      this.send(server,{type:"snapshot",table:publicSnapshot(this.state,null,true),serverTime:Date.now(),turnDeadline:this.state.turnDeadline||null});
      return new Response(null,{status:101,webSocket:client});
    }

    try{ await this.joinPlayer(user,config,buyin); }
    catch(error){ try{server.close(4000,String(error?.message||"JOIN_FAILED"));}catch{} return new Response(null,{status:101,webSocket:client}); }

    server.serializeAttachment({mode:"player",userId:String(user.id),lastChatAt:0});
    const seat=this.findSeat(user.id);
    if(seat){seat.connected=true;seat.disconnectedAt=null;}
    await this.persist();await this.updateTableCount();await this.broadcast();
    if(canStartHand(this.state)){startHand(this.state);await this.afterMutation();}
    else await this.scheduleAlarm();
    return new Response(null,{status:101,webSocket:client});
  }

  async joinPlayer(user,config,buyin){
    const userId=String(user.id),existing=this.findSeat(userId);
    if(existing){
      existing.connected=true;existing.name=user.name||existing.name;existing.username=user.username||existing.username;
      existing.photoUrl=user.photoUrl||existing.photoUrl;return;
    }
    if(this.state.seats.filter(Boolean).length>=this.state.maxPlayers)throw new Error("TABLE_FULL");

    const session=await this.env.DB.prepare(`SELECT table_id,stack,buyin FROM table_sessions WHERE telegram_id=?1 LIMIT 1`).bind(userId).first();
    if(session&&session.table_id!==this.state.id)throw new Error("ALREADY_AT_ANOTHER_TABLE");
    let stack=0;

    if(this.state.mode==="tournament"){
      const tp=await this.env.DB.prepare(`SELECT stack,status,table_id FROM tournament_players WHERE tournament_id=?1 AND telegram_id=?2 LIMIT 1`)
        .bind(this.state.tournamentId,userId).first();
      if(!tp||!["registered","playing"].includes(tp.status))throw new Error("NOT_IN_TOURNAMENT");
      if(tp.table_id&&tp.table_id!==this.state.id)throw new Error("WRONG_TOURNAMENT_TABLE");
      stack=Number(tp.stack||config.start_stack||0);
      if(stack<=0)throw new Error("NO_TOURNAMENT_STACK");
    }else{
      const min=Number(config.min_buyin||this.state.bb*50),max=Number(config.max_buyin||this.state.bb*200);
      stack=session?Number(session.stack):Math.floor(Number(buyin));
      if(!session&&(!Number.isFinite(stack)||stack<min||stack>max))throw new Error("INVALID_BUYIN");
      if(!session){
        await this.env.DB.prepare(`INSERT INTO table_sessions(telegram_id,table_id,buyin,stack,status) VALUES(?1,?2,?3,?3,'joining')`)
          .bind(userId,this.state.id,stack).run();
        try{
          await debit(this.env,userId,stack,"TABLE_BUYIN",`table_buyin:${this.state.id}:${userId}:${crypto.randomUUID()}`,{tableId:this.state.id});
        }catch(error){
          await this.env.DB.prepare(`DELETE FROM table_sessions WHERE telegram_id=?1 AND table_id=?2`).bind(userId,this.state.id).run();
          throw error;
        }
      }
    }

    const seatNo=seatPlayer(this.state,{id:userId,name:user.name,username:user.username,photoUrl:user.photoUrl,stack});
    if(this.state.mode==="tournament"){
      await this.env.DB.prepare(`UPDATE tournament_players SET status='playing',table_id=?3,seat_no=?4,stack=?5 WHERE tournament_id=?1 AND telegram_id=?2`)
        .bind(this.state.tournamentId,userId,this.state.id,seatNo,stack).run();
    }else{
      await this.env.DB.prepare(`UPDATE table_sessions SET seat_no=?3,stack=?4,status='seated',updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?1 AND table_id=?2`)
        .bind(userId,this.state.id,seatNo,stack).run();
    }
  }

  async webSocketMessage(ws,message){
    await this.ready;
    let data;try{data=JSON.parse(typeof message==="string"?message:new TextDecoder().decode(message));}catch{return this.send(ws,{type:"error",error:"BAD_MESSAGE"});}
    const a=ws.deserializeAttachment()||{};if(a.mode!=="player")return;
    const userId=String(a.userId);
    try{
      if(data.type==="action"){
        const actionId=String(data.actionId||crypto.randomUUID());
        if(this.state.actionLog.some(x=>x.actionId===actionId))return this.send(ws,{type:"ack",actionId,duplicate:true});
        applyAction(this.state,userId,data.action,data.amount,actionId);
        await this.afterMutation();this.send(ws,{type:"ack",actionId});return;
      }
      if(data.type==="sitout"){const s=this.findSeat(userId);if(s)s.sittingOut=true;await this.afterMutation();return;}
      if(data.type==="back"){const s=this.findSeat(userId);if(s){s.sittingOut=false;s.timeoutCount=0;}if(canStartHand(this.state))startHand(this.state);await this.afterMutation();return;}
      if(data.type==="leave"){await this.requestLeave(userId);return;}
      if(data.type==="chat"){
        const now=Date.now(),allowed=["Хорошая игра","Nice Hand","Удачи","Спасибо","Wow","GG"];
        if(now-Number(a.lastChatAt||0)<5000)throw new Error("CHAT_COOLDOWN");
        if(!allowed.includes(String(data.text||"")))throw new Error("CHAT_NOT_ALLOWED");
        a.lastChatAt=now;ws.serializeAttachment(a);await this.broadcastEvent({type:"chat",userId,text:data.text,at:now});return;
      }
    }catch(error){this.send(ws,{type:"error",error:String(error?.message||"ACTION_FAILED")});}
  }

  async webSocketClose(ws){
    await this.ready;const a=ws.deserializeAttachment()||{};if(a.mode!=="player")return;
    const s=this.findSeat(a.userId);if(s){s.connected=false;s.disconnectedAt=Date.now();await this.persist();await this.broadcast();await this.scheduleAlarm();}
  }
  async webSocketError(ws){return this.webSocketClose(ws);}

  async requestLeave(userId){
    const s=this.findSeat(userId);if(!s)return;
    const inHand=s.hole?.length===2&&![STAGES.WAITING,STAGES.COMPLETE].includes(this.state.stage);
    if(inHand){s.leaveAfterHand=true;s.connected=false;await this.afterMutation();}
    else{await this.cashoutAndRemove(userId);await this.afterMutation();}
  }

  async cashoutAndRemove(userId){
    const s=this.findSeat(userId);if(!s)return;const stack=Number(s.stack||0);
    if(this.state.mode==="cash"){
      if(stack>0)await credit(this.env,userId,stack,"TABLE_CASHOUT",`table_cashout:${this.state.id}:${userId}:${crypto.randomUUID()}`,{tableId:this.state.id});
      await this.env.DB.prepare(`DELETE FROM table_sessions WHERE telegram_id=?1 AND table_id=?2`).bind(String(userId),this.state.id).run();
    }else if(this.state.mode==="tournament"){
      await this.env.DB.prepare(`UPDATE tournament_players SET stack=?3,table_id=NULL,seat_no=NULL WHERE tournament_id=?1 AND telegram_id=?2`)
        .bind(this.state.tournamentId,String(userId),stack).run();
    }
    removeSeat(this.state,userId);await this.updateTableCount();
  }

  async afterMutation(){
    if(this.state.stage===STAGES.COMPLETE&&this.state.handId&&this.state.settledHandId!==this.state.handId){
      await this.recordCompletedHand();this.state.settledHandId=this.state.handId;this.state.nextHandAt=Date.now()+3000;
      for(const s of [...this.state.seats]){
        if(!s)continue;if(s.leaveAfterHand)await this.cashoutAndRemove(s.id);
        if(this.state.mode==="tournament"&&s.stack<=0)await this.eliminateTournamentPlayer(s);
      }
    }
    await this.persist();await this.broadcast();await this.notifyTurnIfDisconnected();await this.scheduleAlarm();
  }

  async recordCompletedHand(){
    const r=this.state.lastResult;if(!r)return;const pot=Number(r.pot||potSize(this.state));
    const winners=new Map((r.winners||[]).map(w=>[String(w.id),Number(w.amount||0)]));
    const combos=new Map((r.combinations||[]).map(c=>[String(c.id),c.hand]));
    const stmts=[this.env.DB.prepare(`INSERT OR IGNORE INTO hands(id,table_id,hand_no,dealer_seat,sb,bb,board,pot,winners,status,started_at,completed_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,'complete',?10,?11)`)
      .bind(this.state.handId,this.state.id,this.state.handNo,this.state.dealerSeat,this.state.sb,this.state.bb,JSON.stringify(r.board||this.state.board),pot,JSON.stringify(r.winners||[]),this.state.handStartedAt||new Date().toISOString(),r.completedAt||new Date().toISOString())];
    for(const s of this.state.seats){
      if(!s||s.hole?.length!==2)continue;const award=winners.get(s.id)||0,net=award-Number(s.contribution||0);
      stmts.push(this.env.DB.prepare(`INSERT OR IGNORE INTO hand_players(hand_id,telegram_id,seat_no,hole_cards,contribution,result,combination,folded) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)`)
        .bind(this.state.handId,s.id,s.seat,JSON.stringify(s.hole),Number(s.contribution||0),net,combos.get(s.id)||null,s.folded?1:0));
      stmts.push(this.env.DB.prepare(`UPDATE user_stats SET hands_played=hands_played+1,hands_won=hands_won+?2,biggest_pot=MAX(biggest_pot,?3),total_won=total_won+?4,total_lost=total_lost+?5,all_ins=all_ins+?6,all_ins_won=all_ins_won+?7,updated_at=CURRENT_TIMESTAMP WHERE telegram_id=?1`)
        .bind(s.id,award>0?1:0,pot,Math.max(0,net),Math.max(0,-net),s.allIn?1:0,s.allIn&&award>0?1:0));
    }
    for(const a of this.state.actionLog){stmts.push(this.env.DB.prepare(`INSERT OR IGNORE INTO hand_actions(hand_id,telegram_id,street,action,amount,pot_after,action_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)`).bind(this.state.handId,a.playerId,a.street,a.action,Number(a.amount||0),Number(a.pot||0),a.actionId,a.at));}
    await this.env.DB.batch(stmts);
    for(const s of this.state.seats){if(s?.hole?.length===2){const pts=winners.has(s.id)?20:5;await addXp(this.env,s.id,pts);await awardSeasonScore(this.env,s.id,pts);}}
    if(this.state.mode==="tournament")for(const s of this.state.seats){if(s)await this.env.DB.prepare(`UPDATE tournament_players SET stack=?3 WHERE tournament_id=?1 AND telegram_id=?2`).bind(this.state.tournamentId,s.id,Number(s.stack||0)).run();}
  }

  async eliminateTournamentPlayer(s){
    const row=await this.env.DB.prepare(`SELECT COUNT(*) AS c FROM tournament_players WHERE tournament_id=?1 AND status IN ('registered','playing') AND stack>0`).bind(this.state.tournamentId).first();
    const placement=Number(row?.c||0)+1;
    await this.env.DB.prepare(`UPDATE tournament_players SET status='eliminated',placement=?3,eliminated_at=CURRENT_TIMESTAMP,stack=0 WHERE tournament_id=?1 AND telegram_id=?2`).bind(this.state.tournamentId,s.id,placement).run();
    removeSeat(this.state,s.id);await this.updateTableCount();
  }

  async alarm(){
    await this.ready;const now=Date.now();
    for(const s of this.state?.seats||[])if(s&&!s.connected&&s.disconnectedAt&&now-s.disconnectedAt>60000)s.sittingOut=true;
    if(this.state?.stage===STAGES.COMPLETE&&this.state.nextHandAt&&now>=this.state.nextHandAt){this.state.nextHandAt=null;if(canStartHand(this.state))startHand(this.state);else this.state.stage=STAGES.WAITING;await this.afterMutation();return;}
    if(this.state&&![STAGES.WAITING,STAGES.COMPLETE].includes(this.state.stage)&&this.state.turnDeadline&&now>=this.state.turnDeadline){timeoutAction(this.state);await this.afterMutation();return;}
    await this.persist();await this.broadcast();await this.scheduleAlarm();
  }

  async scheduleAlarm(){
    if(!this.state)return;let next=null;
    if(![STAGES.WAITING,STAGES.COMPLETE].includes(this.state.stage)&&this.state.actionSeat>=0){
      if(!this.state.turnDeadline||this.state.turnSeat!==this.state.actionSeat){this.state.turnSeat=this.state.actionSeat;this.state.turnDeadline=Date.now()+this.state.turnSeconds*1000;}
      next=this.state.turnDeadline;
    }else{this.state.turnDeadline=null;this.state.turnSeat=null;}
    if(this.state.stage===STAGES.COMPLETE&&this.state.nextHandAt)next=next?Math.min(next,this.state.nextHandAt):this.state.nextHandAt;
    const reconnect=this.state.seats.filter(s=>s&&!s.connected&&s.disconnectedAt&&!s.sittingOut).map(s=>s.disconnectedAt+60000);
    if(reconnect.length){const d=Math.min(...reconnect);next=next?Math.min(next,d):d;}
    if(next)await this.ctx.storage.setAlarm(next);
  }

  async safeStop(){
    if(!this.state)return;
    for(const s of [...this.state.seats]){
      if(!s)continue;s.stack+=Number(s.contribution||0);s.contribution=0;s.streetBet=0;
      if(this.state.mode==="cash"){
        if(s.stack>0)await credit(this.env,s.id,s.stack,"ADMIN_TABLE_STOP_REFUND",`admin_stop:${this.state.id}:${s.id}:${crypto.randomUUID()}`,{tableId:this.state.id});
        await this.env.DB.prepare(`DELETE FROM table_sessions WHERE telegram_id=?1 AND table_id=?2`).bind(s.id,this.state.id).run();
      }
    }
    this.state.seats=Array.from({length:this.state.maxPlayers},()=>null);this.state.stage=STAGES.WAITING;this.state.actionSeat=-1;this.state.turnDeadline=null;
    await this.env.DB.prepare(`UPDATE tables SET status='closed',current_players=0,updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(this.state.id).run();
    await this.persist();await this.broadcastEvent({type:"table_closed",reason:"ADMIN_STOP"});for(const ws of this.ctx.getWebSockets())try{ws.close(4001,"TABLE_CLOSED");}catch{}
  }

  async notifyTurnIfDisconnected(){
    if(!this.state||this.state.actionSeat<0||[STAGES.WAITING,STAGES.COMPLETE].includes(this.state.stage))return;
    const s=this.state.seats[this.state.actionSeat];if(!s||s.connected||s.sittingOut)return;
    const key=`${this.state.handId}:${s.id}:${this.state.actionSeat}`;if(this.state.turnNotificationKey===key)return;this.state.turnNotificationKey=key;
    try{await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:s.id,text:"♠ FIT POKER CLUB\n\nВаш ход за покерным столом.",reply_markup:{inline_keyboard:[[{text:"ВЕРНУТЬСЯ ЗА СТОЛ",web_app:{url:this.env.APP_URL}}]]}})});}catch{}
  }

  findSeat(id){return this.state?.seats.find(s=>s?.id===String(id))||null;}
  async persist(){if(this.state)await this.ctx.storage.put("table",this.state);}
  async updateTableCount(){if(!this.state)return;await this.env.DB.prepare(`UPDATE tables SET current_players=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?1`).bind(this.state.id,this.state.seats.filter(Boolean).length).run();}
  async broadcast(){for(const ws of this.ctx.getWebSockets()){const a=ws.deserializeAttachment()||{},spectator=a.mode==="spectator";this.send(ws,{type:"snapshot",table:publicSnapshot(this.state,spectator?null:a.userId,spectator),serverTime:Date.now(),turnDeadline:this.state.turnDeadline||null});}}
  async broadcastEvent(event){for(const ws of this.ctx.getWebSockets())this.send(ws,event);}
  send(ws,data){try{ws.send(JSON.stringify(data));}catch{}}
}

function safeJson(value){try{return JSON.parse(value||"{}");}catch{return null;}}
