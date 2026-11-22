# Review — SWR-009 Galactic Vector Terminal

Reviewer: independent reviewer (не автор кода SWR-009)  ·  Author(s) of reviewed code: frontend-workers F, M, C1, C2, MF, N, S + frontend-lead (INTEGRATION), см. `implementation-plan.md` → Implementation log.

## Scope

- База: незакоммиченный diff на `main` поверх `5b83e35` (`git status` / `git diff` на 2026-11-21) + неотслеживаемые файлы
  `apps/web/src/**` (dev/ui-kit, core-v1/{console,manifest}, model/{forces,aiRecent,mapStats}, geometry/{labelCulling,markerLayout,systemMarks},
  shared/theme, shared/ui/terminal, platform/ui/{MessagePanel,TerminalPanel}, theme/{glyphs,mapStyle}, ui/ForceGlyph, locales manifest.json),
  `packages/games/rebellion/src/assets/{tokens,index,cover}.ts`, `scripts/check-web-bundle{,.test}.mjs`, `apps/web/package.json`, `pnpm-lock.yaml`.
  116 tracked files changed (+5150/−1934) + ~80 new files.
- Вне scope (по брифу): `docs/design/**`, `docs/product/**`, `.claude/launch.json`, `docs/tasks/SWR-006/artifacts/screenshots`, `e2e/**`
  (QA правит параллельно).
- Входы: `specification.md` (AC-1…AC-18, R-1…R-7, QD-1…QD-8), `implementation-plan.md` (K-1…K-9, §3.5, §5, Implementation log с fix rounds).
- Приоритеты проверки: скрытая информация (AC-8/RK-2) → контракты → архитектура/стек → корректность → AC-16 → качество тестов.

### Что проверено и признано корректным (без замечаний)

1. **Скрытая информация (AC-8, §3.5).**
   - `core-v1/model/forces.ts`: `forcesBySystem` берёт только `location.kind === 'system'` (стр. 78–89); `zoneForces` — только `kind === 'rebelBase'`
     и только при `hiddenZone(view) !== null` (стр. 99–106). Систему базы ничто не вычисляет.
   - `core-v1/model/aiRecent.ts`: только события `lastRun.events` (на сервере уже пропущены через `toPlayerEvents`,
     `apps/api/src/sessions/session-commands.service.ts:128`), только `actor === aiSide`, `null` → `zone` и только если зона показана,
     в итог — только id из `view.map.systems`. Нет обращения к `view.log`, эвристик, смежности, разностей «до/после».
   - `manifest/manifestModel.ts`: модель зоны (`ZoneManifestVm`) не имеет полей system/region/base; `isBase` — только из
     `visibleRebelBaseSystemId`. Манифест системы — ровно `forcesBySystem`.
   - Сцена: якорь маркеров зоны — фиксированный прямоугольник `HIDDEN_BASE_ZONE_RECT` (`geometry/sceneModel.ts:233–246`), не зависит от
     положения базы; `systemId: null` у маркеров зоны. Отсечение подписей (`labelCulling`) зависит только от системных маркеров.
   - Зеркало `core-map-state` (`canvas/CoreBoardStage.tsx:287–309`): `data-markers` из `forcesBySystem`/`zoneForces`, `data-ai-recent` из
     `scene.aiRecentIds`, `data-rebel-base` только из `scene.isBase` (сервер), у `map-hidden-zone` нет `data-system-id`.
   - Debug-API (`hooks/coreBoardDebugImpl.ts`): новые `getGroupMarkers/getAiRecentSystemIds/getRouteCount/getRegionCount` читают
     только редактированную сцену/вид; `getPieceScreenPos` для юнитов базы ведёт к маркеру зоны.
   - DOM/i18n: `HiddenZonePanel`, `UnitManifest` (зона), `ForceMarkerList` (`map-marker-zone-*`) — тексты/aria без имён систем;
     строки `manifest.restricted.*`, `map.zone.title`, `turn.zone.*` (ru/en) не называют систему.
   - `scripts/check-web-bundle.mjs`: правила `dev-ui-kit-path`, `dev-ui-kit-testid` + тесты (позитивные, look-alike, dist-прогон);
     `/dev/ui-kit` добавлен в тот же литеральный тернарник `import.meta.env.DEV` в `app/router.tsx`, i18n — runtime-неймспейс как у `/dev/ai`.
     Прогон `check-web-bundle --rebuild`: 14 правил OK, `0 apps/web/src/dev modules` (лог ниже).
