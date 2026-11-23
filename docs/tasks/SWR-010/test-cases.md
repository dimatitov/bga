# Test cases — SWR-010 Card Foundation & Physical Table Sync v0

Written by QA Lead from `specification.md` (AC-1..AC-24, D-1..D-9, A-1..A-6, R-1..R-5, S-1..S-8) и `request.md`
(раздел G, п. 1–14) **до реализации** (EARLY_QA_DESIGN, 2026-11-23).

**Статус исполнения: ничего не выполнено.** QA не запускал ни одного кейса и ни одной команды проверки (`pnpm` не
запускался — реализации нет). Документ — дизайн проверок, а не доказательство. Результаты появятся только в
`qa-results.md` (логи — `artifacts/logs/`, скриншоты — `artifacts/screenshots/`, traces — `artifacts/playwright-traces/`).

`plan-backend.md` / `implementation-plan.md` пишутся параллельно. Поэтому кейсы описаны **через наблюдаемое поведение**
(входы/выходы, HTTP-ответы, JSON представлений, тексты и состояния UI), а не через имена функций. Колонка **Bind** —
предлагаемое место теста; окончательный путь/имя QA проставляет при сверке с планом (раздел «Сверка с планом», пока не
выполнена). Если реализация расходится с именем, принятым в плане, — это дефект, а не повод подгонять кейс.

Приоритеты: **P0** — блокирует приёмку AC; **P1** — обязателен, дефект может быть minor; **P2** — желательный/защитный.

## Preconditions (общие)

- Node 22.23.5 (`source ~/.nvm/nvm.sh && nvm use 22.23.5`), pnpm 12 через corepack.
- **Запрещено:** трогать `apps/api/prisma/dev.db` и `dev.pre-*.db`, читать `.env`, делать реальные вызовы OpenAI.
  OpenAI-кейсы — только `OA_APP` (fake fetch, `SENTINEL_KEY`, как в SWR-008); сетевой guard (`no-network.unit.test.ts`)
  активен во всех наборах. e2e — штатный стек Playwright (api 3100, web 5174, БД `apps/api/.tmp/e2e.db`,
  `AI_COMMANDER_PROVIDER=bot`). Ручные сверки — dev-конфиг `dev-5180`.
- **Базовая линия регрессии** — полный `pnpm verify` на `f3619a1` (SWR-009) до первого изменения кода SWR-010 →
  `artifacts/logs/baseline-verify.log`; числа кейсов по наборам (scripts / platform / rebellion / forbidden-stars / web /
  api / e2e) снимаются из лога, в этом документе чисел нет намеренно.
- Скриншоты новых кейсов — с задачей `SWR-010` (не переписывать evidence SWR-005/006/009; скриншоты SWR-006 в рабочем
  дереве уже изменены чужой работой — QA их не трогает и не коммитит).
- Уровни: `unit` (Vitest: `packages/platform/test/**`, `packages/games/rebellion/test/**`, `apps/api/test/**/*.unit.test.ts`),
  `integration` (API: Nest `createApp` + SQLite, `apps/api/test/**/*.int.test.ts`, провайдер `bot` или fake OpenAI),
  `component` (web, jsdom + Testing Library), `e2e` (Playwright), `manual` (skill `browser-qa`, скриншот обязателен),
  `static` (grep / ревью файла / архитектурный тест), `bundle` (`pnpm check:bundle` + grep по `apps/web/dist`), `gate`
  (корневая команда / CI).

## Conventions

- Стороны `REB` / `EMP`. Партии (все `core-v1`, если не сказано иное):
  - `G_DIG_REB` — `digital`, человек-Повстанцы vs AI-Империя (bot); `G_DIG_EMP` — `digital`, человек-Империя vs AI-Повстанцы;
  - `G_PHY_REB` — `physical_companion`, человек-Повстанцы vs AI-Империя; `G_PHY_EMP` — `physical_companion`, человек-Империя
    vs AI-Повстанцы; `G_HS` — hot-seat `digital`.
  - `G_OLD_CORE` — строка `core-v1`, созданная до SWR-010 (сиды `packages/games/rebellion/test/fixtures/core/seeds/*.json`,
    golden `golden-*.json`, `test/fixtures/core/views`); `G_OLD_MOCK` — строки `mock-v1` (`apps/api/test/fixtures/v1`, `v2`,
    `packages/games/rebellion/test/fixtures/v1`, `v2`).
- Оракулы секретов — **только** полное состояние/строка БД (`readStoredState`, `storedRow`), никогда ответ API стороны,
  от которой секрет скрыт:
  - `BASE(s)` — система базы; `LOC(s)` — экземпляр карты Location; `PH(s)` — экземпляры карт в руке зондов Империи;
    `DECK(s)` — упорядоченная колода зондов; `BOX(s)` — 5 карт первой партии в зоне «коробка».
  - `SECRET_IDS(x)` — множество строк, идентифицирующих карту/набор карт `x`: id экземпляров, id определений, i18n-ключи
    названий; для `BASE` — дополнительно id системы через path-aware `baseLeaks` (`apps/api/test/support/hidden-scan.ts`,
    расширить на карточные пути).
- Метаморфные преобразования состояния (QA-хелперы, сохраняют правила и инварианты):
  - `swapHand(s)` — поменять одну карту `PH(s)` с картой из `DECK(s)` (не базы);
  - `permuteDeck(s, π)` — переставить `DECK(s)`;
  - `relocateBase2(s, b')` — существующий `relocateBase` + обмен `LOC(s)` с картой `b'` из колоды (`b'` — допустимая база).
  - «Равны» = равенство сериализованного JSON после `MASK` (удаление `at`, `createdAt`, `updatedAt`, request id); для двух
    БД — один и тот же `sessionId` (схема `automation-hidden-info.int.test.ts`).
- `DP(s)` — `decisionPoint` AI; `REQ` — полный запрос к OpenAI, записанный fake fetch (тело + заголовки, кроме
  `Authorization`); `DIAG(id)` — `GET /api/dev/ai/sessions/:id/decisions`.
- `Q(s)` — очередь задач стола; `HEAD(s)` — головная задача. `CONFIRM(taskId, v)` — команда подтверждения;
  `REGISTER(systemId, v)` — команда регистрации Location (имена команд — по плану). `CMD`/`RUN` — `POST
  /api/sessions/:id/commands` / `POST /api/sessions/:id/automation/run`.
- `ROW(id)` — сырая строка `Session` (`state` как строка, `version`, `updatedAt`) + число строк `SessionEvent`.
- `REFRESH(s)` — довести партию до фазы Refresh (оба паса); в unit — через `scenario(...)`/хелперы `play`, в integration —
  командами человека + бот.

## Test cases

### 1. Rules Audit (AC-1)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-AUD-01 | AC-1 | static | positive | P0 | `rules-audit.md` в папке задачи | Ревью по чек-листу: 7 типов (миссии, проекты, действия, цели, тактика, зонды, Location) × 8 аспектов (кто, формирование, получение, открыто/скрыто, время розыгрыша, куда уходит, особые условия, отложенные эффекты) | Все 56 ячеек заполнены или явно помечены «не подтверждено»; есть отдельные разделы: стартовые карты, различия колод сторон, многоэффектные карты, исключения; есть матрица покрытия | ревью, `qa-results.md` |
| TC-AUD-02 | AC-1 | static | positive | P0 | KB `packages/games/rebellion/knowledge` | Извлечь все ссылки вида `rebellion:…` и ссылки на источник из `rules-audit.md`; сверить с id записей KB | Каждая ссылка существует в KB; каждый факт имеет ссылку или пометку «не подтверждено»; висячих id 0 | скрипт в scratchpad + лог |
| TC-AUD-03 | AC-1 | static | negative | P0 | — | Поиск длинных цитат (≥ 25 слов подряд в кавычках, англоязычные абзацы из правил), названий карт миссий/проектов/действий/целей/тактики, которых нет в KB | Нет текстов карт и книг правил; нет выдуманных названий карт (D-1); найденное — дефект | grep + ревью |
| TC-AUD-04 | AC-1, AC-3 | static | positive | P1 | — | Сверить предложенное разбиение (§9 spec) с матрицей покрытия | Каждый отложенный тип имеет строку «следующая задача» с собственными AC; отложенное в аудите = `deferred` в каталоге (TC-REG-06) | ревью |

