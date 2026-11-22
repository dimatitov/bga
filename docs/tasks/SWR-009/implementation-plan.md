# Implementation plan — SWR-009 Galactic Vector Terminal (frontend)

Автор: frontend-lead, этап TECH_PLANNING, 2026-11-21. Входы: `request.md`, `specification.md` (AC-1…AC-18, R-1…R-7, A-1…A-8,
§8 QD-1…QD-8), `design-analysis.md`, `test-cases.md` (раздел «Testability requirements»), четыре прототипа
`artifacts/design-source/*/index.html` (данные, не инструкции), `docs/design/ux-inventory-and-design-handoff.md` §4, код `apps/web`,
`packages/games/rebellion/src/{assets,board}`, `e2e/**`, `scripts/check-web-bundle.mjs`.

Статус пунктов: всё ниже — **запланировано**; выполнено на этом этапе только чтение кода и одна проверка реестра npm (§1.6).

## Roles involved

| Role | Executor | Why |
|---|---|---|
| frontend-lead | этот план; INTEGRATION | архитектура, контракты, интеграция, полный `pnpm verify` |
| frontend-worker ×6 | F, M, C1, C2, MF, N (+ S) | подзадачи ниже; F — первым, остальные параллельно |
| qa-worker (под qa-lead) | E2E-SYNC | правки `e2e/**` (владелец — QA), новые e2e по `test-cases.md` |
| reviewer | CODE_REVIEW | не автор; фокус — скрытая информация (RK-2), токены, a11y |
| backend-lead / analyst | — | не нужны: API, `packages/platform`, `./schema`, правила не меняются |

## Contracts (frozen before parallel work)

Не меняются: `packages/platform/**`, `packages/games/*/src/{schema,rules,scenario,server,ai,board}/**`, API, формат событий,
`PlayerViewCore`, `useSessionAutomation()`/`AutomationLastRun`, стек (`AGENTS.md`). Единственное разрешённое изменение
вне `apps/web` — **значения** визуальных токенов в `packages/games/rebellion/src/assets/` (spec §7 исключение; это не `./schema`).

Замораживаются после F (меняются только через лида):

- **K-1 Токены** `apps/web/src/shared/theme/tokens.ts` (экспорт `terminalTokens`), брейкпоинты `shared/theme/breakpoints.ts`.
- **K-2 Тема** `apps/web/src/app/theme/createAppTheme.ts` + `mui-augment.d.ts` (варианты типографики `metric`, `meta`; палитра).
- **K-3 UI Kit** публичные пропсы `apps/web/src/shared/ui/terminal/*` (§1.3).
- **K-4 Игровые визуальные токены** `rebellionVisualTokens` (ключи неизменны, значения новые) и `games/rebellion/theme/glyphs.ts`
  (`forceGlyphSpec`).
- **K-5 Модели данных** `core-v1/model/forces.ts`, `core-v1/model/aiRecent.ts`, `core-v1/model/mapStats.ts` (§3).
- **K-6 UI-состояние** `coreUiStore`: поле `manifest` и экшены `openManifest/closeManifest` (§3.4).
- **K-7 Слоты компоновки**: `CoreTable` рендерит `<MapHousing overlay={<OutcomeBanner …/>} />` и `<CoreSidebar log gameInfo />`;
  `CoreSidebar` рендерит `TurnPanel → TurnControls → UnitInspector → вкладки`. `MapHousing` (props `{ overlay?: ReactNode }`) и
  `UnitInspector` (без props) — заглушки F, дальше их владельцы M и MF.
- **K-8 testids / debug-API** — §5 (существующие сохраняются; новые — по списку).
- **K-9 i18n**: файлы локалей закреплены за подзадачами (§2, «Локали»); чужие ключи можно **читать**, писать — только в свои файлы.

## 1. Архитектура

### 1.1 Токены — один модуль

`apps/web/src/shared/theme/tokens.ts` — единственный источник значений UI Kit (лежит в `shared`, потому что его импортируют и
тема (`app`), и UI Kit (`shared/ui`), и игровой код (`games/*`); ESLint B-9 запрещает `shared/platform/app` импортировать игры,
обратное разрешено).

```ts
export const terminalTokens = {
  color: {
    // 12 ролей палитры (design-analysis §1)
    crt: '#050906', map: '#030704', display: '#080F09', input: '#0C110D',
    route: '#456B4D', region: '#66846A', signal: '#5E8D68', phosphor: '#91DFA1',
    amber: '#E3AD5C', red: '#DD6B59', case: '#252923', module: '#1D231C', moduleHead: '#222820',
    bezel: '#41493E', bezelLight: '#626A5B', warm: '#B9C2B4', paper: '#D8DDD2', muted: '#9AA696',
    page: '#111510', grid: '#2D5535', dialog: '#242922',
    // текстовые оттенки (QD-8): red/signal как текст запрещены
    redText: '#F39788', redTextSoft: '#F09B8C', phosphorText: '#A8E7B4', amberText: '#FFDA99',
    disabledText: '#879185',
  },
  key: { /* default/hover/pressed/primary/selected/warning/danger: bg, border, text, bevel — design-analysis §2 */ },
  badge: { green: {...}, amber: {...}, red: {...} },  alert: { info: {...}, warning: {...}, error: {...} },
  font: { family: '"PT Mono", ui-monospace, monospace' },
  type: { display: [28, 36, 700], title: [19, 26, 700], body: [14, 22, 400], metric: [22, 28, 700], meta: [11, 16, 400] },
  radius: 1, bezel: { module: 2, housing: 4 }, focus: { color: '#E3AD5C', width: 2, offset: 2 },
  space: { console: 18, gap: 7, module: 12 },
  textPairs: [ /* [fgRole, bgRole] — все пары «текст × фон», реально используемые темой и компонентами */ ],
} as const;
```

- `app/theme/tokens.ts` остаётся (имена `tokens.*` «frozen» с SWR-002) — **реэкспорт-адаптер** из `terminalTokens`
  (`background.default = page`, `background.paper = module`, `text.primary = paper`, `text.secondary = warm`, `primary.main = phosphor`,
  `focus = amber`, `mock.main = amber`, `shapeRadius = 1`, `fontFamily = font.family`). Одно место истины — `terminalTokens`.
- Контраст (AC-3, TC-TK-04/05, QD-8): `shared/theme/tokens.test.ts` проверяет каждую пару из `textPairs` ≥ 4.5:1 и что
  `red`/`signal`/`region`/`route`/`grid` **не встречаются** как fg в `textPairs`; фокус-кольцо ≥ 3:1 к page/module/case/crt.
  Предрасчёт (арифметика по hex, не прогон): `paper` ≥ 8.98 на всех фонах, `warm` ≥ 5.68, `muted` ≥ 4.11 на keyHover (⇒ `muted` на
  клавишах не использовать; на page/case/module/crt ≥ 5.8), `phosphor` ≥ 6.6, `amber` ≥ 5.17, `redText` ≥ 4.77, `red` на case 4.45 и
  dialog 4.47 (только не-текст), `signal` на case 3.86 (только не-текст), disabled 3.80 на key (WCAG исключение для disabled; в
  `textPairs` не входит).
- Брейкпоинты консоли (`shared/theme/breakpoints.ts`): `CONSOLE_WIDE = 1400`, `CONSOLE_FULL = 1200` (= MUI `lg`),
  `CONSOLE_SPLIT = 900` (= MUI `md`), `MOBILE_SHEET = 760`; хелпер `mq.up(px)`/`mq.down(px)` → строки `@media` для `sx`.
  MUI `theme.breakpoints` **не меняем** (затронуло бы все страницы).

### 1.2 MUI-тема из токенов (F, `createAppTheme.ts`)

- `palette`: `mode: 'dark'`, `background {default: page, paper: module}`, `text {primary: paper, secondary: warm, disabled: disabledText}`,
  `primary = phosphor`, `warning = amber`, `error = red` (+ `error.light = redText` для текста), `success = phosphor`, `info = signal`,
  `divider = bezel`, кастомные `mock`, `focus`, новые `terminal` (ссылка на `terminalTokens.color` для `sx`).
- `typography`: `fontFamily` из токенов; `h1` 28/36·700, `h2` 19/26·700, `h3` 16/22·700, `body1` 14/22, `body2` 13/20, `overline` =
  meta 11/16 uppercase `letterSpacing: .1em`; новые варианты `metric` (22/28·700, phosphor) и `meta` (augmentation
  `TypographyVariants`/`TypographyPropsVariantOverrides` в `mui-augment.d.ts`). Глобально `fontVariantNumeric: tabular-nums`.
- `shape.borderRadius = 1`. `transitions`/`disableRipple` при `reduceMotion` — как сейчас; плюс `@media (prefers-reduced-motion: reduce)`
  в `MuiCssBaseline` гасит `animation`/`transition` (мигание LED «думает»).
- `MuiCssBaseline`: фон `page`, `color-scheme: dark`, цвет выделения, тёмные скроллбары, глобальный `:focus-visible` = FOCUS_RING (amber 2 px).
- `MuiButtonBase`: FOCUS_RING (контракт SWR-004 сохраняется; меняется только цвет — тест `createAppTheme.test.tsx` обновляется).
- `MuiButton` (клавиши UI Kit; `defaultProps.disableElevation`, без смены `variant` по умолчанию):
  - `outlined` (+ `color="inherit"`/`primary`) = **default key**: bg `#30362D`, border `#6B7465`, текст `paper` 700 11 px uppercase
    `.03em`, inset-фаска; `:hover` bg `#3A4236`/border `#A0AF99`; `:active` (pressed) bg `#151A14` + inset-тень + `translateY(1px)`
    (без сдвига при reduce motion); `min-height: 42` (44 на `pointer: coarse`); текст **переносится** (`white-space: normal`).
  - `contained` + `color="primary"` = primary (`#24452D`/`#77BB84`/`#C4F2CC`); `contained` + `warning` = warning
    (`#44351F`/`#B18341`/`#FFDA9B`); `contained` + `error` = danger (`#492A26`/`#A45245`/`#FFB5A9`).
  - **selected**: `[aria-pressed="true"], [aria-checked="true"], &.Mui-selected` → `#3B301E` + 2 px amber + текст `#FFDA99`.
  - `disabled`: `opacity .62`, текст `disabledText`, без hover.
  - `text` = низкоконтрастная ссылка-клавиша (phosphor, uppercase 11 px) — для «Закрыть», «← К игре».
- `MuiIconButton` (квадратная клавиша 42/44, тот же default key), `MuiToggleButton` (как key + selected).
- `MuiOutlinedInput`/`MuiTextField`/`MuiAutocomplete`/`MuiSelect`: h 42, border `#687162`, bg `input`, 13 px; hover `#A0AE99`;
  focus — amber; popup `MuiPaper`/`MuiMenu`/`MuiAutocomplete.paper` — `module` + bezel.
- `MuiSwitch` 38×21 (трек `#252A23`/checked `#1C3923`, бегунок phosphor), `MuiCheckbox`/`MuiRadio` (квадрат, фосфор при checked,
  amber фокус).
- `MuiTabs`/`MuiTab`: фон `#1A2019`, 11 px uppercase; активная — phosphor + индикатор 2 px; фокус amber.
- `MuiDialog`: max-w 540, border 2 `#6B705F`, bg `dialog`, тень `0 8px 0 #090C08`, заголовок 16 px 700; `MuiBackdrop` тёмный.
- `MuiAlert`: border 1 + левая кромка 4 px phosphor/amber/red, фоны `#172019`/`#211D15`/`#251A18`, текст `paper`, иконка цвета
  кромки (для error — `redText`).
- `MuiChip`: рамка 1 px, 10–11 px uppercase, радиус 1; цвета `success/warning/error` → бейджи green/amber/red (текст `phosphorText`/
  `#F0C77F`/`redText`).
- `MuiTooltip`: bg `#0B100B`, border bezel, 11 px; `MuiPaper` (radius 1, без elevation-градиента), `MuiDivider` bezel, `MuiLink` phosphor,
  `MuiSnackbar`/`MuiSnackbarContent` (FeedbackHost) — как Alert.

### 1.3 UI Kit — общий слой `apps/web/src/shared/ui/terminal/`

Игро-независимые компоненты (ESLint B-9: не знают игр; тексты — только через props, i18n внутри нет). Каждый — свой
`*.test.tsx` (AC-3, TC-TK-06…10). Экспорт через `shared/ui/terminal/index.ts` и `shared/ui/index.ts`.

