# Plan — frontend (SWR-005 / TECH_PLANNING, `apps/web`)

**Автор:** frontend-lead · **Дата:** 2026-11-08 · **Статус:** design only — кода, установок и правок вне этого файла нет.
**Входы:** `specification.md` (draft: Scenarios, Rules R-1..R-10, D-1..D-5, Contract, UX, AC-01..AC-16), `request.md`,
`docs/product/ux-decisions.md` §1–§13, `docs/architecture/application.md`, `docs/tasks/SWR-004/plan-frontend.md` (формат),
текущий код `apps/web/src/games/rebellion/**`, `apps/web/src/platform/**`, `packages/games/rebellion/src/{board,assets,schema}/**`, `e2e/**`.
**`plan-backend.md` на момент написания отсутствует** → поля wire, которые нужны UI, записаны как предположения **W-1..W-12**
(§2) и поправки **AM-FE-n** (§13). Если backend выберет другую форму, меняется только слой `core-v1/model/viewModel.ts` (§3.3) —
компоненты читают данные только через него. UX-решения этого плана — предложение раздела `ux-decisions.md` **§14** (§15 ниже,
ID `D-SW5-*`); переносит в `ux-decisions.md` Analyst/владелец документа.

---

## 0. Инварианты (для всех FE-воркеров)

1. **Правила не в React/Konva.** Подсветка, доступность кнопок, списки целей — только из `view.legalActions` и явных полей
   view (`activation`, `outcome`, `contested`, `remote`). UI не считает соседство, вместимость, «можно ли пасовать», победу.
   Финальный судья — сервер; при 422 UI показывает причину по `messageKey`.
2. **Серверное состояние — только кеш TanStack Query** `sessionKeys.detail(sessionId)` (меняется только ответом сервера,
   без оптимистичных записей). Zustand — только локальный UI (выбор, «взятый» лидер, черновик перемещения, viewport, drag).
3. **Скрытая информация не прячется в UI.** Зона «База Повстанцев — местоположение неизвестно» рисуется из того, что сервер
   прислал (юниты без системы, W-6); UI никогда не получает и не ищет `systemId` базы для Империи.
4. Граница платформа ↔ игра (ESLint B-9/B-17) сохраняется: `platform/**` не знает `rulesEngine`, фракций, лидеров.
   Из игрового пакета web импортирует только `./schema`, `./board`, `./assets`, `./definition`.
5. Литералов в JSX нет, testid не зависят от языка, графика только собственная (круги, полигоны, глифы; без сканов/артов поля,
   координаты карты — собственная схема, а не обводка изображения поля).
6. **Старые партии (`mock-v1`) рендерятся существующим кодом `board/**`** без развития (только бейдж «Старый прототип»
   и общие исправления геометрии fit). Новый стол — отдельная папка `core-v1/**`.

---

## 1. Затрагиваемая структура

```text
packages/games/rebellion/
  src/board/core-layout.ts           NEW  координаты 32 систем, полигоны и якоря подписей 8 регионов, прямоугольник
                                          скрытой зоны базы, CORE_MAP_BOUNDS (web-safe, без импорта scenario)   (M)
  src/board/index.ts                      + export * from './core-layout'                                       (M, 1 строка)
  test/board/core-layout.test.ts     NEW  ключи = id систем/регионов данных; центр внутри полигона своего региона;
                                          полигоны не пересекаются; мин. расстояние между центрами; зона вне галактики (M)
apps/web/src/games/rebellion/
  table/
    TableScreen.tsx                       диспетчер: handoff | mock-v1 (LegacyTable) | core-v1 (CoreTable)       (S)
    LegacyTable.tsx                  NEW  вынесенный без изменений `Table` (mock-v1) + бейдж «Старый прототип»   (S)
    hooks/{useRebellionView,useSendCommand}.ts   + union core/mock, команды core                              (S)
    components/PrototypeBadge.tsx         variant: 'core-v1' | 'legacy' | 'generic'                            (P2)
    components/HandoffScreen.tsx          без изменений (generic-бейдж, если AM-FE-8 не принят)                  —
  core-v1/                           NEW  стол на срезе core-v1
    CoreTable.tsx                         сетка стола, провайдер контекста, фокус, skip-links                   (S → P1 после FE-0)
    model/                                чистый TS, без React (кроме zustand-стора)                             (S)
      coreContext.ts                      CoreBoardContext { sessionId, view: PlayerViewCore, send, isPending }
      viewModel.ts                        селекторы из legalActions/полей view (§3.3) — единственный адаптер wire
      coreUiStore.ts                      armedLeaderId, moveDraft, lastOutcomeSeen
      announcements.ts                    события ответа → фразы aria-live/snackbar (авто-пас AI, раунд, раскрытие)
      dnd.ts                              MIME `application/x-swr-leader`, кодирование leaderId
    geometry/                             чистая геометрия карты core (без правил)                               (M)
      sceneModel.ts                       view + ui-state → props узлов Konva (подсветки, маркеры, LOD)
      labelLayout.ts, lod.ts, contentBounds.ts
    canvas/                                                                                                       (M)
      CoreBoardStage.tsx                  Stage, 3 слоя (§4), клавиатура карты, drop лидера, debug
      layers/{StaticMapLayer,InteractiveLayer,OverlayLayer}.tsx
      nodes/{RegionShape,RegionLabel,CoreSystemNode,LeaderBadge,UnitGlyphNode,SideCountChip,HiddenBaseZone,
             ContestedMarker,ActivationRing}.tsx
      CoreMapCaption.tsx
    hooks/{useCoreMoveDrag,useLeaderDrop,useCoreBoardDebug}.ts + coreBoardDebugImpl.ts                         (M)
    panels/                                                                                                       (P1)
      TurnPanel.tsx                       «Ход»: статус очереди, пул лидеров, выбор системы | активация + перемещения
      LeaderPool.tsx, ActivationPicker.tsx, MovePanel.tsx, MoveSourceFieldset.tsx
      TurnControls.tsx, PassConfirmDialog.tsx
      CoreContextPanel.tsx, CoreSystemPanel.tsx, LeaderPanel.tsx, HiddenZonePanel.tsx
    sidebar/                                                                                                      (P1 / P2)
      CoreSidebar.tsx, CoreBoardList.tsx  (P1)  ·  CoreEventLog.tsx, coreLogMessage.ts, MapLegend.tsx (P2)
    top-bar/                                                                                                      (P2)
      CoreTopBar.tsx, TimeTrack.tsx, TurnIndicator.tsx, OutcomeBanner.tsx, CoreGameInfoPanel.tsx
  board/model/{geometry,viewportStore,constants}.ts + board/hooks/useStageSize.ts    fit-фикс, общий для обоих движков (M)
  board/model/{selectionStore,resetBoardState}.ts   + Selection 'leader' | 'zone', сброс coreUiStore               (S)
  describeSession.ts                      пометка «Старый прототип», время/репутация в строке (W-11)              (P2)
  locales/{ru,en}/data.json          NEW  `rebellion.data`: systems.*, regions.*, pieceTypes.*, leaders.*         (M)
  locales/{ru,en}/map.json           NEW  `rebellion.map`: подписи карты, легенда, LOD-подсказки, debug-нейтральные (M)
  locales/{ru,en}/turn.json          NEW  `rebellion.turn`: пул, активация, перемещения, пас, отказы-подсказки     (P1)
  locales/{ru,en}/match.json         NEW  `rebellion.match`: трек, фаза/очередь, итог, зона базы, журнал core       (P2)
  locales/{ru,en}/errors.json             + 12 ключей core (§8.4)                                                (P1)
  locales/{ru,en}/common.json             + prototype.coreV1/legacy; phase.command → «Приказы» (Q-FE-8)          (P2)
  locales.i18n.test.ts                    + новые namespaces, покрытие id данных                                  (P2)
```

---

