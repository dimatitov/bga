# QA results — SWR-009 Galactic Vector Terminal

QA Lead, QA_EXECUTION, 2026-11-21. QA не писал продуктовый код SWR-009 и e2e-спеки E2E-SYNC не правил в этом проходе.

Как выполнено:

- **Автоматически (e2e/unit/gate)** — итоговый прогон `pnpm verify` запустил Analyst на INTEGRATION
  (`artifacts/logs/integration-verify.log`, последняя строка `EXIT 0`). QA этот прогон не перезапускал (по брифу), а прочитал лог и сверил
  числа с baseline (`artifacts/logs/baseline-verify.log`). Промежуточный прогон E2E-SYNC: `artifacts/logs/E2E-SYNC-final.log` (148/148).
- **Вручную (manual, skill browser-qa)** — автономные Node-скрипты с Playwright 1.65 Chromium из репозитория, лежат вне репозитория
  (scratchpad сессии QA), против уже поднятого dev-сервера web 5180 / api 3000 (пользовательская dev-БД; QA только создал две новые
  партии, существующие не трогал): «Повстанцы vs AI-бот, Обычная» `9ea01f61-4ca9-4dca-bbdd-1ffb4d9539b7` (через форму) и
  «Империя vs AI-бот» `479161fd-cd74-4514-bf82-d888b9cf46af` (через форму). `reducedMotion: reduce`, если не указано иное.
  Сырые замеры: `artifacts/logs/QA-browser-results.json`, `artifacts/logs/QA-browser-extra.log`.
- **Макеты** — те же скрипты, `file://…/artifacts/design-source/<dir>/index.html`; запрос к fonts.googleapis.com перехвачен через
  `context.route` и отдан как `@font-face` с файлами PT Mono 400 из пакета `@fontsource/pt-mono` (тот же бинарник, что у приложения);
  fonts.gstatic.com — тоже перехвачен и отдан локально. Внешних сетевых запросов ни со страниц макетов, ни с приложения не ушло
  (`document.fonts.check('14px "PT Mono"') = true` на всех макетах). Bold у обоих — синтезированный (PA-1).
- **Статика** — `artifacts/logs/QA-static-grep.log` (G-1…G-5, diff зависимостей, растры, лицензия шрифта, G-4 по `apps/web/dist` после
  сборки из integration-verify).

Не запускалось QA: `pnpm verify`/`pnpm e2e`/`pnpm build` (запрет брифа; использован прогон Analyst). `node scripts/check-task.mjs` запущен
информативно (exit 0), финальный гейт DELIVERY — за Analyst (см. AC-18).

## Executed

