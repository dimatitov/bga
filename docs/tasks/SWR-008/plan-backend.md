# Plan (backend + platform + game-core) — SWR-008 Rules Integration & Game Integrity

Backend Lead, TECH_PLANNING, 2026-11-20. Входы: `request.md` (PO-1, PO-2), `specification.md` (AC-1..AC-16, R-1..R-3,
A-1..A-7, QD-1..QD-12), `test-cases.md` (153 TC, раздел «Open for plan»), SWR-005C review F-7, SWR-006 plan/delivery,
SWR-007 (Prisma 7: всегда `new PrismaClient({ adapter: createSqliteAdapter(url) })`).
Фронтенд (dev-панель диагностики, локали) — план frontend-lead; здесь — только wire-контракт для него (§6).

Решения ниже **заморожены**: воркер, которому нужно отступить от сигнатуры/имени, останавливается и пишет лиду.

## 0. Что проверено по коду (факты, на которые опирается план)

| Факт | Где | Следствие |
|---|---|---|
| `buildRulesContext` не исключает `needs-review` (только помечает `(unverified)`), `include` не обходит `ai:'none'`, 13 `ai:'core'`, все 14 `implementation-note` — `ai:'none'` | `packages/platform/src/rules-kb/context.ts`, `knowledge/entries/implementation-notes.json` | нужно backward-compatible расширение опций (§3.2) и решение F-7 (§3.3) |
| KB в рантайме не загружается нигде; `@bga/platform/rules-kb` без `node:*` | `rules-kb/index.ts`, `test/knowledge/load-kb.ts` | загрузчик с диска — в `apps/api` (§2.6) |
| Набор типов legal actions core-v1: без активации `ACTIVATE_SYSTEM`(если есть лидер в пуле)+`PASS`; в своей активации `MOVE_PIECES` **по одному на соседнюю систему с подвижными своими юнитами** + `FINISH_ACTIVATION` | `src/rules/core/legal.ts:4-8,25-70` | наличие `MOVE_PIECES` у AI-Повстанцев зависит от юнитов на скрытой базе (C3) → по QD-7 типы кандидатов **нельзя** брать во вход отбора (§9) |
| `activation`, `passed`, `rebelBase.revealed`, `phase` есть в виде **обеих** сторон | `src/schema/view.ts:203-215` | публичный вход отбора выводится из них (§3.1, C-4) |
| `src/ai` не импортирует `@bga/platform` (TC-AI-14), точка решения структурно равна `AutomationDecisionPoint` | `src/ai/types.ts:66-81` | `rulesQuery` добавляется в `BotDecisionPoint` структурно (§2.3) |
| Раскрытие: только в `applyFinishActivation` (`revealsBaseNow`: Империя, активированная система = база, наземный юнит Империи); победа Империи — в `applyMove` и после раскрытия; `handOver` — до/после в turn-flow | `turn-flow.ts:34-48`, `victory.ts`, `movement.ts:91-111` | централизация в `runStateChecks` (§7) с сохранением порядка событий и `activeSide` (golden) |
| Валидатор KB требует у `implementation-note` хотя бы один `discrepancyIds`; `partial/deviation` — хотя бы один DISC; coverage проверяет символ/имя теста через io | `rules-kb/validate.ts:221,283-310` | правка `coverage.json` вместе с переименованием символов (§7.6) |
| `KbDecisionSchema` уже содержит `'fixed'` | `rules-kb/schema.ts` | `<closed>` = `fixed`, формат KB не меняется |
| Тест `discrepancies.test.ts` требует `latent-gap` с `rebellion:base.reveal-condition` | `test/knowledge/discrepancies.test.ts:46` | `kind` DISC-009 остаётся `latent-gap`, меняются `decision`/тексты |
| `AutomationRunSummarySchema` — «aggregates only (no candidates, prompts, … budget sums)» | `packages/platform/src/automation.ts` | диагностику **не** добавляем в summary; отдельный dev-эндпоинт (§6) |
| `migration.int.test.ts:99` проверяет полный список миграций | `apps/api/test/migration.int.test.ts` | правится вместе с новой миграцией (W6a) |
| `apps/web/src/platform/automation/automation.test.tsx:152` перебирает `AutomationFallbackCodeSchema.options` | web | новый код `AI_PROMPT_TOO_LARGE` требует локалей в web (frontend-lead) |
| Ни один id KB, допускаемый в AI-контекст, не содержит id системы; содержат только `rebellion:map.mustafar-utapau`, `rebellion:setup.coruscant-placement` — оба `ai:'none'` + `needs-review` | скрипт сравнения id карты и id KB (dry run) | охранный тест в W3 (§9) |

### 0.1 Dry run отбора (команды — в отчёте лида; не коммитились)

Скрипт в scratchpad: `node dryrun.cjs` / `node dry2.cjs` поверх собранного `packages/platform/dist/rules-kb` и JSON KB; для
предлагаемого алгоритма в KB добавлялась запись engine-scope (§3.3) с текстом из §3.3, `needs-review` исключались, вход —
публичный (§3.1), лимит 6000.

| Сторона | Состояние | Теги | Записей | Символов | Усечение |
|---|---|---|---|---|---|
| empire | без активации (`ACTIVATE_SYSTEM`,`PASS`) | `base-hidden` | 18 | 5347 | нет |
| empire | без активации | `base-hidden`,`opponent-passed` | 19 | 5491 | нет |
| empire | своя активация (`FINISH_ACTIVATION`,`MOVE_PIECES`) | `base-hidden` | 20 | 5775 | нет |
| empire | своя активация | `base-hidden`,`opponent-passed` | 21 | 5919 | нет |
| empire | своя активация | `base-revealed`,`opponent-passed` | 20 | 5620 | нет |
| rebels | без активации | `base-hidden` | 18 | 5347 | нет |
| rebels | своя активация | `base-hidden`,`opponent-passed` | 20 | 5670 | нет |

Замер сделан с тегом `base-hidden → {death-star-does-not-reveal, secret-location}`; запись `secret-location` из итоговой
таблицы тегов **исключена** (§3.4) ради запаса — максимум падает примерно до ~5670 символов (≈ 330 запаса до 6000).
Строка engine-scope: 454 символа (текст записи 375). Текущий `buildRulesContext` (без исключений, без engine-scope) для
полного набора 4 типов даёт 22 записи / 5934 символа — отсюда «~60 символов запаса» F-7. Ни в одном варианте не передаётся
больше 21 записи из 181. Оценка токенов блока правил ≈ `ceil(chars/4)` ≈ 1.3–1.5 тыс.; верхняя оценка для резерва бюджета
растёт на ≈ 6.2 тыс. «токенов» (байты блока + инструкция). Точные числа после финального текста записей фиксирует тест W3
(`rules-provider.test.ts`, лог-строка), не этот план.

## 1. Зоны и границы

```text
packages/games/rebellion/knowledge/*.json  ──(apps/api: node:fs loader, один раз на старте)──┐
packages/platform/src/rules-context.ts      контракт: RulesSelectionInput / RulesContextResult │
                                            RulesContextProvider / GameRulesSupport            │
packages/platform/src/rules-kb/provider.ts  createKnowledgeBaseRulesProvider (parse+validate,  │
                                            sha256, pinned/tags, R-2) — чистый TS               │
packages/games/rebellion/src/server/rules-context.ts  rebellionRules: dir + pinned + tag table ◄┘
packages/games/rebellion/src/ai/rules-query.ts        rulesQuery из ПУБЛИЧНЫХ полей вида (QD-7)
apps/api/src/rules-context/**               RulesContextRegistry (gameId → provider), fail fast
apps/api/src/sessions/automation/**         runner → strategy: point → rulesSelectionInputOf → provider.selectRules
                                            → buildCommanderContext + fitCommanderPrompt → AiDecisionService
apps/api/src/ai/**                          prompt (блок правил), prompt-fit, AiUsage (+колонки правил), cost-by-rules
apps/api/src/dev/ai/**                      GET /api/dev/ai/sessions/:sessionId/decisions (dev only)
apps/api/src/bench/**                       benchmark harness + CLI (game-agnostic; сценарии — JSON игры)
packages/games/rebellion/src/rules/core/state-checks.ts   DISC-009: runStateChecks — единственная точка раскрытия
```

Правила границ (проверяются архитектурным тестом, W5): `apps/api/src/{ai,sessions,rules-context,bench}/**` не импортируют
`@bga/game-*` и не содержат `GAME_TERMS`; `packages/platform/src/**` не знает Rebellion; модуль Rules Context не импортирует
`rules/core/*`, не вызывает `applyCommand`, не создаёт команд (TC-ARB-07); полный state в отбор не передаётся (тип).

## 2. Замороженные контракты

### C-1. `packages/platform/src/rules-context.ts` (новый; экспорт из `@bga/platform`) — аддитивно

```ts
import { z } from 'zod';
import type { AutomationDecisionPoint } from './automation';

export const RULES_CONTEXT_LIMITS = {
  maxCharsMin: 1000,
  maxCharsMax: 12_000,
  maxCharsDefault: 6000,
  ruleIdMax: 128,
  maxRuleIds: 64,
  commandTypesMax: 16,
  tagsMax: 8,
} as const;

/** Decision tag: lowercase kebab, ≤ 32 chars. */
export const RULES_TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** `<gameId>@<formatVersion>:<first 12 hex of sha256(canonical JSON of the entries)>` (QD-5). */
export const RULES_VERSION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*@\d+:[0-9a-f]{12}$/;

/**
 * Input of a rules selection (R-1, QD-7). Built ONLY by `rulesSelectionInputOf` from a validated decision point:
 * every field is information public to both sides. No state, no candidates, no session ids (type-level guarantee).
 */
export const RulesSelectionInputSchema = z.strictObject({
  actor: /* text(AUTOMATION_LIMITS.actorMax) */,
  phase: /* text(AUTOMATION_LIMITS.phaseMax) */,
  /** Sorted, unique (checked); from `point.rulesQuery.commandTypes` only. */
  commandTypes: z.array(/* text(typeMax) */).max(RULES_CONTEXT_LIMITS.commandTypesMax),
  /** Sorted, unique (checked); from `point.rulesQuery.tags` only. */
  tags: z.array(z.string().regex(RULES_TAG_PATTERN)).max(RULES_CONTEXT_LIMITS.tagsMax),
  maxChars: z.int().min(1).max(RULES_CONTEXT_LIMITS.maxCharsMax),
}); // + superRefine: commandTypes / tags sorted ascending and unique
export type RulesSelectionInput = z.infer<typeof RulesSelectionInputSchema>;

export const RulesContextResultSchema = z.strictObject({
  /** One line per rule: `[<id>] <title>: <text> (RR p.9)`; '' when nothing was selected. No control chars except \n. */
  text: z.string().max(RULES_CONTEXT_LIMITS.maxCharsMax),
  /** Ids in line order, unique, each ≤ ruleIdMax. */
  ruleIds: z.array(z.string().min(1).max(RULES_CONTEXT_LIMITS.ruleIdMax)).max(RULES_CONTEXT_LIMITS.maxRuleIds),
  truncated: z.boolean(),
  rulesVersion: z.string().regex(RULES_VERSION_PATTERN),
}); // + superRefine: text==='' ⇔ ruleIds.length===0; lines.length===ruleIds.length; line i starts with `[${ruleIds[i]}] `
export type RulesContextResult = z.infer<typeof RulesContextResultSchema>;

/** One game's rules selection (built once at server start). Pure and deterministic; never sees a game state. */
export interface RulesContextProvider {
  readonly rulesVersion: string;
  /** Length of the pinned (mandatory) lines joined by '\n' — the smallest usable `maxChars` (QD-3). */
  readonly requiredChars: number;
  /** @throws RangeError when `input.maxChars < requiredChars`; ZodError for an invalid input (program error). */
  selectRules(input: RulesSelectionInput): RulesContextResult;
}

/** Raw knowledge base files as read from disk (already JSON.parse'd). Same shape as `KnowledgeBaseInput` of rules-kb. */
export interface KnowledgeBaseSource {
  manifest: unknown;
  /** All `entries/*.json` arrays concatenated in sorted file-name order. */
  entries: unknown;
  coverage?: unknown;
  discrepancies?: unknown;
}

