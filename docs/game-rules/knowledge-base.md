# База знаний правил настольных игр — формат и работа с ней

Статус: введено в SWR-005C (2026-11-20). Формат игронезависимый; первая игра — Star Wars: Rebellion
(`packages/games/rebellion/knowledge/`). Код формата и функций — `@bga/platform/rules-kb`
(`packages/platform/src/rules-kb/**`, только `zod`, без `node:*`). Сервисный интерфейс и план Rules Assistant —
[`docs/architecture/rules-knowledge.md`](../architecture/rules-knowledge.md).

## Зачем

Один проверяемый набор правил для трёх потребителей: Game Core (что реализовано и чем проверено), AI Commander
(компактная выборка правил вместо PDF) и будущий Rules Assistant (ответы со ссылкой на страницу официального источника).
Правила движка остаются в коде (`packages/games/<id>/src/rules`); база знаний их **описывает и сверяет**, а не заменяет.

## Где лежат данные игры

```text
packages/games/<gameId>/knowledge/
  manifest.json          источники, продукты, таксономия категорий, перечень тем первоисточника (sourceSections)
  entries/*.json         записи — массивы; разбиение по файлам произвольное (у Rebellion — по группам категорий)
  coverage.json          матрица покрытия: правило → реализация (файл+символ) → тесты → статус
  discrepancies.json     расхождения движка с официальными правилами (DISC-NNN)
  audit-summary.md       (необязательно) вывод аудита — preamble сгенерированного discrepancies.md
packages/games/<gameId>/test/knowledge/   тесты данных (валидация с io, поиск, контекст AI, актуальность md)
docs/game-rules/<gameId>/                 сгенерированные rules-index.md, coverage-matrix.md, discrepancies.md (не править руками)
```

JSON читается потребителем (тестом или сервисом) с диска и передаётся в `parseKnowledgeBase` уже распарсенным;
`import x from '*.json'` не используется.

## Manifest

| Поле | Смысл |
|---|---|
| `formatVersion` | всегда `1` |
| `gameId` | kebab-case id игры; префикс всех id записей (`<gameId>:...`) |
| `title`, `language` | название; язык текстов записей — `en` (пересказы на английском; русские синонимы — в `keywords`) |
| `products` / `excludedProducts` | включённые продукты (у Rebellion `['base']`) и явно исключённые (`['rise-of-the-empire']`) |
| `categories` | таксономия игры `{ id, title, parent? }`; фильтр поиска по категории включает потомков |
| `sources` | `{ id (короткий тег, он же метка цитаты: RR, LTP, FAQ), kind: rules/faq/tutorial/other, title, publisher, url, version, date, retrievedAt, sha256, pages, precedence (меньше = главнее), status: current/superseded, mirror?: {url, sha256, reason}, excludedPages?, notes? }` |
| `sourceSections` | темы первоисточника, которые обязаны быть покрыты: `{ sourceId, page, title, coveredBy?: 'skip', reason? }`. Тема покрыта, если хоть одна запись ссылается на эту страницу этого источника; иначе — `skip` с причиной |

## Entry (запись)

| Поле | Обязательно | Смысл |
|---|---|---|
| `id` | да | `^<gameId>:[a-z0-9]+(\.[a-z0-9-]+)+$`, например `rebellion:command.activate.place-leader`; id стабилен — на него ссылаются coverage, расхождения и ответы ассистента |
| `kind` | да | `rule` — официальное правило (книга правил/учебник); `clarification` — ответ FAQ или errata (нужен источник `kind: faq`, обычно `amends` на исправляемую запись); `interpretation` — наш вывод там, где источник молчит или неоднозначен (обязателен `rationale`, обычно `needs-review`); `implementation-note` — как ведёт себя или чего не умеет движок (обязательны `discrepancyIds` и источник — страница официального правила) |
| `status` | да | `verified` — сверено со страницей источника; `needs-review` — неоднозначно или данные из неофициальных источников |
| `product`, `category` | да | из `manifest.products` и `manifest.categories` |
| `title`, `text` | да | `text` — **собственный пересказ**, ≤ 600 символов; не копировать абзацы |
| `sources` | да | `[{ sourceId, page, section, quote? }]`; `quote` — только если важны точные слова: ≤ 25 слов, суммарно ≤ 400 слов на источник |
| `exceptions` | нет | `[{ text, ruleIds?, sources? }]` — исключения из правила со ссылками на записи |
| `related`, `amends` | нет | id других записей; `amends` — эта запись уточняет/исправляет указанные |
| `appliesTo` | нет | `{ phases?, commands?, sides? }` — строки игры для выборки контекста AI (у Rebellion фазы `assignment`, `command`, `refresh`, `setup`, команды `ACTIVATE_SYSTEM`, `MOVE_PIECES`, `FINISH_ACTIVATION`, `PASS`, стороны `rebels`, `empire`) |
| `ai` | нет | `core` — нужно в каждом решении AI; `situational` (по умолчанию) — по `appliesTo`; `none` — не для AI |
| `keywords` | нет | синонимы для поиска, допустимы русские |
| `rationale`, `discrepancyIds` | по kind | см. выше |