| TC | Status | Command | Evidence |
|---|---|---|---|
| TC-DA-01…04 | passed | ревью `design-analysis.md` против 4 прототипов; `md5 -q` трёх PNG | 6 разделов (токены, компоненты, Console, Manifest, Map, «не переносится»); md5 `board-source.png` = `rebellion-source.png` = `docs/design/screenshots/06b-system-selected-d.png` = 342ccd7e…; 12 токенов совпадают с `:root` UI Kit; `stateData`/`unit-hit`/переключатель состояний — в §6 «не переносится» |
| TC-ST-01…03 | passed | `git diff 5b83e35 -- */package.json`, `git status` растров, лицензия | `artifacts/logs/QA-static-grep.log`: единственная новая зависимость `@fontsource/pt-mono@5.3.0` (OFL-1.1) в apps/web; новых растров в apps/web нет; в dist растров нет |
| TC-ST-04 | passed | e2e TC-VA-14 + ручной перехват запросов | `artifacts/logs/integration-verify.log` (core-visual-a11y TC-VA-14 ✓); ручной прогон: 0 внешних запросов со стола (`artifacts/logs/QA-browser-results.json`, app1 `ext: []`) |
| TC-ST-05, TC-TK-*, TC-MAP-01…03, TC-SS-01…04, TC-MK-01…03, TC-MF-01…10, TC-H-01…03 | passed | `pnpm test` в составе verify | `artifacts/logs/integration-verify.log`: apps/web 101 files / 919 tests passed (baseline 71/647); rebellion 875, platform 366, api 863 (+2 skipped), scripts 449 — все зелёные |
| TC-TK-02 / G-5 | passed | grep hex вне `tokens.ts` | `artifacts/logs/QA-static-grep.log`: только незатронутый `platform/ui/placeholderCover.ts` (легаси, не в diff) и комментарий в тест-хелпере `renderKit.tsx` |
| TC-MAP-04/05, TC-CON-01…04, TC-SS-05, TC-AI-01/03/06, TC-MK-04…07, TC-MF-11/12, TC-RSP-01, TC-H-05…10, TC-FN-01…10, TC-NAV-01/04…06, TC-IS-06, TC-RSP-05, TC-AI-02/04/05/07/09 | passed | `pnpm e2e` в составе verify | `artifacts/logs/integration-verify.log`: 148 passed (baseline 139), вкл. `e2e/console-game.spec.ts`, `e2e/console-manifest.spec.ts`, `e2e/console-hidden-base.spec.ts`, core-hidden-base, core-visual-a11y, visual-a11y, keyboard, hot-seat, core-victory, persistence, ai-commander |
| TC-H-11 | passed | `pnpm check:bundle` в составе verify | `artifacts/logs/integration-verify.log`: 14 правил OK (вкл. `dev-ui-kit-*`, `rebel-base-*`), 880 sources, 0 модулей `apps/web/src/dev` |
| TC-H-12, TC-DEMO-06 (G-4) | passed | grep по `apps/web/dist` | `artifacts/logs/QA-static-grep.log`: 0 совпадений (`exit=1`), шрифт PT Mono в dist локальный (8 файлов) |
| TC-DEMO-01…03 (G-1…G-3) | passed | grep | `artifacts/logs/QA-static-grep.log`: G-1 и G-3 — 0 совпадений; G-2 — только px-размеры и комментарии (32/69/56 в строках нет) |
| TC-DEMO-04 | passed | manual: `innerText` каталога, страницы игры, формы, настроек, 404 ×3, стола REB и EMP, D и M | `artifacts/logs/QA-browser-results.json` (app6 `forbidden: null` на всех 18 экранах; витрина UI Kit — `uikitText: false`) |
| TC-DEMO-05 | passed (частично) | manual | шапка дисплея `data-systems/routes/regions/zoom` = 32/69/8/41 = `view`/`getViewport().scale`; сводка AI «3 действия» = `automation.steps` 3; время журнала — время событий (01:46/01:47), не «16:47» (app1, app2 в `artifacts/logs/QA-browser-results.json`) |
| TC-CON-01 (manual 1440) | passed | manual | header y18 h44 → status y69 h90 → housing x18 w867 + rail x892 w530 → footer y846 h36; `scrollWidth 1440`, `scrollHeight 900` (app1) |
| TC-CON-06, TC-RSP-02 | passed | manual: 1399/1400, 1199/1200, 1099/1100, 899/900, 759/760 | rail 440→530 на 1400; 340→440 на 1200; 2 колонки ≥ 900, 1 колонка на 899; лист манифеста на 759 (`data-variant=sheet`), rail на 760 (`artifacts/logs/QA-browser-results.json` app3) |
| TC-RSP-01 (матрица §13) | passed (повтор после фиксов: см. «Re-check») | manual: 1440×900, 1280×800, 1024×768, 768×1024, 375×812 | нет HSCROLL ни на одном; fit 32/32 центров в канвасе везде; status bar без наложений (0 пересечений); карта на 768×1024 — 664 px ≈ 65vh, на 375×812 — 526 px ≈ 65vh; манифест rail/rail/rail/rail/лист; скриншоты `artifacts/screenshots/cmp-console-idle-*-app.png` |
| TC-RSP-03 | passed | manual 812×375 | одна колонка, карта 398 px (min 400 включая рамку housing), fit 32/32, нет HSCROLL |
| TC-MF-12/13 (manual) | passed | manual 375×812, 759, 760 | лист: переключатель 371×48 `aria-expanded` true→false, «Пасовать» видна при свёрнутом листе; Esc закрывает манифест; на 760 — rail (`artifacts/screenshots/cmp-manifest-sheet-375x812-app.png`, `artifacts/screenshots/qa-manifest-sheet-collapsed-375x812.png`) |
| TC-MF-11/TC-MK-05 (manual) | passed | manual 1440: «Объекты» → Мандалор → DOM-маркер флота | `data-state=fleetGround`, `data-total=8`; группы empire/space 5 (выбрана), empire/ground 3; строки Звезда Смерти ×1, Истребитель TIE ×4, Штурмовик ×2, AT-ST ×1 = `view.units`; «Закрыть» → `core-context-panel`, фокус на вызвавшем маркере |
| TC-IS-01/02 | passed | manual computed style (клавиатурная модальность + `focus()`; `mouse.down`) | focus-visible = `solid 2px rgb(227,173,92)` у pass-turn, вкладки, zoom-in, «Легенда»; при клике мышью `:focus-visible` = false; hover меняет фон/рамку; pressed zoom-out bg `#151A14` + inset; selected лидер bg `#3B301E` + рамка amber; disabled «Активировать» opacity .62 (app2); `artifacts/screenshots/tc-is-02-key-focus-1440.png` |
| TC-IS-03 | passed | manual `reducedMotion` no-preference vs reduce | клавиши 0.25s → 0s, зум 0.15s → 0s; LED без анимации в idle (`artifacts/logs/QA-browser-extra.log`, app8) |
| TC-IS-05 | passed (re-check) | manual 375×812, `hasTouch` | первый прогон: failed — «← К игре» 36×44 (QA-1). Повтор после C1 fix4: все интерактивные элементы стола и листа ≥ 44×44, в т.ч. `session-back-to-game` 44×44, «Активировать систему» 343×44, «Пасовать»/«Завершить» 169×44, «Закрыть» 75×44, переключатель листа 371×48; меньше 44 — только визуально скрытые skip-ссылки (появляются по фокусу) — `artifacts/logs/QA-recheck.log` |
| TC-AI-03/06/08 (manual) | passed | manual 1440: Лея → Маластар, перемещение u-01 Ботавуи → Маластар, «Завершить» | AI: 3 события (SYSTEM_ACTIVATED alderaan, PIECES_MOVED corellia→alderaan, ACTIVATION_FINISHED); `data-ai-recent` = alderaan, corellia = `getAiRecentSystemIds()`; подписи «AI · 01/02»; 3 строки журнала с меткой AI; LED idle, «Готов · 3 действия»; после reload отметок нет (QD-3) — `artifacts/screenshots/cmp-console-after-ai-1440x900-app.png` |
| TC-FN-03 (manual) | passed | manual | «Пасовать» → диалог, фокус на `pass-confirm-cancel`; «Отмена» закрывает (`artifacts/screenshots/cmp-pass-dialog-1440x900-app.png`) |
| TC-H-05/06 (manual, Империя) | passed | manual 1440 и 375 | `rebelBase = {systemId: null, revealed: false}`; `getRebelBaseSystemId() = null`; `[data-rebel-base=true]` — 0; зона: `data-markers=rebels:space:2,rebels:ground:4` = 6 юнитов `location {kind}` без systemId; манифест зоны `data-restricted=true`, `data-state=restricted`, текст «Доступ ограничен · местоположение базы неизвестно»; в тексте и всех атрибутах манифеста/зоны — 0 имён из 32 систем + 8 регионов (ru+en) и 0 id; localStorage/sessionStorage пусты; URL без базы (app5) |
| Re-check D-1 (E2E-SYNC) / review R-1 | passed | manual 1440 | «Легенда» мышью → Esc: `aria-expanded=false`, фокус на `map-legend-toggle`; с клавиатуры Enter → Esc: то же; выбор системы (Мандалор) **не** сброшен (app1 `legend`) — дефект закрыт |
| TC-NAV-02 | passed | manual D 1440 и M 375 | все 9 экранов: body и h1 «PT Mono», фон rgb(17,21,16) = page, радиус кнопок 1px, `fonts.check` true, нет HSCROLL; скриншоты `artifacts/screenshots/tc-nav-02-*-d.png`/`-m.png` |
| TC-VC-01, 04, 05, 06, 07, 09, 10, 11, 12, 13 | passed | manual, см. раздел «Visual comparison» | пары в `artifacts/screenshots/cmp-*`; все расхождения классифицированы, blocker/major нет |
| TC-VC-02, 03 | passed | manual (app only; макет — тот же экран по умолчанию) | `artifacts/screenshots/cmp-console-armed-1440x900-app.png`, `artifacts/screenshots/cmp-console-activation-1440x900-app.png` |
| TC-VC-08 fleet, fleetGround | passed | manual | `artifacts/screenshots/cmp-manifest-fleet-1440x900-app.png` (Маластар: флот + лидер Лея), `artifacts/screenshots/cmp-manifest-mixed-1440x900-app.png` |
| TC-VC-08 both, leader, empty | not_run | — | в стартовой позиции и после одного хода нет системы с юнитами обеих сторон / только лидером; у пустой системы (Беспин) маркеров нет → манифест не открывается, инспектор показывает «Юнитов нет» (см. D-12). Подделка состояния запрещена (QD-7). Состояния покрыты unit-тестами (`manifestModel.test.ts`, `UnitManifest.test.tsx`, verify) |
| TC-VC-14, 15 | not_run | — | баннер итога и заслонка hot-seat не снимались вручную; есть e2e-скриншоты TC-VA-06/07 (core-visual-a11y, verify зелёный) |
| TC-MAIN-01 | passed | e2e `e2e/console-game.spec.ts` (core path) + `core-turn`/`core-victory` | `artifacts/logs/integration-verify.log` |
| TC-MAIN-02 | not_run | — | отдельного 375-сквозного e2e тапами нет; вручную на 375 проверены лист, клавиши и пул, ход тапами целиком — нет |
| TC-MAIN-03 | passed (Analyst) | manual Analyst | `acceptance.md` раздел Pre-QA (S-1 пройден); QA не подменяет |
| TC-STALE-01/02 | passed | e2e console-game (маркеры после перемещения и хода AI) | `artifacts/logs/integration-verify.log` |
| TC-STALE-04…09 | not_run (вручную) | — | отдельных ручных проверок не было; покрытие — регрессия hot-seat/core-hidden-base в verify |
| TC-R-01 | passed | baseline (Analyst) | `artifacts/logs/baseline-verify.log` EXIT 0: scripts 449, platform 366, forbidden-stars 5, rebellion 875, web 647, api 863+2 skipped, e2e 139 |
| TC-R-02/03/04 | passed | `pnpm verify` (Analyst, INTEGRATION) | `artifacts/logs/integration-verify.log` EXIT 0: scripts 449, platform 366, forbidden-stars 5, rebellion 875, web 919 (+272), api 863+2 skipped, e2e 148 (+9); ни один набор не потерял кейсов |
| TC-R-05 | not_run (гейт) | `node scripts/check-task.mjs docs/tasks/SWR-009` | на этапе QA exit 0 (`artifacts/logs/QA-check-task.log`); финальный прогон после FINAL_ACCEPTANCE/DELIVERY — Analyst |
| TC-R-06 | passed | ревью `review.md` | Verdict `approved` |
| TC-R-07 | passed | `git status` | `apps/api/prisma/dev.db*` QA не трогал; `.env` не читался; трейсы не сохранялись |

