# Plan — frontend (SWR-002 / TECH_PLANNING, `apps/web`)

**Автор:** frontend-lead · **Дата:** 2026-11-08 · **Статус:** design only — код не писался, ничего не устанавливалось.
**Входы (обязательны):** `specification.md` (Architecture contract + UX requirements — FROZEN; Clarifications A-1..A-19),
`test-cases.md` (Testability requirements R-9..R-19), `docs/architecture/blueprint.md` §3, §8.1–8.4.
**UX:** [`docs/product/ux-decisions.md`](../../product/ux-decisions.md) — решения `D-*`, на которые ссылается этот план.
**Backend plan:** `plan-backend.md` на момент написания отсутствовал → допущения по стыку с W0/backend перечислены в §11.

---

## 0. Инварианты (для всех FE-воркеров, нарушать нельзя)

1. `apps/web` **не импортирует** `game-core` (ни в коде, ни в `package.json`); из `game-data` — **только** entry `…/layout`
   (исключение — test-only файл проверки переводов, §7.4).
2. UI **не вычисляет легальность**. Цели хода берутся только из `view.legalActions`; допустимы лишь операции над множествами
   из него (поиск по `pieceId`, пересечение для группового хода, проверка «цель ∈ toSystemIds» при drop).
   `adjacentSystemIds` используется **только** для отрисовки линий соседства и списка «Соседи» (TC-ARCH-05). Функций
   `isLegal/canMove` в web нет.
3. Любое изменение партии — `POST /api/games/:id/commands`; создание — `POST /api/games`. Других мутаций нет (TC-E2E-31).
4. Кеш TanStack Query меняется **только** данными сервера (`CommandResult.view` или refetch). Оптимистичных записей в кеш нет.
5. Все строки — через i18n; литералов в JSX нет. Все `data-testid` — на английском и не зависят от языка.
6. Координаты — только из `mapLayout` + детерминированная раскладка внутри системы (UI). В `GameState` координат нет.
7. Никаких ассетов правообладателя: фигуры Konva + `@mui/icons-material`.

## 1. Структура `apps/web`

Повторяет blueprint (`app/`, `features/game-board`, `features/game-session`, `features/ai-opponent`, `shared/`)
плюс одна фича `features/game-setup` (меню «Новая партия/Продолжить» — отделено от стола, чтобы два воркера не делили
папку). Колонка **Owner** — владелец после W0 (см. §9).

```text
apps/web/
├── package.json · index.html · vite.config.ts · tsconfig*.json · vitest.config.ts       W0
└── src/
    ├── main.tsx                         W0 → FE-SHELL   createRoot + <App/>
    ├── vite-env.d.ts                    W0              + типы ImportMetaEnv (VITE_E2E)
    ├── test/setup.ts                    W0 → FE-SHELL   jest-dom, cleanup, localStorage reset
    ├── app/                                             FE-SHELL
    │   ├── App.tsx                      W0 stub → FE-SHELL
    │   ├── router.tsx                   createBrowserRouter: маршруты §2
    │   ├── providers/AppProviders.tsx   Theme+CssBaseline, QueryClientProvider, I18nextProvider, FeedbackHost
    │   ├── providers/queryClient.ts
    │   ├── layout/AppLayout.tsx         skip-link, <main id="main">, <Suspense>, RouteFocus
    │   ├── layout/RouteFocus.tsx        фокус на h1 при смене маршрута (D-A-8)
    │   ├── pages/MainMenuPage.tsx
    │   ├── pages/SettingsPage.tsx
    │   ├── pages/NotFoundPage.tsx
    │   └── theme/{tokens.ts, createAppTheme.ts, mui-augment.d.ts}
    ├── shared/                                          FE-SHELL
    │   ├── api/{http.ts, games.ts, queries.ts, errors.ts, index.ts}
    │   ├── i18n/{i18n.ts, translateError.ts, index.ts}
    │   ├── settings/{settingsStore.ts, useApplySettings.ts, index.ts}
    │   ├── feedback/{feedbackStore.ts, FeedbackHost.tsx, index.ts}
    │   ├── ui/{MockBadge.tsx, FactionChip.tsx, PieceGlyph.tsx, VisuallyHidden.tsx, index.ts}
    │   └── test/renderWithProviders.tsx
    ├── locales/
    │   ├── ru/{common,setup,settings,errors}.json       FE-SHELL
    │   ├── en/{common,setup,settings,errors}.json       FE-SHELL
    │   ├── ru/{session,board,gameData}.json             FE-TABLE
    │   └── en/{session,board,gameData}.json             FE-TABLE
    └── features/
        ├── game-setup/                                  FE-SHELL
        │   ├── index.ts                 public: NewGamePage, ContinueButton, RecentGamesList
        │   ├── NewGamePage.tsx
        │   ├── components/{FactionPicker,OpponentPicker,DifficultyPicker,ContinueButton,RecentGamesList}.tsx
        │   └── hooks/{useGamesList.ts, useCreateGame.ts}
        ├── game-session/                                FE-TABLE
        │   ├── index.ts                 W0 stub → FE-TABLE   public: GameTablePage
        │   ├── GameTablePage.tsx        W0 stub → FE-TABLE   маршрут /games/:id
        │   ├── hooks/{useGameView.ts, useSendCommand.ts}
        │   └── components/{SessionTopBar,PhaseIndicator,AdvancePhaseButton,SaveStatus,GameInfoPanel,GameNotFound}.tsx
        ├── game-board/                                  FE-TABLE
        │   ├── index.ts                 public: BoardView, BoardSidebar
        │   ├── model/{selectionStore.ts, viewportStore.ts, dragStore.ts, legal.ts, geometry.ts, pieceLayout.ts, constants.ts}
        │   ├── hooks/{useMoveController.ts, useBoardKeyboard.ts, useStageSize.ts, useBoardDebug.ts}
        │   ├── canvas/{BoardStage.tsx, ZoomControls.tsx, MapCaption.tsx}
        │   ├── canvas/layers/{MapBackgroundLayer,SystemsLayer,PiecesLayer,InteractionOverlayLayer}.tsx
        │   ├── canvas/nodes/{SystemNode,PieceNode,LinkLines}.tsx
        │   ├── panels/{ContextPanel,EmptyPanel,SystemPanel,PiecePanel,ActionsSection}.tsx
        │   └── sidebar/{BoardSidebar,SidebarTabs,BoardList,EventLog}.tsx + logMessage.ts
        └── ai-opponent/                                 FE-TABLE
            ├── index.ts
            └── AiStatusChip.tsx         placeholder «не активен в прототипе»
```

