# Plan — backend (SWR-004 / TECH_PLANNING)

Автор: backend-lead, 2026-11-08. Основа: `specification.md` (контракт заморожен) + **Clarifications Q-1..Q-25** (обязательны,
ссылки вида «Q-n»), `test-cases.md` (TC-*, TR-1..TR-12), фактический код SWR-003 (незакоммичен поверх `d4895ac`).
Расхождения с контрактом — только в §9 «Proposed amendments». Сверка с `plan-frontend.md` — §10.
Только дизайн: кода и установок пакетов этот документ не делает.

## 0. Ключевые решения (кратко)

| # | Решение | Почему |
|---|---|---|
| D-1 | **R0 — один исполнитель, первым:** rename `rebellion → rebels` (код, данные, i18n, typeKey, тесты, e2e) **и** апгрейд хранимых данных Rebellion до `schemaVersion: 2` (финальная форма state/settings) + ленивый апкастер v1→v2. **Wire-контракт в R0 не меняется** (вход setup и `view.setup` — прежней формы, только значения фракций) — поэтому UI в R0 правится только механически (строки/id). | Гейты зелёные после R0; FE-0 сливается в R0 (иначе web не компилируется между шагами). Смена формы wire — у C + FE-1 одновременно. |
| D-2 | `typeKey` фигур тоже переименовываются: `unit.rebellion.*` → `unit.rebels.*` (и `leader.*`, `token.*`), апкастер переписывает префикс. | После R0 `'rebellion'` как значение фракции не встречается нигде, кроме v1-апкастера/фикстур (TC-A-04). |
| D-3 | Апкаст **ленивый** (Q-16): `parseState`/`parseStoredSetup` модуля читают v1 и v2; при следующей записи (команда) state сохраняется v2. SQL-миграция трогает **только** колонки платформы. `SessionEvent.actor` в БД не переписывается; апкастер событий экспортируется для любого будущего читателя зеркала. | Платформа/SQL без знаний о фракциях (AC-12); откат = копия БД. |
| D-4 | Колонки `Session.status` (NOT NULL DEFAULT `'prototype'`), `Session.idempotencyKey` (unique, nullable), `Session.idempotencyHash` (nullable, SHA-256 — Q-2). Миграция — `ALTER TABLE ADD COLUMN` ×3 + unique index, без пересоздания таблицы. | Data-preserving по построению; существующие строки → `prototype`. |
| D-5 | Идемпотентность (Q-1..Q-5, Q-25): ключ сравнивается **до** валидации setup; «то же тело» = SHA-256 канонического JSON `{gameId, setup}` (рекурсивная сортировка ключей); ключ пишется **только** вместе с успешно созданной сессией; гонка решается unique-индексом + перехватом нарушения. Повтор → **200** + `Idempotent-Replay: true` + текущее состояние сессии. | Как требует spec/Q; без отдельной таблицы. |
| D-6 | `ServerGameModule` расширяется обобщённо: `parseSetup` различает `invalid`/`unsupported`, `parseStoredSetup`, `initialStatus`, `publicSettings`, `toPlayerView(state, ctx{status})`. Платформа не знает фракций/ruleset. | AC-12. |
| D-7 | Hot-seat — **не mock** (новый файл `rules/turn.ts`), `END_TURN` фазу не меняет (Q-10). Handoff-view: `{kind:'handoff', id, version, activeSide, round, phase, sessionStatus}` — ничего больше (Q-12, AM-FE-1). Player-view: `{kind:'player', viewer, settings, …}` без `setup` (Q-11, AM-FE-8). | AC-14, без утечек. |
| D-8 | Владение: `packages/platform` — только Worker B. Rebellion (`packages/games/rebellion/**`) — R0, затем Worker C. Prisma + репозиторий — Worker A. | Без пересечений (§6). |

---

## 1. Step R0 — переименование фракции + апгрейд данных (один исполнитель, первым)

### 1.0 Шаг 0 — заморозить v1-фикстуры (ДО любого переименования)
Правила после R0 больше не производят v1-данные, поэтому снимки генерируются **текущим кодом SWR-003** одноразовым
скриптом в scratch (скрипт не коммитится; в шапке фикстур — происхождение: «generated from SWR-003 working tree on d4895ac,
2026-11-08, createGame + applyCommand, mockScenario»). Фиксированные id/время (без `randomUUID`), < 50 KB каждый (TR-4b):

| Файл (коммитится) | Содержимое |
|---|---|
| `packages/games/rebellion/test/fixtures/v1/setups.v1.json` | хранимые v1 setup: `{humanFaction:'rebellion', opponent:{kind:'ai',difficulty:'hard'}}`, `{humanFaction:'empire', opponent:{kind:'human'}}`, `{humanFaction:'empire', opponent:{kind:'ai',difficulty:'normal'}}` + входной вариант `{kind:'ai'}` без difficulty (TC-U-26/27) |
| `packages/games/rebellion/test/fixtures/v1/state.v1.rebellion-human.json` | state v1: rebellion vs human, 1 `MOVE_PIECES` повстанцев + 3 `ADVANCE_PHASE` (version 5, round 2), скрытые фигуры обеих сторон |
| `packages/games/rebellion/test/fixtures/v1/state.v1.empire-ai.json` | state v1: empire vs ai/hard, 1 ход |
| `apps/api/test/fixtures/v1/sessions.v1.json` | 3 строки уровня БД (как `buildSwr002Games` сейчас: EMP/ai/hard; `rebellion`/human с ходом и `PHASE_ADVANCED`; EMP/ai без difficulty во входе) — `{id, setup, state, version, createdAt, updatedAt, events[]}` |

`apps/api/test/support/pre-migration-db.ts`: `buildSwr002Games` больше **не вызывает** правила — читает `sessions.v1.json`
(значения `'rebellion'` в v1-фикстурах **не** переименовываются — это вход миграции, TC-R-03). Новый хелпер
`apps/api/test/support/swr003-db.ts` → `createSwr003Db({rows})`: пустой файл → `prisma db execute` SQL миграций
`20261107235651_init` и `20261108120000_sessions` → `migrate resolve --applied` обе → raw INSERT в `Session`/`SessionEvent`
из `sessions.v1.json` (TR-4a; тот же приём, что у `createPreMigrationDb`).

### 1.1 Rebellion — схема данных v2 (финальная, R0 пишет её полностью)
`packages/games/rebellion/src/schema/`:

