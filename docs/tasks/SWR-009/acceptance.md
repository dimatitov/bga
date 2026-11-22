# Acceptance — SWR-009

## Pre-QA business validation

Analyst, 2026-11-21, вручную во встроенном браузере на dev-сервере `dev-5180` (web 5180, api 3000, пользовательская dev-БД;
провайдер AI — бот). Новая партия «Повстанцы vs AI · Обычная», сессия `a58befad-280a-43ad-ba53-2a417e9ec91c`, 1440×900.
Шаги выполнялись кликами по реальным элементам (через DOM-события), состояние читалось из DOM.

| # | Шаг сценария S-1 | Результат |
|---|---|---|
| 1 | Каталог → страница игры → «Новая партия» → «Начать игру» | стол-консоль открыт: header, status bar, map housing, rail, footer (`artifacts/screenshots/bv-01-new-game-1440.jpg`) |
| 2 | Взять лидера Ян Додонна → «Объекты» → Тойдария → «Активировать систему» (`turn-activate`, enabled, `data-system-id=toydaria`) | `turn-panel[data-state=activation]`, «Активация: Тойдария · Ян Додонна», система отмечена на карте (`artifacts/screenshots/bv-02-activation-move-panel-1440.jpg`) |
| 3 | «Выбрать все» из Ботавуи → «Переместить (8) в Тойдария» | `map-system-toydaria[data-markers]="rebels:space:4,rebels:ground:4"`, у Ботавуи маркеров нет |
| 4 | «Завершить активацию» | AI сделал ход: LED `idle`, «Готов · 3 действия», сводка «Ход AI: 3 действия», `map-system-alderaan/corellia[data-ai-recent=true]` с подписями «AI · 01/02», строки журнала с меткой AI (`artifacts/screenshots/bv-03-after-ai-turn-ai-marks-1440.jpg`) |
| 5 | «Пасовать» | диалог «Пасовать?» («В пуле ещё 2 лидера…»), фокус на «Отмена»; «Пасовать» → AI доиграл фазу и спасовал → «Обновление» → время 1 → 2 → «Раунд 2 · Приказы», лидеры вернулись |
| 6 | Unit Manifest (сессия `46d94157-…`): «Объекты» → Мандалор → маркер флота | манифест с реальным составом: Флот 5 (Звезда Смерти ×1, Истребитель TIE ×4), Наземные 3 (Штурмовик ×2, AT-ST ×1), итог 8 |

Найдено при проверке и возвращено исполнителям до QA (исправлено, подтверждено повторным осмотром 1440×900): мобильная карта ~150 px и
многострочная легенда (M), сетка 1280×800 в одну колонку (C1), высота статуса на 375 (C1), зажатый манифест в rail (C2, MF),
вкладки на мобильном 4,6 тыс. px (C2), «Регион: Регион …» (MF). Подробности — Implementation log в `implementation-plan.md`.

Вывод pre-QA: бизнес-сценарий S-1 на новом столе проходит; передано в QA_EXECUTION. Скрытая зона Империи, мобильные размеры и сверка
с макетами — в QA.

## Acceptance criteria

Вердикты Analyst по доказательствам QA (`qa-results.md`), review (`review.md`) и собственной проверке (раздел Pre-QA). Колонка Evidence
по AC-1…AC-17 перенесена из `qa-results.md` после сверки путей; AC-18 — финальный гейт DELIVERY.

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

Принятые ограничения (не дефекты, решения Analyst): O-1 — первый ход AI в партии за Империю (до первого хода человека) не отмечается на
карте (QD-3/A-6: отметки только из `automation.lastRun`); D-12 — для пустой системы манифест не открывается, инспектор пишет «Юнитов нет»
(состояние `empty` покрыто unit-тестами); состояния манифеста «обе фракции» и «только лидер» проверены unit-тестами, в реальной партии
вручную не достигнуты (QD-7); на 375 px карта вписывается в ~20 % масштаба (узкий экран, зум кнопками, щипка нет — как и до задачи).

## Final decision
accepted — все AC-1…AC-18 passed с доказательствами; review approved (повторно после правок); `pnpm verify` EXIT 0; FINAL_ACCEPTANCE passed.