Алиас `@/` → `apps/web/src`. Межфичевые импорты — **только** через `index.ts` фичи (`@/features/game-setup`), shared —
через `@/shared/<module>`. `features/*` не импортируют `app/*` (кроме `@/app/theme/tokens` — токены).

## 2. Маршрутизация и провайдеры

React Router (data router, `createBrowserRouter`), декларативно в `app/router.tsx`:

| Path | Компонент | Источник | Примечание |
|---|---|---|---|
| `/` | `MainMenuPage` | `app/pages` | |
| `/games/new` | `NewGamePage` | `@/features/game-setup` | |
| `/games/:id` | `GameTablePage` | `@/features/game-session` — **lazy** | Konva в отдельном чанке |
| `/settings` | `SettingsPage` | `app/pages` | |
| `*` | `NotFoundPage` | `app/pages` | |

**Route → page контракт (замораживается W0-стабом):** файл `src/features/game-session/GameTablePage.tsx` экспортирует
`export function GameTablePage(): JSX.Element` (параметр `id` читает сам через `useParams`), `src/features/game-session/index.ts`
реэкспортирует его. Router подключает: `lazy(() => import('@/features/game-session').then(m => ({ default: m.GameTablePage })))`.
FE-SHELL не трогает `features/game-session/**`; FE-TABLE не трогает `app/router.tsx`.

Провайдеры (`AppProviders`, порядок снаружи внутрь): `I18nextProvider` → `QueryClientProvider` → `ThemeProvider`
(тема из `createAppTheme({ reduceMotion })`) + `CssBaseline` → `RouterProvider`; `FeedbackHost` (snackbar + единственная
aria-live область) рендерится внутри темы рядом с роутером. `useApplySettings()` синхронизирует язык, `<html lang>`,
`<html data-reduced-motion>`.

`QueryClient` defaults: `queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: (n, err) => n < 1 && !isClientError(err) }`,
`mutations: { retry: 0 }`. **Почему:** одна вкладка, один пользователь; фоновый refetch во время drag только мешает; 4xx не ретраим.

## 3. Разделение состояния

### 3.1 Серверное состояние — TanStack Query (FE-SHELL: `shared/api`; FE-TABLE: `game-session/hooks`)

Viewer **не передаётся** (Clarification A-3/A-4): `GET /api/games/:id` и `POST /api/games` возвращают `PlayerView` для
`setup.humanFaction`. Actor команды = `view.setup.humanFaction` (A-2).

Замороженные сигнатуры `shared/api` (FE-SHELL реализует первым шагом S1, FE-TABLE использует):

```ts
// shared/api/errors.ts
export class ApiError extends Error {
  status: number | null;            // null = сеть недоступна
  code?: 'ILLEGAL_COMMAND' | 'VERSION_CONFLICT' | 'NOT_FOUND' | 'VALIDATION' | string;
  messageKey?: string;
  details?: unknown;
}
export function isNotFound(e: unknown): boolean;
export function isClientError(e: unknown): boolean;   // 4xx

// shared/api/games.ts — каждая функция валидирует ответ Zod-схемой из contracts
export function createGame(setup: GameSetup): Promise<{ gameId: string; view: PlayerView }>;
export function listGames(): Promise<GameSummary[]>;          // GameSummary = элемент GET /api/games
export function getGameView(gameId: string): Promise<PlayerView>; // 404 → throw ApiError{status:404}
export function postCommand(gameId: string, envelope: CommandEnvelope): Promise<CommandResult>;
//   ↑ НЕ бросает для 400/404/409/422, если тело — CommandResult {ok:false}; бросает ApiError только для сети/5xx/непарсящегося тела.

// shared/api/queries.ts
export const gameKeys = {
  all: ['games'] as const,
  list: () => ['games', 'list'] as const,
  view: (gameId: string) => ['games', gameId, 'view'] as const,
};
export function gamesListQuery(): UseQueryOptions<GameSummary[]>;     // queryOptions(...)
export function gameViewQuery(gameId: string): UseQueryOptions<PlayerView>;
```

`http.ts`: `fetch` на относительный `/api/*` (Vite proxy), JSON, `AbortSignal` из Query, разбор тела ошибки.

Хуки:

| Хук | Владелец | Поведение |
|---|---|---|
| `useGamesList()` | FE-SHELL | `useQuery(gamesListQuery())`; меню: последняя = `[0]` (сервер сортирует по `updatedAt` desc), «Недавние» = `slice(0,5)` |
| `useCreateGame()` | FE-SHELL | `useMutation(createGame)`; onSuccess: `setQueryData(gameKeys.view(id), view)`, `invalidateQueries(gameKeys.list())`, `navigate('/games/'+id)` |
| `useGameView(gameId)` | FE-TABLE | `useQuery(gameViewQuery(id))` → `{ view, status: 'loading'|'ready'|'notFound'|'error', refetch }` |
| `useSendCommand(gameId)` | FE-TABLE | см. ниже |

