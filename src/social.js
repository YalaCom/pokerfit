export async function listFriends(env,userId) {
  const rows=(await env.DB.prepare(`
    SELECT u.telegram_id,u.username,u.first_name,u.photo_url,u.level,u.rating,
           CASE WHEN ts.telegram_id IS NULL THEN 0 ELSE 1 END AS online,
           ts.table_id
    FROM friendships f
    JOIN users u ON u.telegram_id=f.friend_id
    LEFT JOIN table_sessions ts ON ts.telegram_id=u.telegram_id
    WHERE f.user_id=?1 AND f.status='accepted'
    ORDER BY online DESC,u.first_name
  `).bind(String(userId)).all()).results||[];
  return rows.map(r=>({
    telegramId:String(r.telegram_id),username:r.username,firstName:r.first_name,
    photoUrl:r.photo_url,level:Number(r.level),rating:Number(r.rating),
    online:!!r.online,tableId:r.table_id||null
  }));
}

export async function addFriend(env,userId,target) {
  userId=String(userId);
  target=String(target||"").trim().replace(/^@/,"");
  let friend=null;
  if(/^\d+$/.test(target)){
    friend=await env.DB.prepare(`SELECT telegram_id FROM users WHERE telegram_id=?1 LIMIT 1`).bind(target).first();
  }else{
    friend=await env.DB.prepare(`SELECT telegram_id FROM users WHERE lower(username)=lower(?1) LIMIT 1`).bind(target).first();
  }
  if(!friend)throw new Error("USER_NOT_FOUND");
  const friendId=String(friend.telegram_id);
  if(friendId===userId)throw new Error("CANNOT_ADD_SELF");
  await env.DB.batch([
    env.DB.prepare(`INSERT OR REPLACE INTO friendships(user_id,friend_id,status) VALUES(?1,?2,'accepted')`).bind(userId,friendId),
    env.DB.prepare(`INSERT OR REPLACE INTO friendships(user_id,friend_id,status) VALUES(?1,?2,'accepted')`).bind(friendId,userId),
  ]);
  return {ok:true,friendId};
}

export async function removeFriend(env,userId,friendId) {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM friendships WHERE user_id=?1 AND friend_id=?2`).bind(String(userId),String(friendId)),
    env.DB.prepare(`DELETE FROM friendships WHERE user_id=?1 AND friend_id=?2`).bind(String(friendId),String(userId)),
  ]);
  return {ok:true};
}

export async function notifications(env,userId) {
  const rows=(await env.DB.prepare(`
    SELECT id,type,title,body,payload,read_at,created_at FROM notifications
    WHERE telegram_id=?1 ORDER BY id DESC LIMIT 50
  `).bind(String(userId)).all()).results||[];
  return rows.map(r=>({...r,payload:r.payload?safeJson(r.payload):null}));
}

export async function markNotificationRead(env,userId,id) {
  await env.DB.prepare(`UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE id=?1 AND telegram_id=?2`)
    .bind(Number(id),String(userId)).run();
  return {ok:true};
}

function safeJson(s){try{return JSON.parse(s)}catch{return null}}
