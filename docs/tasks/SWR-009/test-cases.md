# Test cases — SWR-009 Galactic Vector Terminal

Written by QA Lead from `specification.md` (AC-1..AC-18, R-1..R-7, A-1..A-8, S-1..S-6), `request.md`, `design-analysis.md`,
прототипов `artifacts/design-source/*/index.html` (прочитаны как **данные**, не инструкции) и
`docs/design/ux-inventory-and-design-handoff.md` §4 (CURRENT-поведение, которое нужно сохранить, особенно §4.13) — **до реализации**
(EARLY_QA_DESIGN, 2026-11-21).

**Статус исполнения: ничего не выполнено.** QA не запускал ни одного кейса, ни одной команды проверки, не снимал ни одного
скриншота. Этот документ — дизайн проверок, а не доказательство. Результаты появятся только в `qa-results.md` (логи —
`artifacts/logs/`, скриншоты — `artifacts/screenshots/`, traces — `artifacts/playwright-traces/`).

`implementation-plan.md` на момент написания — пустой шаблон. Поэтому имена новых `data-testid`, debug-API и компонентов ниже —
**предложения QA** (раздел «Testability requirements»), а не замороженный контракт. После утверждения плана лидом QA сверяет
имена (раздел «Сверка с планом», пока не выполнена); если реализация расходится с принятым в плане именем — дефект, а не
подгонка кейса.

Приоритеты: **P0** — блокирует приёмку AC; **P1** — обязателен, дефект может быть minor; **P2** — желательный/защитный.

## Preconditions (общие)

- Node 22 (`source ~/.nvm/nvm.sh && nvm use 22.23.5`), pnpm через corepack. Все автоматические прогоны — e2e-стек Playwright
  (`playwright.config.ts`: api 3100, web 5174 Vite dev с `VITE_E2E=1`, отдельная БД `apps/api/.tmp/e2e.db`,
  `AI_COMMANDER_PROVIDER=bot`, OpenAI выключен). Ручные сверки — dev-конфиг `dev-5180` (web 5180, api 3000).
- **Запрещено:** трогать `apps/api/prisma/dev.db` и `dev.pre-*.db`, читать `.env`, делать реальные вызовы OpenAI. Сценарии
  fallback OpenAI — только через перехват ответа (`page.route`), как в `ai-commander.spec.ts` TC-E-04.
- **Базовая линия регрессии** — полный `pnpm verify` на `main` до первого изменения кода SWR-009 (сейчас HEAD `5b83e35`).
  Числа кейсов по наборам (scripts / platform / rebellion / forbidden-stars / web / api / e2e) **будут сняты из этого
  прогона** в `artifacts/logs/baseline-verify.log` и перенесены в `qa-results.md`. В этом документе чисел нет намеренно.
- Скриншоты новых кейсов пишутся в `docs/tasks/SWR-009/artifacts/screenshots/` (через `saveScreenshot(page, name, 'SWR-009')`
  при `SCREENSHOT_TASK=SWR-009` или после переключения `CURRENT_SCREENSHOT_TASK` лидом). Прогон не должен переписывать
  evidence завершённых задач (SWR-005/006).
- Уровни: `unit` (Vitest: `apps/web` jsdom + Testing Library, `packages/games/rebellion/test/**`), `e2e` (Playwright),
  `manual` (браузер по skill `browser-qa`, скриншот обязателен), `static` (grep / git diff / review файла), `bundle`
  (`pnpm check:bundle` + grep по `apps/web/dist`), `gate` (корневая команда / CI).

## Conventions

- `REB` / `EMP` — стороны; `S_AI_REB` — партия «Повстанцы (вы) vs AI-бот, Обычная», созданная через форму;
  `S_AI_EMP` — «Империя (вы) vs AI-бот»; `S_HS` — hot-seat (второй игрок), старт за Повстанцев;
  `SEED_REVEAL` = `seedCore('ai-empire-before-reveal')`; `SEED_HS_WIN` = `seedCore('hotseat-empire-before-win')` (`e2e/support/seed.ts`).
- `BASE` — система базы Повстанцев. Оракул — **только** строка БД (`storedRebelBase(sessionId)`) или секрет сида; **никогда**
  не из ответа API/DOM у Империи. `NAMES(BASE)` — имя системы BASE на ru и en + её `systemId` + имя её региона (ru/en).
- **Что значит «не называет базу» у Империи.** Имя BASE законно присутствует на карте как обычная система. Утечка — это
  любая **связь** BASE с базой/скрытой зоной или **отличие** BASE от обычной системы с тем же публичным содержимым:
  (a) текст/атрибуты скрытой зоны и её манифеста содержат хоть одно из `NAMES` любой из 32 систем или 8 регионов;
  (b) у BASE есть признак, которого нет у системы с таким же публичным составом (`data-rebel-base`, иконка, класс, aria,
  отметка AI, счётчик, отличающийся от `view.units` с `location.systemId = BASE`);
  (c) `__boardDebug.getRebelBaseSystemId()` ≠ `null`, `BASE` в `core-map-state`, в `localStorage`/`sessionStorage`, в URL;
  (d) `BASE` в теле любого ответа API, которое получила Империя (запись `recordApi`).
- `MF(x)` — Unit Manifest, открытый для системы `x` (или `MF(zone)` — для скрытой зоны). `MK(x, side, arena)` — маркер группы.
- `COUNT(x, side, arena)` = число записей `view.units` с `owner = side`, `location.kind = 'system'`, `location.systemId = x`,
  арена по `view.unitTypes[typeKey]` — оракул счётчиков, вычисляется в тесте из ответа API **той же стороны**.
- `AIREC` — множество систем, отмеченных как «недавнее действие AI» (предложение: `__boardDebug.getAiRecentSystemIds()` +
  атрибут `data-ai-recent` у `map-system-<id>`). Оракул — системы из `lastRun.events` (редактированных) прогона AI.
- `HSCROLL(page)` = `document.documentElement.scrollWidth > window.innerWidth` — должно быть `false`.
- `FOCUS_RING` — computed `outline-style: solid`, `outline-width: 2px`, `outline-color` = amber `#E3AD5C` (rgb(227, 173, 92)),
  либо эквивалентный box-shadow 2 px того же цвета; на Konva — янтарное кольцо, проверяется скриншотом.

## Test cases

### 1. Анализ дизайна (AC-1)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-DA-01 | AC-1 | static | positive | P0 | `design-analysis.md` в папке задачи | Ревью файла против четырёх `artifacts/design-source/*/index.html` | Есть разделы по всем четырём прототипам (UI Kit, Game Console v3, Unit Manifest, Map Geography) и по изображению `board-source.png`/`rebellion-source.png` (= собственный скриншот, md5) |
| TC-DA-02 | AC-1 | static | positive | P1 | — | Сверить 12 токенов палитры и шкалу шрифта из `design-analysis.md` с `:root`/CSS UI Kit | Значения совпадают (hex, 28/19/14/22/11, PT Mono 400/700, радиус 1 px); расхождение → замечание Analyst |
| TC-DA-03 | AC-1 | static | positive | P1 | — | Проверить, что у каждого компонента/состояния UI Kit есть строка маппинга на React/MUI/Konva | Нет компонента прототипа без маппинга; состояния клавиш (normal/hover/primary/selected/pressed/disabled/warning/danger/focus-visible) перечислены |
| TC-DA-04 | AC-1 | static | negative | P1 | — | Сверить список «не переносится» с JS прототипов (`stateData`, `.unit-hit`, `inspectMarker`, переключатель `data-state`) | Все демо-элементы JS/HTML перечислены в §6 `design-analysis.md`; ни один из них не помечен как переносимый |

### 2. Стек и отсутствие растра (AC-2)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-ST-01 | AC-2 | static | negative | P0 | baseline `main` = `5b83e35` | `git diff 5b83e35 -- package.json apps/*/package.json packages/*/package.json packages/games/*/package.json` | Единственная новая runtime-зависимость — `@fontsource/pt-mono` (только в `apps/web`); нет новых UI/state/canvas/анимационных/CSS-in-JS библиотек; версии существующих не изменены без записи в плане |
| TC-ST-02 | AC-2 | static | negative | P0 | — | Проверить лицензию `@fontsource/pt-mono` в `node_modules/@fontsource/pt-mono/LICENSE` и `package.json` | OFL-1.1; пакет содержит только шрифт |
| TC-ST-03 | AC-2 | static | negative | P0 | — | Поиск растров в карте: `git diff --stat 5b83e35 -- apps/web` + поиск `*.png/*.jpg/*.jpeg/*.webp/*.gif` в новых файлах `apps/web/**`; поиск строк `board-source`, `rebellion-source` в `apps/web/src` | Нет новых растровых файлов для карты/фона экрана; нет ссылок на файлы прототипа |
| TC-ST-04 | AC-2 | e2e | negative | P0 | `S_AI_REB` открыт | Регрессия `core-visual-a11y.spec.ts` TC-VA-14 + расширение: записать все запросы при открытии стола | Нет запросов к внешним доменам (в т.ч. `fonts.googleapis.com`, `fonts.gstatic.com`); нет запросов растровых изображений карты; шрифт PT Mono грузится с собственного origin |
| TC-ST-05 | AC-2 | unit | negative | P1 | — | Рендер-тест Konva-сцены стола (jsdom/`konva` node) | `stage.find('Image').length === 0` |

