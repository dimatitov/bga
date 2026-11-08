# Plan — frontend (SWR-003 / TECH_PLANNING, `apps/web`)

**Автор:** frontend-lead · **Дата:** 2026-11-08 · **Статус:** design only — код не писался, ничего не устанавливалось.
**Входы:** `specification.md` (Architecture contract — FROZEN), `request.md`, `docs/tasks/SWR-002/plan-frontend.md` (структура,
инварианты и testid SWR-002 — сохраняются, если ниже не сказано иное), текущий `apps/web/src`, `e2e/support/testids.ts`.
**UX:** [`docs/product/ux-decisions.md`](../../product/ux-decisions.md) §12 «Каталог и страница игры (SWR-003)» — решения `D-CAT-*`,
`D-GP-*`, `D-NS-*`, `D-SH-*`, `D-HDR-*`, на которые ссылается этот план.
**Clarifications Q-1..Q-25** (`specification.md`, Analyst) и **Testability TR-1..TR-10** (`test-cases.md`, QA) —
обязательны; план выровнен по ним (testid — дословно TR-1, props экранов — TR-5, поведение — Q-1, Q-2, Q-10..Q-17, Q-19,
Q-20, Q-22). Сводка соответствия — §14.
**Backend plan:** `plan-backend.md` появился к концу планирования; план выровнен по нему (§12 — сверка: что принято, где
расхождения). Первые версии допущений заменены ссылками на его разделы. Порядок: **W0-R** (backend worker: `@swr/*` → `@bga/*`, перенос пакетов, правка импортов `apps/web`
без изменения поведения) выполняется **до** любых FE-работ этого плана.

---

## 0. Инварианты (для всех FE-воркеров)

1. Все инварианты SWR-002 (§0 старого плана) остаются: UI не вычисляет легальность, кеш меняется только данными сервера,
   литералов в JSX нет, testid не зависят от языка, ассетов правообладателя нет.
2. **Граница платформа ↔ игра (AC-5(в)).** `src/app/**`, `src/shared/**`, `src/platform/**` не импортируют `@bga/game-*`
   и не импортируют `@/games/<id>/**`; из папки `games/` им доступен **только** `@/games/registry`.
   Папка игры (`src/games/<id>/**`) может импортировать `@/platform` (публичный `index.ts`), `@/shared/*`, `@/games/types`
   и свой игровой пакет — только subpath `./definition`, `./schema`, `./board`, `./assets`; другие игры — никогда.
3. **Платформа не знает про фракции, фазы, системы.** `view` сессии для платформы — `unknown`; типизирует и парсит его
   только игра своей схемой.
4. Добавление игры = пакет + запись в `apps/web/src/games/registry.ts` (+ её папка `src/games/<id>/`). Маршруты, хост
   сессии, каталог, страница игры, API-клиент сессий не меняются (проверяется тестом с фиктивной записью, §8).
5. Реестр — обычный типизированный массив; экраны — `React.lazy` (code-splitting), никакой загрузки игр по имени (AC-9).

## 1. Целевая структура `apps/web/src`

Колонка справа — владелец после P1 (§10). `→` = файл перемещается из SWR-002 (git mv), `new` = новый, `del` = удаляется.

```text
src/
├── main.tsx · vite-env.d.ts · test/setup.ts                              FE-PLATFORM
├── app/                                                                  FE-PLATFORM
│   ├── App.tsx
│   ├── router.tsx                 маршруты §2 (единственный файл маршрутов; игры его не трогают)
│   ├── router.test.tsx
│   ├── providers/AppProviders.tsx  + prop `registry?` → GameRegistryProvider
│   ├── providers/queryClient.ts
│   ├── layout/AppLayout.tsx        skip-link, Suspense, RouteFocus, errorElement-обёртка
│   ├── layout/PlatformLayout.tsx   new: AppHeader + <main id="main"> (каталог, страница игры, new, settings, 404)
│   ├── layout/SessionLayout.tsx    new: только <main id="main"> (полноэкранный стол)
│   ├── layout/AppHeader.tsx        new: бренд-ссылка в каталог + ⚙ настройки (D-HDR-1..3)
│   ├── layout/RouteError.tsx       new: ошибка загрузки lazy-чанка / неожиданная ошибка маршрута
│   ├── layout/RouteFocus.tsx
│   ├── pages/SettingsPage.tsx(+test) · pages/NotFoundPage.tsx
│   ├── pages/MainMenuPage.tsx(+test) · pages/LazyGameTablePage.tsx                         del (P1)
│   └── theme/{tokens.ts, createAppTheme.ts, mui-augment.d.ts}  только платформенные токены (P4 убирает faction/board)
├── shared/                                                               FE-PLATFORM (кроме отмеченного)
│   ├── api/{http.ts, errors.ts, index.ts}   транспорт и ApiError — без изменений
│   ├── api/{games.ts, games.test.ts, queries.ts}                         del (P4, после FE-MOVE)
│   ├── i18n/{i18n.ts, translateError.ts(+test), locales.test.ts, index.ts}  glob расширен на games/*/locales (§5)
│   ├── settings/** · feedback/**                                          без изменений
│   ├── ui/{MockBadge.tsx, VisuallyHidden.tsx}                             без изменений
│   ├── ui/{FactionChip.tsx, PieceGlyph.tsx} → games/rebellion/ui/          FE-MOVE
│   ├── ui/index.ts                                                         FE-MOVE (убирает два реэкспорта)
│   └── test/{renderWithProviders.tsx, mockFetch.ts, index.ts}             + опция `registry`
│       test/fixtures.ts                                                    del (P4; Rebellion-фикстуры → games/rebellion/test)
├── platform/                                                             FE-PLATFORM, new
│   ├── index.ts                    публичный API для игр: paths, sessions api/queries/hooks, типы экранов (реэкспорт)
│   ├── paths.ts                    catalog '/', game(id), newSession(id), session(id), settings
│   ├── registry/GameRegistryContext.tsx   GameRegistryProvider, useGameRegistry(), useGameEntry(gameId)
│   ├── registry/selectors.ts(+test)       findGameEntry, catalogOrder, gameMetaNs
│   ├── sessions/api.ts(+test)             createSession, listSessions, getSession, postSessionCommand (§3)
│   ├── sessions/queries.ts                sessionKeys, sessionQuery, sessionsListQuery
│   ├── sessions/useCreateSession.ts       mutation → cache → navigate(replace) (D-NS-3)
│   ├── sessions/useGameSessions.ts        список сессий игры → { latest, recent(≤5) }
│   ├── sessions/formatRelativeTime.ts     ← features/game-setup/lib/formatRelativeTime.ts (копия, оригинал удалит FE-MOVE)
│   ├── ui/{GameCover, GameStatusChip, GameMeta}.tsx · ui/formatPlayers.ts(+test) · ui/useGameText.ts
│   ├── catalog/{CatalogPage, GameCard}.tsx + CatalogPage.test.tsx
│   ├── game-page/{GamePage, GameHero, GameActions, RecentSessions, ComingSoonNotice, GameNotFound}.tsx + GamePage.test.tsx
│   ├── new-session/NewSessionPage.tsx + NewSessionPage.test.tsx
│   ├── session-host/{SessionHost, SessionNotFound, SessionUnsupported, SessionLoading}.tsx + SessionHost.test.tsx
│   ├── extensibility.test.tsx      AC-5(б): фиктивная игра через реальные routes + injected registry
│   └── test/fakeGame.tsx           makeFakeGameEntry(), fake Setup/Table screens, makeSessionSummary/Envelope
├── games/
│   ├── types.ts                    WebGameEntry, SetupScreenProps, TableScreenProps, GameCover (§4)     FE-PLATFORM
│   ├── registry.ts                 gameRegistry + реэкспорт типов                                       FE-PLATFORM
│   ├── registry.test.ts            инварианты реестра                                                   FE-PLATFORM
│   ├── forbidden-stars/            entry.ts (definition + cover), locales/{ru,en}/meta.json              FE-PLATFORM
│   └── rebellion/                  (стаб entry.ts создаёт P1, дальше)                                   FE-MOVE
│       ├── entry.ts                rebellionEntry: definition, cover, i18nPrefix, describeSession, lazy Setup/Table
│       ├── describeSession.ts(+test)
│       ├── theme/palette.ts        rebellionPalette ← app/theme/tokens.ts (faction/board, §6)
│       ├── ui/{FactionChip, PieceGlyph}.tsx                                          ← shared/ui
│       ├── setup/SetupScreen.tsx(+test)                                              ← features/game-setup/NewGamePage
│       ├── setup/components/{Faction,Opponent,Difficulty}Picker.tsx · setup/lib/buildSetup.ts  ← features/game-setup
│       ├── table/TableScreen.tsx(+test)                                              ← features/game-session/GameTablePage
│       ├── table/hooks/{useRebellionView, useSendCommand(+test)}.ts                  ← features/game-session/hooks
│       ├── table/components/{SessionTopBar, SaveStatus, GameInfoPanel, AiStatusChip}.tsx  ← game-session + ai-opponent
│       ├── board/**                ← features/game-board/** (структура внутри без изменений)
│       ├── locales/{ru,en}/{meta,common,setup,session,board,gameData,errors}.json   (§5)
│       ├── locales.i18n.test.ts    ← features/game-board/locales.i18n.test.ts (+ setup/common/errors/meta)
│       └── test/fixtures.ts        makeView, makeRebellionSession, makeRebellionSummary  ← shared/test/fixtures
├── features/**                                                                     del (FE-MOVE, шаг M4)
└── locales/{ru,en}/                платформенные namespace (§5)                                         FE-PLATFORM
    {session,board,gameData}.json → games/rebellion/locales/                                             FE-MOVE
    setup.json                                                                                           del (P4)
```

