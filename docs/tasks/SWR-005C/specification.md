# Specification — SWR-005C Rules Knowledge Foundation

## Business goal
Один проверяемый набор правил Star Wars: Rebellion (только базовая игра) для трёх потребителей: Game Core (реализация и
проверка механик), AI Commander (цели, ограничения, доступные действия — компактно, без PDF в каждом запросе) и будущего
Rules Assistant (ответы со ссылками на страницы официальных источников). Формат расширяемый: следующая игра
(`forbidden-stars` уже есть в реестре) добавляет только данные.

## Фактическое состояние (проверено Analyst, 2026-11-20, `main` @ `c1ace26` + незакоммиченная SWR-006)
- Документы правил: `docs/game-rules/rebellion-reference.md` (факты SWR-005 с уровнями уверенности, источники RR/LTP/FAQ
  2016 через зеркала) и `docs/game-rules/rebellion-core-v1.md` (что делает движок, отклонения D-1..D-7). Машинно-читаемой
  базы правил нет; ссылок на страницы — только на разделы.
- Движок `core-v1`: `packages/games/rebellion/src/rules/core/*` (активация, движение, пасы, обновление, раскрытие базы,
  победы), данные `src/scenario/core/*` (карта, юниты, лидеры, расстановка первой партии), тесты `test/rules/core/*`,
  `test/scenario/core-data.test.ts`. SWR-006 **не трогает** `src/rules/core` и `src/scenario`; меняет `src/ai/**`,
  `src/server/**`, `src/schema/state.ts`, `apps/api/**`, `apps/web/**`, `eslint.config.mjs`, часть тестов.
- **Источники проверены (2026-11-20), PDF скачаны только во временную папку вне репозитория:**

  | Тег | Документ | Результат |
  |---|---|---|
  | RR | Rules Reference, 16 стр., URL PO | HTTP 200, Last-Modified 2016-03-22, sha256 `0b5af3a2…a35a`; нумерация страниц PDF = печатная (стр. 2 = «02»). Полностью прочитан. |
  | LTP | Learn to Play, 20 стр., URL PO | CDN FFG отвечает **503** (повторно, с разными UA; web.archive.org из окружения недоступен). Прочитана копия 1j1ju (`cdn.1j1ju.com/.../d0-star-wars-rebellion-rulebook.pdf`, sha256 `e471220f…fe16`, 20 стр., та же вёрстка, что использовалась в SWR-005). Записи с LTP помечаются как сверенные по зеркалу. |
  | FAQ | FAQ & Errata v2.1, 8 стр., URL PO | HTTP 200, Last-Modified 2019-05-09, sha256 `0f6cdcbe…d82e`, подпись «May 2019». Стр. 1–5 — базовая игра, **стр. 6–8 — Rise of the Empire (исключены)**. Более новой версии не найдено (поиск 2026-11-20; FFG передала линейку Asmodee, отдельных обновлений Rebellion не публиковалось). Заменяет FAQ 18 May 2016, на который ссылался SWR-005. |

  Приоритет (RR «Golden Rules», стр. 2): карта > RR > LTP; FAQ errata изменяет текст RR/карт.
- Errata FAQ v2.1, влияющие на нашу базу: добровольное раскрытие базы — только в начале своего хода Command Phase до
  использования лидера или паса; «Neutral Systems» (RR стр. 10) исправлено — подчинённая система может быть нейтральной;
  стартовые юниты Повстанцев (стандартная расстановка) — «Rebel Base» и/или одна система без имперских юнитов.

## Scenarios
1. **Разработчик Game Core** открывает `docs/game-rules/rebellion/coverage-matrix.md`, видит для правила
   `rebellion:command.activate.place-leader` статус `implemented`, файл/символ реализации и тесты; для боя — `not-implemented`
   со ссылкой на расхождение.
2. **AI Commander (следующая итерация)** вызывает `buildRulesContext(kb, { phase: 'command', commandTypes: [...legal action
   types], side })` и получает ≤ лимита символов компактный текст правил с id и цитатами страниц — без PDF.
3. **Rules Assistant (будущий)** вызывает `search("can units leave a system with my leader?")` и получает ранжированные записи
   с `source`/`page`, отвечает пользователю со ссылкой «RR стр. 9».
4. **Автор данных** добавляет запись с несуществующим `related` id или длинной цитатой — `pnpm test` падает с понятной ошибкой.
5. **Вторая игра**: в `packages/games/<id>/knowledge/` кладутся данные того же формата — код платформы не меняется.