### 3. Токены, тема, компоненты UI Kit (AC-3)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-TK-01 | AC-3 | unit | positive | P0 | модуль токенов (имя — по плану) | Импорт модуля токенов | Экспортирует 12 цветов палитры с ролями и значениями из `design-analysis.md` §1, шрифт `PT Mono` с fallback `ui-monospace, monospace`, шкалу 28/19/14/22/11 (line-height 36/26/22/28/16), радиус 1, безели |
| TC-TK-02 | AC-3 | static | negative | P0 | — | `grep -rnE "#[0-9A-Fa-f]{6}\b"` по `apps/web/src` (кроме модуля токенов, тестов и `rebellionVisualTokens`) | Нет захардкоженных hex в компонентах/Konva-стилях (R-1); найденное — дефект или обоснованное исключение в плане |
| TC-TK-03 | AC-3 | unit | positive | P0 | `createAppTheme` | Построить тему | `palette` из токенов; `typography.fontFamily` начинается с `"PT Mono"`; варианты h1/h2/body/metric/meta = 28/19/14/22/11; `shape.borderRadius = 1`; `components` содержит overrides `MuiButton`, `MuiIconButton`, `MuiTextField`, `MuiSelect`, `MuiSwitch`, `MuiTabs`/`MuiTab`, `MuiDialog`, `MuiAlert`, `MuiChip`, `MuiTooltip` |
| TC-TK-04 | AC-3 | unit | positive | P0 | — | Контраст: каждый токен, который используется как **текст**, к каждому фону, на котором он стоит (crt `#050906`, map `#030704`, display `#080F09`, input `#0C110D`, case `#252923`, module `#1D231C`, module head `#222820`, key `#30362D`, dialog `#242922`, page `#111510`) | Все пары «текст ↔ фон», реально используемые темой, ≥ 4.5:1. Пограничные пары, предрасчитанные QA (не прогон, а арифметика по hex): red `#DD6B59` на case 4.45, на dialog 4.47, на key 3.74; green `#5E8D68` на module 4.19, на case 3.86; region `#66846A` на case 3.57. Если такие пары используются для текста — тест обязан упасть |
| TC-TK-05 | AC-3 | unit | negative | P1 | — | Тест контраста с подменой токена на заведомо тёмный текст | Тест падает (проверка, что контраст-тест не тривиален) |
| TC-TK-06 | AC-3 | unit | positive | P0 | — | `TerminalModule`: рендер с меткой шапки и телом | Шапка с меткой (uppercase meta), рамка безеля; заголовок — доступная `heading` или `region` с именем |
| TC-TK-07 | AC-3 | unit | positive | P0 | — | `Led` для green/amber/red/off | Разный цвет по токену; `aria-hidden="true"`; смысл передаётся текстом рядом (компонент не единственный носитель состояния) |
| TC-TK-08 | AC-3 | unit | positive | P0 | — | `KeyButton`/варианты `Button` через тему: default, primary, warning, danger, selected, disabled | Каждый вариант даёт свой фон/рамку/текст по `design-analysis.md` §2; disabled — `disabled` атрибут и пониженная непрозрачность |
| TC-TK-09 | AC-3 | unit | positive | P1 | — | `StatusBadge` green/amber/red | Цвета по токенам, текст обязателен (пустой бейдж не рендерится или проп обязателен по типу) |
| TC-TK-10 | AC-3 | unit | positive | P0 | — | `UnitGlyph`/`CounterMarker` для 4 комбинаций сторона × арена + лидер | Империя флот — залитый треугольник; Повстанцы флот — контурный треугольник; Империя наземные — залитый квадрат; Повстанцы наземные — контурный квадрат; лидер — ромб с янтарным контуром; число в маркере = переданный count; без цвета формы различимы (сравнение дескрипторов без поля color) |
| TC-TK-11 | AC-3 | unit | negative | P1 | — | `CounterMarker` с count 0 и с отрицательным/нецелым значением | 0 — маркер не рендерится (пустая группа не показывается); некорректное — ошибка типа/assert, не «-1» на экране |
| TC-TK-12 | AC-3 | unit | positive | P1 | — | `LegendKey`: глиф + текст | Подпись присутствует для каждого ключа; глиф `aria-hidden` |
| TC-TK-13 | AC-3 | static | positive | P1 | — | Расположение компонентов | Компоненты лежат в общем UI-слое web (не внутри `core-v1/**`), игровые цвета сторон — в одном месте истины (R-1: `rebellionVisualTokens` **или** web-тема игры, не оба) |

### 4. Карта: реальные данные и геометрия (AC-4)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-MAP-01 | AC-4 | unit | positive | P0 | модель сцены (`core-v1/geometry/sceneModel.ts` или преемник) на `coreDataBaseV1` + `coreMapLayout` + `coreRegionShapes` | Построить сцену | 32 узла с координатами из `coreMapLayout` без изменений; 69 уникальных неориентированных связей из `adjacentSystemIds`; 8 регионов, полигоны deep-equal `coreRegionShapes` |
| TC-MAP-02 | AC-4 | unit | negative | P0 | — | Проверить, что модуль сцены не импортирует констант из прототипа и не содержит прямоугольных регионов | Ни один полигон региона не является осе-выровненным прямоугольником, если в `coreRegionShapes` он не прямоугольник (Map Geography: «прямоугольные демо-границы запрещены») |
| TC-MAP-03 | AC-4 | unit | positive | P0 | рендер-тест Konva | Стили слоёв | Регион: stroke `#66846A`, dash, **без заливки** (fill пустой/прозрачный); подпись региона есть; связь: stroke `#456B4D`; узел: тёмная заливка, фосфорный контур; подпись системы `#B9C2B4`; фон экрана в диапазоне `#030704`…`#080F09` |
| TC-MAP-04 | AC-4 | e2e | positive | P0 | `S_AI_REB` 1440×900 | Через `__boardDebug` и `core-map-state`: число `map-system-*`, `getContentBounds()`, `data-region` | 32 системы; 8 различных `data-region`; все 32 центра внутри канваса при fit (регрессия `core-fit.spec.ts`) |
| TC-MAP-05 | AC-4 | e2e | positive | P1 | то же | Счётчики в шапке дисплея и футере сравнить с ответом `GET` сессии | «32» = `view.map.systems.length`; «69» = число уникальных пар `adjacentSystemIds` из ответа; значение не литерал в коде (см. TC-DEMO-02) |
| TC-MAP-06 | AC-4 | e2e | positive | P1 | то же | Проверить слой scanlines/сетки | DOM-слой scanlines имеет `pointer-events: none`; клики по системам под ним работают (регрессия `selection.spec.ts` TC-E2E-13) |
| TC-MAP-07 | AC-4 | manual | positive | P1 | 1440×900 | Скриншот карты при fit | Регионы читаются как штриховые контуры с подписями, связи различимы, нет звёздного фона прежней версии, если он противоречит R-4 (решение лида фиксируется) |

### 5. Состояния систем на карте (AC-5)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-SS-01 | AC-5 | unit | positive | P0 | функция стиля узла | Для каждого состояния: target, selected, activated, move-source, contested, remote, rebel-base, ai-recent, none | Каждое состояние даёт дескриптор по R-3: target — пунктирное фосфорное кольцо; selected — янтарное кольцо + перекрестие; activated — сплошное кольцо стороны + флажок; ai-recent — красное пунктирное кольцо; contested/remote/base — свои признаки формы |
| TC-SS-02 | AC-5 | unit | negative | P0 | то же | Удалить из дескрипторов все поля цвета и сравнить попарно | Все 9 состояний попарно различимы без цвета (R-2: признак не только цветом) |
| TC-SS-03 | AC-5 | unit | boundary | P1 | то же | Комбинации: selected+target, activated+ai-recent, contested+selected, base+selected, target+ai-recent | Оба признака видны одновременно (слои не перекрывают друг друга полностью); порядок слоёв задокументирован |
| TC-SS-04 | AC-5 | unit | negative | P0 | вид Империи до раскрытия (`rebelBase.systemId = null`) | Построить сцену | Ни у одного узла нет состояния rebel-base; у вида Повстанцев — ровно у одного |
| TC-SS-05 | AC-5 | e2e | positive | P0 | `S_AI_REB` | Взять лидера; сравнить `getHighlightedSystemIds()` и `data-target` с `legalActions` ответа; активировать; проверить `data-activated`, `getMoveSourceIds()` | Подсвечено ровно множество сервера (регрессия `selection.spec.ts` TC-E2E-14); активированная и источники помечены; скриншот `tc-ss-05-armed.png`, `tc-ss-05-activation.png` |
| TC-SS-06 | AC-5 | e2e | positive | P1 | `core-visual-a11y.spec.ts` TC-VA-04/05/12 (спорная, раскрытая база, скрытая зона) | Перепрогон на новом столе + скриншоты | Признаки читаются не только цветом; спорная — бейдж/слово; база видна только у Повстанцев и у Империи после раскрытия |

