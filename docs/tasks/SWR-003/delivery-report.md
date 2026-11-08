# Delivery Report — SWR-003 Game Catalog (мультиигровая платформа)

## Scope
**Сделано**
- **Платформа вместо одной игры.** Пакеты: `@bga/platform` (GameDefinition, Session DTO, ошибки, `ServerGameModule`), `@bga/game-rebellion` с изолированными модулями `./definition`, `./schema` (Game State Schema), `./rules` (Rules Engine), `./scenario`, `./board` (Board Configuration), `./assets` (Game Assets, собственные SVG-обложки и визуальные токены), `./ai` (AI Strategy Configuration — только данные), `./server`; `@bga/game-forbidden-stars` — только definition + обложка (`coming_soon`).
- **Реестры:** сервер `apps/api/src/game-registry/**`, web `apps/web/src/games/registry.ts` — обычные типизированные массивы; добавление игры = пакет + записи в реестрах (`docs/architecture/adding-a-game.md`).
- **Сессии связаны с `gameId`:** `POST/GET /api/sessions`, `GET /api/sessions/:id`, `POST /api/sessions/:id/commands`; Prisma `Session`/`SessionEvent` с `gameId`; ручная миграция с переносом данных SWR-002.
- **UI:** `/` каталог (карточки из реестра), `/games/:gameId` страница игры («Новая партия», «Продолжить партию», недавние ≤5), `/games/:gameId/new` экран настройки игры, `/sessions/:sessionId` хост сессии → стол игры, `/settings`; Rebellion-UI перенесён в `apps/web/src/games/rebellion/**` без потери функций.
- **Границы проверяются автоматически:** ESLint (123 проверки в `scripts/eslint-boundaries.test.mjs`), `pnpm check:bundle` (в web-bundle только definition/schema/board/assets; нет базы повстанцев, id объектов сценария, `__boardDebug`).

**Сознательно не делалось:** правила и UI Forbidden Stars, плагины/динамическая загрузка/админка, изменение правил Rebellion.

## Workflow actually exercised
| Шаг | Кто | Факт |
|---|---|---|
| Spec, 25 уточнений, решения по поправкам | analyst | `specification.md` |
| План BE ‖ план FE + UX ‖ тест-дизайн (113 TC до кода) | backend-lead ‖ frontend-lead ‖ qa-lead | `plan-backend.md`, `plan-frontend.md`, `test-cases.md` |
| Перестройка репозитория (R1 механика, R2 контракты), зелёные гейты после каждого шага | backend-worker W0-R | `artifacts/logs/w0r-r1-verify.log`, `artifacts/logs/w0r-r2-verify.log` |
| Сессии/реестр/миграция ‖ платформенный UI ‖ перенос Rebellion ‖ миграция e2e | W-API ‖ FE-PLATFORM (P1→P2→P4) ‖ FE-MOVE ‖ qa-lead | `implementation-plan.md` → Implementation log |
| Интеграция | frontend-lead, backend-lead | `artifacts/logs/fe-integration.log`, `artifacts/logs/integration-verify.log` |
| Ревью (проверка расширяемости реальной фиктивной игрой) | reviewer | `review.md` — approved |
| Бизнес-валидация на реальной (мигрированной) dev-БД | analyst | `artifacts/logs/business-validation.log` |
| QA | qa-lead | `qa-results.md`, `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-manual.log` |

