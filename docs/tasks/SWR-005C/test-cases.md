# Test cases — SWR-005C

Written by QA Lead from `specification.md` before implementation (EARLY_QA_DESIGN, 2026-11-20).
Это **дизайн**: ничто здесь не доказывает `passed` — результаты прогонов только в `qa-results.md` (с логами в `artifacts/logs/`).
Приоритет при расхождении: `specification.md` (Contract C-1..C-3 заморожен) → `implementation-plan.md` → этот файл.

## Preconditions

- Задача без UI, API и БД → **браузерного E2E нет**; регрессионный gate — полный `pnpm verify` (lint, typecheck, test, build,
  check:bundle, e2e) + `node scripts/check-task.mjs docs/tasks/SWR-005C`. Ни один набор тестов не теряет кейсов относительно
  базовой линии `main` @ `c1ace26` (+ SWR-006, если влита к моменту QA); рост допустим.
- Тесты не ходят в сеть (KB-тесты получают распарсенный JSON и инъецированные `fileExists`/`readText`, C-1).
- Негативные кейсы строятся мутацией **минимальной валидной фикстуры** (не данных Rebellion): копия фикстуры + одна порча →
  `validateKnowledgeBase` даёт `ok: false` и ровно ожидаемый `code` с `path` к испорченному полю. Для каждой мутации также
  проверяется, что исходная фикстура даёт `ok: true` (контроль, что падает именно из-за мутации).
- Коды ошибок стабильны (C-3), их имена задаёт реализация. Ниже в колонке Expected — **смысл** кода; в `qa-results.md`
  указывается фактическое имя. Требование AC-10: на каждый код из перечня реализации есть ≥1 негативный тест (TC-V-30).
- PDF источников в репозитории **нет и не будет**. Для ручной сверки (TC-M-*) QA/reviewer скачивает их во временную папку вне
  репозитория (например, scratchpad) по URL из `specification.md`/`manifest.json`; LTP — с зеркала из `manifest.json`
  (CDN FFG отвечал 503). После сверки папка удаляется; ни один PDF не попадает в `git status`.

## Conventions

- Level: `unit` (Vitest, чистые функции), `integration` (Vitest на реальных JSON Rebellion + файлах репозитория через io),
  `process` (команды/скрипты репозитория, git), `manual-review` (человек/агент сверяет по документам/PDF).
- Type: `positive` / `negative`.
- Расположение автотестов (C-1): формат — `packages/platform/test/rules-kb/**`; данные Rebellion — `packages/games/rebellion/test/knowledge/**`.

## Test cases

### 1. Источники и manifest (AC-1)

| TC | Covers | Level | Type | Steps / input | Expected |
|---|---|---|---|---|---|
| TC-S-01 | AC-1 | integration | positive | Распарсить `knowledge/manifest.json` Rebellion | 3 источника RR, LTP, FAQ: `url` = URL PO из `request.md` дословно; у каждого `version`, `date`, `retrievedAt`, `sha256` (64 hex), `pages` (RR 16, LTP 20, FAQ 8), `precedence`, `status: 'current'` |
| TC-S-02 | AC-1 | integration | positive | Проверить LTP в manifest | есть `mirror: { url, sha256, reason }`, `reason` упоминает недоступность CDN FFG (503); `mirror.sha256` ≠ пусто |
| TC-S-03 | AC-1 | integration | positive | Проверить FAQ в manifest | `excludedPages` = `[6, 7, 8]` (Rise of the Empire); `version` содержит `2.1`; дата 2019 |
| TC-S-04 | AC-1 | integration | positive | Проверить продукты | `products` = `['base']`, `excludedProducts` = `['rise-of-the-empire']` |
| TC-S-05 | AC-1 | integration | positive | Приоритет источников | `precedence` RR < LTP (RR главнее, Golden Rules RR стр. 2); FAQ-источник опознаётся валидатором как FAQ (см. TC-V-16) |
| TC-S-06 | AC-1 | manual-review | positive | Скачать RR/FAQ по URL PO во временную папку, `shasum -a 256`; LTP — по `mirror.url` | sha256 совпадают с manifest; число страниц совпадает; Last-Modified RR 2016-03-22, FAQ 2019-05-09 (если сервер отдаёт) |
| TC-S-07 | AC-1 | integration | negative | Запись Rebellion (копия реальной) с `product: 'rise-of-the-empire'` | ошибка «product не из `products`», path → `product` |
| TC-S-08 | AC-1 | integration | negative | Запись Rebellion со ссылкой на FAQ стр. 7 | ошибка «страница в `excludedPages`» |

