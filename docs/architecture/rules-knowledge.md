# Rules knowledge — сервисный интерфейс, AI Commander и план Rules Assistant

Статус: SWR-005C (2026-11-20) + SWR-008 (2026-11-20). Реализованы библиотека `@bga/platform/rules-kb`, данные Rebellion
(`packages/games/rebellion/knowledge/`) и (SWR-008, W1) game-agnostic **контракт Rules Context** в `@bga/platform` с
провайдером на базе знаний — раздел [8](#8-swr-008-контракт-rules-context). Загрузка базы сервером, блок правил в промпте
AI Commander и учёт затрат — задачи SWR-008 W3/W5/W6 (см. `docs/tasks/SWR-008/plan-backend.md`). HTTP-эндпоинты поиска и
Rules Assistant — **только спроектированы** (разделы 3, 6), не реализованы. Формат данных —
[`docs/game-rules/knowledge-base.md`](../game-rules/knowledge-base.md).

## 1. Слои

```text
packages/games/<id>/knowledge/*.json   данные игры (источники, записи, покрытие, расхождения)
        │  (читает с диска потребитель: тест или сервис)
        ▼
@bga/platform/rules-kb                 чистый TS + zod: parse / validate / search / context / render (без node:*, без сети)
        │
        ├── packages/games/<id>/test/knowledge   проверки данных в pnpm test, генерация docs/game-rules/<id>/*.md
        └── apps/api  RulesKnowledgeService      (план) загрузка при старте, кэш, HTTP для Rules Assistant, контекст для AI
```

Правила игры по-прежнему исполняет только game-core (`packages/games/<id>/src/rules`); LLM выбирает среди legal actions.
База знаний — справка и проверка, а не источник ходов.

## 2. Функции `@bga/platform/rules-kb` (реализованы)

```ts
parseKnowledgeBase(input: { manifest: unknown; entries: unknown; coverage?: unknown; discrepancies?: unknown }): KnowledgeBase
// бросает KnowledgeBaseParseError { issues: KbIssue[] } (code 'SCHEMA_INVALID', path 'entries.37.sources.0.page')

validateKnowledgeBase(kb: KnowledgeBase, io?: KnowledgeBaseIo): { ok: boolean; issues: KbIssue[] }
// KnowledgeBaseIo = { fileExists(path): boolean; readText(path): string }, пути от корня репозитория, синхронно
// KbIssue = { code: KbIssueCode; path: string; message: string }; коды — KB_ISSUE_CODES (стабильны)

createRulesSearch(kb): { search(query: string, options?: { kinds?; categories?; status?; limit? /* 5 */ }): RulesSearchHit[] }
// RulesSearchHit = { entry: KbEntry; score: number; citations: { sourceId; page; section; label /* 'RR p.9' */ }[] }
// BM25 по title (вес 3), keywords (3), text (1), exceptions (1); детерминированно; пустой/бессмысленный запрос → []

buildRulesContext(kb, { phase?; commandTypes?; side?; include?: string[]; maxChars: number;
                       excludeStatuses?: KbEntryStatus[] /* SWR-008, default [] */; tagRuleIds?: string[] /* SWR-008, default [] */ })
  : { text; ruleIds; truncated }
// кандидаты: include ∪ ai:'core' ∪ appliesTo.commands ∩ commandTypes ∪ phase ∈ appliesTo.phases ∪ tagRuleIds
// (ai:'none' — никогда; status ∈ excludeStatuses — никогда, в т.ч. в include);
// записи с appliesTo.sides без side отбрасываются (кроме include); порядок групп include → core → commands → phase → tags,
// внутри id asc; строка "[<id>] <title>: <text> (RR p.9; FAQ p.1)" + " (unverified)" для needs-review;
// обрезаются только целые строки, text.length ≤ maxChars всегда. Без новых опций поведение SWR-005C не изменилось.

// SWR-008 (раздел 8):
createKnowledgeBaseRulesProvider(source, { pinnedRuleIds; tagRules? }): RulesContextProvider
knowledgeBaseRulesVersion(kb): string            // '<gameId>@<formatVersion>:<12 hex sha256>'
canonicalJson(value): string; sha256Hex(text): string   // чистый TS, без node:crypto

renderRulesIndex(kb, opts?) / renderCoverageMatrix(kb, opts?) / renderDiscrepancies(kb, opts?)   // opts = { title?, preamble? }
formatCitation({ sourceId, page }): string   // 'RR p.9'
```

## 3. `RulesKnowledgeService` в `apps/api` (план)

- **Где:** новый модуль `apps/api/src/rules-knowledge/` (NestJS provider). Реестр игр уже знает `gameId`; сервис держит
  `Map<gameId, { kb: KnowledgeBase; search: RulesSearch }>`.
- **Загрузка при старте:** для каждой игры с каталогом `knowledge/` прочитать `manifest.json`, `entries/*.json` (в
  отсортированном порядке), `coverage.json`, `discrepancies.json` → `parseKnowledgeBase` → `validateKnowledgeBase(kb)`
  (без io: файлы реализации в рантайме не нужны; io-проверка остаётся в `pnpm test`). Любая ошибка — сервер не стартует
  (fail fast), в лог — коды и пути.
- **Кэш:** `createRulesSearch(kb)` строится один раз (индекс BM25 в памяти; ~200 записей — микросекунды на запрос).
  Контексты AI кэшируются по ключу `(gameId, phase, sorted commandTypes, side, maxChars)`.
- **Как пакуются данные:** JSON копируется в образ сервера рядом со сборкой пакета игры (или читается из workspace в dev);
  путь задаётся конфигом, не `process.env` вне `config/env.ts`.
- **Границы:** сервис не зависит от сессий и состояния партии; Rules Assistant и AI получают только публичные правила.

### Предлагаемые HTTP-эндпоинты Rules Assistant

| Метод и путь | Ответ |
|---|---|
| `GET /api/games/:gameId/rules/search?q=...&kind=rule&category=command&limit=5` | `{ hits: [{ id, kind, status, title, text, score, citations: [{ label, sourceId, page, section }] }] }` |
| `GET /api/games/:gameId/rules/:entryId` | запись целиком + `related`, `amends`, исключения, статус покрытия и связанные `DISC-*` |
| `GET /api/games/:gameId/rules/sources` | список источников (название, версия, дата, URL) — для подписи «по Rules Reference, стр. 9» |
| `POST /api/games/:gameId/rules/ask` (этап 2) | `{ question }` → `{ answer, citations, entryIds, confidence: 'verified' / 'needs-review' / 'refused' }` |

Все ответы — Zod-схемы в `packages/platform` (как остальные API-контракты), коды ошибок — `404 unknownGame/unknownEntry`.

## 4. AI Commander: правила без PDF (план SWR-005C; реализация — SWR-008, раздел 8)

> Раздел сохранён как исходный план. Где SWR-008 решил иначе: вход отбора — **не** типы legal actions, а публичный
> `rulesQuery` (QD-7); `needs-review` **исключаются** (QD-4), а не помечаются; F-7 решён записью engine-scope (раздел 8.5).

- В каждый запрос AI вместо PDF идёт `buildRulesContext(kb, { phase, commandTypes, side, maxChars })`, где
  `commandTypes` — **типы legal actions текущего состояния** (для core-v1 Command Phase: `ACTIVATE_SYSTEM`, `MOVE_PIECES`,
  `FINISH_ACTIVATION`, `PASS`), `phase` — фаза партии, `side` — сторона AI (`rebels`/`empire`).
- Бюджет: `maxChars` ≈ 6000 (тест данных Rebellion проверяет, что в этот бюджет входят правила активации, движения,
  транспорта, паса, раскрытия базы и обеих побед). Записи `needs-review` помечены `(unverified)` — промпт должен
  говорить модели, что при конфликте решают legal actions движка.
- Ссылки `[rebellion:...]` позволяют AI объяснять ход («по правилу rebellion:command.move.own-leader-locks»), а журналу —
  проверять, что объяснение ссылается на существующую запись.
- Открытый вопрос интеграции (review F-7): `include` не обходит `ai: 'none'`, а все `implementation-note` имеют `ai: 'none'`,
  поэтому сейчас контекст не может сказать «в core-v1 нет боя/миссий». Решить в задаче интеграции: либо разрешить `include`
  обходить `ai: 'none'`, либо пометить 2–3 ключевые заметки `situational` с `appliesTo.phases: ['command']`. Запас бюджета
  6000 символов сейчас ~60 символов — любое добавление обрежет контекст (это ловит тест данных).
- Интеграция в промпт SWR-006 (`apps/api/src/ai/prompt.ts`, `packages/games/rebellion/src/ai/**`) — отдельная задача после
  влития SWR-006; в SWR-005C эти файлы не меняются.

## 5. Скрытая информация

- Правила публичны: база знаний не содержит и никогда не получает состояние партии (расположение базы, руки карт,
  карты зондов). Ни сервис, ни Rules Assistant не принимают `sessionId`.
- Если в будущем ассистент будет отвечать «в контексте моей партии», он получает только `PlayerView` запрашивающей
  стороны (фильтрация на сервере, как везде), и правила с этим представлением не смешиваются в одном кэше.
- В промпт AI идёт контекст правил + `PlayerView` стороны AI; правила одинаковы для обеих сторон, кроме отбора по `side`
  (это отбор публичных правил, не секретов).

## 6. План Rules Assistant по этапам

1. **Retrieval (без LLM).** `RulesKnowledgeService` + `GET .../rules/search` и `GET .../rules/:entryId`; UI-панель «Правила»
   с поиском, фильтром по категориям и ссылками «RR стр. 9». Готовность: тест-набор вопросов (см. этап 5) находит нужную
   запись в top-3.
2. **Ответ LLM, ограниченный найденным.** `POST .../rules/ask`: поиск top-k (5–8) → промпт «отвечай только по этим записям,
   каждое утверждение — со ссылкой `[id]`» → проверка ответа на сервере: все `[id]` существуют и были в выдаче, иначе
   ответ отклоняется. В ответ пользователю — текст + цитаты источник/страница. OpenAI только на сервере.
3. **Отказы и `needs-review`.** Если ни одна запись не набрала порог score или модель не нашла ответа — честный отказ
   («в правилах этого нет, см. RR стр. …»); если ответ опирается на `needs-review`/`interpretation` — пометка «не
   подтверждено официально» и ссылка на rationale; `implementation-note` — пометка «так работает текущий движок».
4. **Вопросы на русском.** Записи на английском; для русских вопросов — переписывание запроса (LLM переводит вопрос в
   английский поисковый запрос + исходный текст ищется по русским `keywords`), объединение выдач. Ответ — на языке вопроса,
   цитаты остаются ссылками на английский источник.
5. **Eval-набор.** `packages/games/<id>/knowledge/eval/*.json`: вопрос (ru/en) → ожидаемые id и запрет на выдумки;
   метрики: recall@3 поиска, доля ответов с корректными ссылками, доля корректных отказов. Прогон — отдельная команда
   (с моком LLM в CI, с реальным ключом — вручную).
6. **UI.** Панель помощника в партии (вопрос → ответ со ссылками, раскрытие записи, переход к странице источника по URL),
   без доступа к секретам партии; позже — подсказки «почему ход недоступен» по коду ошибки движка → запись KB.

## 7. Проверки и сопровождение

- `pnpm test` включает тесты формата (`packages/platform/test/rules-kb`) и данных игры (`packages/games/<id>/test/knowledge`):
  0 issues с io, ≥ 12 вопросов поиска в top-3, контекст AI ≤ 6000 символов, актуальность сгенерированных md.
- Изменился код движка (переименован символ или тест) → io-проверка coverage падает; правка — в `coverage.json`.
- После влития SWR-006 — отдельный пункт: сверить поведение и тексты целей AI с базой (A-6 спецификации SWR-005C).

## 8. SWR-008: контракт Rules Context

Реализация W1 (`packages/platform`). Задача: дать AI-слою сервера компактный, детерминированный блок **публичных** правил
для одной точки решения, не зная ничего о конкретной игре и не видя состояния партии. Решения: `docs/tasks/SWR-008/`
(`specification.md` R-1/R-2, QD-3..QD-7; `plan-backend.md` §2 C-1..C-5, §3, §6). Все изменения платформы **аддитивны**:
существующие схемы, коды и поведение `buildRulesContext` без новых опций не изменились.

### 8.1 Где что лежит

| Что | Где | Экспорт |
|---|---|---|
| `RulesSelectionInputSchema`, `RulesContextResultSchema`, `RulesContextProvider`, `RULES_CONTEXT_LIMITS`, `RULES_TAG_PATTERN`, `RULES_VERSION_PATTERN` | `packages/platform/src/rules-kb/context.ts` (рядом с реализацией: модули rules-kb импортируют только `zod` и `./*`) | `@bga/platform` (реэкспорт из `rules-context.ts`) и `@bga/platform/rules-kb` |
| `GameRulesSupport`, `KnowledgeBaseSource`, `rulesSelectionInputOf` | `packages/platform/src/rules-context.ts` | `@bga/platform` |
| `ServerGameModule.rules?: GameRulesSupport` | `packages/platform/src/server-game-module.ts` | `@bga/platform` |
| `AutomationDecisionPoint.rulesQuery?`, `AutomationRulesQuerySchema`, код `AI_PROMPT_TOO_LARGE` (последним в enum) | `packages/platform/src/automation.ts` | `@bga/platform` |
| `createKnowledgeBaseRulesProvider`, `KnowledgeBaseValidationError`, `KnowledgeBaseConfigError`, `knowledgeBaseRulesVersion`, `canonicalJson`, `sha256Hex` | `packages/platform/src/rules-kb/{provider,canonical-json}.ts` | `@bga/platform/rules-kb` |
| Wire dev-диагностики `AiSessionDecisionsResponseSchema` | `packages/platform/src/ai-diagnostics.ts` | `@bga/platform` |

`@bga/platform/rules-kb` по-прежнему без `node:*`, сети и LLM (тест границ); SHA-256 реализован на чистом TS и сверяется
с `node:crypto` в тестах. Чтение файлов базы с диска — забота сервера (`apps/api`, SWR-008 W5).

### 8.2 Вход отбора и классы данных (R-1, QD-7)

| Класс | Пример | В запрос к модели? | Во вход отбора? |
|---|---|---|---|
| C1 публичные правила | записи KB, `rulesVersion` | да | — (это выход) |
| C2 публичное состояние партии | фаза, идёт ли активация, кто спасовал, раскрыта ли база | да (через `situation`) | **да**, только через `rulesQuery` |
| C3 приватное состояние своей стороны | своя база | да (своей стороне, как в SWR-006) | **нет** |
| C4 скрытое состояние соперника | база соперника до раскрытия | нет | нет |
| C5 служебные данные сервера | `sessionId`/`budgetKey`, ключи, бюджет | нет | нет |

```ts
RulesSelectionInput = { actor; phase; commandTypes: string[] /* sorted unique, ≤ 16 */; tags: string[] /* sorted unique, ≤ 8 */; maxChars /* 1..12000 */ }
rulesSelectionInputOf(point: AutomationDecisionPoint, maxChars): RulesSelectionInput
```

- `rulesSelectionInputOf` — **единственный** способ построить вход: читает только `point.actor`, `point.phase`,
  `point.rulesQuery` (тест-шпион на чтение полей); кандидаты, `situation`, `objective`, `fallbackCandidateId` не читаются.
  Нет `rulesQuery` → `commandTypes: []`, `tags: []` (отбор только по фазе и стороне). Порядок/повторы в запросе не важны.
- `rulesQuery` строит **игра** и только из информации, публичной для **обеих** сторон (C2). Типы кандидатов в отбор не
  входят: их набор может зависеть от приватного состояния стороны AI (у Rebellion — есть ли подвижные юниты на скрытой
  базе), поэтому игра даёт публичный набор типов для состояния активации. Следствие: ID отобранных правил одинаковы для
  двух состояний с одинаковым публичным состоянием, их безопасно показывать в dev-диагностике любому зрителю.
- Схема входа строгая: `state`, `candidates`, `sessionId` и прочие поля отвергаются (ZodError) и не компилируются
  (`@ts-expect-error`-тест TC-SEL-11).

### 8.3 Результат и алгоритм отбора (R-2)

```ts
RulesContextResult = { text /* строка на правило, '' если пусто */; ruleIds /* порядок строк, ≤ 64 */; truncated; rulesVersion }
interface RulesContextProvider { rulesVersion; requiredChars; selectRules(input): RulesContextResult }
```

`createKnowledgeBaseRulesProvider(source, { pinnedRuleIds, tagRules })` — parse → `validateKnowledgeBase` (без io) →
проверка опций → провайдер. Отбор (`buildRulesContext` с `excludeStatuses: ['needs-review']`):

1. **pinned** — `pinnedRuleIds` в заданном порядке (обязательные строки, например engine scope);
2. **core** — `ai: 'core'`, `id asc`;
3. **commands** — `appliesTo.commands ∩ commandTypes ≠ ∅`, `id asc`;
4. **phase** — `appliesTo.phases ∋ phase`, `id asc`;
5. **tags** — `∪ tagRules[tag]` для тегов входа (неизвестные теги игнорируются), `id asc`.

Фильтры: `ai: 'none'` — никогда; `needs-review` — никогда, даже в pinned и тегах (QD-4, A-1: непроверенное не становится
авторитетной инструкцией); `appliesTo.sides` должен содержать `actor` (кроме pinned). Запись входит один раз (первая
группа). Строки добавляются, пока следующая помещается в `maxChars`, — обрезка только целыми строками, остаток всегда
префикс полного списка, первым отбрасывается хвост (теги). Предохранитель схемы: не более 64 строк.

- `requiredChars` = длина pinned-строк, соединённых `\n`. `maxChars < requiredChars` → `RangeError` (QD-3); сервер
  проверяет лимит из конфига при старте и не стартует (fail fast), а не отдаёт пустой блок без пометки.
- Ошибки создания (fail fast): `KnowledgeBaseParseError` (форма), `KnowledgeBaseValidationError` (`issues` валидатора),
  `KnowledgeBaseConfigError` (`problems`: pinned не существует / не `verified` / `ai: 'none'` / дубль, тег не по
  паттерну, id тега не существует, строка с управляющими символами, id > 128, pinned-строки > 12000).
- Детерминизм: одинаковый вход → одинаковые байты; порядок записей и файлов не влияет; сравнение строк
  локале-независимое (`compareStrings`), без `localeCompare`, времени и случайности.

### 8.4 Версия набора правил (QD-5)

`rulesVersion = <gameId>@<formatVersion>:<первые 12 hex sha256(canonicalJson(записи, отсортированные по id))>`, например
`rebellion@1:3f2a…`. Записи берутся после парсинга (default применены: явный `ai: 'situational'` и его отсутствие дают
одну версию). Не зависит от порядка файлов/записей/ключей; меняется от любого символа любого поля любой записи (в т.ч.
`status`). `coverage.json`/`discrepancies.json` в версию не входят — они не попадают в AI. Версия пишется в учёт затрат и
dev-диагностику, позволяя сравнивать решения на одном наборе правил.

### 8.5 F-7: engine scope

`include` по-прежнему **не** обходит `ai: 'none'` (вариант «bypass» отвергнут: он смешивает «не для AI» и «обязательно»).
Игра добавляет **одну** запись `implementation-note` со `status: 'verified'`, `ai: 'core'` и закрепляет её первой через
`pinnedRuleIds`. Для Rebellion — `rebellion:impl.engine-scope` (что умеет движок core-v1 и что не реализовано: бой, миссии,
производство, зонды, лояльность); остальные заметки остаются `ai: 'none'`. Данные и регистрация — SWR-008 W3.

### 8.6 Как подключить игру

- **Игра без базы знаний** (Forbidden Stars, фейковые игры тестов): ничего не делать. Нет `ServerGameModule.rules` →
  сервер ничего не загружает, промпт без блока правил (форма как при `AI_COMMANDER_RULES_CONTEXT=off`). `rulesQuery` в
  точке решения тоже необязателен.
- **Игра с базой знаний:**
  1. каталог `packages/games/<id>/knowledge/` (`manifest.json`, `entries/*.json`, опционально `coverage.json`,
     `discrepancies.json`) в формате [`knowledge-base.md`](../game-rules/knowledge-base.md), проверки данных в `pnpm test`;
  2. `ServerGameModule.rules = { knowledgeBaseDir: 'packages/games/<id>/knowledge', createRulesContextProvider: (source) =>
     createKnowledgeBaseRulesProvider(source, { pinnedRuleIds: [...], tagRules: {...} }) }` (только из `./server` игры);
  3. в `GameAutomation.decisionPoint` — `rulesQuery: { commandTypes, tags }` **только из публичных полей вида** (C2);
  4. id записей с префиксом `<gameId>:` — общий слой сервера никогда не упоминает конкретную игру.
- Пустой результат (`text: ''`) допустим: промпт без блока правил, партия продолжается (TC-FB-06).

### 8.7 Dev-диагностика (wire)

`GET /api/dev/ai/sessions/:sessionId/decisions` → `AiSessionDecisionsResponseSchema` (`packages/platform/src/ai-diagnostics.ts`):
последние ≤ 50 решений (время, провайдер, модель, статус, fallback, токены, стоимость, длительность, блок `rules` —
включены ли, версия, число и ID правил, символы, оценка токенов, усечён/снят) + агрегаты «с правилами / без / всего».
Только вне production и с loopback (эндпоинт — W7). Схема строгая: нет `budgetKey`/`sessionId`, `reason`, текста
промпта/правил, верхней оценки промпта, версии прайсинга. Известное ограничение dev-инструмента (Q-BE-1): фактические
токены/стоимость зависят от длины `situation` стороны AI. Для AI за Повстанцев от скрытого состояния (базы) может
зависеть и **число/время решений** — количество строк, их `at` и `durationMs`: вызов модели происходит только при ≥ 2
кандидатах, а ходы Повстанцев из базы/в базу меняют число кандидатов (review F-5). ID правил и их число публичны (QD-7).
Это приемлемо только потому, что эндпоинт dev-only (404 в production), loopback-only и opt-in (явный переключатель
панели); в продукт и в виды игроков эти данные не попадают.