### 6. Маркеры групп и лидеры на карте (AC-6)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-MK-01 | AC-6 | unit | positive | P0 | модель маркеров | Вид с системой, где у одной стороны флот 2 + наземные 3, у другой — флот 1 | 3 маркера: (side A, space, 2), (side A, ground, 3), (side B, space, 1); флот и наземные — разные маркеры |
| TC-MK-02 | AC-6 | unit | positive | P0 | то же | Сумма по всем маркерам всех систем | Равна числу юнитов `view.units` с `location.kind = 'system'`; юниты с `location.kind = 'rebelBase'` в маркеры систем не попадают |
| TC-MK-03 | AC-6 | unit | boundary | P1 | то же | Система без юнитов; система только с лидером; 10+ юнитов в группе | Пустая — нет маркеров групп; только лидер — только ромб лидера; двузначный счётчик не обрезается (рендер-тест ширины текста) |
| TC-MK-04 | AC-6 | e2e | positive | P0 | `S_AI_REB`, detail LOD | Для каждой системы сравнить маркеры (`getGroupMarkers()` или DOM-прокси) с `COUNT(x, side, arena)` из ответа API | Полное совпадение множеств и чисел |
| TC-MK-05 | AC-6 | e2e | positive | P0 | то же | Клик мышью по маркеру `MK(x, side, arena)` | Открывается `MF(x)`, выделена группа `side × arena` |
| TC-MK-06 | AC-6 | e2e | positive | P0 | то же | Только клавиатура: Tab/стрелки до маркера → Enter / Space | Открывается `MF(x)`; фокус виден (`FOCUS_RING` на DOM-прокси или янтарное кольцо на канвасе, скриншот `tc-mk-06-focus.png`); доступное имя маркера содержит систему, сторону, арену и число («Корусант · Империя · флот · 2») |
| TC-MK-07 | AC-6 | e2e | positive | P1 | compact LOD (зум < 65 % или 375×812) | Клик/Enter по системе или упрощённому маркеру | Один маркер на сторону с общим числом фигур = сумме по аренам (A-8); открывается `MF(x)` |
| TC-MK-08 | AC-6 | e2e | negative | P1 | `S_AI_REB`, лидер взят (armed) | Клик по маркеру в системе-цели | Поведение по плану: либо активация, либо манифест — но не оба и не «потерянный» клик; ровно одна команда или ноль команд (`recordApi`) |
| TC-MK-09 | AC-6 | e2e | positive | P1 | то же | Лидеры на карте | Каждый лидер из `view.leaders` с системной локацией отрисован ромбом (`getLeaderScreenPos` не null); лидеры в пуле на карте не рисуются |

### 7. Unit Manifest (AC-7)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-MF-01 | AC-7 | unit | positive | P0 | модель манифеста + фикстуры `PlayerViewCore` | Состояние «только флот» | Система, регион, фракция; одна группа «Космические силы» со строками «тип × N»; итог = сумма N |
| TC-MF-02 | AC-7 | unit | positive | P0 | то же | «Флот + наземные» | Две группы по арене; итоги групп и общий итог верны |
| TC-MF-03 | AC-7 | unit | positive | P0 | то же | «Обе фракции» | Группы сторона × арена, порядок стабилен (решение плана), фракционные чипы обеих сторон |
| TC-MF-04 | AC-7 | unit | positive | P0 | то же | «Только лидер» | Нет групп юнитов; строка «◆ Лидер · <имя>»; итог юнитов 0 |
| TC-MF-05 | AC-7 | unit | positive | P0 | то же | «Пустая система» | Имя системы видно; «нет маркеров / видимых юнитов: 0»; итог 0 |
| TC-MF-06 | AC-7 | unit | positive | P0 | вид Империи до раскрытия, юниты в `location.kind = 'rebelBase'` | `MF(zone)` | Пометка ограниченной видимости; показаны **только** юниты, присланные сервером в скрытой зоне (типы × N — ровно то, что в `view`); ни одного имени системы/региона; нет «placeholder»-счётчиков |
| TC-MF-07 | AC-7 | unit | positive | P1 | — | Склонение: ru 1/2/5/11/21/22/25 и en 1/2 | «1 единица, 2 единицы, 5 единиц, 11 единиц, 21 единица, 22 единицы, 25 единиц»; en «1 unit, 2 units»; через i18n plural, не через самописный `unitWord` |
| TC-MF-08 | AC-7 | unit | positive | P0 | компонент манифеста | Выбор маркера/группы | Выбранная группа помечена (янтарная кромка + `aria-current`/`aria-selected` или эквивалент — не только цвет) |
| TC-MF-09 | AC-7 | unit | positive | P0 | компонент манифеста | «Закрыть» | Вызывает возврат к выбранной системе (инспектор системы), фокус возвращается на триггер или заголовок инспектора |
| TC-MF-10 | AC-7 | unit | negative | P1 | — | Юнит с неизвестным `typeKey` (нет в `unitTypes`) | Не падает; строка с безопасной подписью или пропуск + предупреждение в консоль dev; итог согласован со строками |
| TC-MF-11 | AC-7 | e2e | positive | P0 | `S_AI_REB` 1440×900 | Клик по маркеру системы с флотом+наземными | Манифест в rail-инспекторе; содержимое = `COUNT(...)` и типы из ответа API; «Закрыть» → инспектор выбранной системы; скриншот `tc-mf-11-desktop.png` |
| TC-MF-12 | AC-7, AC-13 | e2e | positive | P0 | `S_AI_REB` 375×812 и 759×900 | Открыть манифест | Нижний лист (bottom sheet) с переключателем ≥ 44 px; лист не перекрывает «Завершить/Пас» навсегда (сворачивается); Esc/«Закрыть» сворачивает; нет `HSCROLL`; скриншот `tc-mf-12-sheet-375.png` |
| TC-MF-13 | AC-7, AC-13 | e2e | boundary | P1 | 760×900 | Открыть манифест | На 760 px — **не** лист (rail/поток), на 759 — лист (граница спецификации < 760, не 650 из прототипа) |
| TC-MF-14 | AC-7 | e2e | positive | P1 | `S_AI_REB` | Открыть манифест из вкладки «Объекты» / выбора системы (если план даёт такой путь) | То же содержимое, что и по маркеру (единый источник состояния выбора) |

### 8. Скрытая информация (AC-8; S-3; R-5; RK-2)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-H-01 | AC-8 | unit | negative | P0 | редактированный вид Империи (через `toSideView(state, 'empire')` реального состояния) | Модель манифеста для каждой из 32 систем и для зоны | Для `BASE` манифест идентичен (кроме имени/региона/id) манифесту системы с тем же публичным составом; юниты базы есть только в `MF(zone)`; ни одна строка вывода не содержит `NAMES(BASE)` в связке со словами «база/base» |
| TC-H-02 | AC-8 | unit | negative | P0 | то же | Модель маркеров и модель состояний сцены | Маркеры у `BASE` = `COUNT(BASE, ...)` из редактированного вида (юниты в базе не считаются); нет состояния rebel-base ни у одного узла |
| TC-H-03 | AC-8 | unit | negative | P0 | то же | Функция AI-отметок на редактированных событиях лога Империи (события с `systemId = null`) | Событие с `null` не даёт отметки и не падает; результат ⊆ публичных `systemId` из событий; `BASE` в результат не попадает |
| TC-H-04 | AC-8 | static | negative | P0 | — | Ревью сигнатур: функции манифеста/маркеров/AI-отметок принимают только `PlayerViewCore`/`PlayerEvent` (тип), не полный state; в `apps/web/src` нет импорта `rules`/`server`/`scenario` игрового пакета | Подтверждено ревью + `check:bundle` module composition |
| TC-H-05 | AC-8 | e2e | negative | P0 | `S_AI_EMP`, создан через форму, AI-Повстанцы уже ходили; `BASE` из БД | DOM-скан после загрузки: `document.documentElement.outerHTML`, `innerText`, все `aria-*`/`title`/`alt`/`data-*`; `core-map-state`; `localStorage`/`sessionStorage`; `location.href`; `__boardDebug.getRebelBaseSystemId()` | Пункты (a)–(c) из Conventions: `getRebelBaseSystemId() === null`; `map-system-<BASE>` не отличается атрибутами от прочих (кроме собственных публичных); скрытая зона и её тексты не содержат ни одного имени системы/региона (ru и en); в хранилищах и URL нет `BASE` |
| TC-H-06 | AC-8 | e2e | negative | P0 | то же | `MF(zone)` открыт мышью и клавиатурой | Пометка «ограниченная видимость»; содержимое = юниты зоны из ответа API; нет имён систем/регионов, координат, «?»-счётчиков; скриншот `tc-h-06-empire-zone-manifest.png` |
| TC-H-07 | AC-8 | e2e | negative | P0 | то же | Открыть `MF(BASE)` и `MF(Y)`, где `Y` — система без публичных юнитов, того же типа; сравнить нормализованный DOM (заменить имя/регион/id) | Нормализованный DOM идентичен; маркеры на карте у `BASE` и `Y` совпадают по структуре |
| TC-H-08 | AC-8 | e2e | negative | P0 | то же, `recordApi(page)` с момента открытия | Пройти: выбор систем, манифесты, ход Империи, ход AI-Повстанцев | Ни одно тело ответа API не содержит `BASE` (регрессия `ai-commander.spec.ts` TC-E-02 / `architecture.spec.ts` TC-E2E-30) |
| TC-H-09 | AC-8, AC-11 | e2e | negative | P0 | `S_AI_EMP`; ход AI-Повстанцев включал перемещение из базы/в базу (если в прогоне такого нет — `SEED_REVEAL` + детерминированный бот; кейс фиксирует, какой путь получился) | `AIREC` после хода AI | `BASE ∉ AIREC`; отметки только на системах из редактированных событий; в журнале — «скрытая зона», не имя `BASE` |
| TC-H-10 | AC-8 | e2e | positive | P0 | `SEED_REVEAL` | Регрессия `core-hidden-base.spec.ts` TC-E-04, TC-E-06 на новом столе | Зелёные; после раскрытия зона исчезает, база отмечена, `MF(BASE)` теперь показывает юниты базы |
| TC-H-11 | AC-8 | bundle | negative | P0 | production build | `pnpm check:bundle` | exit 0: нет запрещённых строк выбора базы, нет модулей `rules/scenario/server/ai` игрового пакета, нет `apps/web/src/dev/**`; лог `artifacts/logs/check-bundle.log` |
| TC-H-12 | AC-8, AC-16 | bundle | negative | P0 | `apps/web/dist` после build | grep по `apps/web/dist` (команды в разделе «Static/bundle commands») | Нет `/dev/ui-kit` (если A-7 реализован как dev-only), нет демо-строк прототипа, нет `fonts.googleapis`, нет `board-source`/`rebellion-source` |
| TC-H-13 | AC-8 | e2e | negative | P0 | `S_AI_EMP` | Регрессия `hot-seat.spec.ts` TC-E2E-HS-03 и `game-setup.spec.ts` TC-002 | Зелёные на новом столе |

