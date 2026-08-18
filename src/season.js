export async function ensureSeason(env,nowMs=Date.now()) {
  const now=new Date(nowMs).toISOString();
  let active=await env.DB.prepare(`
    SELECT * FROM seasons WHERE status='active' AND starts_at<=?1 AND ends_at>?1
    ORDER BY starts_at DESC LIMIT 1
  `).bind(now).first();
  if(active)return active;

  const expired=(await env.DB.prepare(`SELECT * FROM seasons WHERE status='active' AND ends_at<=?1`).bind(now).all()).results||[];
  for(const old of expired)await closeSeason(env,old);

  const starts=new Date(nowMs),ends=new Date(nowMs+30*86400000);
  const id=`season-${starts.toISOString().slice(0,10)}`;
  const count=await env.DB.prepare(`SELECT COUNT(*) AS c FROM seasons`).first();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO seasons(id,name,starts_at,ends_at,status)
    VALUES(?1,?2,?3,?4,'active')
  `).bind(id,`Season ${Number(count?.c||0)+1}`,starts.toISOString(),ends.toISOString()).run();
  return env.DB.prepare(`SELECT * FROM seasons WHERE id=?1`).bind(id).first();
}

export async function awardSeasonScore(env,userId,points) {
  const season=await ensureSeason(env);
  await env.DB.prepare(`
    INSERT INTO season_scores(season_id,telegram_id,score) VALUES(?1,?2,?3)
    ON CONFLICT(season_id,telegram_id) DO UPDATE SET score=score+?3
  `).bind(season.id,String(userId),Math.max(0,Math.floor(Number(points)||0))).run();
}

export async function currentSeasonRating(env) {
  const season=await ensureSeason(env);
  const rows=(await env.DB.prepare(`
    SELECT ss.telegram_id,ss.score,u.first_name,u.username,u.photo_url,u.level
    FROM season_scores ss JOIN users u ON u.telegram_id=ss.telegram_id
    WHERE ss.season_id=?1 ORDER BY ss.score DESC LIMIT 100
  `).bind(season.id).all()).results||[];
  return {season:{id:season.id,name:season.name,endsAt:season.ends_at},
    rows:rows.map((r,i)=>({place:i+1,...r,score:Number(r.score)}))};
}

async function closeSeason(env,season) {
  const top=(await env.DB.prepare(`
    SELECT telegram_id,score FROM season_scores WHERE season_id=?1 ORDER BY score DESC LIMIT 10
  `).bind(season.id).all()).results||[];
  for(let i=0;i<top.length;i++){
    const frame=i===0?"gold":i===1?"silver":i===2?"bronze":"top10";
    await env.DB.prepare(`UPDATE users SET profile_frame=?2 WHERE telegram_id=?1`).bind(top[i].telegram_id,frame).run();
    await env.DB.prepare(`
      INSERT INTO notifications(telegram_id,type,title,body,payload)
      VALUES(?1,?2,'Награда сезона',?3,?4)
    `).bind(top[i].telegram_id,`season:${season.id}`,`Вы заняли #${i+1} в ${season.name}.`,JSON.stringify({place:i+1,frame})).run();
  }
  await env.DB.prepare(`UPDATE seasons SET status='complete' WHERE id=?1`).bind(season.id).run();
}