## Contract (заморожен до параллельной работы; поправки — через Analyst)

### C-1. Размещение
| Что | Где |
|---|---|
| Игронезависимый формат и функции (чистый TS, только `zod`) | `packages/platform/src/rules-kb/**`, новый subpath `@bga/platform/rules-kb` (аддитивно; корневой `index.ts` платформы **не** трогаем — его меняет SWR-006) |
| Данные Rebellion (JSON) | `packages/games/rebellion/knowledge/` — `manifest.json`, `entries/*.json`, `coverage.json`, `discrepancies.json` |
| Тесты формата | `packages/platform/test/rules-kb/**` (фикстура условной второй игры) |
| Тесты данных Rebellion (валидация, наличие файлов/символов/тестов, актуальность сгенерированных md, поиск, AI-контекст) | `packages/games/rebellion/test/knowledge/**` |
| Сгенерированные отчёты (не править руками) | `docs/game-rules/rebellion/{rules-index,coverage-matrix,discrepancies}.md` |
| Описание формата, API, план Rules Assistant | `docs/game-rules/knowledge-base.md`, `docs/architecture/rules-knowledge.md` |

Загрузка JSON с диска — забота потребителя (тесты, будущий сервис в `apps/api`); библиотека получает уже распарсенные объекты
и (для проверок файлов) инъецированные функции `fileExists(path)`, `readText(path)`. Платформа остаётся без `node:*` (B-1).

### C-2. Формат (Zod, `@bga/platform/rules-kb`)
- **Manifest**: `formatVersion: 1`, `gameId` (kebab), `title`, `language: 'en'` (язык текстов записей), `products`
  (включённые продукты, у Rebellion `['base']`), `excludedProducts` (`['rise-of-the-empire']`), `categories` (таксономия игры:
  `{ id, title, parent? }`), `sources`: `{ id, title, publisher, url, version, date, retrievedAt, sha256, pages, precedence
  (число, меньше = главнее), status: 'current'|'superseded', mirror?: {url, sha256, reason}, excludedPages?: number[], notes? }`,
  `sourceSections`: перечень тем первоисточника, которые должны быть покрыты (`{ sourceId, page, title, coveredBy?: 'skip'
  + reason }`) — для проверки полноты.
- **Entry** (`entries/*.json` = массивы): `id` — `^<gameId>:[a-z0-9]+(\.[a-z0-9-]+)+$` (например
  `rebellion:command.activate.place-leader`); `kind`: `rule` (официальное правило RR/LTP) | `clarification` (FAQ: ответ или
  errata) | `interpretation` (наш вывод там, где источник молчит/неоднозначен) | `implementation-note` (как ведёт себя/чего не
  умеет движок; ссылается на discrepancy); `status`: `verified` | `needs-review`; `product` (из `manifest.products`);
  `category` (из таксономии); `title`; `text` — **собственный пересказ** (английский, ≤ 600 символов); `sources`:
  `[{ sourceId, page, section, quote? }]` (`quote` ≤ 25 слов; у `rule`/`clarification` ≥ 1 источник, у `interpretation` —
  источник, от которого рассуждаем, плюс обязательный `rationale`); `exceptions?: [{ text, ruleIds?, sources? }]`;
  `related?: id[]`; `amends?: id[]` (errata/разъяснение уточняет запись); `appliesTo?: { phases?, commands?, sides? }`
  (для выборки AI-контекста); `ai?: 'core'|'situational'|'none'` (по умолчанию `situational`); `keywords?: string[]`
  (синонимы для поиска, допустимы русские); `rationale?`.
- **Coverage** (`coverage.json`): `engine` (`core-v1`), `items: [{ ruleId, status: 'implemented'|'partial'|'deviation'|
  'not-implemented'|'not-applicable', implementation?: [{ path, symbol }], tests?: [{ path, name }], discrepancyIds?: [],
  note? }]`. `implemented`/`partial`/`deviation` ⇒ ≥1 implementation и ≥1 test; `deviation`/`partial`/`not-implemented` ⇒
  ≥1 discrepancy (кроме `not-applicable` с `note`).
- **Discrepancies** (`discrepancies.json`): `[{ id: 'DISC-NNN', title, kind: 'intentional-deviation'|'missing-mechanic'|
  'latent-gap'|'data-uncertainty'|'bug', severity: 'low'|'medium'|'high', ruleIds, engineBehaviour, officialBehaviour,
  decision: 'accepted-for-slice'|'fix-later'|'verify-with-box'|'fixed', followUp, refs?: [] }]`.

