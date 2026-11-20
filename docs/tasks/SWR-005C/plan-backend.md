# Plan — backend (SWR-005C / TECH_PLANNING)

Автор: backend-lead, 2026-11-20. Основа: `specification.md` (C-1..C-4, AC-1..AC-13), фактический код `packages/platform`,
`packages/games/rebellion` (package.json, tsconfig*, vitest.config.mts), `eslint.config.mjs`, `.prettierignore`, `packages/tsconfig.json`.
Только дизайн. Отклонения/уточнения контракта — только в §7 (Q-BE-n, на решение Analyst).

## 0. Ключевые решения
| # | Решение | Почему |
|---|---|---|
| BD-1 | Субпуть `exports["./rules-kb"]` = `{ "@bga/source": "./src/rules-kb/index.ts", "types": "./dist/rules-kb/index.d.ts", "default": "./dist/rules-kb/index.js" }` — тот же шаблон, что у `.` и у субпутей rebellion. `rootDir: src` ⇒ `tsc -b` сам кладёт модуль в `dist/rules-kb/`. | Без правки `src/index.ts` (SWR-006), tsconfig и зависимостей. |
| BD-2 | Импорты внутри `src/rules-kb` — относительные **без** расширения (`'./schema'`), как во всей платформе: пакет без `"type": "module"` ⇒ NodeNext компилирует в CommonJS, суффикс `.js` не нужен. Никаких `@bga/*` и `node:*` (ESLint B-1). | Совместимость с `tsc -b packages` и будущим потребителем `apps/api` (CJS). |
| BD-3 | JSON Rebellion **не импортируется** через `import x from '*.json'`: тесты читают файлы `node:fs` → `unknown` → `parseKnowledgeBase`. | Нет проблем с широкими/литеральными типами `resolveJsonModule`, данные вне `src` и вне `tsc -b`. |
| BD-4 | Схема (Zod, `z.strictObject`) проверяет только **форму**; все смысловые правила и лимиты — в `validateKnowledgeBase` со стабильными кодами. | Для каждого кода — негативный тест (AC-10); опечатка в имени поля ловится strict-схемой. |
| BD-5 | Файловые проверки — через синхронный инъецируемый `KnowledgeBaseIo`; пути в `coverage.json` — от корня репозитория, POSIX. | Платформа без `node:*`; сервис `apps/api` позже даст свою реализацию. |
| BD-6 | Поиск/контекст/рендер — чистые детерминированные функции, сортировка с тай-брейком по `id`. | AC-8/AC-9, стабильные сгенерированные md. |

## 1. Модули `packages/platform/src/rules-kb/` (W1)
| Файл | Содержимое |
|---|---|
| `schema.ts` | Zod-схемы C-2, типы (`z.output`/`z.input`), `RULES_KB_FORMAT_VERSION = 1`, `RULES_KB_LIMITS` |
| `issues.ts` | `KB_ISSUE_CODES` (as const), `KbIssueCode`, `KbIssue` |
| `parse.ts` | `parseKnowledgeBase`, `KnowledgeBaseParseError` |
| `validate.ts` | `validateKnowledgeBase` (структурные/ссылочные/покрытие); `validate-io.ts` — проверки файлов/символов/тестов |
| `text.ts` | токенизатор (Unicode `\p{L}\p{N}`, lowercase, стоп-слова en, лёгкий стемминг суффиксов), `formatCitation` |
| `search.ts`, `context.ts`, `render.ts` | C-3 |
| `index.ts` | реэкспорт всего публичного API ниже (только он; внутренние хелперы не экспортируются, кроме `formatCitation`) |