Что **уходит** из SWR-002 без замены: `MainMenuPage` (→ каталог + страница игры), `ContinueButton`/`RecentGamesList`/
`useGamesList`/`summaryText` из `features/game-setup` (→ `platform/game-page` + `entry.describeSession`),
`features/game-session/components/GameNotFound` (→ `platform/session-host/SessionNotFound`), `LazyGameTablePage`
(→ `entry.TableScreen`).

## 2. Маршруты и навигация

`app/router.tsx` (единственное место маршрутов; добавление игры его не меняет):

| Path | Layout | Компонент | Поведение |
|---|---|---|---|
| `/` | Platform | `CatalogPage` | карточки из реестра, без сетевых запросов (Q-1, D-CAT-1) |
| `/games/:gameId` | Platform | `GamePage` | неизвестный id → `GameNotFound` (`game-not-found`, ссылка в каталог) |
| `/games/:gameId/new` | Platform | `NewSessionPage` | неизвестный → `GameNotFound`; `coming_soon` или нет `SetupScreen` → **на месте** `ComingSoonNotice` (`game-coming-soon`) + ссылка «← К игре», без формы и без редиректа (Q-17, D-NS-2); иначе ссылка «← К игре» (`new-session-back-to-game`, Q-19) + `<entry.SetupScreen>` в `Suspense` |
| `/sessions/:sessionId` | Session | `SessionHost` | §2.1 |
| `/settings` | Platform | `SettingsPage` | как SWR-002 (history back, иначе `/`) |
| `*` | Platform | `NotFoundPage` | `not-found`, кнопка «В каталог» |

Корневой route получает `errorElement: <RouteError/>` (сбой загрузки lazy-чанка игры → «Не удалось загрузить экран игры»
+ «Обновить страницу»; testid `route-error`). Старые URL `/games/new` и `/games/<uuid>` попадают в `/games/:gameId` →
`game-not-found` (assumption спецификации).

`platform/paths.ts` (импортируют и платформа, и игры; `app/router.tsx` использует те же паттерны):

```ts
export const paths = {
  catalog: '/',
  game: (gameId: string) => `/games/${encodeURIComponent(gameId)}`,
  newSession: (gameId: string) => `/games/${encodeURIComponent(gameId)}/new`,
  session: (sessionId: string) => `/sessions/${encodeURIComponent(sessionId)}`,
  settings: '/settings',
} as const;
```

### 2.1 SessionHost: `gameId` → `TableScreen`

```text
SessionHost (/sessions/:sessionId)
  q = useQuery(sessionQuery(sessionId))            // GET /api/sessions/:id → { sessionId, gameId, view: unknown }
  pending            → <SessionLoading/>            (session-loading, aria-busy; каркас 56px-шапка + область карты)
  error 404          → <SessionNotFound/>           (session-not-found, «В каталог»)
  error other        → Alert + «Повторить»          (session-error)
  entry = useGameEntry(q.data.gameId)
  error 422 GAME_UNAVAILABLE (Q-7) → <SessionUnsupported/>
  !entry?.TableScreen → <SessionUnsupported/>       (session-unsupported: «Игра недоступна» + ссылка в каталог, Q-20)
  else               → <div data-testid="session-host" data-session-id data-game-id>
                         <Suspense fallback={<SessionLoading/>}>
                           <entry.TableScreen sessionId gameId view={q.data.view}
                                              definition={entry.definition} backHref={paths.game(gameId)} />
```

- SessionHost **не парсит** `view`: передаёт `unknown` в props (TR-5). Хост подписан на `sessionKeys.detail(id)`, поэтому
  после `setQueryData` команды он перерисовывает TableScreen с новым `view` — у игры один источник данных (props), без
  второго запроса. 404 после команды → игра инвалидирует `detail` → SessionHost сам покажет `session-not-found`.
- `gameId` берётся **из ответа сервера**, не из URL (URL сессии не содержит игру) — поэтому старый `/games/:id/...` не нужен.

### 2.2 SetupScreen → `/sessions/:id`

`NewSessionPage` владеет созданием, экран игры — только формой:

```text
NewSessionPage(gameId) → start = useCreateSession(gameId)
  <Link «← К игре» data-testid="new-session-back-to-game" to={paths.game(gameId)}>   (Q-19)
  <entry.SetupScreen gameId definition={entry.definition} start={start} backHref={paths.game(gameId)} />
SetupScreen: собирает setup своей схемой → start.submit(setup)
useCreateSession.onSuccess({ sessionId, gameId, view }):
  setQueryData(sessionKeys.detail(sessionId), envelope)      // стол открывается без второго запроса
  invalidateQueries(sessionKeys.lists())
  navigate(paths.session(sessionId), { replace: true })      // D-NS-3: «Назад» со стола → страница игры, не форма
```

## 3. API-клиент и query keys (FE-PLATFORM, `platform/sessions/*`)