### 2. Card Registry и каталог v0 (AC-2, AC-3)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-REG-01 | AC-2 | unit | positive | P0 | платформенный подпуть `cards` | Валидные примеры Card Definition, Card Instance, Card Zone, Card Effect | Парсятся; Definition содержит поля: стабильный id, игра, набор правил, тип, фракция/область, название (i18n-ключ), игровые параметры, условия использования, ссылки на источник, статус проверки, статус реализации эффекта | `packages/platform/test/cards/*.test.ts` |
| TC-REG-02 | AC-2 | unit | negative | P0 | то же | По одному: без id; без источника; без статуса проверки; неизвестный статус; лишнее поле (strict); пустое название; дубль id в каталоге | Каждый вход отклоняется схемой/валидатором каталога с понятной ошибкой | то же |
| TC-REG-03 | AC-2 | static | negative | P0 | — | `grep -rniE "rebel|empire|imperial|probe|coruscant|rebellion|swr" packages/platform/src/cards` + проверка импортов (ESLint boundaries / архитектурный тест) | 0 совпадений; платформа не импортирует `packages/games/*` | `scripts/eslint-boundaries.test.mjs` или новый тест |
| TC-REG-04 | AC-2, AC-3 | unit | positive | P0 | каталог Rebellion | Прогнать каждую запись каталога через схему платформы | 100 % записей валидны; у каждой есть источник (id KB/страница) и статус проверки и реализации | `packages/games/rebellion/test/cards/catalog.test.ts` |
| TC-REG-05 | AC-2 | unit | regression | P0 | — | Снимок отсортированного списка id каталога (+ id типов) | Совпадает со снимком; изменение id валит тест (стабильность id) | то же |
| TC-REG-06 | AC-3 | unit | positive | P0 | каталог + `coreDataBaseV1` | Подсчёт карт типа «зонд»; множество их систем | Ровно 31; множество систем = все 32 системы карты `core-v1` минус Корусант; систем-дублей нет; все `verified`; эффект «нет розыгрыша» | то же |
| TC-REG-07 | AC-3 | unit | negative | P0 | то же | Типы миссия/проект/действие/цель/тактика | Определены на уровне типа (зоны, видимость), статус `deferred`; карт этих типов в каталоге 0; нет ни одной карты со статусом `verified` вне зондов/Location | то же |
| TC-REG-08 | AC-3 | unit | negative | P1 | — | Карта Корусанта / несуществующая система в каталоге зондов | Отсутствует; валидатор каталога отклоняет зонд, ссылающийся на систему вне карты | то же |
| TC-REG-09 | AC-2, AC-19 | unit | positive | P1 | `apps/web` локали | Для каждой карты и каждого типа — i18n-ключи названия/описания/типа в RU и EN | Все ключи есть в обоих языках; нет пустых строк; описания — собственные пересказы (ревью выборки) | `apps/web/src/games/rebellion/locales.i18n.test.ts` |
| TC-REG-10 | AC-2 | static | positive | P2 | — | Ревью: Card Effect для зонда/Location | Эффект — дескриптор «нет розыгрыша/поддержанная механика», без исполняемой логики эффектов карт (out of scope) | ревью |

### 3. Инициализация колод (AC-4)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-INIT-01 | AC-4 | unit | positive | P0 | новая партия `core-v1` (`digital`) | Создать состояние; разложить экземпляры по зонам | `BOX` = 5 систем первой партии; `LOC` = 1 карта = `BASE(s)`; `DECK` = 25; рука зондов Империи = 0; сумма 31; каждый экземпляр ровно в одной зоне | `packages/games/rebellion/test/cards/init.test.ts` |
| TC-INIT-02 | AC-4 | unit | positive | P0 | то же | Сравнить `BASE(s)` с `chooseRebelBase(gameId, eligible…)` и с результатом до SWR-010 для 20 фиксированных id | База выбирается тем же алгоритмом и не изменилась для тех же id (регрессия выбора базы) | то же |
| TC-INIT-03 | AC-4 | unit | determinism | P0 | — | Создать партию дважды с одинаковыми входами (id, settings, часы) | Сериализованные состояния байт-идентичны (включая порядок колоды и id экземпляров) | то же |
| TC-INIT-04 | AC-4 | unit | determinism | P0 | — | `Math.random` и `Date.now` подменены константой/исключением во время создания | Результат тот же, что в TC-INIT-03 (перемешивание не зависит от глобального ГСЧ/времени) | то же |
| TC-INIT-05 | AC-4 | unit | property | P1 | 50 разных id партий | Порядок `DECK` | ≥ 45 различных порядков (перемешивание реально зависит от id); в каждом — мультимножество = 31 − BOX − LOC | то же |
| TC-INIT-06 | AC-4 | unit | negative | P1 | — | Партия `mock-v1` и `rise-of-the-empire` | Карточное состояние не создаётся (или setup 422, как раньше) | то же |
| TC-INIT-07 | AC-4, AC-10 | unit | positive | P0 | `G_PHY_REB` | Создать состояние | Location пуст, база не задана/не раскрыта до регистрации; `DECK` = 26 (31 − BOX); сумма 31 (см. Q-2) | то же |
| TC-INIT-08 | AC-4 | integration | positive | P0 | `POST /api/sessions` `G_DIG_REB` | Создать; `ROW(id)` | В сохранённом state есть карточное состояние с инвариантами TC-INIT-01; ответ создания — только представление человека (без `DECK`, см. TC-LK-02) | `apps/api/test/cards-create.int.test.ts` |
| TC-INIT-09 | AC-4 | integration | determinism | P1 | две БД | Создать партию с одинаковым id и настройками в обеих | `ROW.state` байт-идентичны | то же |

### 4. Deck Engine — операции и инварианты (AC-5; PO G-3, G-4, G-5)

Платформенные чистые операции; минимальные синтетические колоды (не Rebellion).

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-DECK-01 | AC-5 | unit | positive | P0 | колода из 10 экз., рука, сброс | create → shuffle(seed) → draw 3 → discard 1 | Колода 7 (верхние 3 ушли по порядку), рука 2, сброс 1; инварианты выполнены | `packages/platform/test/cards/ops.test.ts` |
| TC-DECK-02 | AC-5 | unit | positive | P0 | — | move, play, reveal, return (наверх/вниз/перемешать по политике) | Каждая операция переносит ровно один экземпляр в ожидаемую позицию; результат — новое значение | то же |
| TC-DECK-03 | AC-5 | unit | negative | P0 | — | draw из пустой колоды; draw N > размера | Ошибка (или частичный добор — строго по контракту плана); вход не изменён (deep-freeze + deep-equal) | то же |
| TC-DECK-04 | AC-5 | unit | negative | P0 | — | move/play/discard экземпляра, которого нет в зоне-источнике; неизвестный id экземпляра | Ошибка с кодом; вход не изменён | то же |
| TC-DECK-05 | AC-5 | unit | negative | P0 | зона с ограничением (ёмкость 1, только тип X, только владелец Y) | Переместить второй экземпляр / карту другого типа / карту другого владельца | Ошибка политики зоны; вход не изменён | то же |
| TC-DECK-06 | AC-5 | unit | negative | P0 | — | play карты с эффектом «нет розыгрыша»; reveal уже раскрытой; return в зону, запрещённую политикой | Ошибка; вход не изменён | то же |
| TC-DECK-07 | AC-5 | unit | negative | P0 | — | create с дублем id экземпляра; с неизвестным определением; с одним экземпляром в двух зонах | Ошибка валидации; состояние не создаётся | то же |
| TC-DECK-08 | AC-5 | unit | negative | P0 | — | Проверка инвариантов на руками испорченных состояниях: дубль, потеря, неизвестный экземпляр | Каждое нарушение детектируется отдельной ошибкой (проверка не тривиальна) | то же |
| TC-DECK-09 | AC-5 | unit | property | P0 | 1000 seeded случайных последовательностей из 20 операций (seed фиксирован, печатается при падении) | Применять операции, ошибки пропускать | После каждой успешной операции: нет дубликатов, нет потерь, нет неизвестных; мультимножество экземпляров постоянно; каждая ошибка не меняет вход | то же |
| TC-DECK-10 | AC-5 | unit | determinism | P0 | — | shuffle с одним seed дважды; с разными seed | Одинаковый seed — одинаковый порядок; результат — перестановка входа; 100 seed дают ≥ 95 разных порядков 10 карт | то же |
| TC-DECK-11 | AC-5 | unit | positive | P1 | — | Таблица переходов зона → зона × операция | Разрешено ровно то, что в таблице плана; остальное — ошибка (table-test, все пары) | то же |
| TC-DECK-12 | AC-5, AC-8 | unit | positive | P0 | проектор видимости | Матрица: политика зоны (скрытая упорядоченная, приватная владельца, публичная, секрет до раскрытия) × зритель (владелец, соперник, публичный) | Колода: всем только счётчик; рука: владельцу — карты без порядка колоды, остальным — счётчик; публичная — всем; секрет — владельцу, остальным — ничего/счётчик до раскрытия, всем — после | `packages/platform/test/cards/visibility.test.ts` |
| TC-DECK-13 | AC-5 | unit | positive | P1 | — | Восстановление: сериализовать состояние после 10 операций, распарсить схемой, продолжить | Результат идентичен непрерывному прогону | то же, что TC-DECK-01 |

### 5. Refresh-добор зондов (AC-6; PO G-3)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-RF-01 | AC-6 | unit | positive | P0 | новая партия, `DECK` известен | `REFRESH(s)` | Рука Империи +2 = две **верхние** карты `DECK`; колода −2; лидеры вернулись, время сдвинулось (шаги 1 и 5 как раньше); событие добора в журнале; инварианты | `packages/games/rebellion/test/rules/core/refresh-probes.test.ts` |
| TC-RF-02 | AC-6 | unit | positive | P0 | — | 3 Refresh подряд | Рука 6, колода 19; порядок добора = порядок колоды | то же |
| TC-RF-03 | AC-6 | unit | boundary | P0 | искусственно: в колоде 1 карта; 0 карт | `REFRESH(s)` | Поведение по `rules-audit.md` или assumption D-7 («сколько есть»): 1 → добор 1; 0 → добор 0, без ошибки и без 500; assumption помечено в коде/доках | то же |
| TC-RF-04 | AC-6, AC-16 | unit | negative | P0 | `G_OLD_CORE` (state без карт) | `REFRESH(s)` | Ничего не добирается, нет карточного события, карточное поле не появляется; остальные шаги Refresh как до SWR-010 | то же |
| TC-RF-05 | AC-6 | unit | negative | P1 | — | Refresh не наступил (один пас) | Добора нет | то же |
| TC-RF-06 | AC-6, AC-7 | integration | positive | P0 | `G_DIG_REB` | Довести до Refresh через API | Ответ Повстанцам: событие «Империя добрала 2 карты» со счётом, без id карт (TC-LK-07); в `ROW.state` рука Империи = 2 конкретные карты | `apps/api/test/cards-refresh.int.test.ts` |