## 2. Публичный API `@bga/platform/rules-kb` (W2 пишет тесты против него до готовности W1)
```ts
export const RULES_KB_FORMAT_VERSION = 1;
export const RULES_KB_LIMITS = { entryTextMaxChars: 600, quoteMaxWords: 25, quoteWordsPerSourceMax: 400 } as const; // C-4 Q-2
// Schemas (Zod): KbManifestSchema, KbSourceSchema, KbCategorySchema, KbSourceSectionSchema, KbEntrySchema, KbSourceRefSchema,
// KbExceptionSchema, KbAppliesToSchema, KbCoverageSchema, KbCoverageItemSchema, KbDiscrepancySchema, KbDiscrepanciesSchema (array)
export type KbEntryKind = 'rule' | 'clarification' | 'interpretation' | 'implementation-note';
export type KbEntryStatus = 'verified' | 'needs-review';
export type KbAiRelevance = 'core' | 'situational' | 'none';           // default 'situational' (after parse — always set)
export type KbSourceKind = 'rules' | 'faq' | 'tutorial' | 'other';     // C-4 Q-1
export type KbCoverageStatus = 'implemented' | 'partial' | 'deviation' | 'not-implemented' | 'not-applicable';
export type KbManifest = z.output<typeof KbManifestSchema>;             // likewise KbSource, KbCategory, KbSourceSection, KbEntry,
                                                                         // KbSourceRef, KbException, KbAppliesTo, KbCoverage,
                                                                         // KbCoverageItem, KbDiscrepancy
export interface KnowledgeBaseInput { manifest: unknown; entries: unknown; coverage?: unknown; discrepancies?: unknown }
export interface KnowledgeBase {
  manifest: KbManifest; entries: readonly KbEntry[]; coverage?: KbCoverage; discrepancies: readonly KbDiscrepancy[]; // [] if absent
}
export class KnowledgeBaseParseError extends Error { readonly issues: readonly KbIssue[] }   // code 'SCHEMA_INVALID', path 'entries.37.sources.0.page'
export function parseKnowledgeBase(input: KnowledgeBaseInput): KnowledgeBase;               // entries = flat array

export interface KbIssue { code: KbIssueCode; path: string; message: string }
export interface KnowledgeBaseIo { fileExists(path: string): boolean; readText(path: string): string } // repo-root-relative
export interface KbValidationResult { ok: boolean; issues: KbIssue[] }                     // ok === issues.length === 0
export function validateKnowledgeBase(kb: KnowledgeBase, io?: KnowledgeBaseIo): KbValidationResult;

export interface RulesCitation { sourceId: string; page: number; section: string; label: string } // label 'RR p.9'
export interface RulesSearchOptions { kinds?: KbEntryKind[]; categories?: string[]; status?: KbEntryStatus[]; limit?: number } // limit 5
export interface RulesSearchHit { entry: KbEntry; score: number; citations: RulesCitation[] }
export interface RulesSearch { search(query: string, options?: RulesSearchOptions): RulesSearchHit[] }
export function createRulesSearch(kb: KnowledgeBase): RulesSearch;

export interface RulesContextOptions { phase?: string; commandTypes?: string[]; side?: string; include?: string[]; maxChars: number }
export interface RulesContext { text: string; ruleIds: string[]; truncated: boolean }
export function buildRulesContext(kb: KnowledgeBase, options: RulesContextOptions): RulesContext;

export interface KbRenderOptions { title?: string; preamble?: string }                    // Q-BE-3
export function renderRulesIndex(kb: KnowledgeBase, options?: KbRenderOptions): string;
export function renderCoverageMatrix(kb: KnowledgeBase, options?: KbRenderOptions): string;
export function renderDiscrepancies(kb: KnowledgeBase, options?: KbRenderOptions): string;
export function formatCitation(ref: { sourceId: string; page: number }): string;          // `${sourceId} p.${page}`
```
Уточнения формы C-2 (без изменения смысла): `source.id` — короткий тег `^[A-Za-z0-9-]+$` (у Rebellion `RR`, `LTP`, `FAQ`),
он же метка цитаты; `sourceSections[].coveredBy?: 'skip'` + `reason?: string`; `appliesTo.{phases,commands,sides}` — строки игры.
По C-4: `source.kind: KbSourceKind` (обязательное; у Rebellion RR — `rules`, LTP — `tutorial`, FAQ — `faq`);
Entry `discrepancyIds?: string[]`; discrepancy `refs?: Array<string | { sourceId: string; page: number }>` (строка — id записи KB).