## 2. Что FE ожидает от wire (предположения W-n; сверить с `plan-backend.md`)

`TableScreenProps.view: unknown` парсится схемой пакета. Нужна **дискриминация движка в player-view**:

```ts
// @bga/game-rebellion/schema (предложение; финальные имена — backend)
type PlayerView = HandoffView /* 7 полей SWR-004, без изменений */ | PlayerViewMock | PlayerViewCore;

interface PlayerViewMock { kind: 'player'; rulesEngine: 'mock-v1'; /* = нынешний PlayerViewPlayer */ }

interface PlayerViewCore {
  kind: 'player'; rulesEngine: 'core-v1';                                   // W-1
  viewer: FactionId; activeSide: FactionId; settings: RebellionSettings; id: string; version: number;
  round: number;                       // = позиция маркера времени (R-1)
  phase: 'assignment' | 'command' | 'refresh';
  markers: { time: number; reputation: number };                            // W-2
  systems: Array<{ id; nameKey /* systems.<id> */; regionId; adjacentSystemIds: string[];
                   remote: boolean; contested: boolean }>;                  // W-3 (contested — сервер, D-1)
  pieces: Array<{ id; owner; typeKey /* pieceTypes.<typeKey> */; arena: 'space' | 'ground';
                  immobile: boolean; systemId: string | null }>;            // W-4, W-6: null = скрытая зона базы
  leaders: Array<{ id; owner; nameKey /* leaders.<id> */; systemId: string | null }>;  // W-5: null = в пуле
  activation: { side: FactionId; leaderId: string; systemId: string } | null;          // W-7
  lastPass: FactionId | null;          // кто спасовал последним в текущей серии (для «Империя спасовала»), W-7
  rebelBase: { systemId: string | null; revealed: boolean };               // как сейчас
  outcome: { winner: FactionId; reason: 'timeReachedReputation' | 'baseCaptured' } | null;  // W-8
  log: CoreGameEvent[];                                                     // W-9
  legalActions: CoreLegalAction[];                                          // W-10
}

type CoreLegalAction =
  | { type: 'ACTIVATE_SYSTEM'; leaderId: string; systemIds: string[] }      // по одному на лидера в пуле
  | { type: 'MOVE_PIECES'; fromSystemId: string; toSystemId: string; pieceIds: string[] } // по одному на соседнюю систему-источник;
                                                                            //   pieceIds — юниты, которые могут входить в легальный ход
  | { type: 'FINISH_ACTIVATION' } | { type: 'PASS' };
```

- **W-6 (скрытая зона):** для Империи до раскрытия юниты Повстанцев на базе приходят с `systemId: null`; лидеры
  Повстанцев на базе — тоже `null`, но отличимы от «в пуле»? → **Q-FE-4** (предложение: у лидера `location: 'pool' | 'hiddenBase' | systemId`).
- **W-9 (события):** `SYSTEM_ACTIVATED {leaderId, systemId|null}`, `PIECES_MOVED {pieceIds, fromSystemId|null, toSystemId}`,
  `ACTIVATION_FINISHED`, `PASSED`, `PHASE_CHANGED {round, phase}`, `LEADERS_RETURNED`, `TIME_ADVANCED {from,to}`,
  `BASE_REVEALED {systemId}`, `GAME_OVER {winner, reason}`; поле базы события **`auto?: true`** для хода AI (AM-FE-6);
  система базы в событиях для Империи заменена на `null` (= «скрытая зона»).
- **W-10 (MOVE_PIECES):** вместимость (R-5) **не** вычисляется в UI. Сервер сообщает кандидатов по источнику; набор
  выбирает игрок; «всё или ничего» и `insufficientCapacity` решает сервер (422 → текст в панели). Подсказка «вместимость
  N/M» — только если backend сам пришлёт числа (Q-FE-2); без них UI её не рисует.
- **W-11 (`SessionSummary.details`):** + `rulesEngine`, для core `time`/`reputation` (строка списка и «Старый прототип»).
- **W-12 (публичные каталоги):** web-safe константы id: `CORE_SYSTEM_IDS`, `CORE_REGION_IDS`, `LEADER_IDS`,
  `CORE_PIECE_TYPE_KEYS` (в `./schema` или `./board`, без базы) — для Zod-enum, i18n-теста и `core-layout.test.ts` (AM-FE-2).

---

## 3. Архитектура компонентов и состояния

### 3.1 Диспетчер стола (`table/TableScreen.tsx`, S)

```tsx
const parsed = useRebellionView(view);                       // PlayerView = handoff | mock | core
if ('error' in parsed) return <InvalidView/>;
if (parsed.view.kind === 'handoff') return <HandoffScreen key="handoff" …/>;           // без изменений (SWR-004)
if (parsed.view.rulesEngine === 'mock-v1') return <LegacyTable key={`mock-${viewer}`} …/>;  // существующий board/**
return <CoreTable key={`core-${viewer}`} …/>;                // новый стол; смена стороны = remount (fit заново)
```
`sawHandoff` → `focusHeading` сохраняется для обоих столов. `LegacyTable.tsx` — дословный перенос нынешнего `Table`
(+ `PrototypeBadge variant="legacy"`, `MapCaption` без изменений).

### 3.2 Серверное vs локальное состояние

| Данные | Где | Почему |
|---|---|---|
| view, legalActions, outcome, activation, log | TanStack `sessionKeys.detail` (через `SessionHost` → props) | единственный источник истины; заменяется ответом команды (`useSendCommand` → `setQueryData`) |
| статус сессии (`prototype`/`completed`) | `TableScreenProps.status` (из envelope) + ответ команды | платформенный; после GAME_OVER — `useSendCommand` обновляет и `status` в envelope (Q-FE-6: есть ли `status` в ответе команды) |
| списки сессий | invalidate `sessionKeys.lists()` после каждой команды | «Завершена» на странице игры |
| выбор (system / piece / **leader** / **zone**) | `selectionStore` (расширение) | общий с картой, списком, панелями |
| взятый для активации лидер `armedLeaderId` | `coreUiStore` | шаг 1 потока хода; сбрасывается при смене `version`, если лидер исчез из `legalActions` |
| черновик перемещения `moveDraft: Record<fromSystemId, pieceId[]>` | `coreUiStore` | чекбоксы панели; сбрасывается при смене `activation` / успешном MOVE / 409 |
| viewport, stageSize, bounds, `userAdjusted`, `minScale` | `viewportStore` (общий) | fit-фикс §6 |
| drag юнита | `dragStore` (общий) | как в SWR-002 |
| `lastOutcomeSeen` (версия, при которой показан баннер) | `coreUiStore` | фокус на баннер один раз |

`resetBoardState(sessionId)` (handoff, смена стороны) дополнительно делает `useCoreUiStore.getState().reset()`.
Никаких копий view в Zustand; `reconcile(view)` расширяется лидерами и зоной.

### 3.3 `viewModel.ts` — единственный адаптер wire (S, чистые функции, 100 % покрытие тестами)

```ts
activationTargets(view, leaderId): string[]                 // ACTIVATE_SYSTEM.systemIds этого лидера
activatableLeaders(view): string[]                          // лидеры, у которых есть ACTIVATE_SYSTEM
poolOf(view, side), leadersOnMap(view), leadersAt(view, systemId)
activation(view): { leaderId, systemId, side } | null
moveSources(view): Array<{ fromSystemId, toSystemId, pieceIds }>   // из MOVE_PIECES
movableInDetail(view, pieceId): { fromSystemId, toSystemId } | null  // для drag на карте
canPass(view), canFinish(view), isMyTurn(view) /* legalActions.length > 0 */, isGameOver(view)
hiddenZone(view): { pieceIds, leaderIds } | null            // systemId === null; только если сервер так прислал
contestedSystemIds(view), remoteSystemIds(view)             // поля W-3, не вычисление
```
Все компоненты `core-v1/**` получают данные только отсюда — при иной форме wire правится один файл + его тест.