### 6. Изоляция рук и представления (AC-7, AC-8, AC-9; PO G-6, G-7)

Позитивная часть: каждая сторона видит своё. Негативная часть — матрица утечек (§7).

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-VIS-01 | AC-7 | unit | positive | P0 | состояние после 1 Refresh | Представление Империи | Рука зондов: 2 карты полностью (определение, система); колода — только счётчик; Location — нет (до раскрытия); BOX — по политике плана | `packages/games/rebellion/test/rules/core/cards-view.test.ts` |
| TC-VIS-02 | AC-7 | unit | positive | P0 | то же | Представление Повстанцев | Location: своя карта полностью; рука Империи — только счётчик 2; колода — только счётчик | то же |
| TC-VIS-03 | AC-7 | unit | positive | P0 | `BASE_REVEALED` / конец партии | Представление Империи | Location видна (раскрыта по правилам); до этого — нет | то же |
| TC-VIS-04 | AC-8 | unit | negative | P0 | — | Сравнить представления обеих сторон для `s` и `permuteDeck(s, π)` (10 разных π) | Оба представления равны (ни порядок, ни содержимое колоды не выводятся ни одной стороне, включая владельца руки) | то же |
| TC-VIS-05 | AC-9 | unit | positive | P0 | — | Публичная проекция | Содержит только открытые зоны и счётчики; глубоко ⊆ представления каждой стороны (каждое публичное поле есть с тем же значением в обоих) | то же |
| TC-VIS-06 | AC-9 | unit | metamorphic | P0 | — | Проекция журнала/задач стола для `s`, `swapHand(s)`, `relocateBase2(s, b')` при человеке, которому эти секреты недоступны | Проекции равны (строятся только из представления зрителя) | то же |
| TC-VIS-07 | AC-9 | static | positive | P1 | — | Ревью кода: четыре отдельные функции/проекции; где нет зрителя (сводка списка сессий, публичные API) — используется публичная | Есть четыре точки; построитель задач стола принимает представление человека, а не полное состояние (по сигнатуре) | ревью, `review.md` |
| TC-VIS-08 | AC-7 | integration | positive | P0 | `G_HS` после Refresh (A-2) | GET от лица каждой стороны / через handoff | Повстанцы — счётчик руки Империи; Империя — свои 2 карты; экран-заслонка не отдаёт карт | `apps/api/test/cards-hotseat.int.test.ts` |
| TC-VIS-09 | AC-7, AC-8 | unit | property | P1 | 30 seeded партий bot-vs-bot до конца | На каждом шаге: представление Повстанцев ∩ `SECRET_IDS(PH)` и ∩ `SECRET_IDS(DECK)`; Империи ∩ `SECRET_IDS(LOC)` до раскрытия | Пусто на всех шагах | `packages/games/rebellion/test/rules/core/cards-hidden.test.ts` |

### 7. Матрица утечек (AC-7, AC-8, AC-15, AC-23; PO G-6, G-7, G-11)

Секреты (столбцы):

- **S1** — идентичности карт руки зондов Империи (скрыты от Повстанцев: человек-Повстанцы vs AI-Империя и AI-Повстанцы vs
  человек-Империя, hot-seat).
- **S2** — порядок и содержимое колоды зондов (скрыты от всех, включая владельца руки).
- **S3** — база/карта Location AI-Повстанцев до раскрытия (скрыта от человека-Империи).
- **S4** — карта Location человека-Повстанцев (скрыта от AI-Империи: её `DP`, промпт, логика выбора).

Метод для каждой ячейки: (1) прямой поиск `SECRET_IDS` в сериализованном JSON/DOM (`occurrences`/`baseLeaks`);
(2) метаморфное сравнение двух партий, отличающихся только секретом (`swapHand`, `permuteDeck`, `relocateBase2`) —
выход, адресованный не-владельцу, должен быть равен. Каждая проверка — минимум на 2 seed с разными базами/колодами.

