# Rules knowledge — сервисный интерфейс, AI Commander и план Rules Assistant

Статус: SWR-005C (2026-11-20). Реализованы библиотека `@bga/platform/rules-kb` и данные Rebellion
(`packages/games/rebellion/knowledge/`). Сервис в `apps/api`, HTTP-эндпоинты, интеграция в промпт AI Commander и сам
Rules Assistant — **только спроектированы** (этот документ), не реализованы. Формат данных —
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

buildRulesContext(kb, { phase?; commandTypes?; side?; include?: string[]; maxChars: number }): { text; ruleIds; truncated }
// кандидаты: include ∪ ai:'core' ∪ appliesTo.commands ∩ commandTypes ∪ phase ∈ appliesTo.phases (ai:'none' — никогда);
// записи с appliesTo.sides без side отбрасываются; порядок групп include → core → commands → phase, внутри id asc;
// строка "[<id>] <title>: <text> (RR p.9; FAQ p.1)" + " (unverified)" для needs-review;
// обрезаются только целые строки, text.length ≤ maxChars всегда

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

## 4. AI Commander: правила без PDF (план интеграции)

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