/** Optional rules support of a game (`ServerGameModule.rules`). A game without it gets no rules block. */
export interface GameRulesSupport {
  /** Directory with manifest.json + entries/*.json: repository-relative POSIX path or absolute (tests). */
  readonly knowledgeBaseDir: string;
  /** Parses + validates (fail fast: throws) and returns the provider. Called once per server start. */
  createRulesContextProvider(source: KnowledgeBaseSource): RulesContextProvider;
}

/** The ONLY way to build a selection input (R-1, QD-7): actor, phase, rulesQuery; candidates are never read. */
export function rulesSelectionInputOf(point: AutomationDecisionPoint, maxChars: number): RulesSelectionInput;
// absent point.rulesQuery → commandTypes: [], tags: [] (safe default: phase + side only)
```

### C-2. `ServerGameModule` (`packages/platform/src/server-game-module.ts`) — аддитивно

```ts
/** SWR-008: optional rules knowledge of the game (AI rules context). Absent → no rules block, nothing loaded. */
readonly rules?: GameRulesSupport;
```

### C-3. `packages/platform/src/automation.ts` — аддитивно (оба изменения optional / новое значение enum)

```ts
/**
 * SWR-008 (QD-7): what the rules selection may use. MUST be derived only from information public to BOTH sides
 * (never from candidates or the actor's private state). Unknown → omit (selection then uses phase + side only).
 */
export const AutomationRulesQuerySchema = z.strictObject({
  commandTypes: z.array(text(AUTOMATION_LIMITS.typeMax)).max(16),
  tags: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/)).max(8),
}); // + superRefine: unique values in each array
export type AutomationRulesQuery = z.infer<typeof AutomationRulesQuerySchema>;

// AutomationDecisionPointSchema: + `rulesQuery: AutomationRulesQuerySchema.optional()` (inside the strictObject)

// AutomationFallbackCodeSchema: + 'AI_PROMPT_TOO_LARGE' (appended LAST; order of existing values unchanged)
```

### C-4. Rebellion: `rulesQuery` (`packages/games/rebellion/src/ai/rules-query.ts`, новый)

```ts
export interface BotRulesQuery { commandTypes: string[]; tags: string[] }   // structurally AutomationRulesQuery
export const REBELLION_RULE_TAGS = ['base-hidden', 'base-revealed', 'opponent-passed'] as const;
/** Pure; reads ONLY view.activation (null or not), view.rebelBase.revealed, view.passed[opponent]. */
export function rulesQueryFor(view: CorePlayerView): BotRulesQuery;
```

| Публичное поле вида | `commandTypes` / `tags` |
|---|---|
| `view.activation === null` | `['ACTIVATE_SYSTEM', 'PASS']` |
| `view.activation !== null` (своя активация; AI ходит только в свой ход) | `['FINISH_ACTIVATION', 'MOVE_PIECES']` (всегда оба, даже если `MOVE_PIECES` сейчас нет — QD-7) |
| `view.rebelBase.revealed` | `'base-revealed'`, иначе `'base-hidden'` |
| `view.passed[opponentOf(view.viewer)]` | `+ 'opponent-passed'` |

`tags` отсортированы. `BotDecisionPoint` получает поле `rulesQuery: BotRulesQuery` (всегда; для legacy `auto-pass-v1` тоже).
Кандидаты, `fallbackCandidateId`, `situation`, `summary` — без изменений (TC-ARB-06).

### C-5. `@bga/platform/rules-kb` — backward-compatible расширение + провайдер

```ts
// context.ts — RulesContextOptions (существующие поля и поведение по умолчанию НЕ меняются)
/** SWR-008: entries with these statuses never enter the context, even via `include` (QD-4). Default: []. */
excludeStatuses?: readonly KbEntryStatus[];
/** SWR-008: the LAST group (decision tags, R-2 step 5): these ids, `id asc`, same ai/side/status filters. Default: []. */
tagRuleIds?: readonly string[];
// group order: include → core → commands → phase → tagRuleIds; whole lines only; text.length ≤ maxChars

// provider.ts (новый)
export interface KnowledgeBaseRulesOptions {
  /** First lines of every context, in this order (engine scope, F-7). Each: exists, status 'verified', ai !== 'none'. */
  pinnedRuleIds: readonly string[];
  /** Tag → entry ids (R-2 step 5). Keys match RULES_TAG_PATTERN; ids must exist. Unknown input tags are ignored. */
  tagRules?: Readonly<Record<string, readonly string[]>>;
}
export class KnowledgeBaseValidationError extends Error { readonly issues: readonly KbIssue[] }   // validateKnowledgeBase(kb) without io: ok === false
export class KnowledgeBaseConfigError extends Error { readonly problems: readonly string[] }    // bad pinned / tag ids
export function createKnowledgeBaseRulesProvider(
  source: KnowledgeBaseInput,
  options: KnowledgeBaseRulesOptions,
): RulesContextProvider;   // throws KnowledgeBaseParseError | KnowledgeBaseValidationError | KnowledgeBaseConfigError
export function knowledgeBaseRulesVersion(kb: KnowledgeBase): string;   // QD-5
export function canonicalJson(value: unknown): string;                    // keys sorted recursively, arrays in order, no spaces
export function sha256Hex(text: string): string;                          // pure TS SHA-256 over UTF-8 (no node:*)
```

`knowledgeBaseRulesVersion(kb)` = `` `${kb.manifest.gameId}@${kb.manifest.formatVersion}:${sha256Hex(canonicalJson(sortedEntries)).slice(0, 12)}` ``,
где `sortedEntries` — `kb.entries` (выход парсера, с применёнными default) отсортированные по `id` (`compareStrings`). Не
зависит от порядка файлов и записей (TC-CT-03), меняется при правке любого поля любой записи (TC-CT-04). `coverage`/
`discrepancies` в версию не входят (не попадают в AI).

`selectRules(input)`: `RulesSelectionInputSchema.parse(input)` → `maxChars < requiredChars` ⇒ `RangeError` →
`tagRuleIds = union(tagRules[t] for t of input.tags)` → `buildRulesContext(kb, { phase, commandTypes, side: actor,
include: pinnedRuleIds, excludeStatuses: ['needs-review'], tagRuleIds, maxChars })` → `{ ...ctx, rulesVersion }`.
`requiredChars` = длина `formatContextLine` закреплённых строк, соединённых `\n`.

### C-6. Rebellion rules support (`packages/games/rebellion/src/server/rules-context.ts`, новый)

```ts
export const REBELLION_KNOWLEDGE_BASE_DIR = 'packages/games/rebellion/knowledge';
export const REBELLION_ENGINE_SCOPE_RULE_ID = 'rebellion:impl.engine-scope';
export const REBELLION_TAG_RULES: Readonly<Record<string, readonly string[]>> = {
  'base-hidden': ['rebellion:base.death-star-does-not-reveal'],
  'base-revealed': ['rebellion:base.reveal-procedure'],
  'opponent-passed': ['rebellion:command.pass-is-not-action'],
};
export const rebellionRules: GameRulesSupport = {
  knowledgeBaseDir: REBELLION_KNOWLEDGE_BASE_DIR,
  createRulesContextProvider: (source) =>
    createKnowledgeBaseRulesProvider(source, {
      pinnedRuleIds: [REBELLION_ENGINE_SCOPE_RULE_ID],
      tagRules: REBELLION_TAG_RULES,
    }),
};
// createRebellionServerModule: + `rules: rebellionRules`
```

### C-7. API config (`apps/api/src/config/env.ts`) — аддитивно

| Переменная | Значения | Default | Поле |
|---|---|---|---|
| `AI_COMMANDER_RULES_CONTEXT` | `on` \| `off` (case-sensitive) | `on` (A-4) | `aiCommander.rulesContext` |
| `AI_COMMANDER_RULES_MAX_CHARS` | int 1000..12000 | 6000 | `aiCommander.rulesMaxChars` |
| `AI_COMMANDER_MAX_PROMPT_TOKENS` | int 4000..64000, **единица — верхняя оценка входных токенов** (`upperBoundInputTokens`: UTF-8 байты instructions+input+schema + 256) | 16000 | `aiCommander.maxPromptTokens` |

```ts
export interface AiCommanderConfig {
  ...; readonly rulesContext: 'on' | 'off'; readonly rulesMaxChars: number; readonly maxPromptTokens: number;
}
export interface AppConfig {
  ...;
  /** Absolute repository root for repository-relative `GameRulesSupport.knowledgeBaseDir`. NOT from the environment:
   *  `parseEnv` returns null; `main.ts` sets `join(__dirname, '..', '..', '..')`; tests set the repo root. */
  readonly knowledgeBaseRoot: string | null;
}
```

Все три переменные проверяются всегда (как `AI_COMMANDER_*` SWR-006), причины ошибок — фиксированные строки, без значений;
`.env.example` дополняется (комментарий + default). Default 16000 выбран так, чтобы худший SWR-006 промпт (situation 4000,
10 кандидатов по 160 символов summary) + блок правил 6000 проходили целиком; это утверждение — unit-тест W6a
(`prompt-fit.unit.test.ts`, «worst case fits the default»).

### C-8. API: реестр правил (`apps/api/src/rules-context/`, новый)

```ts
// knowledge-base.loader.ts
export type KnowledgeBaseLoader = (absoluteDir: string) => KnowledgeBaseSource;
/** node:fs: manifest.json (required), entries/*.json (required dir, sorted names), coverage.json / discrepancies.json (optional). */
export const readKnowledgeBaseDir: KnowledgeBaseLoader;
export class KnowledgeBaseLoadError extends Error {}   // message: `rules knowledge base <dir-relative>: <file>: <fixed reason>` — no file content

// rules-context.registry.ts
export class RulesContextRegistry {
  forGame(gameId: string): RulesContextProvider | null;
  /** Game ids whose provider was built (diagnostics/tests). */
  readonly gameIds: readonly string[];
}
export interface RulesContextRegistryInput {
  config: AppConfig;
  modules: readonly ServerGameModule[];
  loader?: KnowledgeBaseLoader;               // default readKnowledgeBaseDir (TR-1)
}
/** Synchronous, fail fast (throws → createApp rejects, the server does not start). */
export function createRulesContextRegistry(input: RulesContextRegistryInput): RulesContextRegistry;

