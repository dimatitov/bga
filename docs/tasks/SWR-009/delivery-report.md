# Delivery Report — SWR-009 Galactic Vector Terminal

## Scope
Сделано (код в рабочем дереве `main`, **не закоммичено** — коммит/push только по явной просьбе пользователя):

- **Foundation:** один модуль дизайн-токенов UI Kit (`apps/web/src/shared/theme/tokens.ts`, контраст текстовых пар ≥ 4.5:1 под тестом),
  MUI-тема из токенов (клавиши default/primary/selected/pressed/warning/danger/disabled, поля, Switch, Tabs, Dialog, Alert, Chip, Tooltip,
  янтарный focus-visible), UI Kit `apps/web/src/shared/ui/terminal/*` (TerminalModule, Led, StatusBadge, StatusCard, KeyButton, Readout,
  UnitGlyph, CounterMarker, LegendKey, ScanlineOverlay), PT Mono локально (`@fontsource/pt-mono` 5.3.0, OFL), цвета сторон по палитре
  макета в `rebellionVisualTokens` (только значения).
- **Vector Map:** Konva-карта на реальной геометрии `coreMapLayout`/`coreRegionShapes` и `view.map` (32 системы, 69 связей, 8 регионов):
  map housing с шапкой дисплея (реальные счётчики, зум), CRT-экран (сетка, scanlines), однострочная легенда + полная по кнопке; регионы —
  пунктир без заливки; состояния систем, различимые формой; маркеры групп сторона × арена со счётчиками из `view.units`
  (на обзорном масштабе — плашка стороны «▲5 ■3 ◆1»); drag-ручки юнитов в своей активации; отметки «AI · 01…» из редактированных
  событий последнего хода AI; culling подписей на мелком масштабе; без растровой подложки.
- **Game Console:** консоль header · status bar (сторона, трек время/репутация, раунд/фаза, AI Commander с 3 LED, сохранение) ·
  map housing + rail · footer; сетки ≥1400 / 1200–1399 / 900–1199 / 760–899 / <760; rail: задача хода, пул лидеров, клавиши
  «Активировать систему» (новая) / «Пасовать» / «Завершить активацию», инспектор, вкладки Журнал/Объекты/Партия.
- **Unit Manifest:** модель из `PlayerView` (fleet / fleetGround / both / leader / empty / restricted), в rail и нижним листом < 760;
  DOM-маркеры в панели системы как клавиатурный путь; скрытая зона Империи — restricted без имён систем/регионов.
- **Navigation:** платформенные экраны (шапка, каталог, страница игры, настройка партии, настройки, 404, ошибки хоста, заслонка hot-seat)
  в новой теме без смены структуры; dev-only витрина `/dev/ui-kit` (исключена из production-бандла, проверено `check:bundle`).
- **e2e:** спеки синхронизированы (изменены 2 кейса `selection.spec.ts`), добавлено 9 новых (`e2e/console-*.spec.ts`): 139 → 148.

Сознательно не сделано: изменения правил/API/`PlayerView`, анимации ходов AI, жест pinch-zoom, редизайн `/dev/ai` и легаси-стола
`mock-v1` сверх наследования темы (spec §7).