```ts
// enums.ts
export const FactionSchema = z.enum(['rebels', 'empire']);   // порядок spec; дефолт первым
export type Faction = z.infer<typeof FactionSchema>;
export const FactionIdSchema = FactionSchema; export type FactionId = Faction;          // имя из spec
export const OpponentTypeSchema = z.enum(['ai', 'human']);   // = PlayerKindSchema (алиас оставить)
export const AIDifficultySchema = DifficultySchema;           // алиас, значения прежние
export const GameRulesetSchema = z.enum(['base', 'rise-of-the-empire']);
export const GameModeSchema = z.enum(['digital', 'physical_companion']);

// factions.ts (NEW) — чистая функция, без React
export function opponentOf(f: FactionId): FactionId { return f === 'rebels' ? 'empire' : 'rebels'; }

// settings.ts (NEW)
export const RebellionSettingsSchema = z.strictObject({
  playerFaction: FactionIdSchema, opponentFaction: FactionIdSchema, opponentType: OpponentTypeSchema,
  aiDifficulty: AIDifficultySchema.nullable(), ruleset: GameRulesetSchema, gameMode: GameModeSchema,
}).superRefine(/* opponentFaction === opponentOf(playerFaction); aiDifficulty === null ⇔ opponentType === 'human' */);
/** Колонка Session.setup (Q-16: schemaVersion и в settings). */
export const StoredRebellionSetupSchema = RebellionSettingsSchema.extend({ schemaVersion: z.literal(2) }); // + те же refine

// state.ts — GameStateSchema v2
{ schemaVersion: z.literal(2), id, version, round, phase,
  settings: RebellionSettingsSchema,           // вместо setup
  activeSide: FactionIdSchema, handoffPending: z.boolean(),
  systems, pieces, rebelBase, log }
```
Инвариант state (refine): `activeSide`/`handoffPending` согласованы с `settings` (AI-партия: `activeSide = playerFaction`,
`handoffPending = false`).

### 1.2 Апкастер v1 → v2 (`packages/games/rebellion/src/server/`)
- `legacy-v1.ts` (NEW) — **замороженная копия** схем SWR-003 (`FactionV1 = ['empire','rebellion']`, `GameSetupV1`, `GameStateV1`,
  события v1), не зависит от текущих enum'ов. Единственное место (кроме фикстур/тестов), где допустим литерал `'rebellion'` как фракция.
- `upcast.ts` (NEW), чистые функции, детерминированы, не мутируют вход:
  - `upcastStoredSetup(raw)`: есть `schemaVersion: 2` → `StoredRebellionSetupSchema.parse`; есть `humanFaction` → v1-схема →
    `{schemaVersion:2, playerFaction: f(humanFaction), opponentFaction: opponentOf(…), opponentType: opponent.kind,
    aiDifficulty: kind==='ai' ? (difficulty ?? 'normal') : null, ruleset:'base', gameMode:'digital'}`; иначе — throw.
  - `upcastState(raw)`: `schemaVersion === 2` → `GameStateSchema.parse`; поле отсутствует → `GameStateV1.parse` → маппинг
    `f = {rebellion→rebels, empire→empire}`: `settings` (как выше, без `schemaVersion`), `pieces[].owner = f(owner)`,
    `typeKey` `^(unit|leader|token)\.rebellion\.` → `$1.rebels.`, `log[].actor = f(actor)` (кроме `system`),
    `activeSide = playerFaction`, `handoffPending = false` (Q-17), `schemaVersion: 2`; остальные поля байт-в-байт;
    результат — `GameStateSchema.parse`. Любая другая `schemaVersion` (напр. 99) или мусор (`humanFaction:'sith'`) → throw → 500 (TC-U-31, TC-I-33).
  - `upcastEvent(raw)`: v1-событие → `actor` переименован, `seq/at/payload` неизменны (TC-U-29). Payload событий v1 фракций не содержит.
  - Идемпотентность: `upcast(upcast(x)) ≡ upcast(x)` (TC-U-30).
- `rebellion-server-module.ts` (R0-версия): `parseState(raw, expected)` = `upcastState(raw)` + проверка `id`/`version` строки
  (version при апкасте не меняется → оптимистичная конкуренция не затронута). `createInitialState` пишет v2.

### 1.3 Временные wire-адаптеры R0 (удаляет Worker C)
Чтобы UI в R0 менялся только механически:
- `parseSetup` R0 принимает **прежнюю форму входа** `{humanFaction: 'rebels'|'empire', opponent:{kind, difficulty?}}` и
  конвертирует тем же кодом, что `upcastStoredSetup` (результат — `StoredRebellionSetup`).
- `PlayerViewSchema` R0 описывается **явно** (больше не `GameStateSchema.extend`): прежние поля + `setup: {humanFaction, opponent}`,
  вычисленный из `state.settings` (`legacySetupOf`); viewer = `settings.playerFaction`. `schemaVersion/activeSide/handoffPending` во view не выходят.
- `RebellionSessionDetailsSchema` — прежние ключи (`humanFaction, opponent, difficulty?`), значения `rebels|empire`.
- Правила/команды — прежнее поведение (`notYourSide` при actor ≠ playerFaction), чтение из `state.settings`.
Помечаются `// SWR-004 R0 adapter — removed by Worker C`.

### 1.4 Прочие изменения пакета в R0
`scenario/scenario.ts` (owner + typeKey), `ai/index.ts` (`factions.rebels`, комментарий про default difficulty),
`assets/index.ts` (`visualTokens.faction.rebels`), `rules/*` (доступ `state.settings.*` вместо `state.setup.*`,
`create-game` строит v2 state), тесты пакета (механическая замена + новые `test/server/upcast.test.ts`, `test/schema/settings.test.ts`).

### 1.5 UI/e2e: что R0 правит механически (только строки/id) — согласовано с FE-0 и QA
Правило: заменяется **только** токен, обозначающий фракцию (значение `Faction`, ключ `Record<Faction,…>`, i18n-ключи
`faction.*`/`factionDescription.*`/легенда/`pieceTypes.*.rebellion.*`, testid). **Не трогать:** `star-wars-rebellion`,
`@bga/game-rebellion`, i18n-префикс `rebellion.*:` и `REBELLION_I18N_PREFIX = 'rebellion'`, имена папок/идентификаторов (`rebellionAssets` …).