```ts
// features/game-session/hooks/useSendCommand.ts
type CommandOutcome =
  | { ok: true; view: PlayerView; events: GameEvent[] }
  | { ok: false; code: string; messageKey: string; details?: unknown };
export function useSendCommand(gameId: string): {
  send(command: Command): Promise<CommandOutcome>;  // никогда не reject — сеть → { ok:false, code:'NETWORK', messageKey:'errors.network' }
  isPending: boolean;
};
```

Обработка результата (внутри `useSendCommand`, единообразно для панели, карты и списка):

| Ответ | Кеш | UI (делает вызывающий `useMoveController`) |
|---|---|---|
| 200 ok | `setQueryData(view(id), result.view)`; `invalidateQueries(list())` | snackbar success + announce; выбор остаётся на объекте |
| 409 VERSION_CONFLICT | `invalidateQueries(view(id))` → refetch | warning «Состояние обновилось…» (A-19); выбор сохраняется, если объект есть в новом view, иначе сброс |
| 422 ILLEGAL_COMMAND | без изменений | error по `messageKey`, откат превью |
| 400 / 404 | без изменений (404 → refetch, страница покажет «не найдена») | error по `messageKey` |
| сеть / 5xx | без изменений | error «Сервер недоступен» + action «Повторить» (повторяет тот же `send`) |

`envelope = { actor: view.setup.humanFaction, expectedVersion: view.version, command }` — из актуального кеша в момент `send`.
Повторный `send` при `isPending` игнорируется (D-P-7).

### 3.2 UI-состояние — Zustand

| Стор | Файл (владелец) | Состояние | Persist |
|---|---|---|---|
| settings | `shared/settings/settingsStore.ts` (FE-SHELL) | `language: 'ru'|'en'` (деф. `'ru'`), `reduceMotion: boolean` (деф. = `matchMedia('(prefers-reduced-motion: reduce)')`), сеттеры | **localStorage** ключ `swr.settings.v1` (zustand `persist`, `version: 1`) |
| feedback | `shared/feedback/feedbackStore.ts` (FE-SHELL) | очередь snackbar, текущее live-сообщение | нет |
| selection | `game-board/model/selectionStore.ts` (FE-TABLE) | `selection: {kind:'none'} | {kind:'system',systemId} | {kind:'piece',pieceId}`, `sidebarTab: 'log'|'objects'|'game'` | нет |
| viewport | `game-board/model/viewportStore.ts` (FE-TABLE) | `{scale,x,y}`, `stageSize`, `byGame: Record<gameId, Viewport>` (вид в памяти на сессию, D-I-12) | нет |
| drag | `game-board/model/dragStore.ts` (FE-TABLE) | `{ pieceId, overSystemId, overState: 'legal'|'illegal'|'none' } | null`, `pendingMove: { pieceIds, toSystemId } | null` | нет |

Правила: selection сбрасывается при смене `gameId`; при новом view — `reconcileSelection(view)` (если выбранного объекта/системы
больше нет → `none`). Селекторы — узкие (`useStore(s => s.selection)`), чтобы pan/zoom не перерисовывал панели.

Замороженный API feedback (FE-SHELL реализует, FE-TABLE вызывает; тексты передаются **уже переведёнными**):

```ts
// shared/feedback/index.ts
export function notify(n: { severity: 'success'|'info'|'warning'|'error'; message: string;
                            action?: { label: string; onClick: () => void } }): void; // также кладёт message в live-область
export function announce(message: string): void;  // только aria-live, без snackbar
```

`FeedbackHost`: MUI `Snackbar` (`data-testid="feedback"`, bottom-left, 4 с success/info, 6 с warning/error) +
**единственный** `<div role="status" aria-live="polite" data-testid="live-region">` (визуально скрыт) (R-12).

### 3.3 Производные данные (чистые функции, `game-board/model/legal.ts`, FE-TABLE)

```ts
moveTargetsForPiece(view, pieceId): string[]          // legalActions.find(MOVE_PIECES && pieceId).toSystemIds ?? []
groupMoveForSystem(view, systemId): { pieceIds: string[]; toSystemIds: string[] } | null
   // свои объекты системы, у которых есть MOVE_PIECES; цели = пересечение; null если <2 объектов или пусто
canAdvancePhase(view): boolean                        // legalActions.some(type === 'ADVANCE_PHASE')
highlightedSystemIds(view, selection, drag): string[] // цели выбранного объекта
```

Юнит-тест TC-WEB-06: при `adjacentSystemIds(S_A)=[S_B,S_D]` и `toSystemIds=[S_B]` подсвечивается только `S_B`.

## 4. Канвас (React Konva)

### 4.1 Слои (blueprint §8.2)

```text
<Stage draggable scale x y>                      // world-трансформация только на Stage
├── MapBackgroundLayer      listening=false, cache()   звёзды (детерминированный seed), слабая сетка
├── SystemsLayer                                     LinkLines (listening=false) + SystemNode × N
├── PiecesLayer                                      Group "units" · Group "leaders" · Group "tokens"
└── InteractionOverlayLayer listening=false          призрак исходного слота, snap-превью, кольцо drop ok/✕, спиннер pending
DOM поверх Stage: ZoomControls (+/−/вписать/%), MapCaption (mock), скрытая инструкция (aria-describedby)
```