### 3.4 Композиция `CoreTable` (P1 после FE-0)

```text
CoreTable (CoreBoardContext.Provider)
├─ h1 (sr-only «Игровой стол»), skip-links: «К ходу» (TurnPanel), «К списку объектов»
├─ CoreTopBar (P2): ← К игре · TurnIndicator · TimeTrack · фаза · TurnControls(P1) · PrototypeBadge · SaveStatus · ⚙
├─ board area: CoreBoardStage (M) + OutcomeBanner (P2, поверх карты) + ZoomControls (общий) + CoreMapCaption (M)
└─ CoreSidebar (P1): TurnPanel | CoreContextPanel | Tabs [Журнал (P2) · Объекты (P1) · Партия (P2)]
```
Сетка: ≥1200 — карта | сайдбар 384; 900–1199 — карта | 320; **< 900 — одна колонка** (шапка / карта `min(64dvh, 85vw)` /
сайдбар), вертикальная прокрутка страницы, без горизонтальной (часть fit-фикса, §6).

---

## 4. Konva: слои и узлы (M)

Три `Layer` (каждый слой — отдельный canvas; больше трёх не нужно для ~32 систем, ~80 юнитов, ~16 лидеров):

| Layer | listening | Содержимое (Group-ы, снизу вверх) | Перерисовка |
|---|---|---|---|
| `StaticMapLayer` | false | фон и звёзды (существующий `MapBackgroundLayer` как Group) · **полигоны регионов** (заливка цветом региона 6 %, контур пунктир 1.5px `systemStroke`) · линии соседства (дедуп пар) | только при смене `systems`; `layer.cache()` после первой отрисовки |
| `InteractiveLayer` | true | **системы** (`CoreSystemNode`) · **скрытая зона базы** (`HiddenBaseZone`, только если `hiddenZone(view)`) · **юниты** (LOD-detail: глифы на орбите; LOD-compact: `SideCountChip` по стороне) · **лидеры на карте** (`LeaderBadge`, дуга над системой) | при смене view/выбора/drag; узлы `memo` по props из `sceneModel` |
| `OverlayLayer` | false | **подписи систем** и **подписи регионов** (экранно-постоянный размер) · линии «источник → активированная» во время активации · ghost drag · кольцо ожидания команды · превью drop лидера | подписи масштабируются императивно подпиской на `viewportStore` (как transform Stage), без ререндера React |

**`CoreSystemNode`** (все признаки — не только цвет, §7 ux-decisions):

| Признак | Источник | Графика |
|---|---|---|
| обычная система | `systems[]` | круг `systemFill` / `systemStroke` 2px, r = 30 |
| удалённая | `system.remote` | контур **пунктиром** + малый ромб у подписи; в DOM «удалённая система» |
| спорная (D-1) | `system.contested` | `ContestedMarker`: два скрещённых штриха (янтарный + синий) в бейдже справа сверху + подпись «спорная» в DOM |
| цель активации | `activationTargets(view, armedLeaderId)` | пунктирное кольцо `legalTarget` + «➜» у подписи (как D-F-1) |
| активированная | `activation.systemId` | сплошное кольцо цвета стороны 4px + флажок-треугольник + слово «Активирована» в DOM/подписи |
| источник перемещения | `moveSources` во время активации | тонкое пунктирное кольцо `legalTarget` 1.5px + линия-стрелка к активированной |
| цель drag юнита | активированная система при drag | утолщённое кольцо, «магнит» (как §4.1 ux-decisions) |
| выбор | `selectionStore` | двойное белое кольцо (D-F-2) |
| база | `rebelBase.systemId` (только если пришёл) | значок Home; Империя — только после раскрытия |

**Лидеры на карте** — `LeaderBadge`: круг 22 world с 2 буквами (локализованная аббревиатура `leaders.<id>.short`), цвет
стороны (Империя — заливка, Повстанцы — контур, как фигуры), слоты по дуге над системой (до 4 на сторону, далее «+N»).
Клик — выбор лидера (панель лидера). Лидеры не перетаскиваются по карте (на карте они уже использованы).

**LOD:** `lod = scale < 0.65 ? 'compact' : 'detail'` (`geometry/lod.ts`). Compact: на систему по чипу на сторону
«■ 5» (глиф фракции + число юнитов) и счётчик лидеров; drag юнитов выключен, подсказка в панели «Приблизьте карту, чтобы
перетаскивать, или используйте панель хода». Detail: глифы на орбите (существующий `pieceLayout`), «+N» при переполнении.

**Подписи:** `fontSize = 13 / scale` с верхней границей (не больше 1.6× мирового при scale > 1), ширина подписи
`120 / scale`, перенос до 2 строк; регионы — UPPERCASE 11px, `letterSpacing 0.12em`, `opacity 0.7`, якорь из `core-layout`.
`labelLayout.ts` даёт прямоугольники подписей в экранных px (для debug/e2e-проверки «подписи не перекрываются» на fit).

**Скрытая зона базы** — прямоугольник в мировых координатах `HIDDEN_BASE_ZONE_RECT` из `core-layout` (вне галактики,
снизу справа; входит в content bounds только когда рисуется): пунктирная рамка, заголовок «База Повстанцев —
местоположение неизвестно», юниты/лидеры сеткой внутри. Не цель drop, не «система»; клик → `selection {kind:'zone'}` →
`HiddenZonePanel`. Для Повстанцев и после раскрытия не рисуется.

---

## 5. Взаимодействие: мышь и клавиатура

### 5.1 Поток хода (фаза «Приказы», свой ход)

```text
[нет активации]  выбрать лидера (пул) ──▶ подсвечены цели ──▶ клик по цели / drop лидера / «Активировать» ──▶ ACTIVATE_SYSTEM
                 «Пас» (подтверждение, если в пуле есть лидеры) ──▶ PASS
[активация]      перемещения 0..n: drag юнита на активированную / чекбоксы + «Переместить» ──▶ MOVE_PIECES
                 «Завершить активацию» ──▶ FINISH_ACTIVATION
[чужой ход]      (hot-seat — заслонка; AI-партия — не наступает: авто-пас AI в том же ответе)
[outcome]        баннер «Победа …», кнопок хода нет
```

### 5.2 Мышь

| Жест | Результат |
|---|---|
| клик по лидеру в пуле | «взять» лидера (`armedLeaderId`), повторный клик / Esc — отпустить; цели подсвечены на карте и в списке |
| клик по подсвеченной системе при взятом лидере | `ACTIVATE_SYSTEM` сразу (намерение уже выражено двумя шагами; как D-I-4) |
| клик по неподсвеченной системе при взятом лидере | выбор системы; панель: «Здесь нельзя активировать: …» — причина только если сервер прислал её в 422 при попытке; без попытки — нейтрально «Не входит в допустимые цели» |
| перетаскивание чипа лидера из пула на карту (HTML5 DnD → `stage.setPointersPositions` → `nearestSystem`) | drop на цель → `ACTIVATE_SYSTEM`; иначе — отмена, aria-live «Активация отменена» |
| drag своего юнита (LOD detail, юнит в `MOVE_PIECES.pieceIds`) на активированную систему | `MOVE_PIECES { pieceIds:[id], from, to }`; drop мимо — откат (как §4.1 ux-decisions) |
| чекбоксы в `MovePanel` + «Переместить (n) в <Система>» | групповой ход из одного источника (нужен для пехоты/истребителей с транспортом) |
| «Завершить активацию» / «Пас» в шапке | команды; «Пас» → `PassConfirmDialog`, если `poolOf(viewer).length > 0` |
| колесо / pan / zoom / «вписать» | без изменений + fit-фикс |

### 5.3 Клавиатура (основной путь, WCAG 2.1.1)

Порядок Tab: skip-links («К ходу», «К списку объектов») → шапка (… «Пас», «Завершить активацию») → контейнер карты (стрелки
pan, `+/−` zoom, `0` fit, `Esc`) → zoom-кнопки → **TurnPanel** → контекстная панель → вкладки.