## Coverage и Discrepancies

- `coverage.json`: `{ engine, items: [{ ruleId, status, implementation?: [{path, symbol}], tests?: [{path, name}], discrepancyIds?, note? }] }`.
  Статусы: `implemented`, `partial`, `deviation`, `not-implemented`, `not-applicable`. Каждая запись `kind: 'rule'`
  должна иметь пункт. `implemented/partial/deviation` ⇒ ≥1 `implementation` и ≥1 `tests`; `partial/deviation/not-implemented` ⇒
  ≥1 `discrepancyIds`; `not-applicable` ⇒ `note`. Пути — от корня репозитория. Автоматическая проверка (C-3) слабее,
  чем кажется: `symbol` ищется как целое слово **в любом месте файла** (подходит и импорт), `name` — как подстрока **в любом
  месте тест-файла** (подходят и комментарии). Поэтому `name` копируют из заголовка `it(`/`describe(`, а соответствие
  смыслу проверяет ревью. Помимо всех `rule`, coverage игры с движком должен включать все `clarification` и
  `interpretation` категорий среза движка (у Rebellion — спецификация SWR-005C, C-4 Q-8); `implementation-note` в coverage
  не входят.
- `discrepancies.json`: `[{ id: 'DISC-NNN', title, kind: intentional-deviation|missing-mechanic|latent-gap|data-uncertainty|bug,
  severity: low|medium|high, ruleIds, engineBehaviour, officialBehaviour, decision: accepted-for-slice|fix-later|verify-with-box|fixed,
  followUp, refs?: [id записи | {sourceId, page}] }]`. В `officialBehaviour` указывать страницы (`RR p.11`).

## Проверки (`validateKnowledgeBase`)

Стабильные коды ошибок (`KB_ISSUE_CODES`): дубли и родители категорий, дубли источников, конфликт продуктов; формат,
префикс и уникальность id; висячие `related`/`amends`/`exceptions.ruleIds`; неизвестные продукт, категория, источник,
расхождение; страница вне `1..pages` или в `excludedPages`; длина текста и цитат, бюджет цитат; правила по `kind`;
непокрытые `sourceSections`; правила coverage; формат, уникальность и ссылки расхождений; при переданном `io` —
существование файлов, символов и имён тестов (`FILE_MISSING`, `SYMBOL_NOT_FOUND`, `TEST_NOT_FOUND`).
Ограничение: `SECTION_NOT_COVERED` проверяет покрытие на уровне **страницы** — тема считается покрытой, если любая запись
ссылается на эту страницу. Полнота по отдельным темам одной страницы автоматически не проверяется (сверка — вручную на
ревью; возможное развитие — `coveredBy` со списком id записей).
Ошибка формы JSON — `KnowledgeBaseParseError` (`SCHEMA_INVALID`) с путём к полю, например `entries.37.sources.0.page`.

## Как добавить правило (Rebellion)

1. Открыть страницу официального PDF (скачивать во временную папку **вне** репозитория; PDF и полные тексты не коммитить).
2. Добавить запись в подходящий `entries/*.json`: свой пересказ, `sources` со страницей и разделом, при необходимости
   `exceptions`, `amends`, `appliesTo`, `keywords`.
3. Для `kind: 'rule'` добавить пункт в `coverage.json` (статус и, если реализовано, файл+символ и тест).
4. Если поведение движка расходится — запись в `discrepancies.json` и/или `implementation-note`.
5. Прогнать проверки и перегенерировать документы (ниже).

## Как добавить новую игру (только данные)

1. Создать `packages/games/<gameId>/knowledge/` с `manifest.json` (свои источники, таксономия, `sourceSections`),
   `entries/*.json`, при наличии движка — `coverage.json` и `discrepancies.json`.
2. Скопировать тесты данных из `packages/games/rebellion/test/knowledge/` (загрузчик `load-kb.ts`, `validate`, `search`,
   `context`, `generated-docs`) и заменить пути и ожидаемые id.
3. Код платформы не меняется: формат и функции общие. Фикстура условной второй игры — `packages/platform/test/rules-kb/fixture.ts`.

## Команды

```bash
pnpm --filter @bga/platform exec vitest run test/rules-kb                 # тесты формата и функций
pnpm --filter @bga/game-rebellion exec vitest run test/knowledge          # данные Rebellion: 0 issues с io, поиск, контекст, md
UPDATE_KB_DOCS=1 pnpm --filter @bga/game-rebellion exec vitest run test/knowledge/generated-docs.test.ts   # перегенерировать docs/game-rules/rebellion/*.md
pnpm exec prettier --write packages/games/rebellion/knowledge packages/games/rebellion/test/knowledge
```

Без `UPDATE_KB_DOCS=1` тест `generated-docs` падает, если `docs/game-rules/rebellion/*.md` устарели, и подсказывает команду.
Тесты данных входят в `pnpm test`.
