# КАК ЗАГРУЗИТЬ И ПОДКЛЮЧИТЬ

Проект рассчитан на уже созданные:
- Worker: `poker-club`
- D1: `poker-club-db`
- Secret: `TELEGRAM_BOT_TOKEN`
- Mini App URL: `https://poker-club.btctgjr4t2.workers.dev`

## 1. GitHub

1. Распакуй ZIP `FIT_POKER_CLUB_FULL.zip`.
2. Создай новый GitHub repository.
3. Загрузи В КОРЕНЬ репозитория всё содержимое папки `FIT_POKER_CLUB_FULL`.
4. В корне GitHub должны быть видны:
   - `package.json`
   - `wrangler.template.jsonc`
   - папка `src`
   - папка `public`
   - папка `migrations`
   - папка `scripts`

Не загружай ZIP как единственный файл: Cloudflare должен видеть структуру проекта.

## 2. Cloudflare GitHub connection

Открой:
Workers & Pages → `poker-club` → Settings → Builds

Подключи GitHub repository.

Настройки:
- Production branch: `main`
- Build command: оставить пустым
- Deploy command: `npm run deploy`

Deploy script сам:
1. находит ID существующей D1 `poker-club-db`;
2. генерирует Wrangler config;
3. применяет D1 migrations;
4. создаёт/обновляет Durable Object;
5. загружает Worker и папку `public`.

## 3. Secret

В:
Worker → Settings → Variables and Secrets

должен остаться:

`TELEGRAM_BOT_TOKEN` = токен `@fitpokerclubbot`

Тип: Secret.

Токен НЕ хранится в GitHub.

## 4. D1

Binding после deploy:
- Binding name: `DB`
- Database: `poker-club-db`

Deploy script получает database ID автоматически командой Wrangler.

## 5. Telegram

Поскольку Worker остаётся `poker-club` и URL не меняется, существующие Main Mini App URL и webhook обычно менять не требуется.

Проверка URL Worker:
`https://poker-club.btctgjr4t2.workers.dev`

## 6. После первого deploy

Открой Telegram → ФитПокер → Open App.

Проверь:
1. имя и баланс;
2. Blackjack;
3. Быстрая игра Poker;
4. второй Telegram аккаунт → тот же Poker стол;
5. приватную комнату;
6. рейтинг;
7. награды;
8. профиль → история;
9. Admin из профиля.

## Если build упал

Открой Cloudflare → `poker-club` → Deployments → failed build → Logs.

Не меняй код наугад. Сохрани текст ошибки.