Отклонение от blueprint: Units/Leaders/Tokens — `Group`-ы внутри одного `PiecesLayer`, а не три `Layer`.
**Почему:** каждый Konva Layer — отдельный `<canvas>`; 3 лишних холста не дают выгоды при < 100 объектах, а drag между
видами не нужен. Логическое разделение (и порядок отрисовки units < leaders < tokens) сохранено.

### 4.2 Координаты

- **World units:** координаты `mapLayout[systemId] = {x, y}` из `@swr/game-data/layout` используются как есть.
  Ожидание к game-data (§11): мир ~1600×1000, центры систем не ближе 180 единиц.
- **Bounds** = bbox центров систем ± `SYSTEM_RADIUS + ORBIT_RADIUS + 40` (вычисляется, в contracts не добавляется).
- **Экран:** `screen = world * scale + (x, y)` (Stage transform). Перевод экран→мир: `stage.getRelativePointerPosition()`.
- Система без записи в layout → не рисуется + `console.warn` в DEV (покрыто TC-ARCH-04 на стороне game-data).

### 4.3 Раскладка объектов внутри системы (`pieceLayout.ts`, чистая, детерминированная)

Константы (`constants.ts`): `SYSTEM_RADIUS = 34`, `ORBIT_RADIUS = 62`, `PIECE_SIZE = 20`, `PIECE_HIT = 30`,
`SLOT_STEP_DEG = 26`, `SLOTS_PER_SIDE = 7`, `SNAP_RADIUS = 70`, `MIN_SCALE = 0.4`, `MAX_SCALE = 2.5`,
`WHEEL_STEP = 1.1`, `BUTTON_STEP = 1.25`, `FIT_PADDING = 64`, `KEY_PAN = 80`, `DRAG_DISTANCE = 4`.

```ts
layoutPiecesInSystem(center: {x,y}, pieces: PieceView[]): { slots: Map<pieceId,{x,y}>; overflow: { empire: number; rebellion: number } }
```

- Сортировка: `owner` → `kind` (unit, leader, token) → `id` (стабильно, не зависит от порядка массива).
- Империя — левая дуга (центр 180°), Повстанцы — правая (центр 0°); слоты чередуются от центра дуги: 0, +1, −1, +2, −2…
  с шагом 26°, на радиусе `ORBIT_RADIUS` (ось y вниз).
- Больше 7 на сторону → лишние не рисуются; на внешнем радиусе дуги — чип «+N» (клик выбирает систему; полный список — в панели/списке).
- `previewSlotForMove(center, piecesAtTarget, movingPiece)` — тот же алгоритм на гипотетическом составе (snap-превью при drop).
- Юнит-тесты: детерминизм, отсутствие наложений (расстояние между слотами ≥ PIECE_SIZE), overflow.

### 4.4 Ноды

- **SystemNode:** круг `SYSTEM_RADIUS` (`board.systemFill` + оттенок региона, обводка `board.systemStroke`), название
  `t(nameKey, {ns:'gameData'})` под кругом; кольца: выбрано (двойное белое), цель (пунктир `legalTarget` + стрелка-значок),
  drop-illegal (красное + ✕); значок базы (если `view.rebelBase.systemId === id`). `onClick/onTap` → `handleSystemClick`.
- **PieceNode:** `Group` в позиции слота; невидимый hit-rect `PIECE_HIT`; фигура по виду (квадрат/круг/ромб), Империя —
  заливка `faction.empire`, Повстанцы — контур 3px `faction.rebellion` на тёмной заливке; `typeKey === 'unknown'` /
  `hidden` → пунктир + «?». `draggable = isOwn && moveTargets.length > 0 && !pendingMove`. Узлы `React.memo` по (piece, slot, flags).
- Рендер-производительность: `perfectDrawEnabled={false}` у фигур, `listening={false}` у декора, фон кешируется;
  pan/zoom меняет только props `Stage` — слои не ре-рендерятся (селекторы стора).

### 4.5 Жесты (контракт событий, D-I-1..D-I-12)

- `Konva.dragDistance = DRAG_DISTANCE (4)` глобально в `BoardStage` → клик и drag различаются по порогу A-10.
- `Stage draggable` = pan. Konva не начинает drag предка, если drag начат у draggable-потомка (у PieceNode) — поэтому
  жест с подвижного объекта двигает объект, с любого другого места — карту. Во всех Stage-обработчиках drag:
  `if (e.target !== e.target.getStage()) return;`. **Worker обязан проверить это вручную в DEV первым делом** (риск §12).
- `Stage onDragMove/onDragEnd` (target = stage) → `viewportStore.setPosition`.
- `Stage onClick/onTap`, если `e.target === stage` → `clearSelection()` (клик < 4px по пустому месту). Фон `listening=false`,
  поэтому клик по фону попадает в Stage.
- `SystemNode click`: если `selection.kind==='piece'` и `systemId ∈ moveTargets` → `moveController.move(...)`; иначе
  `selectSystem`. `e.cancelBubble = true`.
- `PieceNode click` → `selectPiece`; `dragstart` → `selectPiece` + `dragStore.start`; `dragmove` → мировая точка курсора →
  ближайшая система в `SNAP_RADIUS` (геометрия, не правило) → `overState = target ∈ moveTargets ? 'legal' : 'illegal'`;
  `dragend` → `moveController.drop(...)`. Все piece-события с `cancelBubble = true`.
- `Stage onWheel` → `preventDefault`, `zoomAt(pointer, deltaY < 0 ? WHEEL_STEP : 1/WHEEL_STEP)` с clamp.
- Клавиатура (`useBoardKeyboard`, на контейнере с `tabIndex=0`): стрелки, `+ = −`, `0`, `Esc`. Глобальный `Esc`
  (document) — снять выбор, если фокус не в `input/textarea/[role=menu]`; во время drag — `node.stopDrag()` + откат.
