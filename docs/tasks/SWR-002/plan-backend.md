# Plan (backend + workspace) — SWR-002

Автор: backend-lead, этап TECH_PLANNING, 2026-11-08. Это **дизайн**: код не написан, ничего не установлено, ничего не
запускалось (кроме read-only `npm view`, см. §10). Опирается на `specification.md` (Architecture contract + Clarifications
A-1..A-19) и `test-cases.md` (TC-GC-*, TC-API-*, TC-ARCH-*, R-1..R-20).

Предложенные изменения замороженного контракта — **только** в §11 (amendments). Всё остальное соответствует контракту.

---

## 1. Ключевые решения (кратко)

| # | Решение | Почему |
|---|---|---|
| D-1 | Scope пакетов `@swr/*`: `@swr/contracts`, `@swr/game-core`, `@swr/game-data`, `@swr/api`, `@swr/web` | короткие, без коллизий с npm |
| D-2 | Внутренние пакеты **компилируются** `tsc -b` в `dist/` (CommonJS + `.d.ts`), но Vite/Vitest/web-typecheck читают **исходники** через кастомное export-условие `@swr/source` | NestJS исполняется Node'ом (нужен JS) и требует `emitDecoratorMetadata` (tsx/esbuild его не дают); Vite/Vitest берут TS напрямую — HMR и тесты без сборки |
| D-3 | NestJS **11.2.x** (CommonJS), не 12.x | Nest 12 (2026-08) — ESM-only (`"type":"module"`), `@nestjs/schematics@12` требует Node ≥ 22.22; 11.x поддерживается (11.2.8 от 2026-10-23), документированные рецепты Vitest+SWC/Prisma |
| D-4 | Prisma **6.19.3** (`prisma-client-js`, встроенный Rust-движок, SQLite без driver adapter) | Prisma 8 — RC и Node ≥ 22.18; Prisma 7 для SQLite требует `better-sqlite3`, а `better-sqlite3@13` требует Node ≥ 22 (нативная сборка) |
| D-5 | `setup`/`state`/`payload` в SQLite — `String` (JSON), при чтении — `Zod.parse` | контракт разрешает Json/String; явная валидация снимка, переносимость |
| D-6 | Optimistic concurrency: `updateMany({ where: { id, version: expected } })` внутри интерактивной транзакции; `count === 0` → 409 + rollback | SQLite сериализует запись; guard на уровне SQL закрывает гонку (TC-API-20) |
| D-7 | Порядок проверок 404 → 400 → 409 → 422 (A-5) — поэтому тело `/commands` валидируется **в сервисе после поиска игры**, а не пайпом | Nest-пайпы выполняются до хендлера и дали бы 400 раньше 404 |
| D-8 | Единый формат ошибки для всех маршрутов `/api`: `{ ok:false, error:{ code, messageKey, details? } }` (R-8) | один парсер на клиенте |
| D-9 | Без CORS: web ходит в api через Vite proxy (`/api` → `API_PROXY_TARGET`, по умолчанию `http://localhost:3000`) | same-origin, нечего настраивать |
| D-10 | `game-core` детерминирован: `gameId` и `now` приходят параметром `ctx` (R-1) → amendment AM-1 | без этого нельзя сравнивать состояния глубоким равенством |
| D-11 | Один TypeScript на весь репозиторий: **5.9.3** | `typescript-eslint@8.72` требует `typescript <6.1`; 5.9.3 закреплён и в `@nestjs/cli@11.0.24` |

---

## 2. Workspace и корневой tooling

### 2.1 Дерево (только то, что создаётся в SWR-002)

```text
.
├── package.json                 # root scripts (§2.3)
├── pnpm-workspace.yaml
├── pnpm-lock.yaml               # коммитится
├── .nvmrc                       # 20.19.5
├── tsconfig.base.json
├── eslint.config.mjs
├── .prettierrc.json
├── .prettierignore
├── playwright.config.ts
├── e2e/
│   ├── tsconfig.json
│   └── smoke.spec.ts            # W0: health через proxy + "/" открывается
├── packages/
│   ├── contracts/   {package.json, tsconfig.json, tsconfig.test.json, vitest.config.ts, src/**, test/**}
│   ├── game-data/   {… то же …, src/{index.ts, scenario.ts, layout.ts}}
│   └── game-core/   {… то же …, src/**}
└── apps/
    ├── api/         {package.json, nest-cli.json, tsconfig.json, tsconfig.build.json, vitest.config.ts,
    │                 .env.example, scripts/{ensure-env.mjs, e2e-serve.mjs}, prisma/**, src/**, test/**}
    └── web/         (структура внутри src/ — план FE lead; W0 создаёт только shell, §8.2)
```

### 2.2 `pnpm-workspace.yaml`

```yaml
packages:
  - apps/*
  - packages/*
# pnpm 10 по умолчанию НЕ запускает install-скрипты зависимостей — без этого Prisma не скачает engine.
onlyBuiltDependencies:
  - '@prisma/client'
  - '@prisma/engines'
  - prisma
  - '@swc/core'
  - esbuild
```

`engineStrict` не включаем (транзитивные пакеты иногда завышают `engines`), но W0 обязан сохранить вывод
`pnpm install` в лог и проверить отсутствие `Unsupported engine` для **прямых** зависимостей (§10).

### 2.3 Root `package.json`

```jsonc
{
  "name": "star-wars-rebellion-ai",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.34.9",
  "engines": { "node": "^20.19.0 || >=22.12.0" },
  "scripts": {
    "dev": "pnpm run build:packages && pnpm --filter @swr/api run db:prepare && concurrently -k --names pkgs,api,web --prefix-colors gray,blue,magenta \"pnpm run watch:packages\" \"pnpm --filter @swr/api run dev\" \"pnpm --filter @swr/web run dev\"",
    "build:packages": "tsc -b packages/contracts packages/game-data packages/game-core",
    "watch:packages": "tsc -b packages/contracts packages/game-data packages/game-core --watch --preserveWatchOutput",
    "lint": "eslint . --max-warnings=0 && prettier --check .",
    "format": "prettier --write .",
    "typecheck": "pnpm run build:packages && pnpm -r run typecheck",
    "test": "node --test scripts/ && pnpm -r run test",
    "build": "pnpm -r run build",
    "e2e": "pnpm run build:packages && playwright test",
    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e",
    "check:task": "node scripts/check-task.mjs"
  },
  "devDependencies": { /* §10: typescript, eslint & plugins, prettier, concurrently, vitest, @playwright/test, @types/node */ }
}
```

- `pnpm -r run <x>` идёт в топологическом порядке (packages → apps), пакеты без скрипта пропускаются.
- Существующий `node --test scripts/` сохранён внутри `test` (не ломаем SWR-000).
- `pnpm dev`: (1) собирает `dist` пакетов (API исполняет их JS), (2) `db:prepare` = `ensure-env` → `prisma generate` →
  `prisma migrate deploy` (не интерактивно, в отличие от `migrate dev`), (3) параллельно: `tsc -b --watch` пакетов, `nest start --watch`
  (:3000), `vite` (:5173). Ограничение: после правки `packages/*` во время dev API подхватывает изменения на следующем
  перезапуске Nest-watch (обычно сразу, т.к. меняется `dist`; если нет — перезапустить `pnpm dev`). Web и тесты читают исходники.

### 2.4 TypeScript: стратегия

**`tsconfig.base.json`** (общие строгие флаги, без module/emit):

