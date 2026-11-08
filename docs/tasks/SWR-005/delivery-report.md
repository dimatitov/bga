# Delivery Report — SWR-005 Rebellion: реальные данные и первый срез правил (раунд и активация)

## Scope
### Что реализовано
- **Реальные данные базовой игры** (решение PO-1): 32 системы, 8 регионов, 69 пар соседства, 8 удалённых систем; 18 типов юнитов
  (арена, подвижность, транспортная вместимость); 8 стартовых лидеров; официальная расстановка «первой партии»; время 1 / репутация 14.
  Факты с уверенностью и ссылками — `docs/game-rules/rebellion-reference.md`; правила своими словами — `docs/game-rules/rebellion-core-v1.md`.
  Артов, сканов и текстов правообладателя нет.
- **Движок правил `core-v1`** (чистый детерминированный TS): раунд назначение → приказы → обновление; Повстанцы ходят первыми;
  ход = активация (лидер из пула в любую систему; Мон Мотма не может) + перемещения из соседних систем (лидер «пришпиливает»,
  сооружения неподвижны, транспортная вместимость) + «Завершить активацию», или пас до конца фазы; обновление возвращает лидеров и
  двигает время; раскрытие базы наземными юнитами Империи; победа Повстанцев при времени = репутации, победа Империи при захвате
  раскрытой базы; после конца партии — 422 `gameOver`, статус `completed`.
- **AI авто-пас** (решение PO-3): AI-сторона детерминированно пасует через тот же движок и журнал и видит только своё представление;
  в UI помечено «авто — AI Commander ещё не реализован». OpenAI не вызывается.
- **Скрытая информация:** одна точка редактирования; Империя до раскрытия не видит систему базы ни во view, ни в журнале, ни в
  ответах, ошибках и логах; юниты на базе — в зоне «местоположение неизвестно». Проверено сканированием 108 ответов, тестом
  инвариантности к переносу базы и (после ревью) тестом одинакового стартового вида Империи для всех 9 кандидатов базы.
- **Hot-seat:** заслонка ставится автоматически при смене стороны по правилам (8 публичных полей).
- **Совместимость:** state v3 с двумя движками; старые сессии SWR-002…004 лениво поднимаются v1→v2→v3 и играются на mock-правилах
  с пометкой «Старый прототип»; миграции БД нет.
- **Платформа:** `ServerGameModule.statusOf` — статус после команды пишется в той же транзакции (без знаний о фракциях).
- **Веб-стол:** реальная карта на Konva (регионы, связи, удалённые и спорные системы, активация, LOD), пул лидеров, панели активации
  и перемещения с предпросмотром вместимости, пас с подтверждением, трек времени/репутации, журнал, баннер победы; мышь и клавиатура;
  «вписать карту» показывает все 32 системы на 1440/1024/768 (закрыт known issue SWR-004).

**Сознательно не делалось** (out of scope, отклонения D-1..D-7): бой, миссии, производство/лояльность/зонды, выбор базы игроком,
вербовка лидеров, AI Commander, Rise of the Empire. Статус партий — «Прототип» (правила неполные).

## Files changed
126 файлов (+5193/−1730, `git diff ddfa4db --stat`); полный список по подзадачам — Implementation log в `implementation-plan.md`.
- `packages/games/rebellion/src/schema/**` (state v3, data, core-ids, view, events, commands, errors, details), `src/rules/core/**`
  (движок), `src/scenario/core/**` (данные), `src/ai/auto-pass.ts`, `src/server/{auto-play,upcast,legacy-v2,rebellion-server-module}.ts`,
  `src/board/core-layout.ts`.
- `packages/platform/src/server-game-module.ts` (`statusOf`); `apps/api/src/sessions/{session-commands.service,sessions.repository}.ts`.
- `apps/web/src/games/rebellion/core-v1/**` (стол core-v1), `table/**` (диспетчер, LegacyTable, бейджи), локали ru/en,
  `apps/web/src/platform/game-page/GameActions.tsx`, `apps/web/src/app/layout/RouteFocus.tsx` (флейк фокуса под StrictMode).