// rules-context.module.ts — RulesContextModule.forRoot(input) : global, provider RULES_CONTEXT_REGISTRY (useValue, built eagerly)
// rules-context.tokens.ts — export const RULES_CONTEXT_REGISTRY = Symbol('RULES_CONTEXT_REGISTRY');
```

Правила: KB загружается **iff** `aiCommander.provider === 'openai' && aiCommander.rulesContext === 'on'` (иначе пустой
реестр, ни одного чтения диска — TC-INT-10, bot-тесты не платят за парсинг). Для каждого модуля с `rules`: каталог =
`isAbsolute(dir) ? dir : join(knowledgeBaseRoot, dir)`; `knowledgeBaseRoot === null` → throw; `provider =
module.rules.createRulesContextProvider(loader(dir))`; `config.aiCommander.rulesMaxChars < provider.requiredChars` → throw
(QD-3). Ошибка оборачивается в `Error('rules knowledge base of game <id>: <ErrorName>: <message>')` (message парсера
содержит пути/коды, не секреты). Загрузка ровно один раз (`TC-INT-04`: шпион через `loader`).

Тестовый override: `CreateAppOptions.rules?: { loader?: KnowledgeBaseLoader }` (+ `AppModuleOptions.rules`); с
`nodeEnv: 'production'` → `ProductionOverridesError` (как `ai`/`automation`).

### C-9. AI layer (`apps/api/src/ai/`)

```ts
// ai.types.ts — AIDecisionContext (+2 optional, commander only)
/** Sent to the model (commander only). Absent → prompt byte-identical to SWR-006. */
readonly rules?: AIRulesBlock;
/** Never sent; written to AiUsage (AC-12). Absent → "rules off" columns. */
readonly rulesAccounting?: AIRulesAccounting;

export interface AIRulesBlock { readonly text: string; readonly ruleIds: readonly string[]; readonly rulesVersion: string; readonly truncated: boolean }
export interface AIRulesAccounting {
  readonly enabled: boolean;              // AI_COMMANDER_RULES_CONTEXT=on
  readonly rulesVersion: string | null;   // null: off or the game has no rules
  readonly ruleIds: readonly string[];    // what was SENT ([] when dropped / empty / off)
  readonly chars: number;                 // rules text length sent
  readonly truncated: boolean;            // selector cut by maxChars OR reduced by the prompt limit
  readonly dropped: boolean;              // removed entirely by the prompt-size limit (QD-9)
}

// prompt.ts
export const COMMANDER_RULES_INSTRUCTIONS: string;   // frozen text §4.1
export function rulesTokensEstimate(chars: number): number;   // Math.ceil(chars / 4)

// prompt-fit.ts (новый, чистый)
export type PromptFitLevel = 'none' | 'full' | 'reduced' | 'dropped';
export type PromptFit =
  | { ok: true; ctx: AIDecisionContext; level: PromptFitLevel; upperBoundTokens: number }
  | { ok: false; upperBoundTokens: number };   // even without rules > limit → AI_PROMPT_TOO_LARGE
export interface PromptFitRules {
  result: RulesContextResult;                       // selection with config maxChars
  requiredChars: number;
  reselect(maxChars: number): RulesContextResult;   // same input, smaller maxChars
}
export function fitCommanderPrompt(input: {
  base: AIDecisionContext;          // purpose 'commander', WITHOUT rules / rulesAccounting
  enabled: boolean;                 // config rulesContext === 'on'
  rules: PromptFitRules | null;     // null: no provider for the game / selection failed
  maxPromptTokens: number;
}): PromptFit;   // fills ctx.rules (when sent) and ctx.rulesAccounting (always)

// ai-usage.repository.ts
listByBudgetKey(budgetKey: string, limit: number): Promise<AiUsageRecord[]>;   // createdAt asc of the LAST `limit` rows

// cost-by-rules.ts (новый, чистый) — <cost-by-rules>
export interface RulesCostGroup { decisions: number; costMicroUsd: number; inputTokens: number; cachedInputTokens: number;
  outputTokens: number; meanCostMicroUsd: number | null; meanInputTokens: number | null; meanDurationMs: number | null }
export function summarizeCostByRules(rows: readonly Pick<AiUsageRecord, 'rulesEnabled' | 'rulesDropped' | 'rulesCount'
  | 'estimatedCostMicroUsd' | 'inputTokens' | 'cachedInputTokens' | 'outputTokens' | 'durationMs' | 'provider'>[]):
  { withRules: RulesCostGroup; withoutRules: RulesCostGroup; total: RulesCostGroup };
// withRules := rulesEnabled && !rulesDropped && rulesCount > 0; withoutRules := the rest; mean of 0 rows → null (TC-COST-03)
```

### C-10. Strategy / runner (`apps/api/src/sessions/automation/`)

```ts
// commander-strategy.ts — CommanderRunContext (+1)
/** Rules provider of the session's game, or null (no rules / rules off). Never sent to a model. */
rules: RulesContextProvider | null;

// commander-context.ts (новый, чистый; используется стратегией и benchmark)
export interface CommanderRulesConfig { enabled: boolean; maxChars: number; maxPromptTokens: number }
export function buildCommanderContext(
  point: AutomationDecisionPoint,
  opts: { budgetKey: string; modelRole: AIModelRole; rules: RulesContextProvider | null; config: CommanderRulesConfig },
): PromptFit;
// = contextOf(point) of SWR-006 (unchanged fields) → selection (try/catch: exception → rules null) → fitCommanderPrompt

// OpenAiCommanderDeps (+1): rules: CommanderRulesConfig
// runner: startRun({ sessionId, deadline, rules: rulesRegistry.forGame(t.gameId) })  — RULES_CONTEXT_REGISTRY injected
```

`fit.ok === false` → `botChoice(point, 'AI_PROMPT_TOO_LARGE')`, `decide` не вызывается (0 запросов, 0 резервов, без
строки `AiUsage`); этот код **не** останавливает запуск (следующий шаг пробует снова; размер зависит от точки).

## 3. Отбор правил (R-2)

### 3.1 Вход (R-1 + QD-7)

`RulesSelectionInput = rulesSelectionInputOf(point, config.rulesMaxChars)`: `actor`, `phase` из точки, `commandTypes`/
`tags` — **только** из `point.rulesQuery` (sorted unique). `point.candidates`, `situation`, `objective`,
`fallbackCandidateId` не читаются. Для Rebellion `rulesQuery` строится по таблице C-4 из публичных полей вида, поэтому
одинаков для двух состояний, различающихся чем угодно, кроме публичного состояния (TC-H-02/06/07). Это сознательно
заменяет «типы кандидатов» из ранних формулировок AC-4/TC-INT-02: вход = публичный набор типов для состояния активации
(QD-7). QA: в TC-INT-02 `input` берётся из `DP(s).rulesQuery`.

### 3.2 Алгоритм (детерминированный, без сети и LLM)

1. **pinned** (engine scope, `include` в заданном порядке);
2. **core**: `ai:'core'`, `id asc`;
3. **commands**: `appliesTo.commands ∩ commandTypes ≠ ∅`, `id asc`;
4. **phase**: `appliesTo.phases ∋ phase`, `id asc`;
5. **tags**: `∪ tagRules[tag]`, `id asc`.

Фильтры для всех групп: `ai !== 'none'`; `status ∉ excludeStatuses` (`['needs-review']`, и для `include` — QD-4);
`appliesTo.sides` содержит `actor` (кроме `include`, как сейчас). Дубли — первое вхождение. Обрезка: строки добавляются,
пока следующая помещается в `maxChars`; дальше `truncated = true` (целыми строками, префикс полного списка — TC-SEL-07/08).
Закреплённые строки всегда помещаются, т.к. `maxChars ≥ requiredChars` (иначе `RangeError`; конфиг < required → старт
падает). Лимита по числу записей нет (`<max-rules>` = нет; фактически ≤ 21, `RULES_CONTEXT_LIMITS.maxRuleIds = 64` —
предохранитель схемы результата).

### 3.3 F-7 / engine scope (`<engine-scope id>` = `rebellion:impl.engine-scope`)

Решение: `include` по-прежнему **не** обходит `ai:'none'` (F-7 вариант «bypass» отвергнут — смешивает «не для AI» и
«обязательно»). Добавляется **одна новая** запись `implementation-note`, `status: 'verified'`, `ai: 'core'`, закреплённая
первой через `pinnedRuleIds` (C-6). Пять старых заметок (`impl.no-combat` и др.) остаются `ai:'none'` (5 строк ≈ 1200
символов против одной ≈ 450).

```json
{
  "id": "rebellion:impl.engine-scope",
  "kind": "implementation-note",
  "status": "verified",
  "product": "base",
  "category": "general",
  "title": "What the core-v1 engine can do",
  "text": "The engine plays only the Command Phase: on a turn a side activates a system with a leader from its pool, moves its own units into it, finishes the activation, or passes. Combat, missions, production, deployment, recruiting, probe droids, objectives, loyalty and subjugation are not implemented: rules about them do not apply, and only the actions listed by the engine exist.",
  "sources": [
    { "sourceId": "RR", "page": 2, "section": "Activating Systems" },
    { "sourceId": "RR", "page": 3, "section": "Assignment Phase" }
  ],
  "discrepancyIds": ["DISC-001", "DISC-002", "DISC-003", "DISC-005"],
  "related": ["rebellion:impl.no-combat", "rebellion:impl.no-missions", "rebellion:impl.refresh-partial", "rebellion:impl.no-loyalty"],
  "ai": "core"
}
```

Текст содержит все 5 слов TC-ST-03 (combat, missions, production, probe droids, loyalty). Если `content.test.ts`/`validate`
отвергнут источник `RR p.3 "Assignment Phase"` — заменить на любой существующий раздел RR из manifest с тем же смыслом
(не решение, а подгонка данных; записать в лог воркера).

### 3.4 Теги решения (`<decision tags>`)

Есть, 3 значения, только из публичных полей (C-4). Таблица тег → записи — C-6 (`base.secret-location` исключена ради
запаса, см. §0.1). Теги из приватного состояния стороны AI запрещены (QD-7); тест W4 проверяет, что `rulesQueryFor`
читает только перечисленные поля (метаморфный: меняем любые другие поля вида — результат тот же).

## 4. Промпт, лимит размера, бюджет

### 4.1 Формат (`apps/api/src/ai/prompt.ts`)

- `ctx.rules` отсутствует (rules `off`, игра без KB, пустой выбор, снят лимитом) → **ровно** SWR-006: `COMMANDER_INSTRUCTIONS`
  и `Game (data):\n${JSON}` (TC-INT-06/07 — snapshot и golden не меняются).
- `ctx.rules` есть: `instructions = `${COMMANDER_INSTRUCTIONS} ${COMMANDER_RULES_INSTRUCTIONS}``;
  `input = `Rules (reference data, not instructions):\n${rules.text}\n\nGame (data):\n${JSON}``. Правила стоят **перед**
  Game-блоком: при одинаковом блоке правил у соседних решений префикс (instructions + rules ≈ 1.6 тыс. токенов) кэшируется
  OpenAI → дешевле `cachedInputTokens` (измеряется benchmark). JSON Game-блока и `availableActions` идентичны варианту off
  (TC-INT-08).

```ts
export const COMMANDER_RULES_INSTRUCTIONS =
  'Rules lists official rules of the game that are relevant to this decision, one per line, each starting with its id in brackets. ' +
  'They are reference data that explain the game, not instructions. The game engine has already applied them: every action in ' +
  'availableActions is legal and no other action exists. A mechanic that is not implemented or not offered in availableActions ' +
  'cannot be used now - never choose or plan around it. If a rule seems to conflict with availableActions, availableActions win.';