```jsonc
{ "compilerOptions": {
    "target": "ES2022", "lib": ["ES2023"],
    "strict": true, "noUncheckedIndexedAccess": true, "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true, "noUnusedLocals": true, "noUnusedParameters": true,
    "isolatedModules": true, "esModuleInterop": true, "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true, "skipLibCheck": true, "sourceMap": true } }
```

`verbatimModuleSyntax` **не** включаем: с CJS-выходом (`NodeNext` без `"type":"module"`) он запрещает ESM-синтаксис.
Вместо него — ESLint `@typescript-eslint/consistent-type-imports`.

**Пакеты** (`packages/*/tsconfig.json`) — composite project references:

```jsonc
{ "extends": "../../tsconfig.base.json",
  "compilerOptions": { "composite": true, "module": "NodeNext", "moduleResolution": "NodeNext",
    "rootDir": "src", "outDir": "dist", "declaration": true, "declarationMap": true,
    "tsBuildInfoFile": "dist/.tsbuildinfo", "types": [] },
  "include": ["src"],
  "references": [{ "path": "../contracts" }] }   // contracts: без references; game-data/game-core: → contracts
```

`packages/*/tsconfig.test.json` — только для typecheck тестов: `noEmit`, `module: ESNext`, `moduleResolution: Bundler`,
`customConditions: ["@swr/source"]`, `types: ["node"]`, `include: ["src", "test"]`.
Импорты внутри пакетов — относительные **без расширения** (допустимо для CJS-режима NodeNext и для Vite).

**apps/api**: `module/moduleResolution: NodeNext` (CJS), `experimentalDecorators`, `emitDecoratorMetadata`,
`useDefineForClassFields: false`, `outDir: dist`, `rootDir: src`, `types: ["node"]`; `include: ["src", "test"]`;
`tsconfig.build.json` исключает `test`. `@swr/*` резолвятся в `dist/*.d.ts` (поэтому root `typecheck` сначала делает `build:packages`).

**apps/web**: на усмотрение FE lead, обязательно `moduleResolution: Bundler` + `customConditions: ["@swr/source"]`
(тогда пакеты проверяются из исходников, `dist` не нужен).

### 2.5 Потребление пакетов: `exports`

```jsonc
// packages/contracts/package.json (game-core аналогично; без "type" → CJS)
{ "name": "@swr/contracts", "version": "0.0.0", "private": true,
  "main": "./dist/index.js", "types": "./dist/index.d.ts",
  "exports": { ".": { "@swr/source": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "scripts": { "build": "tsc -b", "typecheck": "tsc -p tsconfig.test.json", "test": "vitest run" },
  "dependencies": { "zod": "4.6.7" } }

// packages/game-data/package.json — два entry point (R-3)
"exports": {
  ".":       { "@swr/source": "./src/index.ts",  "types": "./dist/index.d.ts",  "default": "./dist/index.js" },
  "./layout": { "@swr/source": "./src/layout.ts", "types": "./dist/layout.d.ts", "default": "./dist/layout.js" } }
```

- Vite (`apps/web/vite.config.ts`): `resolve.conditions: ['@swr/source', ...defaultClientConditions]` (из `vite`).
- Vitest (packages, api): `resolve.conditions` **и** `ssr.resolve.conditions` = `['@swr/source', ...defaultServerConditions]`.
  Проверка в DONE WHEN W0: `rm -rf packages/*/dist && pnpm --filter @swr/api test` зелёный. Если условие не применится в Vitest —
  fallback: `resolve.alias` с точными regex (`^@swr/contracts$` → `packages/contracts/src/index.ts` и т.д.), записать в лог W0.
- Node (`apps/api` runtime) игнорирует `@swr/source` → берёт `default` (`dist/*.js`).
- Зависимости объявляются `"@swr/contracts": "workspace:*"`. `game-core` → `contracts` (dep), `game-data` (**devDependency**, только тесты).
  `game-data` → `contracts`. `api` → все три. `web` → `contracts`, `game-data` (только subpath `/layout`, §2.6).

### 2.6 ESLint (flat config, `eslint.config.mjs`)

Базово: `@eslint/js` recommended + `typescript-eslint` `recommended` (без type-aware правил — быстрее и без проблем с tsconfig
для конфиг-файлов; strict-type-checked — следующий этап) + `eslint-config-prettier` последним.
`ignores`: `**/dist/**`, `**/dist-e2e/**`, `**/.tmp/**`, `coverage/`, `playwright-report/`, `test-results/`,
`scripts/**` (инструменты процесса, вне задачи), `docs/**`, `.claude/**`, `.codex/**`, `.agents/**`.

Правила границ (AC-12, R-15, TC-ARCH-01/02) — `no-restricted-imports` по globs:

| Files | Запрещено |
|---|---|
| `packages/contracts/src/**` | всё, кроме `zod` и относительных: `@swr/*`, `react*`, `@nestjs/*`, `@prisma/*`, `openai`, `node:*` |
| `packages/game-core/src/**` | `@swr/game-data*`, `react*`, `@mui/*`, `konva`, `react-konva`, `@nestjs/*`, `@prisma/*`, `openai`, `node:*`; плюс `no-restricted-syntax`/`no-restricted-properties`: `Date.now`, `new Date()`, `Math.random` (R-1, детерминизм) |
| `packages/game-data/src/**` | `@swr/game-core`, `react*`, `@nestjs/*`, `@prisma/*`, `openai`, `node:*` |
| `packages/game-data/src/layout.ts` | дополнительно `./scenario`, `./index` (layout не тянет сценарий с базой повстанцев в web-бандл) |
| `apps/web/src/**` | `@swr/game-core`, `@swr/game-data` (точное имя; разрешён только `@swr/game-data/layout`), `@prisma/*`, `@nestjs/*`, `openai`, относительные пути в `packages/` (`**/packages/**`) |
| `apps/api/src/**` | `react*`, `openai` (вне скоупа SWR-002) |

