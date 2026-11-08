# Delivery Report — SWR-002 Application Foundation & UX Prototype

## Scope
**Сделано**
- **Часть A — каркас.** pnpm-монорепо: `apps/web` (React 19 + TS + Vite 8, MUI 9, Zustand, TanStack Query, React Router, React Konva, react-i18next), `apps/api` (NestJS 11 + Prisma 6 + SQLite), `packages/contracts` (Zod-контракты), `packages/game-core` (чистые функции, mock-правила), `packages/game-data` (mock-сценарий + отдельный `layout`). Маршруты `/`, `/games/new`, `/games/:id`, `/settings`. API: health, создать / список / получить партию, единый `POST /api/games/:id/commands`.
- **Часть B — UX-прототип.** Главное меню (новая партия, «Продолжить», недавние партии, настройки), создание партии (сторона, AI/человек, сложность только для AI), игровой стол: 2D-карта с pan/zoom/fit, 10 тестовых систем и связи, юниты/лидеры/жетоны обеих сторон, выбор системы и объекта, подсветка допустимых целей, перемещение за 1 клик (панель действий или подсвеченная система) и drag-and-drop с откатом, контекстная панель (пусто/система/объект), журнал событий, информация о партии, раунд и фаза, mock-«Завершить фазу», автосохранение и восстановление, ru/en, уменьшение анимации, доступный listbox-эквивалент карты и клавиатурный путь.
- **Архитектурные ограничения выполнены и проверяются автоматически:** источник истины — `GameState` на сервере; наружу только `PlayerView` (скрытая база и тип скрытых объектов противника фильтруются на сервере); все изменения — через `CommandEnvelope` (тот же вход для будущего AI); UI берёт цели только из `legalActions`; координаты — в `@swr/game-data/layout`, не в состоянии.

**Сознательно не делалось:** правила Star Wars: Rebellion (только явно помеченные mock-правила), AI-противник и OpenAI, аутентификация и hot-seat, реальная карта и арты правообладателя.

## Deliverables
| # | Результат | Где |
|---|---|---|
| 1 | Работающий проект | репозиторий; запуск — `README.md` → «Запуск» (`pnpm install`, затем `pnpm dev`) |
| 2 | Архитектурное описание | `docs/architecture/application.md` |
| 3 | Документ UX-решений | `docs/product/ux-decisions.md` |
| 4 | Тест-кейсы и результаты | `test-cases.md`, `qa-results.md`, логи в `artifacts/logs/` |
| 5 | Скриншоты основных экранов | `artifacts/screenshots/` (16 файлов, 1440×900) |
| 6 | Известные ограничения | раздел «Known issues / risks» ниже |
| 7 | Предложения на следующий этап | раздел «Next stage proposals» ниже |

## Workflow actually exercised
| Шаг | Кто | Факт |
|---|---|---|
| Spec, 19 уточнений, поправки к контракту | analyst | `specification.md` |
| План BE ‖ план FE + UX ‖ тест-дизайн (99 TC до кода) | backend-lead ‖ frontend-lead ‖ qa-lead | `plan-backend.md`, `plan-frontend.md`, `test-cases.md` |
| Foundation | backend-worker W0 | `artifacts/logs/w0-test.log` и др. |
| Реализация (параллельно, без общих файлов) | W-CORE, W-API, FE-SHELL, FE-TABLE; e2e-спеки — qa-lead | `implementation-plan.md` → Implementation log |
| Интеграция | backend-lead, frontend-lead | `artifacts/logs/be-integration.log`, `artifacts/logs/integration-test.log` |
| Ревью | reviewer (не автор), 2 раунда | `review.md` — approved |
| Бизнес-валидация | analyst в живом приложении | `artifacts/logs/business-validation.log` |
| QA | qa-lead: `pnpm verify` + ручной проход в браузере | `qa-results.md`, `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-manual.log` |