### 2. Формат игронезависим (AC-2)

| TC | Covers | Level | Type | Steps / input | Expected |
|---|---|---|---|---|---|
| TC-F-01 | AC-2 | unit | positive | Фикстура условной второй игры (`gameId` ≠ `rebellion`, своя таксономия, 1–2 источника, ≥5 записей всех `kind`, coverage, discrepancies) → `parseKnowledgeBase` + `validateKnowledgeBase` | `ok: true`, `issues: []` |
| TC-F-02 | AC-2 | unit | positive | `createRulesSearch(fixtureKb).search(<вопрос по фикстуре>)` | ожидаемая запись фикстуры — первая; `citations` с источником/страницей фикстуры |
| TC-F-03 | AC-2 | unit | positive | `buildRulesContext(fixtureKb, { phase, maxChars })` и `render*` по фикстуре | контекст содержит id `ai: 'core'` записей фикстуры; md рендерится без ошибок |
| TC-F-04 | AC-2 | process | negative | `grep -rni "rebellion" packages/platform/src/rules-kb` | 0 совпадений (кроме, при необходимости, примера в комментарии — нежелательно; любое совпадение отмечается в qa-results) |
| TC-F-05 | AC-2 | process | positive | Импорты `packages/platform/src/rules-kb/**` | только `zod` и относительные пути; нет `node:*`, `fs`, `path`, пакетов игр (B-1); корневой `packages/platform/src/index.ts` в diff задачи не изменён; subpath `@bga/platform/rules-kb` экспортирован в `package.json` и резолвится из `packages/games/rebellion` (typecheck) |
| TC-F-06 | AC-2 | manual-review | positive | Прочитать `docs/game-rules/knowledge-base.md` | описаны Manifest, Entry, Coverage, Discrepancies, правила валидации, как добавить вторую игру только данными |

### 3. Справочник Rebellion: полнота и структура (AC-3)

| TC | Covers | Level | Type | Steps / input | Expected |
|---|---|---|---|---|---|
| TC-R-01 | AC-3 | integration | positive | Загрузить все `entries/*.json` Rebellion | ≥ 80 записей; у каждой `id`, `category`, `kind`, `status`, ≥1 `sources[]` с `page` (у `implementation-note` — по контракту; если допускается без источника — зафиксировать в qa-results) |
| TC-R-02 | AC-3 | integration | positive | `validateKnowledgeBase(rebellionKb)` проверка `sourceSections` | каждая секция покрыта записью с тем же `sourceId`+`page` или `coveredBy: 'skip'` с `reason` |
| TC-R-03 | AC-3 | integration | positive | Перечень `sourceSections` | содержит все темы глоссария RR базовой игры; Team Game — `skip` с причиной; RR стр. 15 (Setup); структура раунда LTP; расстановка первой партии LTP стр. 16 |
| TC-R-04 | AC-3 | manual-review | positive | Сверить перечень `sourceSections` с оглавлением/глоссарием RR (PDF во временной папке) | ни одна тема глоссария RR базовой игры не пропущена (список пропусков → дефект) |
| TC-R-05 | AC-3 | integration | positive | Записи с исключениями | ≥1 запись с непустым `exceptions` (например, свой лидер блокирует выход — исключение для поля Rebel Base; раскрытие базы — корабли/Звезда Смерти не раскрывают); `exceptions[].ruleIds` резолвятся |

### 4. Разделение kind / status (AC-4)