## Visual comparison (AC-15)

Все снимки — `artifacts/screenshots/`. Классы — test-cases §15.4. «App» снят на реальной партии; «mock» — прототип с демо-данными.

| # | Pair (mock ↔ app) |
|---|---|
| 1 | `artifacts/screenshots/cmp-console-idle-1440x900-mock.png` ↔ `artifacts/screenshots/cmp-console-idle-1440x900-app.png` |
| 2 | `artifacts/screenshots/cmp-console-after-ai-1440x900-mock.png` (копия экрана макета по умолчанию — в нём уже есть AI-отметки) ↔ `artifacts/screenshots/cmp-console-after-ai-1440x900-app.png`; доп. app: `artifacts/screenshots/cmp-console-armed-1440x900-app.png`, `artifacts/screenshots/cmp-console-activation-1440x900-app.png` |
| 3 | `artifacts/screenshots/cmp-console-manifest-1440x900-mock.png` ↔ `artifacts/screenshots/cmp-console-manifest-1440x900-app.png`; `artifacts/screenshots/cmp-manifest-mixed-1440x900-mock.png` ↔ `artifacts/screenshots/cmp-manifest-mixed-1440x900-app.png` (+ `-app-scrolled.png`); `artifacts/screenshots/cmp-manifest-fleet-1440x900-mock.png` ↔ `artifacts/screenshots/cmp-manifest-fleet-1440x900-app.png`; макеты both/leader/empty сняты без пары (см. TC-VC-08) |
| 4 | `artifacts/screenshots/cmp-manifest-sheet-375x812-mock.png` ↔ `artifacts/screenshots/cmp-manifest-sheet-375x812-app.png`; app 759/760/768: `artifacts/screenshots/cmp-manifest-sheet-759x900-app.png`, `artifacts/screenshots/cmp-manifest-sheet-760x900-app.png`, `artifacts/screenshots/cmp-manifest-sheet-768x1024-app.png` |
| 5 | UI Kit (макет ↔ dev-витрина /dev/ui-kit): palette, type, controls, signals, panels, dialogs — `artifacts/screenshots/cmp-uikit-<section>-mock.png` ↔ `-app.png`; макет `manifest` ↔ app `markers`, макет `map` ↔ app `legend`; реальный диалог стола `artifacts/screenshots/cmp-uikit-dialogs-app-real.png`, `artifacts/screenshots/cmp-pass-dialog-1440x900-app.png` |
| 6 | `artifacts/screenshots/cmp-map-geography-1440x900-mock.png` ↔ `artifacts/screenshots/cmp-map-geography-1440x900-app.png` |
| 7 | `artifacts/screenshots/cmp-console-idle-1280x800-mock.png` ↔ `-app.png`; `artifacts/screenshots/cmp-console-idle-1024x768-mock.png` ↔ `-app.png`; `artifacts/screenshots/cmp-console-idle-375x812-mock.png` ↔ `artifacts/screenshots/cmp-console-idle-375x812-app.png` (+ `-full-` варианты); app 768×1024: `artifacts/screenshots/cmp-console-idle-768x1024-app.png` |
| 8 | Империя, только app: `artifacts/screenshots/cmp-console-empire-1440x900-app.png`, `artifacts/screenshots/cmp-manifest-restricted-1440x900-app.png`, `artifacts/screenshots/cmp-manifest-restricted-375x812-app.png`; макет `artifacts/screenshots/cmp-manifest-restricted-1440x900-mock.png` |