- Курсор: управляется через `stage.container().style.cursor` по hover-состоянию (только косметика).
- Zoom-анимация: tween 150 мс; при `reduceMotion` — мгновенно.

### 4.6 Drag preview и откат (`useMoveController`, единая точка для панели, карты и списка)

```ts
useMoveController(gameId): {
  move(pieceIds: string[], fromSystemId: string, toSystemId: string): Promise<void>; // кнопки, клик по цели, список
  drop(node: Konva.Node, pieceId: string): Promise<void>;                            // из PieceNode.dragend
  isPending: boolean;
}
```

`drop`:
1. `over === null` или `over === fromSystemId` → `node.position(originSlot)` (tween/мгновенно), announce «Перемещение отменено».
2. `overState === 'illegal'` → **без запроса** (A-16): откат + `notify(error, t('board:move.illegalTarget', {system}))`.
3. `overState === 'legal'` → `node.position(previewSlot)`, `dragStore.pendingMove = {...}` (opacity 0.6 + спиннер в Overlay) →
   `send(MOVE_PIECES)`; успех → позиция придёт из нового view; отказ → откат + сообщение.
4. **Всегда** в `finally`: `node.position(computedSlotFromCurrentView)` и `dragStore.clear()`. **Почему:** react-konva не
   сбросит позицию узла, если props `x/y` не изменились (Konva мутировал узел при drag) — без явного сброса объект «залипнет».

`move` (без drag) — тот же путь с шага 3, без работы с узлом. Тексты успеха: `board:move.success` «{{piece}} → {{system}}»
(групповой — `board:move.successGroup_*`). После успеха фокус → заголовок контекстной панели (D-C-6).

## 5. Компоненты стола (FE-TABLE)

`GameTablePage` (`data-testid="game-table"`, `data-game-id`, `data-version` = `view.version`, R-10):

```text
<Box grid: rows 56px / 1fr; cols 1fr / 384px; height 100dvh>
  <SessionTopBar view />                         // ← Меню, стороны, round-indicator, phase-indicator[data-phase], advance-phase, mock-badge, SaveStatus, ⚙
  <BoardView view />                             // BoardStage + ZoomControls + MapCaption
  <BoardSidebar view>                            // ContextPanel (верх, scroll) + SidebarTabs (низ, scroll)
</Box>
```

- `ContextPanel` (`context-panel`, `data-state`) → `EmptyPanel` | `SystemPanel` (`system-panel`) | `PiecePanel` (`piece-panel`);
  внутри — `ActionsSection` (`action-panel`): кнопки `action-move-<pieceId>-<toSystemId>`; групповой ход системы —
  `action-move-all-<fromSystemId>-<toSystemId>`; «Завершить фазу (mock)» в EmptyPanel — `advance-phase-panel`.
- `SidebarTabs`: вкладки `sidebar-tab-log|objects|game`; `EventLog` (`event-log`, `role="log"`, `aria-live="off"`,
  элементы `event-log-item` с `data-seq`, новые сверху); `BoardList` (§6.2); `GameInfoPanel` (+ `AiStatusChip`).
- `logMessage.ts`: `(event, t) => string` по `event.type` (`board:log.<TYPE>`), неизвестный тип → `board:log.unknown`.
  Ожидаемые типы: `GAME_CREATED`, `PIECES_MOVED`, `PHASE_ADVANCED` (подтвердить с backend, §11).
- `GameNotFound` (`game-not-found`) при 404; загрузка — skeleton + `aria-busy`.

## 6. Тестопригодность

### 6.1 `data-testid` (R-10, плюс дополнения FE)

Конвенция: kebab-case `<область>-<элемент>[-<id>]`, id — сырые id из view; testid не зависят от языка; состояние —
в `data-*`/ARIA, не в testid.

| Экран | testid |
|---|---|
| Меню | `menu-new-game`, `menu-continue`, `menu-settings`, `recent-games`, `recent-game-<gameId>` |
| Новая партия | `setup-faction-empire`, `setup-faction-rebellion`, `setup-opponent-ai`, `setup-opponent-human`, `setup-difficulty` (группа; опции `setup-difficulty-easy|normal|hard`), `setup-start`, `setup-error` |
| Стол | `game-table` (`data-game-id`, `data-version`), `round-indicator`, `phase-indicator` (`data-phase`), `advance-phase`, `mock-badge`, `save-status` (`data-status`), `board-canvas` (контейнер: `aria-label`, `data-scale`), `zoom-in`, `zoom-out`, `zoom-fit`, `zoom-level`, `context-panel` (`data-state`), `system-panel`, `piece-panel`, `action-panel`, `action-move-<pieceId>-<toSystemId>`, `action-move-all-<from>-<to>`, `event-log`, `event-log-item` (`data-seq`), `sidebar-tab-log|objects|game`, `board-list`, `system-item-<systemId>`, `piece-item-<pieceId>`, `game-not-found` |
| Общие | `feedback` (snackbar), `live-region` |
| Настройки | `settings-language` (RadioGroup; опции `settings-language-ru|en`), `settings-reduce-motion` |

### 6.2 Доступный список (`BoardList`, R-9)

```html
<ul data-testid="board-list" aria-label="Системы и объекты">
  <li>
    <button data-testid="system-item-S" aria-selected="false" aria-current="false" data-highlighted="true">
      Ардан · 3 объекта · допустимая цель</button>
    <button data-testid="system-item-S-move">Переместить сюда</button>        <!-- только если highlighted -->
    <ul><li><button data-testid="piece-item-P" data-system-id="S" aria-selected="true">Крейсер · Империя</button></li></ul>
  </li>
</ul>
```