| Зона | Файлы (R0) |
|---|---|
| web код | `games/rebellion/board/panels/{EmptyPanel,SystemPanel}.tsx`, `board/canvas/layers/PiecesLayer.tsx`, `board/canvas/nodes/PieceNode.tsx`, `board/model/pieceLayout.ts`, `setup/components/FactionPicker.tsx` (+ любые `Record<Faction,…>`, найденные `tsc`) |
| web тесты/фикстуры | `board/test/fixtures.ts`, `board/model/model.test.ts`, `setup/SetupScreen.test.tsx`, `describeSession.test.ts`, `games/rebellion/test/fixtures.ts` |
| web i18n (ru, en) | `locales/*/common.json` (`faction.rebels`), `setup.json` (tagline), `board.json` (легенда), `gameData.json` (`pieceTypes.{unit,leader,token}.rebels`) |
| e2e (с согласия QA, TR-1/TR-5) | `e2e/support/api.ts` (`Faction`, фикстуры), `e2e/support/testids.ts` (`setupFaction('rebels'|'empire')` → `setup-faction-rebels`), `e2e/new-game.spec.ts`, `e2e/board-view.spec.ts`, `e2e/architecture.spec.ts` |
| api тесты | `apps/api/test/{sessions,commands,hidden-info,persistence,migration}.int.test.ts`, `support/fixtures.ts`, `support/pre-migration-db.ts` (→ фикстуры), NEW `support/swr003-db.ts`, NEW `fixtures/v1/sessions.v1.json`, NEW `upcast-v1.int.test.ts`, NEW `dev-db-upgrade.int.test.ts` (opt-in, §1.6) |

**FE владеет после R0** (R0 не трогает): форма новой партии и её модель, `describeSession`, стол/hot-seat UI, страница игры/список,
api-клиент и идемпотентность, реестр `factions`/эмблемы в `./assets`, все новые i18n-ключи (`plan-frontend.md` FE-1, A, B, C).

### 1.6 Проверка на копии dev-БД (никогда не открывать оригинал на запись)
`apps/api/test/dev-db-upgrade.int.test.ts` — `describe.skipIf(!process.env.SWR004_DEV_DB)`:
sha256(`SWR004_DEV_DB`) → `copyFileSync` в `.tmp/devcopy-<uuid>.db` → `prisma migrate deploy` на **копии** (в R0 — no-op) →
`startApp(copy)` → для всех строк: `GET /api/sessions/:id` 200, глубокий обход тела — нет `'rebellion'` как фракции,
`GET /api/sessions` содержит все строки, одна команда (`ADVANCE_PHASE` actor = апкаст-сторона) → 200, повторный GET идентичен
до/после рестарта приложения → sha256 оригинала **не изменился**; копия удаляется. Текущая dev-БД: 4 сессии (3×empire, 1×rebellion,
все AI), события с `actor='rebellion'` — проверено чтением копии 2026-11-08. `dev.pre-swr003.db` не трогается.
Команда: `SWR004_DEV_DB=prisma/dev.db pnpm --filter @bga/api exec vitest run test/dev-db-upgrade.int.test.ts`.

### 1.7 DONE WHEN (R0)
- `pnpm verify` зелёный → `artifacts/logs/r0-verify.log`; число тестов не уменьшилось (TC-R-02).
- grep (TC-A-04): `grep -rnE "['\"]rebellion['\"]|\.rebellion\.|faction\.rebellion" packages apps e2e --include=*.ts --include=*.tsx --include=*.json`
  (без `node_modules`, `dist`) → только `server/legacy-v1.ts`, `server/upcast.ts`, v1-фикстуры/их тесты и `REBELLION_I18N_PREFIX` → `r0-grep.log`.
- TC-U-26..31 (апкастер) и `upcast-v1.int.test.ts` (SWR-003-БД → API: settings/фракции v2, команда пишет v2) зелёные.
- dev-копия: §1.6 → `r0-dev-db-copy.log` (включая sha256 до/после).
- Отчёт: какие web/e2e-файлы изменены (для ревью FE-lead и QA).

---

## 2. Worker A — модель данных и Prisma

### 2.1 `apps/api/prisma/schema.prisma`
```prisma
model Session {
  …существующие поля…
  /// SessionStatus of @bga/platform ('setup'|'prototype'|'active'|'completed'); value comes from the game module.
  /// DEFAULT only backfills rows created before SWR-004.
  status          String  @default("prototype")
  /// Idempotency-Key of the POST that created the session (Q-25: kept forever); null = created without a key.
  idempotencyKey  String? @unique
  /// SHA-256 (hex) of canonical JSON {gameId, setup} of that POST (Q-2).
  idempotencyHash String?
}
```

### 2.2 Миграция `apps/api/prisma/migrations/20261108200000_session_status_idempotency/migration.sql` (рукописная)
```sql
-- SWR-004: platform columns only (no game knowledge, JSON in setup/state is NOT rewritten — lazy upcast, Q-16).
-- Data-preserving: no table rebuild. Existing rows → status 'prototype'. Roll back = restore a DB copy.
ALTER TABLE "Session" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'prototype';
ALTER TABLE "Session" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Session" ADD COLUMN "idempotencyHash" TEXT;
CREATE UNIQUE INDEX "Session_idempotencyKey_key" ON "Session"("idempotencyKey");
```
Проверка дрейфа: `pnpm --filter @bga/api exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel
prisma/schema.prisma --shadow-database-url file:./.tmp/shadow.db --exit-code` → exit 0. Если Prisma требует redefine-таблицы —
перейти на шаблон SWR-003 (`CREATE new` + `INSERT … SELECT` + `DROP` + `RENAME`), сохранив проверки ниже.

### 2.3 Репозиторий `apps/api/src/sessions/sessions.repository.ts` (интерфейс заморожен для B)
```ts
export interface SessionRow { id; gameId; setup: string; state: string; version: number; status: string; createdAt; updatedAt }
//   status — сырой текст; валидирует сервис (SessionStatusSchema)
export interface IdempotencyRecord { key: string; hash: string }
export interface NewSession { …как сейчас…; status: SessionStatus; idempotency: IdempotencyRecord | null }
export type InsertOutcome = { ok: true } | { ok: false; reason: 'IDEMPOTENCY_KEY_TAKEN' };

insert(s: NewSession): Promise<InsertOutcome>;
//   P2002 в транзакции → если findByIdempotencyKey(key) находит строку → IDEMPOTENCY_KEY_TAKEN, иначе rethrow
//   (не полагаться на формат meta.target). Транзакция (Session + SessionEvent) откатывается целиком.
findByIdempotencyKey(key: string): Promise<(SessionRow & { idempotencyHash: string | null }) | null>;
findById / listRecent / commit / currentVersion — без изменений поведения (ROW_SELECT + setup, status).
```
A делает **одну** правку вне своих файлов: вызов `repo.insert` в `sessions.service.ts` получает `status: 'prototype',
idempotency: null` (2 строки, чтобы дерево A компилировалось); B заменяет их при ребейзе (известная точка конфликта).