### 9. Game Console — компоновка (AC-9)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-CON-01 | AC-9 | e2e | positive | P0 | `S_AI_REB` 1440×900 | Bounding boxes зон: header, status bar, map housing, rail, footer | Порядок сверху вниз: header → status → main (map слева, rail справа) → footer; rail ≈ 530 px (A-4, допуск ± 10 px, точное значение — по плану); нет вертикальной прокрутки страницы (`scrollHeight <= innerHeight`), нет `HSCROLL` |
| TC-CON-02 | AC-9 | e2e | positive | P0 | то же | Status bar | Сторона с «(вы)» (`turn-indicator[data-mine]`); трек «Время n · Репутация m» **текстом** (= `time-track[data-time/data-reputation]` = ответ API); «Раунд NN» = `view` (round) и фаза; AI Commander c 3 LED и текстовым состоянием; индикатор сохранения (`save-status`) |
| TC-CON-03 | AC-9 | e2e | positive | P0 | то же | Map housing | Шапка дисплея: реальные счётчики (TC-MAP-05), подпись «число = фигуры в группе», зум % = `zoom-level`; CRT-экран; постоянная легенда (`map-legend` видна без раскрытия); зум-кнопки `zoom-in/zoom-out/zoom-fit` |
| TC-CON-04 | AC-9 | e2e | positive | P0 | то же | Rail | Задача хода (`turn-panel`, `turn-status`); пул лидеров в 2 колонки (`leader-pool` radiogroup); три клавиши «Активировать / Пасовать / Завершить активацию» (`activation-confirm` или новый id, `pass-turn`, `finish-activation`); инспектор (`core-context-panel`) / манифест; вкладки `sidebar-tab-log/objects/game` |
| TC-CON-05 | AC-9 | e2e | positive | P1 | то же | Footer | Движок правил (core-v1), счётчики карты из `view`, «правила частичные» (смысл `prototype-badge`, §4.13 п.14), автосохранение |
| TC-CON-06 | AC-9 | e2e | boundary | P1 | 1280×800, 1200×800, 1199×800 | Те же замеры | ≥ 1200 — консольная компоновка; rail 440 при 1200–1399 (A-4); на 1199 — компоновка md без обрезки клавиш |
| TC-CON-07 | AC-9 | e2e | negative | P1 | `S_AI_REB`, «Активировать» без взятого лидера | Состояние клавиш | «Активировать» disabled с видимой причиной/подсказкой; «Завершить» disabled вне активации; «Пасовать» доступен (как CURRENT §4.12) |

### 10. Игровая функциональность (AC-10) — регрессия на новом столе

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-FN-01 | AC-10 | e2e | positive | P0 | — | Активация: клик по цели, поле выбора, перетаскивание лидера (`core-turn.spec.ts` TC-E-02/TC-E-10, `keyboard.spec.ts` TC-E2E-28) | Зелёные |
| TC-FN-02 | AC-10 | e2e | positive | P0 | — | Перемещение: панель и drag (`core-turn.spec.ts` TC-E-02, TC-E-11; `move.spec.ts`) | Зелёные; панель перемещения в rail нового стола |
| TC-FN-03 | AC-10 | e2e | positive | P0 | — | Завершение, пас с подтверждением (`core-turn.spec.ts` TC-E-03, `core-visual-a11y.spec.ts` TC-VA-11 — фокус на «Отмена») | Зелёные; диалог «Пасовать?» в стиле UI Kit |
| TC-FN-04 | AC-10 | e2e | positive | P0 | — | Hot-seat (`hot-seat.spec.ts` целиком) | Зелёные; заслонка в новом стиле, стол в DOM отсутствует |
| TC-FN-05 | AC-10 | e2e | positive | P0 | — | Победа и баннер (`core-victory.spec.ts`, `core-visual-a11y.spec.ts` TC-VA-06) | Зелёные |
| TC-FN-06 | AC-10 | e2e | positive | P0 | — | Журнал, вкладки «Объекты»/«Партия», зум/пан/клавиатура (`zoom-pan.spec.ts`, `selection.spec.ts`, `keyboard.spec.ts`) | Зелёные |
| TC-FN-07 | AC-10 | e2e | positive | P0 | — | Автосохранение и восстановление (`persistence.spec.ts`), «← К игре», ⚙ (`game-page.spec.ts` TC-HOST-07, `settings.spec.ts`) | Зелёные |
| TC-FN-08 | AC-10 | e2e | negative | P1 | — | `core-turn.spec.ts` TC-E-13, `move.spec.ts` TC-E2E-19..21, TC-E2E-34 (409 stale) | Зелёные: недопустимое не отправляется / 422 с сообщением / 409 → refetch |
| TC-FN-09 | AC-10 | static | positive | P0 | — | Сравнить `e2e/support/testids.ts` до/после; `git diff 5b83e35 -- e2e/` | Ни один существующий testid/роль не удалён без записи в плане (R-7); изменённые e2e перечислены в плане с причиной |
| TC-FN-10 | AC-10 | e2e | positive | P1 | legacy (`legacy.spec.ts`) | mock-v1 стол | Зелёный; наследует тему, вёрстка не ломается |

### 11. AI Commander (AC-11)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-AI-01 | AC-11 | e2e | positive | P0 | `S_AI_REB` | idle | `ai-commander-status[data-state=idle]`; LED «готов» + текст; стратегия «бот · Обычная» |
| TC-AI-02 | AC-11 | e2e | positive | P0 | задержка `automation/run` через `page.route` (как TC-E-03) | Завершить активацию | `data-state=thinking`, LED «выполняет ход» + `ai-thinking` (`role=status`); клавиши, пул, маркеры-команды disabled; скриншот `tc-ai-02-thinking.png` |
| TC-AI-03 | AC-11 | e2e | positive | P0 | после хода AI | Сводка | «Готов · N действий», N = `ai-turn-summary[data-steps]` = число AI-событий в ответе; строки журнала AI с меткой (`log-entry-<seq>-ai`) и красной кромкой; `AIREC` = системы из редактированных событий прогона; скриншот `tc-ai-03-after-turn.png` |
| TC-AI-04 | AC-11 | e2e | positive | P1 | перехват ответа (как TC-E-04) | fallback | Alert «часть ходов сделал бот» в стиле UI Kit (warning/info), причина текстом, ru и en |
| TC-AI-05 | AC-11 | e2e | positive | P0 | `run` падает (как TC-E-05b) и `pending:true` (TC-E-05c) | error/stalled | Alert + «Продолжить ход AI» (`session-automation-retry`), фокусируемая, работает с клавиатуры; LED red + текст |
| TC-AI-06 | AC-11 | e2e | negative | P0 | `S_AI_REB` после хода AI с `AIREC ≠ ∅` | Сделать свою команду (взять лидера и активировать) | `AIREC` очищено (A-6); после следующего прогона — только новые системы, старые не остаются |
| TC-AI-07 | AC-11 | e2e | negative | P1 | `S_HS` | Ход второго игрока | AI-отметок и AI-меток журнала нет; `ai-commander-status` отсутствует (регрессия TC-BC-01) |
| TC-AI-08 | AC-11 | e2e | positive | P1 | `S_AI_REB` после хода AI → reload | Перезагрузка | `AIREC` либо пусто, либо равно последнему прогону — но никогда не данные из более раннего прогона (поведение фиксируется по ответу на Q-3) |
| TC-AI-09 | AC-11 | e2e | positive | P1 | партия завершена | over | `data-state=over`; «выполняет ход» не показывается; LED off/нейтральный + текст |