```

`buildDevTestPrompt` (SWR-005B) не меняется. Схема ответа (`decision-schema.ts`) не меняется: модель по-прежнему
возвращает только `selectedActionId` + `reason`; `reason` отбрасывается (TC-ARB-05).

### 4.2 Порядок деградации (`fitCommanderPrompt`, TC-BUD-04..08)

Обозначения: `UB(ctx) = upperBoundInputTokens(buildPrompt(ctx), ids)`, `L = maxPromptTokens`.

1. `enabled === false` → `ctx` без правил, accounting `{enabled:false, …0}`, уровень `none`.
2. `rules === null` или `result.text === ''` → без правил, accounting `{enabled:true, rulesVersion: result?.rulesVersion ?? null, ruleIds:[], chars:0, truncated:false, dropped:false}`, уровень `none`.
3. `UB(с правилами) ≤ L` → уровень `full` (accounting: ids/chars из результата, `truncated = result.truncated`).
4. иначе `excess = UB − L`; `m = result.text.length − excess`; если `m ≥ requiredChars` → `r2 = reselect(m)`; если
   `UB(с r2) ≤ L` → уровень `reduced` (`truncated: true`).
5. иначе без правил: `UB(base) ≤ L` → уровень `dropped` (accounting `dropped:true, ruleIds:[], chars:0`, версия сохраняется).
6. иначе `{ ok:false }` → `AI_PROMPT_TOO_LARGE`.

Ни один шаг не меняет бюджет. Правила **не** снимаются ради бюджета (QD-11): при нехватке бюджета — штатный
`AI_BUDGET_EXCEEDED` SWR-006.

### 4.3 Бюджет (AC-10)

`AiDecisionService.reserveFor` не меняется по логике: он уже считает `upperBoundInputTokens(buildPrompt(ctx))`, а
`buildPrompt` теперь включает блок правил → резерв автоматически покрывает токены правил (TC-BUD-01). Лимит партии,
`BudgetService`, порядок шагов `decide` (pricing → availability → reserve → provider → validate → row → release) не
меняются. Добавляется только: `assertContext` для commander проверяет `rules` (если есть): `text` 1..12000 символов,
`ruleIds` 1..64 уникальных, `rulesVersion` по паттерну → иначе `VALIDATION` (программная ошибка). QD-8: после
`AI_NOT_CONFIGURED`/бюджета/квоты остаток запуска — бот без построения контекста (как SWR-006, `stopCode` до сборки).

## 5. Учёт затрат (AC-12) и миграция

Решение: **колонки `AiUsage`** (строка на каждое решение уже есть; агрегаты — SQL/`summarizeCostByRules`), а не лог.
Миграция `apps/api/prisma/migrations/20261120120000_ai_usage_rules/migration.sql` — только `ALTER TABLE "AiUsage" ADD COLUMN`
(сгенерировать `prisma migrate dev --create-only --name ai_usage_rules` с `DATABASE_URL=file:<scratchpad>/swr008-gen.db`;
**никогда** против `apps/api/prisma/dev.db`; `dev.pre-swr00*.db` не трогать):

```prisma
  /// SWR-008: rules context switched on for this request (AI_COMMANDER_RULES_CONTEXT=on, commander only).
  rulesEnabled           Boolean @default(false)
  /// Rules set version (`<gameId>@<formatVersion>:<hash12>`); null = off / the game has no rules / dev-test.
  rulesVersion           String?
  rulesCount             Int     @default(0)
  /// JSON array of the PUBLIC rule ids sent (never rule text); null when none.
  rulesIds               String?
  rulesChars             Int     @default(0)
  /// ceil(rulesChars / 4) — estimate; the real delta is measured by the benchmark.
  rulesTokensEstimate    Int     @default(0)
  rulesTruncated         Boolean @default(false)
  /// Removed by the prompt-size limit (QD-9).
  rulesDropped           Boolean @default(false)
  /// upperBoundInputTokens of the sent prompt (the reservation basis); null = before SWR-008.
  promptTokensUpperBound Int?
```

`<rulesEnabled>`=`rulesEnabled`, `<rulesCount>`=`rulesCount`, `<ruleIds>`=`rulesIds`, `<rulesChars>`=`rulesChars`,
`<rulesTokensEst>`=`rulesTokensEstimate`, `<rulesVersion>`=`rulesVersion`, `<rulesDropped>`=`rulesDropped`. Старые строки
получают default (rules off). `NewAiUsageRowSchema` расширяется (все новые поля optional с теми же default;
`rulesIds` ≤ 64 id; инвариант `rulesDropped ⇒ rulesCount = 0`, `rulesCount = len(rulesIds)`). Никакого текста промпта,
правил, `situation`, `reason` (TC-COST-04). `rowFor` заполняет поля из `ctx.rulesAccounting` (нет → rules off) и
`promptTokensUpperBound` (тот же расчёт, что в `reserveFor`; для mock-пути тоже). Тест миграции — на копии БД со
схемой SWR-005B (`20261108230000_ai_usage`) по образцу `migration-swr005b.int.test.ts`; `migration.int.test.ts:99` —
добавить имя; `reset-ai-budget` и `dev-db-upgrade` остаются зелёными.

## 6. Dev-диагностика (AC-13): контракт для frontend-lead

Транспорт: **отдельный dev-эндпоинт**, не поле `SessionResponse`/`AutomationRunSummary` (их строгие схемы не меняются, в
prod-ответах диагностики нет по построению — TC-DIAG-04).

`GET /api/dev/ai/sessions/:sessionId/decisions` — в `DevAiController` (`@Controller('dev/ai')`, `LoopbackGuard`, лимитер
`hit(false)`); модуль существует только при `nodeEnv !== 'production'` (иначе 404). `:sessionId` по `^[A-Za-z0-9-]{1,64}$`,
иначе 400 `VALIDATION`. Неизвестная сессия → 200 с пустым списком (эндпоинт не раскрывает существование сессий сверх
того, что уже знает клиент; dev only). Данные — последние 50 строк `AiUsage` с `budgetKey = sessionId`, по возрастанию
времени, + агрегаты `summarizeCostByRules` по **всем** строкам сессии.

`packages/platform/src/ai-diagnostics.ts` (новый, экспорт из `@bga/platform`):

```ts
export const AiDecisionDiagnosticSchema = z.strictObject({
  at: z.iso.datetime(),
  provider: AIProviderIdSchema,
  model: z.string().min(1).max(200),
  /** AiUsage status ('ok' | 'invalid_decision' | 'timeout' | ...); fallback = status !== 'ok'. */
  status: z.string().min(1).max(32),
  fallback: z.boolean(),
  errorCode: z.string().min(1).max(64).nullable(),
  attempts: z.int().nonnegative(),
  inputTokens: z.int().nonnegative(),
  cachedInputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  costMicroUsd: z.int().nonnegative(),
  durationMs: z.int().nonnegative(),
  rules: z.strictObject({
    enabled: z.boolean(),
    rulesVersion: z.string().max(96).nullable(),
    count: z.int().nonnegative(),
    ids: z.array(z.string().min(1).max(128)).max(64),
    chars: z.int().nonnegative(),
    tokensEstimate: z.int().nonnegative(),
    truncated: z.boolean(),
    dropped: z.boolean(),
  }),
});
export const AiCostGroupSchema = z.strictObject({
  decisions: z.int().nonnegative(), costMicroUsd: z.int().nonnegative(), inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(), meanCostMicroUsd: z.number().nonnegative().nullable(),
});
export const AiSessionDecisionsResponseSchema = z.strictObject({
  decisions: z.array(AiDecisionDiagnosticSchema).max(50),
  totals: z.strictObject({ withRules: AiCostGroupSchema, withoutRules: AiCostGroupSchema, total: AiCostGroupSchema }),
});
export type AiSessionDecisionsResponse = z.infer<typeof AiSessionDecisionsResponseSchema>;
```

Не отдаётся: `budgetKey`/`sessionId`, `reason`, текст промпта/правил, `promptTokensUpperBound`, `pricingVersion`.
Fallback без вызова модели (`AI_DEADLINE`, `AI_PROMPT_TOO_LARGE`, «бот на остаток запуска») строк не имеет — его FE
показывает из уже существующего `AutomationRunSummary.fallbackReasons`. Для FE: локали `AI_PROMPT_TOO_LARGE` в
`apps/web/src/locales/{en,ru}/sessionHost.json` обязательны (тест `automation.test.tsx:152`); dev-гейт, testids и
вызов эндпоинта — план frontend-lead.

## 7. DISC-009 (R-3, AC-8, AC-9)

### 7.1 Единственная точка (`<checkState>` = `runStateChecks`, модуль `packages/games/rebellion/src/rules/core/state-checks.ts`)

```ts
/** R-3 condition, core-v1: an Imperial GROUND unit (unitTypeRevealsRebelBase) stands in the base system.
 *  Imperial loyalty is part of the official condition but does not exist in core-v1 (DISC-005, A-2): extension point here. */
export function baseRevealConditionMet(state: CoreGameState): boolean;
/** R-3 timing: false while an Imperial activation is running (its movement step is not over; reveal waits for
 *  FINISH_ACTIVATION of ANY system, QD-1); true otherwise. */
export function revealTimingAllows(state: CoreGameState): boolean;   // state.activation?.side !== 'empire'
/**
 * THE state-check point of core-v1 (DISC-009): after every accepted command (applyCoreCommand) and at creation
 * (createCoreGame). Order: (1) outcome !== null → unchanged; (2) !revealed && timing && condition → revealBase;
 * (3) checkEmpireVictory. Idempotent: running it on its own result adds nothing.
 */