### C-3. Функции `@bga/platform/rules-kb`
- `parseKnowledgeBase({ manifest, entries, coverage?, discrepancies? })` → `KnowledgeBase` (Zod, ошибка с путём к полю).
- `validateKnowledgeBase(kb, io?)` → `{ ok, issues: [{ code, path, message }] }`: уникальность и формат id; префикс id =
  `gameId`; ссылки (`related`, `amends`, `exceptions.ruleIds`, coverage `ruleId`/`discrepancyIds`, discrepancy `ruleIds`)
  существуют; `sourceId` и страница в `1..pages` и не в `excludedPages`; `product` ∈ `products`; категория существует;
  длина цитат; правила по kind/status (interpretation ⇒ rationale; clarification ⇒ источник с FAQ-тегом source kind; ...);
  каждый `sourceSections` покрыт записью с этим источником/страницей или явно `skip`; coverage-правила C-2; при переданном `io`
  — существование файлов, вхождение `symbol` в текст файла, вхождение `name` теста в текст тестового файла. Коды ошибок
  стабильны (используются в негативных тестах).
- `createRulesSearch(kb)` → `{ search(query, { kinds?, categories?, status?, limit? }) → [{ entry, score, citations }] }`:
  BM25-подобное ранжирование по `title`, `text`, `keywords`, `exceptions`, без зависимостей и сети, детерминированно.
- `buildRulesContext(kb, { phase?, commandTypes?, side?, include?: id[], maxChars })` → `{ text, ruleIds, truncated }`:
  записи `ai: 'core'` + совпавшие по `appliesTo`, упорядочены детерминированно, формат строки
  `[<id>] <title>: <text> (RR p.9)`; никогда не превышает `maxChars`; `needs-review` помечены `(unverified)`.
- `renderRulesIndex(kb)`, `renderCoverageMatrix(kb)`, `renderDiscrepancies(kb)` → markdown (детерминированно).

### C-4. Clarifications (ответы Analyst на вопросы QA, 2026-11-20; входят в контракт)
- Q-1: у источника manifest есть `kind: 'rules'|'faq'|'tutorial'|'other'`; `clarification` ⇒ ≥1 источник с `kind: 'faq'`.
- Q-2: суммарный объём `quote` по одному источнику ≤ 400 слов (проверка `quote-budget`).
- Q-3: у записи есть необязательное `discrepancyIds: string[]`; `implementation-note` ⇒ ≥1 `discrepancyIds` (существующие)
  и ≥1 источник (страница официального правила, о котором заметка).
- Q-4: `buildRulesContext` при усечении отбрасывает только целые строки; `ruleIds` — только вошедшие записи; `truncated: true`.
- Q-5: `exceptions[].sources` и `discrepancy.refs` (`{ sourceId, page }` или id записи) проверяются так же, как `sources`/ссылки.
- Q-6: пустой или бессмысленный запрос поиска → пустой массив.
- Q-BE-3 (принято): рендеры принимают необязательный `{ title?, preamble? }`; вывод аудита — `packages/games/rebellion/knowledge/audit-summary.md` как preamble `discrepancies.md`.
- Q-BE-5 (принято): `KnowledgeBaseIo` синхронный (`fileExists`, `readText`), пути от корня репозитория.
- Q-8 (review F-1): «все записи категорий среза» в AC-5 = все записи `rule`, `clarification`, `interpretation` этих
  категорий; `implementation-note` в coverage не входят (они сами описывают движок и связаны с расхождениями).
- Q-7: базовая точка для «код механик не изменён» и регрессии — `c1ace26` (SWR-006 `src/rules`/`src/scenario` не меняет).

## Audit of the SWR-005 `core-v1` slice (итог ANALYSIS; данные — в `discrepancies.json`)
Сверено построчно с RR/LTP/FAQ v2.1. **Ошибок реализации в рамках среза не найдено**: всё, что движок делает, совпадает
с официальными правилами; расхождения — осознанные упрощения среза или отсутствующие механики.