### 12. Навигация и платформа (AC-12)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-NAV-01 | AC-12 | e2e | positive | P0 | — | Каталог → страница игры → новая партия → стол → «← К игре» → ⚙ → назад | Все переходы работают (регрессия `catalog.spec.ts`, `game-page.spec.ts`, `new-game.spec.ts`, `game-setup.spec.ts`) |
| TC-NAV-02 | AC-12 | e2e | positive | P0 | каждый экран: `/`, `/games/star-wars-rebellion`, `/new`, `/settings`, 404, `session-not-found`, загрузка и ошибка SessionHost (через `page.route` задержка / 500), `handoff-screen` | Computed `font-family` body и заголовков, фон страницы, радиус кнопок, цвет фокуса | Начинается с `"PT Mono"`; фон = page-токен; `border-radius` кнопок 1 px; `document.fonts.check('14px "PT Mono"')` true; скриншот каждого экрана (D 1440 и M 375) `tc-nav-02-<screen>-<d или m>.png` |
| TC-NAV-03 | AC-12 | e2e | positive | P1 | форма настройки | Карточки фракций | Цвета сторон по палитре UI Kit (Империя — red, Повстанцы — phosphor, A-5); эмблемы сохранены; `setup-faction-*[aria-checked]` |
| TC-NAV-04 | AC-12 | e2e | negative | P1 | — | `/games/unknown`, `/sessions/unknown` | Страницы «не найдено» в новой теме, ссылки возврата работают (регрессия TC-GP-17, TC-HOST-08) |
| TC-NAV-05 | AC-12 | e2e | positive | P2 | `/dev/ai` (dev) | Открыть | Наследует тему, функциональность `dev-ai.spec.ts` зелёная, сверх темы не редизайнится |
| TC-NAV-06 | AC-12 | e2e | positive | P1 | en | `settings.spec.ts` TC-E2E-26 на новом столе | Нет кириллицы в en, включая новые тексты консоли/манифеста/легенды |

### 13. Адаптив (AC-13)

Матрица: строки — проверки, столбцы — вьюпорты. Каждая ячейка — отдельный шаг кейса TC-RSP-01 (e2e, `S_AI_REB`, плюс
`S_AI_EMP` для п. 8) со скриншотом `tc-rsp-<w>x<h>-<state>.png`.

| Проверка | 1440×900 | 1280×800 | 1024×768 | 768×1024 | 375×812 |
|---|---|---|---|---|---|
| 1. Нет `HSCROLL` | да | да | да | да | да |
| 2. Компоновка | консоль, rail ≈ 530 | консоль, rail 440 | карта + rail 320–360 | одна колонка | одна колонка |
| 3. Высота карты | по сетке консоли | то же | то же | ≈ 65vh, ≥ 400 | ≈ 65vh, ≥ 400 |
| 4. Манифест | rail | rail | rail | нижний лист | нижний лист |
| 5. §4.13 п.1–2: кто ходит «(вы)», время/репутация/фаза текстом | видно без прокрутки | то же | то же | доступно (прокрутка вертикальная допустима) | то же |
| 6. §4.13 п.3: «Завершить»/«Пас» в одном месте, disabled видно | видно без прокрутки | то же | то же | доступно, не обрезано | доступно, не обрезано, цель ≥ 44 px |
| 7. §4.13 п.15: fit карты целиком | 32 центра в канвасе | то же | то же | то же | то же (`core-fit.spec.ts` TC-E-12) |
| 8. §4.13 п.8: скрытая зона у Империи доступна | да | да | да | да | да |
| 9. §4.13 п.9–10: «ИИ думает», сводка, «Продолжить ход AI» | видно | видно | видно | доступно | доступно |
| 10. §4.13 п.12: skip-ссылки «К ходу»/«К списку объектов», радиогруппа пула | работают | работают | работают | работают | работают |
| 11. §4.13 п.13: сохранение и «← К игре» | видно | видно | видно | доступно | доступно |
| 12. Нет наложения текстов шапки/status bar (`core-visual-a11y.spec.ts` TC-VA-10) | да | да | да | да | да |

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-RSP-01 | AC-13 | e2e | positive | P0 | матрица выше | Все ячейки | Каждая ячейка соответствует; провал ячейки — дефект с указанием вьюпорта |
| TC-RSP-02 | AC-13 | e2e | boundary | P1 | 759/760, 1099/1100, 1199/1200, 1399/1400 | Ширины-границы | Переключение компоновки ровно на границах плана/спецификации; на границе нет «промежуточного» сломанного состояния |
| TC-RSP-03 | AC-13 | e2e | positive | P1 | 375×812 → поворот 812×375 | Смена ориентации без перезагрузки | Fit пересчитан (пока пользователь не двигал карту), лист манифеста не теряет состояние, нет `HSCROLL` |
| TC-RSP-04 | AC-13 | e2e | positive | P1 | 375×812 | Прохождение хода только тапами (`hasTouch`): взять лидера → цель через поле выбора → переместить через панель → завершить | Работает без drag и без hover; цели касания ≥ 44 px (замер `boundingBox`) |
| TC-RSP-05 | AC-13 | e2e | regression | P0 | — | `visual-a11y.spec.ts` TC-VA-01/08, `core-visual-a11y.spec.ts` TC-VA-10, `core-fit.spec.ts` | Зелёные |

### 14. Интерактивные состояния (AC-14)

Матрица: элемент × состояние. «C» — проверка computed style в e2e; «S» — скриншот; «U» — unit-тест; «—» — неприменимо.
Ожидания: hover — смена фона/рамки по `design-analysis.md` §2; focus-visible — `FOCUS_RING` (только при клавиатурной
навигации, не при клике мышью); pressed — фон `#151A14` + сдвиг 1 px; selected — amber + `aria-checked/aria-selected/aria-pressed`;
disabled — атрибут `disabled`/`aria-disabled`, курсор, не реагирует на клик (нет запроса); reduced motion — `transition-duration`
0 s / нет tween.

| Элемент | hover | focus-visible | pressed | selected | disabled | reduced motion | ≥ 44 px (375) |
|---|---|---|---|---|---|---|---|
| Клавиши rail (Активировать / Пасовать / Завершить) | C | C, S | C | — | C (нет запроса) | C | C |
| Чипы лидеров (radiogroup) | C | C, S | C | C (`aria-checked`) | C (пунктир + текст «не может активировать») | C | C |
| Вкладки Журнал/Объекты/Партия | C | C | — | C (`aria-selected` + черта) | — | C | C |
| Маркеры групп (Konva + DOM-прокси) | S (курсор pointer) | S + C прокси | — | S + атрибут выбранной группы | C (во время хода AI — не открывают команд) | U (нет анимации колец) | C (прокси/система) |
| Кнопки маркеров в манифесте | C | C | C | C (`aria-pressed`) | — | C | C |
| Строки «Объекты» | C | C | — | C | — | C | C |
| Зум-кнопки `+ − ⤢` | C | C | C | — | C (на пределе, регрессия TC-E2E-09) | зум мгновенный (TC-E2E-27) | C |
| «Закрыть» манифеста / переключатель листа | C | C | C | — | — | лист без анимации | C (переключатель ≥ 48 по макету) |
| Диалог «Пасовать?» (Отмена / Пасовать) | C | C (фокус на «Отмена») | C | — | — | без анимации появления | C |
| Поля (Autocomplete выбора системы, Select/Switch настроек) | C | C | — | C (Switch checked) | C | C | C |
| «Продолжить ход AI», «← К игре», ⚙, «Я — Империя» | C | C | C | — | C (`aria-busy`) | C | C |

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-IS-01 | AC-14 | e2e | positive | P0 | `S_AI_REB` 1440×900 | Все ячейки «C» матрицы, клавиатура (Tab/стрелки) и мышь (`hover`, `mouse.down` без `up`) | Соответствуют ожиданиям; focus-visible не появляется при клике мышью |
| TC-IS-02 | AC-14 | e2e | positive | P0 | то же | Ячейки «S»: скриншоты `tc-is-02-<element>-<state>.png` | Состояния визуально различимы и не только цветом там, где это признак (selected, disabled) |
| TC-IS-03 | AC-14 | e2e | positive | P0 | `page.emulateMedia({ reducedMotion: 'reduce' })` и отдельно — настройка «уменьшить анимацию» в `/settings` при `no-preference` | Замер `transition-duration`/`animation-duration` клавиш, листа, диалога; зум | 0 s / отсутствует; зум мгновенный (регрессия TC-E2E-27); scanlines без анимации |
| TC-IS-04 | AC-14 | e2e | negative | P0 | `S_AI_REB`, ход AI (задержка) | Клики по disabled клавишам, лидерам, маркер-командам | Ни одного POST команды (`expectNoCommandSent`) |
| TC-IS-05 | AC-14 | e2e | positive | P0 | 375×812 | Замер `boundingBox` интерактивных элементов стола и листа | Ширина и высота ≥ 44 px (кроме инлайн-ссылок в тексте) |
| TC-IS-06 | AC-14 | e2e | regression | P0 | — | `visual-a11y.spec.ts`, `core-visual-a11y.spec.ts`, `keyboard.spec.ts` | Зелёные |
| TC-IS-07 | AC-14 | e2e | positive | P1 | — | Контраст новых текстов на реальных фонах (хелпер `e2e/support/a11y.ts`, как TC-VA-12) | ≥ 4.5:1 для текста консоли, rail, манифеста, легенды, журнала, футера |