### 2.4 Тесты A
| Файл | Кейсы |
|---|---|
| `apps/api/test/migration.int.test.ts` (правка) | TC-MIG-* на полной цепочке: список миграций += новая; хеш-лок init **и** sessions-миграций (TC-M-07) |
| NEW `apps/api/test/migration-swr004.int.test.ts` | TC-M-01 (SWR-003-БД → deploy: `status='prototype'` у всех, `idempotencyKey/Hash` null, unique-индекс `Session_idempotencyKey_key` unique=1, count строк/событий до = после, `integrity_check`/`foreign_key_check` ok, повторный deploy no-op), TC-M-02/03/05 (через API — после B/C, A пишет кейсы с генерической проверкой «нет `'rebellion'` в телах», точные формы view дополняет C), TC-M-06 (SWR-002 → SWR-003 → SWR-004) |
| NEW `apps/api/test/sessions-repository.int.test.ts` | insert с ключом; повторный insert того же ключа → `IDEMPOTENCY_KEY_TAKEN`, 0 новых строк и событий (откат транзакции); несколько `NULL`-ключей допустимы; `findByIdempotencyKey`; `status` сохраняется как передан |
| `dev-db-upgrade.int.test.ts` (берёт у R0) | + после deploy на копии: колонки есть, `status='prototype'` у 4 строк |

### 2.5 DONE WHEN (A)
`pnpm --filter @bga/api test` + typecheck + lint зелёные → `artifacts/logs/a-api-test.log`; drift-check exit 0 → `a-migrate-diff.log`;
dev-копия с новой миграцией → `a-dev-db-copy.log` (sha256 оригинала неизменен).

---

## 3. Worker B — платформа и Session API (обобщённо, без знаний о фракциях)

### 3.1 `@bga/platform` (B — единственный владелец `packages/platform/**`)
```ts
// sessions.ts
export const SessionStatusSchema = z.enum(['setup', 'prototype', 'active', 'completed']);
export const SessionSettingsSchema = z.record(z.string(), z.unknown());            // JSON, интерпретирует только игра
export const SessionDetailsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])); // Q-20
SessionSummarySchema   += status: SessionStatusSchema
SessionResponseSchema  = { sessionId, gameId, status, settings: SessionSettingsSchema, view }   // strict
makeSessionResponseSchema(view, settings?)                                           // + схема settings игры
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENT_REPLAY_HEADER = 'Idempotent-Replay';
export const IdempotencyKeySchema = z.uuid();
// errors.ts
ErrorCodeSchema += 'SETUP_UNSUPPORTED' (422), 'IDEMPOTENCY_KEY_REUSED' (409)
ERROR_MESSAGE_KEYS += setupUnsupported: 'errors.setupUnsupported' (fallback), idempotencyKeyReused: 'errors.idempotencyKeyReused'
// server-game-module.ts
export type SetupParseResult<S> =
  | { ok: true; value: S }
  | { ok: false; kind: 'invalid'; issues: ValidationIssue[] }                        // → 400 VALIDATION, пути под ['setup']
  | { ok: false; kind: 'unsupported'; messageKey: string; details?: unknown };      // → 422 SETUP_UNSUPPORTED
export interface ViewContext { status: SessionStatus }
interface ServerGameModule<State, Setup, Event> {
  parseSetup(input: unknown): SetupParseResult<Setup>;     // схема (400) раньше поддерживаемости (422)
  parseStoredSetup(raw: unknown): Setup;                   // Session.setup любой сохранённой версии → текущая; throw → 500
  initialStatus(setup: Setup): SessionStatus;
  publicSettings(setup: Setup): SessionSettings;           // только публичное (Q-24)
  toPlayerView(state: State, ctx: ViewContext): unknown;   // было (state)
  …остальное без изменений; summarize → SessionDetails (теперь допускает null)
}
```
`ParseResult` остаётся для прочих нужд. Платформа не содержит `rebels|empire|ruleset|gameMode|faction` (grep-тест TC-A-01).

### 3.2 `POST /api/sessions` — порядок проверок (spec + Q-3)
1. **400 форма:** тело `CreateSessionRequestSchema` (pipe); заголовок `Idempotency-Key` — если присутствует, `IdempotencyKeySchema`
   (пусто, не UUID, два заголовка (Express склеивает через `, `), > 36 символов → 400, путь `['headers','idempotency-key']`). Отсутствует → без идемпотентности (Q-2).
2. **404** неизвестная игра → **422 `GAME_UNAVAILABLE`** (`registry.requireAvailable`).
3. **Идемпотентность** (если ключ): `hash = sha256(canonicalJson({gameId, setup}))` (рекурсивная сортировка ключей объектов,
   порядок массивов сохраняется). `findByIdempotencyKey(key)`: найдена и `hash` совпал → **replay**; найдена и не совпал → **409
   `IDEMPOTENCY_KEY_REUSED`** (`details` отсутствует — ничего из чужой сессии не эхоится).
4. **400 setup** (`kind:'invalid'`) → **422 `SETUP_UNSUPPORTED`** (`kind:'unsupported'`, `messageKey`/`details` от игры). Ключ не сохраняется (Q-3).
5. `createInitialState` → `insert({…, status: module.initialStatus(setup), idempotency: key ? {key, hash} : null})`.
   `IDEMPOTENCY_KEY_TAKEN` (проиграл гонку) → шаг 3 заново (Q-4): совпал → replay, нет → 409. Никогда не 500 (TR-8).
6. **201** `{sessionId, gameId, status, settings: publicSettings(setup), view: toPlayerView(state, {status})}`.