| Правило движка | Официально | Вердикт |
|---|---|---|
| R-3 Command Phase: Повстанцы первые, чередование, пас до конца фазы, фаза кончается, когда спасовали оба | RR стр. 6; LTP стр. 7 | совпадает |
| R-4 Активация: лидер из пула в любую систему, в т.ч. с лидером; без тактических значений — нельзя | RR стр. 2, 9 | совпадает (Мон Мотма без тактики — данные фан-источника, `needs-review`) |
| R-5 Движение: только в активированную, только из соседних, свой лидер блокирует выход, неподвижные стоят, транспорт | RR стр. 9, 14; LTP стр. 7 | совпадает; транспорт проверяется в пределах одной команды MOVE_PIECES (одна исходная система) — ограничение UX, не правил |
| PASS запрещён во время своей активации | RR стр. 6 «pass at any time»; FAQ стр. 5 «пас вместо хода» | интерпретация: пас заменяет ход, начатая активация — ход; `needs-review` (низкий риск) |
| R-7 Обновление: возврат лидеров (шаг 1), время +1 (шаг 5) | RR стр. 12 | частично (шаги 2–4, 6 и наборы/постройка отсутствуют) |
| R-8 Раскрытие базы: в конце имперской активации системы базы при имперском наземном юните; корабли/Звезда Смерти не раскрывают | RR стр. 2 (шаг 3), 11; FAQ стр. 1 | совпадает в срезе; официально условие **постоянное** («ever has loyalty or ground units») — станет пробелом, когда наземные юниты/лояльность смогут появиться иначе (DISC latent-gap) |
| R-9 Победа Империи: база раскрыта, есть имперский юнит, нет юнитов Повстанцев — сразу | RR стр. 14 | совпадает |
| Победа Повстанцев: время = репутация | RR стр. 12, 14 | совпадает; репутация не меняется (целей нет) |
| R-10 Выбор базы движком по хешу, без систем со стартовыми юнитами Повстанцев | RR стр. 15 шаг 9; LTP стр. 5 шаг 9 | осознанное отклонение (выбирает игрок; Ботави официально допустим) |
| D-6 «Rebel Base» = система базы | RR стр. 10–11 | осознанное отклонение; влияет на правило «лидер на поле Rebel Base блокирует только поле», активацию поля Rebel Base |
| Данные: вместимость Повстанцев, Мустафар–Утапау, регионы, лидеры без тактики | фан-источники | `verify-with-box` |

Минимальный перечень расхождений, который должен быть в `discrepancies.json` (id назначаются по порядку): бой (D-1), миссии и
фаза назначения (D-2), неполное обновление (D-3: миссии, зонды, цели, найм, постройка, развёртывание), цели и репутация,
лояльность/подчинение (D-5, шаг 5 активации), добровольное раскрытие базы, выбор базы движком (D-4/R-10), поле «Rebel Base»
(D-6), постоянное условие раскрытия (latent-gap), фиксированная расстановка первой партии вместо стандартной (D-5), только
стартовые лидеры/нет ССЗ (D-7), PASS во время активации (interpretation), транспорт в пределах одной команды (UX), данные
Повстанцев/соседство/лидеры (`data-uncertainty`), отсутствие ограничений компонентов (n/a в срезе).

## Acceptance criteria
- **AC-1:** `manifest.json` Rebellion описывает RR, LTP, FAQ v2.1 с URL PO, версией/датой, sha256, числом страниц, датой
  проверки; LTP — с зеркалом и причиной; FAQ стр. 6–8 в `excludedPages`; `products: ['base']`,
  `excludedProducts: ['rise-of-the-empire']`; проверки отвергают запись с продуктом/страницей вне этого.
- **AC-2:** Формат игронезависим: схемы и функции в `@bga/platform/rules-kb` без упоминаний Rebellion; тест платформы строит,
  валидирует, ищет и собирает контекст по фикстуре другой игры; формат описан в `docs/game-rules/knowledge-base.md`.
- **AC-3:** Справочник Rebellion покрывает каждую тему глоссария RR базовой игры (кроме Team Game — `skip` с причиной),
  настройку (RR стр. 15), структуру раунда LTP и расстановку первой партии (LTP стр. 16); у каждой записи id, категория,
  kind, status, ≥1 источник со страницей; исключения записаны в `exceptions`; ≥ 80 записей.
- **AC-4:** Записи разделены по `kind`; все errata и использованные ответы FAQ базовой игры — `clarification` со ссылкой на FAQ
  и `amends` на запись RR; интерпретации имеют `rationale`, спорные — `needs-review`; заметки о неполной реализации —
  `implementation-note` со ссылкой на расхождение.
- **AC-5:** `coverage.json` содержит все записи категорий, относящихся к срезу core-v1 (раунд, Command Phase, активация,
  движение, транспорт, база, победа, Refresh, настройка, компоненты карты/юнитов) и все остальные `rule`
  (как `not-implemented`/`not-applicable`); у реализованных — существующие файл+символ и тест-файл+имя теста (проверяется
  автоматически); `coverage-matrix.md` сгенерирован и актуален.
