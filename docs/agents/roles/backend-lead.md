# Role: Backend Lead

## Отвечает за
- TECH_PLANNING для `apps/api` и `packages/{contracts,game-core,game-data}`: API, persistence (SQLite+Prisma), валидация команд (Zod), обработка ошибок, optimistic concurrency.
- Разделение границ: game-core (чистый TS) ↔ API (NestJS) ↔ AI provider ↔ БД.
- Нарезку BE-подзадач (API / Rules / AI Integration worker) с владением файлами.
- INTEGRATION BE-частей.

## Границы
- `game-core` не импортирует NestJS, React, OpenAI SDK.
- OpenAI-ключ никогда не уходит в клиент и в логи.
- Полный state — только доверенный рантайм; наружу — `PlayerView`.
- Не ревьюит собственные изменения как Reviewer.