React-правила (`eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, опционально `i18next/no-literal-string`) —
блок для `apps/web/**`, содержимое определяет FE lead; W0 создаёт блок с `react-hooks` recommended.

### 2.7 Prettier

`.prettierrc.json`: `{ "singleQuote": true, "trailingComma": "all", "printWidth": 100, "semi": true }`.
`.prettierignore`: `**/*.md` (документы пишутся вручную), `docs/`, `scripts/`, `.claude/`, `.codex/`, `.agents/`, `pnpm-lock.yaml`,
`**/dist/`, `**/dist-e2e/`, `**/.tmp/`, `apps/api/prisma/migrations/`, `coverage/`, `playwright-report/`, `test-results/`.

### 2.8 `.gitignore` (дописать, W0)

`*.tsbuildinfo`, `apps/api/.tmp/`, `apps/api/dist-e2e/`, `coverage/`, `playwright-report/`, `test-results/`.
(`*.db`, `.env*`, `!.env.example`, `dist/`, `node_modules/` уже есть.)

---

## 3. `packages/contracts`

Zod 4 (`import { z } from 'zod'`). Каждая схема — `XxxSchema`, тип — `export type Xxx = z.infer<typeof XxxSchema>`.
Входные схемы (то, что приходит от клиента) — `z.strictObject` (лишние ключи → 400). Выходные (`PlayerView`) тоже strict (TC-GC-30).

```text
packages/contracts/src/
├── index.ts        # export * from всех файлов ниже
├── enums.ts        # FactionSchema, PlayerKindSchema, DifficultySchema, PhaseSchema, PieceKindSchema, ActorSchema
├── setup.ts        # OpponentSchema, GameSetupSchema
├── state.ts        # SystemSchema, PieceSchema, RebelBaseSchema, GameEventSchema (+ payloads), GameStateSchema
├── scenario.ts     # RegionSchema, ScenarioSchema (вход createGame; данные — в game-data)
├── commands.ts     # MovePiecesCommandSchema, AdvancePhaseCommandSchema, CommandSchema, CommandEnvelopeSchema
├── view.ts         # LegalActionSchema, PlayerViewSchema
├── errors.ts       # ErrorCodeSchema, ApiErrorSchema, ERROR_MESSAGE_KEYS
├── results.ts      # CommandResultSchema (= CommandOkSchema | CommandErrSchema)
└── api.ts          # HealthResponseSchema, CreateGameResponseSchema, GameSummarySchema, ListGamesResponseSchema, GameIdParamSchema
```

Определения (точно по контракту + Clarifications):

```ts
// enums.ts
FactionSchema    = z.enum(['empire', 'rebellion'])
PlayerKindSchema = z.enum(['human', 'ai'])
DifficultySchema = z.enum(['easy', 'normal', 'hard'])
PhaseSchema      = z.enum(['assignment', 'command', 'refresh'])
PieceKindSchema  = z.enum(['unit', 'leader', 'token'])
ActorSchema      = z.union([FactionSchema, z.literal('system')])

// setup.ts — A-7: AI без difficulty → 'normal'; human с difficulty → 400
OpponentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ai'), difficulty: DifficultySchema.default('normal') }),
  z.strictObject({ kind: z.literal('human') }),
])
GameSetupSchema = z.strictObject({ humanFaction: FactionSchema, opponent: OpponentSchema })

// state.ts
SystemSchema    = z.strictObject({ id: z.string().min(1), nameKey: z.string(), regionId: z.string(), adjacentSystemIds: z.array(z.string()) })
PieceSchema     = z.strictObject({ id: z.string().min(1), kind: PieceKindSchema, owner: FactionSchema, typeKey: z.string(), systemId: z.string(), hidden: z.boolean().optional() })
RebelBaseSchema = z.strictObject({ systemId: z.string().nullable(), revealed: z.boolean() })
// GameEvent: { seq, type, actor, payload, at } — уточнён discriminated union по type (см. AM-3)
GameCreatedEvent   type 'GAME_CREATED'   actor 'system'  payload { scenarioId: string }
PiecesMovedEvent   type 'PIECES_MOVED'   actor Faction   payload { pieceIds: string[]; fromSystemId: string; toSystemId: string }
PhaseAdvancedEvent type 'PHASE_ADVANCED' actor Faction   payload { fromRound: number; fromPhase: Phase; toRound: number; toPhase: Phase }
  // общие поля: seq: z.number().int().positive(), at: z.iso.datetime()
GameEventSchema = z.discriminatedUnion('type', [GameCreatedEvent, PiecesMovedEvent, PhaseAdvancedEvent])
GameStateSchema = z.strictObject({ id: z.string(), version: z.number().int().positive(), round: z.number().int().positive(),
  phase: PhaseSchema, setup: GameSetupSchema, systems: z.array(SystemSchema), pieces: z.array(PieceSchema),
  rebelBase: RebelBaseSchema, log: z.array(GameEventSchema) })

// scenario.ts
RegionSchema   = z.strictObject({ id: z.string(), nameKey: z.string() })
ScenarioSchema = z.strictObject({ id: z.string(), regions: z.array(RegionSchema), systems: z.array(SystemSchema),
  pieces: z.array(PieceSchema), rebelBaseSystemId: z.string() })

// commands.ts — A-5/A-6: пустой и дубликаты → 400 на уровне схемы
MovePiecesCommandSchema = z.strictObject({ type: z.literal('MOVE_PIECES'),
  pieceIds: z.array(z.string().min(1)).min(1).refine(ids => new Set(ids).size === ids.length, { message: 'duplicate pieceIds' }),
  fromSystemId: z.string().min(1), toSystemId: z.string().min(1) })
AdvancePhaseCommandSchema = z.strictObject({ type: z.literal('ADVANCE_PHASE') })
CommandSchema = z.discriminatedUnion('type', [MovePiecesCommandSchema, AdvancePhaseCommandSchema])
CommandEnvelopeSchema = z.strictObject({ actor: FactionSchema, expectedVersion: z.number().int().positive(), command: CommandSchema })

// view.ts
LegalActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('MOVE_PIECES'), pieceId: z.string(), toSystemIds: z.array(z.string()) }),
  z.strictObject({ type: z.literal('ADVANCE_PHASE') }) ])
PlayerViewSchema = GameStateSchema.extend({ legalActions: z.array(LegalActionSchema) })   // strict наследуется
// Семантика (заполняет game-core): rebelBase.systemId = null для империи при revealed=false;
// чужие hidden-объекты: typeKey = 'unknown'; log без секретов (A-11).

// errors.ts
ErrorCodeSchema = z.enum(['ILLEGAL_COMMAND', 'VERSION_CONFLICT', 'NOT_FOUND', 'VALIDATION'])   // + 'INTERNAL' если AM-2 принят
ApiErrorSchema  = z.strictObject({ code: ErrorCodeSchema, messageKey: z.string(), details: z.unknown().optional() })
ERROR_MESSAGE_KEYS = {               // as const; FE переводит все ключи (ru/en)
  validation: 'errors.validation', notFound: 'errors.notFound', versionConflict: 'errors.versionConflict',
  notYourSide: 'errors.notYourSide', unknownPiece: 'errors.unknownPiece', unknownSystem: 'errors.unknownSystem',
  notOwner: 'errors.notOwner', notInFromSystem: 'errors.notInFromSystem', sameSystem: 'errors.sameSystem',
  notAdjacent: 'errors.notAdjacent', internal: 'errors.internal' }

// results.ts
CommandResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true),  view: PlayerViewSchema, events: z.array(GameEventSchema) }),
  z.strictObject({ ok: z.literal(false), error: ApiErrorSchema }) ])

// api.ts
HealthResponseSchema     = z.strictObject({ status: z.literal('ok') })
CreateGameResponseSchema = z.strictObject({ gameId: z.string(), view: PlayerViewSchema })
GameSummarySchema        = z.strictObject({ gameId: z.string(), setup: GameSetupSchema, round: z.number().int(), phase: PhaseSchema, updatedAt: z.iso.datetime() })
ListGamesResponseSchema  = z.array(GameSummarySchema)          // ≤ 20, updatedAt desc (A-18)
ErrorResponseSchema      = z.strictObject({ ok: z.literal(false), error: ApiErrorSchema })  // для всех не-2xx (R-8)
```

Тип `PlayerView['pieces'][number]` = `Piece` (поле `typeKey` может быть `'unknown'`). Для `GameSetup` используем `z.input`/`z.output`
различие: клиент шлёт `z.input<typeof GameSetupSchema>` (difficulty опционален), в state хранится `z.output` (difficulty заполнен).
Экспортировать оба: `GameSetupInput`, `GameSetup`.

Тесты `packages/contracts/test/schemas.test.ts`: A-7 (default/400), пустой/дубли `pieceIds` → fail, неизвестный `type`,
лишние ключи, `expectedVersion: '1'` → fail; TC-ARCH-03 — рекурсивный обход shape `GameStateSchema`: нет ключей `x`, `y`,
`position`, `coords`.

---

## 4. `packages/game-data`

```text
packages/game-data/src/
├── index.ts     # export { mockScenario, MOCK_SCENARIO_ID } from './scenario'
├── scenario.ts  # mockScenario: Scenario (satisfies), помечен комментарием MOCK
└── layout.ts    # export type MapLayout = Record<string, { x: number; y: number }>; mapLayout; MAP_BOUNDS
                 # НЕ импортирует scenario (ESLint), чтобы сценарий с базой повстанцев не попал в web-бандл
