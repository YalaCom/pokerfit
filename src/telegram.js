import { ensurePlayer, getPlayer } from "./db.js";
import {resolveVirtualChipRequest,notifyVirtualChipResolution,answerVirtualChipCallback} from "./virtual-chips.js";
import {approveFriendExchangeRequest,notifyFriendExchangeResolution,answerFriendExchangeCallback} from "./friend-exchange.js";

export async function telegramApi(token,method,payload) {
  const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)
  });
  const data=await r.json().catch(()=>({ok:false}));
  if(!r.ok||!data.ok)console.error("Telegram API",method,data);
  return data;
}

export async function handleTelegramWebhook(request,env) {
  try{
    const update=await request.json();

    if(update.message){
      const m=update.message;
      const player=await ensurePlayer(env,m.from);
      const text=String(m.text||"");
      const appUrl=env.APP_URL||"https://poker-club.btctgjr4t2.workers.dev";

      if(text.startsWith("/start")){
        await telegramApi(env.TELEGRAM_BOT_TOKEN,"sendMessage",{
          chat_id:m.chat.id,
          text:`♠ FIT POKER CLUB\n\nДобро пожаловать за стол, ${player.first_name}.\n\nБаланс: ${Number(player.balance).toLocaleString("ru-RU")} фишек\n\nTexas Hold'em • Blackjack • Casino\nТолько виртуальные игровые фишки.`,
          reply_markup:{inline_keyboard:[[{text:"НАЧАТЬ ИГРАТЬ",web_app:{url:appUrl}}]]}
        });
      }else if(text==="/balance"){
        await telegramApi(env.TELEGRAM_BOT_TOKEN,"sendMessage",{chat_id:m.chat.id,text:`Баланс: ${Number(player.balance).toLocaleString("ru-RU")} фишек`});
      }else if(text==="/profile"||text==="/stats"){
        const p=await getPlayer(env,String(m.from.id));
        await telegramApi(env.TELEGRAM_BOT_TOKEN,"sendMessage",{
          chat_id:m.chat.id,
          text:`♠ FIT POKER CLUB\n\n${p.first_name}\nУровень: ${p.level}\nXP: ${p.xp}\nБаланс: ${Number(p.balance).toLocaleString("ru-RU")}\n\nPoker: ${p.hands_won}/${p.hands_played}\nBlackjack: ${p.blackjack_wins}/${p.blackjack_games}\nТурниров выиграно: ${p.tournaments_won}`
        });
      }else if(text==="/tournaments"){
        await telegramApi(env.TELEGRAM_BOT_TOKEN,"sendMessage",{
          chat_id:m.chat.id,text:"Турниры находятся в Mini App.",reply_markup:{inline_keyboard:[[{text:"ТУРНИРЫ",web_app:{url:appUrl+"#tournaments"}}]]}
        });
      }else if(text==="/rating"){
        await telegramApi(env.TELEGRAM_BOT_TOKEN,"sendMessage",{
          chat_id:m.chat.id,text:"Открой рейтинг клуба.",reply_markup:{inline_keyboard:[[{text:"РЕЙТИНГ",web_app:{url:appUrl+"#rating"}}]]}
        });
      }else if(text==="/bonus"){
        await telegramApi(env.TELEGRAM_BOT_TOKEN,"sendMessage",{
          chat_id:m.chat.id,text:"Награды готовы в Mini App.",reply_markup:{inline_keyboard:[[{text:"ЗАБРАТЬ НАГРАДУ",web_app:{url:appUrl+"#rewards"}}]]}
        });
      }else if(text==="/help"){
        await telegramApi(env.TELEGRAM_BOT_TOKEN,"sendMessage",{
          chat_id:m.chat.id,
          text:"/start — клуб\n/poker — игра\n/profile — профиль\n/balance — баланс\n/stats — статистика\n/tournaments — турниры\n/rating — рейтинг\n/bonus — награды\n/help — помощь"
        });
      }else if(text==="/poker"){
        await telegramApi(env.TELEGRAM_BOT_TOKEN,"sendMessage",{
          chat_id:m.chat.id,text:"Садись за стол.",reply_markup:{inline_keyboard:[[{text:"ИГРАТЬ",web_app:{url:appUrl}}]]}
        });
      }
    }

    if(update.callback_query){
      const cb=update.callback_query,data=String(cb.data||"");
      if(data.startsWith("vchip:")){
        const [,action,requestId]=data.split(":");
        try{
          const result=await resolveVirtualChipRequest(env,cb.from.id,requestId,action);
          await answerVirtualChipCallback(env,cb,result.approved?"Фишки начислены":result.rejected?"Заявка отклонена":"Уже обработано");
          if(result.request)await notifyVirtualChipResolution(env,result.request,!!result.approved,result.balance);
        }catch(error){
          await telegramApi(env.TELEGRAM_BOT_TOKEN,"answerCallbackQuery",{callback_query_id:cb.id,text:String(error?.message||"Ошибка"),show_alert:true});
        }
      }else if(data.startsWith("fx:")){
        const [,action,requestId]=data.split(":");
        try{
          if(action!=="approve")throw new Error("BAD_ACTION");
          const result=await approveFriendExchangeRequest(env,cb.from.id,requestId);
          await answerFriendExchangeCallback(env,cb,result.duplicate?"Уже обработано":"Подтверждено");
          if(result.request)await notifyFriendExchangeResolution(env,result.request,result.balance);
        }catch(error){
          await telegramApi(env.TELEGRAM_BOT_TOKEN,"answerCallbackQuery",{callback_query_id:cb.id,text:String(error?.message||"Ошибка"),show_alert:true});
        }
      }else{
        await telegramApi(env.TELEGRAM_BOT_TOKEN,"answerCallbackQuery",{callback_query_id:cb.id});
      }
    }
  }catch(error){console.error("webhook",error)}
  return new Response("OK");
}

export async function notifyUpcomingTournaments(env,nowMs=Date.now()) {
  const from=new Date(nowMs+9*60000).toISOString();
  const to=new Date(nowMs+11*60000).toISOString();
  const tournaments=(await env.DB.prepare(`
    SELECT id,name,starts_at FROM tournaments WHERE status='scheduled' AND starts_at BETWEEN ?1 AND ?2
  `).bind(from,to).all()).results||[];
  for(const t of tournaments){
    const users=(await env.DB.prepare(`
      SELECT telegram_id FROM tournament_players WHERE tournament_id=?1 AND status='registered'
    `).bind(t.id).all()).results||[];
    for(const u of users){
      const key=`tour10:${t.id}:${u.telegram_id}`;
      const old=await env.DB.prepare(`SELECT 1 AS ok FROM notifications WHERE telegram_id=?1 AND type=?2 LIMIT 1`)
        .bind(u.telegram_id,key).first();
      if(old)continue;
      await env.DB.prepare(`
        INSERT INTO notifications(telegram_id,type,title,body,payload)
        VALUES(?1,?2,'Турнир',?3,?4)
      `).bind(u.telegram_id,key,`${t.name} начинается через 10 минут.`,JSON.stringify({tournamentId:t.id})).run();
      await telegramApi(env.TELEGRAM_BOT_TOKEN,"sendMessage",{chat_id:u.telegram_id,text:`♠ ${t.name} начинается через 10 минут.`});
    }
  }
}
