# Plan (backend + перестройка репозитория) — SWR-003

Автор: backend-lead, этап TECH_PLANNING, 2026-11-08. Это **дизайн**: код не написан, ничего не установлено и не
запускалось, кроме read-only команд (`ls`, `cat`, `grep`, `sqlite3 … select count(*)` по `apps/api/prisma/dev.db`).
Основа: `specification.md` (Architecture contract — FROZEN), `docs/architecture/application.md`,
`docs/tasks/SWR-002/plan-backend.md` §2 (tooling), текущий код `packages/{contracts,game-core,game-data}`, `apps/api`,
корневые конфиги. Изменения и уточнения замороженного контракта — **только** в §10 (Proposed amendments).

План frontend-lead (`plan-frontend.md`) появился в конце планирования; стык сверен с ним (§9), его PA-1..PA-7 приняты/отвечены в §9.3.

**Сверено с** `specification.md` → «Clarifications» Q-1..Q-25 (обязательны) и `test-cases.md` → Testability TR-1..TR-10.
Что из них влияет на backend и где учтено: Q-3 (§3.2), Q-4 (§2, §3.2), Q-5 (§3.2), Q-7 (§3.2), Q-9 (AM-5 закрыт), Q-11 (§2,
AM-1 пересмотрен), Q-21 (§1.8 B-15), Q-23 (§1.9), Q-24 (§3.4), Q-25 (§3.5), TR-3/TR-4/TR-6/TR-7/TR-8/TR-9 (§1.8, §1.9, §3.1, §3.5).

---

## 0. Ключевые решения

| # | Решение | Почему |
|---|---|---|
| D-1 | Один пакет на игру (`@bga/game-rebellion`) с subpath-экспортами `./definition ./schema ./rules ./scenario ./board ./assets ./ai ./server`; папки `src/<subpath>/index.ts`; **без** корневого экспорта `"."` | так в контракте; отсутствие `"."` не даёт «случайно» затащить всё в web |
| D-2 | Сохраняем схему SWR-002: пакеты собираются `tsc -b` в CJS `dist/`; Vite/Vitest/typecheck читают исходники через export-условие, переименованное в **`@bga/source`** | доказано в SWR-002; Nest исполняет `dist` |
| D-3 | Межпапочные импорты внутри игрового пакета — **относительные** (`'../schema'`); self-import по имени пакета запрещён | self-reference ненадёжен в Vite; относительные пути проверяются ESLint по слоям (§1.8) |
| D-4 | Решение «какие подпапки доступны web» — ESLint (`no-restricted-imports` с `regex`, установленный ESLint 10 его поддерживает) + `check:bundle` | как в SWR-002, но обобщено на `@bga/game-*` |
| D-5 | Сервис сессий не знает игр: всё игровое — через `ServerGameModule`, найденный по `Session.gameId` в серверном реестре; реестр инжектируется (переопределяется в тестах) | AC-5(а) — тест с фиктивным модулем без правок сервиса |
| D-6 | Порядок проверок команды: 404 → 400 (рамка конверта) → 422 (игра недоступна) → 500 (битый снимок) → модуль (400 → 409 → 422) → коммит (409) | сохраняет A-5 SWR-002 («400 побеждает 409», «409 побеждает 422») |
| D-7 | Prisma-миграция `Game→Session`, `GameEvent→SessionEvent` пишется **вручную** (Prisma сгенерировала бы DROP+CREATE с потерей данных), проверяется `prisma migrate diff` (пусто) и прогоном на копии dev-БД | AC-7, риск из спецификации |
| D-8 | Тексты карточки игры (Q-11): `name` — строка (имя собственное, не переводится); описание — `descriptionKey` `<ns>:<key>` (+ необязательный `description` fallback); alt обложки — `WebGameEntry.cover.altKey`; переводы — в web-локалях игры (FE) | Q-11, FE PA-1 |
| D-9 | Сборка пакетов через solution-файл `packages/tsconfig.json` (references) | один `tsc -b packages` / `--watch` без перечисления пакетов в root scripts |
| D-10 | W0-R делится на два коммита одного исполнителя: **R1** — механический перенос + rename (поведение не меняется), **R2** — добавление новых контрактов-скелетов (platform DTO, definitions, ai/assets, forbidden-stars, `ServerGameModule`) | после W0-R у FE и BE есть всё замороженное для параллельной работы; оба коммита с зелёными гейтами |

---

## 1. W0-R — перестройка репозитория (один исполнитель, первым, механически)

### 1.1 Целевое дерево

```text
packages/
├── tsconfig.json                         # solution: references → platform, games/rebellion, games/forbidden-stars (D-9)
├── platform/                             # @bga/platform
│   ├── package.json  tsconfig.json  tsconfig.test.json  vitest.config.mts
│   ├── src/{index,errors,api,game,sessions,validation,server-game-module}.ts   # game/sessions/validation/server-game-module — R2
│   └── test/{errors,game,sessions}.test.ts
└── games/
    ├── rebellion/                        # @bga/game-rebellion
    │   ├── package.json  tsconfig.json  tsconfig.test.json  vitest.config.mts
    │   ├── src/
    │   │   ├── definition/index.ts       # R2
    │   │   ├── schema/{index,enums,setup,state,scenario,commands,view,errors,results,legacy-api}.ts
    │   │   ├── rules/{index,apply-command,context,create-game,legal-actions,mock-rules,player-view,result}.ts, rules/internal/state.ts
    │   │   ├── scenario/{index,scenario}.ts
    │   │   ├── board/{index,layout}.ts
    │   │   ├── assets/{index,cover}.ts   # R2
    │   │   ├── ai/index.ts               # R2
    │   │   └── server/index.ts           # R2: заглушка `export {};` — наполняет W-API
    │   └── test/{schema,rules,scenario,board,definition,ai,assets}/**
    └── forbidden-stars/                  # @bga/game-forbidden-stars (R2)
        ├── package.json  tsconfig.json  tsconfig.test.json  vitest.config.mts
        ├── src/{definition,assets}/index.ts (+ assets/cover.ts)
        └── test/package-shape.test.ts
```

Удаляются целиком (после `git mv` в старых папках остаются неотслеживаемые `dist/`, `node_modules/` — удалить
`rm -rf packages/contracts packages/game-core packages/game-data`).

### 1.2 Точные переносы (R1, `git mv` чтобы сохранить историю)

| Откуда | Куда | Правка внутри |
|---|---|---|
| `packages/contracts/src/enums.ts` | `packages/games/rebellion/src/schema/enums.ts` | — |
| `contracts/src/setup.ts`, `state.ts`, `scenario.ts`, `commands.ts`, `view.ts` | `rebellion/src/schema/` (те же имена) | комментарий `@swr/game-data` → `./scenario` подпакета |
| `contracts/src/results.ts` | `rebellion/src/schema/results.ts` | `CommandErrSchema` теперь из `@bga/platform`; `CommandOkSchema`, `CommandResultSchema` остаются |
| `contracts/src/errors.ts` | **делится**: `platform/src/errors.ts` + `rebellion/src/schema/errors.ts` | см. §1.3 |
| `contracts/src/api.ts` | **делится**: `platform/src/api.ts` (`HealthResponseSchema`, `ErrorResponseSchema`) + `rebellion/src/schema/legacy-api.ts` (`GameIdParamSchema`, `CreateGameResponse*`, `GameSummary*`, `ListGamesResponse*`, `MAX_GAMES_LISTED`) | `legacy-api.ts` помечен `@deprecated SWR-003: удаляется на INTEGRATION` |
| `contracts/src/index.ts` | `platform/src/index.ts` (реэкспорт errors, api) и `rebellion/src/schema/index.ts` (реэкспорт всех schema-файлов + `legacy-api`) | — |
| `contracts/test/schemas.test.ts` | `rebellion/test/schema/schemas.test.ts` | импорт `../../src/schema` + `@bga/platform` |
| `packages/game-core/src/*.ts`, `src/internal/state.ts` | `rebellion/src/rules/` (те же имена, `internal/state.ts`) | `@swr/contracts` → `'../schema'` (`'../../schema'` в `internal/`) |
| `game-core/test/*.ts` (8 файлов, вкл. `helpers.ts`) | `rebellion/test/rules/` | `'../src'` → `'../../src/rules'`; `@swr/contracts` → `'../../src/schema'`; `@swr/game-data` → `'../../src/scenario'` |
| `packages/game-data/src/scenario.ts`, `index.ts` | `rebellion/src/scenario/scenario.ts`, `scenario/index.ts` | `@swr/contracts` → `'../schema'` |
| `game-data/src/layout.ts` | `rebellion/src/board/layout.ts` + новый `board/index.ts` (`export * from './layout'`) | комментарий о запрете импорта сценария |
| `game-data/test/layout.test.ts` | `rebellion/test/board/layout.test.ts` | `../src/layout` → `../../src/board`; `../src` → `../../src/scenario` |
| `game-data/test/scenario.test.ts` | `rebellion/test/scenario/scenario.test.ts` | импорты как выше |
| `*/tsconfig.json`, `tsconfig.test.json`, `vitest.config.mts` | по одному на новый пакет | §1.4 |

`rules/result.ts`: `CoreError` становится структурно совместимым с платформенным `GameModuleError` (§1.3); `ErrorMessageKey`
берётся из `../schema`.

### 1.3 Разделение ошибок (R1 — без изменения поведения)

```ts
// packages/platform/src/errors.ts (R1)
export const ErrorCodeSchema = z.enum(['ILLEGAL_COMMAND', 'VERSION_CONFLICT', 'NOT_FOUND', 'VALIDATION', 'INTERNAL']);
/** Общие messageKey платформы (FE PA-5: имя ERROR_MESSAGE_KEYS — в @bga/platform). */
export const ERROR_MESSAGE_KEYS = {
  validation: 'errors.validation', notFound: 'errors.notFound',
  versionConflict: 'errors.versionConflict', internal: 'errors.internal',
} as const;
export const ApiErrorSchema = z.strictObject({ code: ErrorCodeSchema, messageKey: z.string(), details: z.unknown().optional() });
export const ErrorResponseSchema = z.strictObject({ ok: z.literal(false), error: ApiErrorSchema });
export const CommandErrSchema = ErrorResponseSchema;          // старое имя, используется web/api
/** Ошибка, которую возвращает игровой модуль (не бросает). */
export type GameModuleErrorCode = 'VALIDATION' | 'VERSION_CONFLICT' | 'ILLEGAL_COMMAND';
export interface GameModuleError { code: GameModuleErrorCode; messageKey: string; details?: unknown }

// packages/games/rebellion/src/schema/errors.ts (R1)
export const REBELLION_ERROR_MESSAGE_KEYS = { notYourSide, unknownPiece, unknownSystem, notOwner, notInFromSystem, sameSystem, notAdjacent } (значения 'errors.*' как сейчас);
export type RebellionErrorMessageKey; export const RebellionErrorMessageKeySchema;
// Механика R1: в rules/** и тестах `ERROR_MESSAGE_KEYS.notAdjacent` (и др. игровые) → `REBELLION_ERROR_MESSAGE_KEYS.notAdjacent`;
// `ERROR_MESSAGE_KEYS.validation|versionConflict` → из `@bga/platform`. `CoreError.messageKey` — `string` (как GameModuleError).
// web `shared/i18n/locales.test.ts` проверяет переводы для обоих каталогов.
```