**Replay** (Q-1): **200**, заголовок `Idempotent-Replay: true`, тело как у `GET /api/sessions/:id` (текущее состояние сессии).
Контроллер ставит статус/заголовок через `@Res({ passthrough: true })`. Канонизация/хеш — `apps/api/src/sessions/idempotency.ts` (NEW, чистые функции + unit-тест).
Следствие (TC-I-17, фиксируется): перестановка ключей — то же тело; `aiDifficulty` опущен vs `'normal'`, `null` vs опущен — **разные** тела → 409.
Клиент при повторе шлёт байт-в-байт то же тело (AM-FE-4), так что это не мешает.

### 3.3 Чтение и команды
- `GET /api/sessions/:id`, replay: `row.status` → `SessionStatusSchema.parse` (иначе 500), `settings = publicSettings(parseStoredSetup(JSON.parse(row.setup)))`,
  `view = toPlayerView(state, {status})`. Битый `setup` (`aiFaction`, мусор) → 500 (TC-I-33).
- `GET /api/sessions`: `SessionSummary` + `status`; строка с невалидным статусом/setup/state пропускается и логируется (как TC-SES-16).
- `POST /:id/commands`: без изменений протокола; `toPlayerView(result.state, {status: row.status})`. Статус в SWR-004 не меняется (Q-9, TC-I-38).
- `ApiError`: `STATUS_BY_CODE` += 2 кода; `ApiError.setupUnsupported(messageKey, details)`, `ApiError.idempotencyKeyReused()`.
- Логи: только `sessionId gameId code status` (+ `IDEMPOTENT_REPLAY`); ни ключа, ни тела, ни state.

### 3.4 Тесты B (интеграционные, generic через `fake-game`, плюс Rebellion там, где проверяется платформа)
| Файл | Кейсы |
|---|---|
| `test/support/fake-game.ts` | реализует новые методы; `initialStatus → 'active'` (TC-I-36: статус берётся из модуля); setup `{start, mode?}` где `mode:'unsupported'` → `kind:'unsupported'` (generic 422) |
| `game-registry.int.test.ts` | fake: create/get/list/commands с `status`/`settings`; 422 `SETUP_UNSUPPORTED` generic; идемпотентность для fake (TC-I-36) |
| NEW `idempotency.int.test.ts` | TC-I-15 (201 → 200 + `Idempotent-Replay`, 1 строка), TC-I-16 (другое тело / другой gameId → 409, исходная сессия не изменена), TC-I-17 (решение §3.2), TC-I-18 (плохие заголовки → 400, 0 строк), TC-I-19 (без ключа → 2 строки), TC-I-20 (10×`Promise.all` ×5, ровно 1 строка, один `sessionId`, 0×500), TC-I-21 (параллельно разные тела → 201 + 409/200, 0×500), TC-I-22/23 (ключ не сгорает на 400/422), детерминированная гонка: `vi.spyOn(app.get(SessionsRepository), 'findByIdempotencyKey')` возвращает `null` на первом вызове → путь `IDEMPOTENCY_KEY_TAKEN` → 200/409 |
| NEW `db-failure.int.test.ts` | TC-I-34 (TR-3: `vi.spyOn` на репозиторий, бросающий `PrismaClientKnownRequestError`/`Error`; и приложение на немигрированном пустом SQLite-файле): `POST`/`GET /`/`GET /:id` → 500 `{code:'INTERNAL', messageKey:'errors.internal'}`, тело без `prisma|sqlite|no such table|stack`; сбой `sessionEvent.createMany` внутри транзакции → 0 строк `Session`; после восстановления `POST(DEF, K1)` → 201 (ключ не сохранён частично) |
| `routes.int.test.ts`, `concurrency.int.test.ts`, `health.int.test.ts` | TC-I-37 (новых маршрутов нет), регрессия |
| NEW `architecture.int.test.ts` (или `scripts/` node-test) | TC-A-01/A-02: `packages/platform/src` и `apps/api/src` без `rebels|empire|ruleset|gameMode|faction`; нет `openai` в `apps/api/src` |
| `packages/platform/test/*` | схемы: strict-ключи `SessionResponse`/`Summary`, `SessionStatus`, details с `null`, `IdempotencyKeySchema` |
| unit `apps/api/test/idempotency.unit.test.ts` | `canonicalJson` (порядок ключей, вложенность, массивы), стабильность хеша |

### 3.5 Также B
`docs/architecture/application.md` (Session API: status/settings/идемпотентность/коды), `docs/architecture/adding-a-game.md`
(новые методы модуля, `SetupParseResult`, `ViewContext`). На время своей ветки — **только конформность** чужих файлов:
`rebellion-server-module.ts` (≤ ~20 строк: `initialStatus → 'prototype'`, `publicSettings`/`parseStoredSetup` через R0-апкастер,
параметр `ctx` в `toPlayerView`) и механические ожидания ключей ответа в Rebellion-тестах api (`status`, `settings`) —
окончательную версию этих файлов задаёт C при ребейзе (известные точки конфликта, §6.3).

### 3.6 DONE WHEN (B)
На дереве R0 + A: `pnpm --filter @bga/platform test`, `pnpm --filter @bga/api test`, `pnpm typecheck`, `pnpm lint` зелёные →
`artifacts/logs/b-platform-test.log`, `b-api-test.log`; TC-I-20 прогнан 5× подряд без флаков → `b-idempotency-race.log`.

---

## 4. Worker C — модуль Rebellion (setup, settings, hot-seat, view)