## Files changed
- Новое: `packages/platform/**`, `packages/games/rebellion/**` (из бывших `contracts`, `game-core`, `game-data` + новые модули), `packages/games/forbidden-stars/**`, `apps/api/src/{sessions,game-registry}/**`, `apps/api/prisma/migrations/20261108120000_sessions/`, `apps/web/src/{platform,games}/**`, `scripts/eslint-boundaries.test.mjs`, `docs/architecture/adding-a-game.md`.
- Удалено: `packages/{contracts,game-core,game-data}`, `apps/api/src/{games,commands}`, `apps/web/src/features/**`.
- Изменено: scope `@swr/*` → `@bga/*` по всему репозиторию, `eslint.config.mjs`, `scripts/check-web-bundle.mjs`, `e2e/**`, `README.md`, `AGENTS.md`, `docs/architecture/application.md`, `docs/product/ux-decisions.md` §12, роли агентов.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/01-catalog.png`, `artifacts/logs/business-validation.log` |
| AC-2 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/04-game-page-coming-soon.png`, `artifacts/logs/business-validation.log` |
| AC-3 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/06-session-table.png`, `artifacts/logs/business-validation.log` |
| AC-4 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/03-game-page-with-sessions.png`, `artifacts/logs/business-validation.log` |
| AC-5 | passed | `review.md`, `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-doc-check.log` |
| AC-6 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/wapi-smoke.log` |
| AC-7 | passed | `artifacts/logs/wapi-migration-copy.log`, `artifacts/logs/business-validation.log`, `artifacts/logs/qa-verify.log` |
| AC-8 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-check-task.log` |
| AC-9 | passed | `artifacts/logs/qa-arch-check.log` |

## Verification
- lint: passed — `artifacts/logs/qa-verify.log`
- typecheck: passed — `artifacts/logs/qa-verify.log`
- unit: passed — `artifacts/logs/qa-verify.log` (process 357, platform 32, rebellion 115, forbidden-stars 5, web 173)
- integration: passed — `artifacts/logs/qa-verify.log` (api 94, включая миграцию и фиктивную игру)
- build: passed — `artifacts/logs/qa-verify.log`
- bundle: passed — `artifacts/logs/qa-verify.log` (значения + состав модулей)
- e2e: passed — `artifacts/logs/qa-verify.log` (Playwright 50/50)
- manual: passed — `artifacts/logs/qa-manual.log`
- review: passed — `review.md`

## QA artifacts
`test-cases.md` (113 TC), `qa-results.md`, 24 скриншота в `artifacts/screenshots/` (11 платформенных + 13 регрессии стола), логи в `artifacts/logs/`.

## Known issues / risks
- **Dev-БД пользователя мигрирована** (`Game` → `Session`); отката нет. Резервная копия до миграции: `apps/api/prisma/dev.pre-swr003.db` (не в git).
- **D-1 (minor):** на ширине ≤1024 px верхняя панель стола переполняется (кнопка «Автосохранено»/настройки доступны прокруткой панели) — унаследовано из SWR-002.
- Тесты-«guard» со списками игр (сервер `setupFor`, TC-FS-03; web: `registry.test.ts`, `CatalogPage.test.tsx`, `extensibility.test.tsx`) нужно обновлять при добавлении игры — так задумано и описано в `adding-a-game.md` §10.
- Список сессий может вернуть меньше 20, если среди последних есть повреждённые/недоступные записи.
- Именной долг: в Rebellion-коде поле `gameId` в `BoardContext`/`GameState.id` хранит идентификатор сессии.
- `check:bundle` при запуске отдельно проверяет уже существующий `apps/web/dist` (в `pnpm verify` — после build).
- Не выполнено: TC-MAN-04 (e2e параллельно с `pnpm dev`).

## Next stage proposals
1. **SWR-004 (уже поставлен PO):** настройка партии и фракции Rebellion — переименование фракции `rebellion` → `rebels` с миграцией сохранённых сессий, `ruleset`/`gameMode`, статус сессии `prototype`, hot-seat с безопасной передачей хода.
2. Адаптивная верхняя панель стола (D-1) и проверка планшетов.
3. Node 22 LTS и CI (`pnpm verify` + `check:task` на PR).
4. Переименование `gameId`→`sessionId` в коде стола Rebellion (именной долг).

## Final decision
accepted — AC-1..AC-9 passed с доказательствами, review approved, QA: 0 блокирующих дефектов, `pnpm verify` exit 0 (e2e 50/50).
