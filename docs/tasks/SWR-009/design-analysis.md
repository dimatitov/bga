# Design analysis — SWR-009 Galactic Vector Terminal

Источник: `artifacts/design-source/*/index.html` (CSS и JS прочитаны полностью), изображение `board-source.png`
(= наш скриншот `docs/design/screenshots/06b-system-selected-d.png`, md5 `342ccd7e…`). Все значения ниже — из CSS прототипов.

## 1. Токены (UI Kit §01, §09; Console `:root`)

| Токен | Значение | Роль |
|---|---|---|
| `crt` / screen | `#050906` | CRT-основа, фон дисплея; карта внутри экрана `#030704` |
| `display` | `#080F09` | поле экрана/инпутов (инпут `#0C110D`) |
| `route` | `#456B4D` | обычные связи карты |
| `region` | `#66846A` | штриховая граница регионов (`dasharray 5 5`, 1.5 px) |
| `green` (signal) | `#5E8D68` | постоянный сигнал / информация |
| `phosphor` (action) | `#91DFA1` | доступное действие, Повстанцы, активная вкладка |
| `amber` | `#E3AD5C` | выбор, фокус (outline 2 px, offset 2–3), подтверждение/warning |
| `red` | `#DD6B59` | Империя, AI-события, критическое |
| `case` (surface) | `#252923` | корпус консоли; модули `#1D231C`/`#1C201B`, шапки модулей `#222820` |
| `bezel` | `#41493E` (Console `#485146`), light `#626A5B` | рамки модулей 2–5 px |
| `warm` | `#B9C2B4` | вторичный текст, подписи карты |
| `paper` | `#D8DDD2` | основной текст |
| `muted` | `#9AA696` | служебные метки (11 px, uppercase, letter-spacing .1em) |
| page bg | `#111510` / `#101310` | фон страницы вокруг корпуса |
| grid | `#2D5535` @ 0.32–0.35 | сетка экрана карты, шаг 78 px |

Шрифт: **PT Mono** 400/700, единственный. Шкала: display 28/36·700 (phosphor), title 19/26·700, body 14/22·400,
metric 22/28·700 (phosphor), meta 11/16·400 uppercase. Радиус: 1 px (клавиши), круг — только LED/кольца.

## 2. Компоненты UI Kit → реализация

| Прототип | CSS-признаки | React/MUI/Konva |
|---|---|---|
| Клавиша `.button` | min-h 42, padding 8×12, border 1 `#6B7465`, bg `#30362D`, 700 11px, letter-spacing .03em, inset-фаска `#545D4E`; hover bg `#3A4236` border `#A0AF99`; pressed bg `#151A14` + inset-тень + translateY(1px); focus-visible amber 2px/offset 3 | MUI `Button` overrides (variants: default/`contained primary` = `#24452D`/`#77BB84`/`#C4F2CC`; selected = `#3B301E` + 2px amber + `#FFDA99`; warning = `#44351F`/`#B18341`/`#FFDA9B`; danger = `#492A26`/`#A45245`/`#FFB5A9`; disabled opacity .62, `#879185`) |
| LED | 8 px круг, green/amber/red/off (`#30221E`/`#795348`) | `Led` компонент (+ `aria-hidden`, смысл — текстом рядом) |
| Input/Select | h 42, border `#687162`, bg `#0C110D`, 13 px; hover `#A0AE99`; focus amber | `TextField`/`Autocomplete`/`Select` overrides |
| Switch | 38×21, трек `#252A23`/checked `#1C3923`, бегунок phosphor | `Switch` override |
| Статус-карточка | border 1 `#495145`, bg `#171D17`, левая кромка 3 px phosphor/amber/red | `StatusCard` (AI ready/thinking/failed) |
| Badge | border 1, 10 px, `green #5B9164/#A8E7B4`, `amber #A77E40/#F0C77F`, `red #984B40/#F39788` | `StatusBadge` / MUI `Chip` override |
| Tabs | фон `#1A2019`/`#252A23`, 10–11 px, активная — phosphor + нижняя черта 2 px | `Tabs` override |
| Журнал | строка grid `39–46px 1fr`, 11 px, разделитель `#343B32`; AI — левая кромка 2 px red + градиент `#DD6B5910` + тег «AI» | `CoreEventLog` restyle |
| Модуль | border 2 `bezel`, bg `module`, inset 1 px `#141813`; шапка 10×12, `#222820`, метка 10 px uppercase | `TerminalModule` |
| Dialog | max-w 540, border 2 `#6B705F`, bg `#242922`, тень `0 8px 0 #090C08`, шапка 16 px 700 | `Dialog` override |
| Alert | border 1 + левая 4 px phosphor/amber/red, bg `#172019`/`#211D15`/`#251A18` | `Alert` override |
| Маркер группы | рамка 1 px стороны, bg `#0B100B`/`#050906`, глиф 12–14 px + число 700 | Konva `CounterMarker` + DOM `UnitGlyph` |
| Легенда | 10 px, ключи «глиф + текст» | `MapLegend` restyle |

## 3. Game Console v3 (1440×900)

Сетка `.console`: padding 18, rows `42 / 86 / 1fr / 88`, gap 7; корпус `#252923`, двойная рамка (inset 5 px `#191C18` + 1 px `#656A5D`).