| TC | Covers | Level | Type | Steps / input | Expected |
|---|---|---|---|---|---|
| TC-K-01 | AC-4 | integration | positive | Сгруппировать записи по `kind` | присутствуют все 4 kind: `rule`, `clarification`, `interpretation`, `implementation-note` |
| TC-K-02 | AC-4 | integration | positive | Errata FAQ v2.1 базовой игры: добровольное раскрытие базы; Neutral Systems (RR стр. 10); стартовые юниты Повстанцев | каждая — `clarification`, источник FAQ (стр. 1–5), `amends` указывает на существующую `rule` запись RR |
| TC-K-03 | AC-4 | integration | positive | Все `interpretation` | у каждой непустой `rationale` и ≥1 источник; запись «PASS запрещён во время своей активации» — `interpretation`, `needs-review` |
| TC-K-04 | AC-4 | integration | positive | Все `implementation-note` | каждая ссылается на существующий `DISC-NNN` (через `related`/поле ссылки по реализации) |
| TC-K-05 | AC-4 | integration | positive | Записи по данным фан-источников (Мон Мотма без тактики, вместимость Повстанцев) | `status: 'needs-review'` |

### 5. Валидатор: негативные кейсы на каждое правило C-3 (AC-10, AC-1, AC-4, AC-5, AC-11)

Все — `unit`, мутация минимальной валидной фикстуры (кроме отмеченных).