| Компонент | Назначение / ключевые props |
|---|---|
| `TerminalModule` | `section` с шапкой-меткой (meta uppercase), безель 2 px, inset; props `label`, `labelId?`, `headingLevel?` (h2/h3), `actions?`, `tone?: 'default'\|'restricted'` (пунктирная рамка), `dense?`, `...BoxProps` (testid прокидывается) |
| `Led` | 8 px круг `state: 'green'\|'amber'\|'red'\|'off'`, `blink?` (выключено при reduce motion), всегда `aria-hidden`, `data-state` |
| `StatusBadge` | `tone: 'green'\|'amber'\|'red'\|'neutral'`, `children` обязателен по типу |
| `StatusCard` | левая кромка 3 px tone, заголовок + текст (AI ready/thinking/failed) |
| `KeyButton` | тонкая обёртка `Button` (варианты из темы) + `led?: LedState`, `selected?` → `aria-pressed` |
| `Readout` | meta-метка + значение (`metric`/`body`) — ячейки status bar и шапки дисплея |
| `UnitGlyph` | SVG `shape: 'triangle'\|'square'\|'diamond'\|'circle'`, `filled`, `color`, `stroke?`, `dashed?`, `size`; `aria-hidden`; `data-shape`, `data-filled` |
| `CounterMarker` | DOM-кнопка «глиф + число»: `glyph: UnitGlyphProps`, `count`, `pressed?`, `onClick`, `aria-label` (обязателен), min 44×44 на `pointer: coarse` |
| `LegendKey` | «глиф + подпись», 10–11 px |
| `ScanlineOverlay` | декоративный слой CRT, `aria-hidden`, `pointer-events: none`, без анимации |
| `TerminalSheet` | **не в F**: нижний лист делает MF у себя (`core-v1/manifest/ManifestSheet.tsx`), это единственный потребитель |

Игровые обёртки (F): `games/rebellion/theme/glyphs.ts` — `forceGlyphSpec(owner, arena | 'leader')` → `{shape, filled, color}` по R-3
(флот = triangle, наземные = square, лидер = diamond с amber-контуром; Империя filled red, Повстанцы контур phosphor) — **один** дескриптор
для DOM (`games/rebellion/ui/ForceGlyph.tsx` → `UnitGlyph`) и Konva (M рисует по тому же spec). Тест: дескрипторы 5 комбинаций
попарно различимы без поля `color` (TC-TK-10).

### 1.4 Konva-стили

`games/rebellion/theme/mapStyle.ts` (создаёт F, владеет M): все числа и цвета карты, вычисленные **только** из `terminalTokens` +
`rebellionVisualTokens` (R-1, TC-TK-02): фон экрана, сетка (`grid` @ .32, шаг 78 px), регион (`region`, dash `[5,5]`, 1.5 px, без заливки),
маршрут (`route`), узел (fill `#020806`→токен `map`, stroke phosphor 1.7), подписи (`warm`, PT Mono), цель (phosphor dash `[3,4]`),
выбор (amber сплошное + пунктирное кольцо + перекрестие), AI (red dash `[4,4]` + точка), активация, источник, спорная, удалённая,
база, drop legal/illegal, маркер групп (рамка цвета стороны, bg `#0B100B`, 34×17 px, глиф 12, число 700). Konva-компоненты не содержат
hex-литералов. Шрифт Konva: `terminalTokens.font.family`; M перерисовывает сцену после `document.fonts.load('400 13px "PT Mono"')`
(guard для jsdom).

### 1.5 Цвета фракций — одно место истины

Решение: **меняем значения в `packages/games/rebellion/src/assets/tokens.ts`** (`rebellionVisualTokens`), web-override не делаем
(иначе эмблемы, карточки настройки, обложка и легаси-стол разъедутся с картой). Ключи не меняются → `test/assets/assets.test.ts` проходит
без правок; `test/assets/factions.test.ts` проверяет `onColor` (= `board.background`) на цвете ≥ 4.5 и цвет на `board.background` ≥ 3 —
предрасчёт: `#030704` на `#DD6B59` ≈ 6.1, на `#91DFA1` ≈ 12.8; `#DD6B59`/`#91DFA1` на `#030704` ≈ 6.1/12.8 — проходят.

| Ключ | Было | Станет |
|---|---|---|
| `faction.empire` / `faction.rebels` | `#7C9CFF` / `#F5A524` | `#DD6B59` / `#91DFA1` |
| `board.background` / `star` | `#070A10` / rgba | `#030704` / `rgba(45,85,53,0.35)` (сетка) |
| `board.link` / `systemFill` / `systemStroke` | … | `#456B4D` / `#020806` / `#91DFA1` |
| `board.label` / `selected` / `legalTarget` / `invalidTarget` | … | `#B9C2B4` / `#E3AD5C` / `#91DFA1` / `#DD6B59` |

Плюс `rebellionAssets.accentColor` → `#91DFA1` и цвета фракций в `cover.ts` (обложка каталога) → новые. Легаси-стол `mock-v1`
наследует палитру без отдельной вёрстки (spec §7). `web/games/rebellion/theme/palette.ts` остаётся реэкспортом.
`dist` пакета пересобирается `pnpm run build:packages` (входит в `pnpm typecheck`/`e2e`).

### 1.6 Шрифт PT Mono

- Пакет `@fontsource/pt-mono@5.3.0` (OFL-1.1), опубликован 2026-07-19 — старше суточного `minimumReleaseAge` pnpm 12, исключений не
  нужно. Проверено командами `pnpm view @fontsource/pt-mono …` и `npm pack` во временную папку (не установка в репозиторий).
- **В пакете только начертание 400** (файлы `latin/latin-ext/cyrillic/cyrillic-ext-400-normal.woff2`). У Google Fonts PT Mono тоже один
  вес, прототипы запрашивают `wght@400;700` и получают синтезированный bold — у нас то же самое (`font-synthesis` по умолчанию).
  Принято как assumption PA-1; отдельный bold-файл не добавляем (лицензионно/объёмом не оправдано).
- Установка (F): `pnpm --filter @bga/web add @fontsource/pt-mono@5.3.0` (точная версия, как остальные зависимости). Подключение —
  `import '@fontsource/pt-mono/400.css'` в `apps/web/src/main.tsx` (все подмножества с `unicode-range`, кириллица включена; запросов к
  внешним доменам нет — TC-ST-04). В Vitest `main.tsx` не грузится — тесты не зависят от шрифта.
- Если установка не пройдёт (сеть/политика): fallback `ui-monospace, monospace` уже в `font.family`; F фиксирует `blocked` с логом,
  остальные подзадачи не блокируются (визуальная сверка — с пометкой).

## 2. Подзадачи и владение файлами

Порядок: **F → { M, C1, C2, MF, N, S } параллельно → E2E-SYNC (QA) + INTEGRATION (лид)**.
Владение передаётся: файл, созданный/изменённый F, после сдачи F переходит к указанному владельцу; F его больше не трогает.
Файлы, не перечисленные ни у кого, — **только чтение** (в т.ч. `core-v1/model/viewModel.ts`, `aiCommander.ts`, `announcements.ts`,
`panels/labels.ts`, `panels/focus.ts`, `panels/turnErrorStore.ts`, `hooks/useActivateSystem.ts`, `board/model/**`, `table/hooks/**`,
`table/LegacyTable.tsx`, `board/**` кроме перечисленного, `dev/ai/**`, `platform/sessions/**`, `platform/registry/**`).
Если воркеру нужна правка чужого/замороженного файла — он **не правит**, а пишет в отчёт; лид решает на INTEGRATION.

Рабочее дерево: по возможности параллельные воркеры — в отдельных git worktree (рантайм это поддерживает, см. `.claude/worktrees`);
иначе в общем дереве каждый гоняет **только свои** тесты, а сквозной `typecheck`/`lint` — информативно (чужие WIP могут ломать),
финально — у лида.

Общие команды (перед любой: `source ~/.nvm/nvm.sh && nvm use 22.23.5`; `pnpm install` — только F):

```bash
pnpm --filter @bga/web exec vitest run <paths>     # unit своей зоны
pnpm --filter @bga/web typecheck                   # tsc -b
pnpm exec eslint <owned paths> --max-warnings=0 && pnpm exec prettier --check <owned paths>
```

### F — Foundation (frontend-worker; первый, блокирует остальных)

OWNED FILES:
- `apps/web/package.json`, `pnpm-lock.yaml` (только добавление `@fontsource/pt-mono`), `apps/web/src/main.tsx`
- `apps/web/src/shared/theme/**` (новые: `tokens.ts`, `breakpoints.ts`, `index.ts`, `tokens.test.ts`)
- `apps/web/src/app/theme/**` (`createAppTheme.ts`, `createAppTheme.test.tsx`, `tokens.ts`, `index.ts`, `mui-augment.d.ts`)
- `apps/web/src/shared/ui/terminal/**` (новые) и `apps/web/src/shared/ui/index.ts`
- `packages/games/rebellion/src/assets/{tokens,index,cover}.ts` (+ `packages/games/rebellion/test/assets/**`, только если тест требует)
- `apps/web/src/games/rebellion/theme/**` (`palette.ts`, новые `glyphs.ts`, `glyphs.test.ts`, `mapStyle.ts` → затем M)
- `apps/web/src/games/rebellion/ui/**` (новый `ForceGlyph.tsx` + тест; рестайл `FactionChip`, `PieceGlyph`, `FactionEmblem` при необходимости)
- контракты K-5/K-6: `core-v1/model/{forces,aiRecent,mapStats}.ts` + `*.test.ts`, `core-v1/model/coreUiStore.ts` + `coreUiStore.test.ts`
- `apps/web/src/games/rebellion/test/coreFixtures.ts` (новые билдеры: `withUnits`, `empireRedactedView`, `withLastRun`; потом — заморожен)
- скелет K-7: `core-v1/CoreTable.tsx` (→ C1), `core-v1/CoreTable.test.tsx` (→ C1), `core-v1/top-bar/CoreTopBar.tsx` + тест (→ C1),
  `core-v1/sidebar/CoreSidebar.tsx` (→ C2), `core-v1/top-bar/CoreGameInfoPanel.tsx` (→ C2), `core-v1/sidebar/CoreEventLog.test.tsx` (→ C2,
  только если тест опирается на легенду в «Партии»), новые `core-v1/canvas/MapHousing.tsx` (→ M), `core-v1/manifest/UnitInspector.tsx` (→ MF)
- локали: новые `games/rebellion/locales/{ru,en}/manifest.json` = `{}` (→ MF); `games/rebellion/locales.i18n.test.ts` (добавить
  `'rebellion.manifest'` в `TABLE_NAMESPACES`; потом — заморожен)

Работа: §1.1–1.6; K-5/K-6 по §3; скелет K-7 (чистая перекомпоновка, без рестайла): `TurnControls` из слота шапки → в `CoreSidebar`
после `TurnPanel` (слот `controls` и обёртка `top-bar-controls` удаляются); `CoreContextPanel` в `CoreSidebar` → `<UnitInspector />`
(заглушка рендерит `CoreContextPanel`); `MapLegend` из `CoreGameInfoPanel` → в `MapHousing` (заглушка: `overlay` + `CoreBoardStage` +
`MapLegend` под сценой); `CoreTable` рендерит `<MapHousing overlay={<OutcomeBanner backHref=… />} />`.

Контракты: не менять props `TurnControls`/`TurnPanel`/`CoreBoardStage`/`MapLegend`; существующие testids и e2e остаются зелёными
после скелета (testid `top-bar-controls` не используется спеками — удаление согласовано в §5).

Тесты: `shared/theme/tokens.test.ts` (палитра, шкала, шрифт с fallback, радиус; контраст `textPairs` ≥ 4.5; «ложный» токен даёт падение —
TC-TK-05), `createAppTheme.test.tsx` (фокус amber; overrides `MuiButton/IconButton/TextField/Select/Switch/Tabs/Tab/Dialog/Alert/Chip/Tooltip/
Checkbox` присутствуют; `fontFamily` начинается с `"PT Mono"`; h1/h2/body1/metric/meta = 28/19/14/22/11; варианты клавиш с computed
стилями — default/primary/warning/danger/selected/disabled, TC-TK-08), по тесту на каждый компонент UI Kit, `glyphs.test.ts`,
`forces.test.ts`, `aiRecent.test.ts`, `mapStats.test.ts`, `coreUiStore.test.ts` (manifest), пакетные `test/assets/*.test.ts` — зелёные.