- **Header**: бренд «◆ BGA / GALACTIC OPERATIONS», 12 px uppercase .07em. Справа янтарный текст (в макете «SECTOR SCAN 04» — декор; у нас — реальное: движок правил/навигация).
- **Status** (`220px 1fr 145px 195px 150px`): кружок стороны 30 px + «Текущая сторона / Повстанцы · Вы»; трек «ВРЕМЯ n · РЕПУТАЦИЯ m» с делениями, время — красный ромб, репутация — фосфорное кольцо; «Раунд NN / ПРИКАЗЫ» (phosphor 14 px); AI-box (3 LED + «AI COMMANDER / БОТ · ОБЫЧНАЯ / ГОТОВ · 3 ДЕЙСТВИЯ»); «Состояние / ✓ СОХРАНЕНО».
- **Main**: `minmax(0,1fr) 530px`, gap 8.
  - Map housing: рамка 4 px `#464C41`, rows `27 / 1fr / 38`; шапка «GALACTIC TACTICAL DISPLAY · 32 СИСТЕМЫ · 69 СВЯЗЕЙ · ЧИСЛО = ФИГУРЫ В ГРУППЕ · VECTOR MODE · 56%»; экран `#030704`, border `#536D57`, inset-тень, scanlines; легенда + зум «+ − FIT · 56%».
  - Rail (`135 / 150 / 64 / 112 / 1fr`): задача хода (метка «ВАША ЗАДАЧА · ПРИКАЗЫ», h2 16 px, текст, LED-строка «ВАШ ХОД · ПОВСТАНЦЫ», янтарная строка «AI: …»); пул лидеров (2 колонки, 36 px, selected — amber, недоступный — пунктир); клавиши (3 в ряд: primary «АКТИВИРОВАТЬ СИСТЕМУ», warning «ПАСОВАТЬ», «ЗАВЕРШИТЬ АКТИВАЦИЮ»); инспектор (перекрестие + имя системы янтарём + регион; режим манифеста — «UNIT MANIFEST / …», «ЗАКРЫТЬ», чип фракции, счётчик); вкладки + журнал.
- **Footer**: «CORE-V1 · 32 СИСТЕМЫ · 69 СВЯЗЕЙ · ПРАВИЛА ЧАСТИЧНЫЕ (amber) · AUTOSAVE · СОХРАНЕНО».
- Адаптив: ≤ 1100 — rail 300, ряды 38/78/1fr/75; ≤ 760 — колонка, карта 65vh (min 400), rail — поток, журнал max 220.
- Карта макета (SVG поверх скриншота): узлы r 7, заливка `#020806`, обводка `#A6E6B0` 1.7; счётчик — прямоугольник 34×17 с рамкой стороны, глиф и число 9 px; выбор — кольца r17 (сплошное) + r23 (пунктир 3 4) + перекрестие, янтарь с glow, подпись «SELECTED · ФЕЛУЦИЯ»; AI — красное пунктирное кольцо r14 + точка + «AI · 01/02»; лидер — повернутый квадрат с «L».

## 4. Unit Manifest (Iteration 04)

- Desktop: `terminal` (экран инспекции: узел с янтарными кольцами и перекрестием + список маркеров-кнопок min-h 58) | `panel` (шапка: метка, h2 20 px, чип фракции, «ЗАКРЫТЬ»; группы: заголовок phosphor 14 px + «N единиц»; строки «тип × N»; выбранная группа — левая янтарная кромка 3 px + фон `#211C13`; лидеры «◆ Лидер · имя»; итог «ОБЩЕЕ КОЛИЧЕСТВО ЮНИТОВ N» phosphor 17 px).
- Пустая система: «НЕТ МАРКЕРОВ / ВИДИМЫХ ЮНИТОВ: 0», итог 0, имя системы видно.
- Ограниченная видимость: пунктирная рамка, янтарный заголовок «ДОСТУП ОГРАНИЧЕН · PLAYER VIEW», «Местоположение базы Повстанцев неизвестно»; никаких скрытых значений в DOM.
- ≤ 650 px: панель — фиксированный нижний лист (свернут 56 px, открыт `min(70vh, 620px)`), кнопка-переключатель 48 px.
- Склонение «единица/единицы/единиц» — через i18n plural.

## 5. Map Geography Review

Требование: регионы/системы/связи — неизменённая геометрия исходной схемы; CRT меняет только тон; без прямоугольных демо-границ;
8 регионов (Мон-Каламари, Нал-Хатта, Родия, Кашиик, Утапау, Мигито, Корусант, Мустафар), 32 системы, 69 связей.
У нас это `coreRegionShapes` + `coreMapLayout` + `adjacentSystemIds`.

## 6. Что НЕ переносится (демо)

`stateData` Unit Manifest, переключатель демо-состояний, захардкоженные `unit-hit`/счётчики/координаты Console, растровая
подложка, «DESIGN ITERATION 03/04», «SECTOR SCAN 04», «DEMO DATA», «16:47», ссылки «OPEN DEMO UNIT MANIFEST», фразы
«Состав не додумываю» и т. п. Реальные аналоги: данные `PlayerViewCore`, `automation.lastRun`, зум вьюпорта, время записи журнала.