Клик/Enter вызывают те же `selectSystem/selectPiece/moveController.move`. `aria-selected` у выбранного, `aria-current="true"`
дублирует (для кнопок вне grid/listbox `aria-selected` формально не валиден — поэтому оба; QA проверяет любой из них).
Список рендерится всегда (вкладка неактивна → `hidden`, но Playwright переключает вкладку `sidebar-tab-objects`;
skip-link «К списку объектов» делает то же).

### 6.3 Debug-хук `window.__boardDebug` (R-11)

**Почему нужен:** canvas не имеет DOM; для AC-5 (числовой масштаб/сдвиг, пределы) и drag-сценариев (TC-E2E-11/12/18/19 —
реальный `page.mouse` drag нуждается в экранных координатах объекта и системы) без хука остаётся только пиксельное
сравнение — хрупко. Хук только читает: обойти UI через него нельзя, поэтому он не подрывает E2E.

- Подключение: `if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') { … }` в `useBoardDebug.ts`, вызывается из
  `BoardStage`; модуль реализации импортируется динамически внутри условия → при production-сборке без флага код
  вырезается (TC-ARCH-08: `grep __boardDebug apps/web/dist` пусто).
- API (все функции синхронные, возвращают копии):

```ts
interface BoardDebug {
  getViewport(): { scale: number; x: number; y: number };
  getZoomLimits(): { min: number; max: number };
  getSystemScreenPos(systemId: string): { x: number; y: number } | null;   // page-координаты (для page.mouse)
  getPieceScreenPos(pieceId: string): { x: number; y: number } | null;
  getSelection(): { kind: 'system' | 'piece' | null; id: string | null };
  getHighlightedSystemIds(): string[];
  isDragging(): boolean;
}
```

page-координаты = `stage.container().getBoundingClientRect()` + world·scale + offset (+ `window.scrollX/Y`, у стола 0).
Дополнительно DOM-зеркало без хука: `board-canvas[data-scale]`, `zoom-level` (текст %), `zoom-in/out[disabled]` на пределах.

### 6.4 Vitest (FE)

| Набор | Что | Владелец |
|---|---|---|
| unit | `geometry` (zoomAt сохраняет точку под курсором, clamp, fit содержит все системы), `pieceLayout`, `legal` (TC-WEB-06/07), `logMessage`, `translateError`, `http`/`games` (мок fetch: разбор CommandResult для 409/422, ApiError для сети) | FE-TABLE / FE-SHELL по файлам |
| component (RTL, jsdom, мок `fetch`) | меню (TC-WEB-01..03), NewGamePage (TC-WEB-04/05), Settings (TC-WEB-10), ContextPanel/ActionsSection (TC-WEB-06/07), useSendCommand 422/409 (TC-WEB-08/09), mock-метки (TC-WEB-11) | по владельцу компонента |
| i18n | все namespace: множества ключей ru == en; все `nameKey/typeKey/regionId` сценария имеют перевод (test-only импорт сценария из `@swr/game-data`) | FE-SHELL (своих ns) / FE-TABLE (своих ns) |

Konva в jsdom **не рендерим** (нужен нативный `canvas`): `BoardStage` тонкий, логика — в чистых модулях; canvas проверяет
Playwright. Мок API — подмена `globalThis.fetch` в `renderWithProviders` (без MSW — меньше зависимостей).
Команда: `pnpm --filter ./apps/web test`.

E2E-спеки пишет QA; FE отвечает за перечисленные selectors/hook и за то, что `VITE_E2E=1` включает хук.

## 7. i18n

### 7.1 Инициализация (`shared/i18n/i18n.ts`, FE-SHELL)

Ресурсы собираются **автоматически**: `import.meta.glob('../../locales/*/*.json', { eager: true })` → `resources[lng][ns]`.
**Почему:** добавление namespace не требует правки `i18n.ts` → FE-TABLE не трогает файлы FE-SHELL, стабы локалей у W0 не нужны.
`lng` = `settingsStore.language` (деф. `ru`, не из браузера — R-19), `fallbackLng: 'ru'`, `defaultNS: 'common'`,
`interpolation.escapeValue: false`, `returnNull: false`.

### 7.2 Namespaces и владельцы

| NS | Владелец | Содержимое |
|---|---|---|
| `common` | FE-SHELL | имя приложения, навигация, общие кнопки, `mock.*`, фракции, виды объектов, фазы (`phase.assignment|command|refresh`), сложности |
| `setup` | FE-SHELL | меню, новая партия, недавние партии |
| `settings` | FE-SHELL | экран настроек |
| `errors` | FE-SHELL | серверные `messageKey` + `code.*` + `network`, `unknown` |
| `session` | FE-TABLE | шапка стола, сохранение, вкладка «Партия», AI-статус, not-found |
| `board` | FE-TABLE | карта, zoom, панели, действия, список, журнал (`log.*`), сообщения ходов (`move.*`) |
| `gameData` | FE-TABLE | `systems.*`, `regions.*`, `pieces.*` по ключам game-data |

Фразы `common` (фракции, фазы, виды) FE-TABLE **использует**, но не меняет; нужен новый общий ключ → FE-TABLE заводит его в
своём ns. Литералы в JSX запрещены ESLint (R-15, §9 W0).

### 7.3 Ошибки (`translateError`, FE-SHELL)

`translateError(t, { code, messageKey, details })`: `messageKey` вида `errors.<name>` → ключ `errors:<name>` (префикс `errors.`
отрезается); нет перевода → `errors:code.<CODE>`; нет → `errors:unknown`. Ожидаемые ключи (из спецификации/тест-кейсов):
`errors.illegalMove`, `errors.notYourSide`, `errors.versionConflict`, `errors.notFound`, `errors.validation`; полный список —
от backend (§11).