Транспорт (`shared/api/http.ts`, `errors.ts`, `ApiError`, `isNotFound`, `isClientError`) — без изменений.
DTO-схемы — из `@bga/platform` (имена — допущение §12, механически подстраиваются под план backend):

```ts
// platform/sessions/api.ts — каждый ответ валидируется Zod-схемой @bga/platform
export interface SessionEnvelope { sessionId: string; gameId: string; view: unknown }       // view игры — unknown
export function createSession(input: { gameId: string; setup: unknown }, o?: CallOptions): Promise<SessionEnvelope>;
//   POST /api/sessions → 201. 404 errors.gameNotFound / 422 GAME_UNAVAILABLE / 400 → throw ApiError (UI показывает по messageKey)
export function listSessions(params: { gameId?: string }, o?: CallOptions): Promise<SessionSummary[]>;
//   GET /api/sessions?gameId=<encodeURIComponent(id)> (без параметра — все игры); порядок сервера updatedAt desc
export function getSession(sessionId: string, o?: CallOptions): Promise<SessionEnvelope>;     // 404 → ApiError{status:404}
export function postSessionCommand(sessionId: string, envelope: unknown, o?: CallOptions): Promise<SessionCommandResult>;
//   POST /api/sessions/:id/commands. Как SWR-002: НЕ бросает для 400/404/409/422 с телом {ok:false,error};
//   бросает ApiError для сети/5xx/непарсящегося тела.
export type SessionCommandResult =
  | { ok: true; view: unknown; events: unknown[] }          // «рамка»; игра допарсивает своей CommandResultSchema
  | { ok: false; error: { code: string; messageKey: string; details?: unknown } };

// platform/sessions/queries.ts
export const sessionKeys = {
  all: ['sessions'] as const,
  lists: () => ['sessions', 'list'] as const,                         // префикс для инвалидации всех списков
  list: (gameId?: string) => ['sessions', 'list', gameId ?? '*'] as const,
  detail: (sessionId: string) => ['sessions', 'detail', sessionId] as const,
};
export function sessionQuery(sessionId: string);   // queryOptions → SessionEnvelope
export function sessionsListQuery(gameId?: string); // queryOptions → SessionSummary[]

// platform/sessions/useGameSessions.ts
export const RECENT_SESSIONS_LIMIT = 5;
export function useGameSessions(gameId: string, opts: { enabled: boolean }):  // enabled=false для coming_soon (Q-16, D-GP-7)
  UseQueryResult<SessionSummary[]> & { latest: SessionSummary | null; recent: SessionSummary[] };  // защитная сортировка updatedAt desc

// platform/sessions/useCreateSession.ts
export interface StartSession { submit(setup: unknown): void; isPending: boolean; error: unknown | null; reset(): void }
export function useCreateSession(gameId: string): StartSession;   // §2.2
```

### 3.1 Правила кеша

| Событие | Кто | Кеш |
|---|---|---|
| создание | `useCreateSession` | `setQueryData(detail(id), envelope)`; `invalidate(lists())` |
| команда ok | игра (`useSendCommand`) | `setQueryData(detail(id), { ...prev, view: result.view })`; `invalidate(lists())` |
| 409 / 404 команды | игра | `invalidate(detail(id))` → refetch (404 → SessionHost покажет not-found) |
| 422 / 400 | игра | без изменений |

Оптимистичных записей нет (инвариант SWR-002 §0.4). `queryClient` defaults не меняются.

### 3.2 Удаляется (P4)
`shared/api/games.ts` (`createGame/listGames/getGameView/postCommand`), `gameKeys`, `gamesListQuery`, `gameViewQuery`,
`games.test.ts`. До P4 они остаются, чтобы `features/**` компилировались, пока FE-MOVE их переносит.

### 3.3 Как игра читает view (контракт для FE-MOVE)

```ts
// games/rebellion/table/hooks/useRebellionView.ts
export function useRebellionView(view: unknown): { view: PlayerView } | { error: 'INVALID_VIEW' }
//   useMemo(() => PlayerViewSchema.safeParse(view), [view]) — props.view от SessionHost (TR-5);
//   невалидно → TableScreen показывает «Несовместимые данные партии» (testid `table-invalid-view`) + «← К игре»
```
`useSendCommand(sessionId)`: `view` из `getQueryData(sessionKeys.detail(id))` → envelope `{ actor: view.setup.humanFaction,
expectedVersion: view.version, command }` → `postSessionCommand` → ok-ветка парсится `CommandResultSchema` из
`@bga/game-rebellion/schema`. Остальная логика (in-flight guard, saveStatus, 409/422) — как в SWR-002.

## 4. Реестр web (`games/types.ts`, `games/registry.ts`)

```ts
// games/types.ts — только типы; импортирует @bga/platform и типы react/i18next
import type { GameDefinition, SessionSummary } from '@bga/platform';
import type { TFunction } from 'i18next';
import type { ComponentType, LazyExoticComponent } from 'react';

export interface StartSession { submit(setup: unknown): void; isPending: boolean; error: unknown | null; reset(): void }

export interface SetupScreenProps {
  gameId: string;                       // TR-5
  definition: GameDefinition;
  /** Создание сессии делает платформа: POST /api/sessions { gameId, setup } → /sessions/:id (replace). */
  start: StartSession;
  /** Куда ведёт «Отмена» — страница игры (ссылку «← К игре» над формой рисует платформа, Q-19). */
  backHref: string;
}

export interface TableScreenProps {
  sessionId: string;                    // TR-5
  gameId: string;
  /** Текущий view из кеша `sessionKeys.detail(sessionId)`; игра парсит своей схемой (TR-5). */
  view: unknown;
  definition: GameDefinition;
  /** «← К игре» в шапке стола (`session-back-to-game`) — страница игры (D-SH-4). */
  backHref: string;
}

export interface GameCover {
  /** data:image/svg+xml URL собственной абстрактной SVG (16:9) из `GameAssets.cover.svg`. Alt — `definition.coverAltKey` (Q-11). */
  src: string;
  /** `GameAssets.accentColor` — полоса-акцент карточки (D-CAT-5). */
  accentColor?: string;
}

export interface WebGameEntry {
  definition: GameDefinition;
  /** Нет → платформенный плейсхолдер `platform/ui/placeholderCover.svg`-строка + alt `common:cover.placeholderAlt` (TC-EXT-07). */
  cover?: GameCover;
  /** Префикс i18n namespace игры = имя папки `src/games/<prefix>/` (`rebellion` → `rebellion.board`, …). */
  i18nPrefix: string;
  /** Строка сессии для «Продолжить»/«Недавние» из SessionSummary.details; нет → общий текст платформы. */
  describeSession?: (summary: SessionSummary, t: TFunction) => string;
  SetupScreen?: LazyExoticComponent<ComponentType<SetupScreenProps>>;
  TableScreen?: LazyExoticComponent<ComponentType<TableScreenProps>>;
}

// games/registry.ts
import { forbiddenStarsEntry } from './forbidden-stars/entry';
import { rebellionEntry } from './rebellion/entry';
export type * from './types';
export const gameRegistry: readonly WebGameEntry[] = [rebellionEntry, forbiddenStarsEntry];
```

