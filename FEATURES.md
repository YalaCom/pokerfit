# IMPLEMENTATION NOTES

Это полноценная рабочая кодовая база, но production poker-сервис всё равно требует нагрузочного тестирования перед большим публичным запуском.

## Poker
Cash-game engine реализован серверно внутри Durable Object. Внутри одного стола Durable Object является источником истины.

## Tournaments
Автоматически создаются Daily Million и Sunday Main Event. При старте игроки распределяются по столам. После сокращения поля до 9 игроков D1 назначает Final Table; клиент после завершения руки проверяет пересадку и переподключается.

## Deploy
`npm run deploy` использует `wrangler d1 info poker-club-db --json`, поэтому database UUID не нужно вписывать в GitHub вручную.

## Existing D1 compatibility
При первом запросе Worker проверяет несколько старых core-колонок `users` / `user_stats` и безопасно добавляет отсутствующие nullable/default columns. Новые сущности создаются D1 migration.

## Security
- Telegram identity only from validated `initData`.
- Connection to a table uses a short-lived HMAC-signed token.
- Hidden cards remain in Durable Object state.
- Wallet movements use idempotency keys and D1 transactional batches.
- Client never submits a new wallet balance.