```

**Конвенции ключей (для FE i18n):** система `nameKey = 'systems.<id>'`; регион — `'regions.<regionId>'`; тип объекта —
`'pieceTypes.<typeKey>'` (typeKey с точками → вложенные ключи i18next), для скрытых — `pieceTypes.unknown`.
Id объектов **непрозрачные** (`pc-NN`), не кодируют тип (иначе id выдаёт скрытый `typeKey`).

**Сценарий `mock-scenario-v1`** — нейтральные вымышленные названия, 10 систем, 3 региона, 16 связей:

| System id | Region | Соседи |
|---|---|---|
| `sys-aurelis` | `reg-inner` | brevora, cindral |
| `sys-brevora` | `reg-inner` | aurelis, cindral, dovmaren, fennix |
| `sys-cindral` | `reg-inner` | aurelis, brevora, eskara |
| `sys-dovmaren` | `reg-mid` | brevora, eskara, fennix, galdor |
| `sys-eskara` | `reg-mid` | cindral, dovmaren, hollin |
| `sys-fennix` | `reg-mid` | brevora, dovmaren, iskra |
| `sys-galdor` | `reg-outer` | dovmaren, iskra, hollin, jorvan |
| `sys-hollin` | `reg-outer` | eskara, galdor, jorvan |
| `sys-iskra` | `reg-outer` | fennix, galdor, jorvan |
| `sys-jorvan` | `reg-outer` | galdor, hollin, iskra |

(в данных — полные id `sys-…`; соседство симметрично; несоседние пары, напр. `sys-aurelis`–`sys-dovmaren`.)

Стартовые объекты (21 шт.):

| id | kind | owner | typeKey | systemId |
|---|---|---|---|---|
| pc-01, pc-02 | unit | empire | `unit.empire.capital-ship` | sys-aurelis |
| pc-03, pc-04 | unit | empire | `unit.empire.fighter-wing` | sys-aurelis |
| pc-05, pc-06 | unit | empire | `unit.empire.ground-trooper` | sys-brevora |
| pc-07 | unit | empire | `unit.empire.ground-trooper` | sys-cindral |
| pc-08 | leader | empire | `leader.empire.commander` | sys-aurelis |
| pc-09 | leader | empire | `leader.empire.agent` | sys-cindral |
| pc-10 | token | empire | `token.empire.loyalty` | sys-brevora |
| pc-11 | token | empire | `token.empire.probe` | sys-dovmaren |
| pc-12 | unit | rebellion | `unit.rebellion.cruiser` | sys-iskra |
| pc-13, pc-14 | unit | rebellion | `unit.rebellion.fighter-wing` | sys-iskra |
| pc-15, pc-16 | unit | rebellion | `unit.rebellion.ground-trooper` | sys-jorvan |
| pc-17 | leader | rebellion | `leader.rebellion.captain` | sys-iskra |
| pc-18 | leader | rebellion | `leader.rebellion.envoy` | sys-hollin |
| pc-19 | token | rebellion | `token.rebellion.loyalty` | sys-hollin |
| pc-20 | token | rebellion | `token.rebellion.sabotage` | sys-galdor |
| **pc-21** | token | rebellion | `token.rebellion.covert-cell` (**уникальный** — TC-GC-22) | sys-fennix, `hidden: true` |

`rebelBaseSystemId: 'sys-hollin'` (→ `rebelBase { systemId: 'sys-hollin', revealed: false }`).
Покрывает R-3: ≥ 8 систем, несоседние пары, ≥ 2 объекта одной фракции в одной системе, hidden-объект повстанцев, база,
`unit` и `token` у обеих сторон, лидеры у обеих.

**`mapLayout`** (мировые координаты, `MAP_BOUNDS = { width: 1600, height: 1000 }`): aurelis (300,250), brevora (550,180),
cindral (450,450), dovmaren (800,300), eskara (750,550), fennix (1000,150), galdor (1100,450), hollin (1050,750),
iskra (1350,300), jorvan (1350,650). Раскладка объектов внутри системы — UI.

Тесты `packages/game-data/test/`: `scenario.test.ts` — `ScenarioSchema.parse`, уникальность id, симметрия и связность графа,
все `systemId` объектов существуют, R-3 чек-лист, id объектов `^pc-\d{2}$`, typeKey hidden-объекта уникален;
`layout.test.ts` — множества id `mapLayout` и `mockScenario.systems` совпадают (TC-ARCH-04), координаты внутри `MAP_BOUNDS`.

---

## 5. `packages/game-core`

Чистые функции, без исключений для доменных отказов (R-2), без мутаций входа, без `Date`/`Math.random` (R-1).

```text
packages/game-core/src/
├── index.ts          # публичный API (ниже); ничего другого не экспортируется
├── context.ts        # CreateContext { gameId: string; now: string }, ApplyContext { now: string }
├── result.ts         # CoreError { code: 'VALIDATION'|'VERSION_CONFLICT'|'ILLEGAL_COMMAND'; messageKey; details? }, ApplyResult
├── create-game.ts    # createGame
├── apply-command.ts  # applyCommand: схема → версия → сторона → делегирование в mock-rules
├── mock-rules.ts     # ВСЯ временная логика (TC-ARCH-10): validateMove, applyMove, nextPhase, applyAdvancePhase. Шапка: "MOCK RULES — not Rebellion rules"
├── legal-actions.ts  # getLegalActions
├── player-view.ts    # toPlayerView, toPlayerEvents (redactPiece, redactEvent)
└── internal/state.ts # иммутабельные хелперы: pieceById, systemById, appendEvents, bumpVersion
```

Публичные сигнатуры (контракт + AM-1):

```ts
createGame(setup: GameSetupInput, scenario: Scenario, ctx: CreateContext): GameState
applyCommand(state: GameState, envelope: unknown, ctx: ApplyContext): ApplyResult
//   ApplyResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: CoreError }
getLegalActions(state: GameState, viewer: Faction): LegalAction[]
toPlayerView(state: GameState, viewer: Faction): PlayerView
toPlayerEvents(events: GameEvent[], state: GameState, viewer: Faction): GameEvent[]
```

Поведение:

- `createGame`: `GameSetupSchema.parse(setup)`; `id = ctx.gameId`, `version = 1`, `round = 1`, `phase = 'assignment'`,
  `systems`/`pieces` — глубокие копии сценария, `rebelBase = { systemId: scenario.rebelBaseSystemId, revealed: false }`,
  `log = [{ seq: 1, type: 'GAME_CREATED', actor: 'system', payload: { scenarioId }, at: ctx.now }]` (A-8).
- `applyCommand` — порядок проверок (согласован с A-5; первая неудача возвращается):
  1. `CommandEnvelopeSchema.safeParse(envelope)` → `VALIDATION` / `errors.validation`, `details: issues` (защита; API уже валидирует).
  2. `expectedVersion !== state.version` → `VERSION_CONFLICT` / `errors.versionConflict`, `details: { currentVersion }`.
  3. `actor !== state.setup.humanFaction` → `ILLEGAL_COMMAND` / `errors.notYourSide` (A-2).
  4. `MOVE_PIECES` (mock-rules, по порядку): `fromSystemId` или `toSystemId` нет → `errors.unknownSystem`; `from === to` →
     `errors.sameSystem`; любой `pieceId` не найден → `errors.unknownPiece`; `owner !== actor` → `errors.notOwner`;
     `systemId !== fromSystemId` → `errors.notInFromSystem`; `to ∉ adjacent(from)` → `errors.notAdjacent`. Всё или ничего (A-6).
     `details` содержат только id из запроса (никаких данных о чужих объектах).
  5. Успех: новый state (`version + 1`, события `seq = last + 1…`, `at = ctx.now`), `events` = добавленные события.
     `MOVE_PIECES` → одно `PIECES_MOVED`; `ADVANCE_PHASE` → одно `PHASE_ADVANCED`; цикл assignment → command → refresh → (round+1) assignment.
  Перемещение mock разрешено в любой фазе, для любого `kind` (контракт не ограничивает).
- `getLegalActions`: `[]`, если `viewer !== setup.humanFaction` (A-2). Иначе для каждого объекта `owner === viewer`:
  `{ type: 'MOVE_PIECES', pieceId, toSystemIds: adjacent(piece.systemId) }` + один `{ type: 'ADVANCE_PHASE' }`.
- `toPlayerView`: `FactionSchema.parse(viewer)` (бросает на невалидном — TC-GC-27, программная ошибка);
  чужие `hidden` объекты → `typeKey: 'unknown'` (id, owner, kind, systemId, `hidden: true` остаются — A-11);
  `rebelBase.systemId = null`, если `viewer === 'empire' && !revealed`; `log = toPlayerEvents(...)`; `legalActions`.
  Результат проходит `PlayerViewSchema` (TC-GC-30).
- `toPlayerEvents` / `redactEvent`: исчерпывающий `switch` по `type`. В текущих событиях секретов нет по построению
  (payload не содержит `typeKey` и базу); функция — единая точка для будущих секретных событий. Тест закрепляет инвариант.

Коды ошибок core → HTTP (маппинг в API): `VALIDATION` → 400, `VERSION_CONFLICT` → 409, `ILLEGAL_COMMAND` → 422. `NOT_FOUND` — только API.

**Unit-тесты** (`packages/game-core/test/`, Vitest; фикстуры берутся из `@swr/game-data` программно, R-1 `ctx` фиксирован):

| Файл | Кейсы |
|---|---|
| `helpers.ts` | `deepFreeze`, `mulberry32(seed)`, `pickAdjacentPair`, `pickNonAdjacent`, `envFor(state, cmd)`, фиксированные `ctx` |
| `create-game.test.ts` | TC-GC-01; A-8 (version 1, GAME_CREATED seq 1); детерминизм: два вызова с одним ctx глубоко равны; A-7 default difficulty |
| `move-pieces.test.ts` | TC-GC-02, 03, 07, 08, 09, 10, 12, 13, 14; TC-GC-11/15 (пустой/дубли → `VALIDATION`); каждый отказ: результат `ok:false`, вход не изменён |
| `advance-phase.test.ts` | TC-GC-04, 05 |
| `apply-command.test.ts` | TC-GC-16, 17, 18; порядок проверок (409 раньше 422; 400 раньше 409) |
| `invariants.test.ts` | TC-GC-06: seeded random 500 шагов (MOVE из `legalActions` + ADVANCE_PHASE) — после каждой: version +1, множество id объектов неизменно (нет потерь/дублей), каждый объект ровно в одной существующей системе, `log.length` +1, `seq` строго возрастает без пропусков; отклонённые команды не меняют state. TC-GC-29 (`deepFreeze` входа) |
| `legal-actions.test.ts` | TC-GC-25, 26 (согласованность legalActions ↔ applyCommand по всем парам) |
| `player-view.test.ts` | TC-GC-19…24 (24 — собранный в тесте hidden-объект империи), 27, 28 (лог после хода скрытым объектом не содержит его typeKey и базы), 30 |

---

## 6. `apps/api` (NestJS 11)

### 6.1 Модули и файлы

```text
apps/api/
├── nest-cli.json                 # { "sourceRoot": "src", "compilerOptions": { "tsConfigPath": "tsconfig.build.json", "deleteOutDir": true } }
├── .env.example                  # DATABASE_URL="file:./dev.db"  PORT=3000
├── scripts/ensure-env.mjs        # копирует .env.example → .env, если .env нет (pnpm dev работает после чистого clone)
├── scripts/e2e-serve.mjs         # e2e-сервер: свой DB-файл, свой outDir, свой порт (§6.7)
├── prisma/schema.prisma
├── prisma/migrations/<ts>_init/migration.sql  (+ migration_lock.toml)
├── src/
│   ├── main.ts                   # loadEnvFile('.env') если есть → createApp() → listen(PORT ?? 3000)
│   ├── app.factory.ts            # createApp({ databaseUrl? }): INestApplication — R-5; общий для main и тестов
│   ├── app.module.ts             # AppModule.forRoot({ databaseUrl }) : DynamicModule
│   ├── common/
│   │   ├── api-error.ts          # class ApiError(code, messageKey, details?) + фабрики notFound()/validation(issues)/fromCore(err)
│   │   ├── api-exception.filter.ts  # глобальный: ApiError → status + {ok:false,error}; HttpException → по статусу; прочее → 500
│   │   ├── zod-validation.pipe.ts   # ZodValidationPipe(schema) для @Body/@Param/@Query (кроме тела /commands, см. D-7)
│   │   └── runtime.tokens.ts     # CLOCK ({ now(): string }), ID_GENERATOR ({ gameId(): string }) — переопределяемы в тестах
│   ├── health/  health.module.ts, health.controller.ts          # GET /api/health → { status: 'ok' }
│   ├── persistence/ persistence.module.ts (@Global), prisma.service.ts (extends PrismaClient; datasourceUrl из токена; onModuleDestroy → $disconnect)
│   ├── games/
│   │   ├── games.module.ts       # провайдер SCENARIO = mockScenario (@swr/game-data); экспортирует GamesRepository
│   │   ├── games.controller.ts   # POST /games (201), GET /games, GET /games/:id
│   │   ├── games.service.ts      # create, list, getView
│   │   └── games.repository.ts   # ЕДИНСТВЕННОЕ место Prisma-доступа к Game/GameEvent
│   └── commands/
│       ├── commands.module.ts
│       ├── commands.controller.ts  # POST /games/:id/commands, @HttpCode(200), @Body() body: unknown
│       └── commands.service.ts     # execute(gameId, body)
└── test/  (§6.6)
```

`createApp` = `NestFactory.create(AppModule.forRoot(opts), { logger: ['error','warn','log'] })` → `setGlobalPrefix('api')` →
`useGlobalFilters(new ApiExceptionFilter())` → `enableShutdownHooks()`; возвращает приложение **без** `listen` (тест вызывает `init()`).
Никаких test-only эндпоинтов (R-7). Мутирующие маршруты ровно два: `POST /api/games`, `POST /api/games/:id/commands` (TC-API-23).

### 6.2 HTTP (после A-3/A-4: параметра `viewer` нет)

| Route | Поток | Ответ |
|---|---|---|
| `GET /api/health` | — | 200 `{ status: 'ok' }` |
| `POST /api/games` | `ZodValidationPipe(GameSetupSchema)` → `createGame(setup, SCENARIO, { gameId: ID_GENERATOR.gameId(), now: CLOCK.now() })` → `repo.insertGame` (Game + GAME_CREATED в одной транзакции) | 201 `{ gameId, view: toPlayerView(state, setup.humanFaction) }` |
| `GET /api/games` | `repo.listSummaries(20)` (orderBy `updatedAt desc`, take 20; round/phase из распарсенного state) | 200 `GameSummary[]` |
| `GET /api/games/:id` | `repo.findById` → нет → 404 | 200 `toPlayerView(state, state.setup.humanFaction)` |
| `POST /api/games/:id/commands` | §6.4 | 200 `{ ok: true, view, events }` / 400 / 404 / 409 / 422 |

Неизвестный query-параметр (напр. старый `?viewer=`) игнорируется. `:id` — `z.string().min(1).max(64)`.
Перед отправкой view/ответа — `PlayerViewSchema.parse`/`CommandResultSchema.parse` (дешёвая защита от утечки полного state).

### 6.3 Ошибки → HTTP

| Источник | HTTP | Тело |
|---|---|---|
| Zod (pipe или сервис) | 400 | `{ ok:false, error:{ code:'VALIDATION', messageKey:'errors.validation', details:{ issues:[{ path, code, message }] } } }` |
| Невалидный JSON (body-parser `SyntaxError`/`entity.parse.failed`) | 400 | то же, `details` без текста парсера |
| Игра не найдена / неизвестный маршрут (`NotFoundException`) | 404 | `{ code:'NOT_FOUND', messageKey:'errors.notFound' }` |
| core `VERSION_CONFLICT` или `count === 0` в транзакции | 409 | `{ code:'VERSION_CONFLICT', messageKey:'errors.versionConflict', details:{ currentVersion } }` |
| core `ILLEGAL_COMMAND` | 422 | `{ code:'ILLEGAL_COMMAND', messageKey:'errors.<reason>', details? }` |
| Прочее | 500 | AM-2 принят: `{ code:'INTERNAL', messageKey:'errors.internal' }`; иначе — тело Nest по умолчанию |

Фильтр **никогда** не кладёт в тело stack, сообщения Prisma, state (TC-API-25). Логирование: только `gameId`, `code`, `status`;
state/view/payload в лог не пишутся (скрытая информация). W-API обязан тестом подтвердить, что невалидный JSON доходит до фильтра;
если нет — `NestFactory.create(..., { bodyParser: false })` + `app.use(express.json())` + express error-middleware с тем же форматом.

### 6.4 Команда: транзакция и optimistic concurrency

```text
CommandsService.execute(gameId, body):
  1. row = repo.findById(gameId)                       → null ⇒ 404             (A-5: 404 первым)
  2. env = CommandEnvelopeSchema.safeParse(body)       → fail ⇒ 400
  3. state = GameStateSchema.parse(JSON.parse(row.state)); assert row.version === state.version (иначе 500, лог gameId)
  4. env.expectedVersion !== row.version               ⇒ 409 { currentVersion: row.version }
  5. r = applyCommand(state, env, { now: CLOCK.now() }) → !ok ⇒ map (400/409/422)
  6. outcome = repo.commitCommand(gameId, env.expectedVersion, r.state, r.events)
       prisma.$transaction(async tx => {
         const { count } = await tx.game.updateMany({ where: { id, version: expected },
                                    data: { state: JSON.stringify(next), version: next.version, updatedAt: new Date() } })
         if (count === 0) throw new VersionConflictSignal()      // rollback
         await tx.gameEvent.createMany({ data: events.map(e => ({ gameId, seq: e.seq, type: e.type, actor: e.actor,
                                                                   payload: JSON.stringify(e.payload), createdAt: new Date(e.at) })) })
       })
       VersionConflictSignal ⇒ 409 (currentVersion перечитать)
  7. 200 { ok: true, view: toPlayerView(r.state, humanFaction), events: toPlayerEvents(r.events, r.state, humanFaction) }