| D | Area | Макет | Приложение | Класс | Решение / владелец |
|---|---|---|---|---|---|
| D-1 | console header | «DESIGN ITERATION 03 · CORE-V1», «SECTOR SCAN 04» | «← К ИГРЕ · BGA / GALACTIC OPERATIONS», «ПРАВИЛА: CORE-V1», ⚙ | accepted-by-design | R-6, R-7 (навигация сохранена) |
| D-2 | status bar | «ВРЕМЯ 01», «РАУНД 01», AI «готов · 3 действия» в одну строку | «ВРЕМЯ 1», «РАУНД 1»; «AI COMMANDER · БОТ ·» переносится на 2–3 строки на 1280–1440; без хода AI — «ГОТОВ» без числа | minor (перенос), accepted (данные) | перенос — косметика, на усмотрение лида |
| D-3 | map housing | «GALACTIC TACTICAL DISPLAY … VECTOR MODE · 56%» | «ТАКТИЧЕСКИЙ ДИСПЛЕЙ · 32 СИСТЕМЫ · 69 СВЯЗЕЙ … ВЕКТОРНЫЙ РЕЖИМ · ОБЗОР · 41%» — числа из `view`/вьюпорта | accepted-by-design | R-6, ru-локаль |
| D-4 | карта | растровая подложка (скриншот старой версии) + SVG поверх; регионы до краёв экрана | векторная Konva-карта; при fit карта не заполняет экран (поля ≈ 70–100 px по краям); то же расположение 8 регионов, 32 систем и 69 связей (Мон-Каламари СЗ, Нал-Хатта С, Родия СВ, Кашиик З, Утапау В, Мигито ЮЗ, Корусант Ю, Мустафар ЮВ) | accepted-by-design | A-3, R-4 |
| D-5 | карта | подписи регионов не пересекаются со штрихами | на 1024–1440 подписи регионов местами лежат на штриховой границе соседнего региона («РЕГИОН УТАПАУ», «РЕГИОН МИГИТО»), «Фелуция» под линией границы на 1024 | minor | Analyst: принято как minor (2026-11-21) |
| D-6 | легенда | ключ «Транспорт · двойная перекладина» | нет ключа транспорта; есть «AI недавно», «Выбрана» | accepted-by-design | R-3 перечисляет глифы без транспорта; QD-4 (всё не-space → наземные) |
| D-7 | rail / манифест 1440 | манифест целиком виден (демо 2 строки) | реальный манифест Мандалора длиннее: итог и последние строки — только прокруткой внутри модуля (тело ≈ 190 px), вкладки сжаты до полосы ≈ 84 px (видна 1 строка) | accepted-by-design | поведение задокументировано в `CoreSidebar` (rail «manifest-open»); Analyst: принято (2026-11-21) |
| D-8 | rail 1024/1280 | модули без внутренней прокрутки | пул лидеров на 1024×768 показывает 2 из 3 лидеров без прокрутки внутри модуля; текст инспектора обрезан посередине строки | minor | A-4 (высоты гибкие); Analyst: принято как minor (2026-11-21) |
| D-9 | манифест | строки «тип … × N» (число справа), заголовки групп фосфорные | «тип × N» одной строкой; заголовок группы цветом стороны (Империя — красный текст `redText`); у невыбранной группы строки без отступа слева, у выбранной — с отступом | minor (раскладка строк), accepted (цвет стороны — R-2/A-5) | лид MF |
| D-10 | манифест скрытой зоны | «В манифесте нет списка юнитов, количества или координат» | показан состав зоны, который сервер прислал Империи (Крестокрыл ×1, Игрекокрыл ×1, Солдат повстанцев ×3, Аэроспидер ×1), «Доступ ограничен · местоположение базы неизвестно», без имён систем | accepted-by-design | AC-7/AC-8/R-5: «показывает только присланное сервером»; утечки нет |
| D-11 | лист 375 | лист ≈ 70 % высоты, кнопка «UNIT MANIFEST ⌄» | лист 568/812 px, «▾ СВЕРНУТЬ МАНИФЕСТ» 48 px; граница листа 760 px вместо 650 px | accepted-by-design | AC-7/AC-13 (< 760) |
| D-12 | манифест empty / leader | отдельные состояния «Пустая система», «Лидер» | у системы без юнитов нет маркера — манифест не открывается, инспектор показывает «Юнитов нет»; у системы только с лидером — не проверено (нет такой) | accepted-by-design | Analyst (2026-11-21): пустая система — «Юнитов нет» в инспекторе; состояние манифеста `empty` покрыто unit-тестами (AC-7) |
| D-13 | мобильный стол 375 | макет — артборд 1440, на 375 просто уменьшен (не мобильная вёрстка) | одна колонка, карта 526 px (65vh), rail ниже; карта при fit — 12 %, содержимое ≈ 195×150 px в канвасе 339×526, большинство подписей скрыто LOD | minor → QA-3 (fixed) | M fix3: после исправления fit 19.7 %, поля 12 px, `artifacts/screenshots/cmp-console-idle-375x812-app.png` |
| D-14 | клавиши на 375 | — | «АКТИВИРОВА / ТЬ СИСТЕМУ» — разрыв слова посередине | minor → QA-2 (fixed) | C2 fix3: < 480 px «Активировать систему» — отдельный ряд во всю ширину, `artifacts/screenshots/qa-375-scroll-600.png` |
| D-15 | UI Kit controls | клавиши растянуты на ячейку, метка поля над полем | клавиши по ширине текста; TextField с плавающей меткой MUI (notched outline) | minor | витрина dev-only, на стол не влияет |
| D-16 | UI Kit panels / signals | номер раздела «05 / MODULES» янтарный; AI-строки журнала с красной кромкой | номер раздела серый; в витрине строки журнала без красной кромки (на реальном столе кромка есть — `artifacts/screenshots/cmp-console-idle-375x812-full-app.png`) | minor | витрина dev-only |
| D-17 | шрифт | PT Mono 400 + синтетический bold | то же (один файл 400, синтез) | accepted-by-design | PA-1 |
| D-18 | footer | «AUTOSAVE · СОХРАНЕНО» | «АВТОСОХРАНЕНИЕ ПОСЛЕ КАЖДОГО ХОДА» (статус сохранения — в status bar, PA-2); бейдж «РЕАЛЬНАЯ КАРТА · ПРАВИЛА ЧАСТИЧНЫЕ» в рамке | accepted-by-design | PA-2, R-7 (бейдж среза) |
| D-19 | платформенные экраны | макетов нет | в шапке платформы чип «MOCK» (существовавший до задачи режим) | accepted-by-design | A-2; не демо-строка AC-16 |