`apps/api/src/common/api-error.ts`: `import type { CoreError } from '@swr/game-core'` → `GameModuleError` из `@bga/platform`;
`fromCore` переименовывается в `fromModule` (вызовы — в `commands.service.ts`). Это нужно уже в R1, иначе `common/**`
нарушит новую границу (§1.8).

### 1.4 `package.json` / tsconfig пакетов

`packages/platform/package.json`:

```jsonc
{ "name": "@bga/platform", "version": "0.0.0", "private": true,
  "main": "./dist/index.js", "types": "./dist/index.d.ts",
  "exports": { ".": { "@bga/source": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -b", "typecheck": "tsc -p tsconfig.test.json", "lint": "eslint . --max-warnings=0", "test": "vitest run" },
  "dependencies": { "zod": "4.6.7" },
  "devDependencies": { "@types/node": "20.19.43", "typescript": "5.9.3", "vite": "8.3.6", "vitest": "4.1.12" } }
```

`packages/games/rebellion/package.json` (порядок условий важен: `@bga/source` → `types` → `default`):

```jsonc
{ "name": "@bga/game-rebellion", "version": "0.0.0", "private": true,
  "exports": {
    "./definition": { "@bga/source": "./src/definition/index.ts", "types": "./dist/definition/index.d.ts", "default": "./dist/definition/index.js" },
    "./schema":     { "@bga/source": "./src/schema/index.ts",     "types": "./dist/schema/index.d.ts",     "default": "./dist/schema/index.js" },
    "./rules":      { … rules … },  "./scenario": { … },  "./board": { … },  "./assets": { … },  "./ai": { … },  "./server": { … }
  },
  "scripts": { как у platform },
  "dependencies": { "@bga/platform": "workspace:*", "zod": "4.6.7" },
  "devDependencies": { как у platform } }
```

- В R1 в `exports` только реально существующие подпапки (`schema`, `rules`, `scenario`, `board`); R2 добавляет
  `definition`, `assets`, `ai`, `server`. После R2 `package.json` игровых пакетов **заморожен** (W-API/FE его не меняют).
- `@bga/game-forbidden-stars`: `exports` ровно `./definition` и `./assets`, зависимости `@bga/platform` (тип `GameDefinition`).
- `tsconfig.json` пакетов — как в SWR-002 (`composite`, `NodeNext`, `rootDir: src`, `outDir: dist`, `declaration(Map)`,
  `tsBuildInfoFile: dist/.tsbuildinfo`, `types: []`), `extends` — `../../tsconfig.base.json` для platform,
  `../../../tsconfig.base.json` для игр; `references: [{ "path": "../../platform" }]` у игр, у platform — нет.
  `dist/` игрового пакета получается `dist/<subpath>/index.{js,d.ts}`.
- `tsconfig.test.json`: `noEmit`, `module: ESNext`, `moduleResolution: Bundler`, `customConditions: ["@bga/source"]`,
  `types: ["node"]`, `include: ["src", "test", "vitest.config.mts"]`.
- `vitest.config.mts`: как сейчас, `const conditions = ['@bga/source', ...defaultServerConditions]`, `include: ['test/**/*.test.ts']`;
  у platform в R1 `test` запускается с `--passWithNoTests` (тесты появляются в R2, флаг снимается).
- `packages/tsconfig.json` (solution): `{ "files": [], "references": [{ "path": "./platform" }, { "path": "./games/rebellion" }, { "path": "./games/forbidden-stars" }] }`
  (в R1 — без forbidden-stars).

### 1.5 Workspace, root scripts, apps

- `pnpm-workspace.yaml`: `packages: [apps/*, packages/platform, packages/games/*]` (явно, чтобы `packages/*` не ловил папку `games`);
  `onlyBuiltDependencies` без изменений.
- Root `package.json` (имя workspace `star-wars-rebellion-ai` можно оставить — не влияет; предлагаю `board-game-ai` в R1):

```jsonc
"dev": "pnpm run build:packages && pnpm --filter @bga/api run db:prepare && concurrently -k --names pkgs,api,web --prefix-colors gray,blue,magenta \"pnpm run watch:packages\" \"pnpm --filter @bga/api run dev\" \"pnpm --filter @bga/web run dev\"",
"build:packages": "tsc -b packages",
"watch:packages": "tsc -b packages --watch --preserveWatchOutput",
```
  остальные скрипты (`lint`, `typecheck`, `test`, `build`, `e2e`, `check:bundle`, `verify`) — без изменений по смыслу.
- `apps/api/package.json`: `"name": "@bga/api"`; зависимости `@swr/contracts|game-core|game-data` → `@bga/platform`, `@bga/game-rebellion`
  (R2: + `@bga/game-forbidden-stars`). `apps/web/package.json`: `"name": "@bga/web"`; `@swr/contracts`, `@swr/game-data` →
  `@bga/platform`, `@bga/game-rebellion` (R2: + `@bga/game-forbidden-stars`). Все будущие зависимости добавляются **в W0-R**,
  чтобы W-API/FE не трогали `package.json`/lockfile.
- `pnpm install` (новых внешних пакетов нет; `--prefer-offline`). Проверка: `git diff pnpm-lock.yaml` затрагивает только
  `importers` / workspace-ссылки, ни одной внешней версии.
- Условие `@swr/source` → `@bga/source` везде: `apps/web/vite.config.ts` (`resolve.conditions`), `apps/web/tsconfig.app.json`
  (`customConditions`), `apps/api/tsconfig.json`, `apps/api/vitest.config.mts`, все `packages/**/vitest.config.mts` и `tsconfig.test.json`.
- `playwright.config.ts`: `--filter @swr/api|web` → `@bga/api|web`. `apps/api/.env.example`: комментарий `@swr/api` → `@bga/api`.
- `e2e/support/api.ts`: только комментарий (`@swr/contracts` → `@bga/platform` / `@bga/game-rebellion/schema`). Маршруты e2e не меняются.

### 1.6 Импорты в apps (R1; поведение не меняется)

| Было | Стало |
|---|---|
| `@swr/contracts` (типы/схемы Rebellion: `PlayerView`, `GameSetup`, `Faction`, `CommandEnvelope`, `ERROR_MESSAGE_KEYS`, `CreateGameResponse`, …) | `@bga/game-rebellion/schema` |
| `@swr/contracts` → `ErrorResponseSchema`, `CommandErrSchema`, `ApiErrorSchema`, `ErrorCodeSchema`, `HealthResponseSchema`, `ErrorCode` | `@bga/platform` |
| `@swr/game-core` (api: `createGame`, `applyCommand`, `toPlayerView`, `toPlayerEvents`) | `@bga/game-rebellion/rules` (только `apps/api/src/games/**`, `commands/**`) |
| `@swr/game-data` (api `app.module.ts`, api `test/support/fixtures.ts`, web `locales.i18n.test.ts`) | `@bga/game-rebellion/scenario` |
| `@swr/game-data/layout` (web, 8 файлов) | `@bga/game-rebellion/board` |

Механика: `grep -rl "@swr/" apps e2e scripts packages playwright.config.ts eslint.config.mjs package.json` → правка; символ-по-символу
решение «platform или schema» по таблице выше (TS-ошибка `has no exported member` сразу укажет промах).

### 1.7 Тесты после R1

| Пакет | Тесты | Кол-во файлов |
|---|---|---|
| `@bga/platform` | (R2) `test/errors.test.ts`, `game.test.ts`, `sessions.test.ts` | 0 → 3 |
| `@bga/game-rebellion` | `test/schema/schemas.test.ts`, `test/rules/*` (7 + helpers), `test/board/layout.test.ts`, `test/scenario/scenario.test.ts`; R2: `test/definition/definition.test.ts`, `test/ai/ai-config.test.ts`, `test/assets/assets.test.ts` | 10 → 13 |
| `@bga/game-forbidden-stars` | (R2) `test/package-shape.test.ts` | 0 → 1 |
| `apps/api`, `apps/web`, `e2e`, `scripts` | без изменения состава (только импорты) | — |

Число тест-кейсов Vitest в пакетах после R1 должно совпасть с SWR-002 (сравнить `Tests N passed` в логах до/после).

### 1.8 ESLint-границы (полная замена блока «Architecture boundaries»; пишется в R1, финальная версия — R2)

Общие константы:

```js
const AI_AND_SERVER = ['openai', 'openai/*', '@nestjs/*', '@prisma/*'];
const REACT_UI = ['react', 'react-*', 'react/*', 'react-dom/*', '@mui/*', 'konva', 'konva/*'];
const ANY_GAME_PKG = { regex: '^@bga/game-[^/]+(/.*)?$' };                       // любой игровой пакет и подпуть
const GAME_SERVER_ONLY = { regex: '^@bga/game-[^/]+/(rules|scenario|server|ai)(/.*)?$' };
const GAME_NOT_WEB = { regex: '^@bga/game-[^/]+(/(?!(definition|schema|board|assets)$).*)?$' }; // bare, deep и не-web подпути
const GAME_SUBDIRS_SERVER = ['../rules', '../rules/*', '../scenario', '../scenario/*', '../server', '../server/*', '../ai', '../ai/*'];
```