### 4.1 Схема (`packages/games/rebellion/src/schema/`)
```ts
// setup.ts — вход клиента (заменяет R0-адаптер)
export const RebellionSetupInputSchema = z.strictObject({
  playerFaction: FactionIdSchema, opponentType: OpponentTypeSchema,
  aiDifficulty: AIDifficultySchema.nullable().optional(),
  ruleset: GameRulesetSchema, gameMode: GameModeSchema,           // обязательны (Q-7)
}).superRefine(/* ai + null → issue ['aiDifficulty'] (Q-6); human + не-null → issue ['aiDifficulty'] */);
export const REBELLION_SETUP_DEFAULTS = Object.freeze({ playerFaction:'rebels', opponentType:'ai', aiDifficulty:'normal',
  ruleset:'base', gameMode:'digital' } as const);                 // TC-U-03, AM-FE-6
export const SUPPORTED_RULESETS = ['base'] as const;  export const SUPPORTED_GAME_MODES = ['digital'] as const;
// commands.ts: + { type:'END_TURN' }, { type:'ACCEPT_HANDOFF' } (strict)
// state.ts events: + TURN_ENDED { actor: from, payload:{ toSide } }, HANDOFF_ACCEPTED { actor: side, payload:{} }
// view.ts
PlayerViewPlayerSchema = z.strictObject({ kind:z.literal('player'), viewer, activeSide, settings: RebellionSettingsSchema,
  id, version, round, phase, systems, pieces, rebelBase, log, legalActions })      // без setup/schemaVersion/handoffPending
HandoffViewSchema = z.strictObject({ kind:z.literal('handoff'), id, version, activeSide, round, phase,
  sessionStatus: SessionStatusSchema })                                              // и НИЧЕГО больше
PlayerViewSchema = z.discriminatedUnion('kind', [PlayerViewPlayerSchema, HandoffViewSchema])
LegalAction += { type:'END_TURN' }
// details.ts
RebellionSessionDetailsSchema = { playerFaction, opponentFaction, opponentType, aiDifficulty: nullable, ruleset, gameMode, round, phase } // Q-20
// errors.ts (wire `errors.<name>`, FE → `rebellion.errors:<name>`, AM-FE-5)
+ notYourTurn, handoffPending, handoffNotAvailable (Q-10), rulesetUnavailable, modeUnavailable; notYourSide остаётся (Q-11)
```

### 4.2 Правила (`src/rules/`)
- `setup.ts` (NEW, чистая): `parseRebellionSetup(input)` → `RebellionSetupInputSchema` (400) → поддерживаемость: собрать
  `unsupported = [ruleset∉SUPPORTED_RULESETS && 'ruleset', gameMode∉SUPPORTED_GAME_MODES && 'gameMode']`; непусто → `unsupported`
  с `messageKey` первого (`errors.rulesetUnavailable` | `errors.modeUnavailable`), `details: { unsupported }` (Q-8) →
  settings: `opponentFaction = opponentOf(playerFaction)`, `aiDifficulty = ai ? (d ?? 'normal') : null`. Клиентскому
  `aiFaction`/`opponentFaction` нет места — strict → 400.
- `create-game.ts`: `activeSide = playerFaction`, `handoffPending = false`.
- `apply-command.ts` — порядок: 400 схема → 409 версия → 422 `notYourSide` (actor не участник: в AI-партии участник только
  `playerFaction`; в human — обе) → 422 `notYourTurn` (actor ≠ `activeSide`) → `END_TURN`/`ACCEPT_HANDOFF` в AI-партии →
  `handoffNotAvailable` → при `handoffPending` любая команда, кроме `ACCEPT_HANDOFF` → `handoffPending`; `ACCEPT_HANDOFF` без
  ожидания → `handoffNotAvailable` → mock-правила. `details` — только `{actor}`/id из запроса.
- `turn.ts` (NEW, **не** mock): `END_TURN` → `activeSide = opponentOf(activeSide)`, `handoffPending = true`, событие `TURN_ENDED`,
  version+1, фаза/раунд не меняются (Q-10); `ACCEPT_HANDOFF` → `handoffPending = false`, событие `HANDOFF_ACCEPTED`, version+1.
- `legal-actions.ts`: `[]`, если `handoffPending` или `viewer ≠ activeSide`; иначе mock-ходы + `ADVANCE_PHASE` + (`human` ? `END_TURN`) (AM-FE-7).
- `player-view.ts`: `toPlayerView(state, status)` → `handoffPending` ? handoff-view : player-view для `activeSide` (скрытие как
  раньше: база для Империи, `typeKey:'unknown'` для скрытых фигур противника). `toPlayerEvents` → `[]` при `handoffPending`
  (ответ `END_TURN` не несёт журнала). `redactEvent` + 2 новых события (секретов нет). Viewer никогда не берётся из запроса.

### 4.3 Серверный модуль (`src/server/rebellion-server-module.ts`, C — окончательный владелец)
`parseSetup` → `parseRebellionSetup` (результат `StoredRebellionSetup`); `parseStoredSetup` → `upcastStoredSetup`;
`initialStatus` → `'prototype'` (mock-сценарий, AC-13); `publicSettings` → settings без `schemaVersion` (ровно 6 ключей, TC-U-13);
`toPlayerView(state, ctx)` → `PlayerViewSchema.parse(toPlayerView(state, ctx.status))`; `summarize` → новые details.
Удаляются R0-адаптеры (§1.3).

### 4.4 Подготовка к AI Commander (без реализации)
Сложность хранится в `settings.aiDifficulty` (публична — показывается в списке). `./ai` остаётся данными
(`factions.rebels/empire`, профили сложностей); профиль выбирается будущим серверным кодом по `settings.aiDifficulty`.
Никакого OpenAI, второго AI-клиента или вызова AI при создании сессии (TC-A-02). Тест: ни один ответ API не содержит полей
профиля (`candidateActionLimit`, `goalWeights`, `exploration`).

### 4.5 Тесты C
| Файл | Кейсы |
|---|---|
| `packages/games/rebellion/test/schema/*` | TC-U-01..14 (opponentOf, фракции, вход/settings, defaults заморожены, strict-поля, 422-ветка, publicSettings, details с null) |
| `test/rules/turn.test.ts` NEW, `apply-command.test.ts`, `legal-actions.test.ts`, `player-view.test.ts`, `invariants.test.ts` | TC-U-15..25; property-цикл: случайные последовательности команд human-партии → при `handoffPending` view всегда handoff ровно с 6+1 ключами; иначе `viewer = activeSide` и скрытие для viewer соблюдено |
| `test/server/server-module.test.ts`, `upcast.test.ts` | конформность модуля, инвариант `publicSettings(parseStoredSetup(row.setup))` ≡ `state.settings` для новых и v1-строк |
| api: `sessions.int.test.ts` | TC-I-01..14 (Rebellion: 201, 400/422, порядок проверок, settings/status/details) |
| api: NEW `hotseat.int.test.ts` | TC-I-25..32: `END_TURN` → handoff (глубокая проверка: ключи ровно `kind,id,version,activeSide,round,phase,sessionStatus`; JSON не содержит ни одного id систем/фигур сценария, `typeKey`, `rebelBase`, `legalActions`, `log`; `events: []`); GET/`?viewer=` → тот же handoff; чужие команды → 422 без изменения version/строк событий; `ACCEPT_HANDOFF` Империей → player-view Империи с замаскированной базой; 2 параллельных ACCEPT → 200 + 409 |
| api: `hidden-info.int.test.ts`, `commands.int.test.ts` | TC-I-35, TC-R-04 (AI-партия: `kind:'player'`, секреты скрыты; `notYourSide` для стороны AI) |
| api: `persistence.int.test.ts` | TC-I-24 (две app на одном файле: AI + human в handoff; `settings/status/view` идентичны; replay ключа после рестарта → тот же `sessionId`) |
| api: `migration-swr004.int.test.ts` (совместно с A, C добавляет точные формы) | TC-M-02..05 (TC-M-04: мигрированная human-партия → `END_TURN` → `ACCEPT_HANDOFF`) |