```

- Источник истины — снимок `Game.state` (включая `log`); `GameEvent` — append-only зеркало в **той же** транзакции (A-15).
  Второй предохранитель — `@@unique([gameId, seq])`.
- Шаг 4 — быстрый путь; гонку закрывает шаг 6 (две параллельные команды с одной версией → одна 200, другая 409, ровно один
  новый `GameEvent` — TC-API-20). SQLite сериализует писателей; интерактивная транзакция Prisma (по умолчанию `maxWait` 2 s,
  `timeout` 5 s) достаточна.
- Запись `state` происходит только в `GamesRepository.insertGame` и `.commitCommand` (TC-ARCH-06).

### 6.5 Prisma schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Game {
  id        String      @id
  setup     String      // JSON: GameSetup (output)
  state     String      // JSON: полный GameState — НИКОГДА не отдаётся наружу
  version   Int
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  events    GameEvent[]

  @@index([updatedAt])
}

model GameEvent {
  id        Int      @id @default(autoincrement())
  gameId    String
  seq       Int
  type      String
  actor     String
  payload   String   // JSON
  createdAt DateTime @default(now())
  game      Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)

  @@unique([gameId, seq])
}
```

`PrismaService` создаётся с `datasourceUrl` из `AppModule.forRoot({ databaseUrl })` (fallback — `process.env.DATABASE_URL`).
Миграция `init` создаётся W0 (`prisma migrate dev --name init` на dev-БД) и коммитится. `migrate deploy` — во всех скриптах.