| TC | Covers | Level | Type | Steps / input | Expected |
|---|---|---|---|---|---|
| TC-V-01 | AC-10 | unit | positive | Минимальная валидная фикстура | `ok: true`, `issues: []` |
| TC-V-02 | AC-10 | unit | negative | `parseKnowledgeBase` с полем неверного типа (`formatVersion: 2`, `kind: 'note'`) | Zod-ошибка с путём к полю |
| TC-V-03 | AC-10 | unit | negative | Две записи с одинаковым `id` | код «duplicate id», path указывает на вторую |
| TC-V-04 | AC-10 | unit | negative | `id` с чужим префиксом (`othergame:command.pass` при `gameId` фикстуры) | код «id prefix ≠ gameId» |
| TC-V-05 | AC-10 | unit | negative | Неверный формат id: `fixture:Command.Pass`, `fixture:command`, `fixture:command..pass`, `command.pass` (без префикса) | для каждого — код «bad id format» (или Zod-ошибка, если формат в схеме; фиксируется какой) |
| TC-V-06 | AC-10 | unit | negative | `related: ['fixture:does.not-exist']` | код «dangling ref», path → `related[0]` |
| TC-V-07 | AC-10 | unit | negative | `amends` на несуществующий id | код «dangling ref» (amends) |
| TC-V-08 | AC-10 | unit | negative | `exceptions[0].ruleIds` на несуществующий id | код «dangling ref» (exceptions) |
| TC-V-09 | AC-10, AC-5 | unit | negative | coverage `ruleId` несуществующий | код «dangling coverage ruleId» |
| TC-V-10 | AC-10, AC-5 | unit | negative | coverage `discrepancyIds: ['DISC-999']` при отсутствии | код «dangling discrepancy ref» |
| TC-V-11 | AC-10 | unit | negative | discrepancy `ruleIds` на несуществующий id | код «dangling ref» (discrepancy) |
| TC-V-12 | AC-10 | unit | negative | `sources[0].sourceId: 'XX'` (нет в manifest) | код «unknown source» |
| TC-V-13 | AC-10, AC-1 | unit | negative | `page: 0`; `page: pages + 1` (граница: `page: 1` и `page: pages` — валидны) | код «page out of range» для 0 и pages+1; границы `ok` |
| TC-V-14 | AC-10, AC-1 | unit | negative | `page` из `excludedPages` | код «page excluded» |
| TC-V-15 | AC-10, AC-1 | unit | negative | `product` не из `manifest.products` | код «unknown product» |
| TC-V-16 | AC-10, AC-4 | unit | negative | `kind: 'clarification'` только с источником не-FAQ | код «clarification without FAQ source» |
| TC-V-17 | AC-10 | unit | negative | `category` нет в таксономии; также `categories[].parent` на несуществующую категорию | код «unknown category» |
| TC-V-18 | AC-10, AC-11 | unit | negative | `quote` из 26 слов (граница: 25 слов — ок) | код «quote too long»; 25 слов — `ok` |
| TC-V-19 | AC-10, AC-11 | unit | negative | `text` 601 символ (граница: 600 — ок) | код «text too long»; 600 — `ok` |
| TC-V-20 | AC-10, AC-4 | unit | negative | `kind: 'interpretation'` без `rationale` (и с `rationale: ''`) | код «interpretation without rationale» |
| TC-V-21 | AC-10, AC-4 | unit | negative | `kind: 'rule'` с `sources: []` | код «rule/clarification without source» (или Zod) |
| TC-V-22 | AC-10, AC-3 | unit | negative | `sourceSections` с `{sourceId, page}`, которую не покрывает ни одна запись и нет `coveredBy: 'skip'`; также `skip` без `reason` | код «uncovered source section» |
| TC-V-23 | AC-10, AC-5 | unit | negative | coverage `status: 'implemented'` без `implementation`; отдельно — без `tests`; то же для `partial`, `deviation` | код «coverage missing implementation/test» |
| TC-V-24 | AC-10, AC-5 | unit | negative | coverage `status: 'deviation'` / `partial` / `not-implemented` без `discrepancyIds`; `not-applicable` без `note` | код «coverage missing discrepancy/note»; `not-applicable` с `note` — `ok` |
| TC-V-25 | AC-10, AC-5 | unit | negative | io: `fileExists` → false для `implementation[0].path` | код «coverage path missing» |
| TC-V-26 | AC-10, AC-5 | unit | negative | io: файл есть, `readText` не содержит `symbol` | код «symbol not in file» |
| TC-V-27 | AC-10, AC-5 | unit | negative | io: тест-файл есть, `readText` не содержит `name` теста | код «test name not in file»; отдельно — тест-файл отсутствует → «coverage path missing» |
| TC-V-28 | AC-10 | unit | positive | Без `io` | файловые проверки пропущены, остальные выполняются (нет ложного падения) |
| TC-V-29 | AC-10 | unit | negative | Фикстура с 3 разными порчами одновременно | все 3 issue возвращены (валидатор не останавливается на первой), порядок детерминирован |
| TC-V-30 | AC-10 | process | positive | Сопоставить экспортированный перечень кодов ошибок реализации с негативными тестами | на каждый код ≥1 негативный тест (таблица код → тест в `qa-results.md`) |
| TC-V-31 | AC-10 | process | negative | Временно (локально, не коммитить) добавить в `entries/*.json` Rebellion запись с несуществующим `related` → `pnpm --filter @bga/game-rebellion test` (фактическое имя пакета) | тест падает с сообщением, содержащим id записи и код ошибки (сценарий 4 spec); после отката — зелёный |

### 6. Покрытие и аудит (AC-5, AC-6, AC-7)