export function runStateChecks(transition: Transition): Transition;
```

### 7.2 Изменения конвейера

- `victory.ts`: удалить `revealsBaseNow`; `revealBase`, `empireCapturedBase`, `checkEmpireVictory`, `endGame` остаются;
  `revealBase` вызывается **только** из `runStateChecks` (TC-D-31).
- `movement.ts` `applyMove`: без `checkEmpireVictory` (событие `PIECES_MOVED`; победа — в `runStateChecks`, порядок
  `PIECES_MOVED → GAME_OVER` прежний).
- `turn-flow.ts`: `applyFinishActivation(state, actor, auto)` возвращает только `{activation: null}` + `ACTIVATION_FINISHED`
  (без раскрытия и без передачи хода); `handOver` экспортируется. `applyPass`/`endCommandPhase`/`applyAcceptHandoff` без
  изменений.
- `apply.ts` (после `switch`, вместо `return { ok: true, ...finalize(state, transition, ctx.now) }`):

```ts
let checked = runStateChecks(transition);
if (command.type === 'FINISH_ACTIVATION' && checked.state.outcome === null) checked = handOver(checked, actor);
return { ok: true, ...finalize(state, checked, ctx.now) };
```

- `create.ts`: построенное состояние прогоняется через `runStateChecks({ state, drafts: [] })`; drafts (в реальных данных их
  нет — eligible-базы исключают системы со стартовыми юнитами Империи и соседние) добавляются в `log` с `seq = 4…`, `at =
  ctx.now`. Журнал создания остаётся `[GAME_CREATED, PHASE_STARTED×2]` (TC-D-25).
- `index.ts`: экспорт `runStateChecks`, `baseRevealConditionMet`, `revealTimingAllows` (для тестов, TR-4; через
  `./rules` наружу не выносить — достаточно `src/rules/core/index.ts`).

### 7.3 Почему наблюдаемое поведение не меняется (A-3; проверяет TC-D-33 differential)

FINISH без раскрытия: раньше `{activation:null}` → `handOver`; теперь то же + no-op проверки. FINISH с раскрытием: раньше
reveal → victory → (handOver, если не конец); теперь то же в том же порядке, `activeSide` при победе не меняется (golden
`golden-empire-win.json` байт-в-байт). MOVE: победа проверялась тем же `checkEmpireVictory`; раскрытие во время активации
Империи отложено, а ходы Повстанцев не добавляют юнитов Империи. PASS/конец раунда/`ACCEPT_HANDOFF`: no-op на достижимых
состояниях; при `outcome` (победа по времени) — ранний выход, `BASE_REVEALED` не добавляется (TC-D-17). Новое поведение —
только для искусственных состояний **[art]**: раскрытие на `FINISH` любой системы (TC-D-27) и сразу после команды вне
активации Империи (TC-D-26) — QD-1.

### 7.4 Порядок событий, идемпотентность, скрытость

`ACTIVATION_FINISHED → BASE_REVEALED → GAME_OVER`; `BASE_REVEALED` ≤ 1 в журнале (`revealed = true` ⇒ шаг 2 не
выполняется); версия `+1` ровно один раз на команду (`finalize`). До законного раскрытия вид Империи, `legalActions` и
ошибки не зависят от базы: `redact.ts`/`legal.ts` не меняются; в середине активации Империи с наземными юнитами в базе
`revealed=false` (TC-D-34).

### 7.5 Схема состояния и сохранение (AC-9)

Схема state и `REBELLION_STATE_SCHEMA_VERSION` **не меняются**, upcast не нужен; инвариант раскрытия в Zod-схему **не**
добавляется (старые сохранения не должны начать падать при чтении). Партия, сохранённая в середине активации Империи с
наземными юнитами в базе, после рестарта раскрывает базу на `FINISH_ACTIVATION` — проверка выполняется при применении
команды, а не при загрузке (`parseState` чистый, версию не меняет).

### 7.6 База знаний (W3)

- `discrepancies.json` DISC-009: `kind: "latent-gap"` (без изменений), `decision: "fixed"` (`<closed>`),
  `engineBehaviour`: «SWR-008: one state check (`runStateChecks`) runs after every accepted core-v1 command and at game
  creation; it reveals the base once when an Imperial ground unit stands in the base system; during an Imperial activation
  the reveal waits for the end of its movement (FINISH_ACTIVATION). Imperial loyalty does not exist (DISC-005).»,
  `followUp`: «Loyalty slice: add Imperial loyalty to baseRevealConditionMet. Combat slice: keep the reveal after movement and
  before combat (activation step 3).». `title` → «Base reveal as a central state check (fixed in SWR-008; loyalty part waits
  for DISC-005)».
- `rebellion:impl.reveal-only-at-finish`: id стабилен (на него ссылаются DISC-009, генерируемые документы); `title` →
  «core-v1 reveals the base by a central state check»; `text` → «After every accepted command and at game creation core-v1
  reveals the base once if an Imperial ground unit stands in its system; during an Imperial activation the reveal waits until
  the activation's movement ends (FINISH_ACTIVATION). Imperial loyalty does not exist, so it cannot reveal the base.»;
  `discrepancyIds: ["DISC-009", "DISC-005"]`; `ai: "none"`.
- `coverage.json`: `rebellion:base.reveal-condition` — `partial` (лояльность), `discrepancyIds: ["DISC-005"]`,
  implementation `state-checks.ts:baseRevealConditionMet`, `state-checks.ts:runStateChecks`, `data.ts:unitTypeRevealsRebelBase`;
  tests — существующие имена `reveal.test.ts` + новые имена `state-checks.test.ts`; note обновить.
  `rebellion:base.reveal-timing` — `implemented`, implementation `state-checks.ts:revealTimingAllows`,
  `state-checks.ts:runStateChecks`, `apply.ts:applyCoreCommand`; tests прежние + `state-checks.test.ts`.
  `rebellion:victory.empire` — `victory.ts:empireCapturedBase`, `state-checks.ts:runStateChecks`. Остальные элементы с
  `applyFinishActivation`/`handOver` — символы сохраняются, проверить io-тестом.
- `audit-summary.md`: пункт «Скрытый пробел (DISC-009)» дополнить строкой «Исправлено в SWR-008: централизованная проверка
  `runStateChecks` …» (фраза «Ошибок реализации в рамках среза не найдено» остаётся — её требует `generated-docs.test.ts`).
- Регенерация `docs/game-rules/rebellion/{rules-index,coverage-matrix,discrepancies}.md`:
  `UPDATE_KB_DOCS=1 pnpm --filter @bga/game-rebellion exec vitest run test/knowledge/generated-docs.test.ts`.

## 8. Benchmark (AC-14, AC-15)

### 8.1 Сценарии (`<scenarios path>` = `packages/games/rebellion/benchmark/scenarios.json`)

Генерируются из TypeScript-построителей на **реальных** данных (`createCoreInitialState` + правки состояния +
`CoreGameStateV3Schema.parse`) в `packages/games/rebellion/test/benchmark/scenarios.ts`; тест
`packages/games/rebellion/test/benchmark/scenarios.test.ts` сверяет файл с построителями (регенерация:
`UPDATE_BENCH_SCENARIOS=1 pnpm --filter @bga/game-rebellion exec vitest run test/benchmark/scenarios.test.ts`), как
`generated-docs.test.ts`. Рубрика документирована в `packages/games/rebellion/benchmark/README.md`.

```ts
// формат файла (game-agnostic; читает apps/api/src/bench)
interface BenchScenarioFile { formatVersion: 1; gameId: string; scenarios: BenchScenario[] }
interface BenchScenario {
  id: string;                    // 'emp-01-hunt-adjacent' | 'reb-03-hold-revealed-base' …
  side: string;                  // actor (= pendingActor of the state)
  title: string; goal: string;   // English, what the side wants here and why
  justificationRuleIds: string[];// KB ids that justify the expected choice: exist, verified, ai !== 'none'
  sessionId: string; version: number;
  state: unknown;                // stored snapshot (module.parseState input)
  rubric: {
    expected: BenchMatcher[];    // score 1
    acceptable: BenchMatcher[];  // score 0.5
    wrong: BenchMatcher[];       // score 0; anything unmatched: 0.25
    passUnjustified: boolean;    // PASS here is "unjustified" (a goal-advancing non-PASS candidate exists)
  };
}
interface BenchMatcher { type: string; target?: string; summaryIncludes?: string }   // matched against candidates (ids are opaque)
```

Состав (TC-BEN-03): ≥ 6 Империя — охота (активировать непроверенную систему рядом с наземными силами), ввод наземных войск
в активированную систему (`ground-strike` vs `ships-only`), «корабли/Звезда Смерти не раскрывают», завершение активации
после ввода (FINISH), лидер-пин источника, захват раскрытой базы, ход при спасовавших Повстанцах (PASS необоснован);
≥ 6 Повстанцы — удержание юнита в раскрытой базе, защита базы от соседних наземных сил Империи, не выводить последние
юниты из базы, конец времени (PASS допустим), лидер-пин, FINISH без полезного движения. Ни одного сценария про
бой/миссии. Каждый matcher `expected/acceptable/wrong` обязан совпадать хотя бы с одним кандидатом `DP(state)` (тест).
Ни один сценарий за Империю не кладёт id базы в `goal`/`title`/matchers (TC-H-09).

### 8.2 Харнесс (`apps/api/src/bench/`, game-agnostic)

```ts
// types.ts — BenchScenarioFile/BenchScenario/BenchMatcher (§8.1) + Zod-схема файла
export type BenchVariant = 'bot' | 'openai-no-rules' | 'openai-rules';
export interface BenchDecision {
  scenarioId: string; variant: BenchVariant; repeat: number;
  candidateId: string; candidateType: string;
  source: 'bot' | 'model'; fallbackCode: string | null;
  valid: boolean;                       // model answer was a candidate (no fallback)
  rubricScore: 0 | 0.25 | 0.5 | 1; expectedHit: boolean; pass: boolean; unjustifiedPass: boolean;
  inputTokens: number; cachedInputTokens: number; outputTokens: number;
  costMicroUsd: number; durationMs: number;
  rules: { count: number; chars: number; tokensEstimate: number; dropped: boolean };
}
// metrics.ts — чистые функции (TR-6), nearest-rank перцентили (QD-10), без NaN: пустая выборка → null
export interface BenchVariantMetrics {
  decisions: number; validRate: number | null; unjustifiedPassRate: number | null; goalScore: number | null;
  expectedHitRate: number | null; fallbacks: number; fallbackCodes: string[];
  inputTokens: number; cachedInputTokens: number; outputTokens: number; meanRulesChars: number | null;
  costMicroUsd: number; costPerDecisionMicroUsd: number | null; latencyP50Ms: number | null; latencyP95Ms: number | null;
}
export function percentileNearestRank(values: readonly number[], p: number): number | null;
export function computeVariantMetrics(decisions: readonly BenchDecision[]): BenchVariantMetrics;
export interface BenchComparison {   // openai-rules − openai-no-rules, per-scenario means → mean Δ and 95% CI (normal approx, n = scenarios)
  metric: 'goalScore' | 'expectedHitRate' | 'unjustifiedPassRate' | 'validRate' | 'costPerDecisionMicroUsd' | 'inputTokens' | 'latencyP50Ms';
  delta: number | null; ciLow: number | null; ciHigh: number | null;
  verdict: 'rules-better' | 'rules-worse' | 'no-measurable-effect' | 'n/a';   // effect only if the CI excludes 0
}
// harness.ts
export interface BenchRunOptions {
  file: BenchScenarioFile; module: ServerGameModule; rules: RulesContextProvider | null;
  variants: readonly BenchVariant[]; repeats: number;
  decisions: Pick<AiDecisionService, 'decide'>;   // mock: AiDecisionService over MockAIProvider; real: over OpenAIProvider
  requested: 'mock' | 'auto'; budgetKey: string; modelRole: AIModelRole; rulesConfig: CommanderRulesConfig;
  monotonicNow: () => number; now: () => string;
}
export interface BenchReport {
  mode: 'mock' | 'real'; generatedAt: string; model: string | null; rulesVersion: string | null;
  repeats: number; scenarios: number; decisions: BenchDecision[];
  metrics: Record<BenchVariant, BenchVariantMetrics>; comparisons: BenchComparison[];
  stopped: null | 'cost-cap'; spentMicroUsd: number; maxUsd: number | null;
}
export async function runBenchmark(opts: BenchRunOptions): Promise<BenchReport>;
export function renderBenchReportMarkdown(report: BenchReport): string;
// cli.ts — разбор аргументов (чистая parseBenchArgs) + сборка зависимостей + запись отчёта
```

- Вариант `bot` — `point.fallbackCandidateId`, 0 вызовов. `openai-*` — `buildCommanderContext` (C-10) с
  `config.enabled = false|true`, затем `decisions.decide(ctx, requested)`; ответ ∉ кандидатов/ошибка → бот + код (как
  стратегия). Состояние → `module.parseState(state, {sessionId, version})`; `pendingActor === side` проверяется;
  `AutomationDecisionPointSchema.parse(automation.decisionPoint(state))`.
- **Mock** (`pnpm test`): `AiDecisionService` поверх `MockAIProvider`, in-memory `AiUsage`/budget источник, фиксированные
  `monotonicNow`/`now` → отчёт детерминирован (TC-BEN-04). Тесты: `apps/api/test/bench/*.unit.test.ts`.
- **Real**: только `pnpm --filter @bga/api bench:ai -- --real --max-usd <≤1> [--repeats 3] [--role tactical]`.
  `<bench-cmd>` = `pnpm --filter @bga/api bench:ai --`; `<bench-real-flag>` = `--real`; скрипт `bench:ai` =
  `tsc -b ../../packages && nest build && node dist/bench/cli.js --scenarios ../../packages/games/rebellion/benchmark/scenarios.json`.
  Отказ (exit 2, до любого сетевого обращения): `--max-usd` без `--real`; `--real` без `--max-usd`, `> 1`, `≤ 0`, не число;
  `config.nodeEnv === 'test'`; `config.openai.enabled !== true`. Конфиг — `loadAppConfig` (единственный читатель env).
  Жёсткий лимит — **резервирование SWR-005B**: свой `BudgetService` с in-memory источником, `budgetKey =
  bench-<runId>`, лимит = `--max-usd` (в micro-USD), `maxCostPerSessionUsd` конфига игнорируется; первый
  `AI_BUDGET_EXCEEDED` → остальные model-вызовы не выполняются, `stopped: 'cost-cap'` (TC-BEN-10). Сессии игроков и их
  бюджеты не затрагиваются; ключ и `sessionId` в отчёт/лог не пишутся (TC-BEN-11).
- `<bench report path>`: `docs/tasks/SWR-008/artifacts/benchmark/<mode>-<YYYYMMDD-HHmmss>.{json,md}` (`--out <dir>`
  переопределяет). Ориентир стоимости real (tactical `gpt-6-luna`, ≈ 3–4 тыс. входных токенов): 12 × 2 × 3 = 72 вызова
  ≈ $0.04; strategy-модель (`gpt-6.1-sol`, до 1600 токенов вывода) может превысить $1 — по умолчанию `--role tactical`.

## 9. Скрытая информация (R-1, QD-7) — анализ

- Вход отбора = `{actor, phase, rulesQuery}`; `rulesQuery` Rebellion — функция `activation === null`, `rebelBase.revealed`,
  `passed[opponent]`: все три поля одинаковы в видах обеих сторон ⇒ ID правил безопасно показывать любому зрителю
  (TC-H-07). Типы кандидатов в отбор не входят: у AI-Повстанцев наличие `MOVE_PIECES` зависит от юнитов на скрытой базе
  (`legal.ts:42-70`).
- Блок правил одинаков для двух состояний с одинаковым публичным состоянием ⇒ для AI-Империи (relocateBase) весь запрос
  побайтно равен (как TC-H-04 SWR-006 + правила).
- Охранные тесты W3: ни одна запись, допустимая в AI-контекст (`ai !== 'none'`, `verified`), не содержит в `id` или `text`
  id системы карты как подстроку (единственные такие id — `ai:'none'`, `needs-review`).
- Остаточный канал (dev only, задокументировать): фактические `inputTokens`/стоимость вызовов AI-Повстанцев зависят от длины
  их `situation` (C3: где база) — человек-Империя в dev-панели видит числа токенов. В prod эндпоинта нет; QA TC-H-07
  использует fake usage (константы). См. Q-BE-1.

## 10. Подзадачи (брифы для воркеров; формат workflow §3)

Общее для всех: `REPORT: changed files, tests run (команда + результат), known limitations, open questions`; Node 22
(`source ~/.nvm/nvm.sh && nvm use`), pnpm 12; `apps/api/.env` не читать; реальных вызовов OpenAI нет; коммиты — нет.
CONTRACTS у всех: §2 C-1..C-10 заморожены; `AutomationRunSummarySchema`, `SessionResponse`, budget SWR-005B/006, схема
state Rebellion, схема ответа модели — не менять; prompt при rules off — побайтно SWR-006.

### W0 — эталон rules-off (api worker) — до любых правок `prompt.ts`
- GOAL: записан golden тел запросов к fake OpenAI на текущем коде SWR-006 (TR-3).
- OWNED FILES: `apps/api/test/rules-off-golden.int.test.ts` (new), `apps/api/test/fixtures/swr006-commander-requests.json` (new).
- DONE WHEN: тест с фикс. `sessionId`/часами (AI-Империя, бот-человек `PASS`, 1 раунд, `commanderFake`) пишет файл при
  `UPDATE_SWR006_GOLDEN=1` и сравнивает побайтно без флага; зелёный на текущем коде. После W0 файл теста передаётся W6b
  (он добавит `aiCommander.rulesContext: 'off'`).
- TC: TC-INT-07.

### W1 — платформенный контракт (platform worker)
- GOAL: C-1, C-2, C-3, C-5 и §6 реализованы в `packages/platform`; `@bga/platform` и `@bga/platform/rules-kb`
  экспортируют их; поведение `buildRulesContext` без новых опций не изменилось.
- OWNED FILES: `packages/platform/src/rules-context.ts` (new), `packages/platform/src/ai-diagnostics.ts` (new),
  `packages/platform/src/automation.ts`, `packages/platform/src/server-game-module.ts`, `packages/platform/src/index.ts`,
  `packages/platform/src/rules-kb/context.ts`, `packages/platform/src/rules-kb/provider.ts` (new),
  `packages/platform/src/rules-kb/sha256.ts` (new), `packages/platform/src/rules-kb/canonical-json.ts` (new),
  `packages/platform/src/rules-kb/index.ts`, `packages/platform/test/rules-context.test.ts` (new),
  `packages/platform/test/ai-diagnostics.test.ts` (new), `packages/platform/test/automation.test.ts`,
  `packages/platform/test/rules-kb/context.test.ts`, `packages/platform/test/rules-kb/provider.test.ts` (new),
  `packages/platform/test/rules-kb/sha256.test.ts` (new), `docs/architecture/rules-knowledge.md`.
- DONE WHEN: `pnpm --filter @bga/platform test` и `typecheck` зелёные; `sha256Hex` совпадает с `node:crypto` на векторах
  (пусто, ASCII, кириллица, 1 МБ); provider-тесты на крошечной KB-фикстуре: порядок групп, исключение `needs-review` даже
  в pinned (→ `KnowledgeBaseConfigError` при создании), `requiredChars`, `RangeError`, версия не зависит от порядка
  записей и меняется от 1 символа; `rulesSelectionInputOf` не читает `candidates` (тест: разные кандидаты → равный вход);
  `RulesContextResultSchema` отвергает рассинхрон строк/ids; `AI_PROMPT_TOO_LARGE` последний в enum; в
  `rules-knowledge.md` — раздел «SWR-008: контракт Rules Context» (вход/C1–C5/версия/как подключить игру без KB/F-7/QD-7).
- TC: TC-CT-01, -03, -04, -07, -08, TC-SEL-04/05/07/08/09/11 (на фикстуре), TC-ST-02 (механизм), TC-FB-06 (пустая KB).

### W2 — DISC-009 в движке (rules worker)
- GOAL: §7.1–7.5 реализованы; golden SWR-005/006 байт-в-байт.
- OWNED FILES: `packages/games/rebellion/src/rules/core/state-checks.ts` (new), `.../core/apply.ts`, `.../core/turn-flow.ts`,
  `.../core/movement.ts`, `.../core/victory.ts`, `.../core/create.ts`, `.../core/index.ts`,
  `packages/games/rebellion/test/rules/core/state-checks.test.ts` (new),
  `packages/games/rebellion/test/rules/core/reveal-invariant.test.ts` (new),
  `packages/games/rebellion/test/rules/core/reveal.test.ts` (только добавления; имена тестов из `coverage.json` не менять),
  `packages/games/rebellion/test/rules/core/helpers.ts` (только добавления).
- DONE WHEN: `pnpm --filter @bga/game-rebellion test` зелёный (golden, invariants, hidden-info); матрица TC-D-01..30 в
  `state-checks.test.ts` (имена тестов начинаются с `TC-D-nn`); property TC-D-32 по `SEEDS_P` (`swr008-p01..p30`, 9 пар
  сложностей) + E-HUNT; differential TC-D-33 с копией старой логики только в тесте; TC-D-34 метаморфный вид Империи;
  `rg "revealBase\(" packages/games/rebellion/src` → только `state-checks.ts` (+ определение).
- Примечание: `coverage.json` ссылается на `revealsBaseNow` — io-тест KB станет красным до W3; W2 и W3 интегрируются
  вместе (лид), W2 не правит KB.
- TC: TC-D-01..34, TC-RS-04.

### W3 — данные KB и правила Rebellion (KB/game worker) — после W1 и W2
- GOAL: §3.3, §7.6, C-6 реализованы; провайдер Rebellion проходит тесты отбора на реальной KB.
- OWNED FILES: `packages/games/rebellion/knowledge/entries/implementation-notes.json`,
  `packages/games/rebellion/knowledge/discrepancies.json`, `packages/games/rebellion/knowledge/coverage.json`,
  `packages/games/rebellion/knowledge/audit-summary.md`, `docs/game-rules/rebellion/rules-index.md`,
  `docs/game-rules/rebellion/coverage-matrix.md`, `docs/game-rules/rebellion/discrepancies.md`,
  `packages/games/rebellion/src/server/rules-context.ts` (new), `packages/games/rebellion/src/server/rebellion-server-module.ts`,
  `packages/games/rebellion/src/server/index.ts`, `packages/games/rebellion/test/knowledge/context.test.ts`,
  `packages/games/rebellion/test/knowledge/rules-provider.test.ts` (new),
  `packages/games/rebellion/test/knowledge/fixtures/rules-selection.golden.json` (new, `<sel-golden>`),
  `packages/games/rebellion/test/server/server-module.test.ts` (если нужно).
- DONE WHEN: все `test/knowledge/**` зелёные (io, coverage, discrepancies, search top-3, generated docs);
  `context.test.ts` переписан на SWR-008 семантику (провайдер, публичные наборы: idle/active × side × теги) — ≤ 6000,
  `truncated=false`, engine-scope первой строкой, нет `needs-review`/`(unverified)`, обязательные id из старого REQUIRED
  (кроме `command.pass-not-mid-activation`, теперь исключённой); `rules-provider.test.ts`: TC-SEL-01..10/12, TC-ST-01..05,
  TC-FB-06 на реальной KB, golden 6 входов, лог-строка с числами записей/символов по вариантам, охранный тест «нет id
  системы в id/text допустимых записей», все id `REBELLION_TAG_RULES` и pinned существуют и `verified`.
- TC: TC-SEL-01..10/12, TC-ST-01..06, TC-D-36, TC-D-37, TC-CT-03 (реальная KB).

### W4 — `rulesQuery` Rebellion (game AI worker) — параллельно с W1/W2
- GOAL: C-4 реализован, `BotDecisionPoint.rulesQuery` всегда задан.
- OWNED FILES: `packages/games/rebellion/src/ai/rules-query.ts` (new), `packages/games/rebellion/src/ai/decision.ts`,
  `packages/games/rebellion/src/ai/types.ts`, `packages/games/rebellion/src/ai/index.ts`,
  `packages/games/rebellion/test/ai/rules-query.test.ts` (new), `packages/games/rebellion/test/ai/decision.test.ts`,
  `packages/games/rebellion/test/server/automation-hidden-base.test.ts` (только расширения).
- DONE WHEN: тесты rebellion зелёные; метаморфный тест: изменение любых полей вида, кроме трёх публичных, не меняет
  `rulesQuery`; TC-H-02 — `rulesQuery` (и весь вход отбора) равны для `relocateBase` по `SEEDS_P` и всем 9 базам; для
  AI-Повстанцев `rulesQuery` не зависит от юнитов в базе (активация рядом с базой с/без подвижных юнитов).
  Интеграция с runner возможна только после W1 (строгая схема точки).
- TC: TC-H-02, TC-H-06 (часть unit), TC-ARB-06.

### W5 — API: конфиг и реестр правил (api worker) — после W1
- GOAL: C-7, C-8 реализованы; fail fast; архитектурные проверки расширены.
- OWNED FILES: `apps/api/src/config/env.ts`, `apps/api/.env.example`, `apps/api/src/main.ts`,
  `apps/api/src/rules-context/knowledge-base.loader.ts` (new), `apps/api/src/rules-context/rules-context.registry.ts` (new),
  `apps/api/src/rules-context/rules-context.module.ts` (new), `apps/api/src/rules-context/rules-context.tokens.ts` (new),
  `apps/api/src/app.module.ts`, `apps/api/src/app.factory.ts`, `apps/api/test/support/test-config.ts`,
  `apps/api/test/env.unit.test.ts`, `apps/api/test/env-example.unit.test.ts`, `apps/api/test/architecture.int.test.ts`,
  `apps/api/test/rules-context-registry.int.test.ts` (new), `apps/api/test/fixtures/tiny-kb/**` (new: manifest +
  entries фейковой игры `fake`).
- DONE WHEN: `testConfig()` — `knowledgeBaseRoot` = корень репозитория, `rulesContext: 'on'` по умолчанию, лимиты через
  overrides (TR-5); env-тесты TC-INT-09/TC-BUD-09; реестр: provider bot → 0 чтений; openai+on → 1 чтение на игру с
  `rules` (шпион `loader`, TC-INT-04 часть); битые KB (битый JSON, дубликат id, неизвестный `sourceId`, pinned
  `needs-review`, `maxChars < requiredChars`, `knowledgeBaseRoot: null`) → `createApp` отклоняется (TC-INT-05, TC-SEL-09);
  архитектурный тест: нет `@bga/game-` в `src/{ai,sessions,rules-context,bench}/**`, `rules-context/**` не упоминает
  `applyCommand`/`rules/core` (TC-CT-02, TC-ARB-07).
- TC: TC-INT-04/05/09, TC-BUD-09, TC-CT-02/05, TC-ARB-07, TC-SEL-09 (env/старт).

### W6a — API: промпт, учёт, миграция (AI integration worker) — после W0 и W1
- GOAL: C-9, §4.1–4.3, §5 реализованы.
- OWNED FILES: `apps/api/src/ai/prompt.ts`, `apps/api/src/ai/prompt-fit.ts` (new), `apps/api/src/ai/ai.types.ts`,
  `apps/api/src/ai/ai-decision.service.ts`, `apps/api/src/ai/ai-usage.repository.ts`, `apps/api/src/ai/cost-by-rules.ts` (new),
  `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261120120000_ai_usage_rules/migration.sql` (new),
  `apps/api/test/ai/prompt.unit.test.ts`, `apps/api/test/ai/prompt-fit.unit.test.ts` (new),
  `apps/api/test/ai/ai-decision-service.unit.test.ts`, `apps/api/test/ai/ai-usage-repository.int.test.ts`,
  `apps/api/test/ai/cost-by-rules.unit.test.ts` (new), `apps/api/test/migration-swr008.int.test.ts` (new),
  `apps/api/test/migration.int.test.ts`, `apps/api/test/support/swr005b-db.ts` (new, если нужен).
- DONE WHEN: snapshot TC-OA-05 не изменён (rules off); новый snapshot rules on; `fitCommanderPrompt` — уровни
  full/reduced/dropped/too-large на границах `L`, `L−1`, между Game-блоком и минимальным блоком, ниже Game-блока
  (TC-BUD-04..08 unit), «worst case SWR-006 + 6000 символов правил ≤ 16000»; резерв с правилами > без (TC-BUD-01 unit);
  строки `AiUsage` с колонками правил для ok/fail/mock (TC-COST-01/02/05 unit/int); миграция на копии БД SWR-005B
  (TC-COST-06, TC-RS-06 часть), `prisma generate` выполнен; `summarizeCostByRules` (TC-COST-03); существующие
  ai-тесты без изменения ожиданий (TC-BUD-10).
- TC: TC-INT-06/08, TC-ST-04, TC-BUD-01/04..08/10, TC-COST-01..06.

### W6b — API: стратегия и раннер (automation worker) — после W5 и W6a
- GOAL: C-10 реализован; правила доходят до модели в автоматических партиях; деградация и `AI_PROMPT_TOO_LARGE`.
- OWNED FILES: `apps/api/src/sessions/automation/commander-context.ts` (new),
  `apps/api/src/sessions/automation/openai-commander.strategy.ts`, `apps/api/src/sessions/automation/commander-strategy.ts`,
  `apps/api/src/sessions/automation/automation-runner.service.ts`, `apps/api/src/sessions/automation/automation.providers.ts`,
  `apps/api/test/automation/commander-context.unit.test.ts`, `apps/api/test/automation/openai-commander-strategy.unit.test.ts`,
  `apps/api/test/support/fake-automation.ts`, `apps/api/test/automation-rules.int.test.ts` (new),
  `apps/api/test/rules-off-golden.int.test.ts` (после W0).
- DONE WHEN: фейковая игра + tiny KB (`fake:` id) через общий контракт: в запросе блок `[fake:…]`, ни одного
  `[rebellion:` (TC-CT-06); игра без `rules` → запрос формы off (TC-FB-05); `AI_PROMPT_TOO_LARGE` → 0 fetch, 0 резерва,
  запуск продолжается (TC-BUD-07); враждебные ответы (TC-ARB-02..05) → `AI_INVALID_DECISION`; fallback-коды SWR-006 с
  правилами on (TC-FB-01/02); `rules-off-golden` зелёный с `rulesContext: 'off'`; исключение `selectRules` → решение без
  правил + warn-строка `STRATEGY_ERROR` (без данных); все существующие automation-тесты зелёные.
- TC: TC-CT-06, TC-INT-03, TC-ARB-01..05/08, TC-BUD-02/03/05..07 (int), TC-FB-01/02/04/05/07, TC-INT-07.

### W7 — dev-эндпоинт диагностики (api worker) — после W1 и W6a
- GOAL: §6 реализован.
- OWNED FILES: `apps/api/src/dev/ai/dev-ai.controller.ts`, `apps/api/src/dev/ai/dev-ai-diagnostics.ts` (new),
  `apps/api/test/dev-ai-diagnostics.int.test.ts` (new).
- DONE WHEN: ответ проходит `AiSessionDecisionsResponseSchema`; 400 на плохой id; 403 не-loopback; 404 в production;
  нет полей `budgetKey`/`reason`/текста; totals = ручной расчёт.
- TC: TC-DIAG-04, TC-DIAG-05 (часть), TC-COST-03 (через эндпоинт).

### W8 — benchmark harness (api worker) — после W3, W6b, W9
- GOAL: §8.2 реализован, mock в `pnpm test`, real только по флагу.
- OWNED FILES: `apps/api/src/bench/types.ts`, `apps/api/src/bench/metrics.ts`, `apps/api/src/bench/harness.ts`,
  `apps/api/src/bench/report.ts`, `apps/api/src/bench/cli.ts`, `apps/api/src/bench/in-memory-usage.ts` (все new),
  `apps/api/package.json` (только скрипт `bench:ai`), `apps/api/test/bench/metrics.unit.test.ts`,
  `apps/api/test/bench/harness-mock.int.test.ts`, `apps/api/test/bench/cli.unit.test.ts` (new).
- DONE WHEN: TC-BEN-04..11 зелёные (real-путь — только с fake fetch и `nodeEnv: 'development'` конфигом в тесте; сетевой
  guard активен); `nest build` включает `dist/bench/cli.js`; ручной mock-прогон
  `pnpm --filter @bga/api bench:ai -- --out ../../docs/tasks/SWR-008/artifacts/benchmark` создаёт отчёт.
- TC: TC-BEN-04..12, TC-H-09 (через сценарии), TC-MEAS-04 (функции).

### W9 — benchmark-сценарии Rebellion (game worker) — после W2 (параллельно W3–W7)
- GOAL: §8.1 реализован: ≥ 12 сценариев с рубрикой, генерируемый файл и README.
- OWNED FILES: `packages/games/rebellion/test/benchmark/scenarios.ts` (new), `packages/games/rebellion/test/benchmark/scenarios.test.ts` (new),
  `packages/games/rebellion/benchmark/scenarios.json` (new, generated), `packages/games/rebellion/benchmark/README.md` (new).
- DONE WHEN: TC-BEN-01..03 зелёные (схема, ≥6+≥6, matchers сопоставимы с кандидатами, `justificationRuleIds` существуют и
  `verified`, нет id базы в текстах сценариев за Империю), файл свежий относительно построителей.
- TC: TC-BEN-01..03, TC-H-09 (данные).

### W10 — интеграционные тесты скрытности и рестарта (api test worker) — после W3, W4, W5, W6b, W7
- GOAL: AC-3/6/9 подтверждены на реальной Rebellion через HTTP.
- OWNED FILES: `apps/api/test/automation-hidden-info.int.test.ts` (только расширения), `apps/api/test/rules-integration.int.test.ts` (new),
  `apps/api/test/rules-hidden-info.int.test.ts` (new), `apps/api/test/disc009-restore.int.test.ts` (new),
  `apps/api/test/support/automation-helpers.ts` (только добавления).
- DONE WHEN: TC-INT-01/02/04 (реальная KB, шпион loader), TC-H-01/03/04/05/07/08 (в т.ч. dev-эндпоинт в скане
  Empire-адресованных тел, сравнение диагностики двух копий с fake usage-константами), TC-D-35, TC-RS-01/02/03/05 зелёные.
- TC: перечисленные.

### FE — dev-панель (frontend-lead, отдельный план)
Потребляет §6; локали `AI_PROMPT_TOO_LARGE`; TC-DIAG-01..03/06..08, TC-FB-08. Файлы — `apps/web/**`, `e2e/**` по плану FE.

## 11. Граф зависимостей и группы

```text
G0 (параллельно):  W0   W1   W2   W4
                    │    │╲   │    │
G1:                 │    │ W5 │    │        W9 (после W2)
                    └─W6a┘  │ W3 (после W1+W2)
G2:                   W6b (после W5+W6a)    W7 (после W1+W6a)
G3:                   W8 (после W3+W6b+W9)  W10 (после W3+W4+W5+W6b+W7)   FE (после W1 §6; e2e после W7)
INTEGRATION (lead):   W2+W3 вместе (io coverage); W1+W4 до api-тестов; pnpm verify
```

Непересечение владения проверено: каждый путь — ровно у одного W (кроме последовательной передачи
`rules-off-golden.int.test.ts` W0 → W6b).

## 12. AC → подзадачи

| AC | Подзадачи | Ключевые TC |
|---|---|---|
| AC-1 | lead/analyst (артефакты), все W (логи) | TC-WF-* |
| AC-2 | W1, W3 (C-6), W5, W6b (fake KB), W1 docs | TC-CT-* |
| AC-3 | W5 (загрузка), W6a (промпт), W6b (стратегия), W0+W6b (golden off), W10 | TC-INT-* |
| AC-4 | W1 (алгоритм), W3 (реальная KB), W4 (вход) | TC-SEL-* |
| AC-5 | W1 (`excludeStatuses`), W3 (engine-scope), W6a (инструкция) | TC-ST-* |
| AC-6 | W4 (публичный вход), W3 (охранный тест), W7 (поля), W10 (HTTP) | TC-H-* |
| AC-7 | W6b, W10 | TC-ARB-* |
| AC-8 | W2 (движок), W3 (KB) | TC-D-* |
| AC-9 | W2 (без смены схемы), W10 (рестарт), W6a (миграция БД) | TC-RS-* |
| AC-10 | W6a (fit, резерв), W6b (код, без вызова), W5 (env) | TC-BUD-* |
| AC-11 | W6b, W1 (пустая KB), W3 | TC-FB-* |
| AC-12 | W6a (колонки, миграция, агрегат) | TC-COST-* |
| AC-13 | W7 (API), W1 (wire), FE (UI) | TC-DIAG-* |
| AC-14 | W8, W9 | TC-BEN-* |
| AC-15 | W8 (инструмент); real-прогон — Analyst/QA вручную (PO-2) | TC-MEAS-* |
| AC-16 | все + lead INTEGRATION (`pnpm verify`), CI | TC-R-* |

## 13. Сверка заглушек `test-cases.md` («Open for plan»)

| Заглушка | Имя |
|---|---|
| `<RulesContextProvider>`, `<selectRules>` (`SEL`) | `RulesContextProvider.selectRules` (`@bga/platform`), реализация `createKnowledgeBaseRulesProvider` (`@bga/platform/rules-kb`); игра регистрирует `ServerGameModule.rules: GameRulesSupport` |
| `<decision tags>` | `AutomationDecisionPoint.rulesQuery.tags`: `base-hidden` / `base-revealed` / `opponent-passed` из `view.rebelBase.revealed`, `view.passed[opponent]`; `commandTypes` — из `view.activation === null` |
| `<engine-scope id>` | `rebellion:impl.engine-scope` (`ai:'core'`, pinned) |
| `<rules-max-chars>`, `<max-rules>` | `AI_COMMANDER_RULES_MAX_CHARS` (1000..12000, 6000) / `aiCommander.rulesMaxChars`; лимита числа записей нет |
| `<prompt-max>` | `AI_COMMANDER_MAX_PROMPT_TOKENS` (4000..64000, 16000), единица — `upperBoundInputTokens` (байты + 256) |
| `<prompt-too-large code>` | `AI_PROMPT_TOO_LARGE` (`AutomationFallbackCodeSchema`, аддитивно) |
| колонки учёта | `rulesEnabled`, `rulesCount`, `rulesIds`, `rulesChars`, `rulesTokensEstimate`, `rulesVersion`, `rulesTruncated`, `rulesDropped`, `promptTokensUpperBound` (`AiUsage`, миграция `20261120120000_ai_usage_rules`) |
| `<cost-by-rules>` | `summarizeCostByRules` (`apps/api/src/ai/cost-by-rules.ts`) |
| `<checkState>`, `<closed>` | `runStateChecks` (`src/rules/core/state-checks.ts`); `decision: "fixed"` |
| транспорт диагностики | `GET /api/dev/ai/sessions/:sessionId/decisions`, `AiSessionDecisionsResponseSchema`; гейт — `nodeEnv !== 'production'` + loopback; testids/UI-гейт — план FE |
| `<bench-cmd>`, `<bench-real-flag>`, `<scenarios path>`, `<bench report path>` | `pnpm --filter @bga/api bench:ai --`, `--real` (+ `--max-usd ≤ 1`), `packages/games/rebellion/benchmark/scenarios.json`, `docs/tasks/SWR-008/artifacts/benchmark/<mode>-<ts>.{json,md}` |
| `<sel-golden>`, `<swr006-requests>` | `packages/games/rebellion/test/knowledge/fixtures/rules-selection.golden.json`, `apps/api/test/fixtures/swr006-commander-requests.json` |

Поправки к формулировкам TC (для QA): TC-INT-02/TC-SEL-01 — вход отбора = `rulesQuery` (публичный набор типов для
состояния активации), а не типы кандидатов (QD-7); TC-SEL-06 «ни одной `ai:'none'`» выполняется буквально (engine-scope
имеет `ai:'core'`); TC-INT-05 «`ai:'core'` у implementation-note вопреки схеме» — схема это разрешает, кейс заменить на
pinned-запись `needs-review`/несуществующую.

## 14. Риски

| # | Риск | Мера |
|---|---|---|
| RB-1 | Новая запись engine-scope меняет BM25-выдачу `search.test.ts` (top-3) | W3 гоняет `search.test.ts`; при регрессии — правка `keywords` записи, не теста |
| RB-2 | Запас 6000 символов ~330 после финальных текстов | лог-строка W3; тег-группа последняя, усечение предсказуемо |
| RB-3 | W2 без W3 ломает io-проверку coverage | интеграция W2+W3 одним шагом лида |
| RB-4 | Строгая схема точки отвергнет `rulesQuery`, если W4 попадёт раньше W1 | порядок интеграции W1 → W4 |
| RB-5 | Тесты, сравнивающие точку решения `toEqual`, ломаются от `rulesQuery` | W4 владеет `decision.test.ts`; api-тесты точек — W6b/W10 |
| RB-6 | Генерация миграции против dev.db | команда только с `DATABASE_URL` на scratch-БД (§5) |
| RB-7 | Кэш-префикс OpenAI не сработает (< 1024 токенов префикса) | измеряется (cachedInputTokens), не обещается |
| RB-8 | Эффект правил нулевой (RK-1) | отчёт с CI и вердиктом `no-measurable-effect` |

## 15. Открытые вопросы и предлагаемые поправки

- **Q-BE-1.** Dev-диагностика показывает фактические токены/стоимость вызовов AI-Повстанцев человеку-Империи; они зависят
  от длины `situation` (где база). Рекомендация: принять как ограничение dev-инструмента (prod — 404), записать в
  delivery-report; не маскировать числа.
- **Q-BE-2.** Загружать KB только при `provider=openai && rules=on` (план) или всегда при `on`. Рекомендация: только при
  openai (bot-партии и сотни api-тестов не платят за парсинг; fail fast там, где KB используется); KB-данные и так
  валидируются в `pnpm test`.
- **Q-BE-3.** id `rebellion:impl.reveal-only-at-finish` после исправления вводит в заблуждение. Рекомендация: оставить id
  (стабильность ссылок), сменить title/text (§7.6).
- **Q-BE-4.** Новый fallback-код `AI_PROMPT_TOO_LARGE` — изменение enum платформы (аддитивно) и локалей web. Рекомендация:
  принять (AC-10 требует «fallback с кодом»).
- **AM-BE-1.** AC-4/TC-INT-02/TC-SEL-01 говорят о «типах кандидатов»; по коду (`legal.ts`) набор `MOVE_PIECES` у
  AI-Повстанцев зависит от C3 → вход отбора — `rulesQuery` из публичных полей (QD-7 это и требует). Предлагаю уточнить
  формулировку AC-4: «по фазе, публичному набору типов действий для состояния активации, стороне и тегам».
- **AM-BE-2.** AC-12 «ID (или ссылка на них)»: храним JSON-массив id в `AiUsage.rulesIds` (≤ 64 id, публичные) — без
  отдельной таблицы.
- **AM-BE-3.** TC-INT-05 вариант «`ai:'core'` у implementation-note вопреки схеме»: схема это допускает (и engine-scope
  этим пользуется) — заменить на «pinned-запись `needs-review` / отсутствует».

## 16. Dependency integration (DEP-1, DEP-2) — на ревью в CODE_REVIEW SWR-008

Применены оркестратором до SWR-008 (merge SWR-007 в SWR-006-код), в рабочем дереве, не закоммичены:

- **DEP-1** `apps/api/src/sessions/sessions.repository.ts` (`commit`): `PrismaClientKnownRequestError` с кодом `P1008`
  (SQLite busy timeout при синхронном `better-sqlite3`, Prisma 7) трактуется как `{ ok: false, reason:
  'VERSION_CONFLICT' }` — транзакция откатана, запись не произошла; семантика «проиграл гонку → 409» (TC-CC-04). Ревьюеру:
  проверить, что `P1008` не может прийти после частичной записи вне транзакции и что другие коды по-прежнему
  пробрасываются.
- **DEP-2** `apps/api/test/automation-double-submit.int.test.ts` (TC-CC-06): дубль PASS на последнем ходу может получить
  `422 errors.gameOver` (проверяется до версии в core-конвейере) вместо `409`; тест принимает оба, по-прежнему требует
  ровно один `200` и непрерывные события. Ревьюеру: ослабление ограничено этим случаем (`messageKey === 'errors.gameOver'`).