| # | `files` | Запрещено (`no-restricted-imports`) | Смысл |
|---|---|---|---|
| B-1 | `packages/platform/src/**/*.ts` | `@bga/*`, `ANY_GAME_PKG`, REACT_UI, AI_AND_SERVER, `node:*`, `**/games/**`, `**/apps/**` | platform — только zod |
| B-2 | `packages/games/*/src/**/*.ts` | `ANY_GAME_PKG` (в т.ч. self-import и чужие игры), `@bga/api`, `@bga/web`, REACT_UI, AI_AND_SERVER, `node:*`, `**/apps/**`, `**/platform/src/**` | игры зависят только от `@bga/platform` и zod |
| B-3 | `packages/games/*/src/{definition,schema,board,assets}/**/*.ts` (web-доступные) | `../*` целиком (любой выход из своей папки), кроме `schema` → разрешено ничего; т.е. `group: ['../*', '../../*']` | web-подпути самодостаточны; **board не может потянуть scenario** (замена правила `layout.ts` SWR-002) |
| B-4 | `packages/games/*/src/scenario/**` | `GAME_SUBDIRS_SERVER` кроме самого себя → `../rules*`, `../server*`, `../ai*`, `../board*`, `../assets*` | сценарий — данные, видит только `../schema` |
| B-5 | `packages/games/*/src/rules/**` | `../scenario*`, `../server*`, `../ai*`, `../board*`, `../assets*`, `../definition*`; + `no-restricted-syntax` `new Date`, `no-restricted-properties` `Date.now`, `Math.random` (как game-core) | чистые детерминированные правила; сценарий — только в тестах |
| B-6 | `packages/games/*/src/ai/**` | `../rules*`, `../scenario*`, `../server*`, `../board*`, `../assets*` | AI-конфиг — данные; видит `../schema` (типы Difficulty/Faction) |
| B-7 | `packages/games/*/src/server/**` | `../board*`, `../assets*` | сервер связывает definition+schema+rules+scenario(+ai) |
| B-8 | `apps/web/src/**/*.{ts,tsx}` | `GAME_NOT_WEB`, `@prisma/*`, `@nestjs/*`, `openai*`, `**/packages/**` + `WEB_DYNAMIC_IMPORTS` (selector ниже) | web: только `definition/schema/board/assets` |
| B-9 | `apps/web/src/{app,shared,platform}/**/*.{ts,tsx}`, `ignores: WEB_PLATFORM_LEGACY` | `ANY_GAME_PKG`; `@/games/*` + `!@/games/registry`; `**/games/*` + `!**/games/registry`; `@/features/*`, `**/features/*` (FE §9 п.2) | общий web-код не знает игр — только `apps/web/src/games/registry.ts` |
| B-10 | `apps/web/src/**/*.i18n.test.ts` | `{ regex: '^@bga/game-[^/]+/(rules|server|ai)(/.*)?$' }`, `@prisma/*`, `@nestjs/*`, `openai*` | тест переводов может читать `/scenario`, но не правила |
| B-11 | `apps/api/src/**/*.ts` | `react*`, `@mui/*`, `openai*` | как SWR-002 |
| B-12 | `apps/api/src/{sessions,common,persistence,health}/**/*.ts`, `apps/api/src/{app.module,app.factory,main}.ts` | `ANY_GAME_PKG` | общий серверный код не импортирует игровые пакеты (только `../game-registry/**`) |
| B-13 | `apps/api/src/game-registry/**/*.ts` | `{ regex: '^@bga/game-[^/]+(/(?!(definition|server)$).*)?$' }` | реестр видит только `./definition` и `./server` |
| B-14 | `apps/api/test/support/fake-game.ts` | `ANY_GAME_PKG` | доказательство AC-5(а): фиктивная игра не опирается на Rebellion |
| B-15 | `apps/*/src/**/*.{ts,tsx}`, `packages/**/src/**/*.ts`, `ignores: ['**/*.test.{ts,tsx}', '**/test/**']` | `no-restricted-syntax`: `ImportExpression[source.type!="Literal"]` (Q-21: никакого `import()` с вычисляемым именем во всём репозитории, кроме тестов) | AC-9: нет динамической загрузки игр по имени |
| B-17 | `apps/web/src/games/*/**` (кроме `registry.ts`, `types.ts`, `registry.consistency.test.ts`); `apps/web/src/games/forbidden-stars/**` | `@/games/*` + `!@/games/types`; для forbidden-stars — `{ regex: '^@bga/(?!platform$|game-forbidden-stars/(definition|assets)$)' }` | FE §9 п.3: игры не видят друг друга и реестр |
| B-16 | `apps/web/src/games/registry.consistency.test.ts` (единственное исключение) | разрешён относительный импорт `../../../api/src/game-registry/definitions` (только definitions, без модулей) | Q-25: тест согласованности web- и серверного реестра |

Для `.tsx` web, где `no-restricted-syntax` уже переопределён блоком JSX_UI_LITERALS, селектор B-15 включается в тот же массив
(как сейчас `WEB_DYNAMIC_IMPORTS`). Для api/packages — отдельный блок; в `packages/games/*/src/rules/**` он объединяется с
запретом `new Date` (ESLint берёт последний блок для правила — объединить селекторы в один массив).

`WEB_DYNAMIC_IMPORTS` (selector для `ImportExpression`): `source.value=/^@bga\/game-[^/]+(\/(?!(definition|schema|board|assets)$).*)?$|(^|\/)packages\//`
+ запрет нелитерального specifier (как сейчас). Node-globals блок: `packages/*/*.{ts,mts,mjs}` → `packages/platform/*.{ts,mts,mjs}`,
`packages/games/*/*.{ts,mts,mjs}`, `packages/platform/test/**/*.ts`, `packages/games/*/test/**/*.ts`. Блоки
`apps/web/src/**/*.tsx` (JSX_UI_LITERALS) и Nest `consistent-type-imports: off` — без изменений.

**B-9 и параллельная работа.** Сейчас `apps/web/src/shared/**` импортирует Rebellion-схему (`shared/ui/PieceGlyph.tsx`,
`shared/ui/FactionChip.tsx`, `shared/test/fixtures.ts`, `shared/i18n/locales.test.ts`, `shared/api/games.ts`). Включить B-9 в R1
без переноса этих файлов нельзя (W0-R не меняет web-структуру). Решение: список-исключение в отдельном файле
`eslint.web-legacy.mjs` (`export const WEB_PLATFORM_LEGACY = ['apps/web/src/shared/ui/PieceGlyph.tsx', …]`), который
`eslint.config.mjs` импортирует. Файл **принадлежит FE** после W0-R; FE DONE WHEN: массив пуст. INTEGRATION удаляет файл и импорт.
Так `eslint.config.mjs` после W0-R не правит никто, кроме лида (amendment AM-7).

Проверка правил — **автотест в `pnpm test`** (TR-7): `scripts/eslint-boundaries.test.mjs` (`node --test`, уже входит в
`test:process`) на `new ESLint({ cwd: REPO_ROOT }).lintText(code, { filePath })`: таблица `[filePath, code, expect: 'error'|'ok']`,
покрывающая TC-EXT-09..12, TC-ARCH-02 и строки ниже (файлов на диске не создаёт; `filePath` может не существовать).
Пишет W0-R вместе с правилами; добавление кейсов позже — QA/лиды. Эквивалент для ручной отладки:

```bash
probe() { printf '%s\n' "$2" | pnpm exec eslint --stdin --stdin-filename "$1" --max-warnings=0 >/dev/null && echo "MISSED $1: $2" || echo "ok   $1: $2"; }
probe apps/web/src/features/x.ts           "import '@bga/game-rebellion/rules';"
probe apps/web/src/features/x.ts           "import '@bga/game-rebellion/scenario';"
probe apps/web/src/features/x.ts           "import '@bga/game-rebellion/ai';"
probe apps/web/src/features/x.ts           "import '@bga/game-rebellion/server';"
probe apps/web/src/features/x.ts           "import '@bga/game-rebellion/src/schema';"
probe apps/web/src/features/x.ts           "export const f = () => import('@bga/game-rebellion/rules');"
probe apps/web/src/platform/x.ts           "import '@bga/game-rebellion/schema';"
probe apps/web/src/platform/x.ts           "import '@/games/rebellion/x';"
probe apps/api/src/sessions/x.ts           "import '@bga/game-rebellion/server';"
probe apps/api/src/common/x.ts             "import '@bga/game-rebellion/schema';"
probe apps/api/src/game-registry/x.ts      "import '@bga/game-rebellion/rules';"
probe packages/platform/src/x.ts           "import '@bga/game-rebellion/schema';"
probe packages/games/rebellion/src/board/x.ts    "import '../scenario';"
probe packages/games/rebellion/src/schema/x.ts   "import '../rules';"
probe packages/games/rebellion/src/rules/x.ts    "export const t = Date.now();"
probe packages/games/forbidden-stars/src/definition/x.ts "import '@bga/game-rebellion/definition';"
```
Позитивные пробы (должны пройти): web → `@bga/game-rebellion/board`, `/schema`, `/definition`, `/assets`;
`apps/web/src/platform/x.ts` → `@/games/registry`; `apps/api/src/game-registry/x.ts` → `@bga/game-rebellion/server`;
`apps/web/src/games/rebellion/x.tsx` → `@bga/game-rebellion/definition`. Негативные из TC-EXT-09: в `apps/api/src/{sessions,common}`,
`apps/web/src/{app,shared,platform}`, `packages/platform/src` — `@bga/game-rebellion`, `/definition`,
`@bga/game-forbidden-stars/definition`, относительный путь в `packages/games/…`; TC-ARCH-02: `` import(`@bga/game-${id}/definition`) ``
в web и api → ошибка (B-15).

**Важно для B-9 и allowlist:** пробы для `apps/web/src/shared/probe.ts` должны давать ошибку и при непустом `WEB_PLATFORM_LEGACY`
(allowlist перечисляет конкретные файлы, не папки).

### 1.9 `scripts/check-web-bundle.mjs`

- `loadScenario`: `packages/game-data/dist/index.js` → `packages/games/rebellion/dist/scenario/index.js`; сообщения об ошибках
  (`packages/game-data does not export mockScenario`) → `@bga/game-rebellion/scenario …`.
- `spawnSync('pnpm', ['--filter', '@swr/web', …])` → `@bga/web`; комментарий в шапке.
- `scripts/check-web-bundle.test.mjs`: путь `scenarioDist` → тот же новый путь; сообщение `t.skip(...)`.
- Правила (rebel base, piece ids, `__boardDebug`) не меняются.
- **Проверка состава модулей (Q-23, TR-8, TC-ARCH-08), R2:** новая функция `checkBundleModules()` в том же скрипте. Она делает
  отдельную сборку `pnpm --filter @bga/web exec vite build --sourcemap hidden --outDir <os.tmpdir()/bga-bundle-modules-XXXX> --emptyOutDir`
  (основной `apps/web/dist` не трогается, sourcemap в него не попадает), читает `sources` всех `*.map` и:
  (а) **fail**, если есть путь `packages/games/[^/]+/src/(rules|scenario|server|ai)/`; (б) **fail**, если есть `packages/games/…/src/<x>/`
  с `<x>` ∉ {definition, schema, board, assets}; (в) печатает перечень игровых модулей бандла (`--modules` — только перечень).
  Чистые функции (`forbiddenGameModules(sources)`) тестируются в `scripts/check-web-bundle.test.mjs` синтетическими списками
  (как существующие правила). Время: +1 сборка web (~10–20 с) в `check:bundle`. Флаг `--skip-modules` — только для локальной
  отладки, в `verify` не используется.