### 7.4 Ключи game-data

`t(system.nameKey, { ns: 'gameData' })` — `nameKey` используется как путь внутри `gameData.json` (предполагаемый формат
`systems.<id>`); регион — `regions.<regionId>`; тип объекта — `pieces.<typeKey>`; `typeKey === 'unknown'` → `board:piece.unknown`.

## 8. Тема (FE-SHELL), используемая столом

`app/theme/tokens.ts` экспортирует константы из `ux-decisions.md` §7; `mui-augment.d.ts` добавляет в `Palette`:
`faction: { empire: string; rebellion: string }`, `board: { background, star, link, systemFill, systemStroke, label,
selected, legalTarget, invalidTarget }`, `mock: { main }`, `focus: string`. **Имена замораживаются этим планом** —
FE-TABLE читает их через `useTheme()` для Konva-цветов. `createAppTheme({ reduceMotion })`: dark mode, shape radius 6,
при `reduceMotion` — `transitions.create = () => 'none'` и `disableRipple`. Глобальный `:focus-visible` из D-A-5.

Общие UI-компоненты (FE-SHELL, замороженные props): `MockBadge({ labelKey?: string })`, `FactionChip({ faction, size? })`,
`PieceGlyph({ kind, owner, hidden?, size? })` (SVG-фигура той же формы, что на canvas — для панелей/списка),
`VisuallyHidden({ children })`.

## 9. Подзадачи и владение файлами

### W0 — foundation (планирует backend-lead). Что нужно от W0 в `apps/web`

| Файл | Содержимое | После W0 |
|---|---|---|
| `apps/web/package.json` | name `@swr/web`; scripts `dev`, `build` (`tsc -b && vite build`), `preview`, `test` (`vitest run`), `typecheck`, `lint`; deps ниже | только W0/lead (зависимости меняются через лида) |
| `apps/web/index.html` | `<html lang="ru">`, `#root`, `<title>` | FE-SHELL |
| `apps/web/vite.config.ts` | react plugin; alias `@`→`src`; `server.port` = `WEB_PORT ?? 5173` (strictPort); proxy `/api` → `API_URL ?? http://localhost:3000` (e2e: 5174 → 3100, A-17); `preview` с тем же proxy | W0/lead |
| `apps/web/vitest.config.ts` | jsdom, `setupFiles: src/test/setup.ts`, alias `@` | W0/lead |
| `apps/web/tsconfig.json` (+ `tsconfig.node.json`) | strict, `jsx: react-jsx`, `paths @/*`, `resolveJsonModule`, `types: ["vite/client"]` | W0/lead |
| `apps/web/src/main.tsx` | `createRoot(#root).render(<StrictMode><App/></StrictMode>)` | FE-SHELL |
| `apps/web/src/vite-env.d.ts` | `/// <reference types="vite/client" />` + `ImportMetaEnv { VITE_E2E?: string }` | FE-SHELL |
| `apps/web/src/app/App.tsx` | стаб `export function App() { return null }` (build зелёный) | FE-SHELL |
| `apps/web/src/test/setup.ts` | `@testing-library/jest-dom/vitest` | FE-SHELL |
| `apps/web/src/features/game-session/index.ts` + `GameTablePage.tsx` | стаб `export function GameTablePage() { return null }` + реэкспорт (route → page контракт §2) | FE-TABLE |

Зависимости `apps/web` (последние стабильные, совместимые с Node 20.19): `react`, `react-dom`, `react-router`,
`@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`, `@tanstack/react-query`, `zustand`, `konva`,
`react-konva` (мажор совместим с версией React), `i18next`, `react-i18next`, `zod` (если не транзитивно через contracts),
`@swr/contracts` и `@swr/game-data` (`workspace:*`). Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `jsdom`,
`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `@types/react`, `@types/react-dom`.
**Не нужны:** `canvas`, `vitest-canvas-mock`, MSW, шрифтовые пакеты.

Корневые требования к W0, касающиеся web: ESLint `no-restricted-imports` для `apps/web` на `@swr/game-core` и на
`@swr/game-data` кроме `@swr/game-data/layout` (с override для `**/*.i18n.test.ts`) (R-15, TC-ARCH-01);
`i18next/no-literal-string` (или `react/jsx-no-literals`) для `apps/web/src/**/*.tsx` кроме тестов; Playwright `webServer`
передаёт `VITE_E2E=1`, `WEB_PORT=5174`, `API_URL=http://localhost:3100` (R-16, A-17).
Пакеты: `@swr/contracts` экспортирует Zod-схемы и типы (R-4), `@swr/game-data/layout` — `mapLayout` (R-3).

### FE-SHELL — app shell (frontend-worker)

- **OWNED FILES:** `apps/web/index.html`, `apps/web/src/main.tsx`, `apps/web/src/vite-env.d.ts`, `apps/web/src/test/**`,
  `apps/web/src/app/**`, `apps/web/src/shared/**`, `apps/web/src/features/game-setup/**`,
  `apps/web/src/locales/{ru,en}/{common,setup,settings,errors}.json`.
- **Шаги:** S1 (первым, разблокирует FE-TABLE) — `shared/api/*`, `shared/feedback/*`, `shared/settings/*`, `shared/i18n/*`,
  `app/theme/*`, `shared/ui/*` с замороженными сигнатурами §3/§7/§8 → S2 — провайдеры, router, layout, RouteFocus →
  S3 — MainMenu (Continue + Recent, A-1), NewGamePage, Settings, NotFound → S4 — тесты TC-WEB-01..05, 10, unit api/i18n.