1. **Пул лидеров** `leader-pool` — `role="radiogroup"` (roving tabindex: одна Tab-остановка, `←/→/↑/↓` перемещают и выбирают,
   как `ChoiceGroup`), выбор = «взять» лидера; aria-live «Выбран лидер Хан Соло: доступно 28 систем».
2. **Выбор системы** `activation-system-select` — MUI `Autocomplete` (опции = `activationTargets`, сгруппированы по региону,
   ввод с клавиатуры фильтрует по имени ru/en), затем кнопка `activation-confirm` «Активировать <Система>». Enter в поле
   с выбранной опцией не отправляет команду (только кнопка) — защита от случайного хода.
3. Альтернатива через «Объекты»: системы в `CoreBoardList` (`data-activatable="true"`, суффикс «· можно активировать»);
   под списком при взятом лидере и выбранной цели — кнопка `system-item-<id>-activate`.
4. **Перемещения:** `MovePanel` — для каждого источника `fieldset` `move-source-<fromId>` (legend «Из Набу (соседняя)»),
   чекбокс на юнит `move-piece-<pieceId>` (глиф + тип), «Выбрать все» `move-select-all-<fromId>`, кнопка
   `move-submit-<fromId>` «Переместить (n) в <Система>» (disabled только при n = 0 или pending). 422 → inline
   `move-error-<fromId>` (`role="alert"`) с текстом ключа, черновик сохраняется. Успех → фокус на заголовок панели,
   aria-live «2 юнита → Татуин».
5. «Завершить активацию» `finish-activation` / «Пас» `pass-turn` — кнопки шапки; диалог паса: фокус на «Отмена»
   (безопасное действие), Enter на «Пасовать» подтверждает, Esc закрывает.
6. Esc (глобально): отмена drag → снять «взятого» лидера → снять выбор (порядок приоритета).

Фокус после команд: ACTIVATE → заголовок `MovePanel` («Активация: Татуин»); FINISH/PASS → в hot-seat появляется заслонка
(фокус на её h1, D-SW4-21); в AI-партии → заголовок `TurnPanel` («Ваш ход»), aria-live озвучивает авто-пас AI и, если был,
переход раунда («Раунд 3: лидеры вернулись в пул, время 3»). Outcome → фокус на заголовок баннера (один раз).

---

## 6. Fit-to-view (закрывает known issue SWR-004 O-2; AC-12)

**Причины (по коду):** (1) `fitViewport` зажимает масштаб в `MIN_SCALE = 0.4`, а для доски ~1800 world на 448px нужно ~0.2;
(2) постоянный `FIT_PADDING = 64` px с каждой стороны съедает узкую доску; (3) bounds = центры систем ± 136 world, а
подписи/лидеры/зона выходят за них; (4) на 768 сайдбар 320px оставляет карте 448px; (5) fit выполняется только при первом
появлении размера (`setStageSize` при `prev.width === 0`) — перенос шапки или resize меняют высоту, а вид не пересчитывается.

**Решение (M, `board/model/{geometry,viewportStore,constants}.ts`, общее для mock и core):**
1. `fitViewport(bounds, stage, padding: Insets)` — масштаб **не** зажимается снизу `MIN_SCALE`; стор хранит
   `minScale = min(MIN_SCALE, fitScale)`, `zoomOut`/колесо не уходят ниже `minScale` (вид «вся карта» всегда достижим).
2. Адаптивный отступ: `p = clamp(12, 0.03 × min(w, h), 48)`; к нижнему отступу + высота подписи (2 строки × 13px),
   к боковым + половина ширины подписи (60px) — подписи экранно-постоянные, поэтому учитываются в px, не в world.
3. `contentBounds` (core): центры ± (орбита + глиф), дуга лидеров сверху, полигоны регионов, скрытая зона (если рисуется).
   Mock: прежние bounds.
4. `userAdjusted`: пока пользователь не двигал/не зумил вид, resize контейнера и смена bounds вызывают fit заново; кнопка
   «вписать» и `0` — всегда fit и сброс `userAdjusted`. Запомненный вид партии (D-I-12) восстанавливается, только если
   размер сцены тот же.
5. Сетка `CoreTable` < 900px — одна колонка (§3.4): на 768×1024 карта на всю ширину.

**Критерий (e2e QA + debug API):** на 1440×900, 1024×768, 768×1024 после «вписать»: `getSystemScreenPos(id)` всех 32 систем
внутри rect `board-canvas`, `getSystemLabelRect(id)` внутри rect и попарно без пересечений (допуск 2px), `getLod()` любой.
Скорее всего на 768 будет `compact` — это ожидаемо.

---

## 7. Остальные элементы UX

- **Шапка (`CoreTopBar`, P2):** группы D-SW4-18 сохраняются. `sides`: `TurnIndicator` — «Ход: □ Повстанцы» (+ «(вы)» в
  AI-партии; в AI-партии сторона AI — «против AI · Обычная»). `state`: `TimeTrack` + «Фаза: Приказы» + `TurnControls`.
  `status`: бейдж среза, «Завершена» (чип `SessionStatusChip`-аналог игры, если `status === 'completed'`), сохранение, ⚙.
- **`TimeTrack`** `time-track` (`data-time`, `data-reputation`): компактная шкала делений 1..max(reputation, 16) с двумя
  маркерами разной формы (время — ромб, репутация — кольцо) + текст «Время 2 · Репутация 14» и `aria-label`
  «Время 2 из 14: Повстанцы побеждают, когда время дойдёт до репутации». На < 600 — только текст.
- **Контекстные панели (P1):** система — регион, «удалённая», «спорная: юниты обеих сторон, бой появится позже», лидеры здесь,
  юниты по сторонам; при взятом лидере и цели — кнопка «Активировать»; лидер — имя, сторона, «в пуле» / «в системе X»;
  зона — список юнитов, пояснение «Империя не знает, где база».
- **Журнал (P2):** `coreLogMessage(event, t, view)`; ход AI с `auto: true` — текст «Империя (AI) пасует» + чип «авто» и
  подсказка (tooltip + `aria-describedby`) «AI Commander ещё не реализован: AI-сторона всегда пасует». `null`-система →
  «в скрытой зоне». Неизвестный тип — `log.unknown` (как сейчас).
- **Итог (`OutcomeBanner`, P2):** поверх верха карты, `role="region"` `aria-labelledby` h2 `game-over-title`: «Победа
  Повстанцев» + причина («Время дошло до репутации» / «База Повстанцев захвачена»), кнопка «← К игре». Не модальный: карту
  и журнал можно смотреть. `TurnControls`/`TurnPanel` вместо действий — «Партия завершена».
- **Бейдж среза (P2):** `PrototypeBadge variant`: core — «Реальная карта; правила частично: раунд и активация. Бой, миссии,
  производство — позже»; legacy — «Старый прототип: тестовые правила»; handoff (движок неизвестен) — короткое «Прототип»
  (или вариант по движку, если принят AM-FE-8). `data-variant`.
- **Страница игры (P2):** `describeSession` — core: «Повстанцы · против AI (Обычная) · Время 3 · Приказы»; legacy: + часть
  `{ key: 'engine', text: 'Старый прототип' }`; статус «Завершена» — платформенный чип (уже есть).
- **Авто-пас AI в момент открытия AI-партии за Империю:** первая запись журнала после создания — пас AI-Повстанцев (`auto`),
  TurnPanel «Ваш ход», без snackbar (это не реакция на действие).

---

## 8. i18n (ru / en)

### 8.1 `rebellion.data` (M) — названия данных, ключи = id из данных (W-12)