| Выход \ секрет | S1 рука зондов Империи | S2 порядок/состав колоды | S3 база AI-Повстанцев | S4 Location человека-Повстанцев |
|---|---|---|---|---|
| O1 представление человека (`GET` сессии, `view` в ответах) | TC-LK-01 | TC-LK-02 | TC-LK-03 | `not_applicable` — получатель = владелец; видеть свою карту обязан (TC-VIS-02, TC-HAND-01) |
| O2 представление AI / `decisionPoint` / промпт OpenAI | TC-LK-04 (AI-Повстанцы); у AI-Империи свои зонды обязаны быть — TC-AI-01 | TC-LK-05 | `not_applicable` — AI-Повстанцы владеют базой (поведение до SWR-010) | TC-LK-06 |
| O3 события в ответе команды / `automation/run` (`events`, `automation`) | TC-LK-07 | TC-LK-07 | TC-LK-08 | `not_applicable` — ответ адресован владельцу; AI-путь проверяет TC-LK-06 |
| O4 журнал сессии (`view.log`, сохранённые события в представлении) | TC-LK-09 | TC-LK-09 | TC-LK-09 | `not_applicable` — журнал отдаётся только человеку-владельцу; для AI журнал входит в `DP` (TC-LK-06) |
| O5 сводка списка сессий (`GET /api/sessions`) | TC-LK-10 | TC-LK-10 | TC-LK-10 | TC-LK-10 (публичная проекция, зрителя нет) |
| O6 задачи стола | TC-LK-11 | TC-LK-12 | TC-LK-13 | `not_applicable` — задачи адресованы человеку-владельцу; AI задач не читает (проверка «не читает» — TC-LK-06) |
| O7 клиентские диагностические события / AI dev-панель (`DIAG`, DOM панели) | TC-LK-14 | TC-LK-15 | TC-LK-16 | `not_applicable` — диагностика показывается человеку-владельцу; что AI её не получил — TC-LK-06 |
| O8 production-бандл | `not_applicable` — руки создаются в рантайме, в статике их нет; публичный справочник 31 зонда в бандле допустим (Card Detail) | TC-LK-17 | TC-LK-17 | `not_applicable` — рантайм-данные; логика выбора базы проверяется TC-LK-17 |
| O9 DOM / localStorage / sessionStorage / URL (e2e) | TC-LK-18 | TC-LK-18 | TC-LK-19 | `not_applicable` — UI владельца |
| O10 тела ошибок (422/409 при регистрации/подтверждении/заблокированных командах) | TC-LK-20 | TC-LK-20 | TC-LK-20 | `not_applicable` — ошибки адресованы владельцу |
| O11 серверные логи и строки `AiUsage` (не клиентский выход; защита промптов/логов другой стороны по AGENTS.md) | TC-LK-21 | TC-LK-21 | TC-LK-21 | TC-LK-21 |

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-LK-01 | AC-7 | integration | metamorphic | P0 | `G_DIG_REB`, `G_PHY_REB`, `G_HS` (Повстанцы) после ≥ 2 Refresh; две БД: `s` и `swapHand(s)` | Все ответы, адресованные Повстанцам: `GET`, `CMD`, `RUN` | Равны после `MASK`; `SECRET_IDS(PH)` не встречаются; есть только счётчик руки | `apps/api/test/cards-hidden-info.int.test.ts` |
| TC-LK-02 | AC-8 | integration | metamorphic | P0 | все 5 видов партий; `s` и `permuteDeck(s, π)` | Все ответы обеим сторонам | Равны; нет ни одного id экземпляра/определения из `DECK`; есть только число карт колоды | то же |
| TC-LK-03 | AC-7, AC-15 | integration | metamorphic | P0 | `G_DIG_EMP`, `G_PHY_EMP`, `G_HS` (Империя) до раскрытия; `s` и `relocateBase2(s, b')` | Все ответы Империи, включая ходы AI-Повстанцев в/из базы | Равны; `baseLeaks` (расширенный на карточные пути) = 0; `SECRET_IDS(LOC)` не встречается | то же |
| TC-LK-04 | AC-7, AC-18 | integration | metamorphic | P0 | `OA_APP`, `G_DIG_EMP` и `G_PHY_EMP` после Refresh (у человека-Империи зонды); `s` и `swapHand(s)` | Записать `DP` и все `REQ` AI-Повстанцев | `DP` глубоко равны, `REQ` побайтно равны; `SECRET_IDS(PH)` в `REQ` = 0 | `apps/api/test/cards-ai-hidden.int.test.ts` |
| TC-LK-05 | AC-8, AC-18 | unit + integration | metamorphic | P0 | AI за каждую сторону; `s` и `permuteDeck(s, π)` | `DP`, `REQ` | Равны; в `REQ` нет карт колоды (только счётчик) | то же + `packages/games/rebellion/test/ai/*` |
| TC-LK-06 | AC-7, AC-18 | integration | metamorphic | P0 | `OA_APP`, `G_PHY_REB` (зарегистрирована система X vs система Y) и `G_DIG_REB` (`relocateBase2`) | `DP` и `REQ` AI-Империи на всех шагах до раскрытия | Равны; нет id/названия базы и `SECRET_IDS(LOC)`; выбор хода бота одинаков в обеих копиях | то же |
| TC-LK-07 | AC-6, AC-7, AC-8 | integration | metamorphic | P0 | `G_DIG_REB`, `G_PHY_REB`: команда человека, вызывающая Refresh (пас) | Тело ответа `CMD` (`events`, `automation`) для `s` / `swapHand(s)` / `permuteDeck(s)` | Событие добора содержит сторону и число, без id карт; тела равны | `apps/api/test/cards-hidden-info.int.test.ts` |
| TC-LK-08 | AC-7, AC-15 | integration | negative | P0 | `G_DIG_EMP`, `G_PHY_EMP`: AI-Повстанцы ходят в/из базы | `events` и `automation` в ответах `CMD`/`RUN` Империи | `baseLeaks` = 0; метаморфно равны для `relocateBase2` | то же |
| TC-LK-09 | AC-7, AC-8 | integration | negative | P0 | 3 полные партии bot-vs-bot с картами (разные seed), затем `GET` за каждую сторону | Скан `view.log` | S1 нет в журнале Повстанцев; S2 нет ни у кого; S3 нет у Империи до события раскрытия; после раскрытия — по правилам вида | то же |
| TC-LK-10 | AC-7, AC-9 | integration | negative | P0 | партии всех видов, включая `G_OLD_*` | `GET /api/sessions` (с фильтром и без) | `details` не содержит ни одного id карты/экземпляра, базы, системы руки; только публичные счётчики (если есть) | `apps/api/test/cards-summary.int.test.ts` |
| TC-LK-11 | AC-11, AC-15 | integration | negative | P0 | `G_PHY_REB`, Refresh AI-Империи | Задачи стола в представлении Повстанцев | Задача «Империя добрала 2 карты зондов» без названий/id; метаморфно равны для `swapHand` | `apps/api/test/table-tasks.int.test.ts` |
| TC-LK-12 | AC-8, AC-11 | integration | metamorphic | P0 | `G_PHY_EMP`, Refresh | Задача «возьмите X и Y» для `s` и для `s'` = тот же `PH`-добор, остаток колоды переставлен | Названы ровно 2 добранные карты (свои, допустимо); задачи равны; нет «следующей карты»/остатка | то же |
| TC-LK-13 | AC-15 | integration | metamorphic | P0 | `G_PHY_EMP` до раскрытия; AI-Повстанцы перемещают юниты в базу и из неё | Задачи стола; `relocateBase2` | Перемещения в базу описаны как «на поле Rebel Base»; задачи равны в обеих копиях; `baseLeaks` = 0 | то же |
| TC-LK-14 | AC-23 | integration + e2e | negative | P0 | `G_DIG_REB` / `G_PHY_REB`, AI-Империя с зондами; dev-эндпоинт включён (loopback, не production) | `DIAG(id)` для `s` и `swapHand(s)`; e2e: открыть AI dev-панель | `DIAG` равны; `SECRET_IDS(PH)` нет в `DIAG` и в DOM панели | `apps/api/test/cards-diag.int.test.ts`, `e2e/cards-hidden.spec.ts` |
| TC-LK-15 | AC-8, AC-23 | integration | metamorphic | P1 | AI за каждую сторону | `DIAG` для `s` и `permuteDeck(s)` | Равны | то же |
| TC-LK-16 | AC-15, AC-23 | integration + e2e | negative | P0 | `G_DIG_EMP`/`G_PHY_EMP` до раскрытия | `DIAG` для `relocateBase2`; DOM панели | Равны; `baseLeaks` = 0; в DOM нет имени базы как базы | то же |
| TC-LK-17 | AC-23 | bundle | negative | P0 | `pnpm build` | `pnpm check:bundle` + grep `apps/web/dist` по именам модулей инициализации/перемешивания колод и выбора базы; тест-фикстура `check-web-bundle.test.mjs` с этими строками | exit 0; правило бандла для новой серверной логики существует и срабатывает на фикстуре (проверка не тривиальна); существующие правила `chooseRebelBase`/`rebelBaseCandidates` целы | `scripts/check-web-bundle.test.mjs` |
| TC-LK-18 | AC-7, AC-8, AC-19 | e2e | negative | P0 | `G_DIG_REB` после Refresh (сид или прогон) | Записать все ответы API (`recordApi`); DOM, порталы, `localStorage`, `sessionStorage`, URL | Нет `SECRET_IDS(PH)` и карт колоды; панель руки соперника показывает только счётчики | `e2e/cards-hidden.spec.ts` |
| TC-LK-19 | AC-15, AC-19 | e2e | negative | P0 | `G_DIG_EMP` и `G_PHY_EMP` до раскрытия | То же + задачи стола в DOM | Нет имени/id базы в связке с базой/Location; пункты (a)–(d) «не называет базу» из SWR-009 Conventions выполняются | то же |
| TC-LK-20 | AC-7, AC-10, AC-12 | integration | negative | P1 | все виды партий | Вызвать 422/409: `REGISTER` у Империи/в `digital`, повторная `REGISTER`, `CONFIRM` чужой/несуществующей задачи, заблокированная команда | Тела ошибок не содержат S1–S3 (в `details` — только значения из запроса и публичные поля) | `apps/api/test/table-tasks.int.test.ts` |
| TC-LK-21 | AC-7 | integration | negative | P2 | перехват логов сервера (TR-6 SWR-006), таблица `AiUsage` | Прогоны TC-LK-04/06 | В логах шагов AI стороны нет секретов соперника; колонки `AiUsage` без id карт | `apps/api/test/cards-ai-hidden.int.test.ts` |

### 8. Physical Hand — регистрация Location (AC-10; PO G-5)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-PH-01 | AC-10 | integration | positive | P0 | `G_PHY_REB`, база не зарегистрирована | `REGISTER(X, v)`, X — допустимая система | 200; версия +1; `BASE` = X; `LOC` = карта X; `DECK` без X (25); сумма 31; событие регистрации | `apps/api/test/physical-register.int.test.ts` |
| TC-PH-02 | AC-10 | integration | negative | P0 | то же | По одному: Корусант; стартовая система Империи; соседняя со стартовой Империи; система из `BOX`; несуществующий id; пустая строка; число; лишнее поле в команде | 422, `ROW(id)` байт-идентичен до/после (state, version, updatedAt, число событий) | то же |
| TC-PH-03 | AC-10 | integration | negative | P0 | после TC-PH-01 | `REGISTER(Y, v+1)` и `REGISTER(X, v+1)` | 422; без изменений | то же |
| TC-PH-04 | AC-10 | integration | negative | P0 | `G_DIG_REB`, `G_DIG_EMP`, `G_PHY_EMP`, `G_HS`, `G_OLD_CORE`, `G_OLD_MOCK` | `REGISTER(X, v)` | 422 во всех; без изменений; для человека-Империи ответ не подтверждает/не опровергает базу AI (TC-LK-20) | то же |
| TC-PH-05 | AC-10, AC-13 | integration | negative | P0 | `G_PHY_REB`, база не зарегистрирована | `RUN`; `CMD(PASS/ACTIVATE)` Повстанцев | `RUN`: 0 шагов AI, версия не изменилась; команды Повстанцев → 422 без изменений | то же |
| TC-PH-06 | AC-10, AC-13 | integration | positive | P0 | `G_PHY_REB`; в очереди есть задача начальной синхронизации | `REGISTER(X)` при непустой очереди | Регистрация принята (исключение AC-13); очередь — по решению Q-3 | то же |
| TC-PH-07 | AC-10 | integration | negative | P1 | после регистрации | `REGISTER` с `actor` = Империя | 422/403 без изменений | то же |
| TC-PH-08 | AC-10, AC-7 | integration | metamorphic | P0 | `OA_APP`, две копии `G_PHY_REB` (X и Y) | Сыграть одинаковые команды до раскрытия | `DP`/`REQ` AI-Империи равны (= TC-LK-06, частный случай) | `apps/api/test/cards-ai-hidden.int.test.ts` |
| TC-PH-09 | AC-10 | unit | positive | P1 | — | Справочник допустимых систем для регистрации | Совпадает с `eligibleRebelBaseSystemIds` (не шире, не уже) и отдаётся человеку-Повстанцам в его представлении/UI | `packages/games/rebellion/test/rules/core/register.test.ts` |