2. **Контракты.** `packages/platform/**`, `packages/games/*/src/{schema,rules,scenario,server,ai,board}` не тронуты (`git status`);
   в `assets/` изменены только значения токенов (+ `cover.ts`/`accentColor` теперь ссылаются на `rebellionVisualTokens`, ключи и экспорт прежние).
   Все testid из закоммиченного `e2e/support/testids.ts` (HEAD) присутствуют в `apps/web/src` (кроме согласованно удалённого
   `top-bar-controls`; ещё 10 id строятся шаблонами, как и до задачи). Сигнатуры существующих методов `__boardDebug` не изменены.
3. **Стек.** Единственная новая зависимость — `@fontsource/pt-mono@5.3.0` (`apps/web/package.json`, lock). Шрифт в бандле локальный
   (8 файлов `pt-mono-*-400-normal` в `apps/web/dist/assets`, обращений к `googleapis/gstatic` нет). Konva перерисовывает текстовые слои
   после `document.fonts.load` (`useMapFontEpoch`, guard для jsdom).
4. **Токены.** Hex-литералов в `apps/web/src` вне `shared/theme/tokens.ts`/тестов нет, кроме незатронутых задачей
   `platform/ui/placeholderCover.ts` и легаси `board/canvas/*` (rgba) — не в diff. ESLint (включая слойные правила) — зелёный.
5. **Корректность.** `consoleGridSx` — непересекающиеся диапазоны (исправление fix round 2 корректно и покрыто тестом);
   `turn-activate` включается только при `armed` ∧ `selection.kind === 'system'` ∧ система ∈ `activationTargets(view, armed)` (из
   `legalActions`), заблокирован при `isPending`; QD-5 на карте (`CoreBoardStage.tsx:235–252`) и в DOM; `reconcile` сбрасывает манифест
   при исчезновении цели; LED-мигание выключается настройкой и `prefers-reduced-motion` (тема `NO_MOTION`); ru-plural `_one/_few/_many/_other`
   полные во всех новых ключах; `AutomationNotice` — прежние testid/role.
6. **AC-16.** Строк `DEMO`, `DESIGN ITERATION`, `16:47`, `Корусант 6`, `OPEN DEMO` в `apps/web/src` нет; `SECTOR SCAN` — только в комментарии
   (R-3). Числа 32/69/56 в не-тестовом коде — только размеры в px и комментарии; счётчики карты — из `mapStats(view.map)`.
7. **Тесты §3.5 (a)–(e)** не тавтологичны: (a) `forces.test.ts` сравнивает с видом без содержимого зоны и проверяет, что у Явина нет сил;
   (b) `manifestModel.test.ts` — по всем 32 id; (c) JSON модели зоны без `systemId`/id/nameKey систем и регионов; (d) `UnitManifest.test.tsx` —
   textContent и все атрибуты без 2×(32+8) имён (ru/en) и id; (e) `coreBoardDebugImpl.test.ts` — дамп всех новых методов без `CS_YAVIN`.
   Фикстура `empireRedactedView` содержит юниты и лидера в `rebelBase` и события с `systemId: null`, т. е. инварианты реально нагружены.

## Findings

| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| R-1 | minor | `apps/web/src/games/rebellion/core-v1/sidebar/MapLegend.tsx:221-226, 304`; тест `canvas/CoreBoardStage.test.tsx:205` | Esc для полной легенды недостижим с клавиатуры. `onKeyDown` висит на `map-legend-full`, внутри которого нет фокусируемых элементов, а фокус после открытия остаётся на `map-legend-toggle` (сосед, не потомок). Реальное нажатие Esc уходит в `useGlobalEscape` (`board/hooks/useBoardKeyboard.ts:27-37`) — он снимает выбор на карте (и прячет манифест), а легенда остаётся открытой. Тест проходит только потому, что шлёт `keyDown` прямо на нефокусируемый `<li>`; реальный путь пользователя он не проверяет. Заявленное «Esc закрывает и возвращает фокус» (fix round 1 M) не работает. | Повесить обработчик Esc на обёртку `map-legend` (общий предок кнопки и панели) с `stopPropagation`/`preventDefault`, пока `open`, либо переводить фокус в панель (`tabIndex={-1}`) при открытии. Тест: `user.click(toggle)` → `user.keyboard('{Escape}')` → `aria-expanded="false"`, фокус на кнопке, выбор не сброшен. |
| R-2 | minor | `e2e/console-game.spec.ts`, `e2e/console-hidden-base.spec.ts`, `e2e/console-manifest.spec.ts`, `e2e/support/console.ts` (вне scope, к сведению) | `pnpm lint` = exit 1: ESLint чистый, но `prettier --check` падает на 4 новых e2e-файлах QA. Это не продуктовый код и не предмет этого ревью, но AC-18 (`pnpm verify` exit 0) сейчас не выполнится. | QA-воркеру прогнать `pnpm exec prettier --write` по своим файлам перед итоговым `pnpm verify`. |
| R-3 | nit | `apps/web/src/games/rebellion/core-v1/console/ConsoleHeader.tsx:19` | Комментарий содержит «SECTOR SCAN» — grep AC-16 из плана §6 (`SECTOR SCAN` по `apps/web/src` без тестов) даст совпадение и потребует ручного разбора. | Переформулировать комментарий (например, «декоративная надпись макета не переносится»). |
| R-4 | nit | `apps/web/src/games/rebellion/core-v1/manifest/UnitInspector.tsx:40-57` | `invoker` (testid вызвавшего маркера) сбрасывается только в `close()`. Если манифест скрылся из-за смены выбора, а не «Закрыть», устаревший testid переживает это и при следующем закрытии манифеста, открытого с карты, фокус может вернуться на старый DOM-маркер той же системы вместо панели. Ничего не ломает (есть fallback), но поведение неочевидно. | Сбрасывать `invoker.current`, когда `shown` становится `null` без `close()`, или хранить invoker вместе с `ManifestRequest`. |
| R-5 | nit | `apps/web/src/games/rebellion/core-v1/model/coreUiStore.ts:132-141` + `UnitInspector.tsx:51` | Запрос манифеста не очищается при смене выбора или при взятии лидера: если вернуться к той же системе через «Объекты» или закончить активацию, манифест снова появляется, хотя его никто не открывал. Это следует из §3.4 («без межсторовой синхронизации»), но в UX выглядит как «залипание». | Принять как задокументированное поведение или очищать `manifest` в `selectSystem` другой цели / при `arm()`. Решение за лидом. |
| R-6 | nit | `apps/web/src/games/rebellion/core-v1/hooks/coreBoardDebugImpl.ts:139-141` | Смысл существующего метода `getSystemLabelRect` изменился: теперь он возвращает `null` для подписей, скрытых отсечением в compact LOD. Сигнатура прежняя (`Rect \| null`), изменение записано в fix round 1, но §5.3 обещал «смысл без изменений», а `e2e/core-fit.spec.ts` им пользуется. | Подтвердить, что QA учла это в `core-fit` (проверки на наложение подписей должны пропускать `null`/`data-label="hidden"`), и дописать уточнение в §5.3 плана. |
| R-7 | nit | `apps/web/src/games/rebellion/core-v1/manifest/ForceMarkerList.tsx:84-85` vs `canvas/CoreBoardStage.tsx:235-241` | QD-5 реализован по-разному. При взятом лидере маркер на карте ведёт себя как клик по системе и **активирует** её, если она в целях. DOM-маркер в панели только выбирает систему: активация идёт через `system-panel-activate`/`turn-activate`. Регрессии нет, но поведение одной и той же сущности расходится. | Оставить как есть (DOM-маркер находится внутри панели уже выбранной системы, команда рядом), но упомянуть это в QD-5 / плане; или вызывать тот же `onSystem`-путь. |

Блокирующих и major-замечаний нет.

## Checks run

Перед каждой командой: `source ~/.nvm/nvm.sh && nvm use 22.23.5`. e2e/Playwright **не запускались** (`not_run`: порты заняты QA, по брифу).