DONE WHEN: все тесты выше + существующие тесты `apps/web` и `packages/games/rebellion` зелёные; `pnpm typecheck`, `pnpm lint` — exit 0;
`pnpm e2e -- e2e/board-view.spec.ts e2e/core-turn.spec.ts e2e/core-visual-a11y.spec.ts e2e/visual-a11y.spec.ts` зелёные (скелет ничего
не сломал; контраст новой палитры); лид принял K-1…K-9.

Проверка:
```bash
pnpm --filter @bga/web add @fontsource/pt-mono@5.3.0
pnpm --filter @bga/web exec vitest run src/shared src/app/theme src/games/rebellion/theme src/games/rebellion/ui src/games/rebellion/core-v1 src/games/rebellion/locales.i18n.test.ts
pnpm --filter @bga/game-rebellion test
pnpm typecheck && pnpm lint
pnpm e2e -- e2e/board-view.spec.ts e2e/core-turn.spec.ts e2e/core-visual-a11y.spec.ts e2e/visual-a11y.spec.ts
```

### M — Vector Map (frontend-worker, Board; после F)

OWNED FILES: `apps/web/src/games/rebellion/core-v1/canvas/**` (включая `MapHousing.tsx`, `CoreBoardStage.tsx` + тест, `CoreMapCaption.tsx`,
`layers/**`, `nodes/**`, `screenScale.ts`), `core-v1/geometry/**` (+ тесты), `core-v1/hooks/{useCoreBoardDebug,coreBoardDebugImpl,useCoreMoveDrag,
useLeaderDrop}.ts` + `useCoreMoveDrag.test.tsx`, `core-v1/sidebar/MapLegend.tsx`, `games/rebellion/theme/mapStyle.ts`,
`games/rebellion/board/canvas/ZoomControls.tsx` (общий с легаси: новый проп `placement?: 'overlay' | 'bar'`, по умолчанию прежнее
поведение), `games/rebellion/locales/{ru,en}/map.json`.

Работа:
1. **Map housing** (`MapHousing.tsx`, testid `map-housing`): рамка 4 px; шапка дисплея `map-display-header`
   (`data-systems`, `data-routes`, `data-regions`, `data-zoom`): «ТАКТИЧЕСКИЙ ДИСПЛЕЙ · N систем · M связей · ЧИСЛО = ФИГУРЫ В ГРУППЕ ·
   <LOD> · <zoom>%» — числа из `mapStats(view.map)` и вьюпорта; CRT-экран (`board-canvas` остаётся на нём) с CSS-сеткой 78 px и
   `ScanlineOverlay`; нижняя полоса: постоянная `MapLegend` (`map-legend`) + `ZoomControls placement="bar"` (`zoom-in/out/fit/level`).
   Растр запрещён (`stage.find('Image').length === 0`, TC-ST-05). `CoreMapCaption` («собственная графика») остаётся.
2. **Стиль R-4** во всех слоях: регионы — только штриховая граница + подпись (без `REGION_TINTS`-заливки), маршруты, узлы, подписи PT Mono.
3. **Состояния систем (AC-5)**: цель, выбранная, активированная, источник, спорная, удалённая, база (только `visibleRebelBaseSystemId`),
   AI-недавняя (`aiRecent`), drop legal/illegal — чистая функция `systemMarks(scene.system) → Mark[]` (`geometry/systemMarks.ts`), где
   каждый признак отличается **формой** (радиус/пунктир/глиф), не только цветом; unit-тест попарной различимости без цвета.
4. **Маркеры групп (AC-6, QD-4)**: detail LOD — по одному маркеру на (сторона × арена) с `count` из `forcesBySystem(view)`; экранно-постоянный
   размер 34×17, Империя слева, Повстанцы справа, флот сверху, наземные снизу; лидеры — ромб amber на дуге (как сейчас слоты).
   Compact LOD (A-8) — один маркер на сторону (units + лидеры, как `chipBox`). Скрытая зона — маркеры по `zoneForces(view)` (только Повстанцы).
   Hit-зона маркера ≥ 44 px. Клик/тап по маркеру: если лидер взят — поведение клика по системе (QD-5); иначе `selectSystem` (или
   `selectZone`) + `openManifest(target, group)`. Клик по системе вне маркера — прежний (выбор/активация).
5. **Drag перемещения сохраняется (AC-10)**: в detail LOD во время своей активации юниты из `MOVE_PIECES.pieces` источника рисуются
   дополнительно как **маркеры-ручки** одиночного юнита (глиф без числа, фосфорный пунктир) на дуге под системой-источником; drag ручки =
   прежний `useCoreMoveDrag` (один юнит). Счётчики групп при этом показывают полный состав (честное число фигур).
6. **AI-отметки (AC-11, QD-3)**: красное пунктирное кольцо + точка + «AI · 01…» по `aiRecentMarks(lastRun, view)`; зона — отметка на зоне.
7. Debug-API (§5.3) и зеркало `core-map-state` (`data-ai-recent`, `data-markers`).
8. LOD, зум, пан, клавиатура карты (`useBoardKeyboard`), «вписать карту», leader drop — без изменения поведения; ширина подписей —
   пересчитать `LABEL_CHAR_EM` под PT Mono (≈ 0.6 em) и проверить `core-fit`.

Контракты: `board-canvas` (role region, tabIndex 0, aria-describedby, `data-scale`, `data-lod`, `data-rules-engine`), `core-map-state`,
`map-system-<id>` и атрибуты, `map-hidden-zone[data-count]`, `zoom-*`, `map-caption`, `map-legend`; существующие методы `__boardDebug`
(сигнатуры и смысл; `getPieceScreenPos` — см. §5.3); `MapHousing` props `{ overlay?: ReactNode }`. Konva-узлы не фокусируются (QD-2).

Тесты: `sceneModel.test.ts` (32 системы, 69 связей, 8 регионов на реальных `view.map` + `coreMapLayout`/`coreRegionShapes`; маркеры = оракул
`COUNT`; compact; зона; ручки только у `MOVE_PIECES`), `systemMarks.test.ts`, `labelLayout.test.ts`, `contentBounds.test.ts`,
`CoreBoardStage.test.tsx` (нет `Image`; mirror-атрибуты; housing-шапка с реальными числами), `useCoreMoveDrag.test.tsx`, тест
`coreBoardDebugImpl` для новых методов на редактированном виде Империи (ни один не возвращает систему базы).

DONE WHEN: тесты зелёные; e2e `core-turn`, `core-fit`, `zoom-pan`, `selection`, `core-hidden-base`, `core-visual-a11y`, `legacy`, `move`
зелёные; ни одного hex-литерала в `core-v1/canvas/**` (grep).
```bash
pnpm --filter @bga/web exec vitest run src/games/rebellion/core-v1/canvas src/games/rebellion/core-v1/geometry src/games/rebellion/core-v1/hooks
pnpm e2e -- e2e/core-turn.spec.ts e2e/core-fit.spec.ts e2e/zoom-pan.spec.ts e2e/selection.spec.ts e2e/core-hidden-base.spec.ts e2e/core-visual-a11y.spec.ts e2e/legacy.spec.ts e2e/move.spec.ts
grep -rnE "#[0-9A-Fa-f]{6}" apps/web/src/games/rebellion/core-v1/canvas || echo "no hex"
```

### C1 — Game Console: каркас, header, status bar, footer, AI Commander (frontend-worker, UI; после F)

OWNED FILES: `core-v1/CoreTable.tsx` + `CoreTable.test.tsx`; `core-v1/top-bar/**` **кроме** `CoreGameInfoPanel.tsx` (т.е. `CoreTopBar`,
`TurnIndicator`, `TimeTrack`, `AiCommanderStatus`, `OutcomeBanner`, `index.ts` + их тесты); новые `core-v1/console/**`
(`ConsoleHeader.tsx`, `ConsoleFooter.tsx`, `consoleLayout.ts` + тесты); `games/rebellion/table/components/{PrototypeBadge,SaveStatus}.tsx` +
`PrototypeBadge.test.tsx`; `apps/web/src/platform/automation/{AutomationNotice.tsx,AutomationNotice.test.tsx,noticeLayout.ts}`;
`games/rebellion/locales/{ru,en}/{match,session}.json`.

Работа: компоновка §4; header (`console-header`): «← К игре» (`session-back-to-game`), бренд, движок правил, ⚙ (`session-settings`);
status bar = существующий `table-top-bar` (сторона «(вы)» с `turn-indicator`, `time-track` с текстом и делениями — время красный ромб,
репутация фосфорное кольцо, раунд + `phase-indicator`, `passed-indicator`, `ai-commander-status` с 3 LED (`ai-commander-led[data-state]`:
idle → green, thinking → amber blink + «ИИ думает…» `ai-thinking`, stalled → red, over → off), `save-status`, `session-status-completed`);
footer (`console-footer`): `CORE-V1 · N систем · M связей` из `mapStats`, `prototype-badge` (текст «правила частичные», en содержит
`Real map` — e2e TC-VA-… проверяет `/Real map/`), без дубля сохранения. `OutcomeBanner` (`game-over-*`) в стиле Alert/Dialog. `AutomationNotice`
(«Ход AI не завершён», `session-automation-retry`) — `StatusCard`/Alert red. Skip-ссылки и sr-only h1 остаются в `CoreTable`.

Контракты: `game-table` и все его `data-*`; `skip-to-turn`, `skip-to-list`; порядок DOM = порядок Tab (header → status → map → rail →
footer); `CoreSidebar`/`MapHousing` вызываются по K-7; announcements (`useAnnounceAutomationRuns`) без изменений.

Тесты: `CoreTable.test.tsx` (области сетки на 1440/1280/1024/768/375 через `matchMedia`-мок или классы `consoleLayout`), `CoreTopBar.test.tsx`,
`AiCommanderStatus.test.tsx` (4 состояния, LED + текст), `TimeTrack.test.tsx`, `OutcomeBanner.test.tsx`, `PrototypeBadge.test.tsx`,
`AutomationNotice.test.tsx`, тест footer/header (числа из view, нет литералов-чисел).

DONE WHEN: тесты зелёные; e2e `core-visual-a11y` (TC-VA-10 и др.), `visual-a11y`, `ai-commander`, `core-victory`, `hot-seat`, `persistence`
зелёные; нет горизонтальной прокрутки на 1440×900, 1280×800, 1024×768, 768×1024, 375×812 (существующие проверки + ручной скриншот).
```bash
pnpm --filter @bga/web exec vitest run src/games/rebellion/core-v1/CoreTable.test.tsx src/games/rebellion/core-v1/top-bar src/games/rebellion/core-v1/console src/games/rebellion/table/components src/platform/automation
pnpm e2e -- e2e/core-visual-a11y.spec.ts e2e/visual-a11y.spec.ts e2e/ai-commander.spec.ts e2e/core-victory.spec.ts e2e/hot-seat.spec.ts e2e/persistence.spec.ts
```

### C2 — Game Console: rail (ход, лидеры, клавиши, вкладки, журнал) (frontend-worker, UI; после F)

OWNED FILES: `core-v1/sidebar/{CoreSidebar,CoreEventLog,CoreBoardList,coreLogMessage}.tsx|ts` + их тесты (`CoreEventLog.test.tsx`,
`CoreBoardList.test.tsx`, `coreLogMessage.test.ts`); `core-v1/top-bar/CoreGameInfoPanel.tsx`; `core-v1/panels/{TurnPanel,TurnControls,LeaderPool,
ActivationPicker,MovePanel,MoveSourceFieldset,PassConfirmDialog,AiTurnSummary,useTurnCommands}.tsx|ts` + их тесты (`*.test.tsx`,
`useTurnCommands.focus.test.tsx`, `panels/test/**`); `games/rebellion/locales/{ru,en}/{turn,board}.json`.