Blocker/major расхождений нет. Семантика цвета соблюдена (Империя — красный залитый, Повстанцы — фосфорный контур, AI — красный пунктир),
PT Mono во всём приложении, HSCROLL нет, утечки базы нет.

## Re-check after fixes (2026-11-21)

По сообщению Analyst: C1 fix4 (QA-1), C2 fix3 (QA-2), M fix3 (QA-3). Повтор вручную теми же скриптами на dev-5180, сессия
`9ea01f61-…`, вьюпорты 1440×900, 1280×800, 1024×768, 768×1024, 375×812 и 759/760; лог `artifacts/logs/QA-recheck.log`
(сырые замеры матрицы — блок app3). Пересняты: `artifacts/screenshots/cmp-console-idle-375x812-app.png` (+ `-full-`),
`artifacts/screenshots/cmp-console-idle-768x1024-app.png` (+ `-full-`), `artifacts/screenshots/cmp-console-idle-1024x768-app.png`,
`artifacts/screenshots/cmp-console-idle-1280x800-app.png`, `artifacts/screenshots/cmp-console-idle-1440x900-app.png`,
`artifacts/screenshots/cmp-manifest-sheet-375x812-app.png`, `artifacts/screenshots/qa-375-scroll-600.png` (клавиши),
`artifacts/screenshots/qa-375-after-zoom-fit.png`.