| Ключ | Пример ru / en | Кол-во |
|---|---|---|
| `systems.<id>` | «Корусант» / «Coruscant», «Татуин» / «Tatooine», «Мон-Каламари» / «Mon Calamari» | 32 |
| `regions.<id>` | русская передача / оригинальное название региона | 8 |
| `pieceTypes.<typeKey>` | «Звёздный разрушитель» / «Star Destroyer», «AT-AT» / «AT-AT», «Крестокрыл» / «X-wing» | все типы обеих сторон |
| `leaders.<id>.name`, `leaders.<id>.short` | «Хан Соло» / «Han Solo», «ХС» / «HS» | все лидеры среза |

ru — общепринятая транслитерация (A-3), en — оригинал. Тексты карт/правил правообладателя не переносятся — только имена.

### 8.2 `rebellion.map` (M)

`canvas.label` «Карта галактики», `canvas.instructions` (как сейчас + «Ход с клавиатуры — панель «Ход»»), `caption.core`
«Схема карты · собственная графика», `marker.remote` «удалённая», `marker.contested` «спорная», `marker.activated`
«активирована», `zone.title` «База Повстанцев — местоположение неизвестно», `lod.compactHint` «Приблизьте карту, чтобы
перетаскивать юниты, или используйте панель «Ход»», `legend.{title, region, remote, contested, activated, leader, base,
target, source}`.

### 8.3 `rebellion.turn` (P1)

`panel.title` «Ход», `panel.yourTurn` «Ваш ход: активируйте систему лидером или пасуйте», `panel.waiting` «Ход {{side}}»,
`panel.noLeaders` «В пуле нет лидеров — можно только пасовать», `panel.gameOver` «Партия завершена»,
`pool.label` «Пул лидеров», `pool.empty` «Все лидеры на карте», `pool.armed` «Выбран лидер {{leader}}: доступно {{count}} систем»
(плюрализация), `pool.disarmed` «Выбор лидера снят»,
`activate.select` «Система для активации», `activate.confirm` «Активировать {{system}}», `activate.done` «{{leader}}
активирует {{system}}», `activate.cancelled` «Активация отменена», `activate.notTarget` «Не входит в допустимые цели»,
`activate.inList` «· можно активировать»,
`move.title` «Активация: {{system}} · {{leader}}», `move.none` «Соседних юнитов, которые могут переместиться, нет»,
`move.source` «Из {{system}}», `move.selectAll` «Выбрать все», `move.submit` «Переместить ({{count}}) в {{system}}»,
`move.done` «{{count}} юнит(а/ов) → {{system}}» (плюрализация), `move.pinnedHint` «Юниты в системах с вашим лидером
не двигаются», `move.lodHint`,
`controls.finish` «Завершить активацию», `controls.pass` «Пас», `pass.confirmTitle` «Пасовать?», `pass.confirmText`
«В пуле ещё {{count}} лидер(а/ов). Если обе стороны спасуют подряд, раунд закончится.», `pass.confirm` «Пасовать»,
`pass.cancel` «Отмена», `pass.done` «Вы спасовали».

### 8.4 `rebellion.errors` (P1) — по `messageKey` сервера (`errors.<name>`)

| Ключ | ru |
|---|---|
| `notYourTurn` | (есть) «Сейчас ход другой стороны.» |
| `wrongPhase` | «Это действие доступно только в фазе приказов.» |
| `leaderNotInPool` | «Этот лидер уже на карте — выберите лидера из пула.» |
| `systemHasOwnLeader` | «В этой системе уже есть ваш лидер.» |
| `activationInProgress` | «Сначала завершите текущую активацию.» |
| `noActivation` | «Сначала активируйте систему.» |
| `notActivatedSystem` | «Перемещать юниты можно только в активированную систему.» |
| `notAdjacent` | (есть) «Системы не соседние: туда переместиться нельзя.» |
| `pinnedByLeader` | «Юниты в системе с вашим лидером не могут перемещаться.» |
| `immobileUnit` | «Это сооружение не перемещается.» |
| `insufficientCapacity` | «Не хватает транспорта: добавьте корабли из той же системы или уберите наземные юниты/истребители.» |
| `gameOver` | «Партия завершена — ходы больше не принимаются.» |

+ любые ключи, которые backend добавит (i18n-тест сверяет с `REBELLION_ERROR_MESSAGE_KEYS`).

### 8.5 `rebellion.match` (P2) и `rebellion.common` (P2)

`match`: `track.{label, text «Время {{time}} · Репутация {{reputation}}», aria}`, `phase.label`, `turn.{of «Ход: {{side}}»,
you «(вы)»}`, `outcome.{rebels «Победа Повстанцев», empire «Победа Империи», timeReachedReputation «Время дошло до
репутации», baseCaptured «База Повстанцев захвачена: в её системе наземные войска Империи и нет наземных войск Повстанцев»,
back «К игре»}`, `log.{SYSTEM_ACTIVATED, PIECES_MOVED, ACTIVATION_FINISHED, PASSED, PASSED_auto, PHASE_CHANGED,
LEADERS_RETURNED, TIME_ADVANCED, BASE_REVEALED, GAME_OVER, hiddenZone «скрытая зона», autoTag «авто», autoHint}`,
`info.{time, reputation, rules «Правила: срез core-v1»}`, `list.{time «Время {{time}}», legacy «Старый прототип»}`.
`common`: `prototype.coreV1`, `prototype.legacy`, `phase.command` → «Приказы» / «Command» (Q-FE-8).

Полные фразы на сторону (`outcome.rebels`/`outcome.empire`, `turn.of` через `factionName`) — без склонения в коде.
`locales.i18n.test.ts` (P2): новые namespaces в `TABLE_NAMESPACES`; ru/en совпадают; **каждый** id из данных core
(импорт данных разрешён `*.i18n.test.ts`, ESLint B-10) имеет `systems/regions/pieceTypes/leaders` в обоих языках;
каждый `messageKey` пакета переведён; каждый тип события core имеет `match:log.<TYPE>`; в en нет кириллицы.

---

## 9. Testid (вход для QA, `e2e/support/testids.ts` правит QA)

| testid | Где | Атрибуты |
|---|---|---|
| `game-table` | как сейчас | + `data-rules-engine` (`core-v1`/`mock-v1`), `data-phase`, `data-active-side` |
| `prototype-badge` | шапка | + `data-variant` (`core-v1`/`legacy`/`generic`) |
| `turn-indicator` | шапка | `data-side`, `data-mine` |
| `time-track` | шапка | `data-time`, `data-reputation` |
| `phase-indicator` | (есть) | `data-phase` |
| `finish-activation`, `pass-turn` | шапка | `disabled` |
| `pass-confirm`, `pass-confirm-ok`, `pass-confirm-cancel` | диалог | — |
| `turn-panel` | сайдбар | `data-state` ∈ `idle|armed|activation|waiting|over` |
| `leader-pool`, `leader-<id>` | пул | `role=radiogroup` / `role=radio`, `aria-checked`, `data-owner`, `draggable` |
| `activation-system-select`, `activation-confirm` | TurnPanel | — |
| `move-panel`, `move-source-<from>`, `move-piece-<id>`, `move-select-all-<from>`, `move-submit-<from>`, `move-error-<from>` | TurnPanel | `data-to` |
| `system-item-<id>` | список (есть) | + `data-activatable`, `data-activated`, `data-contested`, `data-remote`, `data-region` |
| `system-item-<id>-activate` | под списком | — |
| `leader-item-<id>` | список | `data-location` |
| `hidden-base-zone` | список + панель | `data-count` |
| `game-over-banner`, `game-over-title` | поверх карты | `data-winner`, `data-reason` |
| `log-entry-<seq>` | журнал | `data-type`, `data-actor`, `data-auto` |
| `map-legend` | вкладка «Партия» | — |