Работа: rail-модули на `TerminalModule`: «ВАША ЗАДАЧА · <фаза>» (`turn-panel[data-state]`, `turn-status`, LED-строка «ВАШ ХОД · <сторона>»,
янтарная строка «AI: …» из `AiTurnSummary` — `ai-turn-summary`, `ai-fallback-notice`); пул лидеров (2 колонки, `leader-pool` radiogroup,
`leader-<id>`: selected amber, недоступный — пунктир + текст, ≥ 44 px на тач); клавиши `TurnControls` (`turn-controls` role=group):
новая primary **«Активировать систему»** `turn-activate` (enabled ⇔ взят лидер и выбранная система ∈ `activationTargets`; вызывает
`useActivateSystem`), warning `pass-turn` (+ `PassConfirmDialog`: `pass-confirm*`, фокус на «Отмена»), `finish-activation`; при `<900`
ряд клавиш `position: sticky; bottom: 0` внутри rail; текст клавиш переносится. Вкладки `sidebar-tab-*` и панели; журнал: новые сверху,
`log-entry-<seq>` + `data-time` (из `event.at`), AI — красная кромка 2 px + `log-entry-<seq>-ai`; «Объекты» (`board-list` listbox, строки
hover/selected/focus); «Партия» (`game-info`, без легенды — она в housing).

Контракты: все testids панели хода/лидеров/перемещения/журнала/списка (§5.1); клавиатура пула (стрелки + Space), picker, Esc-порядок,
`focusWhenReady` id; `aside[aria-label]` `core-sidebar`; `UnitInspector` вставляется между клавишами и вкладками (K-7).

Тесты: обновить существующие тесты панелей/журнала/списка под новую разметку; `TurnControls.test.tsx` + `turn-activate` (enabled/disabled,
отправляет `ACTIVATE_SYSTEM` с лидером и системой); `CoreEventLog.test.tsx` (`data-time`, AI-кромка).

DONE WHEN: тесты зелёные; e2e `core-turn`, `keyboard`, `core-visual-a11y`, `ai-commander`, `board-view`, `hot-seat` зелёные.
```bash
pnpm --filter @bga/web exec vitest run src/games/rebellion/core-v1/panels src/games/rebellion/core-v1/sidebar src/games/rebellion/core-v1/top-bar/CoreGameInfoPanel.tsx
pnpm e2e -- e2e/core-turn.spec.ts e2e/keyboard.spec.ts e2e/core-visual-a11y.spec.ts e2e/ai-commander.spec.ts e2e/board-view.spec.ts
```

### MF — Unit Manifest и инспектор (frontend-worker, UI+State; после F)

OWNED FILES: `core-v1/manifest/**` (`UnitInspector.tsx`, новые `UnitManifest.tsx`, `ManifestSheet.tsx`, `ForceMarkerList.tsx`,
`manifestModel.ts` + тесты); `core-v1/panels/{CoreContextPanel,CoreSystemPanel,HiddenZonePanel,LeaderPanel}.tsx` (+ новые тесты);
`games/rebellion/locales/{ru,en}/manifest.json`.

Работа: модель `manifestModel.ts` (§3.3) поверх `forces.ts`; `UnitInspector`: если `ui.manifest` совпадает с текущим выбором
(система или зона) — `UnitManifest`, иначе `CoreContextPanel` (`core-context-panel`); `CoreSystemPanel` (`system-panel`) показывает
DOM-маркеры групп системы (`ForceMarkerList` → `CounterMarker`, testid `map-marker-<systemId>-<side>-<arena>`, `aria-pressed`) — это
**клавиатурный путь** к манифесту (QD-2: «Объекты» → система → Tab на маркер → Enter); `HiddenZonePanel` (`hidden-zone-panel[data-count]`)
— то же для зоны (`map-marker-zone-rebels-<arena>`). `UnitManifest` (`unit-manifest`): система, регион, чипы фракций, группы сторона ×
арена со строками «тип × N» (plural i18n), лидеры, итог; состояния fleet / fleetGround / both / leader / empty / restricted; выбранная группа —
amber кромка; «Закрыть» (`unit-manifest-close`) → `closeManifest()`, фокус возвращается на вызвавший маркер/панель системы.
`< 760 px` — `ManifestSheet` (fixed bottom, свернут 56 px / открыт `min(70vh, 620px)`, `unit-manifest-sheet-toggle[aria-expanded]` 48 px,
`unit-manifest[data-variant="sheet"]`), монтируется только когда манифест открыт; Esc закрывает; без фокус-ловушки (не модальный).
Без «силы армии» и демо-текстов.

Контракты: testids `core-context-panel`, `system-panel[data-system-id]`, `system-panel-activate|contested|not-target`, `leader-panel`,
`unit-panel`, `hidden-zone-panel[data-count]`; модель не читает ничего, кроме `view` и `ui.manifest`.

Тесты: `manifestModel.test.ts` — 6 состояний на фикстурах; инвариант скрытой информации (§3.5); `UnitManifest.test.tsx` (рендер всех
состояний, выделение группы, Закрыть, plural ru/en, зона без имён систем/регионов в `textContent` и атрибутах), `ManifestSheet.test.tsx`
(variant sheet при `<760`, toggle), `CoreSystemPanel.test.tsx` (маркеры = оракул, Enter открывает манифест; при взятом лидере маркер не
открывает манифест — QD-5).

DONE WHEN: тесты зелёные; e2e `core-hidden-base`, `selection`, `hot-seat`, `settings` (en без кириллицы в `core-context-panel`) зелёные.
```bash
pnpm --filter @bga/web exec vitest run src/games/rebellion/core-v1/manifest src/games/rebellion/core-v1/panels
pnpm e2e -- e2e/core-hidden-base.spec.ts e2e/selection.spec.ts e2e/hot-seat.spec.ts e2e/settings.spec.ts
```

### N — Navigation и платформа (frontend-worker, UI; после F)

OWNED FILES: `apps/web/src/app/layout/**`, `apps/web/src/app/pages/**`, `apps/web/src/platform/{catalog,game-page,new-session,session-host,ui}/**`,
`apps/web/src/shared/ui/{ChoiceGroup,MockBadge,VisuallyHidden}.tsx` + `ChoiceGroup.test.tsx`, `apps/web/src/shared/feedback/FeedbackHost.tsx` +
тест, `apps/web/src/games/rebellion/setup/**`, `apps/web/src/games/rebellion/table/components/HandoffScreen.tsx` +
`games/rebellion/table/HandoffScreen.test.tsx`, `apps/web/src/locales/{ru,en}/*.json`, `games/rebellion/locales/{ru,en}/{setup,common}.json`.

Работа (A-2: структура экранов прежняя): terminal-шапка платформы (`app-header`, `nav-catalog`, `nav-settings`, `MockBadge` amber), каталог и
карточки (рамки/бейджи), страница игры, форма настройки (карточки фракций в новых цветах A-5, `ChoiceGroup` — selected amber), настройки
(Switch/Select из темы), 404 (`not-found`), «партия не найдена», загрузка/ошибки `SessionHost`, заслонка hot-seat (`handoff-*`, стол скрыт
полностью, фокус на заголовке). Skip-link `#main`, `RouteFocus` — без изменений поведения.

Контракты: все testids TR-1/SWR-004 (§5.1), роли radio/radiogroup, `aria-busy`, `routePatterns`/`paths`; `router.tsx` — **не** у N.

DONE WHEN: тесты `src/app`, `src/platform`, `src/shared/ui`, `src/games/rebellion/setup`, `HandoffScreen.test.tsx`, `shared/i18n/locales.test.ts`
зелёные; e2e `catalog`, `game-page`, `game-setup`, `new-game`, `settings`, `hot-seat`, `session-list`, `visual-a11y`, `smoke`, `00-empty-db` зелёные.
```bash
pnpm --filter @bga/web exec vitest run src/app src/platform src/shared src/games/rebellion/setup src/games/rebellion/table/HandoffScreen.test.tsx
pnpm e2e -- e2e/catalog.spec.ts e2e/game-page.spec.ts e2e/game-setup.spec.ts e2e/new-game.spec.ts e2e/settings.spec.ts e2e/hot-seat.spec.ts e2e/session-list.spec.ts e2e/visual-a11y.spec.ts e2e/smoke.spec.ts
```

### S — dev-only витрина UI Kit `/dev/ui-kit` (frontend-worker; после F, параллельно)

Решение: **да** (A-7) — дешёвая и нужна для пары скриншотов UI Kit (AC-15: клавиши/LED/статусы/диалог/журнал/маркеры/легенда) без
поиска состояний в живой партии.

OWNED FILES: `apps/web/src/dev/ui-kit/**` (`route.tsx`, `UiKitPage.tsx`, `i18n.ts`, `locales/{ru,en}.json`, тесты), `apps/web/src/app/router.tsx`
(только массив `devRoutes`), `apps/web/src/app/router.test.tsx` (если нужен кейс маршрута), `scripts/check-web-bundle.mjs`,
`scripts/check-web-bundle.test.mjs`.

Исключение из production — как `/dev/ai`: маршрут добавляется в тот же литеральный тернарник `import.meta.env.DEV ? [...] : []`
(`lazy: () => import('@/dev/ui-kit/route')`), строки — в собственном рантайм-неймспейсе (`registerUiKitI18n`, как `registerDevAiI18n`).
`check:bundle` уже падает на любом модуле `apps/web/src/dev/**` в сорсмапах; S добавляет статические правила `dev-ui-kit-path`
(`/\/dev\/ui-kit\b/`) и `dev-ui-kit-testid` (`/\bui-kit-[a-z]/`) + тесты в `check-web-bundle.test.mjs`. Витрина показывает только компоненты
UI Kit с нейтральными подписями из своего i18n (без игровых названий, «DEMO», «SECTOR SCAN» и т. п.).

DONE WHEN: `node --test "scripts/*.test.mjs"` зелёный; `pnpm build && pnpm check:bundle` — exit 0 и в выводе `0 apps/web/src/dev modules`;
страница открывается на dev-сервере (ручной скриншот).

### E2E-SYNC (qa-worker под qa-lead; после M/C1/C2/MF, до INTEGRATION-прогона)

OWNED FILES: `e2e/**`. Правки по §5.2 и новые спеки из `test-cases.md`. FE-воркеры `e2e/**` не трогают.

### INTEGRATION (frontend-lead)

Сборка частей, решения по запросам воркеров на замороженные файлы, `pnpm verify` (лог в `artifacts/logs/`), grep AC-16, ручная проверка
адаптива. Изменения лида фиксируются в Implementation log.

## 3. Контракты данных (только `PlayerViewCore` и `automation.lastRun`)

### 3.1 `core-v1/model/forces.ts` (F)

```ts
export type Arena = 'space' | 'ground';                     // QD-4: всё, что не 'space', — 'ground'
export interface TypeCount { typeKey: string; count: number }
export interface ForceGroup { owner: FactionId; arena: Arena; count: number; unitIds: string[]; types: TypeCount[] }
export interface ForceSet { groups: ForceGroup[]; leaders: Array<{ id: string; owner: FactionId }> }  // groups: empire/space, empire/ground, rebels/space, rebels/ground; пустые не включаются
export function arenaOf(view, typeKey): Arena                // unitTypes[].arena; неизвестный тип → 'ground' (как сейчас unitShape)
export function forcesBySystem(view): ReadonlyMap<string, ForceSet>   // ТОЛЬКО units/leaders с location.kind === 'system'
export function zoneForces(view): ForceSet | null            // ТОЛЬКО hiddenZone(view) (сервер скрывает базу), иначе null
export function sideTotals(set: ForceSet): Array<{ owner; units; leaders }>  // для compact LOD
```

### 3.2 `core-v1/model/aiRecent.ts` (F)

`aiRecentMarks(lastRun: AutomationLastRun | null, view): { systemIds: string[]; zone: boolean }` — `null`, если не AI-партия или нет
`lastRun` (QD-3). События парсятся `PlayerEventSchema.safeParse`, берутся только `actor === aiSideOf(view.settings)`; системы: `SYSTEM_ACTIVATED.payload.systemId`,
`PIECES_MOVED.payload.fromSystemId/toSystemId`, `BASE_REVEALED.payload.systemId`; `null` → `zone = true` (только если `hiddenZone(view)`);
в итог — только id из `view.map.systems`; порядок первого появления (для «AI · 01/02»). Время жизни = жизни `lastRun` (заменяется прогоном
с `steps > 0`, очищается командой игрока с `steps === 0`) — совпадает со сводкой хода AI (A-6). Новое состояние не вводится.

### 3.3 `core-v1/model/mapStats.ts` (F) и Unit Manifest model (MF)

`mapStats(map) → { systems, routes, regions }` (routes — неориентированные пары `adjacentSystemIds`, ожидаемо 32/69/8).