- TC-ARCH-06: при отсутствии `packages/games/rebellion/dist/scenario/index.js` — exit 2 (как сейчас), не «чисто».

### 1.10 Что W0-R **не** меняет

API-маршруты `/api/games*`, Nest-модули `games/`, `commands/`, Prisma-схему, web-маршруты и структуру `apps/web/src/features/**`,
e2e-спеки. Никакой новой логики, кроме R2-скелетов, которые никем не используются в рантайме (кроме переводов новых ключей ошибок).

### 1.11 R2 — скелеты контрактов (тот же исполнитель, отдельный коммит)

1. `packages/platform/src/{game,sessions,validation,server-game-module}.ts` — ровно по §2; `errors.ts` += `GAME_UNAVAILABLE`,
   `gameNotFound`, `gameUnavailable`, `sessionNotFound`; тесты platform.
2. `rebellion/src/definition/index.ts` — `rebellionDefinition = { id: 'star-wars-rebellion', name: 'Star Wars: Rebellion', descriptionKey: 'rebellion.meta:description', status: 'available', supportedPlayers: [2], supportsAI: true } satisfies GameDefinition` + `REBELLION_GAME_ID`; forbidden-stars — `{ id: 'forbidden-stars', name: 'Forbidden Stars', descriptionKey: 'forbidden-stars.meta:description', status: 'coming_soon', supportedPlayers: [2, 3, 4], supportsAI: true }`; `schema/details.ts` — `RebellionSessionDetailsSchema`; `ai/index.ts`, `assets/{index,cover}.ts` — по §4; `server/index.ts` = `export {};`
   с комментарием «наполняет W-API»; тесты definition/ai/assets.
3. Пакет `packages/games/forbidden-stars` (definition `coming_soon`, assets) + `test/package-shape.test.ts`
   (ключи `exports` === `['./definition', './assets']`, в `src/` только `definition/`, `assets/`; AC-6).
4. `packages/tsconfig.json` += forbidden-stars; `apps/{api,web}/package.json` += `@bga/game-forbidden-stars`; `pnpm install`.
5. `apps/api/src/common/api-error.ts`: `STATUS_BY_CODE.GAME_UNAVAILABLE = 422` (иначе `Record<ErrorCode, number>` не компилируется).
6. `apps/web/src/locales/{en,ru}/errors.json`: три новых ключа (тест «каждый ключ переведён» иначе упадёт). Тексты FE может поменять позже.
7. ESLint: финальные `ignores`/пробы с forbidden-stars; `scripts/eslint-boundaries.test.mjs` (TR-7); блоки B-15, B-16.
8. `scripts/check-web-bundle.mjs`: проверка состава модулей (§1.9, Q-23) + тесты.

### 1.12 DONE WHEN (W0-R, после R1 **и** после R2)

```bash
pnpm install --prefer-offline                     # lockfile: только importers
pnpm verify                                       # lint, typecheck, test, build, check:bundle, e2e — всё зелёное
node scripts/check-task.mjs docs/tasks/SWR-003    # код 0
grep -rn "@swr" --exclude-dir={node_modules,dist,dist-e2e,.tmp,docs} . ; test $? -eq 1   # ноль совпадений (docs/ — историческое, правится на INTEGRATION)
grep -rn "packages/\(contracts\|game-core\|game-data\)" --exclude-dir={node_modules,docs} . ; test $? -eq 1
rm -rf packages/platform/dist packages/games/*/dist && pnpm --filter @bga/web test && pnpm --filter "./packages/**" test   # доказательство условия @bga/source (без dist)
pnpm run build:packages && ls packages/games/rebellion/dist/{schema,rules,scenario,board}/index.js   # R2: + definition, assets, ai, server
node --test scripts/eslint-boundaries.test.mjs scripts/check-web-bundle.test.mjs   # пробы §1.8 (TR-7) и bundle-правила (входят в pnpm test)
git diff --exit-code d4895ac -- apps/api/prisma/migrations/20261107235651_init   # TC-MIG-06: init-миграция не тронута
```

Логи: `docs/tasks/SWR-003/artifacts/logs/w0r-r1-verify.log`, `w0r-r2-verify.log`, `w0r-eslint-probes.log`,
`w0r-test-counts.txt` (число тестов до/после R1 по каждому пакету). Если что-то не запускалось — `not_run` с причиной.

OWNED FILES W0-R: `packages/**`, `apps/api/**` (только импорты, `package.json`, `common/api-error.ts`, `tsconfig.json`,
`vitest.config.mts`, `.env.example`), `apps/web/**` (только импорты, `package.json`, `vite.config.ts`, `tsconfig.app.json`,
`locales/*/errors.json`), `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `eslint.config.mjs`, `eslint.web-legacy.mjs`,
`playwright.config.ts`, `scripts/check-web-bundle{,.test}.mjs`, `scripts/eslint-boundaries.test.mjs` (новый), `e2e/support/api.ts` (комментарий).
**Никто другой не работает в репозитории, пока W0-R не сдан.**

---

## 2. `@bga/platform` — содержимое (R2, замораживается вместе с W0-R)

Файлы и экспорт (`src/index.ts` реэкспортирует всё):

```ts
// game.ts
/** kebab-case, стабилен навсегда (хранится в Session.gameId). */
export const GameIdSchema = z.string().max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export type GameId = z.infer<typeof GameIdSchema>;
export const GameStatusSchema = z.enum(['available', 'coming_soon']);
export type GameStatus = z.infer<typeof GameStatusSchema>;

export const GameDefinitionSchema = z.strictObject({
  id: GameIdSchema,
  name: z.string().min(1),                       // имя собственное, не переводится (Q-11)
  descriptionKey: z.string().regex(/^[a-z0-9.-]+:[A-Za-z0-9._-]+$/),  // полный ключ '<ns>:<key>', напр. 'rebellion.meta:description' (Q-11, FE PA-1)
  description: z.string().min(1).optional(),     // fallback (ru), если перевода нет
  coverImage: z.string().min(1).optional(),      // по контракту; встроенные игры НЕ задают — обложка берётся из `./assets`
                                                 // через WebGameEntry.cover, без неё web рисует плейсхолдер (TC-EXT-07)
  status: GameStatusSchema,
  supportedPlayers: z.array(z.int().min(1).max(8)).min(1)
    .refine((a) => a.every((n, i) => i === 0 || n > a[i - 1]!), 'ascending, unique'),
  supportsAI: z.boolean(),
});
export type GameDefinition = z.infer<typeof GameDefinitionSchema>;

// Ассеты (`./assets`) типом платформы не описываются: у каждой игры — свои данные (§4.2). Alt обложки — `WebGameEntry.cover.altKey` (web).

// sessions.ts
export const SessionIdSchema = z.string().min(1).max(64);       // непрозрачный id (UUID в проде)
export const MAX_SESSIONS_LISTED = 20;
export const SessionDetailsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));
export type SessionDetails = z.infer<typeof SessionDetailsSchema>;
export const SessionSummarySchema = z.strictObject({
  sessionId: SessionIdSchema, gameId: GameIdSchema, version: z.int().positive(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), details: SessionDetailsSchema,
});
/** Q-5: отсутствует или '' → без фильтра; массив (повтор параметра) → 400; неизвестный корректный id → [] (200). Лишние параметры игнорируются. */
export const ListSessionsQuerySchema = z.object({
  gameId: z.preprocess((v) => (v === '' ? undefined : v), GameIdSchema.optional()),
});
export const ListSessionsResponseSchema = z.array(SessionSummarySchema);
export const CreateSessionRequestSchema = z.strictObject({ gameId: GameIdSchema, setup: z.unknown() });
/** Ответ POST /api/sessions (201) и GET /api/sessions/:id. `view` — PlayerView конкретной игры. */
export const SessionResponseSchema = z.strictObject({ sessionId: SessionIdSchema, gameId: GameIdSchema, view: z.unknown() });
export function makeSessionResponseSchema<V extends z.ZodType>(view: V) { return SessionResponseSchema.extend({ view }); }
/** Рамка конверта команды: игра уточняет actor и command своей схемой. */
export const CommandEnvelopeFrameSchema = z.object({ actor: z.string().min(1), expectedVersion: z.int().positive(), command: z.unknown() });
export const SessionCommandOkSchema = z.strictObject({ ok: z.literal(true), view: z.unknown(), events: z.array(z.unknown()) });
export const SessionCommandResultSchema = z.discriminatedUnion('ok', [SessionCommandOkSchema, ErrorResponseSchema]);   // FE PA-2
export function makeCommandOkSchema<V extends z.ZodType, E extends z.ZodType>(view: V, event: E) {
  return SessionCommandOkSchema.extend({ view, events: z.array(event) });
}
// + типы z.infer для всех схем: SessionSummary, CreateSessionRequest, SessionResponse, ListSessionsResponse, SessionCommandOk …

// errors.ts (R1 + R2)
export const ErrorCodeSchema = z.enum(['ILLEGAL_COMMAND', 'VERSION_CONFLICT', 'NOT_FOUND', 'VALIDATION', 'INTERNAL', 'GAME_UNAVAILABLE']);
export const ERROR_MESSAGE_KEYS = {
  validation: 'errors.validation', notFound: 'errors.notFound', versionConflict: 'errors.versionConflict',
  internal: 'errors.internal', gameNotFound: 'errors.gameNotFound', gameUnavailable: 'errors.gameUnavailable',
  sessionNotFound: 'errors.sessionNotFound',
} as const;
// ApiErrorSchema, ErrorResponseSchema (= CommandErrSchema), GameModuleError(Code) — §1.3

// validation.ts
export interface ValidationIssue { path: (string | number)[]; code: string; message: string }
export function toValidationIssues(error: z.ZodError, prefix: (string | number)[] = []): ValidationIssue[];  // symbol → String

// api.ts
export const HealthResponseSchema = z.strictObject({ status: z.literal('ok') });
```

### 2.1 `ServerGameModule` (уточнение эскиза спецификации; смысл сохранён)

```ts
// packages/platform/src/server-game-module.ts — только типы + identity-хелпер. Ничего о фракциях/фазах/системах.
export interface CreateSessionContext { sessionId: string; now: string }   // ISO-8601; модуль детерминирован
export interface ApplyCommandContext { now: string }

/** Минимальная форма события, которую сервис пишет в SessionEvent (append-only зеркало журнала). */
export interface SessionEventRecord { seq: number; type: string; actor: string; at: string; payload: unknown }

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };
export type ApplyCommandResult<State, Event> =
  | { ok: true; state: State; events: Event[] }
  | { ok: false; error: GameModuleError };                                  // отказ — результат, не исключение