`window.__boardDebug` (core, только DEV/E2E, dynamic import как сейчас): прежние методы + `getLeaderScreenPos(id)`,
`getSystemLabelRect(id)`, `getContentBounds()`, `getLod()`, `getActivatedSystemId()`, `getArmedLeaderId()`,
`getRulesEngine()`. При заслонке — `undefined` (TR-10 SWR-004 сохраняется). `check:bundle` по-прежнему проверяет отсутствие
`__boardDebug` в prod-бандле.

---

## 10. Скриншоты для AC-12 (`docs/tasks/SWR-005/artifacts/screenshots/`, снимает QA; reduced motion, ru, если не указано)

| # | Файл | Что видно |
|---|---|---|
| 01 | `01-core-fit-1440x900.png` | AI-партия за Повстанцев, «вписать»: 32 системы с подписями, 8 регионов, трек, фаза, очередь |
| 02 | `02-core-fit-1024x768.png` | то же 1024×768 (две колонки, шапка в 2 ряда) |
| 03 | `03-core-fit-768x1024.png` | то же 768×1024 (одна колонка, LOD compact) |
| 04 | `04-leader-armed-targets.png` | лидер взят, цели подсвечены на карте и в списке |
| 05 | `05-activation-keyboard.png` | фокус-кольцо в `activation-system-select` (клавиатурный путь) |
| 06 | `06-activation-move-panel.png` | активированная система, источники, `MovePanel` с отмеченными юнитами |
| 07 | `07-move-drag.png` | drag юнита на активированную (кольцо-«магнит») |
| 08 | `08-ai-autopass-log.png` | журнал: «Империя (AI) пасует · авто» |
| 09 | `09-new-round.png` | после двух пасов: время 2, лидеры в пуле |
| 10 | `10-empire-hidden-zone.png` | AI-партия за Империю: зона «База Повстанцев — местоположение неизвестно», системы базы на карте нет |
| 11 | `11-base-revealed.png` | событие раскрытия, значок базы у системы |
| 12 | `12-contested.png` | спорная система: маркер на карте + «спорная» в панели |
| 13 | `13-game-over-rebels.png` | баннер «Победа Повстанцев», нет кнопок хода |
| 14 | `14-game-page-completed.png` | список: «Завершена», «Время N», старая партия с «Старый прототип» |
| 15 | `15-legacy-table.png` | старая сессия: вымышленная карта, бейдж «Старый прототип: тестовые правила» |
| 16 | `16-hotseat-handoff-core.png` | заслонка после «Завершить активацию» в human-партии |
| 17 | `17-pass-confirm.png` | диалог паса с фокусом на «Отмена» |
| 18 | `18-core-fit-1440-en.png` | en-локаль стола |

---

## 11. Подзадачи, владение файлами, порядок (одно рабочее дерево, без worktree)

### Зависимость от backend

| BE-шаг (ожидаемый) | Что даёт FE | Блокирует |
|---|---|---|
| **BE-schema**: `PlayerViewCore`/`PlayerViewMock` (W-1..W-10), команды core, события, ключи ошибок, публичные каталоги id (W-12) в `./schema` | типы и Zod для FE-0 | FE-0 (последовательно, сливается вместе с BE-schema, чтобы web компилировался) |
| **BE-data**: данные 32 систем/регионов/лидеров/типов в пакете | id для `core-layout.ts`, `data.json` | M (layout), M (data.json) |
| **BE-rules/API**: движок core-v1, авто-пас AI, `statusOf`, details (W-11) | только INTEGRATION и e2e | ничего из Vitest: FE-тесты на фикстурах `mockFetch` |

### FE-0 — переход web на union движков (Worker S, последовательно, вместе с BE-schema)

- **OWNED:** `table/TableScreen.tsx`, `table/LegacyTable.tsx` NEW, `table/hooks/{useRebellionView,useSendCommand}.ts`
  (+ `useSendCommand.test.tsx`), `table/TableScreen.test.tsx`, `table/HandoffScreen.test.tsx` (фикстуры),
  `games/rebellion/test/fixtures.ts`, `games/rebellion/test/coreFixtures.ts` NEW (`makeCoreView`, лидеры, активация, зона,
  outcome, legalActions), `board/test/fixtures.ts`, `board/model/boardContext.ts` (тип view = `PlayerViewMock`),
  механические правки типов в `board/**` и `table/components/**` (`PlayerViewPlayer` → `PlayerViewMock`) — только
  переименование типа; `core-v1/CoreTable.tsx` NEW (заглушка: h1 + `game-table[data-rules-engine=core-v1]`),
  `core-v1/model/{coreContext,viewModel,coreUiStore,announcements,dnd}.ts` NEW + тесты, `board/model/{selectionStore,
  resetBoardState}.ts` (+ `leader`/`zone`, сброс `coreUiStore`).
- **DONE WHEN:** mock-сессии рендерятся как раньше (существующие тесты зелёные), core-view даёт заглушку, `viewModel` API
  §3.3 зафиксирован и покрыт тестами; `pnpm --filter web typecheck|lint|test` = 0.
- После FE-0 владение `CoreTable.tsx` переходит к P1; `core-v1/model/**` остаётся за S (правки API — только через S).

### Worker M — карта (Konva), fit, данные карты

- **OWNED:** `core-v1/canvas/**`, `core-v1/geometry/**`, `core-v1/hooks/**`, `board/model/{geometry,viewportStore,
  constants}.ts`, `board/hooks/useStageSize.ts`, `board/model/model.test.ts` (fit-кейсы), `board/canvas/ZoomControls.tsx`
  (disabled по `minScale`), `packages/games/rebellion/src/board/core-layout.ts` NEW + строка экспорта в `src/board/index.ts`,
  `packages/games/rebellion/test/board/core-layout.test.ts` NEW, `locales/{ru,en}/{data,map}.json` NEW.
- **Зависит от:** FE-0 (контекст, viewModel), BE-data (id). Пакетные файлы — с согласия backend-lead (AM-FE-9).
- **DONE WHEN:** §4, §6 реализованы; тесты M (§12) зелёные; ручная проверка fit 1440×900 / 1024×768 / 768×1024 на core и
  регрессия mock (zoom/pan/drag e2e SWR-002 не меняются); `__boardDebug` расширен.

### Worker P1 — поток хода (DOM)

- **OWNED:** `core-v1/CoreTable.tsx` (после FE-0), `core-v1/panels/**`, `core-v1/sidebar/{CoreSidebar,CoreBoardList}.tsx`
  (+ тесты), `locales/{ru,en}/{turn,errors}.json`.
- **Зависит от:** FE-0. Карту встраивает как `<CoreBoardStage/>` (M) — до готовности M рендерит пустой контейнер
  `board-canvas` той же разметки (заглушка в `CoreTable`, удаляется на INTEGRATION).
- **DONE WHEN:** §5 (мышь в DOM-части, вся клавиатура), §7 (панели) реализованы; тесты P1 зелёные.

### Worker P2 — шапка, итог, журнал, бейджи, список, i18n-тест

- **OWNED:** `core-v1/top-bar/**`, `core-v1/sidebar/{CoreEventLog.tsx,coreLogMessage.ts,coreLogMessage.test.ts,
  MapLegend.tsx}`, `table/components/PrototypeBadge.tsx` (+ тест), `describeSession.ts` (+ тест),
  `locales/{ru,en}/{match,common,list}.json`, `locales.i18n.test.ts`.
- **Зависит от:** FE-0. `TurnControls` (P1) вставляется в `CoreTopBar` через слот-проп `controls`, чтобы не делить файл.
- **DONE WHEN:** §7 (шапка, трек, итог, журнал, бейджи, список) и §8.5 реализованы; i18n-тест покрывает все namespaces.

### Чужие файлы

`e2e/**` — QA (testid §9, fit-критерий §6, скриншоты §10); `packages/**` кроме `core-layout` — backend; `apps/api/**` —
backend; `eslint.config.*`, `apps/web/package.json`, `vite.config.ts` — frontend-lead на INTEGRATION (новых зависимостей
нет: MUI Autocomplete уже в `@mui/material`).