### 2.1 Коды `KbIssueCode` (стабильные; на каждый — негативный тест в `packages/platform/test/rules-kb/validate*.test.ts`)
| Группа | Коды |
|---|---|
| Схема | `SCHEMA_INVALID` (только в `KnowledgeBaseParseError`) |
| Manifest | `CATEGORY_DUPLICATE`, `CATEGORY_PARENT_UNKNOWN`, `SOURCE_DUPLICATE`, `PRODUCT_CONFLICT` (продукт и в `products`, и в `excludedProducts`) |
| Entry | `ENTRY_ID_FORMAT`, `ENTRY_ID_PREFIX`, `ENTRY_ID_DUPLICATE`, `ENTRY_REF_UNKNOWN` (`related`/`amends`/`exceptions.ruleIds`), `ENTRY_PRODUCT_UNKNOWN`, `ENTRY_CATEGORY_UNKNOWN`, `ENTRY_TEXT_TOO_LONG`, `ENTRY_SOURCE_MISSING` (rule/clarification/interpretation/implementation-note без источника), `ENTRY_RATIONALE_MISSING`, `ENTRY_CLARIFICATION_NOT_FAQ` (нет источника `kind: 'faq'`), `ENTRY_DISCREPANCY_MISSING` (implementation-note без `discrepancyIds`), `ENTRY_DISCREPANCY_UNKNOWN` |
| Источники | `SOURCE_UNKNOWN`, `SOURCE_PAGE_OUT_OF_RANGE`, `SOURCE_PAGE_EXCLUDED`, `QUOTE_TOO_LONG`, `QUOTE_BUDGET_EXCEEDED` (проверка `quote-budget`: сумма слов всех `quote` одного источника > 400). Применяются ко всем ссылкам на источник: `entries[].sources`, `exceptions[].sources`, `sourceSections`, объектные `discrepancy.refs` (C-4 Q-5) |
| Полнота | `SECTION_NOT_COVERED`, `SECTION_SKIP_REASON_MISSING` |
| Coverage | `COVERAGE_RULE_UNKNOWN`, `COVERAGE_RULE_DUPLICATE`, `COVERAGE_RULE_MISSING` (запись `kind: 'rule'` без пункта coverage), `COVERAGE_EVIDENCE_MISSING`, `COVERAGE_DISCREPANCY_MISSING`, `COVERAGE_DISCREPANCY_UNKNOWN`, `COVERAGE_NOTE_MISSING` |
| Discrepancy | `DISCREPANCY_ID_FORMAT` (`^DISC-\d{3}$`), `DISCREPANCY_ID_DUPLICATE`, `DISCREPANCY_RULE_UNKNOWN`, `DISCREPANCY_REF_UNKNOWN` (строковый `refs[]` — не id записи) |
| io | `FILE_MISSING`, `SYMBOL_NOT_FOUND` (`\b<symbol>\b` в тексте файла), `TEST_NOT_FOUND` (подстрока имени теста в тексте тест-файла) |

`path` — точечный путь (`entries[12].sources[0].page` → `entries.12.sources.0.page`); `COVERAGE_*` проверяются, только если передан `coverage`.

### 2.2 Семантика функций
- **Search:** BM25 (k1 1.2, b 0.75) по полям с весами `title` 3, `keywords` 3, `text` 1, `exceptions[].text` 1; фильтры до
  ранжирования; `categories` совпадает и с потомками по `parent`; результаты со `score > 0`, сортировка `score desc, id asc`;
  `citations` — все `sources` записи в порядке данных. Пустой запрос или запрос без значимых токенов (только стоп-слова/пунктуация) → `[]` (C-4 Q-6).
- **Context:** кандидаты — записи с `ai !== 'none'`: `include` ∪ `ai: 'core'` ∪ совпавшие по `appliesTo` (`commands` ∩
  `commandTypes` ≠ ∅ или `phase` ∈ `phases`); запись с `appliesTo.sides`, не содержащим `side`, исключается (кроме `include`).
  Порядок групп: include (в порядке аргумента) → core → commands → phase; внутри группы `id asc`. Строка:
  `[<id>] <title>: <text> (RR p.9; FAQ p.1)` + ` (unverified)` для `needs-review`; строки через `\n`; добавление останавливается
  на первой не влезающей строке — отбрасываются только целые строки (`truncated: true`); `ruleIds` — только вошедшие записи в порядке вывода (C-4 Q-4); `text.length ≤ maxChars` всегда; `maxChars` — целое > 0, иначе `RangeError`.
- **Render:** markdown с первой строкой `<!-- Generated from packages/games/<gameId>/knowledge — do not edit; UPDATE_KB_DOCS=1 -->`,
  оканчивается `\n`; index — по дереву категорий; matrix — таблица ruleId/status/implementation/tests/discrepancies + сводка по
  статусам; discrepancies — сводка по kind/severity/decision + карточки. Без дат и времени (детерминизм). `docs/` вне prettier.

## 3. Тесты
**W1 — `packages/platform/test/rules-kb/`:** `fixture.ts` (вымышленная игра `star-forge`: 2 источника, одна страница-исключение,
~8 записей всех kind, coverage, 2 discrepancy) + `parse.test.ts`, `validate.test.ts` (fixture → 0 issues; по негативному тесту на
каждый код из §2.1, мутацией `structuredClone` фикстуры), `validate-io.test.ts` (in-memory io), `search.test.ts`, `context.test.ts`
(лимит, детерминизм, приоритет групп, `(unverified)`), `render.test.ts` (снапшот-строки), `boundaries.test.ts` (в `src/rules-kb/**`
нет `rebellion`, `node:`, `@bga/` — читается `node:fs`, тестам это разрешено).