| TC | Covers | Level | Type | Steps / input | Expected |
|---|---|---|---|---|---|
| TC-C-01 | AC-5 | integration | positive | `validateKnowledgeBase(rebellionKb, realIo)` (io на файлы репозитория) | `ok: true`: все `implementation.path`/`symbol` и `tests.path`/`name` существуют |
| TC-C-02 | AC-5 | integration | positive | Множество записей категорий среза (раунд, Command Phase, активация, движение, транспорт, база, победа, Refresh, настройка, компоненты карты/юнитов) ⊆ `coverage.items[].ruleId` | разность пуста |
| TC-C-03 | AC-5 | integration | positive | Все `kind: 'rule'` вне среза | есть в coverage со статусом `not-implemented` или `not-applicable` (бой, миссии — `not-implemented` со ссылкой на DISC) |
| TC-C-04 | AC-5 | integration | positive | Запись `rebellion:command.activate.place-leader` (или фактический id активации) | `implemented`, implementation в `src/rules/core/activation.ts` (или фактический файл), тест в `test/rules/core/activate.test.ts` (сценарий 1 spec) |
| TC-C-05 | AC-6 | integration | positive | Каждое правило движка аудита R-3..R-10, D-1..D-7 | сопоставлено ≥1 записи KB с coverage-статусом, соответствующим вердикту таблицы аудита (R-7 → `partial`; R-10, D-6 → `deviation`; R-3/R-4/R-5/R-8/R-9 → `implemented`) |
| TC-C-06 | AC-6 | manual-review | positive | Прочитать `docs/game-rules/rebellion/discrepancies.md` | содержит вывод аудита («ошибок реализации в рамках среза не найдено» + перечень отклонений) |
| TC-C-07 | AC-7 | integration | positive | Минимальный перечень расхождений spec (15 пунктов: бой, миссии/назначение, неполный Refresh, цели/репутация, лояльность/подчинение, добровольное раскрытие, выбор базы движком, поле Rebel Base, постоянное условие раскрытия, фикс. расстановка, только стартовые лидеры/нет ССЗ, PASS во время активации, транспорт в одной команде, данные Повстанцев/соседство/лидеры, ограничения компонентов) | каждый пункт сопоставлен ≥1 `DISC-NNN` (тест по ключевым `ruleIds`/титулам + ручная сверка) |
| TC-C-08 | AC-7 | integration | positive | Каждое `DISC-*` | `id` формата `DISC-\d{3}`, уникален, id по порядку; заполнены `kind`, `severity`, `engineBehaviour`, `officialBehaviour`, `decision`, `followUp`; `ruleIds` непусты и резолвятся |
| TC-C-09 | AC-7 | process | positive | `git diff --stat c1ace26 -- packages/games/rebellion/src/rules packages/games/rebellion/src/scenario` + `git status --porcelain` по тем же путям | пусто (код механик не изменён) |
| TC-C-10 | AC-7 | process | positive | `git diff --name-only` задачи против списка файлов SWR-006 (spec «Фактическое состояние») | KB-задача не меняет файлы SWR-006 (`src/ai/**`, `src/server/**`, `src/schema/state.ts`, `apps/**`, `eslint.config.mjs`, корневой `index.ts` платформы); lockfile/зависимости не изменены (R-3) |

### 7. Поиск для Rules Assistant (AC-8)

`createRulesSearch(rebellionKb).search(q)` — ожидаемая запись в **top-3**. Ids назначает автор данных; ниже — тема + страница.
Один параметризованный integration-тест; каждая строка — отдельный кейс.