| Command | Result | Log |
|---|---|---|
| `pnpm --filter @bga/web exec vitest run` | exit 0 — 101 files, 918 tests passed | `artifacts/logs/review-vitest.log` |
| `pnpm --filter @bga/web typecheck` (`tsc -b`) | exit 0 | `artifacts/logs/review-typecheck.log` |
| `pnpm lint` (`eslint . --max-warnings=0 && prettier --check .`) | exit 1: ESLint прошёл; Prettier — 4 файла `e2e/**` (R-2), продуктовый код чист | `artifacts/logs/review-lint.log` |
| `node --test scripts/check-web-bundle.test.mjs` | exit 0 — 16 pass, 0 fail | `artifacts/logs/review-bundle-script-test.log` |
| `node scripts/check-web-bundle.mjs --rebuild` (= `pnpm check:bundle` после пересборки `apps/web`) | exit 0 — 14 правил OK (вкл. `dev-ui-kit-*`, `rebel-base-*`, `board-debug-hook`); модули: 880 sources, только definition/schema/board/assets, `0 apps/web/src/dev modules` | `artifacts/logs/review-check-bundle.log` |
| grep: hex/rgba вне токенов; AC-16 (`DEMO\|SECTOR SCAN\|DESIGN ITERATION\|16:47\|Корусант 6\|OPEN DEMO`); числа 32/69/56 вне тестов и `dev/` | совпадения разобраны: hex/rgba — только незатронутые задачей легаси-файлы; AC-16 — один комментарий (R-3); числа — размеры px и комментарии | `artifacts/logs/review-grep.log` |
| testid из `git show HEAD:e2e/support/testids.ts` (162 id) → `grep` по `apps/web/src` без тестов | все найдены, кроме согласованно удалённого `top-bar-controls`; 10 id собираются шаблонами (как и в HEAD) | — (вывод команды в сессии ревью) |
| `pnpm verify`, `pnpm e2e` | not_run (по брифу; e2e гоняет QA) | — |

## Re-review (post-review delta)

База: продуктовые файлы, изменённые после первого ревью (mtime новее `artifacts/logs/review-check-bundle.log`). Их ровно 10, все в
`apps/web/src/games/rebellion/core-v1/`: `sidebar/MapLegend.tsx`, `canvas/CoreBoardStage.tsx` + `.test.tsx`, `console/ConsoleHeader.tsx`,
`console/ConsoleHeaderFooter.test.tsx`, `panels/TurnControls.tsx`, `geometry/{constants,labelCulling}.ts`, `geometry/{labelCulling,labelLayout}.test.ts`.
Вне `core-v1` ничего не менялось (кроме сборочных api/dist-e2e и .tmp). Входы: Fix round 2/3 (M), QA-1 (C1), QA-2 (C2) в Implementation log.
Прежние версии не сохранялись снимком, поэтому «только prettier --write» проверено косвенно. Дельта в `ConsoleHeader.tsx`,
`ConsoleHeaderFooter.test.tsx` и `TurnControls.tsx` совпадает с заявленным: у ссылки «назад» `minWidth/minHeight: 44` + тест; комментарий без
«SECTOR SCAN»; в `TurnControls` — `overflowWrap/wordBreak: normal`, `hyphens: manual`, при `< NARROW_KEYS` 2 колонки и `turn-activate` на всю
ширину. Props, testids, логика включения клавиш по `legalActions` и обработчики `turn-activate` те же, что в первом ревью. Prettier
по всему `core-v1` чист (см. ниже).

Статус прежних замечаний:
- **R-1 — закрыто.** `onKeyDown` висит на обёртке `map-legend` (общий родитель клавиши и панели) и срабатывает только при `open`;
  `preventDefault` + `stopPropagation` → `useGlobalEscape` не снимает выбор; фокус уходит на `map-legend-toggle`. Тест теперь идёт реальным
  путём (`user.click(toggle)` → `user.keyboard('{Escape}')` с подключённым `useGlobalEscape`, затем второй Esc снова снимает выбор).
- **R-3 — закрыто** (`grep "SECTOR SCAN|DEMO|DESIGN ITERATION" apps/web/src` без тестов — пусто).
- R-2 (Prettier в `e2e/**`) — зона QA; покажет итоговый `pnpm verify`.
- R-4…R-7 — без изменений (nit, на усмотрение лида).