`manifestModel.ts` (MF):
```ts
type ManifestTarget = { kind: 'system'; systemId: string } | { kind: 'zone' };
type ManifestState = 'fleet' | 'fleetGround' | 'both' | 'leader' | 'empty' | 'restricted';
interface ManifestVm {
  target: ManifestTarget; state: ManifestState;
  systemNameKey?: string; regionNameKey?: string;            // только kind 'system'
  factions: FactionId[]; groups: ForceGroup[]; leaders: …; total: number;   // total = число юнитов (лидеры отдельно)
  selectedGroup: { owner; arena } | null; isBase: boolean;  // isBase только из visibleRebelBaseSystemId
}
```
Правила состояний: `restricted` ⇔ `kind === 'zone'`; иначе `empty` (нет юнитов и лидеров), `leader` (только лидеры), `both` (юниты обеих
сторон), `fleetGround` (одна сторона, обе арены), `fleet` (одна сторона, одна арена — флот **или** только наземные; `data-state` различает
через `data-arenas`).

### 3.4 UI-состояние (`coreUiStore`, F)

```ts
manifest: { target: ManifestTarget; group: { owner: FactionId; arena: Arena | 'all' } | null } | null;
openManifest(target, group?): void;  closeManifest(): void;
```
`reconcile(view)` сбрасывает `manifest`, если цель исчезла (система нет в `view.map`, зона — `hiddenZone(view) === null`). Открытие
манифеста всегда сопровождается выбором той же системы/зоны в `selectionStore` (делает вызывающий: M — по клику маркера, MF — по DOM-маркеру);
`UnitInspector` показывает манифест только при совпадении `manifest.target` с `selection` — смена выбора автоматически возвращает к
обычной панели без межстора-синхронизации. `reset()` очищает.

### 3.5 Скрытая информация (AC-8, RK-2)

- Источник один — серверный `PlayerView`. У Империи до раскрытия юниты/лидеры базы имеют `location: {kind: 'rebelBase'}`,
  `rebelBase.systemId = null`, в событиях система базы `null`.
- `forcesBySystem` берёт **только** `location.kind === 'system'` → юниты базы никогда не попадают в маркеры/манифест какой-либо системы;
  они видны только в `zoneForces` → маркеры зоны и манифест `restricted` («Доступ ограничен · местоположение базы неизвестно»).
- Ничего не вычисляет систему базы: в web не используются `eligibleRebelBaseSystemIds`/`baseIneligibleSystemIds`, смежность для зоны,
  разности «до/после», `log`-эвристики (QD-3). AI-отметки берут только ненулевые id из **редактированных** событий; `null` → зона.
- Манифест зоны и маркеры зоны не содержат `data-system-id`, имён систем/регионов, `aria` с системой; `isBase` и маркер базы — только из
  `visibleRebelBaseSystemId(view)` (не-null лишь когда сервер прислал).
- Unit-тесты (F, MF, M): на `empireRedactedView` (a) `forcesBySystem(view)` ≡ `forcesBySystem(view без юнитов/лидеров rebelBase)`;
  (b) манифест каждой из 32 систем одинаков в этих двух видах; (c) `JSON.stringify` модели зоны не содержит ключа `systemId` и ни одного
  id/`nameKey` систем и регионов; (d) рендер `UnitManifest` зоны — `textContent`/атрибуты без имён 32 систем и 8 регионов (ru и en);
  (e) новые методы debug-API не возвращают систему базы. `pnpm check:bundle` и e2e `core-hidden-base` — зелёные.

## 4. Компоновка CoreTable как консоли

Корень `game-table` — CSS grid; DOM-порядок = порядок Tab: sr-only h1 → skip-ссылки → `console-header` → `table-top-bar` (status) →
`map-housing` (overlay = `OutcomeBanner`) → `core-sidebar` (rail: `turn-panel` → `turn-controls` → `UnitInspector` → вкладки) →
`console-footer`. `AutomationNotice` остаётся в `SessionHost` над столом (как SWR-006 D-1).

| Ширина | Сетка | Rail | Высота / прокрутка |
|---|---|---|---|
| ≥ 1400 | padding 18, gap 7; строки `42 / auto(≈86) / minmax(0,1fr) / auto(≈36)`; колонки `minmax(0,1fr) 530px` | ряды rail: ход `minmax(0,max-content)` (max 42 %), клавиши `auto`, инспектор `minmax(0,max-content)` (max 32 %), вкладки `minmax(160px,1fr)` | `100dvh`, страница не скроллится, модули rail — внутренний скролл |
| 1200–1399 | то же, колонки `minmax(0,1fr) 440px` | клавиши 3 в ряд | то же |
| 900–1199 | padding 10, строки `38 / auto / 1fr / auto`; колонки `minmax(0,1fr) 340px`; status bar переносится в 2 ряда (flex-wrap, без пересечений) | клавиши: 2 колонки, `finish-activation` на всю ширину | то же |
| 760–899 | одна колонка: header · status (2 колонки) · housing `max(400px, 65vh)` · rail (поток) · footer | клавиши `position: sticky; bottom: 0` внутри rail; журнал max 220 px; манифест — в rail | вертикальная прокрутка страницы, горизонтальной нет |
| < 760 | как 760–899, padding 7; status 1–2 колонки; цели касания ≥ 44 px | манифест — **нижний лист** `ManifestSheet` (MF) | то же |

Сохраняется всё из `ux-inventory` §4.13: кто ходит, время/репутация/фаза текстом, клавиши хода в одном месте (rail), подтверждение паса,
подсветка целей, признаки не только цветом, заслонка hot-seat, скрытая зона, «ИИ думает…» + блокировка + «Продолжить ход AI», сводка и
метки AI, журнал, клавиатурные пути и skip-ссылки, автосохранение и «← К игре», пометка среза правил, «вписать карту».

Testids, меняющие родителя (id те же): `session-back-to-game`, `session-settings` — из `table-top-bar` в `console-header`;
`prototype-badge` — из шапки в `console-footer`; `finish-activation`, `pass-turn`, `turn-controls` — из шапки (`top-bar-controls`) в rail;
`zoom-in/out/fit/level` — из оверлея канваса в нижнюю полосу `map-housing`; `map-legend` — из вкладки «Партия» в `map-housing`;
`core-context-panel` — внутри `UnitInspector`. Удаляется только обёртка `top-bar-controls` (ни один спек её не использует).
Debug-API карты сохраняет контракт (§5.3).

## 5. Влияние на e2e и новые testids

### 5.1 Сохраняются без изменений

Все id из `e2e/support/testids.ts`, кроме `topBarControls`. Роли/aria: `board-canvas` region, `leader-pool` radiogroup, `board-list` listbox,
`turn-controls` group, вкладки `tab`/`tabpanel`, `aria-live` фидбэк, `game-over-banner` фокус.

### 5.2 Спеки, которые могут потребовать правки (E2E-SYNC)

| Спек | Почему |
|---|---|
| `support/testids.ts` | удалить `topBarControls`; добавить новые id §5.4 |
| `support/board.ts` | типы новых методов `__boardDebug`; `emptyCoreCanvasPoint`: маркеры уже учтены через `getPieceScreenPos` (каждый юнит → центр своего маркера), добавить `getGroupMarkers` в «занятые» для надёжности |
| `core-visual-a11y.spec.ts`, `visual-a11y.spec.ts` | новая палитра/шрифт (контраст текста), `table-top-bar` без клавиш хода (проверки «не обрезано» по id остаются), скриншоты SWR-005 не переписывать |
| `board-view.spec.ts` | легенда видна и без вкладки «Партия» — кейс остаётся зелёным, комментарий обновить |
| `core-turn.spec.ts`, `screenshots.spec.ts`, `core-visual-a11y` TC-VA-02 | drag через `dbg.piecePos`: при своей активации позиция = ручка юнита (контракт сохранён); если QA увидит нестабильность — помощник `zoomToDetailAround` без изменений |
| `selection.spec.ts`, `zoom-pan.spec.ts` | клик «в пустое место» не должен попадать в маркер — см. `support/board.ts`; зум-кнопки вне канваса |
| `core-hidden-base.spec.ts` | расширить: манифест зоны (`unit-manifest[data-zone="hidden"]`), маркеры зоны, AI-отметки без базы |
| `core-fit.spec.ts` | ширина подписей PT Mono (пересчёт `LABEL_CHAR_EM`) — ожидается зелёным, риск R-4 |

### 5.3 Debug-API (`__boardDebug`, только `DEV || VITE_E2E === '1'`)

Существующие методы — без изменения сигнатур. Уточнение смысла `getPieceScreenPos(id)`: detail LOD — ручка юнита, если он в
`MOVE_PIECES` своей активации, иначе центр маркера его группы; compact — маркер стороны; зона — маркер группы зоны. Новые (необязательные
в типе, как предложила QA): `getGroupMarkers(): { systemId: string | null; side; arena: 'space' | 'ground' | 'all'; count; screen: Point }[]`
(`systemId: null` = зона), `getAiRecentSystemIds(): string[]`, `getRouteCount(): number`, `getRegionCount(): number`. Для Империи до раскрытия
ни один не возвращает систему базы.

### 5.4 Новые testids (сверено с `test-cases.md` «Testability requirements»)

| testid | Где / атрибуты | Подзадача |
|---|---|---|
| `console-header`, `console-footer` | каркас консоли | C1 |
| `table-top-bar` (= status bar, QA-имя `console-status-bar` **не вводим** — один элемент, существующий id) | | C1 |
| `core-sidebar` (= rail, QA-имя `console-rail` не вводим) | | C2 |
| `ai-commander-led` | `data-state` idle/thinking/stalled/over | C1 |
| `turn-activate` | клавиша «Активировать систему» | C2 |
| `log-entry-<seq>` + `data-time` | ISO из `event.at` | C2 |
| `map-housing`, `map-display-header` | `data-systems`, `data-routes`, `data-regions`, `data-zoom` | M |
| `map-system-<id>` + `data-ai-recent`, `data-markers` (`"rebels:space:2,empire:ground:1"`); `map-hidden-zone` + `data-ai-recent`, `data-markers` | зеркало `core-map-state` | M |
| `map-marker-<systemId>-<side>-<arena>` / `map-marker-zone-rebels-<arena>` | DOM-кнопки в панели системы/зоны, `aria-pressed`, `data-count` | MF |
| `unit-manifest` | `data-system-id` или `data-zone="hidden"`, `data-restricted`, `data-state`, `data-total`, `data-variant` rail/sheet | MF |
| `unit-manifest-group-<side>-<arena>` (`data-count`, `data-selected`), `unit-manifest-row-<side>-<typeKey>` (`data-count`), `unit-manifest-leader-<leaderId>`, `unit-manifest-total`, `unit-manifest-close`, `unit-manifest-sheet-toggle` (`aria-expanded`) | | MF |
| `ui-kit-*` | только `/dev/ui-kit` (запрещены в production-бандле) | S |

Отличие от предложения QA: строка манифеста — `unit-manifest-row-<side>-<typeKey>` (тип может быть у одной стороны, но side в id делает
его однозначным при «обеих фракциях»).

## 6. Покрытие AC

| AC | Подзадачи |
|---|---|
| AC-2 | F (единственная зависимость — шрифт), M (нет растра, TC-ST-05), INTEGRATION (diff `package.json`) |
| AC-3 | F |
| AC-4 | M |
| AC-5 | M (`systemMarks`) |
| AC-6 | M (маркеры на карте), MF (DOM-маркеры = клавиатурный путь, QD-2), F (`forces.ts`) |
| AC-7 | MF (+ F `coreUiStore.manifest`) |
| AC-8 | F (`forces`/`aiRecent` тесты), MF (манифест зоны), M (маркеры/отметки/debug), S (`check:bundle`) |
| AC-9 | C1 (каркас, status, footer), C2 (rail), M (housing) |
| AC-10 | C1, C2, M (drag, зум), MF; E2E-SYNC + INTEGRATION (все e2e) |
| AC-11 | C1 (LED, notice), C2 (сводка, журнал), F (`aiRecent`), M (отметки на карте) |
| AC-12 | N |
| AC-13 | C1 (сетка §4), MF (нижний лист), N (страницы платформы), C2 (sticky клавиши) |
| AC-14 | F (состояния через тему), C2 (лидеры, вкладки, строки «Объекты», клавиши), M (маркеры, зум), MF (маркеры-кнопки, Закрыть) |
| AC-15 | S (витрина) + QA (скриншоты; спек сверки вне `verify`, QD-6) |
| AC-16 | все; INTEGRATION — grep `DEMO\|SECTOR SCAN\|DESIGN ITERATION\|16:47\|Корусант 6` по `apps/web/src` (без `*.test.*`) + hex-grep TC-TK-02 |