| TC | Covers | Level | Type | Steps / input (вопрос) | Expected (запись в top-3) |
|---|---|---|---|---|---|
| TC-Q-01 | AC-8 | integration | positive | "Can units leave a system that contains my leader?" | свой лидер блокирует выход юнитов, RR p.9 |
| TC-Q-02 | AC-8 | integration | positive | "Can I activate a system that already has a leader in it?" | активация размещением лидера, RR p.2/9 |
| TC-Q-03 | AC-8 | integration | positive | "Can a leader without tactic values activate a system?" | требование к лидеру для активации, RR p.9 |
| TC-Q-04 | AC-8 | integration | positive | "How many ground units can a transport ship carry?" | вместимость/транспорт, RR p.14 |
| TC-Q-05 | AC-8 | integration | positive | "Can I move units into a system that was not activated?" | движение только в активированную систему из соседних, RR p.9 |
| TC-Q-06 | AC-8 | integration | positive | "When can I pass during the Command Phase?" | пас, RR p.6 (и/или FAQ-разъяснение паса) |
| TC-Q-07 | AC-8 | integration | positive | "Who takes the first turn in the Command Phase?" | порядок хода (Повстанцы первые, чередование), RR p.6 |
| TC-Q-08 | AC-8 | integration | positive | "When is the Rebel base revealed?" | раскрытие базы, RR p.2/11 |
| TC-Q-09 | AC-8 | integration | positive | "Can the Rebel player reveal the base voluntarily?" | FAQ v2.1 clarification: добровольное раскрытие в начале хода Command Phase |
| TC-Q-10 | AC-8 | integration | positive | "Do Star Destroyers or the Death Star reveal the Rebel base?" | исключение: корабли/Звезда Смерти не раскрывают (exceptions записи раскрытия) |
| TC-Q-11 | AC-8 | integration | positive | "How does the Empire win the game?" | победа Империи, RR p.14 |
| TC-Q-12 | AC-8 | integration | positive | "How do the Rebels win?" | время = репутация, RR p.12/14 |
| TC-Q-13 | AC-8 | integration | positive | "What happens during the Refresh Phase?" | Refresh Phase, RR p.12 |
| TC-Q-14 | AC-8 | integration | positive | "Can a subjugated system also be neutral?" | FAQ errata «Neutral Systems» (amends RR p.10) |
| TC-Q-15 | AC-8 | integration | positive | "Where are Rebel starting units placed in standard setup?" | FAQ errata стартовых юнитов + Setup RR p.15 |
| TC-Q-16 | AC-8 | integration | positive | "раскрытие базы" (русский синоним из `keywords`) | раскрытие базы, RR p.11 |
| TC-Q-17 | AC-8 | unit | positive | Повторный вызов того же запроса; новый экземпляр `createRulesSearch` на том же kb | идентичный порядок и `score` (детерминизм); равные score упорядочены стабильно (например, по id) |
| TC-Q-18 | AC-8 | unit | positive | Фильтры `kinds: ['clarification']`, `categories: [...]`, `status: 'verified'`, `limit: 2` | в результате только записи, удовлетворяющие фильтру; длина ≤ limit |
| TC-Q-19 | AC-8 | unit | positive | `citations` у результата | массив `{ sourceId, page, ... }` из `entry.sources`, непуст для `rule`/`clarification` |
| TC-Q-20 | AC-8 | unit | negative | Пустой запрос `""`, запрос из стоп-слов, бессмысленный `"xyzzy qwerty"` | пустой массив (или все score = 0 отброшены), без исключений |

### 8. Контекст для AI Commander (AC-9)

| TC | Covers | Level | Type | Steps / input | Expected |
|---|---|---|---|---|---|
| TC-A-01 | AC-9 | integration | positive | `buildRulesContext(rebellionKb, { phase: 'command', commandTypes: ['ACTIVATE_SYSTEM','MOVE_PIECES','FINISH_ACTIVATION','PASS'], side, maxChars: 6000 })` для `side` = rebel и imperial | `text.length ≤ 6000`; `ruleIds` включают записи активации, движения, транспорта, паса, раскрытия базы, побед (обеих сторон) |
| TC-A-02 | AC-9 | integration | positive | Формат строк `text` | каждая строка `[<id>] <title>: <text> (<SRC> p.<n>)`; id из `ruleIds` присутствуют в `text`; нет полного PDF/длинных цитат |
| TC-A-03 | AC-9 | unit | positive | Два вызова с одинаковыми аргументами; аргументы с переставленным порядком `commandTypes` | идентичный результат (детерминизм) |
| TC-A-04 | AC-9 | unit | negative | `maxChars` = 1, 50, 200, 1000, длина-полного-контекста − 1 | `text.length ≤ maxChars` всегда; `truncated: true`; в `text` нет обрезанных посередине записей (только целые строки — если реализация так решила, зафиксировать); `ruleIds` соответствуют реально вошедшим строкам |
| TC-A-05 | AC-9 | unit | positive | `maxChars` ≥ полного контекста | `truncated: false`; приоритет при обрезке: `ai: 'core'` и `include` раньше situational |
| TC-A-06 | AC-9 | unit | positive | Запись `status: 'needs-review'`, попавшая в контекст | строка помечена `(unverified)` |
| TC-A-07 | AC-9 | unit | positive | Записи `ai: 'none'`; запись без `appliesTo`, не `core`; `include: [id]` | `none` не попадают; несовпавшие по `appliesTo` не попадают; `include` попадает |
| TC-A-08 | AC-9 | process | positive | `git diff` по `apps/api/src/ai/**`, `packages/games/rebellion/src/ai/**` в рамках задачи | изменений нет — интеграция в промпт SWR-006 не делается; описана в `docs/architecture/rules-knowledge.md` (TC-D-01) |