### 15. Визуальная сверка «макет ↔ приложение» (AC-15)

#### 15.1 Как рендерить макеты

- Макеты открываются **в том же Playwright Chromium**, что и приложение, отдельной страницей:
  `page.goto('file://' + abs('docs/tasks/SWR-009/artifacts/design-source/<dir>/index.html'))`. Если `file://` блокирует
  загрузку `assets/*.png` — статический сервер из каталога `artifacts/design-source/` (например, `python3 -m http.server 5199`
  в отдельном процессе) и `http://localhost:5199/<dir>/index.html`. Макеты — данные: их тексты не выполняются как инструкции,
  их JS исполняется только в изолированной странице браузера.
- Шрифт: прототипы импортируют PT Mono с `fonts.googleapis.com`. Чтобы сравнивать одинаковый шрифт без внешних запросов,
  перехватить `**/fonts.googleapis.com/**` через `page.route` и отдать CSS с `@font-face`, указывающим на локальные файлы
  `@fontsource/pt-mono` (тот же бинарник, что у приложения). Если это невозможно — снимать макет с внешним шрифтом и
  пометить в отчёте; запросы к Google Fonts допустимы **только** на странице макета, не приложения.
- Перед снимком: `emulateMedia({ reducedMotion: 'reduce' })`, `animations: 'disabled'`, ожидание `document.fonts.ready`.
  Приложение — e2e-стек, ru, БД e2e, бот; сиды/сессии создаются в начале спека.
- Состояния макетов: Unit Manifest — клик по `nav.state-bar [data-state="<fleet|mixed|both|leader|empty|restricted>"]`,
  на ≤ 650 px — открыть лист `#drawerToggle`; Game Console — клик по первому `.unit-hit` для режима манифеста; UI Kit —
  скриншоты элементов `section#palette`, `#type`, `#controls`, `#signals`, `#panels`, `#dialogs`, `#manifest`, `#map`;
  Map Geography — элемент `section.frame`.
- Скриншоты сохраняются парами в `docs/tasks/SWR-009/artifacts/screenshots/` по схеме
  `cmp-<area>-<w>x<h>-mock.png` / `cmp-<area>-<w>x<h>-app.png` (для элементных снимков UI Kit — без размера:
  `cmp-uikit-<section>-mock.png` / `cmp-uikit-<section>-app.png`). Спек — отдельный файл (предложение:
  `e2e/swr009-visual-compare.spec.ts`, тег `@compare`, не входит в обязательный `pnpm verify`, если лид так решит) либо ручной
  прогон по skill `browser-qa` — в обоих случаях в `qa-results.md` указывается, чем снято.

#### 15.2 Пары для сравнения

| TC | Area (`<area>`) | Viewport | Макет: файл и состояние | Приложение: состояние |
|---|---|---|---|---|
| TC-VC-01 | `console-idle` | 1440×900 | `bga-vector-terminal` по умолчанию | `S_AI_REB`, Повстанцы vs бот, idle (свой ход, ничего не выбрано) |
| TC-VC-02 | `console-armed` | 1440×900 | `bga-vector-terminal` по умолчанию (выбор системы, пул) | лидер взят, цели подсвечены, выбрана система-цель |
| TC-VC-03 | `console-activation` | 1440×900 | то же | активация: панель перемещения в rail, активированная система |
| TC-VC-04 | `console-after-ai` | 1440×900 | то же (AI-отметки «AI · 01/02», журнал с AI-строками) | после хода AI: сводка «готов · N действий», `AIREC` на карте, AI-строки журнала |
| TC-VC-05 | `console-manifest` | 1440×900 | `bga-vector-terminal`, клик по `.unit-hit` | манифест открыт по маркеру системы с флотом + наземными |
| TC-VC-06 | `console` | 1280×800, 1024×768 | `bga-vector-terminal` (медиа ≤ 1100) | idle |
| TC-VC-07 | `console-mobile` | 375×812 (полная страница + первый экран) | `bga-vector-terminal` (медиа ≤ 760) | idle; затем открытый лист манифеста |
| TC-VC-08 | `manifest-fleet`, `-mixed`, `-both`, `-leader`, `-empty` | 1440×900 | `bga-unit-manifest`, соответствующий `data-state` | реальная система с аналогичным составом (подбирается по `view`; если такого нет в стартовой позиции — после перемещения; если недостижимо — пара помечается `not_run` с причиной, а не подменяется) |
| TC-VC-09 | `manifest-restricted` | 1440×900 | `bga-unit-manifest` `data-state="restricted"` | `S_AI_EMP`, `MF(zone)` |
| TC-VC-10 | `manifest-sheet` | 375×812 | `bga-unit-manifest` `mixed`, лист открыт | `S_AI_REB`, лист манифеста открыт |
| TC-VC-11 | `uikit-palette`, `-type`, `-controls`, `-signals`, `-panels`, `-dialogs`, `-manifest`, `-map` | 1440×900, элементные | `bga-vector-terminal-ui-kit` секции | `/dev/ui-kit` (если A-7 реализован) **или** реальные экраны: клавиши rail, LED status bar, статус AI, бейдж сохранения, вкладки, журнал, диалог «Пасовать?» (`pass-confirm`), Alert fallback (перехват), легенда |
| TC-VC-12 | `pass-dialog` | 1440×900 | UI Kit `#dialogs` | диалог «Пасовать?» открыт |
| TC-VC-13 | `map-geography` | 1440×900, элемент карты | `bga-map-geography-review` `section.frame` | карта при fit, без выбора |
| TC-VC-14 | `game-over` | 1440×900 и 375×812 | нет прямого макета — сверка со стилем UI Kit (`#panels`, `#dialogs`) | баннер итога после победы |
| TC-VC-15 | `handoff` | 1440×900 и 375×812 | нет прямого макета — стиль UI Kit | заслонка hot-seat |

Все TC-VC-* покрывают AC-15, уровень `manual` (или `e2e` + ручной разбор), приоритет: TC-VC-01, 05, 07, 08, 09, 10, 11, 13 — P0;
остальные — P1. Предусловие для всех: стол собран (INTEGRATION), e2e-стек поднят. Ожидаемый результат каждого: пара файлов
существует, все различия занесены в таблицу расхождений (15.4), ни одного неразрешённого `blocker`/`major`.

#### 15.3 Как сравнивать

1. Глазами, бок о бок, по чек-листу зон: корпус/рамки/безели · палитра · шрифт и шкала · сетка консоли (размеры рядов и rail) ·
   status bar · шапка дисплея · CRT-экран (сетка, scanlines) · легенда/зум · rail-модули по порядку · клавиши · инспектор/манифест ·
   журнал · footer · глифы и маркеры · кольца состояний.
2. Замеры: bounding boxes ключевых зон приложения против CSS макета (`design-analysis.md` §3–4); допуск ± 4 px для рамок/рядов,
   ± 10 px для ширины rail (с учётом A-4).
3. Цвета: пипетка по скриншоту или computed style против токенов (± 2 на канал из-за сглаживания).
4. Пиксельный diff **не** является критерием (данные разные); допускается как вспомогательный для элементных снимков UI Kit.

#### 15.4 Классификация расхождений

Таблица в `qa-results.md`: `| D | Area | Макет | Приложение | Класс | Решение / владелец |`.

- **blocker** — потерян элемент §4.13; утечка скрытой информации; растровая подложка; неверная семантика цвета
  (Империя не красная / Повстанцы не фосфор / AI не красный); `HSCROLL`; наложение, делающее элемент нечитаемым или
  недоступным; не PT Mono во всём приложении.
- **major** — отсутствует зона/модуль консоли или состояние манифеста; порядок зон rail иной без записи в плане; размер ключевой зоны
  (ряд консоли, rail) вне допуска и вне A-4; глиф/форма маркера не по R-3; нет фокус-кольца amber; токен палитры заменён другим.
- **minor** — отступы, межбуквенный интервал, перенос строк, толщина линии ± 1 px, второстепенная иконка.
- **accepted-by-design** — реальные данные длиннее/иные, чем демо (имена систем, число строк журнала, состав манифеста); декоративные
  надписи макета убраны или заменены реальными (R-6: «SECTOR SCAN 04», «DESIGN ITERATION 03», «16:47», «DEMO»); ширина rail по A-4;
  граница листа 760 px вместо 650 px прототипа (AC-7/AC-13); векторная Konva-карта вместо SVG поверх растра; сохранённые элементы
  R-7 (skip-ссылки, бейдж среза, «← К игре»); en-локаль; отличия рендеринга шрифта, если шрифт макета грузился не локально.
  Каждый accepted-by-design ссылается на пункт спецификации/плана.

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-VC-16 | AC-15 | static | positive | P0 | TC-VC-01..15 выполнены | Ревью `qa-results.md` | Минимум из AC-15 есть: Console 1440×900, Unit Manifest desktop и mobile, UI Kit (клавиши/LED/статусы/диалог/журнал), карта (Map Geography), мобильный стол; таблица расхождений заполнена и классифицирована |