```text
BE-schema ──▶ FE-0 (S, вместе с BE-schema) ─┬─▶ M  (после BE-data) ─────┐
BE-data ────────────────────────────────────┤                            │
                                            ├─▶ P1 ──────────────────────┼─▶ INTEGRATION (frontend-lead) ─▶ REVIEW ─▶ e2e (QA)
                                            ├─▶ P2 ──────────────────────┤
                                            └─▶ S2 (правки viewModel по запросам M/P1/P2) ┘
```
Один FE-воркер: FE-0 → M(fit + layout) → P1 → P2 → M(LOD, drag, drop лидера).

---

## 12. Тесты по подзадачам (Vitest + RTL, `renderWithProviders`, `mockFetch`; Konva — через чистые `sceneModel`)

| Подзадача | Файл | Проверка | AC |
|---|---|---|---|
| S | `core-v1/model/viewModel.test.ts` | каждый селектор берёт данные только из `legalActions`/полей view: нет ACTIVATE → пул неактивен; MOVE → источники; `hiddenZone` только из `systemId: null`; `canPass/canFinish`; пустые `legalActions` при outcome | AC-04..07, 10 |
| S | `core-v1/model/coreUiStore.test.ts` | arm/disarm, сброс при исчезновении лидера из `legalActions`, сброс черновика при смене активации/409 | AC-12 |
| S | `core-v1/model/announcements.test.ts` | события ответа → фразы: авто-пас AI (`auto`), новый раунд, раскрытие базы, итог | AC-06, 08 |
| S | `table/TableScreen.test.tsx` | mock-view → `board-canvas` + `prototype-badge[data-variant=legacy]`; core-view → `game-table[data-rules-engine=core-v1]`; handoff → заслонка; невалидный → `table-invalid-view`; смена `viewer` → remount | AC-11, 09 |
| S | `table/hooks/useSendCommand.test.tsx` | ACTIVATE/MOVE/FINISH/PASS: actor = viewer, `expectedVersion`; ответ с GAME_OVER обновляет view и `status` в кеше; 422 `gameOver` — кеш не тронут | AC-07 |
| M | `board/model/model.test.ts` | `fitViewport` ниже `MIN_SCALE` для 448×600 и bounds 1900×1200; `minScale`; адаптивный отступ; refit на resize до `userAdjusted`, не после | AC-12 |
| M | `core-v1/geometry/sceneModel.test.ts` | для фикстур: цели активации подсвечены ровно по `systemIds`; активированная/спорная/удалённая/источники; зона только при `hiddenZone`; LOD-порог | AC-12, 10 |
| M | `core-v1/geometry/labelLayout.test.ts`, `contentBounds.test.ts` | подписи и лидеры внутри content bounds; на fit 1440/1024/768 (рассчитанный viewport) прямоугольники подписей не пересекаются для `core-layout` | AC-12 |
| M | `packages/games/rebellion/test/board/core-layout.test.ts` | ключи = id данных (32/8); центры внутри полигона региона; полигоны не пересекаются; мин. расстояние; зона вне bounds галактики; `./board` не импортирует scenario | AC-01, 14 |
| M | `core-v1/hooks/useCoreMoveDrag.test.tsx` | drop на активированную → один `MOVE_PIECES`; мимо → без запроса, откат; LOD compact → drag выключен | AC-05, 12 |
| P1 | `panels/LeaderPool.test.tsx` | radiogroup: одна Tab-остановка, стрелки, `aria-checked`; Esc снимает; без ACTIVATE — `aria-disabled` + текст `panel.noLeaders` | AC-04, 12 |
| P1 | `panels/ActivationPicker.test.tsx` | опции Autocomplete = `systemIds` взятого лидера, группы по региону; Enter в поле не шлёт; «Активировать» → `ACTIVATE_SYSTEM {leaderId, systemId}`; 422 `systemHasOwnLeader` → текст | AC-04 |
| P1 | `panels/MovePanel.test.tsx` | fieldset на источник; чекбоксы только `pieceIds`; submit → `MOVE_PIECES {pieceIds, from, to}` целиком; 422 `insufficientCapacity` → `move-error-<from>`, черновик сохранён; успех → фокус на заголовок | AC-05 |
| P1 | `panels/TurnControls.test.tsx` | «Пас»/«Завершить активацию» по `legalActions`; диалог паса при непустом пуле, фокус «Отмена», Esc; без лидеров — пас без диалога | AC-06 |
| P1 | `sidebar/CoreBoardList.test.tsx` | `data-activatable/contested/remote/activated`; кнопка `system-item-<id>-activate`; группа `hidden-base-zone` только из view | AC-10, 12 |
| P2 | `top-bar/CoreTopBar.test.tsx`, `TimeTrack.test.tsx` | время/репутация/фаза/очередь, `aria-label` трека; «(вы)» в AI-партии; «Завершена» при `completed` | AC-07, 12, 13 |
| P2 | `top-bar/OutcomeBanner.test.tsx` | победитель и причина для обеих сторон; фокус на заголовок один раз; нет кнопок хода | AC-07 |
| P2 | `sidebar/coreLogMessage.test.ts` | все типы core; `auto` → чип «авто»; `null`-система → «скрытая зона»; неизвестный тип | AC-06, 08, 10 |
| P2 | `table/components/PrototypeBadge.test.tsx`, `describeSession.test.ts` | варианты текста; legacy-часть «Старый прототип»; «Время N» | AC-11, 13 |
| P2 | `locales.i18n.test.ts` | §8 (покрытие id данных, ключи ошибок, события, en без кириллицы) | AC-01, 02 |

Вёрстка/контраст/фокус-кольца/fit в реальном layout — e2e QA (jsdom без layout); fit дополнительно покрыт чистыми тестами M.

---

## 13. Proposed amendments (решают Analyst + backend-lead)

| ID | Предложение | Зачем FE |
|---|---|---|
| AM-FE-1 | Player-view несёт `rulesEngine: 'mock-v1' \| 'core-v1'` (обе ветки) | диспетчер стола без эвристик по форме данных |
| AM-FE-2 | Web-safe каталоги id (`CORE_SYSTEM_IDS`, `CORE_REGION_IDS`, `LEADER_IDS`, `CORE_PIECE_TYPE_KEYS`) в `./schema` или `./board` | Zod-enum, i18n-тест, `core-layout.test` |
| AM-FE-3 | `systems[].remote` и `systems[].contested` в view (contested считает сервер) | D-1 — правило; UI не вычисляет |
| AM-FE-4 | `pieces[].arena`, `pieces[].immobile`; `systemId: null` — скрытая зона; лидер `location: 'pool' \| 'hiddenBase' \| <systemId>` | глифы, LOD, зона базы без утечки |
| AM-FE-5 | Формы `legalActions`: ACTIVATE на лидера (`systemIds`), MOVE на источник (`pieceIds` кандидатов) | подсветка и панели без логики правил |
| AM-FE-6 | `auto: true` в событиях хода AI; система базы в событиях для Империи → `null` | честная пометка авто-паса; журнал без утечки |
| AM-FE-7 | `SessionSummary.details` + `rulesEngine`, `time`, `reputation` (core) | «Старый прототип» и «Время N» в списке |
| AM-FE-8 | (опционально) handoff-view + `rulesEngine` (публичный факт) | точный бейдж на заслонке; без него — «Прототип» |
| AM-FE-9 | `packages/games/rebellion/src/board/core-layout.ts` и его тест — во владении FE Worker M (как assets в SWR-004) | визуальная раскладка — FE-зона; backend не правит этот файл |
| AM-FE-10 | Ответ команды содержит актуальный `status` сессии (или FE инвалидирует `detail` при GAME_OVER) | «Завершена» на столе без перезагрузки |

## 14. Вопросы к Analyst (Q-FE-n)