### 9. Задачи стола (AC-11, AC-15; PO G-11)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-TT-01 | AC-11 | integration | positive | P0 | `POST /api/sessions` `G_PHY_REB` и `G_PHY_EMP` | Создать | Первая задача — начальная синхронизация: расстановка первой партии, «отложите колоду зондов»; есть «что произошло / затронуто / что сделать» | `apps/api/test/table-tasks.int.test.ts` |
| TC-TT-02 | AC-11 | integration | positive | P0 | `G_PHY_REB`, база зарегистрирована, задачи подтверждены | Ход человека → AI-Империя активирует систему и перемещает | Задачи: активация (лидер X в Y), перемещение (юниты, откуда, куда); i18n-ключи + параметры (A-4), не готовый текст | то же |
| TC-TT-03 | AC-11 | integration | positive | P0 | `G_PHY_EMP` | Ход AI-Повстанцев; пас; Refresh | Задачи для активации/перемещения, Refresh-шагов (вернуть лидеров, сдвинуть время), добора «возьмите X и Y» | то же |
| TC-TT-04 | AC-11 | integration | positive | P1 | `G_PHY_*`, AI пасует без физических последствий | Ход AI = PASS | Задача не создаётся или создаётся по правилу плана («при наличии физических последствий») — фиксируется как фактическое поведение | то же |
| TC-TT-05 | AC-11 | integration | negative | P0 | `G_PHY_*` | Собственные команды человека (активация, перемещение) | Для них задач нет (A-5); системные последствия (Refresh после паса) — есть | то же |
| TC-TT-06 | AC-11 | integration | negative | P0 | `G_DIG_REB`, `G_DIG_EMP`, `G_HS`, `G_OLD_*` — полная партия | Наблюдать очередь во всех ответах | Очередь пуста/отсутствует всегда; нет событий подтверждения | то же |
| TC-TT-07 | AC-11 | integration | positive | P1 | `G_PHY_EMP`, Империя раскрывает базу | Команда, вызывающая раскрытие | Задача «раскрытие базы» с системой базы (теперь разрешено); до этого события ни одна задача не называет базу | то же |
| TC-TT-08 | AC-11 | integration | positive | P1 | ход AI из нескольких команд (активация + 2 перемещения + завершение) | Наблюдать очередь | Многошаговое исполнение: несколько задач по порядку или одна задача с несколькими шагами — по плану; порядок = порядок применения команд | то же |
| TC-TT-09 | AC-11, AC-9 | unit | metamorphic | P0 | — | Построить задачи для `s` и `s'` с равным представлением человека (S1/S3 различаются) | Задачи равны (= TC-VIS-06 для задач) | `packages/games/rebellion/test/rules/core/table-tasks.test.ts` |
| TC-TT-10 | AC-11, AC-19 | unit | positive | P1 | все виды задач | Все i18n-ключи задач в RU и EN | Ключи и параметры разрешаются в обоих языках | `apps/web/...locales.i18n.test.ts` |

### 10. Подтверждение «Выполнено на столе» (AC-12; PO G-10)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-CF-01 | AC-12 | integration | positive | P0 | `G_PHY_*`, очередь из ≥ 2 задач, версия v | `CONFIRM(HEAD, v)` | 200; версия v+1; ровно одно событие подтверждения; задача ушла из очереди; diff state до/после — только очередь, версия и журнал (юниты, лидеры, карты, фаза, время не изменились) | `apps/api/test/table-confirm.int.test.ts` |
| TC-CF-02 | AC-12 | integration | negative | P0 | после TC-CF-01 | Тот же запрос `CONFIRM(T1, v)` повторно | 409 (устаревшая версия); без изменений | то же |
| TC-CF-03 | AC-12 | integration | negative | P0 | после TC-CF-01 | `CONFIRM(T1, v+1)` (уже подтверждённая задача, свежая версия) | 422; без изменений; эффект не повторён | то же |
| TC-CF-04 | AC-12 | integration | negative | P0 | очередь [T1, T2] | `CONFIRM(T2, v)` (не головная) | 422; без изменений | то же |
| TC-CF-05 | AC-12 | integration | negative | P0 | — | `CONFIRM("nope", v)`; пустой id; лишние поля | 422; без изменений | то же |
| TC-CF-06 | AC-12 | integration | negative | P0 | — | `CONFIRM(HEAD, v−1)` | 409; без изменений | то же |
| TC-CF-07 | AC-12 | integration | concurrency | P0 | очередь [T1, T2] | Два параллельных `CONFIRM(T1, v)` (`Promise.all`, 20 повторов) | Ровно один 200, второй 409/422; версия +1 один раз; события непрерывны; никогда 500; финальное состояние = последовательному прогону | `apps/api/test/table-confirm.int.test.ts` (схема `automation-double-submit.int.test.ts`) |
| TC-CF-08 | AC-12 | integration | concurrency | P1 | очередь из 1 задачи, после неё AI продолжит | Два параллельных `CONFIRM` | Ход AI после подтверждения выполнен ровно один раз (ходы AI в журнале не задвоены) | то же |
| TC-CF-09 | AC-12 | integration | positive | P1 | — | Повтор `CONFIRM` с тем же idempotency-ключом (если платформа поддерживает для команд) | Повтор ответа без нового применения; версия не меняется | то же |
| TC-CF-10 | AC-12 | integration | negative | P0 | `G_DIG_*`, `G_HS`, `G_OLD_*` | `CONFIRM(any, v)` | 422 без изменений | то же |
| TC-CF-11 | AC-12 | integration | negative | P1 | `G_PHY_*` | `CONFIRM` с `actor` = сторона AI | 422/403 без изменений | то же |
| TC-CF-12 | AC-12 | unit | positive | P0 | — | Применение подтверждения к состоянию на уровне Core | Чистая функция: вход не изменён; эффект задачи не применяется повторно (проверка: состояние после = состояние до минус головная задача, плюс событие, версия) | `packages/games/rebellion/test/rules/core/table-tasks.test.ts` |

### 11. Блокировка AI и команд при открытых задачах (AC-13)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-BL-01 | AC-13 | unit | positive | P0 | состояние с непустой очередью, ход AI | `pendingActor(state)` | `null`; после удаления последней задачи — сторона AI | `packages/games/rebellion/test/rules/core/table-tasks.test.ts` |
| TC-BL-02 | AC-13 | integration | negative | P0 | `OA_APP` (fake fetch), `G_PHY_REB`, очередь не пуста, ход AI | `RUN` × 3 | 0 шагов AI, 0 запросов к fake fetch, 0 новых строк `AiUsage`, бюджет не изменён, версия не изменилась | `apps/api/test/table-blocking.int.test.ts` |
| TC-BL-03 | AC-13 | integration | negative | P0 | бот, то же | `RUN` | 0 шагов, версия не изменилась, `automation` в ответе отражает «ждёт подтверждения» (форма — по плану) | то же |
| TC-BL-04 | AC-13 | integration | negative | P0 | очередь не пуста, ход человека | `PASS`, `ACTIVATE_SYSTEM`, `MOVE_PIECES`, `FINISH_ACTIVATION` | Все 422 (код «задачи стола не подтверждены»); `ROW` байт-идентичен | то же |
| TC-BL-05 | AC-13 | integration | positive | P0 | очередь из 1 задачи, ход AI | `CONFIRM(HEAD)` | В том же ответе (или следующем `RUN`) AI делает шаг(и) до следующей задачи стола; не более шагов, чем до первой новой задачи | то же |
| TC-BL-06 | AC-13 | integration | positive | P1 | `OA_APP`, то же | `CONFIRM` последней задачи | Ровно ожидаемое число платных запросов (по шагам AI), не больше | то же |
| TC-BL-07 | AC-13 | integration | positive | P1 | `G_DIG_*` | Полная партия | Раннер ведёт себя как до SWR-010 (регрессия `automation-runner.int.test.ts`, `automation-full-game.int.test.ts`) | существующие |
| TC-BL-08 | AC-13 | integration | boundary | P1 | `G_PHY_*`, ход AI привёл к концу партии (см. Q-5) | Подтверждать оставшиеся задачи | Задачи подтверждаемы после конца партии или очищаются — по решению Q-5; нет «вечной» блокировки (R-3) | то же |
| TC-BL-09 | AC-13 | integration | property | P1 | 5 seeded партий `G_PHY_*` bot-vs-«человек-бот» до конца: на каждом шаге подтверждать все задачи, затем ход человека | Наблюдать | Партия всегда доходит до конца; ни одной задачи, которую нельзя подтвердить; никогда 500 | то же |

### 12. Восстановление после перезапуска/перезагрузки (AC-14; PO G-9)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-RST-01 | AC-14 | integration | positive | P0 | `G_PHY_REB` с 2 неподтверждёнными задачами | Закрыть `createApp`, поднять новый на той же БД; `GET`, `RUN` | Те же задачи, тот же порядок и содержимое; `RUN` — 0 шагов AI | `apps/api/test/table-restart.int.test.ts` |
| TC-RST-02 | AC-14 | integration | positive | P0 | после TC-RST-01 | `CONFIRM` обеих задач | AI продолжает; итог = прогону без перезапуска (байт-сравнение state) | то же |
| TC-RST-03 | AC-14 | integration | positive | P1 | `G_PHY_REB` до регистрации Location | Перезапуск | Блокировка AI сохраняется; регистрация после перезапуска работает | то же |
| TC-RST-04 | AC-14, AC-21 | e2e | positive | P0 | `G_PHY_REB` с открытой задачей | `page.reload()`; затем новая вкладка/контекст | Режим Physical Execution восстановлен, та же задача, статус «AI ждёт подтверждения» | `e2e/physical-execution.spec.ts` |

