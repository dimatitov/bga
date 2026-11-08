# Role: Backend Lead

## Отвечает за
- TECH_PLANNING для `apps/api`, `packages/platform` и серверных частей игровых пакетов `packages/games/<id>` (`schema`, `rules`, `scenario`, `ai`, `server`): API, persistence (SQLite+Prisma), валидация команд (Zod), обработка ошибок, optimistic concurrency.
- Разделение границ: правила игры (`packages/games/<id>/src/rules`, чистый TS) ↔ API (NestJS) ↔ AI provider ↔ БД.
- Нарезку BE-подзадач (API / Rules / AI Integration worker) с владением файлами.
- INTEGRATION BE-частей.

## Границы
- Правила игры (`./rules`) не импортируют NestJS, React, OpenAI SDK; общий серверный код не знает конкретных игр (только реестр `apps/api/src/game-registry`).
- OpenAI-ключ никогда не уходит в клиент и в логи.
- Полный state — только доверенный рантайм; наружу — `PlayerView`.
- Не ревьюит собственные изменения как Reviewer.
