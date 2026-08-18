# FIT POKER CLUB

Telegram Bot + Telegram Mini App + Cloudflare Worker + D1 + Durable Objects/WebSocket.

## Что находится в проекте

- Telegram Mini App: тёмный Poker Club UI, mobile-first, fullscreen friendly.
- Telegram bot webhook: `/start`, `/poker`, `/profile`, `/balance`, `/stats`, `/tournaments`, `/rating`, `/bonus`, `/help`.
- Telegram `initData` проверяется на сервере.
- D1: аккаунты, кошелёк, ledger, статистика, столы, история рук, турниры, друзья, достижения, награды, уведомления, сезоны, admin logs.
- PokerTable Durable Object: реальные WebSocket-столы 2–9 игроков.
- No-Limit Texas Hold'em: Pre-Flop / Flop / Turn / River / Showdown.
- Fold / Check / Call / Bet / Raise / All-In.
- Dealer / SB / BB, Heads-Up rules, turn timer, auto-check/auto-fold, anti-AFK.
- Side Pots, multiple All-Ins, split pot, odd chip.
- Серверный CSPRNG shuffle; скрытые карты не отправляются другим игрокам.
- Reconnect / Sitting Out / resume active table.
- Public tables / quick play / private rooms / room code / password.
- Spectator mode.
- Table quick-chat with cooldown.
- Blackjack: server deck/dealer, HIT/STAND/DOUBLE, 3:2 blackjack.
- Blackjack animations: dealing, dealer flip, chips, result FX.
- Poker animations: deal, board flip, turn timer, all-in flash, win confetti.
- Daily streak, daily free reward, low-balance help, zero-balance 15 second `ТЫ ЛОХ` rescue.
- Achievements with claimable chip rewards.
- Friends, online indicator, ratings, real club feed.
- Hand history and replay.
- Daily Million / Sunday Main Event auto scheduling, registration, late registration, blind levels, table assignment and Final Table reseat.
- Seasons, season score, Top 10 profile frames.
- Admin panel: users, balance adjustments, ban/unban, tables, safe table stop, custom tournaments, logs.
- Tests for evaluator, kickers, wheel, side pots, heads-up, fold, all-in and timeouts.

## Важные файлы

- `src/index.js` — Worker router/API.
- `src/durable/PokerTableDO.js` — realtime poker table.
- `src/poker/engine.js` — poker state machine.
- `src/poker/evaluator.js` — hand evaluator.
- `src/blackjack.js` — Blackjack server engine.
- `public/` — Mini App and admin UI.
- `migrations/` — D1 schema.
- `scripts/deploy.mjs` — auto-find existing `poker-club-db`, migrate, deploy.
- `wrangler.template.jsonc` — Cloudflare config template.

## Проверка

```bash
npm install
npm test
npm run check
```

## Deployment

See `SETUP_RU.md`.