Проверка дельты:
- **Скрытая информация не затронута.** `cullLabels` берёт только сцену: приоритет `isBase` — от сервера (`visibleRebelBaseSystemId`),
  маркеры зоны — в фиксированном `HIDDEN_BASE_ZONE_RECT`, проверка края зависит только от размера канваса и сдвига вьюпорта.
  `coreContentInsets` зависит от ширины окна. Новых источников данных и `data-*`/aria-атрибутов не появилось.
- **Скрытие подписи выбранной / целевой системы у края (AC-5/AC-14) — допустимо.** Подпись с приоритетом ≤ 2 (выбрана / активирована /
  цель) скрывается, только если не помещается в канвас (`labelCulling.ts:116`), то есть её всё равно обрезало бы. Это бывает лишь в compact LOD
  и лишь на одноколоночной консоли (`< 900`, передаётся `stage`). Сама метка состояния (кольцо / пунктир / перекрестие) — узел, а не подпись,
  и остаётся видна. Имя доступно в инспекторе и в «Объектах»; `data-label="hidden"` и `getSystemLabelRect → null` согласованы.
  AC-5 (состояние различимо по форме метки) и AC-14 не нарушены.
- Регрессии: на ≥ 900 px fit использует прежние `CORE_CONTENT_INSETS`, а `stage = null` → отсечение то же, что раньше; квантование сдвига
  по 16 px вместе с полем 8 px корректно.

Новые замечания:

| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| R-8 | nit | `apps/web/src/games/rebellion/core-v1/canvas/CoreBoardStage.tsx:142-149` | `narrow` читает `window.innerWidth` прямо в рендере и пересчитывается, только когда рендер вызван чем-то другим (на практике — сменой `stageSize`). Порог 900 дублирует `CONSOLE_SPLIT` отдельной константой `NARROW_FIT_MAX_WIDTH`, а вызов `coreContentInsets(narrow ? 0 : Infinity)` неуклюж. На практике смена раскладки консоли всегда меняет размер канваса, так что вреда нет. | `useMediaQuery(mq.down(CONSOLE_SPLIT))` (или общая константа) и передавать boolean. |
| R-9 | nit | `sidebar/MapLegend.tsx:221-229` + `CoreTable.tsx` `useDisarmOnEscape` (capture) | Если взят лидер и открыта легенда, один Esc и сбрасывает лидера (обработчик document в фазе capture срабатывает раньше обработчика легенды), и закрывает легенду. Это лишний побочный эффект, а не потеря управления (лидера можно взять снова; так было и до правки). | По желанию: в `useDisarmOnEscape` пропускать Esc, если `e.target` внутри открытой `[data-testid="map-legend"][data-expanded="true"]`. |

Проверки дельты (Node 22.23.5; e2e не запускались — итоговый `pnpm verify` гоняет QA в `artifacts/logs/final-verify.log`, это ревью его не видело):

| Command | Result | Log |
|---|---|---|
| `pnpm --filter @bga/web exec vitest run src/games/rebellion/core-v1 src/games/rebellion/board` | exit 0 — 43 files, 451 tests passed | `artifacts/logs/rereview-vitest.log` |
| `pnpm --filter @bga/web typecheck` | exit 0 | `artifacts/logs/rereview-typecheck.log` |
| `pnpm exec eslint --max-warnings=0 apps/web/src/games/rebellion/core-v1 && pnpm exec prettier --check apps/web/src/games/rebellion/core-v1` | exit 0 («All matched files use Prettier code style!») | `artifacts/logs/rereview-lint.log` |
| grep `SECTOR SCAN\|DEMO\|DESIGN ITERATION` по `apps/web/src` (без тестов); hex `#RRGGBB` по `core-v1` (без тестов) | совпадений нет | — (вывод команды в сессии повторного ревью) |

## Verdict

approved

Блокирующих и major-замечаний нет ни в первом проходе, ни в дельте после ревью. Скрытая информация (AC-8) защищена и в коде, и в тестах;
`check:bundle` зелёный (первый проход). R-1 и R-3 закрыты; R-2 (Prettier в `e2e/**`) зависит от QA и итогового `pnpm verify`;
R-4…R-9 — nit, на усмотрение лида.