### 13. Старые партии (AC-16; PO G-12)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-OLD-01 | AC-16 | integration | regression | P0 | `G_OLD_MOCK` (v1, v2 фикстуры) | Загрузить; `GET`, `GET /api/sessions`; 3 команды | Читаются, отображаются, команды принимаются, как до SWR-010 | `apps/api/test/cards-legacy.int.test.ts` |
| TC-OLD-02 | AC-16 | integration | regression | P0 | `G_OLD_CORE` (сиды `ai-empire-before-reveal`, `hotseat-empire-before-win`; партия, сохранённая на `f3619a1` без карт) | `GET`, `RUN`, 3 команды, включая проход через Refresh | Без ошибок; карточное поле не появляется; Refresh ничего не добирает; задач нет | то же |
| TC-OLD-03 | AC-16 | integration | negative | P0 | `G_OLD_CORE`, `G_OLD_MOCK` | `ROW(id)` до; `GET` × 2, `GET /api/sessions`, `RUN` без хода AI; `ROW(id)` после | `state` побайтно, `version`, `updatedAt`, число событий — без изменений (не переписываются при чтении) | то же |
| TC-OLD-04 | AC-16 | integration | positive | P1 | `G_OLD_CORE` | Одна команда | Строка переписана штатным `commit` (версия +1); upcast не добавил карт; `schemaVersion` по решению плана | то же |
| TC-OLD-05 | AC-16 | unit | regression | P0 | golden `golden-empire-win.json`, `golden-rebels-time.json`, `views/*` | Существующие golden-тесты | Зелёные; если golden обновлён (новые партии получают карты) — diff только в карточной части, объяснение в `review.md` (R-4), игровой результат прежний | существующие |
| TC-OLD-06 | AC-16 | e2e | regression | P0 | сид старой `core-v1` и `mock-v1` (`e2e/support/seed.ts`) | Открыть партию | Стол работает; Card Hand: «в этой партии карты не отслеживаются» (RU/EN); нет ошибок консоли | `e2e/cards-legacy.spec.ts`, `e2e/legacy.spec.ts` |
| TC-OLD-07 | AC-16 | integration | regression | P1 | копия `dev.db` в scratchpad (не оригинал) | Прочитать все сессии через репозиторий | Все читаются; оригинал не тронут (md5 до/после) | `apps/api/test/dev-db-upgrade.int.test.ts` |

### 14. Сохранённая партия и детерминированное воспроизведение (AC-17; PO G-2, G-8)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-RP-01 | AC-17 | integration | positive | P0 | state с картами, рукой зондов, очередью задач (`G_PHY_EMP` после Refresh) | Сохранить через репозиторий → прочитать → распарсить схемой → сохранить снова | Глубоко равен; строка JSON побайтно равна; инварианты карт выполнены | `apps/api/test/cards-persistence.int.test.ts` |
| TC-RP-02 | AC-17 | unit | determinism | P0 | одно начальное состояние, фиксированная последовательность 40 команд (включая Refresh, регистрацию, подтверждения) | Применить дважды | Финальные состояния и журналы побайтно равны | `packages/games/rebellion/test/rules/core/cards-replay.test.ts` |
| TC-RP-03 | AC-17 | integration | determinism | P0 | две БД, один `sessionId`, `G_PHY_*` и `G_DIG_*`, бот | Одинаковые команды человека | `ROW.state` побайтно равны после каждой команды (бот детерминирован по `sessionId#version`) | `apps/api/test/cards-determinism.int.test.ts` (схема `automation-determinism.int.test.ts`) |
| TC-RP-04 | AC-17 | integration | negative | P1 | сохранённое state с испорченной карточной частью (дубль экземпляра, неизвестная карта) | `GET` | Ошибка чтения контролируемая (422/500 по контракту плана, без падения процесса); строка не переписана | то же, что TC-RP-01 |
| TC-RP-05 | AC-17 | integration | positive | P1 | сохранённая партия с картами | Перезапуск + продолжение до конца | Партия доигрывается; итог = непрерывному прогону | то же |

### 15. AI Commander (AC-18; PO G-13)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-AI-01 | AC-18 | unit | positive | P0 | AI-Империя после Refresh | `DP(s)` | Содержит свои 2 зонда («базы нет в этих системах») и публичные счётчики (Location соперника = 1, колода = N); нет карт соперника | `packages/games/rebellion/test/ai/cards-decision.test.ts` |
| TC-AI-02 | AC-18 | unit | positive | P0 | AI-Повстанцы | `DP(s)` | Своя Location (как база — поведение до SWR-010) + счётчик руки Империи; нет карт Империи (см. TC-LK-04) | то же |
| TC-AI-03 | AC-18 | unit | negative | P0 | любые состояния | Кандидаты `DP` | Нет карточных кандидатов; список допустимых карточных действий явно пуст; множество кандидатов равно множеству до SWR-010 для тех же юнитов/лидеров | то же |
| TC-AI-04 | AC-18 | integration | negative | P0 | `OA_APP`, ответ модели с несуществующим «карточным» действием (`PLAY_CARD`, id зонда) | `RUN` | `AI_INVALID_DECISION` → fallback бота; применена только легальная команда | `apps/api/test/cards-ai.int.test.ts` |
| TC-AI-05 | AC-18 | integration | boundary | P1 | `OA_APP`, AI-Империя с максимальной рукой (все добранные зонды за партию) | Построить `REQ` | Размер промпта ≤ `aiCommander.maxPromptTokens`; лимиты не изменены | то же |
| TC-AI-06 | AC-18 | static + gate | regression | P0 | — | `git diff f3619a1 --` конфиги бюджета/fallback/лимитов AI; существующие AI-наборы | Значения не изменены; `automation-openai`, `dev-ai-budget`, `rules-*` и `packages/games/rebellion/test/ai/**` зелёные | существующие |
| TC-AI-07 | AC-18 | gate | negative | P0 | — | Сетевой guard + поиск в тестах SWR-010 `provider: 'openai'` без fake fetch | Нет реальных вызовов OpenAI; guard не отключён | `no-network.unit.test.ts` |
| TC-AI-08 | AC-18 | integration | regression | P1 | `G_DIG_*`, бот | Полная партия | Решения бота не используют карты соперника (метаморфно — TC-LK-04/06); партия завершается | существующие + новые |

### 16. UI: Card Hand (AC-19)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-HAND-01 | AC-19 | e2e | positive | P0 | `G_DIG_REB`, 1440×900, RU и EN | Открыть стол | В правой консоли панель руки: карта Location (название системы, тип, ключевые параметры, доступность, краткое описание); у Империи — счётчики (рука, колода); скриншоты `swr010-hand-reb-{ru,en}-1440.png` | `e2e/card-hand.spec.ts` |
| TC-HAND-02 | AC-19 | e2e | positive | P0 | `G_DIG_EMP` после Refresh (сид) | Открыть стол | 2 своих зонда (система, тип, «базы нет здесь»), счётчик колоды; у Повстанцев — счётчик Location без названия | то же |
| TC-HAND-03 | AC-19 | e2e | positive | P0 | — | Выбор карты мышью и клавиатурой (Tab/Enter/Space) | Карта выбрана (`aria-selected`/`aria-pressed`), открыта Card Detail; фокус виден (amber ring SWR-009) | то же |
| TC-HAND-04 | AC-19 | e2e | negative | P0 | `G_DIG_*` | Перечислить кнопки панели руки | Нет кнопок «Разыграть»/действий для зондов и Location в `digital`; в `G_PHY_REB` до регистрации — только регистрация Location | то же |
| TC-HAND-05 | AC-19 | e2e | positive | P1 | 375×812 | То же, что TC-HAND-01 | Панель доступна в мобильной раскладке консоли; нет горизонтального скролла | то же |
| TC-HAND-06 | AC-19 | component | positive | P1 | компоненты руки | Рендер на фикстурах представления | Использует компоненты UI Kit SWR-009 (`TerminalModule`, `KeyButton`, `StatusBadge`…); нет новых hex (grep G-5 SWR-009); нет изображений карт | `apps/web/src/games/rebellion/**.test.tsx` |
| TC-HAND-07 | AC-19, AC-16 | e2e | positive | P1 | `G_OLD_CORE` | Открыть | «В этой партии карты не отслеживаются» RU/EN (= TC-OLD-06) | `e2e/cards-legacy.spec.ts` |
| TC-HAND-08 | AC-19 | e2e | positive | P1 | `G_DIG_EMP` | Пройти Refresh в UI | Счётчики и рука обновляются без перезагрузки (+2) | `e2e/card-hand.spec.ts` |

### 17. UI: Card Detail (AC-20)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-DET-01 | AC-20 | e2e | positive | P0 | `G_DIG_EMP` с зондом / `G_DIG_REB` с Location; RU и EN | Открыть Card Detail | Название, тип, условия, поддерживаемая механика или «эффект не реализован», источник правила (id KB/страница), статус проверки и доступности; скриншоты RU/EN | `e2e/card-detail.spec.ts` |
| TC-DET-02 | AC-20 | e2e | negative | P0 | то же | Найти кнопку розыгрыша; клик по disabled, если она есть | Рабочей кнопки нет: кнопка отсутствует или `disabled`/`aria-disabled` с пояснением; клик не шлёт запросов (`recordApi` = 0 новых команд) | то же |
| TC-DET-03 | AC-20 | e2e | positive | P1 | — | Закрыть Card Detail (Esc, кнопка) | Фокус возвращается к карте в руке | то же |
| TC-DET-04 | AC-20 | component | positive | P1 | карта со статусом упрощения A-6 | Рендер | Отображается пометка «упрощение» | `apps/web/...` |