Результат: QA-1, QA-2, QA-3 — closed (verified). Регрессий нет: HSCROLL нет ни на одном вьюпорте, fit 32/32, status bar без наложений,
rail 530/440/340 на 1440/1280/1024, одна колонка < 900, лист манифеста на 759 и rail на 760, Esc закрывает лист.
e2e после фиксов QA сам не запускал (запрет брифа); финальный `pnpm verify` Analyst после фиксов — EXIT 0, e2e 148 passed, web unit 923 (`artifacts/logs/final-verify.log`).

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
| AC-18 | passed | обновлено Analyst на DELIVERY (гейт, отданный QA Analyst): `pnpm verify` EXIT 0 — `artifacts/logs/final-verify.log`; review approved — `review.md`; check-task exit 0 — `artifacts/logs/final-check-task.log` |

## Verification
- lint: passed — `artifacts/logs/final-verify.log` (eslint + prettier; финальный прогон Analyst после фиксов; ранее `artifacts/logs/integration-verify.log`)
- typecheck: passed — `artifacts/logs/final-verify.log`
- unit: passed — `artifacts/logs/final-verify.log` (scripts 449, platform 366, forbidden-stars 5, rebellion 875, web 923, api 863 + 2 skipped)
- build: passed — `artifacts/logs/final-verify.log`
- check:bundle: passed — `artifacts/logs/final-verify.log` (14 правил OK, 880 sources, 0 dev-модулей)
- e2e: passed — `artifacts/logs/final-verify.log` (148 passed после фиксов QA-1…QA-3; прогон Analyst, QA не перезапускал)
- pnpm verify: passed — `artifacts/logs/final-verify.log` (EXIT 0)
- static greps (AC-2/3/16): passed — `artifacts/logs/QA-static-grep.log`
- manual browser QA (AC-9/11/13/14, hidden info): passed — `artifacts/logs/QA-browser-results.json`, повтор после фиксов QA-1…QA-3 — `artifacts/logs/QA-recheck.log`
- visual comparison (AC-15): passed — `artifacts/screenshots/cmp-console-idle-1440x900-app.png` и пары раздела «Visual comparison»
- check-task (QA stage, informative): passed — `artifacts/logs/QA-check-task.log` (exit 0); финальный гейт DELIVERY — за Analyst