```ts
// games/rebellion/entry.ts (FE-MOVE; стаб P1 — без describeSession и экранов)
import { rebellionDefinition } from '@bga/game-rebellion/definition';
import { rebellionAssets } from '@bga/game-rebellion/assets';   // GameAssets { cover: { svg, width, height }, accentColor }
import { lazy } from 'react';
import { svgDataUrl } from '@/platform';            // encodeURIComponent → data:image/svg+xml;charset=utf-8,...
import type { WebGameEntry } from '@/games/types';
import { describeRebellionSession } from './describeSession';

export const rebellionEntry: WebGameEntry = {
  definition: rebellionDefinition,
  cover: { src: svgDataUrl(rebellionAssets.cover.svg), accentColor: rebellionAssets.accentColor },
  i18nPrefix: 'rebellion',
  describeSession: describeRebellionSession,
  SetupScreen: lazy(() => import('./setup/SetupScreen')),   // default export
  TableScreen: lazy(() => import('./table/TableScreen')),   // default export; konva — только в этом чанке
};
```

**Инъекция для тестов:** `GameRegistryProvider` (контекст, default = `gameRegistry`) оборачивает роутер в `AppProviders`;
платформа читает реестр только через `useGameRegistry()`/`useGameEntry()`. `AppProviders({ registry? })` и
`renderWithProviders({ registry })` подменяют его фиктивными записями. Модуль `games/registry.ts` импортирует только
`registry/GameRegistryContext.tsx` (как default) и `app/providers`.

**Инварианты реестра** (`games/registry.test.ts`): `definition` проходит `GameDefinitionSchema`; `id` уникальны;
`available` ⇒ есть `SetupScreen` и `TableScreen`; `coming_soon` ⇒ экранов нет (Forbidden Stars — AC-6);
`cover.src` (если есть) начинается с `data:image/svg+xml`; `definition.descriptionKey` и `definition.coverAltKey` разрешаются в
непустой текст в ru и en; ни одна запись не мутирует массив (TC-ARCH-04).
**Согласованность с сервером (Q-25):** `apps/web/src/games/registry.consistency.test.ts` (FE-PLATFORM, P2) сравнивает
`gameRegistry.map(e => e.definition)` с `apps/api/src/game-registry/definitions` (единственное ESLint-исключение B-16
плана backend; импортируются только definitions, без серверных модулей).

## 5. i18n

### 5.1 Сборка ресурсов
`shared/i18n/i18n.ts`: glob расширяется на `['../../locales/*/*.json', '../../games/*/locales/*/*.json']`:
- `src/locales/<lng>/<ns>.json` → namespace `<ns>` (платформа);
- `src/games/<prefix>/locales/<lng>/<area>.json` → namespace `<prefix>.<area>` (например `rebellion.board`).

Glob обобщённый (имён игр нет) — это единственное, задокументированное исключение из «shared не знает про games/»:
новая игра подхватывается без правки `i18n.ts`. Namespace с точкой проверен: `i18next` (версия из lockfile) корректно
разрешает `t('rebellion.board:zoom.in')`, `t('zoom.in', { ns: 'rebellion.board' })` и `getFixedT(null, 'rebellion.board')`
(проверено одноразовым `node -e` на установленном пакете при планировании).

### 5.2 Namespaces

| NS | Владелец | Содержимое |
|---|---|---|
| `common` | FE-PLATFORM | app (новое название платформы), nav, actions, `mock.badge|tooltip|footer`, notFound (`toCatalog`), `status.available|comingSoon`, `players_*` / `playersRange`, `ai.supported` («AI-противник ✓», Q-12), `cover.placeholderAlt`, `disclaimer` |
| `catalog` | FE-PLATFORM | заголовок/подзаголовок каталога, пустой каталог, aria-подписи карточек |
| `gamePage` | FE-PLATFORM | действия, «Продолжить» подсказки, недавние, пустое состояние, «Скоро», ошибки списка, not-found игры, «← Все игры», «← К игре» |
| `sessionHost` | FE-PLATFORM | загрузка, not-found сессии, unsupported, ошибка, общий текст сессии без `describeSession` |
| `settings`, `errors` | FE-PLATFORM | как SWR-002; `errors` + `gameNotFound`, `gameUnavailable`, `sessionNotFound`, `code.GAME_UNAVAILABLE` |
| `rebellion.meta` | FE-MOVE (стаб — P1) | `description` (ключ из `definition.descriptionKey`), `coverAlt` |
| `rebellion.common` | FE-MOVE | `faction.*`, `pieceKind.*`, `phase.*`, `difficulty.*`, `opponent.*`, `round`, `mock.scenario` (копия из `common`) |
| `rebellion.setup` | FE-MOVE | `newGame.*` из `setup.json` + `session.item` (describeSession) |
| `rebellion.session` · `rebellion.board` · `rebellion.gameData` | FE-MOVE | бывшие `session`, `board`, `gameData` (git mv + переименование ns в коде); `session.topBar.backToGame` новый |
| `rebellion.errors` | FE-MOVE | игровые `messageKey` (`notAdjacent`, `notOwner`, …) |
| `forbidden-stars.meta` | FE-PLATFORM | `description`, `coverAlt` |

Переименование в коде FE-MOVE — механическое: `'board:'` → `'rebellion.board:'`, `'session:'` → `'rebellion.session:'`,
`ns: 'gameData'` → `ns: 'rebellion.gameData'`, `common:faction|pieceKind|phase|difficulty|opponent|round|mock.scenario` →
`rebellion.common:…`, `setup:newGame` → `rebellion.setup:newGame`. Ключи внутри файлов не меняются.

### 5.3 Названия и описания игр — решение (Q-11)
- **Название** — `definition.name` как есть, не переводится (имя собственное; «Star Wars: Rebellion», «Forbidden Stars» —
  латиницей в обоих языках, номинативно, без логотипов).
- **Описание** — `t(definition.descriptionKey, { defaultValue: definition.description })`; ключ в формате `<ns>:<key>`
  (для Rebellion `rebellion.meta:description`); `description` (ru) — допустимый fallback из definition.
  Поля `descriptionKey`/`coverAltKey` есть в `GameDefinitionSchema` плана backend (§2); **значения** должны быть
  ns-квалифицированы (`rebellion.meta:description`, `rebellion.meta:coverAlt`, `forbidden-stars.meta:…`), а не пример
  `games.star-wars-rebellion.description` из plan-backend — иначе тексты игр попадут в общий `common` (см. §12, R-1).
- **Alt обложки** — `t(definition.coverAltKey)` (Rebellion `rebellion.meta:coverAlt`); нет `entry.cover` → плейсхолдер и `common:cover.placeholderAlt`.
- Хелпер `platform/ui/useGameText(entry)` → `{ name, description, coverAlt }`.
**Почему:** имя игры одинаково в ru/en и нужно серверу (логи, ошибки); описание и alt — пользовательский текст и живут в
i18next (тест ru == en). Формат `descriptionKey` — допущение §12 (согласовать с backend).

### 5.4 Ошибки
`translateError(t, err, { gameNs? })`: `messageKey` `errors.<name>` → сначала `<gameNs>:<name>` (Rebellion передаёт
`'rebellion.errors'`), затем `errors:<name>`, затем `errors:code.<CODE>`, затем `errors:unknown`. Формат `messageKey` от
сервера не меняется. Платформенные экраны вызывают без `gameNs`.