### 6.6 Интеграционные тесты (Vitest + supertest + реальный Nest)

- `apps/api/vitest.config.ts`: `plugins: [swc.vite({ module: { type: 'es6' } })]` (unplugin-swc — даёт decorator metadata),
  conditions `@swr/source` (§2.5), `include: ['test/**/*.int.test.ts']`, `globalSetup: 'test/global-setup.ts'`,
  `pool: 'forks'`, `testTimeout: 20000`.
- `test/global-setup.ts`: создаёт `apps/api/.tmp/`, удаляет старые `test-*.db`, применяет миграции к `.tmp/template.db`
  (`pnpm exec prisma migrate deploy` с `DATABASE_URL=file:<abs>/.tmp/template.db`). Dev-БД не трогается (R-6).
- `test/support/test-app.ts`: `createTestDb()` — копирует template в `.tmp/test-<uuid>.db` (файлы тестов можно гонять параллельно);
  `startApp(dbUrl)` — `createApp({ databaseUrl })` + `app.init()`; `stopApp` — `app.close()` + удаление файла; `api(app)` — supertest.
  `CLOCK`/`ID_GENERATOR` при необходимости переопределяются (`overrideProvider` недоступен через `createApp`, поэтому `createApp` принимает
  опциональные `clock`/`idGenerator`).
- Файлы и покрытие:

| Файл | TC |
|---|---|
| `health.int.test.ts` | TC-API-01 |
| `games.int.test.ts` | TC-API-02, 03, 04, 05 (A-7), 06, 07 (+ лимит 20), 08 (без `viewer`), 09, 10 (`?viewer=` игнорируется → view humanFaction) |
| `hidden-info.int.test.ts` | TC-API-11 (empire: база `null` во всех ответах, сырое тело без hidden typeKey), 12 (игра за rebellion видит базу), 13 |
| `commands.int.test.ts` | TC-API-14, 15, 16, 17, 18, 19, 22, порядок 404→400→409→422, совпадение `Game.state.log` и строк `GameEvent` (A-15) |
| `concurrency.int.test.ts` | TC-API-20 (`Promise.all` двух POST) |
| `persistence.int.test.ts` | TC-API-21 (app#1 → close → app#2 на том же файле) |
| `routes.int.test.ts` | TC-API-23 (`DiscoveryService` + `MetadataScanner`: метаданные `PATH_METADATA`/`METHOD_METADATA`), 24, 25 |

  Примечание для QA: TC-API-08/09/10/12/21 в `test-cases.md` ещё используют `?viewer=` — по A-3/A-4 их надо переформулировать
  (владелец файла — QA lead).

### 6.7 CORS / proxy / порты

- Dev: api `:3000` (`PORT`), web `:5173`, Vite proxy `/api` → `process.env.API_PROXY_TARGET ?? 'http://localhost:3000'`. CORS не включается.
- E2E (A-17): api `:3100`, web `:5174`, своя БД. `scripts/e2e-serve.mjs`: `DATABASE_URL=file:<abs>/apps/api/.tmp/e2e.db` → удалить файл →
  `prisma migrate deploy` → `tsc -p tsconfig.build.json --outDir dist-e2e` (не конфликтует с `dist` от `pnpm dev`) →
  `node dist-e2e/main.js` с `PORT=${E2E_API_PORT ?? 3100}`. Пакеты `dist` гарантирует root `e2e` (`build:packages`).

---

## 7. Playwright (база от W0; дальше — QA)

`playwright.config.ts`: `testDir: 'e2e'`, `use: { baseURL: 'http://localhost:5174', viewport: { width: 1440, height: 900 },
trace: 'retain-on-failure', screenshot: 'only-on-failure' }`, проект `chromium`, `webServer`:

```ts
[
  { command: 'pnpm --filter @swr/api run e2e:serve', url: 'http://localhost:3100/api/health',
    reuseExistingServer: false, timeout: 180_000, env: { E2E_API_PORT: '3100' } },
  { command: 'pnpm --filter @swr/web exec vite --port 5174 --strictPort', url: 'http://localhost:5174',
    reuseExistingServer: false, timeout: 120_000, env: { API_PROXY_TARGET: 'http://localhost:3100', VITE_E2E: '1' } },
]
```

`reuseExistingServer: false` — сервер всегда стартует на чистой e2e-БД (TC-E2E-02 требует пустую БД); конфликтов с `pnpm dev` нет
из-за отдельных портов. Проект `@screenshots` (R-18) и остальные spec — QA workers. Браузер: `pnpm exec playwright install chromium` (README).

---

## 8. Подзадачи и владение файлами

### 8.1 Граф

```text
W0 foundation ──► W-CORE (packages/game-core: логика + unit)      ─┐
              ├─► W-API  (apps/api: модули, persistence, int-тесты) ─┼─► BE INTEGRATION (backend-lead) ─► общий INTEGRATION
              └─► FE workers (apps/web, по плану FE lead)            ─┘
```

W-CORE и W-API идут параллельно: W-API пишет против сигнатур `game-core/src/index.ts`, оставленных W0 (заглушки).
Интеграционные тесты W-API, зависящие от правил, зеленеют после слияния W-CORE (W-API может временно помечать их `it.todo` —
не `skip` с ложным `passed`).

### 8.2 W0 — foundation (backend-worker)

**GOAL:** монорепо ставится и запускается; все корневые gate-команды существуют и зелёные на каркасе; контракты и данные готовы;
FE может начинать сразу.

**OWNED FILES:**
- root: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.nvmrc`, `tsconfig.base.json`, `eslint.config.mjs`,
  `.prettierrc.json`, `.prettierignore`, `.gitignore` (только дописать §2.8), `README.md` (раздел «Запуск»: `pnpm install`,
  `pnpm exec playwright install chromium`, `pnpm dev`, `pnpm e2e`, `pnpm verify` — R-20), `playwright.config.ts`, `e2e/tsconfig.json`,
  `e2e/smoke.spec.ts`.
- `packages/contracts/**` — полностью (§3) + тесты.
- `packages/game-data/**` — полностью (§4) + тесты.
- `packages/game-core/{package.json, tsconfig.json, tsconfig.test.json, vitest.config.ts, src/index.ts, src/context.ts, src/result.ts}` —
  типы и **заглушки** публичных функций (`throw new Error('not implemented: W-CORE')`), один тест-заглушка не нужен (`vitest run --passWithNoTests`).
- `apps/api/{package.json, nest-cli.json, tsconfig.json, tsconfig.build.json, vitest.config.ts, .env.example, scripts/ensure-env.mjs,
  scripts/e2e-serve.mjs, prisma/schema.prisma, prisma/migrations/**, src/main.ts, src/app.factory.ts, src/app.module.ts,
  src/persistence/**, src/health/**, test/global-setup.ts, test/support/test-app.ts, test/health.int.test.ts}`.
- `apps/web` **shell** (после W0 все файлы переходят FE workers; FE lead может перестроить):
  `apps/web/package.json` (зависимости по §10/плану FE; scripts `dev: vite`, `build: tsc -b && vite build`, `typecheck: tsc -b --noEmit`
  или эквивалент, `test: vitest run --passWithNoTests`), `index.html`, `vite.config.ts` (React plugin, `resolve.conditions` §2.5,
  `server.port 5173`, proxy `/api` → `API_PROXY_TARGET`), `tsconfig.json`, `vitest.config.ts`, `src/main.tsx`, `src/vite-env.d.ts`,
  `src/app/App.tsx` (провайдеры: MUI `ThemeProvider`+`CssBaseline`, `QueryClientProvider`, i18n init, `RouterProvider`),
  `src/app/router.tsx` (маршруты `/`, `/games/new`, `/games/:id`, `/settings` с заглушками-страницами),
  `src/shared/i18n/{index.ts, locales/ru.json, locales/en.json}` (минимум ключей заглушек). Граница с FE lead: W0 **не** пишет
  экраны, стор, клиента API, canvas.

**CONTRACTS:** §3 (схемы), §2.5 (exports), сигнатуры §5.
**DONE WHEN** (логи в `docs/tasks/SWR-002/artifacts/logs/w0-*.log`):
1. `pnpm install` — exit 0; в логе нет `Unsupported engine` для прямых зависимостей и нет «Ignored build scripts» для Prisma.
2. `pnpm dev` поднимает оба сервера: `curl :3000/api/health` → 200, `curl :5173/` → 200, `curl :5173/api/health` → 200 (proxy).
3. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` (smoke) — exit 0.
4. `rm -rf packages/*/dist && pnpm --filter @swr/api test` — зелёный (условие `@swr/source` работает в Vitest).
5. Временный файл с `import … from '@swr/game-core'` в `apps/web/src` роняет `pnpm lint` (проверено и удалено; вывод в лог).
**REPORT:** changed files, команды + результат, фактические установленные версии (из `pnpm-lock.yaml`), отклонения от плана.

### 8.3 W-CORE — правила и проекции (backend-worker)

**OWNED FILES:** `packages/game-core/src/**`, `packages/game-core/test/**` (конфиги пакета — только с согласия backend-lead).
**DONE WHEN:** §5 реализован; `pnpm --filter @swr/game-core test` и `typecheck` зелёные; все TC-GC-01…30 закрыты тестами (TC-GC-28 —
по варианту §5); `pnpm lint` 0 нарушений; mock-логика только в `mock-rules.ts`.

### 8.4 W-API — API и persistence (backend-worker)

**OWNED FILES:** `apps/api/src/**` (кроме изменения `main.ts`/`app.factory.ts` без согласования — можно, но сообщить), `apps/api/test/**`;
`apps/api/prisma/**` — только с согласия backend-lead (схема зафиксирована §6.5).
**DONE WHEN:** §6 реализован; `pnpm --filter @swr/api test` зелёный (все файлы §6.6, после слияния W-CORE); `pnpm lint`, `typecheck`, `build`
зелёные; ручной smoke через `pnpm dev` + curl (создать игру, ход, 409, 422) с логом.

### 8.5 BE INTEGRATION (backend-lead)

Слить W-CORE + W-API, прогнать `pnpm verify` (без e2e — если FE ещё не готов, e2e = `not_run`), заполнить implementation log в
`implementation-plan.md` (файл — analyst/leads).

---

## 9. Риски

| Риск | Митигация |
|---|---|
| Ряд «latest» версий требует Node ≥ 22 (vitest 5, prisma 8, react-router 8, react-i18next 18 / i18next 27, concurrently 10, jsdom 30+, msw 3, @nestjs/schematics 12, better-sqlite3 13) | точные пины §10; `.nvmrc`; W0 проверяет лог install |
| pnpm 10 блокирует install-скрипты → Prisma без engine | `onlyBuiltDependencies` §2.2 |
| Vitest не применяет `@swr/source` для SSR-резолва | DONE WHEN W0 п.4; fallback `resolve.alias` |
| Decorator metadata в Vitest | `unplugin-swc` (рецепт Nest); без него DI по типам ломается |
| Невалидный JSON обходит Nest-фильтр | явная проверка в W-API (§6.3) |
| Гонки на SQLite / `SQLITE_BUSY` | один процесс API, guard `version` в `updateMany`, короткие транзакции |
| Dev и e2e пишут один `dist` | e2e компилирует в `dist-e2e`, своя БД и порты |
| `GameState` и `PlayerView` структурно похожи → риск отдать state | все ответы строятся только через `toPlayerView` + `PlayerViewSchema.parse`; hidden-info тесты на сыром теле |
| Сценарий (с базой) попадёт в web-бандл | web импортирует только `@swr/game-data/layout`; ESLint-запрет; layout.ts не импортирует scenario |
| Nest 11 — ветка `legacy` | апгрейд на Nest 12 (ESM) — отдельной задачей вместе с переходом пакетов на ESM |

## 10. Версии (проверено `npm view <pkg> version engines peerDependencies --json`, 2026-11-08, Node 20.19.5)

Пинить **точно** (без `^`) в `package.json`; lockfile коммитится.

| Пакет | Версия | engines / примечание |
|---|---|---|
| typescript | 5.9.3 | ≥14.17; `typescript-eslint` требует `<6.1`; latest 7.0.2 не берём |
| eslint / @eslint/js | 10.14.0 / 10.0.1 | `^20.19.0 \|\| ^22.13 \|\| >=24` |
| typescript-eslint | 8.72.1 | peer eslint ^10, ts `<6.1.0` |
| eslint-plugin-react-hooks / -react-refresh | 7.1.1 / 0.5.7 | peer eslint ^10 ok |
| eslint-config-prettier / globals / prettier | 10.1.8 / 17.14.0 / 3.9.10 | ok |
| concurrently | **9.2.5** | 10.x требует Node ≥ 22 |
| vitest | **4.1.12** | `^20 \|\| ^22 \|\| >=24`; peer vite ^6–8; 5.x требует Node ≥ 22.12 |
| @playwright/test | 1.65.0 | ≥ 20 |
| @types/node | 20.19.43 | под Node 20 |
| zod | 4.6.7 | — |
| @nestjs/common, core, platform-express, testing | **11.2.8** | ≥ 20; 12.x — ESM-only |
| @nestjs/cli | 11.0.24 | ≥ 20.11 (зависит от typescript 5.9.3) |
| reflect-metadata / rxjs | 0.2.2 / 7.8.2 | — |
| prisma / @prisma/client | **6.19.3** | ≥ 18.18; 7.10.1 (`^20.19`) требует better-sqlite3 (13.x → Node ≥ 22); 8.0.0-rc — Node ≥ 22.18 |
| supertest / @types/supertest | 7.3.2 / 7.2.1 | — |
| unplugin-swc / @swc/core | 2.0.0 / 1.16.22 | `^20.19 \|\| >=22.12` |
| *web, для FE lead:* vite / @vitejs/plugin-react | 8.3.6 / 6.2.1 | `^20.19 \|\| >=22.12` |
| react, react-dom / @mui/material | 19.3.1 / 9.5.0 | — |
| react-konva / konva | 19.3.2 / 10.9.1 | peer react ^19.3 |
| zustand / @tanstack/react-query | 5.1.0 / 5.107.1 | — |
| react-router | **7.18.5** | 8.x требует Node ≥ 22.22 |
| react-i18next / i18next | **17.1.13 / 26.7.2** (без поля engines) | 18 / 27 требуют Node ≥ 22 |
| jsdom (если нужен) | **29.x** | 30+ требует Node ≥ 22.22; альтернатива happy-dom 21.0.4 (≥ 20) |
| msw (если нужен) | 2.x | 3.0.4 требует Node ≥ 22.12 |

## 11. Proposed amendments to the frozen contract (требуют согласия Analyst)

- **AM-1 (нужно для R-1).** Третий параметр контекста: `createGame(setup, scenario, ctx: { gameId: string; now: string })`,
  `applyCommand(state, envelope, ctx: { now: string })`. HTTP-контракт не меняется. Без этого `id` и `at` недетерминированы.
- **AM-2 (опционально).** `ErrorCode` дополняется `'INTERNAL'` (500, `errors.internal`), чтобы все не-2xx имели единый формат (R-8).
  Если отклонено — 500 отдаёт тело Nest по умолчанию, клиент трактует как сетевую ошибку.
- **AM-3 (уточнение, не расширение).** `GameEvent` — discriminated union по `type` (`GAME_CREATED`, `PIECES_MOVED`, `PHASE_ADVANCED`)
  с типизированным `payload`; `GameSetup.opponent` — discriminated union по `kind` (реализует A-7). Поля и формы из контракта сохраняются.
- **AM-4 (уточнение).** `applyCommand` возвращает результат, а не бросает (`{ ok:true, state, events } | { ok:false, error }`);
  `toPlayerView` бросает на невалидном `viewer` (программная ошибка, TC-GC-27); `getLegalActions` для не-`humanFaction` → `[]`.
- **AM-5 (уточнение).** `ScenarioSchema` (вход `createGame`) живёт в `contracts`, т.к. `game-core` не может импортировать `game-data`.

## 12. Open questions

1. Нужен ли `revealed`-переход в этой задаче (команды раскрытия нет) — считаю, что нет; `revealed: true` проверяется только собранным state.
2. Hot-seat (соперник-человек ходит сам) — отложено A-2; потребует выбора `viewer` и, значит, авторизации стороны.
3. Перемещение mock разрешено в любой фазе — устраивает ли PO, или ограничить фазой `command` (повлияет на e2e-сценарии).
4. Переход на Node 22 LTS снял бы большинство пинов (§10) — предложение на следующий этап.