**W2 — `packages/games/rebellion/test/knowledge/`:** `load-kb.ts` (не `*.test.ts`; корень репо =
`new URL('../../../../../', import.meta.url)`; читает `manifest.json`, `entries/*.json` в отсортированном порядке, проверяя каждый
файл `z.array(KbEntrySchema)` для понятной ошибки с именем файла, `coverage.json`, `discrepancies.json`; `nodeIo` на `node:fs`).
Тесты: `validate.test.ts` (0 issues с io; AC-1: источники, URL, `excludedPages` FAQ 6–8, products), `content.test.ts` (≥ 80 записей,
AC-3/AC-4: errata → `clarification` + `amends`), `coverage.test.ts` (AC-5: все записи категорий среза в coverage; AC-6: каждая метка
R-3..R-10, D-1..D-7 встречается в `coverage.items[].note` или `discrepancies[].title`/`engineBehaviour` — не в `refs`, они по C-4 Q-5 только id/источник), `discrepancies.test.ts` (AC-7 минимальный перечень),
`search.test.ts` (≥ 12 вопросов, ожидаемый id в top-3), `context.test.ts` (AC-9: 4 типа команд, ≤ 6000, обязательные id),
`no-full-texts.test.ts` (AC-11: `git ls-files` без `*.pdf`), `generated-docs.test.ts` (§4). Импорт только `@bga/platform/rules-kb`.

## 4. Сгенерированные документы
`generated-docs.test.ts` для `rules-index.md`, `coverage-matrix.md`, `discrepancies.md` в `docs/game-rules/rebellion/`:
`UPDATE_KB_DOCS=1` → `mkdirSync` + `writeFileSync` и тест проходит; иначе `expect(readFileSync(...)).toBe(rendered)` с сообщением
`run: UPDATE_KB_DOCS=1 pnpm --filter @bga/game-rebellion exec vitest run test/knowledge/generated-docs.test.ts`. Вывод аудита (AC-6)
— `preamble` для `renderDiscrepancies` из `packages/games/rebellion/knowledge/audit-summary.md` (W2, Q-BE-3).

## 5. Порядок и зависимости
W1 и W2 стартуют параллельно; W2 до сдачи W1 только пишет JSON/документы/тесты (запуск невозможен — модуля ещё нет). После
сдачи W1: W2 гоняет тесты, правит **данные**; несоответствие API → отчёт лиду, правит W1. После правок данных — `UPDATE_KB_DOCS=1`
и `pnpm exec prettier --write packages/games/rebellion/knowledge` (JSON под `prettier --check .`; `*.md` и `docs/` игнорируются).

## 6. Риски
| Риск | Митигация |
|---|---|
| Субпуть не резолвится в собранном виде (NodeNext/CJS) | lead: `pnpm build:packages` + `require('@bga/platform/rules-kb')` из rebellion; в vitest/typecheck — условие `@bga/source` (`customConditions`) |
| Zod 4: `path` содержит `PropertyKey`, default в `z.input`/`z.output` | приводить сегменты к строке; `KbEntry` — `z.output` (ai всегда задан) |
| `noUncheckedIndexedAccess`, `noUnusedLocals` | W1 гоняет `typecheck` платформы и `build:packages` |
| Coverage ссылается на тесты, которые меняет SWR-006 (`hidden-info`, `invariants`) | W2 ссылается на тесты `activate/move/legal/reveal/base/create` и `test/scenario/core-data.test.ts`; при вливании SWR-006 матрицу проверит io-тест |
| Prettier переформатирует JSON → `pnpm lint` красный | шаг prettier в §5, проверка в W2 Verification |
| Конфликт с SWR-006/007 | запреты в `implementation-plan.md` §Ownership; lead проверяет `git diff` |

## 7. Q-BE (на решение Analyst; до ответа W1/W2 реализуют предложенный вариант — он аддитивен)
Q-BE-1 (source kind), Q-BE-2 (`discrepancyIds`), Q-BE-4 (бюджет цитат) закрыты C-4 Q-1/Q-3/Q-2 — учтены в §2.
- **Q-BE-3:** AC-6 требует вывод аудита в сгенерированном `discrepancies.md`. Предложение: необязательный второй аргумент рендеров
  `{ title?, preamble? }` (сигнатуры C-3 не ломаются); текст — в `knowledge/audit-summary.md`.
- **Q-BE-5:** `io` в C-3 — синхронный (`fileExists`, `readText`). Подтвердить; будущий сервис `apps/api` проверяет KB при старте.