### 4.6 DONE WHEN (C)
На дереве R0 + A + B: `pnpm --filter @bga/game-rebellion test`, `pnpm --filter @bga/api test`, typecheck, lint зелёные →
`artifacts/logs/c-rebellion-test.log`, `c-api-test.log`; leak-проверка handoff → `c-hotseat-leak.log` (вывод теста с перечнем
проверенных id). R0-адаптеры удалены (`grep "R0 adapter"` пусто).

---

## 5. Тесты ↔ AC (backend-часть)

| AC | Backend-доказательство (worker) |
|---|---|
| AC-01, AC-07, AC-11 | FE/e2e; BE — единый формат ошибок (B) |
| AC-02 | `REBELLION_SETUP_DEFAULTS` TC-U-03 (C); дефолт `normal` TC-U-05 (C) |
| AC-03 | TC-U-01/02/04, TC-I-02 (C) |
| AC-04 | TC-U-06/07, TC-I-03/09 (C) |
| AC-05 | TC-U-04..12 (C); TC-I-07..14 (C), generic 422 в `game-registry.int` (B) |
| AC-06 | TC-I-01/04/05 (C), TC-I-33 (C), TC-I-34 (B), репозиторий (A) |
| AC-08 | TC-I-24 (C) + dev-копия (R0/A/интеграция) |
| AC-09 | TC-U-14 (C), TC-I-06 (B — status, C — details) |
| AC-10 | TC-I-15..23 (B) |
| AC-12 | TC-A-01/02 (B), TC-I-36/37 (B), ESLint/`check:bundle` (интеграция) |
| AC-13 | TC-U-15 (C), TC-I-01/06/38 (B), TC-M-01 (A) |
| AC-14 | TC-U-16..25 (C), TC-I-25..32/35 (C), TC-M-04 (C) |
| AC-15 | TC-U-26..31 (R0), TC-M-01..07 (A, C), dev-копия (R0, A) |

PO-тесты: Unit → §1–4 выше; Integration (ошибки БД — `db-failure.int`, неверные фракции/сложность — TC-I-07/09, отсутствие
лишних полей в публичных ответах — strict-схемы + TC-I-06/35 (нет `state`, `setup`, `idempotencyKey/Hash`, `aiFaction`,
`schemaVersion`, полей AI-профиля)); E2E TC-001..006 — FE/QA на API этого плана.

---

## 6. Владение файлами и порядок