/**
 * Серверная часть игры. Методы объявлены method-синтаксисом НАМЕРЕННО: параметры методов бивариантны,
 * поэтому `ServerGameModule<RebellionState, …>` присваивается `ServerGameModule` (unknown) в реестре без `any`.
 * Состояние и setup должны быть JSON-сериализуемы (хранятся строкой JSON).
 */
export interface ServerGameModule<State = unknown, Setup = unknown, Event extends SessionEventRecord = SessionEventRecord> {
  /** status обязан быть 'available' (проверяется реестром при старте). */
  readonly definition: GameDefinition;
  /** Схема setup игры, с дефолтами. Ошибка → 400 VALIDATION, path с префиксом ['setup']. */
  parseSetup(input: unknown): ParseResult<Setup>;
  /** Новая партия: версия = 1; events — начальные события (их seq ≥ 1) для SessionEvent. */
  createInitialState(setup: Setup, ctx: CreateSessionContext): { state: State; events: Event[] };
  /** Снимок из БД (уже JSON.parse). Несоответствие схеме/версии/id → throw (сервис отдаёт 500 INTERNAL). */
  parseState(raw: unknown, expected: { sessionId: string; version: number }): State;
  version(state: State): number;
  /** Порядок внутри: 400 (схема конверта игры) → 409 (expectedVersion ≠ version) → 422 (правила). Вход не мутирует. */
  applyCommand(state: State, envelope: unknown, ctx: ApplyCommandContext): ApplyCommandResult<State, Event>;
  /** Только то, что видно человеку (модуль сам выбирает зрителя). Уже провалидировано схемой view игры. */
  toPlayerView(state: State): unknown;
  /** События команды, отфильтрованные для того же зрителя. */
  toPlayerEvents(events: readonly Event[], state: State): unknown[];
  /** Плоские, НЕ секретные поля для списков сессий (SessionSummary.details). */
  summarize(state: State): SessionDetails;
}

export function defineServerGameModule<State, Setup, Event extends SessionEventRecord>(
  module: ServerGameModule<State, Setup, Event>,
): ServerGameModule { return module as ServerGameModule; }
```

Отличия от эскиза: `createInitialState` возвращает и начальные события (сервису нужно писать `SessionEvent`); `parseState`
получает ожидаемые `sessionId`/`version` (перенос проверки из `games/game-state.parser.ts`); тип ошибки — `GameModuleError`;
дженерики `Setup` и `Event extends SessionEventRecord`. Вне интерфейса оставлены AI-конфиг и ассеты (не нужны сервису сессий).
ESLint: в `packages/platform` **не** включать `@typescript-eslint/method-signature-style: property` (сломает бивариантность) —
комментарий в файле.

---

## 3. W-API — сессии, реестр, серверный модуль Rebellion, миграция

Выполняет BE-worker «API» после W0-R, **параллельно** с FE.

### 3.1 Структура `apps/api/src` после W-API

```text
app.module.ts            # imports: Persistence, Health, GameRegistryModule.forRoot({ modules, definitions }), SessionsModule
app.factory.ts           # TR-3: CreateAppOptions += gameModules?: readonly ServerGameModule[], gameDefinitions?: readonly GameDefinition[]
                         #   (по умолчанию SERVER_GAME_MODULES / GAME_DEFINITIONS); idGenerator.sessionId()
main.ts
common/{api-error, api-exception.filter, runtime.tokens, zod-validation.pipe}.ts
health/**                # без изменений
persistence/**           # без изменений
game-registry/
  definitions.ts         # GAME_DEFINITIONS — импортирует только `@bga/game-*/definition` (его читает и web-тест согласованности, Q-25)
  registry.ts            # SERVER_GAME_MODULES — единственное место, где названы серверные модули игр
  game-registry.ts       # class GameRegistry + createGameRegistry({ modules, definitions }) + validateRegistry
  game-registry.module.ts  game-registry.tokens.ts (GAME_REGISTRY)
sessions/
  sessions.controller.ts   sessions.service.ts   session-commands.service.ts
  sessions.repository.ts   # единственный Prisma-доступ к Session/SessionEvent
  sessions.module.ts
```
Удаляются: `games/**`, `commands/**`, токен `SCENARIO` (сценарий теперь внутри `./server` Rebellion).
`IdGenerator.gameId()` → `sessionId()`. `systemClock` → `wallClock` (TC-EXT-06 grep'ает `sessions/**`, `common/**` на слова
`faction|empire|rebellion|phase|round|piece|system|rebelBase` — в общем серверном коде их быть не должно; комментарии тоже).
`GameRegistryModule.forRoot` вызывает `createGameRegistry` → `validateRegistry` (невалидный реестр — ошибка старта).

```ts
// game-registry/registry.ts
import { rebellionServerModule } from '@bga/game-rebellion/server';
export const SERVER_GAME_MODULES: readonly ServerGameModule[] = [rebellionServerModule];

// game-registry/definitions.ts
import { forbiddenStarsDefinition } from '@bga/game-forbidden-stars/definition';
import { rebellionDefinition } from '@bga/game-rebellion/definition';
/** Все игры каталога, включая coming_soon — для валидации gameId (404 vs 422). Порядок = порядок каталога (Q-2). */
export const GAME_DEFINITIONS: readonly GameDefinition[] = [rebellionDefinition, forbiddenStarsDefinition];

// game-registry/game-registry.ts
export class GameRegistry {
  definition(gameId: string): GameDefinition | undefined;
  module(gameId: string): ServerGameModule | undefined;
  /** create: неизвестная → ApiError 404 gameNotFound; coming_soon/без модуля → 422 GAME_UNAVAILABLE. */
  requireAvailable(gameId: string): ServerGameModule;
}
export function createGameRegistry(input: { modules: readonly ServerGameModule[]; definitions: readonly GameDefinition[] }): GameRegistry;
// validateRegistry (вызывается в createGameRegistry, throw при старте): уникальные id; каждая definition проходит
// GameDefinitionSchema; у каждого модуля definition присутствует в definitions и status 'available';
// у каждой 'available' definition есть модуль; у 'coming_soon' модуля нет.
```

### 3.2 HTTP и сервис сессий (по контракту)

| Route | Порядок проверок / ответ |
|---|---|
| `POST /api/sessions` `{ gameId, setup }` | 400 тело (`CreateSessionRequestSchema`, в т.ч. формат gameId, битый JSON) → 404 `errors.gameNotFound` → 422 `GAME_UNAVAILABLE`/`errors.gameUnavailable` → 400 setup (`parseSetup`, `details.issues[].path` = `['setup', …]`) → `createInitialState` → insert (Session + SessionEvent одной транзакцией) → `201 { sessionId, gameId, view }` |
| `GET /api/sessions?gameId=` | Q-5: параметр отсутствует или пуст → все игры; повторный (`?gameId=a&gameId=b`) или некорректного формата → 400 `VALIDATION`; корректный, но неизвестный id → `[]` (200); `coming_soon` → `[]`. Список: `updatedAt desc` (вторично `id desc`), `take 20` (лимит действует и с фильтром); строки с битым снимком или с `gameId` без серверного модуля пропускаются (Q-7; `warn sessionId=… gameId=… code=CORRUPT_SNAPSHOT|GAME_UNAVAILABLE`) |
| `GET /api/sessions/:sessionId` | 404 `errors.sessionNotFound` (в т.ч. id > 64) → 422 `GAME_UNAVAILABLE` (игра сессии без модуля) → 500 битый снимок → `{ sessionId, gameId, view }` |
| `POST /api/sessions/:sessionId/commands` | 404 `errors.sessionNotFound` → 400 рамка (`CommandEnvelopeFrameSchema`) → 422 `GAME_UNAVAILABLE` → 500 битый снимок → `module.applyCommand` (400/409/422) → коммит `updateMany WHERE id AND version = module.version(state)` (0 строк → 409 с актуальной версией) → `200 { ok: true, view, events }` |
| прочее под `/api` | 404 `errors.notFound` (как SWR-002) |

Ответы сервиса валидируются платформенными схемами (`SessionResponseSchema`, `ListSessionsResponseSchema`, `SessionCommandOkSchema`);
`view` валидирует модуль. Логи фильтра/сервиса: только `sessionId`, `gameId`, `code`, `status` (+ класс ошибки для 500).
`ApiExceptionFilter`: `req.params.id` → `req.params.sessionId`.

Маппинг ошибок (`common/api-error.ts`):

| Источник | HTTP | `code` | `messageKey` |
|---|---|---|---|
| Zod/тело/рамка/`parseSetup`/модуль `VALIDATION` | 400 | `VALIDATION` | `errors.validation` (у модуля — свой ключ) |
| нет игры | 404 | `NOT_FOUND` | `errors.gameNotFound` |
| нет сессии | 404 | `NOT_FOUND` | `errors.sessionNotFound` |
| неизвестный маршрут/метод | 404 | `NOT_FOUND` | `errors.notFound` |
| игра `coming_soon` / без модуля | 422 | `GAME_UNAVAILABLE` | `errors.gameUnavailable` |
| модуль `VERSION_CONFLICT` / гонка коммита | 409 | `VERSION_CONFLICT` | `errors.versionConflict`, `details.currentVersion` |
| модуль `ILLEGAL_COMMAND` | 422 | `ILLEGAL_COMMAND` | ключ игры (`errors.notAdjacent` …) |
| всё остальное | 500 | `INTERNAL` | `errors.internal` |

Фабрики: `ApiError.gameNotFound()`, `.sessionNotFound()`, `.gameUnavailable()`, `.fromModule(GameModuleError)`, `.fromZod(err, prefix?)`
(через `toValidationIssues`).

### 3.3 Серверный модуль Rebellion (`packages/games/rebellion/src/server/`)

```ts
// server/index.ts → export { rebellionServerModule } from './rebellion-server-module';
export const rebellionServerModule = defineServerGameModule<GameState, GameSetup, GameEvent>({
  definition: rebellionDefinition,                                             // ../definition
  parseSetup: (input) => fromZod(GameSetupSchema.safeParse(input)),            // A-7 дефолты сохраняются
  createInitialState: (setup, ctx) => {
    const state = createGame(setup, mockScenario, { gameId: ctx.sessionId, now: ctx.now });
    return { state, events: state.log };                                      // [GAME_CREATED seq 1]
  },
  parseState: (raw, expected) => { const s = GameStateSchema.parse(raw); if (s.id !== expected.sessionId || s.version !== expected.version) throw new Error('snapshot mismatch'); return s; },
  version: (s) => s.version,
  applyCommand: (s, envelope, ctx) => applyCommand(s, envelope, ctx),          // уже 400→409→422 (rules)
  toPlayerView: (s) => PlayerViewSchema.parse(toPlayerView(s, s.setup.humanFaction)),
  toPlayerEvents: (events, s) => toPlayerEvents([...events], s, s.setup.humanFaction),
  summarize: (s) => ({
    humanFaction: s.setup.humanFaction, opponent: s.setup.opponent.kind,
    ...(s.setup.opponent.kind === 'ai' ? { difficulty: s.setup.opponent.difficulty } : {}),
    round: s.round, phase: s.phase,
  }),
});
```

