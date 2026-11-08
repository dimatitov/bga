# Star Wars: Rebellion AI

Веб-компаньон для соло-партий в Star Wars: Rebellion против AI. Реализованы **Этап A — Agent Foundation** (система
агентной разработки) и прототип приложения **SWR-002**: каркас full-stack (React + NestJS + SQLite) и UX-прототип игрового
стола на mock-данных — главное меню, создание партии, 2D-карта с pan/zoom, выбор и перемещение объектов через Command API,
автосохранение, журнал, настройки. Правила Rebellion и AI-соперник ещё не реализованы (mock-логика помечена в UI).
С **SWR-003** приложение — платформа игр: каталог (`/`), страница игры, общие сессии; первая игра — Star Wars:
Rebellion, Forbidden Stars пока только в каталоге («Скоро»).

- Архитектура приложения: [`docs/architecture/application.md`](docs/architecture/application.md) · UX-решения:
  [`docs/product/ux-decisions.md`](docs/product/ux-decisions.md) · задачи: [`docs/tasks/SWR-002/`](docs/tasks/SWR-002/),
  [`docs/tasks/SWR-003/`](docs/tasks/SWR-003/) · добавить игру: [`docs/architecture/adding-a-game.md`](docs/architecture/adding-a-game.md)

- Инструкции агентам: [`AGENTS.md`](AGENTS.md) (Claude Code читает его через [`CLAUDE.md`](CLAUDE.md))
- Blueprint: [`docs/architecture/blueprint.md`](docs/architecture/blueprint.md)
- Процесс: [`docs/process/workflow.md`](docs/process/workflow.md), рантаймы: [`docs/process/runtime-adapters.md`](docs/process/runtime-adapters.md)
- Роли: [`docs/agents/roles/`](docs/agents/roles/) · адаптеры: `.codex/agents/`, `.claude/agents/` · skills: `.agents/skills/`
- Демонстрационная задача: [`docs/tasks/SWR-000/`](docs/tasks/SWR-000/)

```bash
node --test scripts/
node scripts/check-task.mjs docs/tasks/SWR-000
```

## Запуск

Требования: Node **20.19+** (см. `.nvmrc`), pnpm **10.34.9** через corepack (`corepack enable`; версия закреплена в
`packageManager`). Для установки нужна сеть (Prisma engines, браузер Playwright).

```bash
pnpm install                              # зависимости + prisma generate
pnpm exec playwright install chromium     # один раз: браузер для e2e
pnpm dev                                  # api http://localhost:3000 (/api/health) + web http://localhost:5173 (proxy /api)
```

`pnpm dev` сам собирает пакеты `packages/platform` и `packages/games/*` (`tsc -b packages`), создаёт `apps/api/.env` из `.env.example` (если его нет) и применяет миграции
к `apps/api/prisma/dev.db` (`prisma migrate deploy`). Остановка — `Ctrl+C`.

Проверки (quality gates):

```bash
pnpm lint         # ESLint (включая архитектурные границы) + Prettier --check
pnpm typecheck    # tsc для всех пакетов и e2e
pnpm test         # node --test scripts/ (инструменты процесса) + Vitest во всех пакетах
pnpm build        # сборка packages, api (nest build) и web (vite build)
pnpm e2e          # Playwright: свои порты api 3100 / web 5174 и отдельная БД apps/api/.tmp/e2e.db
pnpm check:bundle # web-бандл без секретов сценария и без модулей rules/scenario/server/ai игр
pnpm verify       # lint + typecheck + test + build + check:bundle + e2e
```

Порты и переменные: api — `PORT` (3000), `DATABASE_URL` (`apps/api/.env`); web — `WEB_PORT` (5173),
`API_PROXY_TARGET` (`http://localhost:3000`), `VITE_E2E=1` (включает read-only test-хук `window.__boardDebug`; в DEV он
включён всегда, в production-сборке без флага вырезан). E2E можно запускать параллельно с `pnpm dev`.

Пользоваться: откройте http://localhost:5173 (каталог игр) → карточка «Star Wars: Rebellion» → «Новая партия» → выберите
сторону → «Начать партию». На столе: колесо или
кнопки +/−/⤢ — масштаб, перетаскивание фона — сдвиг карты, клик по объекту — доступные ходы в правой панели (или drag на
подсвеченную систему), `Esc` — снять выбор. Без мыши: вкладка «Объекты» в правой панели (стрелки + `Enter`), затем кнопки
«Переместить сюда» под списком. Каждый принятый ход сохраняется сервером; «Продолжить партию» на странице игры открывает её последнюю сессию.
Как добавить игру — `docs/architecture/adding-a-game.md`.

Настройки клиента (`/settings`: язык ru/en, «уменьшить анимацию») хранятся в `localStorage` под ключом
`bga.settings.v1` (значение `{"state":{"language":"ru","reduceMotion":false},"version":1}`; старый `swr.settings.v1`
переносится один раз); сброс — удалить ключ.
Язык по умолчанию — `ru` независимо от языка браузера; `<html lang>` и `<html data-reduced-motion>` синхронизируются.