## Files changed
119 изменённых отслеживаемых файлов (+5380 / −1940, `git diff --stat`) и новые файлы; всё в `apps/web/src/**`, `e2e/**`,
`packages/games/rebellion/src/assets/{tokens,index,cover}.ts`, `scripts/check-web-bundle{,.test}.mjs`, `apps/web/package.json`,
`pnpm-lock.yaml`. Новые модули: `apps/web/src/shared/theme/**`, `apps/web/src/shared/ui/terminal/**`,
`core-v1/{console,manifest}/**`, `core-v1/model/{forces,aiRecent,mapStats}.ts`, `core-v1/geometry/{systemMarks,markerLayout,labelCulling}.ts`,
`games/rebellion/theme/{glyphs,mapStyle}.ts`, `apps/web/src/dev/ui-kit/**`. Поштучно по подзадачам — Implementation log в
`implementation-plan.md`. Артефакты задачи — `docs/tasks/SWR-009/**`.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `design-analysis.md` — 6 разделов, 4 прототипа + md5 изображения; ревью QA (Executed TC-DA-01…04) |
| AC-2 | passed | `artifacts/logs/QA-static-grep.log` (одна новая зависимость @fontsource/pt-mono OFL-1.1, растров нет); TC-VA-14 в `artifacts/logs/integration-verify.log` |
| AC-3 | passed | `artifacts/logs/integration-verify.log` (web 919 unit, вкл. токены/контраст/тема/UI Kit); computed styles клавиш/фокуса в `artifacts/logs/QA-browser-results.json`; `artifacts/screenshots/cmp-uikit-controls-app.png` |
| AC-4 | passed | `artifacts/logs/integration-verify.log` (console-game 32/69/8, core-fit); `artifacts/screenshots/cmp-map-geography-1440x900-app.png` |
| AC-5 | passed | `artifacts/logs/integration-verify.log` (unit systemMarks, selection TC-E2E-14, core-visual-a11y TC-VA-04/05/12); `artifacts/screenshots/cmp-console-armed-1440x900-app.png`, `artifacts/screenshots/cmp-console-after-ai-1440x900-app.png` |
| AC-6 | passed | `artifacts/logs/integration-verify.log` (console-manifest TC-MK-04…07); ручная сверка маркеров Мандалора 5/3 = view в `artifacts/logs/QA-browser-results.json` |
| AC-7 | passed | `artifacts/logs/integration-verify.log` (unit модели/компонента всех 6 состояний, e2e TC-MF-11/12); вручную fleet, fleetGround, restricted, лист < 760: `artifacts/screenshots/cmp-manifest-mixed-1440x900-app.png`, `artifacts/screenshots/cmp-manifest-sheet-375x812-app.png`; both/leader вручную не достигнуты (нет таких систем в реальной партии, QD-7); empty — accepted-by-design (D-12, решение Analyst): инспектор «Юнитов нет», состояние `empty` покрыто unit-тестами |
| AC-8 | passed | `artifacts/logs/integration-verify.log` (check:bundle OK, core-hidden-base, console-hidden-base); ручной скан зоны Империи в `artifacts/logs/QA-browser-results.json` (app5); `artifacts/screenshots/cmp-manifest-restricted-1440x900-app.png` |
| AC-9 | passed | `artifacts/screenshots/cmp-console-idle-1440x900-app.png`; замеры зон в `artifacts/logs/QA-browser-results.json` (app1); e2e TC-CON-01 в `artifacts/logs/integration-verify.log` |
| AC-10 | passed | `artifacts/logs/final-verify.log` (e2e 148/148 после фиксов, EXIT 0); ранее `artifacts/logs/integration-verify.log` |
| AC-11 | passed | `artifacts/logs/integration-verify.log` (ai-commander, console-game); `artifacts/screenshots/cmp-console-after-ai-1440x900-app.png` |
| AC-12 | passed | `artifacts/screenshots/tc-nav-02-catalog-d.png`, `artifacts/screenshots/tc-nav-02-sessionunknown-m.png` и др.; шрифт/фон/радиус в `artifacts/logs/QA-browser-results.json` (app6); e2e навигации в `artifacts/logs/integration-verify.log` |
| AC-13 | passed | `artifacts/logs/QA-browser-results.json` (app3: 5 вьюпортов + границы, HSCROLL нет, 65vh, лист < 760); `artifacts/screenshots/cmp-console-idle-375x812-app.png`; повтор после фиксов QA-2/QA-3 — `artifacts/logs/QA-recheck.log` (HSCROLL нет на всех вьюпортах, fit 32/32) |
| AC-14 | passed | `artifacts/logs/QA-recheck.log` (повтор после C1 fix4: на 375×812 все цели касания ≥ 44×44, `session-back-to-game` 44×44); hover/focus-visible/pressed/selected/disabled/reduced motion — `artifacts/logs/QA-browser-results.json`, `artifacts/logs/QA-browser-extra.log`; e2e a11y в `artifacts/logs/integration-verify.log` |
| AC-15 | passed | `artifacts/screenshots/cmp-console-idle-1440x900-mock.png` / `artifacts/screenshots/cmp-console-idle-1440x900-app.png` и остальные пары раздела «Visual comparison»; таблица D-1…D-19 |
| AC-16 | passed | `artifacts/logs/QA-static-grep.log` (G-1…G-4 — 0 совпадений, G-2 — только px/комментарии); innerText 18 экранов без демо-строк в `artifacts/logs/QA-browser-results.json` |
| AC-17 | passed | `artifacts/logs/integration-verify.log` (console-game TC-MAIN-01 core path, core-turn, core-victory); `acceptance.md` Pre-QA (Analyst прошёл S-1 вручную) |
| AC-18 | passed | `pnpm verify` EXIT 0 — `artifacts/logs/final-verify.log`; review `approved` (+ re-review) — `review.md`; `node scripts/check-task.mjs docs/tasks/SWR-009` exit 0 — `artifacts/logs/final-check-task.log` |