AC-1 — Analyst (выполнено), AC-17/AC-18 — INTEGRATION/QA/Analyst.

## Dependency graph

```text
F (Foundation: tokens, theme, UI Kit, font, game tokens, K-5/K-6 models, K-7 skeleton + stubs)
 ├─► M  (Vector Map)          ─┐
 ├─► C1 (Console shell)        │
 ├─► C2 (Console rail)         ├─► E2E-SYNC (QA) ─► INTEGRATION (lead: pnpm verify) ─► CODE_REVIEW ‖ … ─► QA_EXECUTION
 ├─► MF (Unit Manifest)        │
 ├─► N  (Navigation)           │
 └─► S  (dev /dev/ui-kit)     ─┘
```
OWNED FILES параллельных M/C1/C2/MF/N/S попарно не пересекаются (проверено по спискам §2; общие точки — только чтение и контракты K-*).

## 7. Риски и вопросы

Риски (с решением лида):
- R-1 Drag-ручки (§2 M п.5) — отклонение от «только счётчики»; без них ломается drag одиночного юнита (AC-10) и `core-turn`.
- R-2 Клавиши хода в rail: на `<900` они под картой (как в утверждённом макете), смягчено sticky внутри rail; раньше были в шапке.
- R-3 Синтезированный bold PT Mono (PA-1) может слегка отличаться от макета в Chromium/Safari — расхождение класса «косметика» для AC-15.
- R-4 Метрики PT Mono меняют ширину подписей → `core-fit`/`labelLayout`; M пересчитывает константы.
- R-5 Общий рабочий дерево у параллельных воркеров → транзитные падения typecheck; worktree или сквозные проверки только у лида.
- R-6 Новая палитра — регресс контраста в e2e a11y → `textPairs`-тест + ранний прогон a11y-спеков в F.

Assumptions: PA-1 (400 + синтез bold); PA-2 `save-status` один (status bar), в footer без дубля; PA-3 легенда только в housing;
PA-4 «Активировать систему» — новая клавиша `turn-activate`, picker (`activation-*`) сохраняется для клавиатуры; PA-5 зона базы рисуется
маркерами групп, а не слотами.

Open questions для Analyst (не блокируют старт F):
- OQ-1 AC-16 grep: исключить `apps/web/src/dev/**` (витрина UI Kit с нейтральными примерами) из области «нет захардкоженных счётчиков»?
- OQ-2 Принять R-1 (drag-ручки юнитов поверх счётчиков во время своей активации) как часть дизайна карты?
- OQ-3 Принять R-2 (на мобильном клавиши хода в rail под картой, sticky), а не в шапке?

## Analyst decisions on OQ (2026-11-21)

- OQ-1: да — `apps/web/src/dev/**` исключается из grep AC-16 «нет захардкоженных счётчиков» (dev-модули не попадают в бандл, это проверяет `check:bundle`); запрет строк `DEMO`/`SECTOR SCAN`/`DESIGN ITERATION` действует и для витрины.
- OQ-2: принято (R-1) — drag-ручки одиночных юнитов во время своей активации; счётчики групп остаются честными.
- OQ-3: принято (R-2) — на < 900 клавиши хода в rail, sticky; раньше шапка тоже уезжала при прокрутке, поэтому доступность не хуже.
- Рабочее дерево: одно общее (worktree потребовали бы отдельной установки зависимостей и слияния). e2e используют фиксированные порты 3100/5174,
  поэтому **воркеры e2e не запускают** (кроме F до старта параллельной волны); e2e по зонам гоняет лид на INTEGRATION. Воркеры: unit своей
  зоны + eslint/prettier своих файлов; сквозной typecheck — информативно.