### 6.1 OWNED FILES
| Worker | Файлы |
|---|---|
| **R0** | `packages/games/rebellion/src/**`, `packages/games/rebellion/test/**`, `apps/api/test/**` (кроме нового у A/B), web/e2e-файлы из §1.5 (только механика) |
| **A** | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261108200000_session_status_idempotency/**`, `apps/api/src/sessions/sessions.repository.ts`, `apps/api/test/{migration.int.test.ts, migration-swr004.int.test.ts, sessions-repository.int.test.ts, dev-db-upgrade.int.test.ts}`, `apps/api/test/support/{pre-migration-db.ts, swr003-db.ts}`; 2 строки вызова `insert` в `sessions.service.ts` (§2.3) |
| **B** | `packages/platform/**`, `apps/api/src/sessions/{sessions.service.ts, sessions.controller.ts, session-commands.service.ts, idempotency.ts}`, `apps/api/src/common/**`, `apps/api/test/{support/fake-game.ts, game-registry.int.test.ts, idempotency.int.test.ts, idempotency.unit.test.ts, db-failure.int.test.ts, routes.int.test.ts, concurrency.int.test.ts, health.int.test.ts, architecture.int.test.ts}`, `docs/architecture/{application.md, adding-a-game.md}`; конформность §3.5 |
| **C** | `packages/games/rebellion/src/{schema,rules,server,ai,scenario}/**`, `packages/games/rebellion/test/{schema,rules,server,ai,scenario}/**`, `apps/api/test/{sessions,commands,hidden-info,persistence,hotseat}.int.test.ts`, `apps/api/test/support/fixtures.ts`; кейсы TC-M-02..05 в `migration-swr004.int.test.ts` |
| FE (не BE) | `packages/games/rebellion/src/assets/{factions.ts, emblems.ts}` + `test/assets/**` (реестр фракций — визуальные данные, `plan-frontend.md` B); `apps/web/**`; QA — `e2e/**` после R0 |

### 6.2 Порядок
```
R0 (один, merge, pnpm verify зелёный)
 ├─▶ A ──merge──┐
 ├─▶ B (ребейз на A перед DONE) ──merge──┐
 └─▶ C: схема/правила/тесты пакета сразу; server-module и api-тесты — ребейз на A+B ──merge──▶ INTEGRATION (backend-lead + FE-1/QA)
```
A ‖ B ‖ C — в отдельных worktree; файлы не пересекаются, кроме перечисленных точек конфликта. FE-1 (переход web на новый wire)
сливается вместе с C — между ними `pnpm verify` (e2e) не обязан быть зелёным, после INTEGRATION — обязан.

### 6.3 Известные точки конфликта при ребейзе
`sessions.service.ts` (A: 2 строки → B заменяет); `rebellion-server-module.ts` и ожидания `status/settings` в Rebellion-api-тестах
(B: конформность → C задаёт финал); `migration-swr004.int.test.ts` (A — колонки, C — формы view). Разрешает ребейзящий worker, проверяет backend-lead.

### 6.4 INTEGRATION (backend-lead)
`pnpm verify` → `artifacts/logs/integration-verify.log`; dev-копия на итоговом коде → `integration-dev-db-copy.log`;
перед первым `pnpm dev` после SWR-004 (он применяет миграцию к **оригиналу** `dev.db` через `db:prepare`) — человеку сделать
копию `apps/api/prisma/dev.pre-swr004.db` (обратимо только восстановлением копии: v2-данные старый код не читает).

---

## 7. Риски и проверки

| Риск | Мера / проверка |
|---|---|
| Утечка скрытой информации через handoff (тело, events, ошибки, кеш) | strict `HandoffViewSchema`; `toPlayerEvents → []`; глубокий поиск id сценария в JSON (TC-I-25/26); property-тест цикла hot-seat; 4xx `details` только из запроса; FE сбрасывает сторы (их план §5.3) |
| Утечка через `settings`/`details`/логи | strict-схемы; Q-24 — settings публичны; логи без тела/state (существующий TC-ARCH-11) |
| Гонка идемпотентности → 500 или две сессии | unique-индекс + `IDEMPOTENCY_KEY_TAKEN`; TC-I-20 ×5 + детерминированная гонка через spy |
| Миграция теряет данные / дрейф Prisma | только `ADD COLUMN`; TC-M-01 (count до/после, integrity); drift-check `--exit-code`; копия dev-БД, sha256 оригинала |
| Апкастер «тихо» портит данные | замороженные v1-схемы, `parse` на входе и выходе, throw на неизвестном; золотые снимки; идемпотентность апкаста |
| Две копии settings (`Session.setup` и `state.settings`) разойдутся | обе пишутся один раз при создании одним кодом; инвариант-тест в `server-module.test.ts` |
| Ленивый апкаст: строки остаются v1 до записи; `SessionEvent.actor` = `'rebellion'` в старых строках | задокументировано (Q-16); зеркало никто не читает (grep `sessionEvent.find*` — только `createMany`); `upcastEvent` экспортирован |
| Смена wire ломает FE/e2e между merge'ами | R0 сохраняет wire; переход — C + FE-1 одним шагом INTEGRATION |
| Обрыв доверия hot-seat | без аутентификации подтверждение «Я — Империя» доверительное — фиксируется в delivery-report (spec) |

---

## 8. Не делаем
Полные правила, AI Commander/OpenAI, RotE и physical-режим (только 422), изменение статуса сессии в процессе игры,
переписывание JSON старых строк SQL-ом, новые маршруты, новые зависимости.

---

## 9. Proposed amendments (требуют согласия Analyst; многие уже закрыты Q-n)

| # | Поправка | Статус |
|---|---|---|
| AM-BE-1 | Handoff-view = `{kind, id, version, activeSide, round, phase, sessionStatus}` | `version` — Q-12; `id` — AM-FE-1, предлагается |
| AM-BE-2 | Player-view несёт `settings` (вместо `setup`) + `viewer`, `activeSide` | Q-11 убирает `setup`; `settings` во view — AM-FE-8, Q-24 (не секрет); предлагается |
| AM-BE-3 | `ServerGameModule` += `parseStoredSetup`, `initialStatus`, `publicSettings`, `toPlayerView(state, {status})`; `SetupParseResult` с `kind` | уточнение spec «publicSettings(setup)»; `sessionStatus` в handoff берётся из колонки |
| AM-BE-4 | Колонка `Session.idempotencyHash` | следует из Q-2 |
| AM-BE-5 | `typeKey` `*.rebellion.*` → `*.rebels.*` (i18n `gameData.json` соответственно) | решение D-2 |
| AM-BE-6 | Ключи ошибок игры: `notYourTurn`, `handoffPending` (не-ACCEPT при handoff), `handoffNotAvailable` (AI-партия; ACCEPT без ожидания), `rulesetUnavailable`, `modeUnavailable`; wire `errors.<name>` | Q-10/Q-11, AM-FE-5; `handoffPending` — новое |
| AM-BE-7 | Канонизация тела для хеша — только порядок ключей; `aiDifficulty` опущен ≠ `'normal'` ≠ `null` | трактовка Q-2 для TC-I-17 |
| AM-BE-8 | 422 `SETUP_UNSUPPORTED`: `details = { unsupported: ('ruleset'|'gameMode')[] }` | Q-8 |

---

## 10. Сверка с `plan-frontend.md` (прочитан 2026-11-08)

| FE ожидает | Backend | Итог |
|---|---|---|
| FE-0 после BE-R0 | FE-0 **поглощён R0** (тот же список файлов, одним исполнителем, иначе web не компилируется между шагами); FE-lead ревьюит web-дифф | расхождение снято: FE-0 = часть R0 |
| AM-FE-1 handoff `id`+`version` | да (AM-BE-1) | ✓ |
| AM-FE-2 details без `null` | **Q-20 разрешил `null`** (платформа B) → `aiDifficulty: null` для human | FE должен принять `null` — сообщить FE-lead |
| AM-FE-3 `status` в envelope | `SessionResponse.status` | ✓ |
| AM-FE-4 повтор тем же ключом с тем же телом | хеш тела совпадёт → 200 replay | ✓ |
| AM-FE-5 `errors.<name>` | да | ✓ |
| AM-FE-6 `REBELLION_SETUP_DEFAULTS`, `SUPPORTED_RULESETS`/`SUPPORTED_GAME_MODES` | экспорт из `./schema` (C) | ✓ |
| AM-FE-7 `END_TURN` в `legalActions` | да, только human-партия, активная сторона | ✓ |
| AM-FE-8 player-view `viewer`+`settings` | да (AM-BE-2) | ✓ |
| Реестр `factions`/эмблемы в `./assets` | владелец — FE Worker B (визуальные данные); C не трогает `./assets` | ✓ |
| `errors.json` (+`handoffPending`, если введёт backend) | вводится; плюс `handoffNotAvailable` (Q-10) и прежний `notYourSide` | FE добавить 2 ключа |
| Ответ 201 и 200 одинаково | 200 + `Idempotent-Replay: true` | ✓ |

## 11. Open questions
1. **QA (TC-A-04):** grep `['"]rebellion['"]` находит `REBELLION_I18N_PREFIX = 'rebellion'` (i18n-namespace, не фракция) — добавить в исключения.
2. **Analyst:** подтвердить AM-BE-1 (`id` в handoff), AM-BE-2 (`settings` в player-view), AM-BE-6 (`handoffPending`), AM-BE-7.
3. **Человек/PO:** копия `dev.pre-swr004.db` перед первым `pnpm dev` после SWR-004 (§6.4) — делает человек или интегратор с его согласия.