- Ключи `details` Rebellion (замораживаются для FE): `humanFaction`, `opponent` (`'ai'|'human'`), `difficulty?`, `round`, `phase` (FE PA-3; схема `RebellionSessionDetailsSchema` в `./schema`, добавляет R2) — ровно то,
  что показывает список SWR-002. Никаких данных о базе/скрытых объектах (тест).
- `rules/context.ts` (`CreateContext.gameId`) **не** переименовываем в W-API (поле = id сессии; `GameState.id` тоже) —
  без лишней правки правил; отмечено как naming debt.
- `schema/commands.ts`: `CommandEnvelopeSchema` можно (необязательно) выразить через `CommandEnvelopeFrameSchema.extend({ actor: FactionSchema, command: CommandSchema })` со `strict` — поведение то же.

### 3.4 Prisma: `Game → Session`, `GameEvent → SessionEvent`

```prisma
model Session {
  id        String         @id
  gameId    String
  setup     String         // JSON: setup (output-форма игры)
  state     String         // JSON: полный state — НИКОГДА не уходит клиенту
  version   Int
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  events    SessionEvent[]
  @@index([gameId, updatedAt])
  @@index([updatedAt])
}
/// Append-only зеркало журнала игры, пишется в той же транзакции, что и снимок.
model SessionEvent {
  id        Int      @id @default(autoincrement())
  sessionId String
  seq       Int
  type      String
  actor     String
  payload   String   // JSON
  createdAt DateTime @default(now())
  session   Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  @@unique([sessionId, seq])
}
```

Миграция `apps/api/prisma/migrations/20261108120000_sessions/migration.sql` — **вручную**, по образцу Prisma «redefine table»:

```sql
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "Session" ("id" TEXT NOT NULL PRIMARY KEY, "gameId" TEXT NOT NULL, "setup" TEXT NOT NULL, "state" TEXT NOT NULL,
  "version" INTEGER NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL);
INSERT INTO "Session" ("id","gameId","setup","state","version","createdAt","updatedAt")
  SELECT "id", 'star-wars-rebellion', "setup", "state", "version", "createdAt", "updatedAt" FROM "Game";
CREATE TABLE "SessionEvent" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "sessionId" TEXT NOT NULL, "seq" INTEGER NOT NULL,
  "type" TEXT NOT NULL, "actor" TEXT NOT NULL, "payload" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
INSERT INTO "SessionEvent" ("id","sessionId","seq","type","actor","payload","createdAt")
  SELECT "id", "gameId", "seq", "type", "actor", "payload", "createdAt" FROM "GameEvent";
DROP TABLE "GameEvent";
DROP TABLE "Game";
CREATE INDEX "Session_gameId_updatedAt_idx" ON "Session"("gameId", "updatedAt");
CREATE INDEX "Session_updatedAt_idx" ON "Session"("updatedAt");
CREATE UNIQUE INDEX "SessionEvent_sessionId_seq_key" ON "SessionEvent"("sessionId", "seq");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
```

Проверки миграции (worker, логи в `artifacts/logs/w-api-migration.log`):

1. Схема ↔ миграции совпадают:
   `pnpm --filter @bga/api exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "file:$PWD/apps/api/.tmp/shadow.db" --exit-code` → код 0 (пустой diff). Иначе поправить имена индексов/FK.
2. **Копия dev-БД** (реальную `apps/api/prisma/dev.db` не трогать; сейчас в ней 3 `Game`, 10 `GameEvent`, применена `20261107235651_init`):
   ```bash
   D=apps/api/.tmp/migration-check; mkdir -p $D; cp apps/api/prisma/dev.db $D/dev-copy.db
   sqlite3 $D/dev-copy.db "select count(*) from Game; select count(*) from GameEvent; select id, version, hex(sha3(state)) from Game order by id;" > $D/before.txt
   DATABASE_URL="file:$PWD/$D/dev-copy.db" pnpm --filter @bga/api exec prisma migrate deploy
   DATABASE_URL="file:$PWD/$D/dev-copy.db" pnpm --filter @bga/api exec prisma migrate status      # up to date
   sqlite3 $D/dev-copy.db "select count(*) from Session; select count(*) from SessionEvent; select id, version, hex(sha3(state)) from Session order by id;" > $D/after.txt
   sqlite3 $D/dev-copy.db "select gameId, count(*) from Session group by gameId; PRAGMA foreign_key_check; PRAGMA integrity_check; select name from sqlite_master where name like 'Game%';"
   ```
   Ожидание: счётчики и хэши снимков совпадают (3/10), единственный `gameId = star-wars-rebellion`, `foreign_key_check` пуст,
   `integrity_check = ok`, таблиц `Game*` нет. Затем `pnpm --filter @bga/api build && DATABASE_URL=… PORT=3200 node apps/api/dist/main.js`
   и `curl /api/sessions?gameId=star-wars-rebellion` (3 сессии), `curl /api/sessions/<id>` (200), POST команды (200, version+1).
   (Если в sqlite3 нет `sha3` — сравнивать `length(state)` + `diff` выгрузок `select id, state`.)
3. Автотест AC-7 — `apps/api/test/migration.int.test.ts` (§3.5). Ручной TC-MIG-07 — п.2 этого списка (тот же лог).
5. Q-24: JSON `state` в SWR-003 **не** мигрируется — схема состояния Rebellion не меняется (переименования — SWR-004).
4. Для пользователя (в отчёте и `adding-a-game.md`/README не нужно — в delivery-report): «перед `pnpm dev` сделайте
   `cp apps/api/prisma/dev.db apps/api/prisma/dev.backup-swr003.db`» (имя оканчивается на `.db` → под `.gitignore`).
   Down-миграции нет; откат = восстановление копии.

После правки схемы: `pnpm --filter @bga/api exec prisma generate` (иначе typecheck не видит `prisma.session`).

### 3.5 Изменения int-тестов `apps/api/test`

| Было | Стало |
|---|---|
| `support/fixtures.ts` | `createSession(app, setup)` → `POST /api/sessions { gameId: 'star-wars-rebellion', setup }`; `postCommand` → `/api/sessions/:id/commands`; `dbSnapshot` → `prisma.session` / `prisma.sessionEvent` (`sessionId`); `sequentialIds` → `{ sessionId() }`; импорты `@bga/game-rebellion/{schema,scenario}`, `@bga/platform` |
| `games.int.test.ts` | → `sessions.int.test.ts`: TC-API-02..10 на новых путях/формах; + `gameId` во всех ответах; фильтр `?gameId=`; 404 `errors.gameNotFound` (POST и GET-list); 400 формат gameId; 400 setup с path `['setup', …]`; `GET` без `gameId` — все игры; лимит 20 и порядок |
| `commands.int.test.ts` | имя сохраняется (как в test-cases §перенос): TC-API-14..19, 22, 26, A-5 order — пути; 404 → `errors.sessionNotFound`; TC-API-26 сравнивает `Session.state.log` с `SessionEvent` |
| `concurrency.int.test.ts`, `hidden-info.int.test.ts`, `persistence.int.test.ts`, `health.int.test.ts` | пути/хелперы; hidden-info += в `GET /api/sessions` `details` нет базы и скрытых typeKey |
| `routes.int.test.ts` | ожидаемый список маршрутов: `GET /api/health`, `GET /api/sessions`, `GET /api/sessions/:sessionId`, `POST /api/sessions`, `POST /api/sessions/:sessionId/commands`; `/api/games*` → 404 `errors.notFound`; TC-API-25 на `Session.state` |
| — (новый) `support/fake-game.ts` | TR-4: `fakeGameModule: ServerGameModule` (типизирован интерфейсом `@bga/platform` — компиляция = проверка контракта) ровно по Conventions test-cases: id `fake-game`, setup `{ start: number }`, state `{ count, version, secret: 'FAKE-SECRET' }`, команда `{ type: 'INC' }`, `count >= 3` → 422 `errors.fakeLimit`, view `{ count, version }`, `summarize → { count }`; `fakeGameDefinition`, `fakeSoonDefinition` (`fake-soon`, coming_soon). Не импортирует `@bga/game-*` (B-14) |
| — (новый) `game-registry.int.test.ts` | TC-EXT-01..05, TC-GP-11, TC-SES-04..06, TC-SES-17: `startApp(db, { gameModules: [rebellion, fake], gameDefinitions: [R, FS, FAKE, FAKE_SOON] })` (TR-3) → create/get/list/command фиктивной игры **без правок `apps/api/src/sessions/**`** (AC-5а); 409/422/400 модуля; `fake-soon` и `forbidden-stars` → 422 `GAME_UNAVAILABLE` (AC-6), 0 строк; `unknown-game` → 404; кросс-игровой фильтр списка; строка `Session.gameId='removed-game'` (raw insert) → список пропускает, GET/команда → 422. Плюс unit-часть: `validateRegistry` (дубликат id, модуль для coming_soon, available без модуля → throw) и conformance **каждого** модуля `SERVER_GAME_MODULES` (`createInitialState` → version 1, события seq ≥ 1, `summarize` плоский, `parseState(JSON roundtrip)` ≡ state, `applyCommand(state, {}, …)` → `VALIDATION`) |
| — (новый) `support/pre-migration-db.ts` | TR-6: `createPreMigrationDb({ rows })` — пустой файл в `.tmp` → `prisma db execute --file prisma/migrations/20261107235651_init/migration.sql` → `prisma migrate resolve --applied 20261107235651_init` → raw SQL вставка `Game`/`GameEvent` SWR-002-формы (состояния из `@bga/game-rebellion/rules` `createGame` + ход + 3× `ADVANCE_PHASE`, заданные `createdAt/updatedAt`). Генерируется при запуске, бинарные `.db` не коммитятся |
| — (новый) `migration.int.test.ts` | AC-7, TC-MIG-01..05: `createPreMigrationDb` (3 строки / 0 строк) → `prisma migrate deploy` → побайтное равенство `id, setup, state, version, createdAt, updatedAt`, `gameId='star-wars-rebellion'`, все `SessionEvent`, нет `Game*`, обе миграции в `_prisma_migrations`; NOT NULL `gameId`, индекс `(gameId, updatedAt)`, каскад удаления; повторный deploy — «No pending migrations»; TC-MIG-02: `startApp` → список в исходном порядке, GET каждой, команда 200 |
| `vitest.config.mts` | `include: ['test/**/*.int.test.ts']` — без изменений (все новые файлы `*.int.test.ts`) |