## 6. Ассеты и визуальные токены

| Что | Где живёт | Как попадает в web |
|---|---|---|
| Обложка Rebellion | `@bga/game-rebellion/assets` → `GameAssets.cover { svg, width, height }` (собственная абстрактная SVG, viewBox `0 0 640 360`) + `accentColor` | `entry.cover = { src: svgDataUrl(cover.svg), accentColor }` |
| Обложка Forbidden Stars | `@bga/game-forbidden-stars/assets` → `GameAssets` | так же, в `games/forbidden-stars/entry.ts` |
| Токены Rebellion: `faction.{empire,rebellion}`, `board.{background,star,link,systemFill,systemStroke,label,selected,legalTarget,invalidTarget}` | **web**: `apps/web/src/games/rebellion/theme/palette.ts` (значения = ux-decisions §7; перенос из `app/theme/tokens.ts`) — по plan-backend §4.2 в `./assets` они не идут, пока нет настоящей графики | FE-MOVE заменяет `palette.board.*`/`palette.faction.*` (≈12 мест) на `rebellionPalette.*` |
| Платформенные токены (фон, текст, primary, mock, focus, статусы карточек) | `apps/web/src/app/theme/tokens.ts` | MUI-тема; P4 удаляет `faction`/`board` из темы и `mui-augment.d.ts` |

**Почему SVG строкой, а не файлом:** одинаково работает в Vite, Vitest (jsdom) и Node без загрузчиков ассетов и копирования
файлов в `dist` пакета; размер ≤ 4 КБ на обложку. Требования к обложкам (для backend/W0-R, владельца пакетов):
только геометрия (круги, дуги, линии, точки-звёзды, гексы), без текста внутри SVG (текст — HTML, локализуемый), без
логотипов, персонажей, кораблей, шрифтов и цветовых схем коробки; детерминированная (без случайности); описание мотивов —
`ux-decisions.md` D-CAT-4. `definition.coverImage` web не использует (§11 PA-6). Содержимое SVG и `accentColor`
(`packages/games/*/src/assets/**` + `test/assets/**`) по plan-backend §4.2/§7 — **владение FE** после R2 → FE-PLATFORM (P2);
структура `GameAssets` заморожена; тест пакета запрещает `<script`, внешние `href`, `url(http`, `<image`.

## 7. Testid

Конвенция SWR-002 (kebab-case, id — сырые, состояние в `data-*`). Все новые testid — в `T` (`e2e/support/testids.ts`,
владелец — QA).

### 7.1 Новые

| Экран | testid |
|---|---|
Имена из TR-1 (`test-cases.md`) приняты **дословно**; строки «доп.» — дополнения FE (QA добавляет в `T`).

| Экран | testid |
|---|---|
| Шапка платформы | TR-1: `nav-catalog` (бренд → `/`), `nav-settings`; доп.: `app-header` |
| Каталог | TR-1: `game-catalog`, `game-card-<gameId>` (ссылка-карточка; `data-status`; доп. `data-game-id`), внутри — `game-card-name`, `game-card-cover` (`<img>`, непустой alt), `game-card-description`, `game-card-status` (`data-status`), `game-card-players`, `game-card-ai`; доп.: `catalog-empty` |
| Страница игры | TR-1: `game-page` (`data-game-id`, `data-status`), `game-page-cover`, `game-page-name`, `game-page-description`, `game-page-players`, `game-page-ai`, `game-new-session`, `game-continue` (нативный `disabled`), `game-coming-soon`, `game-recent-sessions`, `recent-session-<sessionId>`, `game-sessions-error`, `game-not-found`; доп.: `game-back-to-catalog`, `game-continue-hint`, `game-recent-empty`, `game-disclaimer` (`game-continue` доп. `data-session-id` цели) |
| Новая партия | форма Rebellion — прежние `setup-*`; доп.: `new-session-page` (`data-game-id`), `new-session-back-to-game` (Q-19); для coming_soon — `game-coming-soon` (Q-17) |
| Хост сессии | TR-1: `session-host` (`data-session-id`, `data-game-id`), `session-not-found`, `session-back-to-game`; доп.: `session-loading`, `session-unsupported` (Q-20), `session-error`, `table-invalid-view` |
| Стол Rebellion | `game-table` + **новый** `data-session-id`; `session-back-to-game` (бывший `session-menu`); `session-settings` — как было |
| Прочее | `route-error`, `not-found` (как было) |

### 7.2 Стабильность e2e SWR-002

| Было | Стало | Действие QA |
|---|---|---|
| все `setup-*`, все testid стола/карты/панелей/списка/журнала, `feedback`, `live-region`, `settings-*`, `mock-badge`, `not-found` | **без изменений** | — |
| `game-table[data-game-id]` = id партии | `data-session-id` = sessionId; `data-game-id` = `star-wars-rebellion` (Q-10) | `waitForTable` проверяет `data-session-id` |
| `menu-new-game` | `game-new-session` (на `/games/star-wars-rebellion`) | сценарии «новая партия» начинаются с каталога или прямо с `/games/star-wars-rebellion/new` |
| `menu-continue` · `recent-games` · `recent-game-<id>` | `game-continue` · `game-recent-sessions` · `recent-session-<sessionId>` | persistence-спеки идут через страницу игры (AC-4) |
| `menu-settings` | `nav-settings` | settings.spec: проверка языка — по `game-catalog` h1 или `game-card-status` |
| `game-not-found` для `/games/<нет такого id>` | тот же testid, смысл «игра не найдена»; отсутствующая **сессия** → `session-not-found` на `/sessions/<id>` | TC-E2E-32 переносится на `/sessions/does-not-exist` |
| `session-menu` | `session-back-to-game` (ведёт на `/games/:gameId`) | не использовался в e2e |
| URL `/games/new`, `/games/:id`; API `/api/games*` | `/games/:gameId/new`, `/sessions/:id`; `/api/sessions*` | `openGame` → `/sessions/:id`; `support/api.ts` → `POST /api/sessions {gameId, setup}`, `GET /api/sessions/:id` → `.view` |

`window.__boardDebug` и его включение (`VITE_E2E=1`) не меняются; хук переезжает вместе с `board/**`.

## 8. Тесты FE (Vitest + RTL, jsdom, `mockFetch`)

Регистры подменяются через `renderWithProviders({ registry: [...] })`; фиктивная игра — `platform/test/fakeGame.tsx`:
`makeFakeGameEntry({ id: 'test-game', status, withScreens })` с `definition`, проходящим `GameDefinitionSchema`,
`FakeSetupScreen` (кнопка `fake-setup-submit` → `start.submit({ answer: 42 })`, показывает `start.error`) и
`FakeTableScreen` (`fake-table`, `data-session-id`, выводит JSON `view` из props, ссылка `backHref`); фиктивная запись — **без** `cover` (проверка плейсхолдера, TC-EXT-07). Экраны оборачиваются в `lazy(() => Promise.resolve(...))`,
чтобы проверить и Suspense-путь.