| ID | Вопрос | Предложение FE |
|---|---|---|
| Q-FE-1 | AC-12 «1024 и 768» — какие размеры? | 1024×768 и 768×1024 (прецедент SWR-004 Q-22) |
| Q-FE-2 | Показывать ли «вместимость N/M» в панели перемещения? | Только если сервер присылает числа в legal action; иначе нет (UI не считает R-5) |
| Q-FE-3 | Подтверждать ли «Пас»? | Да, только когда в пуле есть лидеры (два паса подряд завершают раунд — ошибка дорогая); без лидеров — сразу |
| Q-FE-4 | Как отличить лидера «в пуле» от лидера Повстанцев «на скрытой базе» для Империи? | `location` (AM-FE-4) |
| Q-FE-5 | Активация кликом по подсвеченной системе — сразу команда или с подтверждением? | Сразу (лидер уже выбран — двухшаговое намерение); клавиатурный путь — через явную кнопку |
| Q-FE-6 | Есть ли `status` в ответе команды? | AM-FE-10 |
| Q-FE-7 | Карта: показывать ли все юниты по отдельности на fit 768? | Нет: LOD compact (счётчики по сторонам), детали — при zoom; AC-12 требует системы и подписи, не каждый глиф |
| Q-FE-8 | Фаза `command` в ru — «Командование» (SWR-002) или «Приказы» (spec)? | «Приказы» везде, включая старые партии и заслонку (один словарь фаз); QA обновляет e2e, где проверяется текст |
| Q-FE-9 | Кто пишет ru-имена систем/лидеров? | FE Worker M по `docs/game-rules/rebellion-reference.md` (A-3); PO сверяет; i18n-тест гарантирует полноту |
| Q-FE-10 | Нужен ли перетаскиванием лидер из пула на карту, если есть клик? | Да (spec: «клик/перетаскивание»), но последним шагом M; если не успевает — клик + клавиатура закрывают AC-12 |

## 15. Предложение для `ux-decisions.md` §14 (SWR-005)

### 15.1 Стол core-v1 — 1440

```text
│← К игре│ Ход: □ Повстанцы (вы) · против AI · Обычная │ ◆Время 2 ··········○Реп. 14 │ Фаза: Приказы │[Завершить активацию]│[Пас]│ (⚗ Реальная карта; правила частично…) ✓ ⚙ │
┌──────────────────────────────── карта (fit) ─────────────────────────────┬────────── сайдбар 384 ──────────┐
│  ВНЕШНЕЕ КОЛЬЦО ...   ┌╌╌регион╌╌┐   ● Татуин ➜     ◉ Набу (активирована)│ ХОД                              │
│     ● Хот (удал. ◌)   ╎ ● Кашиик ╎    ■3 ▲2  ⚔         (ХС)             │ Активация: Набу · Хан Соло       │
│                       └╌╌╌╌╌╌╌╌╌╌┘                                       │ Из Татуина  ☑ Крестокрыл ☐ Пехота│
│  ┌╌ База Повстанцев — местоположение неизвестно ╌┐ (только Империя)      │ [Переместить (1) в Набу]         │
│  └╌ ■ ■ ▲ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘    [+][−][⤢] 46 %  ├──────────────────────────────────┤
│ Схема карты · собственная графика                                        │ КОНТЕКСТ … │ Журнал·Объекты·Партия│
└──────────────────────────────────────────────────────────────────────────┴──────────────────────────────────┘
```
768×1024: шапка 2–3 ряда / карта во всю ширину (LOD compact) / сайдбар ниже, вертикальная прокрутка.

### 15.2 Решения

| ID | Решение | Почему |
|---|---|---|
| D-SW5-1 | Новые партии — отдельный стол `core-v1`; старые — прежний стол без развития, бейдж «Старый прототип: тестовые правила» | AC-11; два движка не смешиваются в одном UI |
| D-SW5-2 | Поток хода живёт в панели «Ход» (верх сайдбара), кнопки «Завершить активацию»/«Пас» — в шапке (всегда видны) | главное действие не прячется за выбором объекта |
| D-SW5-3 | Активация: «взять» лидера → цели подсвечены → клик / drop / «Активировать» (клавиатура — Autocomplete + кнопка) | 2 шага мышью; клавиатурный путь без охоты по карте из 32 систем |
| D-SW5-4 | Перемещения: drag одиночного юнита на карте + панель с чекбоксами по источникам для групп (транспорт) | групповой ход «всё или ничего» нельзя выразить одним drag |
| D-SW5-5 | Вместимость и легальность не считаются в UI; отказ — понятный текст у fieldset, черновик сохраняется | инвариант «правила на сервере» |
| D-SW5-6 | Пас — с подтверждением, только если в пуле есть лидеры; фокус на «Отмена» | два паса подряд заканчивают раунд |
| D-SW5-7 | Регионы — тонированные полигоны с пунктирной границей и подписью UPPERCASE; удалённые системы — пунктирный контур; спорные — бейдж из двух штрихов + слово | признаки не только цветом (WCAG 1.4.1) |
| D-SW5-8 | Активированная система — сплошное кольцо цвета стороны + флажок + «активирована» в DOM | отличается от пунктира целей и белого выбора |
| D-SW5-9 | Подписи экранно-постоянные (13px), LOD compact ниже 65 % — счётчики по сторонам, drag выключен | читаемость 32 систем на 768 |
| D-SW5-10 | «Вписать» показывает всю карту при любом размере: масштаб может быть меньше `MIN_SCALE`, отступы адаптивные, refit при resize до первого ручного движения | закрывает SWR-004 O-2 |
| D-SW5-11 | Империя до раскрытия видит юниты базы в отдельной рамке вне галактики «База Повстанцев — местоположение неизвестно» | сценарий 2; без утечки, честно показано |
| D-SW5-12 | Трек: «Время N · Репутация M» текстом + шкала с двумя маркерами разной формы | AC-12; понятно, сколько до победы Повстанцев |
| D-SW5-13 | Авто-пас AI — запись журнала с чипом «авто» и пояснением «AI Commander ещё не реализован» + aria-live после хода игрока | AC-08: честно, а не «AI подумал» |
| D-SW5-14 | Итог — немодальный баннер поверх карты (победитель + причина + «К игре»), фокус на заголовок один раз; кнопки хода убраны | партию можно разглядывать после конца |
| D-SW5-15 | Бейдж среза: «Реальная карта; правила частично: раунд и активация. Бой, миссии, производство — позже» | AC-13; не заявлять полную поддержку |

---

## 16. Риски

| Риск | Митигация |
|---|---|
| Wire backend отличается от W-1..W-12 | один адаптер `viewModel.ts` + `coreFixtures.ts`; сверка с `plan-backend.md` до старта FE-0 |
| Fit на 768: подписи 32 систем перекрываются | экранно-постоянные подписи, проверка пересечений в `labelLayout.test` и e2e; layout карты раздвигается в `core-layout` (а не правится код) |
| Перегруженный сайдбар (Ход + Контекст + вкладки) на 900px высоты | TurnPanel `max-height: 45%` со своей прокруткой; контекст сворачивается при активации |
| Регрессия mock-стола из-за общих fit/selection изменений | изменения аддитивные; существующие тесты/e2e SWR-002..004 — регрессия; mock-стол вынесен в `LegacyTable` без логических правок |
| Утечка базы через UI-эвристику | UI не выводит базу ни из чего, кроме `rebelBase.systemId`/`systemId: null`; AC-10 сканирует ответы на сервере; тесты `viewModel`/`sceneModel` на фикстурах Империи |
| DOM → canvas drag лидера нестабилен в Playwright | клик и клавиатура — основной путь; drop лидера — отдельный e2e, не блокирует AC-12 (Q-FE-10) |
| Неточные ru-имена/топология | данные правит PO в файлах данных/локалей без кода; тест полноты |
| Пересечение файлов воркеров | владение §11 по файлам; общие точки — слоты-пропсы (`controls`, карта-заглушка) и API `viewModel` за S |