- Тесты: пакет 411, api 221, web 480, e2e 106; `scripts/check-web-bundle.mjs`, `eslint.config.mjs`.
- Документы: `docs/game-rules/rebellion-reference.md`, `docs/game-rules/rebellion-core-v1.md`, `docs/architecture/application.md`,
  `docs/architecture/adding-a-game.md`, `docs/product/ux-decisions.md` §14.

### API
| Method | Path | Изменение |
|---|---|---|
| POST | `/api/sessions` | новые партии Rebellion — `core-v1` (версия 1, или 2 при AI-Повстанцах после их авто-паса) |
| GET | `/api/sessions` | `details` += `rulesEngine`, `winner`, `reputation`; `status` может быть `completed` |
| GET | `/api/sessions/:id` | view `core-v1` (карта, лидеры, маркеры, активация, пасы, зона базы, исход, legalActions), mock-v1 или handoff (+`rulesEngine`) |
| POST | `/api/sessions/:id/commands` | `ACTIVATE_SYSTEM`, `MOVE_PIECES`, `FINISH_ACTIVATION`, `PASS`, `ACCEPT_HANDOFF`; ответ включает авто-ходы AI; новые ключи ошибок |

### Миграции
SQL-миграций нет (`prisma migrate diff` без расхождений). State поднимается лениво при первой записи. Резервная копия dev-БД до
первого запуска нового кода: `apps/api/prisma/dev.pre-swr005.db` (не в git; sha совпадает с исходной).

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-01 | passed | `artifacts/logs/qa-verify.log` (§1 data tests, TC-E-01), `artifacts/screenshots/01-core-fit-1440x900.png` |
| AC-02 | passed | `artifacts/logs/qa-verify.log` (§1, golden TC-G, base-invariance test) |
| AC-03 | passed | `artifacts/logs/qa-verify.log` (§2, TC-E-01, TC-E-13), `artifacts/logs/qa-manual.log` |
| AC-04 | passed | `artifacts/logs/qa-verify.log` (§3, TC-E-02, TC-E-10) |
| AC-05 | passed | `artifacts/logs/qa-verify.log` (§4, TC-E-02, TC-E-11) |
| AC-06 | passed | `artifacts/logs/qa-verify.log` (§2, TC-E-02/03), `artifacts/logs/qa-manual.log` (finish → auto-pass → pass → round 2, time 2, leaders in pool) |
| AC-07 | passed | `artifacts/logs/qa-verify.log` (§5, §10, TC-E-07, TC-E-08), `artifacts/screenshots/13-game-over-rebels.png`, `artifacts/screenshots/13b-game-over-empire.png` |
| AC-08 | passed | `artifacts/logs/qa-verify.log` (§7, TC-E-02, TC-E-04), `artifacts/logs/qa-e2e-tce04.log`, `artifacts/logs/qa-manual.log` |
| AC-09 | passed | `artifacts/logs/qa-verify.log` (§8, TC-E-05, TC-E2E-HS-01..05 core), `artifacts/screenshots/16-hotseat-handoff-core.png` |
| AC-10 | passed | `artifacts/logs/qa-verify.log` (§6, TC-E-04, TC-E-06, `check:bundle`), `artifacts/logs/qa-e2e-tce04.log`, `artifacts/logs/qa-manual.log`, `artifacts/logs/hidden-info-scan.log` |
| AC-11 | passed | `artifacts/logs/qa-verify.log` (§11, TC-E-09), `artifacts/logs/qa-dev-db-upgrade.log` (run A on the pre-SWR-005 backup copy), `artifacts/logs/dev-db-backup.log`, `artifacts/screenshots/15-legacy-table.png` |
| AC-12 | passed | `artifacts/logs/qa-verify.log` (TC-E-10..12, TC-VA-01..14), `artifacts/logs/qa-manual.log` (keyboard-only full turn), `artifacts/screenshots/02-core-fit-1024x768.png`, `artifacts/screenshots/03-core-fit-768x1024.png` |
| AC-13 | passed | `artifacts/logs/qa-verify.log` (§10, TC-E-07, TC-E-14, architecture test «platform never reads a game result»), `artifacts/screenshots/14-game-page-completed.png` |
| AC-14 | passed | `artifacts/logs/qa-verify.log` (golden TC-G, eslint boundaries, `check:bundle` OK) |
| AC-15 | passed | `docs/game-rules/rebellion-core-v1.md`, `artifacts/logs/qa-static-checks.log` |
| AC-16 | passed | `artifacts/logs/qa-verify.log` (EXIT_CODE=0, e2e 106 passed incl. scenarios 1–6 = TC-E-01..TC-E-09) |