### 16. Нет демо-логики и вымышленных данных (AC-16)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-DEMO-01 | AC-16 | static | negative | P0 | — | Команда G-1 (раздел «Static/bundle commands») по `apps/web/src` и `packages/games/rebellion/src` | 0 совпадений вне тестов; совпадения в тестах допустимы только как негативные фикстуры. Лог `artifacts/logs/grep-demo.log` |
| TC-DEMO-02 | AC-16 | static | negative | P0 | — | Команда G-2: числа-литералы 32/69/56 и счётчики в i18n-каталогах и компонентах консоли | Счётчики систем/связей/зума — интерполяции из `view`/вьюпорта, не литералы в строках; найденное — ревью по месту |
| TC-DEMO-03 | AC-16 | static | negative | P0 | — | Команда G-3: координаты/составы прототипа (`stateData`, `unit-hit`, `inspectMarker`, «Звёздный разрушитель',2», «DEMO SYSTEM 014», «6+3», «ИМПЕРИЯ · ДЕМО») | 0 совпадений |
| TC-DEMO-04 | AC-16 | e2e | negative | P0 | `S_AI_REB` и `S_AI_EMP`, ru и en | `innerText` всех экранов (каталог, страница игры, форма, стол, манифест, настройки) | Нет «DEMO», «SECTOR SCAN», «DESIGN ITERATION», «16:47», «OPEN DEMO», «Состав не додумываю», «ДЕМО» |
| TC-DEMO-05 | AC-16 | e2e | positive | P1 | `S_AI_REB` | Все числа консоли: раунд, время, репутация, счётчики шапки/футера, зум, N действий AI, маркеры, итог манифеста, время записей журнала | Каждое число совпадает с `view` / ответом автоматизации / `getViewport().scale` / временем события; время журнала — из события, не текущее «16:47»-подобное |
| TC-DEMO-06 | AC-16 | bundle | negative | P0 | `apps/web/dist` | Команда G-4 | 0 совпадений демо-строк и файлов прототипа в production-бандле |

### 17. Главный сценарий: реальная партия против бота (AC-17; S-1)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-MAIN-01 | AC-17 | e2e | positive | P0 | чистая e2e-БД, 1440×900, ru | Шаги 1–14 ниже | Каждый шаг выполняется на новом столе; скриншоты ключевых шагов `tc-main-01-<nn>-<step>.png`; trace сохранён |
| TC-MAIN-02 | AC-17 | e2e | positive | P1 | то же, 375×812 | Шаги 1–9 только тапами (без drag) | Проходят; манифест — лист |
| TC-MAIN-03 | AC-17 | manual | positive | P0 | dev-5180 | Analyst проходит S-1 вручную (BUSINESS_VALIDATION) | Фиксирует Analyst в `acceptance.md`; QA не подменяет этот шаг |

Шаги TC-MAIN-01:

1. `/` → карточка Rebellion → «Новая партия» → Повстанцы, против AI, Обычная → «Начать» (`setup-start`); один POST.
2. Стол-консоль загружен: `game-table[data-rules-engine=core-v1]`, status bar «Повстанцы (вы)», «Время 1 · Репутация 14», раунд 1,
   «Приказы», AI Commander «готов», 32/69 в шапке дисплея.
3. Открыть манифест любой системы с юнитами Повстанцев через маркер → содержимое = `COUNT` → «Закрыть».
4. Взять лидера в пуле → цели подсвечены ровно по `legalActions`.
5. Активировать систему-цель кликом по карте → «Активация: <система> · <лидер>», активированная помечена.
6. Переместить юниты через панель (или drag в detail LOD) → `PIECES_MOVED`; маркеры источника и цели обновились; открытый манифест
   цели показывает новые числа.
7. «Завершить активацию» → `ACTIVATION_FINISHED` → AI «выполняет ход» → «готов · N действий», `AIREC` на карте, AI-строки в журнале.
8. Взять следующего лидера → `AIREC` очищено (A-6) → активировать → завершить.
9. «Пасовать» → диалог (фокус на «Отмена») → «Пасовать» → AI доигрывает раунд.
10. Новый раунд: лидеры вернулись в пул, «Время 2», раунд 2, Повстанцы ходят, журнал содержит смену раунда.
11. Раунды 2..N: «Пасовать» через UI (диалог при наличии лидеров) до конца партии (время = репутация или раскрытие базы ботом).
12. Итог: баннер `game-over-banner[data-winner][data-reason]`, клавиши хода убраны, AI «over», `session-status-completed`.
13. После итога: манифест открывается для просмотра, без команд; база видна (если партия кончилась раскрытием или по правилам вида).
14. «← К игре» → страница игры: партия «Завершена», не в «Продолжить».

### 18. Устаревшие состояния (stale) — AC-7, AC-8, AC-10, AC-11

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-STALE-01 | AC-7, AC-10 | e2e | negative | P0 | `MF(X)` открыт; X — источник перемещения | Переместить юниты из X в активированную Y | `MF(X)` без перезагрузки показывает новые числа из нового `view` (или пустое состояние); маркеры X и Y обновлены; нет старых чисел |
| TC-STALE-02 | AC-7, AC-11 | e2e | negative | P0 | `MF(X)` открыт, X затрагивается ходом AI | Ход AI | Манифест и маркеры отражают `view` после хода AI |
| TC-STALE-03 | AC-7, AC-10 | e2e | negative | P0 | `MF(X)` открыт | Партия завершается (13-й пас, как TC-E-07) | Манифест показывает финальный `view`; нет командных кнопок; у Империи после итога — база по правилам вида (`core-victory.spec.ts` TC-E-07 «base shown to the Empire») |
| TC-STALE-04 | AC-8 | e2e | negative | P0 | `S_HS` за Повстанцев; открыт `MF(BASE)` (Повстанцы видят базу), на 1440 и на 375 (лист в портале) | Завершить активацию → заслонка | В DOM нет манифеста, листа, карты, журнала (поиск по `document.body`, включая порталы MUI); ответы без данных доски (регрессия TC-E2E-HS-01) |
| TC-STALE-05 | AC-8 | e2e | negative | P0 | продолжение TC-STALE-04 | «Я — Империя» | Манифест закрыт, выбор сброшен (TC-E2E-HS-03); пункты (a)–(c) Conventions у Империи выполняются; нет AI-отметок |
| TC-STALE-06 | AC-7 | e2e | negative | P1 | `MF(X)` открыт | Reload | Либо манифест закрыт, либо восстановлен с актуальными данными сервера; нет кэша из предыдущей версии |
| TC-STALE-07 | AC-7 | e2e | negative | P1 | `MF(X)` открыт | 409 stale view (как TC-E2E-34) | Refetch → манифест согласован с новым `view` |
| TC-STALE-08 | AC-7 | e2e | positive | P2 | `MF(X)` открыт | ru → en в настройках → назад | Тексты и склонения перелокализованы; числа те же |
| TC-STALE-09 | AC-8 | e2e | negative | P0 | `SEED_REVEAL`, `MF(zone)` открыт | Империя раскрывает базу | Манифест зоны закрывается/заменяется `MF(BASE)` с актуальным составом; никаких «двух мест» для одних юнитов |

### 19. Регрессия и гейты (AC-10, AC-18)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected |
|---|---|---|---|---|---|---|---|
| TC-R-01 | AC-10, AC-18 | gate | positive | P0 | `main` до изменений | `pnpm verify` (baseline) → `artifacts/logs/baseline-verify.log` | exit 0; числа кейсов по наборам **сняты из лога** и записаны в `qa-results.md` |
| TC-R-02 | AC-10 | gate | positive | P0 | после INTEGRATION | Полный e2e `pnpm e2e` | Все существующие спеки зелёные; число e2e-кейсов ≥ baseline; удалённые/переписанные — таблица «старый → новый» с причиной в плане |
| TC-R-03 | AC-3..AC-8 | gate | positive | P0 | — | Unit-наборы `pnpm test` | Зелёные; ни один набор не теряет кейсов относительно baseline; новые unit-тесты TC-TK/TC-MAP/TC-SS/TC-MK/TC-MF/TC-H присутствуют |
| TC-R-04 | AC-18 | gate | positive | P0 | всё собрано | `pnpm verify` | exit 0 → `artifacts/logs/verify.log`; CI на коммите — по возможности |
| TC-R-05 | AC-18 | gate | positive | P0 | все этапы до DELIVERY закрыты | `node scripts/check-task.mjs docs/tasks/SWR-009` | exit 0 → `artifacts/logs/check-task.log` |
| TC-R-06 | AC-18 | static | positive | P0 | — | `review.md` | Под `## Verdict` — `approved` |
| TC-R-07 | AC-18 | static | negative | P1 | — | `git status` | Не изменены `apps/api/prisma/dev.db`, `dev.pre-*.db`; нет `.env`, нет крупных traces и ассетов прототипа вне `docs/tasks/SWR-009/artifacts/design-source/` |

## Static/bundle commands

Команды записаны заранее; **не запускались**. Флаги `-I` (пропуск бинарных) и исключение тестов — по месту.

```bash
# G-1 демо-строки прототипов (AC-16)
grep -rnIE "DEMO|SECTOR SCAN|DESIGN ITERATION|OPEN DEMO|16:47|Состав не додумываю|ДЕМО|PLAYER VIEW ·|board-source|rebellion-source|fonts\.googleapis|fonts\.gstatic" apps/web/src packages/games/rebellion/src --exclude="*.test.ts" --exclude="*.test.tsx"

# G-2 захардкоженные счётчики консоли (AC-16; ревью каждого совпадения)
grep -rnIE "\b(32|69|56)\b" apps/web/src/i18n apps/web/src/games/rebellion apps/web/src/app/theme --exclude="*.test.ts" --exclude="*.test.tsx"

# G-3 демо-составы и демо-JS (AC-16)
grep -rnIE "stateData|unit-hit|inspectMarker|DEMO SYSTEM|6\+3|Звёздный разрушитель',\s*2|TIE-истребитель',\s*4|Фелуция.*Мон-Каламари" apps/web/src

# G-4 production-бандл (AC-8, AC-16)
grep -rlIE "SECTOR SCAN|DESIGN ITERATION|DEMO DATA|OPEN DEMO|16:47|fonts\.googleapis|board-source|rebellion-source|/dev/ui-kit" apps/web/dist

# G-5 hex вне модуля токенов (AC-3, R-1; ревью совпадений)
grep -rnIE "#[0-9A-Fa-f]{6}\b" apps/web/src --exclude="*.test.ts" --exclude="*.test.tsx"

# Stack diff (AC-2)
git diff 5b83e35 -- package.json "apps/*/package.json" "packages/*/package.json" "packages/games/*/package.json"
```

## Coverage (AC → TC)

| AC | Test cases | Негативные / граничные |
|---|---|---|
| AC-1 | TC-DA-01..TC-DA-04 | TC-DA-04 |
| AC-2 | TC-ST-01..TC-ST-05 | TC-ST-01, 03, 04, 05 |
| AC-3 | TC-TK-01..TC-TK-13, TC-R-03 | TC-TK-02, 05, 11 |
| AC-4 | TC-MAP-01..TC-MAP-07 | TC-MAP-02 |
| AC-5 | TC-SS-01..TC-SS-06 | TC-SS-02, 03, 04 |
| AC-6 | TC-MK-01..TC-MK-09 | TC-MK-03, 08 |
| AC-7 | TC-MF-01..TC-MF-14, TC-STALE-01..TC-STALE-03, TC-STALE-06..TC-STALE-08 | TC-MF-10, 13; TC-STALE-* |
| AC-8 | TC-H-01..TC-H-13, TC-SS-04, TC-MF-06, TC-STALE-04, TC-STALE-05, TC-STALE-09 | все TC-H, TC-STALE-04/05/09 |
| AC-9 | TC-CON-01..TC-CON-07 | TC-CON-06, 07 |
| AC-10 | TC-FN-01..TC-FN-10, TC-R-02, TC-STALE-01, TC-STALE-03 | TC-FN-08, 09 |
| AC-11 | TC-AI-01..TC-AI-09, TC-H-03, TC-H-09, TC-STALE-02 | TC-AI-06, 07, 08; TC-H-03, 09 |
| AC-12 | TC-NAV-01..TC-NAV-06 | TC-NAV-04 |
| AC-13 | TC-RSP-01..TC-RSP-05, TC-MF-12, TC-MF-13 | TC-RSP-02, TC-MF-13 |
| AC-14 | TC-IS-01..TC-IS-07 | TC-IS-04 |
| AC-15 | TC-VC-01..TC-VC-16 | классификация 15.4 |
| AC-16 | TC-DEMO-01..TC-DEMO-06, TC-H-12 | все TC-DEMO |
| AC-17 | TC-MAIN-01..TC-MAIN-03 | — (позитивный сквозной; негативы — в AC-8/AC-10) |
| AC-18 | TC-R-01, TC-R-04..TC-R-07 | TC-R-07 |

Итого 156 TC: DA 4, ST 5, TK 13, MAP 7, SS 6, MK 9, MF 14, H 13, CON 7, FN 10, AI 9, NAV 6, RSP 5, IS 7, VC 16, DEMO 6, MAIN 3,
STALE 9, R 7 (плюс матрицы §13 и §14 как шаги TC-RSP-01 и TC-IS-01/02).

## Testability requirements for implementers (предложения QA, утверждает лид)

1. `__boardDebug` (только `VITE_E2E=1`, контракт R-7 сохраняется), новые необязательные методы:
   `getGroupMarkers?(): { systemId: string; side: 'rebels' | 'empire'; arena: 'space' | 'ground'; count: number; screen: Point }[]`,
   `getAiRecentSystemIds?(): string[]`, `getRouteCount?(): number`, `getRegionCount?(): number`. Для Империи до раскрытия ни один
   метод не возвращает `BASE` (тот же фильтр, что и `getRebelBaseSystemId`).
2. `core-map-state` mirror: атрибуты `data-ai-recent` и `data-markers` (например `"rebels:space:2,empire:ground:1"`) у `map-system-<id>`.
3. testids манифеста: `unit-manifest` (`data-system-id` или `data-zone="hidden"`, `data-restricted`, `data-total`, `data-variant` rail или sheet),
   `unit-manifest-group-<side>-<arena>` (`data-count`, `data-selected`), `unit-manifest-row-<typeKey>` (`data-count`),
   `unit-manifest-leader-<leaderId>`, `unit-manifest-close`, `unit-manifest-sheet-toggle` (`aria-expanded`).
4. DOM-прокси маркеров (если маркеры Konva): `map-marker-<systemId>-<side>-<arena>` — `button` с `aria-label` и `aria-pressed`.
5. testids консоли: `console-header`, `console-status-bar`, `map-housing`, `map-display-header` (`data-systems`, `data-routes`),
   `console-rail`, `console-footer`; `ai-commander-led` (`data-state`). Существующие ids сохраняются.
6. Время записей журнала — из события (`data-time` у `log-entry-<seq>`), для TC-DEMO-05.
7. Скриншоты SWR-009 — с `task = 'SWR-009'`, чтобы не переписать evidence SWR-005/006.

## Questions (Q-n, для Analyst / лида)

- **Q-1 (Analyst, блокирует FINAL_ACCEPTANCE/DELIVERY машинно).** В `specification.md` AC заданы таблицей под заголовком
  `## 4. Acceptance criteria`. `scripts/check-task.mjs` (D14, строки ~386–401) извлекает AC только из пунктов вида
  `- **AC-n:** …` под заголовком, который **начинается** с «Acceptance criteria». Для SWR-009 множество AC будет пустым →
  ожидаемо R5 на каждой строке таблиц AC в `qa-results.md`/`acceptance.md` и R10 при `accepted`. Предложение: продублировать AC
  списком `- **AC-n:** …` в разделе `## Acceptance criteria` (без номера раздела). Подтверждено запуском 2026-11-21: `node scripts/check-task.mjs docs/tasks/SWR-009` → exit 1, `[R5] AC-1 is not an AC defined in specification.md (expected one of: none)` в `acceptance.md`, `qa-results.md`, `delivery-report.md` (шаблонные файлы); в `test-cases.md` замечаний нет.
- **Q-2 (лид).** Как маркеры Konva становятся фокусируемыми с клавиатуры (DOM-прокси поверх канваса, список в rail, roving
  focus по системам)? От ответа зависят шаги TC-MK-06 и строки матрицы §14.
- **Q-3 (Analyst).** Отметки «недавнее действие AI» после перезагрузки: `lastRun` живёт в памяти клиента — после reload отметок нет?
  (TC-AI-08 принимает оба варианта, кроме «устаревших».)
- **Q-4 (Analyst/лид).** Сооружения (structure) в манифесте и маркерах: отдельная арена/маркер или входят в наземные? R-3 описывает
  только флот/наземные/лидера; инвентарь §4.3 упоминает ромб сооружения.
- **Q-5 (лид).** Клик по маркеру в системе-цели при взятом лидере: активация или манифест (TC-MK-08)?
- **Q-6 (лид).** Включать ли спек визуальной сверки (TC-VC) в `pnpm verify`/CI или держать отдельным ручным тегом — он открывает
  `file://` и может перехватывать Google Fonts.
- **Q-7 (Analyst).** Пары TC-VC-08 для состояний манифеста, недостижимых в стартовой позиции реальной партии (например «только лидер»):
  допустимо ли брать сид/сконструированный вид, или пара фиксируется как `not_run` с причиной? QA по умолчанию — `not_run`, без
  вымышленных данных в приложении.
- **Q-8 (лид).** Пограничный контраст (TC-TK-04): red `#DD6B59` на case/dialog/key и green `#5E8D68` на module/case < 4.5:1 —
  если эти пары используются для текста, тест упадёт; нужно ли заранее заменить фон/цвет текста в этих местах.

## Сверка с планом

Не выполнена: `implementation-plan.md` — пустой шаблон на 2026-11-21. После TECH_PLANNING QA сверяет имена из раздела
«Testability requirements» и пути модулей (токены, сцена, манифест) с планом и обновляет этот документ.