### 18. UI: Physical Execution (AC-21; PO G-9, G-10)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-PX-01 | AC-21 | e2e | positive | P0 | новая `G_PHY_REB` через форму; RU и EN; 1440 и 375 | Открыть стол | Правая консоль в режиме Physical Execution: задача начальной синхронизации («что произошло / затронуто / что сделать»), кнопка «Выполнено на столе», статус «AI ждёт подтверждения»; скриншоты | `e2e/physical-execution.spec.ts` |
| TC-PX-02 | AC-21, AC-10 | e2e | positive | P0 | то же | Регистрация Location выбором системы из списка | Список = допустимые системы; после регистрации Location в руке; недопустимых вариантов в списке нет | то же |
| TC-PX-03 | AC-21 | e2e | positive | P0 | после регистрации, задачи подтверждены | Ход человека → ход AI | Новая задача с лидером/системой/юнитами; «Выполнено на столе» → AI продолжает или ход возвращается человеку; режим консоли переключается обратно, когда очередь пуста | то же |
| TC-PX-04 | AC-21, AC-12 | e2e | negative | P0 | открытая задача | Двойной клик / два быстрых клика по «Выполнено на столе» | Ровно один `CONFIRM` в `recordApi`; кнопка `disabled` на время запроса; версия +1 один раз | то же |
| TC-PX-05 | AC-21, AC-12 | e2e | negative | P1 | открытая задача; ответ подтверждения задержан (`page.route`) | Клик, затем Enter/Space по кнопке | Второй запрос не уходит; после ответа — следующая задача | то же |
| TC-PX-06 | AC-21, AC-14 | e2e | positive | P0 | открытая задача | `page.reload()` (= TC-RST-04) | Режим и задача восстановлены | то же |
| TC-PX-07 | AC-21, AC-13 | e2e | negative | P0 | открытая задача, ход человека | Попытка действий на карте (взять лидера, активировать) | Действия недоступны/не шлют команд; если запрос ушёл — 422 показан понятной ошибкой без падения | то же |
| TC-PX-08 | AC-21, AC-15 | e2e | negative | P0 | `G_PHY_EMP` | Пройти ход AI-Повстанцев и Refresh | Задача Refresh «возьмите X и Y» называет только добранные зонды; задачи ходов AI не называют базу (= TC-LK-13, TC-LK-19) | то же |
| TC-PX-09 | AC-21 | e2e | negative | P1 | 409 (версия устарела во второй вкладке) | Подтвердить в первой вкладке | Refetch, показ актуальной головной задачи; нет «двойного» подтверждения | то же |
| TC-PX-10 | AC-21 | component | positive | P1 | — | Рендер режима на фикстуре многошаговой задачи | Шаги пронумерованы; доступные имена/роль `region`; статус ожидания — текстом, не только LED | `apps/web/...` |

### 19. UI: Setup (AC-22)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-SET-01 | AC-22 | e2e | positive | P0 | форма новой партии, соперник AI, RU и EN | Выбрать `physical_companion` за каждую сторону | Партия создана; `settings.gameMode = physical_companion`; открыт режим Physical Execution | `e2e/game-setup.spec.ts` |
| TC-SET-02 | AC-22 | e2e | negative | P0 | соперник — человек | Открыть выбор режима | Вариант недоступен (`disabled`/скрыт) с пояснением | то же |
| TC-SET-03 | AC-22 | integration | negative | P0 | — | `POST /api/sessions`: hot-seat + `physical_companion`; `rise-of-the-empire` + любой режим; `mock-v1` + `physical_companion` | 422 `SETUP_UNSUPPORTED`, сессия не создана | `apps/api/test/setup/*` |
| TC-SET-04 | AC-22 | integration | positive | P0 | — | `POST /api/sessions` `core-v1` + AI + `physical_companion` (обе стороны) | 201; идемпотентный повтор → 200 replay | то же |
| TC-SET-05 | AC-22 | e2e | regression | P0 | — | Существующие `game-setup.spec.ts`, `new-game.spec.ts`, `hot-seat.spec.ts` | Зелёные; `digital` по умолчанию | существующие |

### 20. Бандл и диагностика клиента (AC-23)

Основные кейсы — TC-LK-14..TC-LK-17. Дополнительно:

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-BND-01 | AC-23 | bundle | regression | P0 | `pnpm build` | `pnpm check:bundle` | exit 0 → `artifacts/logs/check-bundle.log` | gate |
| TC-BND-02 | AC-23 | static | negative | P1 | — | Импорты `apps/web/src/**` из серверных модулей карт Rebellion (инициализация, перемешивание, выбор базы) | 0 (архитектурный тест / ESLint boundaries) | `e2e/architecture.spec.ts` или unit |

### 21. Гейты (AC-24; PO G-14)

| TC | Covers | Level | Type | Priority | Preconditions | Steps / input | Expected | Bind |
|---|---|---|---|---|---|---|---|---|
| TC-R-01 | AC-24 | gate | positive | P0 | `f3619a1` до изменений | `pnpm verify` → `artifacts/logs/baseline-verify.log` | exit 0; числа кейсов по наборам сняты | gate |
| TC-R-02 | AC-24, AC-16 | gate | positive | P0 | после INTEGRATION | `pnpm verify` → `artifacts/logs/verify.log` | exit 0; ни один набор не теряет кейсов относительно baseline; изменённые/удалённые — таблица «старый → новый» | gate |
| TC-R-03 | AC-24 | gate | positive | P0 | — | `node --test "scripts/*.test.mjs"` | exit 0 | gate |
| TC-R-04 | AC-24 | gate | positive | P0 | все этапы до DELIVERY | `node scripts/check-task.mjs docs/tasks/SWR-010` | exit 0 | gate |
| TC-R-05 | AC-24 | gate | positive | P0 | ветка запушена **только** с разрешения пользователя | CI GitHub Actions | Зелёный на итоговом SHA; без push — `not_run` с причиной | gate |
| TC-R-06 | AC-24 | static | negative | P0 | — | `git status`, md5 `apps/api/prisma/dev.db`, `dev.pre-*.db` до/после | Не изменены; нет `.env`, traces, ассетов правообладателя; чужие изменения (скриншоты SWR-006, `docs/design/`, `docs/product/progress-2026-11-20.md`, `.claude/launch.json`) не тронуты | gate |

## Coverage (AC → TC)

| AC | Test cases | Негативные / граничные |
|---|---|---|
| AC-1 | TC-AUD-01..TC-AUD-04 | TC-AUD-03 |
| AC-2 | TC-REG-01..TC-REG-05, TC-REG-09, TC-REG-10 | TC-REG-02, TC-REG-03 |
| AC-3 | TC-REG-04, TC-REG-06..TC-REG-08, TC-AUD-04 | TC-REG-07, TC-REG-08 |
| AC-4 | TC-INIT-01..TC-INIT-09 | TC-INIT-04, TC-INIT-06 |
| AC-5 | TC-DECK-01..TC-DECK-13 | TC-DECK-03..TC-DECK-08 |
| AC-6 | TC-RF-01..TC-RF-06, TC-LK-07 | TC-RF-03, TC-RF-04, TC-RF-05 |
| AC-7 | TC-VIS-01..TC-VIS-03, TC-VIS-08, TC-VIS-09, TC-LK-01, 03, 04, 06..10, 18, 20, 21, TC-PH-08 | все TC-LK |
| AC-8 | TC-VIS-04, TC-VIS-09, TC-DECK-12, TC-LK-02, 05, 07, 09, 12, 15, 18 | все перечисленные |
| AC-9 | TC-VIS-05..TC-VIS-07, TC-TT-09, TC-LK-10 | TC-VIS-06 |
| AC-10 | TC-PH-01..TC-PH-09, TC-INIT-07, TC-PX-02 | TC-PH-02..TC-PH-05, TC-PH-07 |
| AC-11 | TC-TT-01..TC-TT-10, TC-LK-11, TC-LK-12 | TC-TT-05, TC-TT-06 |
| AC-12 | TC-CF-01..TC-CF-12, TC-PX-04, TC-PX-05 | TC-CF-02..TC-CF-08, TC-CF-10, TC-CF-11 |
| AC-13 | TC-BL-01..TC-BL-09, TC-PH-05, TC-PH-06, TC-PX-07 | TC-BL-02..TC-BL-04, TC-BL-08 |
| AC-14 | TC-RST-01..TC-RST-04, TC-PX-06 | TC-RST-03 |
| AC-15 | TC-LK-03, TC-LK-08, TC-LK-11, TC-LK-13, TC-LK-16, TC-LK-19, TC-TT-07, TC-PX-08 | все перечисленные |
| AC-16 | TC-OLD-01..TC-OLD-07, TC-RF-04, TC-HAND-07 | TC-OLD-03 |
| AC-17 | TC-RP-01..TC-RP-05, TC-INIT-03, TC-INIT-09 | TC-RP-04 |
| AC-18 | TC-AI-01..TC-AI-08, TC-LK-04, TC-LK-05, TC-LK-06 | TC-AI-03, TC-AI-04, TC-AI-07 |
| AC-19 | TC-HAND-01..TC-HAND-08, TC-REG-09, TC-TT-10, TC-LK-18 | TC-HAND-04 |
| AC-20 | TC-DET-01..TC-DET-04 | TC-DET-02 |
| AC-21 | TC-PX-01..TC-PX-10, TC-RST-04 | TC-PX-04, 05, 07, 08, 09 |
| AC-22 | TC-SET-01..TC-SET-05 | TC-SET-02, TC-SET-03 |
| AC-23 | TC-LK-14..TC-LK-17, TC-BND-01, TC-BND-02 | TC-LK-17, TC-BND-02 |
| AC-24 | TC-R-01..TC-R-06 | TC-R-06 |

## Traceability: обязательные проверки PO (`request.md` раздел G, п. 1–14)