| AC | Файл | Проверки |
|---|---|---|
| AC-1 | `platform/catalog/CatalogPage.test.tsx` | TC-CAT-01..08: реальный реестр: `game-card-star-wars-rebellion` с `game-card-name` «Star Wars: Rebellion», `game-card-cover` `img[src^="data:image/svg+xml"]` с непустым alt, `game-card-description` (ru), `game-card-status[data-status=available]` «Доступна», «2 игрока», «AI-противник ✓»; `game-card-forbidden-stars[data-status=coming_soon]` «Скоро», «2–4 игрока»; fetch отклоняется → карточки всё равно есть (Q-1); en → нет кириллицы кроме названий; фиктивный реестр из 3 записей → 3 карточки, `available` раньше `coming_soon`, порядок реестра внутри группы (Q-2); пустой реестр → `catalog-empty`; нет `menu-*` |
| AC-2 | `platform/game-page/GamePage.test.tsx` | TC-GP-01, 07, 08, 10: клик по карточке Rebellion → `/games/star-wars-rebellion`, `game-page`, `game-new-session` активна, `game-continue` есть; Forbidden Stars → `game-coming-soon`, обе кнопки `disabled`, **нет** запроса `/api/sessions` (Q-16); неизвестный id (и `/games/<uuid>`, `/games/unknown/new`) → `game-not-found` со ссылкой в каталог, без запросов |
| AC-3 | `platform/new-session/NewSessionPage.test.tsx` + `games/rebellion/setup/SetupScreen.test.tsx` | TC-NEW-01..04, TC-GP-09: фиктивная игра: submit → `POST /api/sessions` с телом `{ gameId: 'test-game', setup: { answer: 42 } }` → URL `/sessions/s1` (replace: `router.state.historyAction === 'REPLACE'`) → `fake-table[data-session-id=s1]` **без** GET (кеш засеян); ошибка 400/422/500/сеть → текст ошибки, форма на месте; двойной клик → один POST; `new-session-back-to-game` → `/games/<id>`; `/games/forbidden-stars/new` → на месте `game-coming-soon`, нет `setup-*`, URL не меняется (Q-17); Rebellion SetupScreen (перенос TC-WEB-04/05) шлёт `{ gameId: 'star-wars-rebellion', setup }` |
| AC-3 (стол) | `games/rebellion/table/TableScreen.test.tsx`, `useSendCommand.test.tsx` | перенос тестов SWR-002 на `/sessions/:id` и `postSessionCommand`; `session-back-to-game` href = `/games/star-wars-rebellion`; ok → `detail` обновлён, `lists` инвалидированы; 409 → refetch `detail` |
| AC-4 | `GamePage.test.tsx`, `platform/session-host/SessionHost.test.tsx` | `GET /api/sessions?gameId=star-wars-rebellion`; 7 сессий → 5 строк, первая = цель `game-continue`; клик «Продолжить» → `/sessions/<latest>`; пусто → `game-continue` disabled + `game-recent-empty`; сеть → `game-sessions-error` + «Повторить», «Новая партия» активна; SessionHost: две фиктивные игры, ответ с `gameId` второй → рендерится стол **второй** (диспетчеризация по `gameId`, а не по первой записи) и получает `{ sessionId, gameId, view }`; 404 → `session-not-found`; `gameId` вне реестра, запись без `TableScreen` (FS) или 422 `GAME_UNAVAILABLE` → `session-unsupported` со ссылкой в каталог (Q-20, TC-HOST-03/04) |
| AC-5(б) | `platform/extensibility.test.tsx` | реальные `routes` + реестр `[rebellionEntry, fakeEntry]`: карточка `game-card-test-game` (плейсхолдер-обложка с alt) → страница → new → `/sessions/:id` → `fake-table`; без единой правки `app/router.tsx`/`platform/**` (тест сам по себе — доказательство); строка сессии фиктивной игры без `describeSession` → общий текст |
| реестр | `games/registry.test.ts` | инварианты §4 |
| i18n | `shared/i18n/locales.test.ts`, `games/rebellion/locales.i18n.test.ts` | ru == en для каждого платформенного ns и каждого `<prefix>.*`; `@bga/platform` `ERROR_MESSAGE_KEYS` переведены в `errors`; игровые ключи Rebellion — в `rebellion.errors` или `errors`; полнота `gameData` по сценарию (test-only импорт `@bga/game-rebellion/scenario` в `*.i18n.test.ts`) |
| unit | `platform/sessions/api.test.ts`, `formatPlayers.test.ts`, `selectors.test.ts`, `describeSession.test.ts` | пути и `?gameId=` с кодированием, Zod-валидация, 400/404/409/422 у команд не бросают, сеть/5xx бросают; `[2]` → «2 игрока», `[2,3,4]` → «2–4 игрока», `[1]` → «1 игрок»; невалидные `details` → общий текст |

`app/router.test.tsx` переписывается под новые маршруты (каталог, `/settings`, 404 → «В каталог», фокус на h1).
Команда: `pnpm --filter @bga/web test` (имя пакета — после W0-R).

## 9. ESLint-граница web (AC-5(в))

Правила пишет **W0-R** (plan-backend §1.8): B-8 (web: только `definition|schema|board|assets`, + динамические `import()`),
B-9 (`app|shared|platform` не импортируют `@bga/game-*` и `@/games/*` кроме `@/games/registry`), B-10 (`*.i18n.test.ts` может
читать `./scenario`), B-15 (вычисляемый `import()`, Q-21), B-16 (исключение для `registry.consistency.test.ts`); автотест проб —
`scripts/eslint-boundaries.test.mjs` (TR-7). FE принимает их без изменений.

На время переноса B-9 смягчён allowlist-ом `eslint.web-legacy.mjs` (AM-7, **владелец FE**): FE-PLATFORM ведёт файл, убирая
записи по мере P1/P4; FE-MOVE свои файлы (`shared/ui/PieceGlyph.tsx`, `FactionChip.tsx`) просто удаляет (лишняя запись безвредна).
DONE WHEN P4: массив пуст; INTEGRATION удаляет файл.

Предложения FE поверх (лиду на INTEGRATION, в `eslint.config.mjs` и в пробы): (1) `apps/web/src/games/*/**` — из `@/games/*`
разрешён только `@/games/types` (игра не видит другие игры и реестр); (2) `apps/web/src/{app,shared,platform}/**` — запрет
`@/features/*` после M4; (3) `apps/web/src/games/forbidden-stars/**` — из `@bga/*` только `@bga/platform` и
`@bga/game-forbidden-stars/{definition,assets}`.

## 10. Подзадачи, владение файлами, порядок

**Почему два воркера, а не один.** Объём — ~25 новых платформенных файлов и перенос ~80 файлов Rebellion с переименованием
namespace; работа разной природы (новый UX vs механика). Точки сцепления (router, API, тема, `shared/ui`, `shared/test`,
локали `common/setup`) снимаются порядком: **P1** (короткий, последовательный) замораживает интерфейсы и **переключает
маршруты**, после чего ни `app/` ни `platform/` не ссылаются на `features/**`; затем P2 ‖ M1–M4 не делят ни одного файла;
удаление legacy, нужного обоим до конца переноса, собрано в **P4** после FE-MOVE. Если оркестратор может дать только
одного FE-воркера — порядок тот же: P1 → M1–M4 → P2 → P4.

### P1 — FE-PLATFORM, foundation (после W0-R; блокирует FE-MOVE)
- `platform/sessions/*` (api, queries, hooks) + `api.test.ts`; `platform/paths.ts`; `platform/index.ts`;
  `platform/registry/*`; `platform/ui/svgDataUrl` (в `platform/ui/GameCover.tsx` или отдельный util).