## Implementation log (filled by workers)
| Subtask | Changed files | Tests run (command → result) | Limitations |
|---|---|---|---|
| F (frontend-worker, 2026-11-21) | `apps/web/package.json` + `pnpm-lock.yaml` (только `@fontsource/pt-mono@5.3.0`), `src/main.tsx`; новые `shared/theme/{tokens,contrast,breakpoints,index}.ts` + `tokens.test.ts`; `app/theme/{createAppTheme.ts,createAppTheme.test.tsx,tokens.ts,mui-augment.d.ts}`; новые `shared/ui/terminal/*` (TerminalModule, Led+ledColors, StatusBadge, StatusCard, KeyButton, Readout, UnitGlyph, CounterMarker, LegendKey, ScanlineOverlay, index, renderKit (test helper) + 10 `*.test.tsx`), `shared/ui/index.ts`; `packages/games/rebellion/src/assets/{tokens,index,cover}.ts`; новые `games/rebellion/theme/{glyphs,glyphs.test,mapStyle}.ts`, `games/rebellion/ui/ForceGlyph.tsx` + тест; новые `core-v1/model/{forces,aiRecent,mapStats}.ts` + тесты, `core-v1/model/coreUiStore.ts` + тест (manifest); `games/rebellion/test/coreFixtures.ts` (`withUnits`, `empireRedactedView`, `aiRunEventsRedacted`, `withLastRun`); скелет K-7: `core-v1/CoreTable.tsx` + тест, `top-bar/CoreTopBar.tsx` + тест, `sidebar/CoreSidebar.tsx`, `top-bar/CoreGameInfoPanel.tsx`, `sidebar/CoreEventLog.test.tsx`, новые `canvas/MapHousing.tsx`, `manifest/UnitInspector.tsx`; `locales/{ru,en}/manifest.json` = `{}`; `locales.i18n.test.ts` (`rebellion.manifest` + `MAY_BE_EMPTY`) | `pnpm --filter @bga/web exec vitest run <зона F>` → 49 files / 375 passed (`logs/F-web-vitest-owned.log`); весь web: `pnpm --filter @bga/web exec vitest run` → 738 passed, **1 failed** `src/dev/ai/DevAiPage.test.tsx` D-3 (ожидает «не mono» шрифт у плейсхолдеров — противоречит единственному PT Mono; файл не F) (`logs/F-web-vitest.log`); `pnpm --filter @bga/game-rebellion test` → 875 passed (`logs/F-game-rebellion-test.log`); `pnpm typecheck` → exit 0 (`logs/F-typecheck.log`); `pnpm lint` → exit 0 (`logs/F-lint.log`); `pnpm e2e -- <4 спека>` — из-за `--` Playwright прогнал **весь** набор: 139 passed, exit 0 (`logs/F-e2e.log`) | DevAiPage D-3 требует решения лида (правка вне F); прогон e2e переписал скриншоты `docs/tasks/SWR-006/artifacts/screenshots/*` (их пишет `ai-commander.spec`); `rebellion.manifest` пустой — убрать из `MAY_BE_EMPTY` после MF; легенда в `MapHousing` на ≥900 px — блок max 140 px со скроллом (рестайл — M); `BASE_REVEALED` (actor `system`) не даёт AI-отметку (правило «только actor = AI»); 32/69/8 в unit-тестах `mapStats` не проверяются (реальная карта в web-тестах недоступна, только через e2e/M) |
| S (frontend-worker, 2026-11-21) | новые `apps/web/src/dev/ui-kit/{route.tsx,UiKitPage.tsx,i18n.ts,locales/{ru,en}.json,UiKitPage.test.tsx,route.test.tsx}`; `apps/web/src/app/router.tsx` (только `devRoutes`: `/dev/ui-kit`, lazy, тот же тернарник `import.meta.env.DEV`); `scripts/check-web-bundle.mjs` (правила `dev-ui-kit-path`, `dev-ui-kit-testid`) + `scripts/check-web-bundle.test.mjs`; `apps/web/src/dev/ai/DevAiPage.test.tsx` (только D-3: плейсхолдер = шрифт темы `tokens.fontFamily`, не стек `code` (нет Menlo/Consolas), курсив) | `node --test "scripts/*.test.mjs"` → 449 passed, exit 0 (`logs/S-scripts-test.log`); `pnpm --filter @bga/web exec vitest run src/dev src/app/router.test.tsx` → 11 files / 100 passed, exit 0 (`logs/S-vitest.log`, финальный прогон); eslint + prettier --check своих файлов → exit 0 (`logs/S-lint.log`); `tsc -b` → в своих файлах 0 ошибок, 24 ошибки в чужих незавершённых файлах core-v1 (`logs/S-typecheck.log`); `pnpm --filter @bga/web build` → **failed** дважды из-за чужих файлов (`geometry/constants.ts` без `CHIP_*`, `sceneModel.ts`, `CoreTopBar` и др.; `logs/S-build.log`); `pnpm check:bundle` → exit 2: статический скан по **старому** `apps/web/dist` OK, сборка с сорсмапами упала на тех же MISSING_EXPORT (`logs/S-check-bundle.log`) — `0 apps/web/src/dev modules` **not_run** | Проверку бандла (`build` + `check:bundle`) повторить на INTEGRATION после M/C1; ручной скриншот `/dev/ui-kit` не снят (dev-сервер 5180 не был запущен); состояния hover/pressed закреплены `sx` из токенов `key.hover`/`key.pressed`, focus — классом `Mui-focusVisible` (кольцо из темы); диалог — встроенный образец (стиль paper из `theme.components.MuiDialog`) + настоящий `Dialog` по клавише «Открыть диалог» |
| N (frontend-worker, 2026-11-21) | новые `platform/ui/{TerminalPanel,MessagePanel}.tsx` + `MessagePanel.test.tsx`; `app/layout/{AppHeader,AppLayout,PageFallback,RouteError}.tsx`, `app/pages/{NotFoundPage,SettingsPage}.tsx`; `platform/catalog/{CatalogPage,GameCard}.tsx`; `platform/game-page/{GameHero,GameNotFound,GamePage,RecentSessions}.tsx`; `platform/new-session/NewSessionPage.tsx`; `platform/session-host/{SessionHost,SessionLoading,SessionMessage,SessionNotFound,SessionUnsupported}.tsx`; `platform/ui/{GameStatusChip,SessionStatusChip}.tsx`; `shared/ui/{ChoiceGroup,MockBadge}.tsx`; `shared/feedback/FeedbackHost.tsx` + тест; `games/rebellion/setup/SetupScreen.tsx`, `setup/components/StepHeading.tsx`; `games/rebellion/table/components/HandoffScreen.tsx`; локали `locales/{ru,en}/common.json` (`terminal.{code404,fault,unavailable}`), `games/rebellion/locales/{ru,en}/common.json` (`handoff.status`) | `pnpm --filter @bga/web exec vitest run src/app src/platform src/shared src/games/rebellion/setup src/games/rebellion/table/HandoffScreen.test.tsx` → 38 files passed, 276 tests passed, **1 failed** `src/platform/automation/AutomationNotice.test.tsx` (файл C1, WIP `noticeLayout.ts`; не N) (`logs/N-web-vitest.log`); `vitest run src/games/rebellion/locales.i18n.test.ts` → 30 passed; eslint `--max-warnings=0` + `prettier --check` по файлам N → exit 0 / exit 0 (`logs/N-lint-format.log`); `pnpm --filter @bga/web typecheck` → exit 1, 60 ошибок только в `core-v1/canvas|geometry` (WIP M), в файлах N — 0 (`logs/N-web-typecheck.log`); e2e — not_run (по брифу) | визуальная сверка в браузере не выполнялась (dev-сервер 5180 не был поднят); структура экранов и все testids/роли сохранены, но e2e-ожидания вида «h1 = h4/h5» не проверялись; `MessagePanel`/`TerminalPanel` в `platform/ui` — экраны `games/*` (setup, handoff) рамку модуля повторяют inline из `terminalTokens` (импорт внутренностей платформы из игры не делали) |
| C2 (frontend-worker, 2026-11-21) | `core-v1/panels/{TurnPanel,TurnControls,LeaderPool,ActivationPicker,MovePanel,MoveSourceFieldset,PassConfirmDialog,AiTurnSummary}.tsx`; тесты `panels/{TurnPanel,TurnControls,LeaderPool}.test.tsx`; `core-v1/sidebar/{CoreSidebar,CoreEventLog,CoreBoardList}.tsx` + `CoreEventLog.test.tsx`, `CoreBoardList.test.tsx`; `core-v1/top-bar/CoreGameInfoPanel.tsx`; `games/rebellion/locales/{ru,en}/turn.json` (новые `panel.label`, `panel.task.*`, `panel.led.*`, `pool.count`, `controls.activate`, `controls.activateHint`; `controls.pass` → «Пасовать»; удалён `panel.title`). `useTurnCommands.ts`, `coreLogMessage.ts`, `board.json` — без изменений | `pnpm --filter @bga/web exec vitest run src/games/rebellion/core-v1/panels src/games/rebellion/core-v1/sidebar` → 10 files, 85 passed (`logs/C2-vitest.log`); соседние (информативно) `locales.i18n.test.ts` + `CoreTable.test.tsx` passed, `manifest/UnitManifest.test.tsx` 1 failed — WIP MF (`logs/C2-vitest-neighbours.log`); eslint `--max-warnings=0` + `prettier --check` по файлам C2 → чисто; `pnpm --filter @bga/web typecheck` → exit 1, 41 ошибка только в `core-v1/canvas|geometry|hooks` (WIP M), в файлах C2 — 0 (`logs/C2-typecheck.log`); e2e — not_run (по брифу) | визуальная сверка в браузере не выполнялась (5180 не поднят); заголовок модуля «ВАША ЗАДАЧА · <фаза>» — h2 `TerminalModule`, цель фокуса `core-turn-title` — `span[tabindex=-1]` внутри h2; `turn-activate` работает только для выбранной **системы** (зона не цель `ACTIVATE_SYSTEM`); ряд клавиш sticky < 900 зависит от того, что C1 не ставит `overflow` на предков rail; градиент AI-строки журнала может влиять на e2e-контраст (`expectTextContrastDeep`) — проверить на INTEGRATION **Fix round 1 (2026-11-21):** `CoreSidebar.tsx` — `aside[data-manifest-open]` (правило `UnitInspector`: запрос манифеста = выбор и лидер не взят; `requestMatchesSelection` только чтение); при открытом манифесте ≥ 900 строки rail `fit-content(252px) auto minmax(150px, 1fr) minmax(84px, 0.3fr)` (ход ≤ 252 px — задача + статус + LED + 2 ряда пула; манифест забирает остаток, `unit-manifest` растянут на строку и скроллится своим телом; вкладки — полоска), < 900 `unit-manifest` max 60vh; `TurnPanel` gap 10→8 px; новый `sidebar/CoreSidebar.test.tsx`. Браузер dev-5180, 1440×900: idle — пул 4 лидера без обрезки (ход 307 px, без скролла); манифест Мандалор — строки `252/62/254/84`, пул виден целиком, манифест 254 px (было 215). 1280×800: консоль сейчас в одноколоночном режиме (дефект C1: правило `@media (min-width:760px)` в CSS после `min-width:1200px`, двухколоночная сетка не применяется) — пул виден, проверка rail в 2 колонках невозможна. Тесты `vitest run …/panels …/sidebar` → 12 files, 95 passed (`logs/C2-fix1-vitest.log`); eslint/prettier → exit 0 (`logs/C2-fix1-lint.log`); typecheck → exit 1, 1 ошибка в `geometry/labelLayout.test.ts` (M), в C2 — 0 (`logs/C2-fix1-typecheck.log`). **Fix round 2 (2026-11-21):** `CoreSidebar.tsx` — < 900 каждая вкладка ограничена (`log` 220 px, прочие `min(60vh, 480px)`, внутренний скролл; 375×812: «Объекты» 4593 → 480 px, rail ≈ 1055 px); ≥ 900 rail — flex-колонка с приоритетами вместо grid: ход `0 1 auto` (≤ 42dvh, ≥ 160 px), инспектор `0 10 auto` (≥ 48 px, ≤ 32dvh, уступает первым), вкладки `1 1 0` (≥ 132 px); манифест открыт — ход ≤ 252 px, инспектор `1 1 0` ≥ 150 px, вкладки `0.3 1 0` ≥ 84 px. `CoreBoardList.tsx` — активная опция `scrollIntoView({block:'nearest'})` (клавиатура в ограниченной панели; проверено в браузере: 40× ArrowDown — фокус в видимой области). `turn.json` `panel.yourTurn` укорочен до одной строки («Активируйте систему лидером или пасуйте.» / «Activate a system with a leader, or pass.»). Браузер (C1-сетка в 2 колонки): 1440×900 — idle с выбором 307/62/151/132, манифест 252/62/254/84; 1280×800 — idle 290/62/68/132, манифест 252/62/154/84; пул из 4 лидеров виден целиком во всех четырёх случаях, переполнения rail нет; 1024×768 — 216/110/48/132, переполнения нет, второй ряд пула внутри скролла модуля хода. Тесты `vitest run …/panels …/sidebar locales.i18n.test.ts` → 13 files, 125 passed (`logs/C2-fix2-vitest.log`); eslint/prettier → exit 0 (`logs/C2-fix2-lint.log`); `pnpm --filter @bga/web typecheck` → exit 0 (`logs/C2-fix2-typecheck.log`). **Fix round 3 (2026-11-21, QA-2):** `TurnControls.tsx` — подписи клавиш переносятся только между словами (`overflowWrap/wordBreak: normal`, `hyphens: manual` локально в `sx`, тема не тронута); < 480 px — «Активировать систему» на всю ширину, «Пасовать» + «Завершить активацию» ниже. Браузер (dev-5180, проверка Range-прямоугольников каждого слова, без ходов): 375 — клавиши 343 / 169 / 169 px, разрывов внутри слов нет; 480 — 3×145 px; 768 — 3×234; 1024 — 158/158 + 322; 1440 — 3×167; горизонтальной прокрутки нет. Тесты `vitest run …/panels …/sidebar locales.i18n.test.ts` → 13 files, 125 passed (`logs/C2-fix3-vitest.log`); eslint/prettier → exit 0 (`logs/C2-fix3-lint.log`); typecheck → exit 1, 2 ошибки только в `geometry/labelCulling.ts` (WIP M), в C2 — 0 (`logs/C2-fix3-typecheck.log`). |
| MF (frontend-worker, 2026-11-21) | новые `core-v1/manifest/{manifestModel.ts,manifestFocus.ts,InspectorHeading.tsx,ForceMarkerList.tsx,UnitManifest.tsx,ManifestSheet.tsx}` + тесты `manifest/{manifestModel.test.ts,UnitManifest.test.tsx,ManifestSheet.test.tsx}`; `manifest/UnitInspector.tsx`; `core-v1/panels/{CoreContextPanel,CoreSystemPanel,HiddenZonePanel,LeaderPanel}.tsx` + новый `panels/CoreSystemPanel.test.tsx`; `locales/{ru,en}/manifest.json` | `pnpm --filter @bga/web exec vitest run src/games/rebellion/core-v1/manifest src/games/rebellion/core-v1/panels src/games/rebellion/locales.i18n.test.ts` → 12 files / 129 passed, exit 0 (`logs/MF-vitest.log`); `eslint <свои файлы>` → exit 0, 0 problems (`logs/MF-eslint.log`); `prettier --check <свои файлы + json>` → exit 0 (`logs/MF-prettier.log`); `pnpm --filter @bga/web typecheck` → exit 1, 38 ошибок только в чужих WIP-файлах M (`geometry/*.test.ts`, `hooks/coreBoardDebugImpl.ts`), в файлах MF — 0 (`logs/MF-typecheck.log`); e2e — not_run (по правилу: e2e гоняет лид) | Манифест не показывается при взятом лидере (QD-5: инспектор отдаёт место панели системы с «Активировать»); `< 760 px` панель контекста остаётся в rail, манифест — фиксированный лист поверх; Esc закрывает лист только при фокусе внутри него; `CoreSidebar` ограничивает высоту только `core-context-panel` (25dvh), у `unit-manifest` в rail собственный `overflow-y: auto` без max-height — нужен селектор в `CoreSidebar` (C2/лид); `HiddenZonePanel` вместо поштучного списка юнитов показывает маркеры групп (+ лидеры), `data-count` прежний; `MAY_BE_EMPTY` в `locales.i18n.test.ts` всё ещё содержит `rebellion.manifest` (файл заморожен, убрать лиду); визуально в браузере не проверено (dev-сервер 5180 не был поднят) **Fix round 1 (2026-11-21):** строка региона в инспекторе/манифесте/панели системы — только имя региона (`regions.<id>` уже содержит «регион»), ключ `manifest:region` удалён из ru/en; `unit-manifest` — `overflow: hidden; max-height: 100%`, прокручивается внутренний список групп `unit-manifest-body` (работает в ограниченной ячейке rail); +1 тест. `vitest run manifest panels locales.i18n` → 12 files / 130 passed, exit 0 (`logs/MF-fix1-vitest.log`); eslint exit 0 (`logs/MF-fix1-eslint.log`); prettier exit 0 (`logs/MF-fix1-prettier.log`); `pnpm --filter @bga/web typecheck` → exit 0 (`logs/MF-fix1-typecheck.log`); в браузере (5180, реальная партия) DOM манифеста: «Салукемай / регион Мон-Каламари» без префикса — проверено через JS, скриншот не получен (вьюпорт панели перезагрузился). **Fix round 2 (2026-11-21):** компактная шапка rail-манифеста: строка «МАНИФЕСТ ЮНИТОВ» + «Закрыть» (min-height 26, на `pointer: coarse` 44), строка «⌖ имя (amber, 14 px) · регион» + чипы фракций в одной строке, паддинги 4/6 px (`InspectorHeading compact`); лист `<760` без изменений; новый testid `unit-manifest-header`. `vitest run manifest panels locales.i18n` → 12 files / 130 passed, exit 0 (`logs/MF-fix2-vitest.log`); eslint exit 0 (`logs/MF-fix2-eslint.log`); prettier exit 0 (`logs/MF-fix2-prettier.log`); `pnpm --filter @bga/web typecheck` → exit 1, 1 ошибка в чужом `geometry/labelLayout.test.ts` (M), у MF 0 (`logs/MF-fix2-typecheck.log`). Браузер 5180, 1440×900, Мандалор → `map-marker-mandalore-empire-space`: `unit-manifest` 254 px (variant rail), шапка 59 px, тело 191 px со внутренней прокруткой (контент 276 px), измерено через JS `getBoundingClientRect`. |
| C1 (frontend-worker, 2026-11-21) | `core-v1/CoreTable.tsx` + `CoreTable.test.tsx` (консольная сетка §4, порядок h1 → skip → header → status → housing → rail → footer); новые `core-v1/console/{consoleLayout.ts,consoleLayout.test.ts,ConsoleHeader.tsx,ConsoleFooter.tsx,ConsoleHeaderFooter.test.tsx}`; `core-v1/top-bar/{CoreTopBar,TurnIndicator,TimeTrack,AiCommanderStatus,OutcomeBanner}.tsx` + тесты `CoreTopBar/TimeTrack/AiCommanderStatus/OutcomeBanner.test.tsx`, новый `top-bar/statusBarModel.ts` (AI_LEDS, trackTicks/trackPercent); `table/components/{PrototypeBadge,SaveStatus}.tsx` + `PrototypeBadge.test.tsx`; `platform/automation/{AutomationNotice.tsx,AutomationNotice.test.tsx,noticeLayout.ts}`; `locales/{ru,en}/session.json` (+`console.*`), `locales/{ru,en}/match.json` (+`ai.state.*`) | `pnpm --filter @bga/web exec vitest run <5 путей C1>` → 10 files / 93 passed, exit 0 (`logs/C1-vitest.log`); соседи `vitest run src/games/rebellion/table src/platform/session-host src/games/rebellion/locales.i18n.test.ts src/games/rebellion/core-v1/sidebar` → 9 files / 134 passed (`logs/C1-vitest-neighbours.log`); eslint `--max-warnings=0` своих файлов → exit 0 (`logs/C1-eslint.log`); prettier `--check` → exit 0 (`logs/C1-prettier.log`); `pnpm --filter @bga/web typecheck` → exit 1 только из-за чужого WIP (`core-v1/geometry/*.test.ts`, `hooks/coreBoardDebugImpl.ts` — зона M), в файлах C1 ошибок нет (`logs/C1-typecheck.log`); e2e — not_run (по брифу гоняет лид) | Визуальная сверка в браузере не выполнялась (dev-сервер 5180 не был запущен) — `not_run`; высота housing на < 900 (`max(400px, 65vh)`) задаётся внутри `MapHousing` (владелец M), C1 её не меняет; `AutomationNotice` на ≥ 900 поднят до `bottom: 104` (над footer и полосой легенды/зума) — проверить e2e/скриншотами; `phase-indicator` теперь содержит только имя фазы («Приказы»), «Раунд N» — отдельная надпись над ним; `turn-indicator`: «Повстанцы · Вы» вместо «(вы)»; `prototype-badge` в footer — компактный текст «Реальная карта · правила частичные» (`data-compact="true"`), полный текст среза остаётся в «Партии» (`game-info-status`) и на заслонке hot-seat **Fix round 1 (2026-11-21):** < 760 status bar — компактная сетка 2 колонки с областями «side phase / track track / ai save» (hot-seat «track save», `table-top-bar[data-ai]`), метка стороны 22 px, имя стороны в одну строку (nowrap + ellipsis), уплотнённый AI-box; в браузере (dev 5180, 375×812) высота бара 274 → 160 px, горизонтальной прокрутки нет (`logs/C1-fix1-browser-375.log`). Карта на мобильном ~160 px — причина на стороне M: строки сетки консоли на < 900 все `auto`, housing получает свою высоту `max(400px, 65vh)` = 528 px, но внутри неё полоса легенды+зума занимает 310 px (строки housing `27px 161px 310px`). Тесты: vitest 5 путей C1 → 10 files / 94 passed (`logs/C1-fix1-vitest.log`); eslint/prettier своих файлов → exit 0 (`logs/C1-fix1-eslint.log`, `logs/C1-fix1-prettier.log`); typecheck → exit 1 только `core-v1/geometry/labelLayout.test.ts` (M), в файлах C1 ошибок нет (`logs/C1-fix1-typecheck.log`). **Fix round 2 (2026-11-21):** дефект C2 — на 1280×800 `game-table` в одну колонку: MUI `sx` заранее создаёт media-ключи брейкпоинтов темы (900/1200) и вливает наши в их порядок, поэтому open-ended `@media (min-width:760px)` выводился после 900/1200 и побеждал. `consoleGridSx()` теперь даёт базу (mobile) + непересекающиеся диапазоны `mq.between(760,900)`, `(900,1200)`, `(1200,1400)`, `mq.up(1400)` в возрастающем порядке (новый `consoleMediaKey`) — при любой ширине срабатывает ровно один, порядок вывода не важен. Тесты: порядок/возрастание ключей и «ровно один диапазон» для 11 ширин (`consoleLayout.test.ts`), CSS диапазонов на `game-table` (`CoreTable.test.tsx`); vitest 5 путей C1 → 10 files / 105 passed (`logs/C1-fix2-vitest.log`); eslint/prettier → exit 0; `pnpm --filter @bga/web typecheck` → exit 0 (`logs/C1-fix2-typecheck.log`). Браузер (dev 5180): 1440/1280/1024 — две колонки 530/440/340, ровно 100dvh, без прокрутки; 768/375 — одна колонка, без горизонтальной прокрутки (`logs/C1-fix2-browser.log`). Замечено вне C1: на < 900 rail 4.6–5.2k px (tabpanel 4593 px при 375; по плану журнал max 220 px — зона C2). **Fix round 3 (2026-11-21, review R-3):** из комментария `console/ConsoleHeader.tsx` убрана демо-строка прототипа (AC-16 grep `SECTOR SCAN` по `apps/web/src` без тестов → 0 совпадений); eslint + prettier файла → exit 0, vitest 5 путей C1 → 10 files / 105 passed (`logs/C1-fix3-lint.log`, `logs/C1-fix3-vitest.log`). **Fix round 4 (2026-11-21, QA-1):** `session-back-to-game` (иконка без подписи < 600) — `minWidth: 44` + `minHeight: 44` в `ConsoleHeader.tsx` (+ проверка в `ConsoleHeaderFooter.test.tsx`); браузер 375×812: 44×44 (было 36×44), ⚙ 44×44, без горизонтальной прокрутки (`logs/C1-fix4-browser-375.log`); vitest 5 путей C1 → 10 files / 105 passed (`logs/C1-fix4-vitest.log`); eslint/prettier → exit 0 (`logs/C1-fix4-lint.log`); typecheck см. `logs/C1-fix4-typecheck.log`. |
| M (frontend-worker, 2026-11-21) | `core-v1/canvas/`: `MapHousing.tsx` (рамка, `map-display-header` с `data-systems/routes/regions/zoom` из `mapStats`+вьюпорта, CRT-экран `map-screen` с CSS-сеткой 78 px + `ScanlineOverlay`, полоса `map-housing-bar` = `MapLegend` + `ZoomControls placement="bar"`), `CoreBoardStage.tsx` (+`aiRecentMarks(lastRun)`, клик маркера → QD-5 / `selectSystem|selectZone`+`openManifest`, зеркало `data-markers`/`data-ai-recent`, перерисовка после загрузки PT Mono, зум-кнопки убраны из канваса), новые `mapMirror.ts`, `nodes/{GroupMarkerNode,ForceGlyphShape}.tsx`, переписаны `nodes/{CoreSystemNode,LeaderBadge,UnitGlyphNode,HiddenBaseZone}.tsx`, `layers/{StaticMapLayer,InteractiveLayer,OverlayLayer}.tsx`, `CoreMapCaption.tsx`; удалён `nodes/SideCountChip.tsx`; `geometry/`: новые `markerLayout.ts`, `systemMarks.ts` (+тест), `sceneModel.ts` (markers/handles/zone markers/aiRecent/dropIllegal вместо units/overflow/chips), `constants.ts` (`LABEL_CHAR_EM` 0.6, `REGION_CHAR_EM` 0.6, подпись 12/15 px, константы маркеров/ручек), `labelLayout.ts` (смещение подписи экранно-постоянное по LOD, chip* удалены); `hooks/coreBoardDebugImpl.ts` (+`getGroupMarkers/getAiRecentSystemIds/getRouteCount/getRegionCount`, новый смысл `getPieceScreenPos`) + новый тест; `sidebar/MapLegend.tsx` (18 ключей, testids сохранены); `theme/mapStyle.ts`; `board/canvas/ZoomControls.tsx` (`placement`, по умолчанию прежнее); `locales/{ru,en}/map.json` (`housing.*`, новые `legend.*`, `marker.ai`, тексты легенды короче) | `pnpm --filter @bga/web exec vitest run src/games/rebellion/core-v1/canvas src/games/rebellion/core-v1/geometry src/games/rebellion/core-v1/hooks src/games/rebellion/board` → 12 files / 154 passed, exit 0 (`logs/M-vitest.log`); соседние `locales.i18n.test.ts`, `core-v1/sidebar`, `CoreTable.test.tsx`, `theme` → 6 files / 68 passed (`logs/M-vitest-neighbours.log`); eslint `--max-warnings=0` + prettier `--check` своих файлов → exit 0 (`logs/M-lint.log`); hex-grep `core-v1/canvas` → нет совпадений (`logs/M-hex-grep.log`); `pnpm --filter @bga/web typecheck` → exit 0 (`logs/M-typecheck.log`); e2e — not_run (по брифу гоняет лид); визуальная проверка — not_run (dev-сервер 5180 не был запущен) | 69 связей в unit-тестах не проверяются (смежность только в `./scenario`, web-тестам недоступна) — через `getRouteCount()`/`data-routes` в e2e; узел/кольца/маркеры экранно-постоянные (как в макете), мировая hit-зона системы r 30 сохранена; hit маркера 42×19 px (плашка 34×17) — < 44 px на касание, клавиатурный/тач-путь — DOM-маркеры MF; на самом малом экране консоли (1024×768, fit ≈ 30 %) широкий compact-маркер «● 9 ◆ 2» у Беспина может касаться подписи Мустафара, а у Империи со скрытой зоной «Корусант»/«Орд-Мантелл» соприкасаются — в `labelLayout.test` эти два случая для `console 1024x768` помечены как known limit; размеры канваса консоли в тесте оценочные (845×560, 635×440, 726×500) — подтвердить `core-fit` на INTEGRATION; одиночные юниты на карте больше не рисуются (кроме ручек) → e2e, кликающие по `piecePos` вне активации, получают выбор системы + манифест **Fix round 1 (2026-11-21):** (1) легенда — одна строка ключевых обозначений (`map-legend-key-*`: Империя, Повстанцы, Наземные, Лидер, Допустимая цель, Выбрана, AI недавно; не влезающие ключи переносятся в скрытую вторую строку, не обрезаются) + клавиша «Легенда» `map-legend-toggle` (`aria-expanded`/`aria-controls`, Esc закрывает и возвращает фокус) открывает полную легенду `map-legend-full` над полосой; полный список (18 `map-legend-<item>`) всегда смонтирован внутри `map-legend` (`hidden`, пока закрыт); на < 600 строка скрыта, видна только клавиша; (2) < 900: высота `max(400px, 65vh)` у самого экрана `map-screen`, housing `height: auto`; полоса — один ряд без переноса и скролла; шапка дисплея переносится, на < 600 без «Тактический дисплей» и LOD, «число = фигуры» только ≥ 1200; проверено на dev-5180: 375×812 экран 528 px, полоса 54 px, без горизонтальной прокрутки; (3) новый `geometry/labelCulling.ts` (+тест): в compact LOD подписи систем и регионов, задевающие плашки/узлы других систем или уже оставленные подписи, не рисуются (приоритет: выбранная → активированная → цель → источник → AI → база → остальные); квантованный масштаб (шаг 2 %); зеркало `data-label="shown|hidden"`; `getSystemLabelRect` → `null` для скрытой подписи; (4) compact-плашка стороны показывает раскладку по аренам «▲n ■m ◆k» (`GroupMarkerScene.space/ground`, `compactParts`), `arena: 'all'` и `data-markers` без изменений. Тесты: `vitest run …canvas …geometry …hooks …board` → 13 files / 159 passed (`logs/M-fix1-vitest.log`); соседние → 7 files / 70 passed (`logs/M-fix1-vitest-neighbours.log`); eslint/prettier/hex-grep чисто (`logs/M-fix1-lint.log`); typecheck exit 0 (`logs/M-fix1-typecheck.log`); скриншоты `artifacts/screenshots/M-fix1-{1440-fit,1440-legend-open,1024-fit,375-map}.jpg` (dev-5180, ходов не делалось). Остаётся: на 375 px fit ограничен шириной (≈ 12 %, боковые отступы подписей 2×60 px) — карта мелкая, плашки соседних систем могут перекрываться (данные не скрываются) **Fix round 2 (review R-1):** Esc обрабатывается на обёртке `map-legend` (общий родитель клавиши и панели), только пока панель открыта: `preventDefault` + `stopPropagation` (глобальный `useGlobalEscape` пропускает событие, выбор не сбрасывается), панель закрывается, фокус — на `map-legend-toggle`; тест в `CoreBoardStage.test.tsx` заменён на `user.click(toggle)` → `user.keyboard('{Escape}')` с подключённым `useGlobalEscape` (панель закрыта, фокус на клавише, выбор сохранён; второй Esc при закрытой легенде снова снимает выбор). `vitest …canvas …geometry …hooks …board` → 160 passed (`logs/M-fix2-vitest.log`), соседние → 70 passed (`logs/M-fix2-vitest-neighbours.log`), eslint/prettier/hex-grep чисто (`logs/M-fix2-lint.log`), typecheck exit 0 (`logs/M-fix2-typecheck.log`) **Fix round 3 (QA-3):** «вписать карту» на узких консолях (окно < 900 px, одна колонка) — `CORE_CONTENT_INSETS_NARROW` (без боковых отступов подписей, снизу одна строка подписи; остаётся адаптивный fit-padding ≥ 12 px), ≥ 900 px — прежние `CORE_CONTENT_INSETS` (fit на ≥ 1024 не меняется); `cullLabels` получил `stage` — на узких консолях в compact LOD подписи, выходящие за канвас (поле 8 px), скрываются как пересекающиеся (сдвиг квантуется по 16 px, масштаб — по 2 %). Замеры на dev-5180 (`logs/M-fix3-browser.log`): 375 → fit 19.7 % (было 12.2 %), поля 12/12 px, скрыто 16 подписей; 768 → 41.9 %, поля 20/20 px, скрыто 0; 1024 → 29.5 %, 1440 → 40.6 % (ограничены высотой, вставки прежние, скрыто 0); скриншоты `M-fix3-{375,768}-fit.jpg`. Тесты: `vitest …canvas …geometry …hooks …board` → 164 passed (`logs/M-fix3-vitest.log`), eslint/prettier/hex-grep чисто (`logs/M-fix3-lint.log`), typecheck exit 0 (`logs/M-fix3-typecheck.log`) |