## Verification
- lint: passed — `artifacts/logs/qa-verify.log`
- typecheck: passed — `artifacts/logs/qa-verify.log`
- unit: passed — `artifacts/logs/qa-verify.log` (process 369, platform 65, forbidden-stars 5, rebellion 411, web 480)
- integration: passed — `artifacts/logs/qa-verify.log` (api 221 passed, 1 skipped = opt-in dev-DB test)
- integration (opt-in dev-DB, TR-8): failed — `artifacts/logs/qa-dev-db-upgrade.log` (passes on the pre-SWR-005 copy, fails on a copy of the current dev.db: D-QA-1, test-only)
- build: passed — `artifacts/logs/qa-verify.log`
- bundle: passed — `artifacts/logs/qa-verify.log` (check-web-bundle OK, module check OK)
- e2e: passed — `artifacts/logs/qa-verify.log` (106 passed), `artifacts/logs/qa-e2e-tce04.log`
- manual: passed — `artifacts/logs/qa-manual.log` (qa-lead, scripted keyboard-only Chromium on `pnpm dev` with a scratch DB copy); `artifacts/logs/business-validation.log` (Analyst, live app, BV-0..BV-9)
- review: passed — `review.md` (round 1 changes_requested → rounds 2/3 approved)
- task check: passed — `artifacts/logs/qa-check-task.log`
- SWR-002..004 artifacts unchanged: passed — `artifacts/logs/qa-artifacts-sha.log`

## QA artifacts
Скриншоты `artifacts/screenshots/` (01–18 от QA: fit 1440/1024/768, активация, перемещение, авто-пас, новый раунд, зона базы Империи,
раскрытие, спорная система, победы, легаси-стол, hot-seat, пас; `bv-*` — бизнес-валидация); тест-кейсы `test-cases.md` (246);
результаты `qa-results.md` (таблица замен старых тестов); логи `artifacts/logs/` (verify, скан скрытой информации, копия dev-БД, ручные проверки).

## Known issues / risks
- **Против AI Империя не может победить** в срезе: AI-Повстанцы только пасуют и не покидают базу (победа Империи достижима в hot-seat).
- **База вычислима из `sessionId`** по открытому коду (детерминированный выбор, D-4) — для личного проекта приемлемо; позже — серверная соль или выбор игроком.
- **Данные с отметкой «medium»** (справочник §8): вместимость кораблей Повстанцев, `canActivate` Мон Мотмы, соседство Мустафар–Утапау,
  значки трека времени — сверить с коробкой; правка данных не требует изменения правил.
- **D-QA-1:** opt-in тест копии dev-БД ожидает только mock-сессии и падает на БД, где уже есть партии SWR-005 (тест, не продукт).
- Сбой авто-хода AI (500 без записи) проверен на уровне модуля, не через HTTP (review #5).
- На 1024/768 карта в компактном виде (счётчики юнитов), детали — при зуме; баннер победы частично закрывает карту.
- В dev-БД остались партии бизнес-валидации (3 новые core-v1, одна старая продвинута на фазу).
- Ограничение чекера процесса R3-1 (формат AC) — без изменений.

## Next stage proposals
1. **SWR-005B — OpenAI API Integration & First Live AI Decision** (запрос PO в очереди, `docs/tasks/SWR-005B/request.md`), включая валидатор env.
2. Следующий срез правил: бой (космос/земля, кубики, тактические карты) — снимет отклонение D-1.
3. Миссии и назначение лидеров, затем фаза обновления целиком (зонды, вербовка, постройка/развёртывание, лояльность).
4. Выбор базы игроком и добровольное раскрытие; стандартная (случайная) расстановка.
5. AI Commander поверх `toSideView` + legalActions (сначала детерминированный бот).

## Final decision
accepted — AC-01..AC-16 passed с доказательствами; review approved (блокирующая утечка базы #1 исправлена); `pnpm verify` exit 0 (e2e 106/106); бизнес-валидация на реальной dev-БД без дефектов.