- `games/types.ts`, `games/registry.ts`, `games/forbidden-stars/**`, **стаб** `games/rebellion/entry.ts`
  (definition + cover + `i18nPrefix: 'rebellion'`, без экранов) и `games/rebellion/locales/{ru,en}/meta.json`.
- `app/router.tsx` на маршруты §2 с рабочими `SessionHost`, `NewSessionPage`, `GameNotFound`, `NotFoundPage` и
  **минимальными** `CatalogPage`/`GamePage`; `PlatformLayout`/`SessionLayout`; удалить `MainMenuPage(+test)`,
  `LazyGameTablePage`; `AppProviders({ registry })`; `renderWithProviders({ registry })`; `i18n.ts` glob; `translateError` + `gameNs`.
- Легаси (`shared/api/games.ts`, тема `faction/board`, `common`-ключи Rebellion, `setup.json`, `shared/test/fixtures.ts`)
  **не трогать**.
- DONE WHEN: `typecheck`, `lint`, `test` web — 0; `/` и `/games/star-wars-rebellion` открываются; `/sessions/x` → not-found/
  unsupported; сигнатуры §3–§4 в коде совпадают с планом (отклонения — в отчёт).

### P2 — FE-PLATFORM, UX и тесты (параллельно с FE-MOVE)
- Каталог, карточка, страница игры, «Продолжить»/недавние, «Скоро», шапка, ссылки «назад», disclaimer — по ux-decisions §12;
  ключ настроек `swr.settings.v1` → `bga.settings.v1` с одноразовым переносом (Q-22: при старте, если нового ключа нет, а
  старый есть — скопировать и удалить старый; тест в `settingsStore.test.ts`);
  локали `common/catalog/gamePage/sessionHost/errors`; тесты AC-1, AC-2, AC-4, AC-5(б), реестр, i18n платформы.
- OWNED FILES (P1+P2+P4): `apps/web/index.html`, `src/main.tsx`, `src/vite-env.d.ts`, `src/test/**`, `src/app/**`,
  `src/platform/**`, `src/games/types.ts`, `src/games/registry.ts`, `src/games/registry.test.ts`, `src/games/forbidden-stars/**`,
  `src/shared/**` **кроме** `src/shared/ui/{FactionChip.tsx,PieceGlyph.tsx,index.ts}`, `src/locales/{ru,en}/{common,catalog,gamePage,sessionHost,settings,errors,setup}.json`,
  `src/games/registry.consistency.test.ts`, `eslint.web-legacy.mjs`, `packages/games/*/src/assets/**` и `packages/games/*/test/assets/**`
  (дизайн обложек и `accentColor`; структура `GameAssets` не меняется).

### M1–M4 — FE-MOVE, Rebellion в `games/rebellion` (после P1)
- **M1** `git mv` `features/game-board` → `games/rebellion/board`, `game-session` → `table`, `ai-opponent/AiStatusChip` →
  `table/components`, форма `game-setup` → `setup`, `shared/ui/{FactionChip,PieceGlyph}` → `games/rebellion/ui`,
  `locales/{ru,en}/{session,board,gameData}.json` → `games/rebellion/locales/…`; создать `rebellion.common/setup/errors`
  (копии ключей); переименовать ns в коде (§5.2); `rebellionPalette` вместо `palette.board/faction` (§6);
  `games/rebellion/test/fixtures.ts`.
- **M2** `SetupScreen` (default export, props §4: `start.submit(buildSetup(...))`, «Отмена» → `backHref`, без собственного
  «← Меню» — ссылку «← К игре» рисует платформа); `TableScreen` (default export, `sessionId`/`view` из props, `useRebellionView(view)`, `useSendCommand` на
  `postSessionCommand`, `session-back-to-game` → `backHref`, `data-session-id`; 404/загрузка — у SessionHost);
  `describeSession`; заполнить `entry.ts` экранами.
- **M3** Тесты: перенос всех тестов SWR-002 (game-board, game-session, game-setup форма), `TableScreen.test`, `SetupScreen.test`,
  `describeSession.test`, `locales.i18n.test` для `rebellion.*`.
- **M4** Удалить `src/features/**` целиком (включая `ContinueButton`, `RecentGamesList`, `useGamesList`, `summaryText`,
  `formatRelativeTime`, `GameNotFound`) и реэкспорты FactionChip/PieceGlyph из `shared/ui/index.ts`.
- OWNED FILES: `src/games/rebellion/**` (после P1), `src/features/**`, `src/shared/ui/{FactionChip.tsx,PieceGlyph.tsx,index.ts}`,
  `src/locales/{ru,en}/{session,board,gameData}.json`.
- DONE WHEN: сценарии 3–5 спецификации вручную в DEV; все перенесённые тесты зелёные; в `games/rebellion` нет импортов
  `@/features`, `palette.board|faction`, ns без префикса `rebellion.` (кроме платформенных `common:nav|actions|mock`,
  `errors`); `typecheck|lint|test` web — 0; konva только в чанке TableScreen (`vite build`, отчёт по чанкам).

### P4 — FE-PLATFORM, удаление legacy (после M4)
`shared/api/{games.ts,games.test.ts,queries.ts}` и их экспорт; `faction`/`board` из `tokens.ts`, `createAppTheme.ts`,
`mui-augment.d.ts`; из `common.json` — ключи, скопированные в `rebellion.common`; `locales/*/setup.json`;
`shared/test/fixtures.ts` и его экспорт. DONE WHEN: `grep -r "@/features\|gameKeys\|palette.board" apps/web/src` пусто,
все гейты web — 0.

### INTEGRATION — frontend-lead
ESLint-правила §9, `apps/web/package.json` (зависимости `@bga/*` — если W0-R не добавил `@bga/game-forbidden-stars`),
`pnpm verify` вместе с backend и QA-e2e.

```text
W0-R ──▶ P1 ──┬──▶ P2 ─────────────────────┐
              └──▶ M1 ─▶ M2 ─▶ M3 ─▶ M4 ──▶ P4 ──▶ INTEGRATION (+ e2e QA, + backend API) ──▶ REVIEW
```

**Чужие файлы:** `e2e/**` — по workflow e2e-спеки пишет QA (миграция по §7.2); plan-backend §7 относит `e2e/**` к W-FE —
расхождение решает оркестратор (рекомендация FE: QA, т.к. TC-* уже спроектированы QA); корневые конфиги, `apps/web/package.json`, `vite.config.ts`
(`conditions: ['@bga/source']`) — W0-R/лид; `scripts/check-web-bundle.mjs` — владелец backend/W0-R (пути сценария меняются;
web-ожидание: в бандле нет `__boardDebug`, id фигур и базы сценария, кода `./rules|./scenario|./server|./ai`).

## 11. Proposed amendments (к замороженному контракту — только предложения, решают Analyst + backend-lead)

- **PA-1. Формат `descriptionKey` (после Q-11).** Предлагается полный ключ `<ns>:<key>` (`rebellion.meta:description`),
  чтобы платформа не вычисляла namespace; переводы живут в web-локалях игры.
