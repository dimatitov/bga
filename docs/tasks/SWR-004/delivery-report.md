# Delivery Report — SWR-004 Game Setup & Factions (Star Wars: Rebellion)

## Scope
### 1. Что реализовано
- **Полный сценарий создания и продолжения партии:** каталог → Star Wars: Rebellion → «Новая партия» → форма из пяти блоков (сторона, противник, сложность AI, набор правил, режим) → «Начать игру» → `/sessions/:sessionId` → продолжение со страницы игры после перезапуска.
- **Фракции `rebels | empire`** (переименование из `rebellion` во всём коде и данных) + типизированный реестр фракций с собственными абстрактными эмблемами и цветами (без игровой логики) в `@bga/game-rebellion/assets`.
- **Настройки по умолчанию** (Повстанцы, AI, Нормальная, Base, Digital) при каждом открытии формы; подпись «AI/Второй игрок играет за …»; сложность только для AI; Rise of the Empire и физический режим показаны как «скоро» и недоступны.
- **Сервер — источник истины:** строгая схема настроек, `opponentFaction` вычисляется сервером, `aiFaction`/`opponentFaction` от клиента отклоняются (400), неподдерживаемые ruleset/mode → 422 `SETUP_UNSUPPORTED`, `aiDifficulty = null` для human.
- **Три слоя данных:** метаданные сессии платформы (`status`, ключ идемпотентности), полное состояние (`state`, только на сервере), представление для стороны (`PlayerView` — union `player | handoff`).
- **Статус сессии** `setup | prototype | active | completed`; партии на mock-сценарии — `prototype`, это видно на столе, на странице игры и в списке.
- **Защита от дублей:** блокировка кнопки + серверная идемпотентность по `Idempotency-Key` (повтор → та же сессия, 200 `Idempotent-Replay`; гонка безопасна за счёт уникального индекса).
- **Hot-seat (два человека на одном устройстве):** «Передать ход» → заслонка без карты и секретов (ответ сервера содержит только 7 публичных полей) → «Я — <сторона>» → представление новой стороны; команды принимаются только от активной стороны.
- **Миграция данных:** старые сессии SWR-002/003 открываются и продолжаются (ленивый апкастер v1→v2, `rebellion`→`rebels`, `ruleset: base`, `gameMode: digital`, `status: prototype`).
- **D-1:** верхняя панель стола переносится по строкам на 1024/768/375 без горизонтальной прокрутки; кольцо фокуса у всех элементов управления.

**Сознательно не делалось:** правила Rebellion, AI Commander и разная сложность поведения (сложность только сохраняется), Rise of the Empire, physical companion, сетевой мультиплеер, OpenAI.

## Files changed
### 2. Какие файлы изменены (основное; полный список — Implementation log в `implementation-plan.md`)
- `packages/platform/src/{sessions,idempotency,errors,server-game-module}.ts` — `SessionStatus`, `settings`, `status`, `Idempotency-Key`, `canonicalJson`, `SETUP_UNSUPPORTED`, `IDEMPOTENCY_KEY_REUSED`, новые методы `ServerGameModule` (`parseStoredSetup`, `initialStatus`, `publicSettings`, `setupOf`, `parseSetup` → invalid | unsupported).
- `packages/games/rebellion/src/schema/{factions,settings,setup,state,view,commands,details}.ts`, `src/rules/turn.ts`, `src/server/{rebellion-server-module,upcast,legacy-v1}.ts`, `src/assets/{factions,emblems,tokens}.ts`.
- `apps/api/src/sessions/*` (сервис, контроллер, репозиторий, идемпотентность), `apps/api/prisma/schema.prisma`, новая миграция.
- `apps/web/src/games/rebellion/setup/**` (форма, карточки фракций, модель формы), `table/**` (HandoffScreen, EndTurnButton, ActiveSide, PrototypeBadge, SessionTopBar), `describeSession.ts`, локали; `apps/web/src/platform/**` (Idempotency-Key, статус, SessionStatusChip, список сессий); `app/theme/createAppTheme.ts` (кольцо фокуса), `shared/ui/ChoiceGroup.tsx`.
- `e2e/**` (TC-001…TC-006, hot-seat, визуальные и a11y-проверки), документы `docs/architecture/{application,adding-a-game}.md`, `docs/product/ux-decisions.md` §13.

### 3. Какие API добавлены / изменены
| Method | Path | Изменение |
|---|---|---|
| POST | `/api/sessions` | body `{ gameId, setup: { playerFaction, opponentType, aiDifficulty?, ruleset, gameMode } }` (адаптация `CreateGameSessionRequest` PO к платформенной рамке), заголовок `Idempotency-Key`; ответ `{ sessionId, gameId, status, settings, view }`; 201 / 200-replay / 400 / 404 / 409 `IDEMPOTENCY_KEY_REUSED` / 422 `GAME_UNAVAILABLE` / 422 `SETUP_UNSUPPORTED` |
| GET | `/api/sessions[?gameId=]` | `SessionSummary` + `status`; `details`: `playerFaction, opponentFaction, opponentType, aiDifficulty, ruleset, gameMode, round, phase` |
| GET | `/api/sessions/:id` | `{ sessionId, gameId, status, settings, view }`, view = `player` или `handoff` |
| POST | `/api/sessions/:id/commands` | новые команды `END_TURN`, `ACCEPT_HANDOFF` (только human-партии); ошибки `notYourTurn`, `handoffPending`, `handoffNotAvailable` |