Тесты пакета Rebellion (W-API, `packages/games/rebellion/test/server/server-module.test.ts`): parseSetup (A-7 дефолт, human+difficulty → issues),
createInitialState детерминирован (тот же ctx → deepEqual), parseState mismatch → throw, `summarize` без секретов
(не содержит `rebelBaseSystemId` и typeKey скрытых), `toPlayerView` для Empire скрывает базу.

### 3.6 OWNED FILES W-API

`apps/api/**` (всё, включая `prisma/schema.prisma`, новую миграцию, `test/**`), `packages/games/rebellion/src/server/**`,
`packages/games/rebellion/test/server/**`, `packages/games/rebellion/src/ai/**` + `test/ai/**` (уточнения конфига).
Изменения в `packages/platform/**`, `rebellion/src/{schema,board,definition}/**` — **только** через backend-lead + frontend-lead
(замороженный контракт). `apps/web/**`, `e2e/**`, `*/src/assets/**`, `eslint.web-legacy.mjs` — FE.

### 3.7 DONE WHEN (W-API)

```bash
pnpm --filter @bga/api exec prisma generate
pnpm lint && pnpm typecheck
pnpm --filter "./packages/**" test && pnpm --filter @bga/api test          # все int-тесты, в т.ч. game-registry (fake-game, forbidden-stars), migration
pnpm build && pnpm check:bundle
pnpm --filter @bga/web test                                                   # web не сломан (он на моках fetch)
grep -rnE "@bga/game-" apps/api/src/{sessions,common,persistence,health} apps/api/src/app.*.ts apps/api/src/main.ts; test $? -eq 1
grep -rniwE "star-wars-rebellion|forbidden-stars|fake-game|faction|empire|rebellion|phase|round|piece|system|rebelBase" apps/api/src/{sessions,common}; test $? -eq 1   # TC-EXT-06
# миграция: §3.4 п.1–2, лог artifacts/logs/w-api-migration.log
```
`pnpm e2e` в DONE WHEN W-API **не входит**: до перехода web на `/api/sessions` e2e против нового API ожидаемо красный
(фиксируется как `not_run — ждёт FE`), зелёный e2e — условие INTEGRATION.

---

## 4. `./ai` (AI Strategy Configuration) и `./assets`

### 4.1 `@bga/game-rebellion/ai` — только данные (без логики, без OpenAI, не импортируется web)

```ts
import { z } from 'zod';
import { DifficultySchema } from '../schema';

export const RebellionAiGoalSchema = z.enum([
  'locateRebelBase', 'protectRebelBase', 'expandControl', 'preserveForces', 'pressureObjectives',
]);
export const AiDifficultyProfileSchema = z.strictObject({
  /** Сколько legal actions (из game-core) попадает в шорт-лист для шага решения. */
  candidateActionLimit: z.int().min(1).max(50),
  /** 0 — всегда лучший по оценке ход; 1 — равновероятно среди кандидатов. */
  exploration: z.number().min(0).max(1),
  /** Глубина просмотра собственных ходов (0 — жадно). */
  lookaheadDepth: z.int().min(0).max(2),
  /** Генерировать человекочитаемое объяснение хода (для журнала). */
  explainMoves: z.boolean(),
});
export const FactionStrategySchema = z.strictObject({
  /** Веса целей 0..1; цели, не указанные для фракции, не используются. */
  goalWeights: z.partialRecord(RebellionAiGoalSchema, z.number().min(0).max(1)),
});
export const RebellionAiStrategySchema = z.strictObject({
  configVersion: z.literal(1),
  defaultDifficulty: DifficultySchema,                         // = 'normal' (совпадает с A-7)
  difficulties: z.strictObject({ easy: AiDifficultyProfileSchema, normal: AiDifficultyProfileSchema, hard: AiDifficultyProfileSchema }),
  factions: z.strictObject({ empire: FactionStrategySchema, rebellion: FactionStrategySchema }),
});
export type RebellionAiStrategy = z.infer<typeof RebellionAiStrategySchema>;
export const rebellionAiStrategy: RebellionAiStrategy = RebellionAiStrategySchema.parse({
  configVersion: 1, defaultDifficulty: 'normal',
  difficulties: {
    easy:   { candidateActionLimit: 5,  exploration: 0.6, lookaheadDepth: 0, explainMoves: true },
    normal: { candidateActionLimit: 10, exploration: 0.3, lookaheadDepth: 0, explainMoves: true },
    hard:   { candidateActionLimit: 20, exploration: 0.1, lookaheadDepth: 1, explainMoves: true },
  },
  factions: {
    empire:    { goalWeights: { locateRebelBase: 1, expandControl: 0.7, preserveForces: 0.4 } },
    rebellion: { goalWeights: { protectRebelBase: 1, pressureObjectives: 0.6, preserveForces: 0.6 } },
  },
});
```

Инварианты (тест `test/ai/ai-config.test.ts`): у каждой `Difficulty` есть профиль; `defaultDifficulty` = дефолт `OpponentSchema`;
сложность **никогда** не даёт доступа к скрытой информации (AI получает только свой `PlayerView` — записано в doc-комментарии).
В SWR-003 конфиг никем не исполняется (AI — этап F); платформенного типа AI-конфига не вводим, пока нет второй игры с AI
(общая часть выделяется на этапе F).

### 4.2 `./assets` — граница с web-темой (согласовать с frontend-lead)

| Где | Что | Почему |
|---|---|---|
| `@bga/game-*/assets` | `coverSvg: string` — собственная абстрактная SVG **строкой**, viewBox `0 0 640 360`, ≤ 4 КБ, только геометрия (без текста, `<script>`, внешних `href`/`url(http…)`, шрифтов, растров, мотивов коробки); у Rebellion дополнительно `visualTokens` (plain object: `faction.{empire,rebellion}`, `board.{background,star,link,systemFill,systemStroke,label,selected,legalTarget,invalidTarget}`) — FE PA-4 | нужно и каталогу, и столу; TS-строка/объект работает в CJS `dist`, Vite и Vitest без загрузчиков |
| `apps/web/src/app/theme/**` | MUI-тема платформы: палитра, типографика, отступы, тёмная/светлая схема, `createAppTheme` | общая для всех игр |
| `apps/web/src/games/rebellion/**` (FE) | `theme/palette.ts` (`rebellionPalette` ← `visualTokens`), Konva-стили, иконки фигур; P4 FE удаляет `faction`/`board` из `app/theme` | React/MUI-обвязка остаётся в web, данные — в пакете |

Отрисовка обложки — FE: `entry.cover = { src: svgDataUrl(coverSvg), altKey }` (`<img>` с data-URL). Тест `test/assets/assets.test.ts` в каждом игровом пакете: SVG
начинается с `<svg`, содержит `viewBox`, не содержит `<script`, `href="http`, `xlink:href="http`, `url(http`, `<image`.
R2 кладёт значения `visualTokens` = текущие `tokens.faction`/`board`-цвета web (перенос, без изменения вида) и простые плейсхолдер-SVG. Содержимое SVG и значения токенов после R2 — **владение FE** (дизайн), имена экспортов/ключей — замороженный контракт.

---

## 5. `docs/architecture/adding-a-game.md` — план документа

Предлагаю: **пишет backend-lead на INTEGRATION** (когда имена и пути окончательны), раздел «Web» — по материалам frontend-lead
(он же ревьюит документ); Analyst проверяет как доказательство AC-5(г).

1. Что такое «игра на платформе»: игровой пакет + запись в серверном и web-реестре; что **не** меняется (маршруты, хост сессии,
   сервис сессий, каталог, страница игры, Prisma-схема).
2. Выбор `gameId` (kebab-case, `GameIdSchema`, неизменяем — хранится в `Session.gameId`); права на название (номинативно, без логотипов).
3. Пакет `packages/games/<id>`: дерево подпапок; шаблон `package.json` (`exports` с `@bga/source`/`types`/`default`); `tsconfig*.json`,
   `vitest.config.mts`; подключение: `packages/tsconfig.json` (reference), зависимости в `apps/api/package.json` / `apps/web/package.json`, `pnpm install`.
4. Минимум для `coming_soon`: `./definition` + `./assets` → запись в `GAME_DEFINITIONS` (сервер) и в web-реестр (definition + cover).
5. Полноценная игра: `./schema` (state/view/commands/setup/events), `./rules` (детерминизм, отказ = результат), `./scenario`,
   `./board`, `./ai`, `./server` (`ServerGameModule`: таблица методов, порядок 400→409→422, требования к `summarize` и `toPlayerView` — без секретов).
6. Регистрация на сервере: `apps/api/src/game-registry/registry.ts` (одна строка), что проверяет `validateRegistry`.
7. Регистрация в web (FE-раздел): `WebGameEntry`, `SetupScreen`/`TableScreen` через `React.lazy`, папка `apps/web/src/games/<id>/`, i18n игры.
8. Границы импорта (таблица B-1…B-16 в человеческом виде) и как проверить (`pnpm lint`).
9. Скрытая информация и `check:bundle`: если у игры есть секреты — добавить правила в `scripts/check-web-bundle.mjs`.
10. Тесты, обязательные для новой игры: пакетные (rules/schema/server-module), conformance реестра (автоматически), API int через `/api/sessions`, e2e «каталог → игра → новая партия».
11. Чек-лист Definition of Done (копируемый в задачу).

---

## 6. Риски и проверки