| # | Проверка PO | AC | Test cases |
|---|---|---|---|
| 1 | Инициализация колод | AC-4 | TC-INIT-01..TC-INIT-09, TC-DECK-01, TC-DECK-07 |
| 2 | Детерминированное воспроизведение сохранённого состояния | AC-4, AC-17 | TC-INIT-03, TC-INIT-04, TC-INIT-09, TC-RP-02, TC-RP-03, TC-DECK-10, TC-DECK-13, TC-RST-02 |
| 3 | Добор и сброс | AC-5, AC-6 | TC-DECK-01..TC-DECK-03, TC-RF-01..TC-RF-06 |
| 4 | Нет дублирования карт | AC-4, AC-5 | TC-DECK-07..TC-DECK-09, TC-INIT-01, TC-PH-01, TC-RP-04, TC-CF-07 |
| 5 | Запрет недопустимых переходов | AC-5, AC-10 | TC-DECK-03..TC-DECK-06, TC-DECK-11, TC-PH-02..TC-PH-04 |
| 6 | Изоляция рук сторон | AC-7, AC-9 | TC-VIS-01..TC-VIS-03, TC-VIS-08, TC-LK-01, TC-LK-04, TC-LK-06, TC-LK-18 |
| 7 | Нет утечки порядка скрытой колоды | AC-8 | TC-VIS-04, TC-LK-02, TC-LK-05, TC-LK-12, TC-LK-15, TC-LK-17 |
| 8 | Работа с сохранённой партией | AC-17 | TC-RP-01, TC-RP-04, TC-RP-05, TC-RST-01 |
| 9 | Восстановление Physical Execution после перезапуска | AC-14, AC-21 | TC-RST-01..TC-RST-04, TC-PX-06 |
| 10 | Защита от двойного подтверждения | AC-12, AC-21 | TC-CF-02, TC-CF-03, TC-CF-07..TC-CF-09, TC-PX-04, TC-PX-05, TC-PX-09 |
| 11 | Нет преждевременного раскрытия карт AI | AC-15, AC-7 | TC-LK-03, TC-LK-08, TC-LK-11, TC-LK-13, TC-LK-14, TC-LK-16, TC-LK-19, TC-TT-07, TC-PX-08 |
| 12 | Старые партии работают без повреждения данных | AC-16 | TC-OLD-01..TC-OLD-07, TC-RF-04 |
| 13 | Интеграция с AI Commander | AC-18 | TC-AI-01..TC-AI-08, TC-LK-04..TC-LK-06, TC-BL-02, TC-BL-06 |
| 14 | `pnpm verify` и CI | AC-24 | TC-R-01..TC-R-06 |

## Brief checklist (из брифа QA, явно)

| Требование брифа | Test cases |
|---|---|
| Двойное подтверждение последовательно | TC-CF-02, TC-CF-03 |
| Двойное подтверждение конкурентно | TC-CF-07, TC-CF-08 |
| Устаревшая версия 409 | TC-CF-02, TC-CF-06, TC-PX-09 |
| Подтверждение не головной задачи | TC-CF-04 |
| Регистрация недопустимой системы / дважды / в `digital` | TC-PH-02 / TC-PH-03 / TC-PH-04 |
| Команды заблокированы при открытых задачах | TC-BL-04, TC-PX-07 |
| AI делает 0 шагов и 0 платных вызовов при открытых задачах | TC-BL-02, TC-BL-03, TC-PH-05, TC-RST-01 |
| Старые `mock-v1` и `core-v1` до SWR-010: чтение, view, команды, без перезаписи при чтении | TC-OLD-01..TC-OLD-03 |

Итого 171 TC: AUD 4, REG 10, INIT 9, DECK 13, RF 6, VIS 9, LK 21, PH 9, TT 10, CF 12, BL 9, RST 4, OLD 7, RP 5, AI 8,
HAND 8, DET 4, PX 10, SET 5, BND 2, R 6.
По уровням (основной уровень кейса; комбинированные учтены по первому): unit 51, integration 73, e2e 26, component 3,
static 10, bundle 2, gate 6 (TC-LK-05 — unit+integration → unit; TC-LK-14/16 — integration+e2e → integration;
TC-AI-06 — static+gate → static).

## Testability requirements for implementers (предложения QA, утверждает лид)

1. QA-хелперы метаморфных преобразований (`swapHand`, `permuteDeck`, `relocateBase2`) должны иметь возможность строить
   валидное состояние с картами — нужна экспортируемая из тестовой поддержки проверка инвариантов карт.
2. e2e-сиды `core-v1` с картами (через `e2e/support/seed.ts`): `G_DIG_EMP` после Refresh; `G_PHY_REB` с открытой задачей
   хода AI; `G_PHY_EMP` до раскрытия с задачей Refresh. Оракул состояния — `readStoredState`.
3. testids (предложение): `card-hand` (`data-tracked="false"` для старых партий), `card-hand-item-<cardId>`
   (`aria-selected`), `card-hand-opponent-count` (`data-count`), `card-deck-count`, `card-detail`, `card-detail-close`,
   `card-detail-play` (если есть — `disabled`), `physical-execution`, `table-task-<taskId>` (`data-head`),
   `table-task-confirm`, `table-task-waiting`, `location-register-select`, `location-register-submit`,
   `setup-game-mode` + вариант `physical_companion` (`aria-disabled` при сопернике-человеке).
4. Коды ошибок 422 — различимые: «недопустимая система», «уже зарегистрировано», «регистрация недоступна в режиме»,
   «задача не головная/не найдена», «задачи стола не подтверждены» (для точных проверок TC-PH/TC-CF/TC-BL).
5. `automation` в ответе при блокировке — явный признак «ждёт подтверждения стола» (TC-BL-03).

## Questions (для Analyst / лидов)

- **Q-1 (Analyst).** AC-7: зона «коробка» (5 карт первой партии) — публичная для обеих сторон? В первой партии стартовые
  системы известны обеим сторонам; QA предполагает «публична», TC-VIS-01/02 ждут решения.
- **Q-2 (Analyst, AC-4 vs AC-10).** AC-4 требует «карта базы в Location, 25 в колоде» для новой партии, но в `G_PHY_REB`
  база выбирается человеком регистрацией. Ожидаемое состояние до регистрации: Location пуст, колода 26 (TC-INIT-07)?
  Как до регистрации выглядит `rebelBase` в state (схема требует систему)?
- **Q-3 (Analyst).** Порождает ли регистрация Location задачу стола (D-6 перечисляет «добор/регистрацию карт», A-5 — у
  человека задач для своих действий нет)? Можно ли регистрировать до подтверждения задачи начальной синхронизации и в
  каком порядке их ожидает UI?
- **Q-4 (Analyst, AC-11).** «Пас/завершение при наличии физических последствий»: какие пасы AI порождают задачу? Нужен
  перечень для однозначного Expected TC-TT-04.
- **Q-5 (Analyst/BE, R-3).** Конец партии при непустой очереди (ход AI раскрыл базу/время истекло): подтверждения после
  `gameOver` разрешены или очередь очищается? Сейчас любая команда после конца партии — 422 `gameOver` (TC-BL-08).
- **Q-6 (Analyst, AC-12).** Повтор того же подтверждения: спецификация допускает 422 **или** 409. QA проверяет 409 для
  дословного повтора (версия устарела) и 422 для свежей версии (TC-CF-02/03). Подтвердить.
- **Q-7 (BE).** Поддерживает ли платформа idempotency-ключ для команд (TC-CF-09)? Если нет — кейс `not_applicable`.
- **Q-8 (Analyst, AC-18).** AI-Повстанцы: включать ли в `DP` их Location как карту (дублирует существующую базу) — TC-AI-02
  ожидает «да, как своя карта» или «база как раньше»; оба варианта допустимы, если нет карт соперника.
- **Q-9 (Analyst, AC-15).** Для человека-Империи в `physical_companion`: задача Refresh называет добранные зонды (свои
  карты). Через ~12 Refresh человек сможет вычислить базу исключением (оставшаяся не взятая карта). Это соответствует
  правилам настольной игры, но подтвердите, что UI не должен скрывать это сильнее (QA не считает это утечкой).
- **Q-10 (Analyst, AC-6).** Если `rules-audit.md` подтвердит иное правило пустой колоды (например, перемешать сброс зондов),
  TC-RF-03 меняется; сейчас ожидается D-7 «сколько есть».

- **Q-11 (Analyst, блокирует FINAL_ACCEPTANCE/DELIVERY машинно).** `node scripts/check-task.mjs docs/tasks/SWR-010`
  (запущен QA 2026-11-23) → exit 1: `[R5] AC-1 is not an AC defined in specification.md (expected one of: none)` в
  `acceptance.md`, `qa-results.md`, `delivery-report.md`. Причина — та же, что SWR-009 Q-1: AC в `specification.md` записаны
  как `- **AC-1 (Rules Audit).** …` под `## 4. Acceptance criteria`, а скрипт ищет `- **AC-n:** …` под заголовком,
  начинающимся с «Acceptance criteria». К `test-cases.md` замечаний нет.

## Сверка с планом

Не выполнена: `plan-backend.md` / `implementation-plan.md` на момент написания ещё не готовы. После TECH_PLANNING QA
проставляет пути в колонке Bind, сверяет имена команд (`CONFIRM`, `REGISTER`), коды ошибок, testids и сиды и обновляет
этот документ.