## Verification
- lint: passed — `artifacts/logs/final-verify.log`
- typecheck: passed — `artifacts/logs/final-verify.log`
- unit: passed — `artifacts/logs/final-verify.log` (scripts 449, platform 366, forbidden-stars 5, rebellion 875, web 923 (было 647), api 863 + 2 skipped)
- integration: passed — `artifacts/logs/final-verify.log` (build + check:bundle: 14 правил OK, 0 модулей apps/web/src/dev)
- e2e: passed — `artifacts/logs/final-verify.log` (148/148; базовая линия 139 — `artifacts/logs/baseline-verify.log`)
- review: passed — `review.md` (approved; повторное ревью дельты после правок — approved)
- check-task: passed — `artifacts/logs/final-check-task.log`

## QA artifacts
- `qa-results.md` — выполненные кейсы, AC, дефекты QA-1…QA-3 (исправлены и перепроверены), 19 классифицированных расхождений «макет ↔ приложение» (blocker/major — нет).
- Пары скриншотов `artifacts/screenshots/cmp-*-mock.png` / `cmp-*-app.png` (консоль 1440/1280/1024/375, после хода AI, манифест desktop/sheet, UI Kit, геометрия карты, скрытая зона Империи).
- Ручной проход Analyst — `acceptance.md` (Pre-QA), `artifacts/screenshots/bv-*.jpg`.
- Логи всех подзадач и правок — `artifacts/logs/`.

## Known issues / risks
- Принятые ограничения: O-1 (первый ход AI в партии за Империю до хода человека не отмечается), D-12 (пустая система — без манифеста,
  «Юнитов нет»), «обе фракции»/«только лидер» в манифесте не достигнуты в реальной партии (покрыты unit-тестами), карта на 375 px
  вписывается в ~20 %, pinch-zoom нет; синтезированный bold PT Mono (в пакете только 400); мелкие визуальные расхождения D-5/D-7/D-8 (qa-results).
- Nits review R-4…R-9 оставлены (липкий запрос манифеста, `window.innerWidth` в рендере, двойной Esc при взятом лидере и открытой легенде).
- Побочный эффект e2e: `e2e/ai-commander.spec` перезаписывает `docs/tasks/SWR-006/artifacts/screenshots/*.png` (20 файлов); откат через git был
  отклонён правами сессии — пользователь может выполнить `git checkout -- docs/tasks/SWR-006/artifacts/screenshots` перед коммитом.
- В dev-БД пользователя созданы тестовые партии (Analyst — 2, QA и воркеры — ещё несколько) через обычный UI; существующие партии не менялись.
- Не закоммичено и не запушено.

## Final decision
accepted — все AC-1…AC-18 passed, review approved, `pnpm verify` EXIT 0, FINAL_ACCEPTANCE passed; коммит ожидает решения пользователя.