| Риск | Митигирование / проверка |
|---|---|
| Миграция SQLite с переименованием таблиц теряет данные (Prisma генерирует DROP/CREATE) | SQL вручную (§3.4); `migrate diff --exit-code` = 0; прогон на копии dev-БД с совпадением счётчиков/хэшей; `migration.int.test.ts`; бэкап dev.db пользователем; dev.db не используется в тестах |
| `PRAGMA foreign_keys` внутри транзакции миграции — no-op | порядок операций не требует отключения FK (создаём `Session` до `SessionEvent`); `PRAGMA foreign_key_check` пустой |
| Пропущено export-условие → Vite/Vitest берут CJS `dist` (устаревший или interop named-exports) | `grep -rn "@swr/source"` = 0; тесты web/пакетов проходят **без** `dist` (§1.12) |
| Nest (`tsconfig.build.json`, `customConditions: []`) не находит `types` подпути | у каждого подпути `types` → `dist/<sub>/index.d.ts`; `pnpm build` после `build:packages`; `ls dist/*/index.js` |
| Каталог-импорт `'../schema'` в CJS/NodeNext | допускается CJS-резолвом; проверяется `pnpm build` + запуском `node apps/api/dist/main.js` в e2e |
| `packages/*` в workspace захватывает `packages/games` | явные глобы `packages/platform`, `packages/games/*` |
| Lockfile «уплывает» при rename | `pnpm install --prefer-offline`; `git diff pnpm-lock.yaml` — только importers |
| gitignore-негации в `no-restricted-imports` не могут «вернуть» файл исключённой папки | для подпутей пакетов — `regex` (ESLint 10 поддерживает); негативные/позитивные пробы §1.8 |
| Бивариантность `ServerGameModule` теряется при смене на property-синтаксис | комментарий + typecheck реестра `readonly ServerGameModule[] = [rebellionServerModule]` |
| W-API и FE параллельно: e2e красный между шагами | ожидаемо; e2e — гейт INTEGRATION; FE работает по замороженным DTO и моку fetch |
| Сессия игры, удалённой из реестра | GET/команда → 422 `GAME_UNAVAILABLE`, список пропускает (Q-7) |
| Порядок 400/500 изменился: битый снимок + невалидная команда игры теперь 500 (раньше 400) | рамка конверта всё ещё 400 до чтения снимка; полный конверт проверяет модуль после разбора снимка — затрагивает только битые снимки (AM-4) |
| Секреты Rebellion в `summarize`/`details` | тест server-module + hidden-info int |

---

## 7. Dependency graph и владение

```text
W0-R (BE worker, R1 → R2)  ── всё зелёное, контракты заморожены ──┬── W-API (BE worker)  ──┐
                                                                 └── W-FE  (FE workers) ──┴── INTEGRATION (лиды) → CODE_REVIEW → …
```

| Подзадача | Роль | OWNED FILES | Зависит от |
|---|---|---|---|
| W0-R | backend worker | §1.12 | — |
| W-API | backend worker | §3.6 | W0-R |
| W-FE | FE workers (план FE) | `apps/web/**`, `e2e/**`, `packages/games/*/src/assets/**` (+ `test/assets/**`), `eslint.web-legacy.mjs` | W0-R |
| INTEGRATION | backend-lead + frontend-lead | удалить `rebellion/src/schema/legacy-api.ts` и его реэкспорт; удалить `eslint.web-legacy.mjs` и импорт; `docs/architecture/adding-a-game.md`; обновить `docs/architecture/application.md` (`@bga/*`, sessions, реестры); `pnpm verify` | W-API, W-FE |

## 8. Verification (сводно, для QA/интеграции)

- `pnpm verify` зелёный (AC-8) — лог `artifacts/logs/integration-verify.log`.
- ESLint-пробы §1.8 (AC-5в) — `artifacts/logs/eslint-probes.log`.
- `pnpm --filter @bga/api test` с `game-registry.int` (фиктивная игра, forbidden-stars, removed-game) и `migration.int` (AC-5а, AC-6, AC-7).
- `pnpm check:bundle` с проверкой состава модулей (Q-23, TC-ARCH-08).
- TC-EXT-06: `grep -rniE "@bga/game-|star-wars-rebellion|forbidden-stars|fake-game|faction|empire|rebellion|phase|round|piece|system|rebelBase" apps/api/src/{sessions,common}` = 0.
- Миграция на копии dev-БД (AC-7) — `artifacts/logs/w-api-migration.log`.
- `grep -rn "@swr" … ; grep -rn "/api/games"` по `apps e2e packages` = 0 после INTEGRATION.
- AC-9: `grep -rnE "import\((?!['\"])|require\(" apps/*/src` — нет динамической загрузки по имени; реестры — массивы-литералы.

## 9. Стык с frontend-lead

### 9.1 Что FE получает замороженным после W0-R
`@bga/platform` (DTO §2, ошибки, `GameDefinition`), `@bga/game-rebellion/{definition,schema,board,assets}`,
`@bga/game-forbidden-stars/{definition,assets}`, ключи `details` Rebellion (§3.3), таблица ошибок (§3.2), переводы трёх новых ключей.

### 9.2 Что FE делает сам
Маршруты/страницы, `apps/web/src/games/registry.ts`, перенос `features/*` в `games/rebellion/**` и `platform/**`, переход
`shared/api` на `/api/sessions`, очистка `eslint.web-legacy.mjs`, e2e на новые маршруты, рендер `details` (через запись реестра — решение FE).

### 9.3 Сверка с `plan-frontend.md`
- Реестр/seam/props (FE §4, TR-5) — web-зона, backend не затрагивает. `SetupScreenProps.start.submit(setup)` → `POST /api/sessions { gameId, setup }` — совпадает с §3.2.
- **PA-1** принято: `descriptionKey` = полный `<ns>:<key>`; alt — `WebGameEntry.cover.altKey` (в definition нет). **PA-2** принято (§2: `SessionResponseSchema`, `SessionCommandResultSchema`, `ListSessionsResponseSchema`, `CreateSessionRequestSchema`). **PA-3** принято (ключ `opponent`, `RebellionSessionDetailsSchema`). **PA-4** принято (§4.2). **PA-5** принято (`ERROR_MESSAGE_KEYS` — платформенный, `REBELLION_ERROR_MESSAGE_KEYS` — игровой). **PA-6** = AM-1 (поле остаётся необязательным по контракту, никто не заполняет). **PA-7**: да, `PlayerView.id === sessionId` (`createInitialState` передаёт `ctx.sessionId` в `createGame`); поле не удаляется (Q-24 — схема не меняется).
- Legacy DTO (`legacy-api.ts`) удаляются не раньше P4 — на INTEGRATION (FE §12.6 = AM-8).
- ESLint (FE §9): п.1, п.2 = B-8/B-9; п.2 «`@/features/*` запрещён в `app/shared/platform`» — добавляется в B-9, текущие нарушители (`app/router.tsx`, `app/pages/MainMenuPage.tsx`, `app/pages/LazyGameTablePage.tsx`) — в `WEB_PLATFORM_LEGACY`; п.3 = новый **B-17**: `apps/web/src/games/*/**` — из `@/games/*` только `@/games/types`; `apps/web/src/games/forbidden-stars/**` — из `@bga/*` только `@bga/platform`, `@bga/game-forbidden-stars/{definition,assets}` (регулярка, как B-13). Все правила пишет W0-R; FE их не правит.
- `apps/web/package.json`, `vite.config.ts`, `scripts/check-web-bundle.mjs` — W0-R (FE §10 «чужие файлы» — совпадает).
- `e2e/**` — по FE-плану у QA (не FE); W0-R меняет там только комментарий.
- Q-25: тест `apps/web/src/games/registry.consistency.test.ts` пишет **W-API** (одно исключение из владения FE — новый файл, только тест; ESLint B-16), сравнивая `gameRegistry.map(e => e.definition)` с `GAME_DEFINITIONS` из `apps/api/src/game-registry/definitions.ts` (тот импортирует только `@bga/game-*/definition`, React не тянет) — закрывает открытый вопрос FE §4.
- Переводы `descriptionKey` (`rebellion.meta`, `forbidden-stars.meta`) — в web-локалях игры (FE). Чтобы i18n-тест FE не падал, R2 **не** добавляет эти ключи; FE добавляет их в P1 вместе с `entry.ts`.

---

## 10. Proposed amendments (к замороженному «Architecture contract»; требуют согласия Analyst + frontend-lead)

| # | Изменение | Причина |
|---|---|---|
| AM-1 | `GameDefinition` по Q-11 + FE PA-1/PA-6: `name` (строка), `descriptionKey` (`<ns>:<key>`), `description?` (fallback); `coverImage?` остаётся необязательным по контракту, встроенные игры его не заполняют — обложка из `./assets` через `WebGameEntry.cover` | одна правда об обложке |
| AM-2 | `ServerGameModule` уточнён (§2.1): `createInitialState → { state, events }`, `parseState(raw, expected)`, `GameModuleError`, дженерики `Setup`/`Event extends SessionEventRecord`, `defineServerGameModule` | сервису нужно писать `SessionEvent` и сверять снимок без знания игры |
| AM-3 | Закрыт Q-5/Q-7 (принято как есть): неизвестный `?gameId=` → `[]`, пустой → без фильтра, повтор → 400; сессия игры без модуля — пропуск в списке, GET/команда → 422. Остаётся уточнение: `?gameId=` некорректного формата → 400 (Q-5 не оговаривает) | — |
| AM-4 | Порядок `POST /api/sessions`: 400 (тело/формат gameId) → 404 → 422 → 400 (setup). Порядок команды: 404 → 400 (рамка) → 422 → 500 → модуль (400→409→422) → 409 | генерализация A-5 |
| AM-5 | Закрыт Q-9: сборочная обвязка (`packages/tsconfig.json`, зависимости `apps/{api,web}/package.json`, lockfile) при добавлении игры допустима | — |
| AM-6 | `Session` дополнительно индексирована по `updatedAt` (для списка без `gameId`) | производительность общего списка |
| AM-7 | Временный allowlist `eslint.web-legacy.mjs` для B-9 на время параллельной работы (владелец FE, пуст к INTEGRATION, затем удаляется) | B-9 нельзя включить до переноса web-файлов |
| AM-8 | Rebellion-DTO SWR-002 (`CreateGameResponse`, `GameSummary`, …) живут в `rebellion/src/schema/legacy-api.ts` до INTEGRATION | W0-R не меняет поведение; API и web переходят независимо |
| AM-9 | Ключи `SessionSummary.details` Rebellion заморожены: `humanFaction`, `opponent` (`'ai'|'human'`), `difficulty?`, `round`, `phase` (FE PA-3; схема `RebellionSessionDetailsSchema` в `./schema`, добавляет R2) | FE рендерит их без доступа к state |
| AM-10 | Новый код ошибки `GAME_UNAVAILABLE` добавляется в общий `ErrorCodeSchema` (HTTP 422); `NOT_FOUND` используется с ключами `errors.gameNotFound` / `errors.sessionNotFound` / `errors.notFound` | следует из таблицы HTTP API |

## 11. Open questions

- Q-2 (FE): рендер `details` на странице игры — функция/компонент в `WebGameEntry` (предложение) или общий плоский вывод?
- Q-3 (Analyst): переименовывать ли root-пакет `star-wars-rebellion-ai` → `board-game-ai` в R1 (косметика; по умолчанию — да).
- (закрыт TR-7) ESLint-пробы — `scripts/eslint-boundaries.test.mjs` в `pnpm test`.
- Q-5 (Analyst): `?gameId=` некорректного формата (`Foo Bar`) — 400 (план) или `[]` как неизвестный?