### 9. Сгенерированные документы (AC-5, AC-6, AC-10)

| TC | Covers | Level | Type | Steps / input | Expected |
|---|---|---|---|---|---|
| TC-G-01 | AC-5, AC-6 | integration | positive | Тест актуальности без `UPDATE_KB_DOCS` | `render*` (kb) == содержимое `docs/game-rules/rebellion/{rules-index,coverage-matrix,discrepancies}.md` байт-в-байт |
| TC-G-02 | AC-10 | integration | negative | Локально изменить одну строку в `coverage-matrix.md` (или одно поле в `coverage.json`) → тест | тест падает с понятным сообщением «stale, run with UPDATE_KB_DOCS=1»; откат → зелёный |
| TC-G-03 | AC-5 | process | positive | `UPDATE_KB_DOCS=1` прогон дважды подряд | второй прогон не даёт diff (детерминизм рендера); файлы проходят `prettier --check` (входят в `pnpm lint`) |

### 10. Авторское право (AC-11)

| TC | Covers | Level | Type | Steps / input | Expected |
|---|---|---|---|---|---|
| TC-P-01 | AC-11 | process | negative | `git ls-files '*.pdf' '*.PDF'` (весь репозиторий) + `git status --porcelain` на `.pdf` | пусто |
| TC-P-02 | AC-11 | integration | positive | Все записи Rebellion | каждая `quote` ≤ 25 слов, каждый `text` ≤ 600 символов (часть TC-C-01, но отдельная проверка в тесте данных) |
| TC-P-03 | AC-11 | integration | negative | Суммарный объём цитат по каждому источнику | ≤ лимита, заданного реализацией (см. Q-2); тест на фикстуре с превышением лимита падает |
| TC-P-04 | AC-11 | manual-review | positive | Выборка ≥ 15 записей: сравнить `text` с PDF (временная папка) | `text` — собственный пересказ, не дословная копия абзацев; цитаты дословны и короткие |

### 11. Ручная сверка с первоисточниками (R-1; AC-3, AC-4)

| TC | Covers | Level | Type | Steps / input | Expected |
|---|---|---|---|---|---|
| TC-M-01 | AC-3, AC-4 | manual-review | positive | Случайная выборка ≥ 15 `verified` записей (зафиксировать seed/список id), минимум: 8 RR, 3 LTP (по зеркалу), 3 FAQ, все записи активации/движения/раскрытия/побед среди них ≥ 4. Открыть страницу из `sources[].page` | содержание `text` соответствует странице; `quote` найдена дословно на указанной странице; `section` совпадает. Любое несоответствие → дефект (major, если меняет смысл правила) |
| TC-M-02 | AC-4 | manual-review | positive | Все `needs-review` записи | у каждой понятна причина (в `rationale`/`text`/связанном DISC); ни одна однозначная по источнику запись не оставлена `needs-review` без причины |
| TC-M-03 | AC-1, AC-4 | manual-review | negative | Поиск в данных по ключевым словам Rise of the Empire (`Rise of the Empire`, `mission deck ROTE`, страницы FAQ 6–8) | ни одна запись не ссылается на материалы дополнения |

### 12. Документация и delivery (AC-12, AC-13)

| TC | Covers | Level | Type | Steps / input | Expected |
|---|---|---|---|---|---|
| TC-D-01 | AC-12 | manual-review | positive | Прочитать `docs/architecture/rules-knowledge.md` | описаны: функции C-3 с сигнатурами, будущий `RulesKnowledgeService` (загрузка JSON в `apps/api`), HTTP-эндпоинты Rules Assistant, интеграция `buildRulesContext` в AI Commander, поэтапный план Rules Assistant |
| TC-D-02 | AC-12 | process | positive | Сигнатуры в документе vs экспорт `@bga/platform/rules-kb` | имена функций и параметров совпадают |
| TC-D-03 | AC-13 | process | positive | `pnpm verify` (полный, с логом в `artifacts/logs/verify.log`) | код 0; число тестов каждого набора ≥ базовой линии |
| TC-D-04 | AC-13 | process | positive | `node scripts/check-task.mjs docs/tasks/SWR-005C`; `node --test scripts/` | код 0 |
| TC-D-05 | AC-13 | manual-review | positive | `delivery-report.md` → Verification | каждая проверка со статусом и путём к реальному логу; непрогнанное — `not_run`; есть follow-up аудита SWR-006 (A-6) |