- **DONE WHEN:** маршруты §2 работают; TC-WEB-01..05, 10 зелёные; `pnpm --filter ./apps/web typecheck|lint|test` — 0;
  ru/en ключи совпадают; `<html lang>` и `data-reduced-motion` синхронизированы; ключ localStorage `swr.settings.v1` задокументирован в README-секции web (через лида).

### FE-TABLE — игровой стол (frontend-worker)

- **OWNED FILES:** `apps/web/src/features/game-session/**`, `apps/web/src/features/game-board/**`,
  `apps/web/src/features/ai-opponent/**`, `apps/web/src/locales/{ru,en}/{session,board,gameData}.json`.
- **Шаги:** T1 (не зависит от S1) — `model/*` (stores, geometry, pieceLayout, legal) + unit-тесты; `BoardStage` и слои на
  фикстурном `PlayerView`, проверка жестов pan vs drag в DEV → T2 (после S1) — `useGameView`, `useSendCommand`,
  `useMoveController`, `GameTablePage`, SessionTopBar → T3 — ContextPanel/Actions, BoardList, EventLog, GameInfo,
  debug-хук, клавиатура → T4 — тесты TC-WEB-06..09, 11, i18n gameData.
- **DONE WHEN:** сценарии 3–7 спецификации проходят вручную в DEV; TC-WEB-06..09, 11 зелёные; все testid §6.1 и хук §6.3
  на месте; `pnpm --filter ./apps/web build` и `grep -r __boardDebug apps/web/dist` пусто; typecheck/lint/test — 0.

### Пересечения и зависимости

```text
W0 (scaffold + стабы) ──▶ FE-SHELL S1 (interfaces) ──▶ FE-SHELL S2..S4
        │                         │
        └──▶ FE-TABLE T1 ─────────┴──▶ FE-TABLE T2..T4 ──▶ INTEGRATION (frontend-lead) ──▶ QA e2e
```

- Общих файлов у FE-SHELL и FE-TABLE **нет**. Точки стыка — только чтение: FE-TABLE импортирует `@/shared/*`,
  `@/app/theme/tokens`; FE-SHELL импортирует `@/features/game-session` (только `GameTablePage`) и ничего из `game-board`.
- Нужна правка чужого файла (новый общий компонент, ключ `common`, поле в теме) → остановиться и запросить у лида; лид
  поручает владельцу или делает сам при интеграции.
- `apps/web/package.json` и конфиги после W0 меняет только frontend-lead (через интеграцию), чтобы воркеры не конфликтовали.

## 10. Proposed amendments (к замороженному контракту — **только предложения**, не применять без Analyst/BE)

- **PA-1. Типизированные события в contracts.** `GameEvent` — discriminated union по `type`:
  `GAME_CREATED {}`, `PIECES_MOVED { pieceIds; fromSystemId; toSystemId }`, `PHASE_ADVANCED { round; phase }` + Zod.
  **Почему:** журнал рендерит текст по payload; `payload: unknown` заставит UI гадать и ломаться молча.
- **PA-2. Каталог `messageKey` в contracts** (`ErrorMessageKey` enum: `errors.illegalMove`, `errors.notYourSide`,
  `errors.versionConflict`, `errors.notFound`, `errors.validation`, …). **Почему:** проверяемое соответствие ключей сервера
  и `errors.json` (тест i18n), нет немых фолбэков.
- **PA-3. `PieceView` с `typeKey: string | 'unknown'`** и явное поле `GameSummary` в contracts (схема ответа `GET /api/games`).
  **Почему:** web валидирует ответы Zod-схемами; без схемы списка нечем валидировать.
- **PA-4. (низкий приоритет) Формат `nameKey`** — `systems.<id>`; регионы — `regions.<regionId>`. Фиксирует стык game-data ↔ locales.

Изменений, ломающих A-1..A-19, не предлагается.

## 11. Допущения о стыке с backend/W0 (plan-backend.md не было на момент написания)

1. Пакеты называются `@swr/contracts`, `@swr/game-data` (entry `@swr/game-data/layout`); web — `@swr/web`. Иначе — механическая замена.
2. `contracts` экспортирует типы и Zod-схемы `GameSetup`, `PlayerView`, `Command`, `CommandEnvelope`, `CommandResult`,
   `GameEvent`, `Faction`, `Phase`, а также схему элемента `GET /api/games` (см. PA-3).
3. Тела ошибок `/commands` — строго `CommandResult {ok:false}` (R-8); для `GET /api/games/:id` 404 — `{ error: { code:'NOT_FOUND', messageKey } }`.
4. `mapLayout`: world units, мир ~1600×1000, мин. расстояние между центрами 180; есть запись для каждой системы (TC-ARCH-04).
5. Типы событий: `GAME_CREATED`, `PIECES_MOVED`, `PHASE_ADVANCED`.
6. W0 создаёт файлы §9 «W0» и корневые ESLint/Playwright-настройки; e2e — web 5174 / api 3100 через env (A-17).

## 12. Риски

| Риск | Митигация |
|---|---|
| Pan (Stage draggable) и drag объекта конфликтуют | Порог 4px, фильтр `e.target === stage`, ручная проверка в T1 до остальной работы; запасной план — Stage не draggable, pan вручную по pointerdown/move на Stage |
| «Залипание» узла после отката | Обязательный `node.position(...)` в `finally` (§4.6) |
| Медленный рендер при zoom | Трансформация только Stage, memo нод, кеш фона |
| Дрейф ключей i18n ru/en и game-data | Тест равенства множеств ключей и полноты `gameData` |
| `aria-selected` на `<button>` не валиден по ARIA | Дублируем `aria-current`; при интеграции решить с QA, оставлять ли оба |