- **PA-2 (принято в plan-backend §2). Рамки DTO в `@bga/platform`.** Нужны Zod-схемы с `view: z.unknown()`: `SessionResponseSchema { sessionId, gameId, view }`
  (ответы `POST /api/sessions` и `GET /api/sessions/:id`), `SessionCommandResultSchema` (`{ ok: true, view: unknown,
  events: unknown[] } | CommandErr`), `ListSessionsResponseSchema`, `CreateSessionRequestSchema`. **Почему:** платформа
  валидирует рамку, не зная схемы игры.
- **PA-3. `details` сессии Rebellion** — принято в plan-backend AM-9: `humanFaction`, `opponentKind`, `difficulty?`, `round`,
  `phase`. Схему `RebellionSessionDetailsSchema` FE держит локально в `games/rebellion/describeSession.ts` (safeParse → fallback).
- **PA-4. `./assets` как данные** — принято в plan-backend §2/§4.2 (`GameAssets { cover: { svg, width, height }, accentColor }`);
  токены фракций/карты остаются в web (§6).
- **PA-5. Каталог `messageKey`.** Общие ключи (`errors.gameNotFound`, `errors.gameUnavailable`, `errors.sessionNotFound`,
  `errors.validation`, `errors.versionConflict`, `errors.notFound`, `errors.internal`) — `ERROR_MESSAGE_KEYS` в `@bga/platform`;
  игровые — `REBELLION_ERROR_MESSAGE_KEYS` в `@bga/game-rebellion/schema`; формат `errors.<name>` сохраняется.
- **PA-6. `GameDefinition.coverImage?`** (совпадает с AM-1 backend в части обложки) web не использует (обложка — `./assets` + `WebGameEntry.cover`); предлагается не
  заполнять или удалить поле, чтобы не было двух источников.
- **PA-7 (подтверждено plan-backend §3.3). `PlayerView.id === sessionId`** (или поле удаляется из view) — web берёт sessionId из маршрута/ответа.
- ~~PA-8~~ снято: Q-17 решил «экран „Скоро“ на месте, без редиректа».

## 12. Сверка с `plan-backend.md`

Принято как есть: пакеты/экспорты (D-1, D-2 `@bga/source`), `@bga/platform` §2 (`GameDefinitionSchema` с `descriptionKey`/
`coverAltKey`, `SessionResponseSchema` с `view: unknown`, `SessionCommandOkSchema`, `ListSessionsResponseSchema`,
`CreateSessionRequestSchema`, `ErrorCodeSchema` + `GAME_UNAVAILABLE`, `PLATFORM_ERROR_MESSAGE_KEYS`), ключи `details` (AM-9),
`legacy-api.ts` до INTEGRATION (AM-8 — закрывает мой риск «старые схемы исчезнут до P4»), `GameAssets` (§4.2), ESLint B-8..B-16,
`eslint.web-legacy.mjs` (AM-7), W0-R добавляет 3 ключа в `locales/*/errors.json` (они остаются платформенными),
`ERROR_MESSAGE_KEYS` = platform + Rebellion в `@bga/game-rebellion/schema`; `PLATFORM_ERROR_MESSAGE_KEYS` — в `@bga/platform`
(тест `shared/i18n/locales.test.ts` проверяет только платформенные, `games/rebellion/locales.i18n.test.ts` — Rebellion-ключи).

Ответы на open questions backend: Q-1 (AM-1 `LocalizedText`) — FE за **i18n-ключи** (Q-11 Analyst уже так решил, схема
backend §2 им соответствует; `LocalizedText` в AM-1 предлагаю снять). Q-2 (рендер `details`) — функция `describeSession` в
`WebGameEntry` (§4).

Расхождения, требующие решения (не блокируют P1):
- **R-1. Значения `descriptionKey`/`coverAltKey`.** Пример backend `games.star-wars-rebellion.description` (без ns) → FE просит
  `rebellion.meta:description` / `rebellion.meta:coverAlt` (`forbidden-stars.meta:…`). Значения задаёт W0-R в R2 (definition
  заморожен) — согласовать до R2.
- **R-2. `GET /api/sessions?gameId=<неизвестная>`:** backend AM-3/§3.2 — 404, Clarification Q-5 (обязательна) — `[]` 200. Для FE
  не критично (страница игры запрашивает только игры реестра; 404 → `game-sessions-error`), но backend должен следовать Q-5.
- **R-3. Владелец `e2e/**`** — см. §10 «Чужие файлы».

Остаточные допущения FE: имена экспортов `rebellionDefinition`, `forbiddenStarsDefinition`, `rebellionAssets`,
`forbiddenStarsAssets` (если иначе — правка одной строки в `entry.ts`); `PlayerView.id === sessionId` (plan-backend §3.3:
`GameState.id` = id сессии — подтверждено).

## 13. Риски

| Риск | Митигация |
|---|---|
| Массовое переименование ns ломает тексты молча (ключ показывается как есть) | i18n-тест ru == en по `rebellion.*` + RTL-тесты стола проверяют русские тексты; `grep "'board:"` пусто в DONE WHEN M |
| SessionHost и TableScreen грузят сессию дважды | грузит только хост; игра получает `view` в props (§2.1, TR-5); тест AC-3 проверяет отсутствие GET после create |
| Парсинг view на каждом рендере | `useMemo` по ссылке `view` (меняется только при `setQueryData`/refetch) |
| Konva попадает в общий чанк через реестр | реестр импортирует только `entry.ts`; экраны — `lazy`; проверка чанков в DONE WHEN M |
| Параллельная работа в одном дереве даёт чужие ошибки tsc | после P1 у воркеров нет общих файлов; гейт воркера — 0 ошибок в своих файлах + полный гейт на P4/INTEGRATION |
| Обложки случайно похожи на оригинальную графику | только геометрия по D-CAT-4, ревью обложек reviewer-ом визуально (скриншот каталога в QA) |

## 14. Соответствие Clarifications / Testability

| Пункт | Где в плане |
|---|---|
| Q-1 статический каталог | §2 (`/` без запросов), §8 AC-1 |
| Q-2 порядок, Q-12 анатомия | §4 `catalogOrder`, ux §12 D-CAT-2/3 |
| Q-7, Q-20 недоступная игра в хосте | §2.1 `session-unsupported` |
| Q-10 `data-game-id` = id игры, `data-session-id` | §7.2 |
| Q-11 имя из definition, описание/alt — i18n | §5.3 (`descriptionKey`, `coverAltKey`) |
| Q-13, Q-14 строка недавних, дубль «Продолжить» | `describeSession` §4, ux D-GP-4/5 |
| Q-15, Q-16 ошибка списка, coming_soon без запроса | §3 `useGameSessions({enabled})`, §8 AC-2/AC-4 |
| Q-17 `/new` для coming_soon на месте | §2 |
| Q-19 «← К игре» на экране настройки | §2.2 `new-session-back-to-game` |
| Q-22 `bga.settings.v1` | §10 P2 |
| Q-21, Q-23, Q-25 | ESLint §9 (лид/W0-R), bundle — владелец `check-web-bundle.mjs`, согласованность реестров — §4 (открытый вопрос о месте теста) |
| TR-1 testid | §7.1 (дословно + доп.) |
| TR-2 debug-хук | §7.2 (без изменений, переезжает с `board/**`) |
| TR-5 seam реестра + props | §4 (`GameRegistryProvider`, `SetupScreenProps {gameId,…}`, `TableScreenProps {sessionId, view,…}`) |