## Coverage

| AC | Test cases |
|---|---|
| AC-1 | TC-S-01..TC-S-08, TC-V-13, TC-V-14, TC-V-15, TC-M-03 |
| AC-2 | TC-F-01..TC-F-06 |
| AC-3 | TC-R-01..TC-R-05, TC-V-22, TC-M-01 |
| AC-4 | TC-K-01..TC-K-05, TC-V-16, TC-V-20, TC-V-21, TC-M-01, TC-M-02 |
| AC-5 | TC-C-01..TC-C-04, TC-V-09, TC-V-10, TC-V-23..TC-V-27, TC-G-01, TC-G-03 |
| AC-6 | TC-C-05, TC-C-06, TC-G-01 |
| AC-7 | TC-C-07..TC-C-10 |
| AC-8 | TC-Q-01..TC-Q-20 |
| AC-9 | TC-A-01..TC-A-08 |
| AC-10 | TC-V-01..TC-V-31, TC-G-02 |
| AC-11 | TC-P-01..TC-P-04, TC-V-18, TC-V-19 |
| AC-12 | TC-D-01, TC-D-02 |
| AC-13 | TC-D-03..TC-D-05 |

Итого: 108 кейсов (из них 16 вопросов поиска TC-Q-01..16; manual-review: TC-S-06, TC-F-06, TC-R-04, TC-C-06, TC-P-04,
TC-M-01..03, TC-D-01, TC-D-05). Негативные: TC-S-07/08, TC-F-04, TC-V-02..27, TC-V-29, TC-V-31, TC-Q-20, TC-A-04, TC-G-02,
TC-P-01, TC-P-03, TC-M-03.

## Open questions (для Analyst / backend-lead)

- **Q-1.** Как валидатор опознаёт FAQ-источник для правила «clarification ⇒ источник FAQ»? В C-2 у `sources` manifest нет поля
  `kind`/тега («FAQ-тегом source kind» в C-3). Предлагается явное поле `kind: 'rules'|'faq'|'tutorial'` в source — это поправка
  контракта C-2. Без него TC-V-16 не воспроизводим однозначно.
- **Q-2.** AC-11: «суммарный объём цитат по источнику ограничен» — лимит не задан. Нужно число (например, ≤ 1500 слов на
  источник или ≤ N % объёма) — от него зависит TC-P-03.
- **Q-3.** Должна ли `implementation-note` иметь ≥1 источник со страницей (AC-3 «у каждой записи ≥1 источник со страницей»)
  или достаточно ссылки на DISC? И каким полем `implementation-note` ссылается на расхождение — `related` (там только entry id)
  или отдельное поле (`discrepancyIds`)? Влияет на TC-R-01, TC-K-04.
- **Q-4.** `buildRulesContext` при обрезке: отбрасывать целые записи или допускается обрезка строки? Предлагаю — только
  целые строки, `ruleIds` = реально вошедшие (TC-A-04).
- **Q-5.** Валидируются ли `exceptions[].sources` и `discrepancy.refs` теми же правилами источника/страницы и ссылок, что
  `sources`/`related`? Предлагаю — да (иначе это обход проверки страниц).
- **Q-6.** `search` для пустого/бессмысленного запроса — пустой массив или записи с score 0? Предлагаю — пустой (TC-Q-20).
- **Q-7.** Базовая линия для TC-C-09 и регрессии: `c1ace26` или коммит влития SWR-006, если он появится до QA_EXECUTION?