## Defects
| # | Severity | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|
| QA-1 | minor | 375×812 (`hasTouch`), открыть любую партию core-v1; замерить `session-back-to-game` («← К игре» в `console-header`) | цель касания ≥ 44×44 px на мобильном (AC-14, TC-IS-05) | было 36×44 px. Повтор после C1 fix4 (2026-11-21): 44×44 на 375, 82×44 на 759/768/1440 — `artifacts/logs/QA-recheck.log`, `artifacts/screenshots/cmp-console-idle-375x812-app.png` | closed (verified) |
| QA-2 | minor | 375×812, стол «Повстанцы vs AI», rail → ряд клавиш | подпись клавиши переносится по словам | было «АКТИВИРОВА / ТЬ СИСТЕМУ». Повтор после C2 fix3: «Активировать систему» — отдельный ряд 343×44 в одну строку, «Пасовать»/«Завершить активацию» 169×44 без разрывов (`overflow-wrap: normal`); на 1024/1280/1440/768 переносы только по словам — `artifacts/screenshots/qa-375-scroll-600.png`, `artifacts/screenshots/cmp-console-idle-1024x768-app.png`, `artifacts/logs/QA-recheck.log` | closed (verified) |
| QA-3 | minor | 375×812, открыть стол; `__boardDebug.getViewport()`; «⤢» | fit вписывает карту в канвас с разумными полями | было: 12 %, поля ≈ 72 px. Повтор после M fix3: 375×812 — scale 0.197 (20 %), x = 12; 768×1024 — 0.429 (43 %), x ≈ 20; 1440×900 без изменений (0.406, 41 %); fit 32/32 на всех вьюпортах; «⤢» даёт тот же вид — `artifacts/logs/QA-recheck.log`, `artifacts/screenshots/cmp-console-idle-375x812-app.png`, `artifacts/screenshots/cmp-console-idle-768x1024-app.png` | closed (verified) |
| (D-1 E2E-SYNC / R-1) | minor | «Легенда» → Esc (мышью и клавиатурой) | закрывается, фокус на кнопке, выбор не сбрасывается | так и есть после M fix round 2 | closed (перепроверено QA) |

## Accepted limitations (не дефекты)

- **O-1** (Империя vs AI): первый ход AI-Повстанцев до первого хода человека не отмечается на карте (`getAiRecentSystemIds() = []`,
  `data-ai-recent=false` у зоны в новой партии `479161fd-…`). Принято по QD-3 / A-6: отметки строятся только из `automation.lastRun`
  текущей страницы.
- После перезагрузки страницы AI-отметок нет (QD-3), сводка показывает «ГОТОВ» без числа действий.
- Расхождения класса accepted-by-design — таблица «Visual comparison».

## Open questions

Нет. D-12, D-5, D-7, D-8 решены Analyst 2026-11-21; QA-1…QA-3 закрыты повторной проверкой.