### 4. Какие миграции выполнены
- `apps/api/prisma/migrations/20261108200000_session_status_idempotency/migration.sql` — только `ADD COLUMN` (`status` NOT NULL DEFAULT 'prototype', `idempotencyKey` unique, `idempotencyHash`), без пересоздания таблиц; `prisma migrate diff` — без расхождений.
- Данные состояния/настроек обновляются лениво (v1→v2) модулем игры при чтении и переписываются при следующей записи.
- Dev-БД пользователя мигрирована при бизнес-валидации; резервные копии: `apps/api/prisma/dev.pre-swr003.db`, `apps/api/prisma/dev.pre-swr004.db` (не в git).

## Acceptance criteria
### 8. Какие Acceptance Criteria выполнены
| AC | Status | Evidence |
|---|---|---|
| AC-01 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-manual.log` |
| AC-02 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/va-02-new-session-defaults-d.png`, `artifacts/logs/business-validation.log` |
| AC-03 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/va-03-empire-selected-d.png` |
| AC-04 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/va-04-human-selected-d.png`, `artifacts/logs/business-validation.log` |
| AC-05 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/business-validation.log` |
| AC-06 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/wapi-smoke.log` |
| AC-07 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/va-05-error-state-d.png`, `artifacts/logs/qa-manual.log` |
| AC-08 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-manual.log` |
| AC-09 | passed | `artifacts/logs/qa-verify.log`, `artifacts/screenshots/va-01-game-page-d.png` |
| AC-10 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/business-validation.log` |
| AC-11 | passed | `artifacts/logs/qa-manual.log`, `artifacts/screenshots/va-02-new-session-defaults-m.png`, `artifacts/screenshots/va-09-keyboard-focus.png` |
| AC-12 | passed | `artifacts/logs/qa-verify.log`, `review.md` |
| AC-13 | passed | `artifacts/screenshots/va-06-table-prototype-badge-d.png`, `artifacts/logs/qa-verify.log` |
| AC-14 | passed | `artifacts/screenshots/va-07-handoff-d.png`, `artifacts/logs/business-validation.log`, `artifacts/logs/qa-verify.log` |
| AC-15 | passed | `artifacts/logs/business-validation.log`, `artifacts/logs/qa-verify.log` |

## Verification
### 5–6. Какие тесты запускались и результаты (финальный прогон QA, `pnpm verify` exit 0)
- lint: passed — `artifacts/logs/qa-verify.log`
- typecheck: passed — `artifacts/logs/qa-verify.log`
- unit: passed — `artifacts/logs/qa-verify.log` (process 357, platform 64, rebellion 201, forbidden-stars 5, web 255)
- integration: passed — `artifacts/logs/qa-verify.log` (api 181 + 1 opt-in dev-DB test, проверенный отдельно: `artifacts/logs/wapi-dev-db-copy.log`)
- build: passed — `artifacts/logs/qa-verify.log`
- bundle: passed — `artifacts/logs/qa-verify.log` (нет `__boardDebug`, только definition/schema/board/assets)
- e2e: passed — `artifacts/logs/qa-verify.log` (Playwright 75/75, включая PO TC-001…TC-006)
- manual: passed — `artifacts/logs/qa-manual.log`
- review: passed — `review.md`

## QA artifacts
### 7. Скриншоты интерфейса
20 файлов в `artifacts/screenshots/` (desktop 1440×900 «-d», mobile 375×812 «-m»): страница игры, форма по умолчанию (+en), выбрана Империя, второй игрок, ошибка сервера, стол с бейджем «Прототип», заслонка передачи хода, стол на 1024/768 (AI и human), фокус клавиатуры. Тест-кейсы: `test-cases.md` (~130), результаты: `qa-results.md`.

## Known issues / risks
### 9. Известные проблемы
- Сложность AI только сохраняется; поведение AI не реализовано (AI-противник не ходит) — будущая задача AI Commander.
- Hot-seat: подтверждение «Я — <сторона>» доверительное (нет аутентификации) — честно указано на экране.
- В human-партии на 1440 верхняя панель стола занимает две строки (без перекрытий); «вписать карту» на 768/1024 обрезает крайние системы (поведение до SWR-004).
- Мигрированная сессия без новых команд хранит настройки в v1-форме (читается апкастером); апкастер нельзя удалить, пока такие строки есть.
- Повторная отправка после 2xx с нечитаемым телом использует тот же ключ (исправлено); после сетевой ошибки без ответа — тот же ключ, после явной ошибки сервера — новый.
- Ограничение инструмента процесса: `check-task` распознаёт AC только в формате `- **AC-n:**` (известный follow-up R3-1 из SWR-000) — AC с пояснением в скобках внутри жирной метки молча не учитываются; в SWR-004 формат исправлен.
- Не выполнено: TC-VA-14 (ручная проверка reduced motion), TC-MAN-04 (e2e параллельно с `pnpm dev`).

## Next stage proposals
### 10. Что остаётся до следующего этапа
1. **AI Commander:** серверный цикл хода AI через тот же `CommandEnvelope`, получающий только `toSideView` своей стороны и сохранённую сложность; сначала детерминированный бот, затем модель.
2. **Правила Rebellion (Этап E):** реальная карта и расстановка (после проверки прав), фазы и миссии — статус сессии станет `active` вместо `prototype`.
3. **Сессии/стороны:** локальные «профили сторон» или PIN для hot-seat вместо доверительного подтверждения.
4. **Платформа:** Node 22 LTS, CI с `pnpm verify` и `check:task`, исправить ограничение чекера R3-1.
5. **UX:** однострочная панель для human-партии на 1440, «вписать карту» с учётом ширины панелей, ручная проверка reduced motion.

## Final decision
accepted — AC-01..AC-15 passed с доказательствами; review approved, находки исправлены; QA без дефектов; `pnpm verify` exit 0 (e2e 75/75).