## Files changed
- `apps/web/**`, `apps/api/**`, `packages/{contracts,game-core,game-data}/**`, `e2e/**`
- Корневой tooling: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`, `playwright.config.ts`, `.nvmrc`, `.gitignore`, `README.md`, `scripts/check-web-bundle.mjs` (+ тест)
- Документы: `docs/architecture/application.md`, `docs/product/ux-decisions.md`, `docs/tasks/SWR-002/**`

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `artifacts/logs/qa-manual.log`, `artifacts/logs/integration-dev-smoke.log` |
| AC-2 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/business-validation.log` |
| AC-3 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/03-new-game.png` |
| AC-4 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/04-board-initial.png` |
| AC-5 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/05-board-zoomed-panned.png` |
| AC-6 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/06-system-panel.png`, `artifacts/screenshots/07-piece-actions.png` |
| AC-7 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/09-illegal-move-feedback.png`, `artifacts/logs/business-validation.log` |
| AC-8 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/11-after-reload.png`, `artifacts/logs/business-validation.log` |
| AC-9 | passed | `artifacts/logs/qa-verify.log` |
| AC-10 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-manual.log` |
| AC-11 | passed | `delivery-report.md`, `artifacts/screenshots/01-main-menu-empty.png` (+15 скриншотов) |
| AC-12 | passed | `artifacts/logs/qa-arch.log`, `artifacts/logs/qa-verify.log` |

## Verification
- lint: passed — `artifacts/logs/qa-verify.log`
- typecheck: passed — `artifacts/logs/qa-verify.log`
- unit: passed — `artifacts/logs/qa-verify.log` (process 231, contracts 34, game-data 13, game-core 48, web 91)
- integration: passed — `artifacts/logs/qa-verify.log` (api 58)
- build: passed — `artifacts/logs/qa-verify.log`
- bundle: passed — `artifacts/logs/qa-verify.log` (check:bundle, 5 правил)
- e2e: passed — `artifacts/logs/qa-verify.log` (Playwright 37/37)
- manual: passed — `artifacts/logs/qa-manual.log`
- review: passed — `review.md` (round 2 approved)

## QA artifacts
`test-cases.md` (99+ TC), `qa-results.md`, скриншоты `artifacts/screenshots/01…15, 14b`, логи `artifacts/logs/` (w0-*, wcore-*, wapi-*, feshell-*, fetable-*, be-integration, integration-*, review-fix-*, business-validation, qa-*). Playwright traces — только при падениях, в git не коммитятся.

## Known issues / risks
**Ограничения прототипа (осознанные)**
- Правила — mock: перемещение в соседнюю систему в любой фазе, «Завершить фазу» просто листает фазы; команды раскрытия базы нет.
- AI-соперник — только плашка статуса, ходов не делает; соперник-человек (hot-seat) ходить не может.
- Нет аутентификации: `actor` приходит от клиента; сервер принимает команды только за `setup.humanFaction` и отдаёт только его `PlayerView`.
- Карта — 10 вымышленных систем, временная графика; реальная карта — после проверки прав.
- Desktop-first: проверены окна 1024×768…1920×1080; touch/планшеты не проверялись; карта не перевписывается при ресайзе окна (кнопка «вписать» / клавиша `0`).
- Нет undo.

**Технические**
- Node 20.19 ограничивает версии (NestJS 11, Prisma 6, jest-dom 6); Node 22 снимет пины.
- e2e гоняется на Vite dev-сервере; отсутствие секретов в production-bundle проверяет `pnpm check:bundle` (bare-id системы базы не ловится в принципе — все id систем есть в layout).
- `pnpm check:bundle` отдельно не пересобирает web (в `pnpm verify` идёт после build).
- Список партий может вернуть меньше 20, если среди последних есть повреждённые записи; malformed JSON на несуществующую партию → 400 (парсер раньше роутинга).
- SQLite — один процесс; для многопользовательского режима понадобится другая БД.

**Не проверено (not_run)**
- TC-MAN-01 из свежего клона (проверено на существующей установке), TC-MAN-02 (пересоздание dev-БД — не трогали локальную БД), TC-MAN-04 (злоупотребления: двойной клик, drag во время запроса), TC-MAN-08 (e2e параллельно с dev), TC-ARCH-10 (mock-логика только в `mock-rules.ts` — проверено ревьюером при чтении кода, автоматического теста нет). Ручной клавиатурный проход — только игровой стол; меню, создание партии и настройки покрыты компонентными тестами. Подробно — `qa-results.md`.

**Процесс**
- Codex-адаптер по-прежнему не запускался (Codex не установлен); весь цикл выполнен в Claude Code.

## Next stage proposals
1. **SWR-003 — платформа:** переход на Node 22 LTS (снять пины, NestJS 12/Prisma 7), CI в GitHub Actions (`pnpm verify` + `check:task` на PR), e2e также против production-сборки (`vite preview`).
2. **SWR-004 — модель данных Rebellion (Этап E, начало):** формализовать реальную топологию карты, регионы, типы юнитов/лидеров и стартовые расстановки как данные `game-data` (с проверкой прав на названия и изображения); заменить mock-сценарий без изменения контрактов UI.
3. **SWR-005 — структура раунда:** реальные фазы (назначение лидеров на миссии, команда, обновление) как команды game-core; первая настоящая механика скрытой информации — размещение и раскрытие базы повстанцев, зонды; тесты PlayerView становятся содержательными.
4. **SWR-006 — сессия и стороны:** локальная идентификация стороны (токен сессии на сторону) вместо доверия `actor`; hot-seat для соперника-человека; undo/реплей по таблице `GameEvent`.
5. **Подготовка к AI (Этап F):** цикл хода соперника на сервере через тот же `CommandEnvelope`, сначала детерминированный бот «случайное допустимое действие» как fallback и тестовый стенд; OpenAI — только после готовности правил ядра.
6. **UX:** touch-жесты (pinch-zoom, long-press вместо drag), перевписывание карты при ресайзе, полировка ARIA-табов, синхронизация «физический стол ↔ приложение» (подсказки «что переставить на столе» после хода AI).

## Final decision
accepted — AC-1..AC-12 passed с доказательствами, review approved (2 раунда), QA без дефектов, `pnpm verify` exit 0.