- **AC-6:** Аудит core-v1 (таблица выше) отражён в данных: каждое правило движка R-3..R-10/D-1..D-7 сопоставлено записи KB
  со статусом; вывод аудита записан в `docs/game-rules/rebellion/discrepancies.md`.
- **AC-7:** Каждое расхождение из минимального перечня есть в `discrepancies.json` с kind, severity, поведением движка и
  официальным поведением (со ссылкой на записи), решением и follow-up; код механик (`src/rules`, `src/scenario`) не изменён.
- **AC-8:** `createRulesSearch` находит ожидаемую запись в top-3 для ≥ 12 типовых вопросов (тест), детерминирован, умеет
  фильтры по kind/category/status, возвращает цитаты источник+страница.
- **AC-9:** `buildRulesContext` для core-v1 Command Phase (типы legal actions `ACTIVATE_SYSTEM`, `MOVE_PIECES`,
  `FINISH_ACTIVATION`, `PASS`) возвращает ≤ 6000 символов, включает правила активации, движения, транспорта, паса, раскрытия
  базы и побед с id и страницами; детерминирован; никогда не превышает `maxChars`. Интеграция в промпт SWR-006 не делается
  (описана в плане).
- **AC-10:** Автоматические проверки (C-3 `validateKnowledgeBase` + io) входят в `pnpm test`; для каждого кода ошибки есть
  негативный тест; данные Rebellion проходят без ошибок.
- **AC-11:** В репозитории нет PDF и полных текстов: проверка, что цитаты ≤ 25 слов, `text` ≤ 600 символов, суммарный объём
  цитат по источнику ограничен, и что `git ls-files` не содержит `*.pdf` в KB/документах задачи.
- **AC-12:** `docs/architecture/rules-knowledge.md` описывает сервисный интерфейс (функции C-3, будущий `RulesKnowledgeService`
  и HTTP-эндпоинты Rules Assistant), интеграцию с AI Commander и план реализации Rules Assistant по этапам.
- **AC-13:** `pnpm verify` зелёный, `node scripts/check-task.mjs docs/tasks/SWR-005C` OK, `delivery-report.md` с реальными
  результатами проверок.

## Assumptions
- A-1: Тексты записей — английские собственные пересказы (язык источников и промптов AI); русские синонимы допустимы в
  `keywords`; документы задачи и описания — на русском.
- A-2 (обновлено после QA-2): позже в тот же день официальный URL LTP ответил 200 (Last-Modified 2016-03-22, sha256
  `b26b9813…98fc`); QA сравнил текст с зеркалом постранично — идентичен; в manifest записан официальный хеш, зеркало — как
  provenance. Исходно: LTP проверен по зеркалу 1j1ju (CDN FFG 503). Зеркало совпадает с официальной вёрсткой по содержанию; записи со
  ссылкой на LTP остаются `verified`, в manifest отмечено зеркало.
- A-3: Rebel faction sheet (статы/вместимость Повстанцев) в текстовом слое PDF отсутствует — значения не подтверждены
  официально, `needs-review`/`verify-with-box`.
- A-4: Генерация md — по запуску теста с `UPDATE_KB_DOCS=1`; без флага тест проверяет актуальность.
- A-5: Субпуть `@bga/platform/rules-kb` — аддитивное изменение публичного контракта платформы, согласовано Analyst + backend-lead.
- A-6: SWR-006 выбирает только среди `coreLegalActions` (правила нарушить не может). Предварительно: тексты целей AI
  (`src/ai/describe.ts`) согласуются с правилами среза. Полный аудит поведения SWR-006 против KB — отдельный пункт после её
  влития (follow-up в delivery-report).

## Risks
- R-1: Ошибка пересказа правила → неверные ответы AI/помощника. Митигация: ссылки на страницы, `needs-review`, ревью по PDF.
- R-2: Матрица покрытия устаревает при изменении кода. Митигация: автоматическая проверка путей/символов/имён тестов.
- R-3: Конфликт с SWR-006/SWR-007 (lockfile, eslint). Митигация: не добавлять пакеты/зависимости, не трогать eslint/workspace.

## Out of scope
- Исправление механик (бой, миссии, Refresh, лояльность); интеграция KB в промпт AI Commander и HTTP API Rules Assistant
  (только интерфейс и план); Rise of the Empire; Team Game (3–4 игрока); тексты карт миссий/действий/целей/тактики.
