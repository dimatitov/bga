# Test cases — SWR-000

Written by QA Lead from `specification.md` before implementation.

Источник: только `specification.md` (Interface, R1–R10, AC-1..AC-5) и контракт в `implementation-plan.md`.
Реализация `scripts/check-task.mjs` при проектировании не читалась.

Автотесты: `scripts/check-task.test.mjs` (`node:test`), имя каждого теста начинается с TC id.
Базовая фикстура: `scripts/fixtures/valid-task/` — все 9 файлов, 11 этапов `passed`, AC `passed` с существующими
evidence, ревью `approved`, оба Final decision `accepted`. Негативные варианты: фикстура копируется во временный
каталог (`fs.mkdtempSync(os.tmpdir())`, раскладка `<tmp>/repo/task`, `repoRoot = <tmp>/repo`) и в ней меняется
ровно одна вещь. Тесты проверяют id правила (`[Rn]`) и префикс-имя файла проблемы, а не точный текст.

Уровни: **unit** — вызов `checkTask(taskDir, { repoRoot })`; **integration** — запуск CLI через
`process.execPath scripts/check-task.mjs ...` с проверкой exit code и stdout.

| TC | Covers | Level | Type | Steps / input | Expected |
|---|---|---|---|---|---|
| TC-10 | AC-1, R1 | unit | negative | Удалить каждый из 9 обязательных файлов по очереди (9 подкейсов) | проблема с префиксом `<file>` и `[R1]` |
| TC-11 | AC-1, R1 | unit | boundary | Пустой каталог задачи | по проблеме `[R1]` на каждый из 9 файлов |
| TC-12 | AC-1, R1 | unit | negative | Удалить `test-cases.md` и `delivery-report.md` | обе проблемы `[R1]` (без раннего выхода) |
| TC-13 | AC-1, R1 | integration | negative | CLI на папке без `specification.md` | exit 1; строка `specification.md: ...[R1]`; строка `FAIL ...` |
| TC-14 | AC-1, R1 | unit | boundary | Добавить лишний файл `notes.md` | проблем нет |
| TC-20 | AC-2, R5 | unit | negative | `acceptance.md` / `qa-results.md`: AC `passed` с пустым evidence | `<file>` `[R5]` |
| TC-21 | AC-2, R5 | unit | negative | AC `passed` с заглушкой: `-`, `—`, `TBD`, `TODO`, `n/a`, `tbd`, `N/A`, `Todo` (×2 файла) | `<file>` `[R5]` (регистронезависимо) |
| TC-22 | AC-2, R5 | unit | negative | Статус AC `done` (×2 файла) | `<file>` `[R5]` |
| TC-23 | AC-2, R6 | unit | negative | `passed`, evidence `` `artifacts/logs/missing.log` `` (×2 файла) | `<file>` `[R6]` |
| TC-24 | AC-2, R6 | unit | negative | `passed`, evidence `` `missing-report.log` `` (только `.ext`, без `/`) (×2 файла) | `<file>` `[R6]` |
| TC-25 | AC-2, R6 | unit | negative | `passed`, в ячейке один существующий и один несуществующий путь (×2 файла) | `<file>` `[R6]` |
| TC-26 | AC-2, R6 | unit | boundary | Evidence `` `node --test scripts/` → `artifacts/logs/unit.log` `` | проблем нет (команда не путь) |
| TC-27 | AC-2, R6 | unit | boundary | Evidence `` `pnpm run test/unit` `` (пробелы + `/`) + существующий путь | проблем нет |
| TC-28 | AC-2, R6 | unit | boundary | Evidence `` `unit` `` (нет `/` и `.ext`) + существующий путь | проблем нет |
| TC-29 | AC-2, R5, R6 | unit | boundary | AC `failed`/`not_run`/`blocked` с пустым evidence или `-`; Final decision → `blocked` | нет `[R5]`, нет `[R6]` |
| TC-30 | AC-2, R6 | unit | positive | Evidence `` `scripts/evidence.test.mjs` `` существует только относительно `repoRoot` | проблем нет |
| TC-31 | AC-2, R5 | unit | negative | В `acceptance.md` нет `## Acceptance criteria` | `acceptance.md` `[R5]` |
| TC-32 | AC-2, R5 | unit | negative | В `qa-results.md` нет `## Acceptance criteria` | `qa-results.md` `[R5]` |
| TC-33 | AC-2, R5 | integration | negative | CLI: `qa-results.md` AC-2 `passed` / `TODO` | exit 1; строка `qa-results.md: ...[R5]` |
| TC-34 | AC-2, R7 | unit | negative | `qa-results.md` / `delivery-report.md`: `- unit: passed` (нет `—` и evidence) | `<file>` `[R7]` |
| TC-35 | AC-2, R7 | unit | negative | `- unit: passed — ` (тире, пустой evidence) (×2 файла) | `<file>` `[R7]` |
| TC-36 | AC-2, R7 | unit | negative | `- unit: ok — ...` (недопустимый статус) (×2 файла) | `<file>` `[R7]` |
| TC-37 | AC-2, R7, R6 | unit | negative | `- unit: passed — `` `artifacts/logs/ghost.log` `` (×2 файла) | `<file>` `[R7]` или `[R6]` |
| TC-38 | AC-2, R7 | unit | negative | Нет `## Verification` (×2 файла) | `<file>` `[R7]` |
| TC-39 | AC-2, R7 | unit | boundary | `- e2e: not_run — `, `- lint: blocked`, `- perf: failed — ` | нет `[R7]` |
| TC-40 | AC-2, R7 | unit | boundary | `- unit: passed — `` `node --test scripts/` `` → `` `artifacts/logs/unit.log` `` | проблем нет |
| TC-50 | AC-5 | unit | positive | `checkTask(scripts/fixtures/valid-task)` на месте | `problems` = `[]` |
| TC-51 | AC-5 | unit | positive | Та же фикстура, скопированная во temp | `problems` = `[]` |
| TC-52 | AC-5 | integration | positive | CLI на валидной копии | exit 0; строка `OK <taskDir>`; нет `FAIL` |
| TC-53 | AC-5 | unit | positive | `checkTask(docs/tasks/_template, { repoRoot })` | `problems` = `[]` |
| TC-54 | AC-5 | integration | positive | CLI на `docs/tasks/_template` | exit 0; `OK ...` |
| TC-55 | AC-5 | integration | negative | CLI без аргументов | exit 2 |
| TC-56 | AC-5 | integration | negative | CLI с несуществующей папкой | exit 2 |
| TC-57 | AC-5, AC-1 | integration | boundary | CLI с двумя папками: валидной и без `review.md` | exit 1; `OK <good>` и `FAIL <bad>` |
| TC-58 | AC-5, AC-1, AC-2 | integration | negative | CLI: без `request.md` + AC-1 `passed`/`TBD` | строки `<taskDir>/request.md:` и `<taskDir>/acceptance.md:`; `FAIL ... (<n> problems)`, n = длина `checkTask().problems` |
| TC-59 | AC-5 (contract) | integration | positive | `import('./check-task.mjs')` в отдельном процессе | exit 0, пустой stdout (CLI не запускается при импорте) |
| TC-60 | AC-3, R2 | unit | negative | Удалить строку `INTEGRATION` | `status.md` `[R2]` |
| TC-61 | AC-3, R2 | unit | negative | Дублировать строку `CODE_REVIEW` | `status.md` `[R2]` |
| TC-62 | AC-3, R2 | unit | negative | Переставить `ANALYSIS` и `TECH_PLANNING` (оба `passed`) | `status.md` `[R2]` |
| TC-63 | AC-3, R2 | unit | negative | Статус этапа `done` | `status.md` `[R2]` |
| TC-64 | AC-3, R3 | unit | negative | `CODE_REVIEW` = `pending`/`in_progress`/`failed`/`blocked`, последующие `passed` (4 подкейса) | `status.md` `[R3]` |
| TC-65 | AC-3, R3 | unit | boundary | `INTAKE` = `in_progress`, остальные `passed` | `status.md` `[R3]` |
| TC-66 | AC-3, R3 | unit | boundary | `passed`-префикс, затем `in_progress`/`pending`; решения `blocked` | проблем нет |
| TC-67 | AC-3, R4 | unit | negative | `passed`-этап с артефактом `` `artifacts/logs/impl-missing.log` `` | `status.md` `[R4]` |
| TC-68 | AC-3, R4, R1 | unit | negative | Удалить `review.md` (артефакт `passed`-этапа `CODE_REVIEW`) | `review.md` `[R1]` и `status.md` `[R4]` |
| TC-69 | AC-3, R4 | unit | boundary | `pending`-этап с несуществующим артефактом | нет `[R4]` |
| TC-70 | AC-3, R4 (D9) | unit | negative | `passed`-этап с пустой ячейкой Artifact | `status.md` `[R4]` (было «проблем нет» до D9) |
| TC-71 | AC-3, R4 | unit | positive | Артефакт `` `scripts/impl.mjs` `` существует только относительно `repoRoot` | проблем нет |
| TC-72 | AC-3, R2 | unit | negative | `status.md` без таблицы этапов | `status.md` `[R2]` |
| TC-73 | AC-3 | unit | positive | Самопроверка фикстуры: 11 этапов в каноническом порядке | порядок совпадает |
| TC-74 | AC-3, R2 | integration | negative | CLI: дублирован `INTAKE` | exit 1; строка `status.md: ...[R2]` |
| TC-80 | AC-4, R8 | unit | negative | Verdict `lgtm` | `review.md` `[R8]` |
| TC-81 | AC-4, R8 | unit | negative | Нет `## Verdict` | `review.md` `[R8]` |
| TC-82 | AC-4, R8 | unit | boundary | Пустые строки перед `approved` | проблем нет |
| TC-83 | AC-4, R10 | unit | negative | `accepted` (в обоих файлах) + verdict `changes_requested` / `blocked` | `acceptance.md` `[R10]` и `delivery-report.md` `[R10]`, нет `[R8]` |
| TC-84 | AC-4, R10 | unit | negative | `accepted` + AC-2 `failed` / `not_run` / `blocked` | `acceptance.md` и `delivery-report.md` `[R10]` |
| TC-85 | AC-4, R10 | unit | boundary | `accepted` при нуле AC-строк в `acceptance.md` | `acceptance.md` и `delivery-report.md` `[R10]` |
| TC-86 | AC-4, R10 | unit | negative | `accepted` + `FINAL_ACCEPTANCE` = `in_progress`/`pending`/`failed`/`blocked` (`DELIVERY` = `pending`) | `acceptance.md` и `delivery-report.md` `[R10]` |
| TC-87 | AC-4, R10 | unit | negative | `accepted` только в `delivery-report.md`, AC-1 `failed` | `delivery-report.md` `[R10]`; нет `acceptance.md` `[R10]` |
| TC-88 | AC-4, R10 | unit | negative | `accepted` только в `acceptance.md`, verdict `changes_requested` | `acceptance.md` `[R10]`; нет `delivery-report.md` `[R10]` |
| TC-89 | AC-4, R9 | unit | negative | Final decision `approved — ...` (×2 файла) | `<file>` `[R9]` |
| TC-90 | AC-4, R9 | unit | negative | Нет `## Final decision` (×2 файла) | `<file>` `[R9]` |
| TC-91 | AC-4, R9 | unit | boundary | Пустой раздел `## Final decision` (×2 файла) | `<file>` `[R9]` |
| TC-92 | AC-4, R8–R10 | unit | boundary | `rejected` / `blocked` + AC `failed` + verdict `changes_requested` | нет `[R8]`, `[R9]`, `[R10]` |
| TC-93 | AC-4, R9 | unit | boundary | `accepted` без хвоста; `accepted after QA run` | проблем нет |
| TC-94 | AC-4, R10 | integration | negative | CLI: `accepted` + AC-1 `not_run` | exit 1; `[R10]` в выводе |
| TC-100 | AC-4, R10 (D1, f1) | unit | negative | `acceptance.md`: в ```` ``` ```` блоке до реального раздела — фейковый `## Acceptance criteria` с AC-1 `passed`; реальный AC-2 `failed`; `accepted` | `acceptance.md` `[R10]` |
| TC-101 | AC-4, R10 (D1, f1) | unit | negative | `review.md`: в `~~~` блоке фейковый `## Verdict approved`, реальный `changes_requested`; `accepted` | `[R10]` в обоих accepted-файлах |
| TC-102 | AC-4, R10 (D1, f1) | unit | negative | `status.md`: all-`passed` таблица внутри `<!-- -->` перед реальной; реальный `FINAL_ACCEPTANCE` `pending` | `[R10]` в обоих accepted-файлах |
| TC-103 | AC-2, AC-5 (D1) | unit | boundary | Fenced/HTML-комментарий с фейковыми разделами и строками **после** реальных разделов (`acceptance.md`, `qa-results.md`) | проблем нет (не считается дублем) |
| TC-104 | AC-2, R5 (D2, f2) | unit | negative | Второй `## Acceptance criteria` в `acceptance.md` | `acceptance.md` `[R5]` |
| TC-105 | AC-4, R9 (D2, f2) | unit | negative | Два `## Final decision` (`blocked`, затем `accepted`) | `acceptance.md` `[R9]` |
| TC-106 | AC-2, R7 (D2) | unit | negative | Второй `## Verification` (×2 файла) | `<file>` `[R7]` |
| TC-107 | AC-4, R8 (D2) | unit | negative | Второй `## Verdict` | `review.md` `[R8]` |
| TC-108 | AC-2, R5 (D3, f3) | unit | negative | Пустая строка перед строкой AC-2 в `acceptance.md` | `acceptance.md` `[R5]` |
| TC-109 | AC-2, AC-4 (D3, f3) | unit | negative | То же + AC-2 `failed` + `accepted` | `acceptance.md` `[R5]` (не молчаливый OK) |
| TC-110 | AC-2, R5 (D3) | unit | negative | Текстовая строка внутри AC-таблицы `qa-results.md` | `qa-results.md` `[R5]` |
| TC-111 | AC-3, R2 (D3) | unit | negative | Пустая строка внутри таблицы `status.md` | `status.md` `[R2]` |
| TC-112 | AC-4, R8/R10 (D4, f4) | unit | negative | Verdict `~~approved~~ changes_requested` + `accepted` | `[R10]` в обоих файлах, нет `[R8]` |
| TC-113 | AC-4, R10 (D4, f4) | unit | negative | Decision `~~blocked~~ accepted` + AC-2 `failed` | `acceptance.md` `[R10]` |
| TC-114 | AC-4 (D4) | unit | boundary | Verdict только `~~approved~~` + `accepted` | `review.md` `[R8]` или `[R10]` (не чисто) |
| TC-115 | AC-4, R8 | unit | boundary | Verdict `approved — no blockers` | проблем нет |
| TC-116 | AC-2, R5 (D5) | unit | negative | `passed` с evidence: свободный текст, `` `node --test scripts/` ``, `**TBD**`, `_TODO_`, `TBD.`, `` `pnpm test` ``, `` `unit` `` (7 подкейсов) | `acceptance.md` `[R5]` |
| TC-117 | AC-2, R5 (D5) | unit | negative | `qa-results.md`: `passed` / `ran it locally` | `qa-results.md` `[R5]` |
| TC-118 | AC-2, R7 (D5) | unit | negative | `- unit: passed — yes` / `` `none` `` / `` `node --test scripts/` `` / `see logs` (×2 файла) | `<file>` `[R7]` |
| TC-119 | AC-2, R11 (D6) | unit | negative | AC evidence `` `/etc/hosts` ``, `` `/` ``, `` `/dev/null` ``, `..`-escape, каталог `` `artifacts/logs/` `` и `` `artifacts/logs` `` | `acceptance.md` `[R11]` |
| TC-120 | AC-2, R11 (D6) | unit | negative | Verification `` `/etc/hosts` `` | `qa-results.md` `[R11]` |
| TC-121 | AC-2, R11 (D6) | unit | negative | `` `../../outside.log` `` — файл существует, но вне `repoRoot` | `acceptance.md` `[R11]` |
| TC-122 | AC-2, R11 (D6) | unit | boundary | `` `../task/artifacts/logs/unit.log` `` — `..`, но внутри `repoRoot`, файл | проблем нет |
| TC-123 | AC-3, R4/R11 (D6) | unit | negative | `passed`-этап с артефактом `` `/` `` | `status.md` `[R4]` или `[R11]` |
| TC-124 | AC-5 (D7) | integration | negative | `chmod 000 status.md`, CLI | exit 2, нет stack trace (skip под root/Windows) |
| TC-125 | AC-5 (D7) | integration | negative | `chmod 000` папки задачи, CLI | exit 2, нет stack trace |
| TC-126 | AC-2, R7 (D8) | unit | boundary | Вложенные пункты с отступом под `- e2e: ...` (×2 файла) | проблем нет |
| TC-127 | AC-2, R7 (D8) | unit | boundary | `` - unit (node:test): passed — `artifacts/logs/unit.log` `` | проблем нет |
| TC-128 | AC-2, R7 (D8) | unit | negative | Свободный текст верхнего уровня `- logs are in artifacts` | `qa-results.md` `[R7]` |
| TC-129 | AC-2, R7 | unit | negative | Пустой раздел `## Verification` | `qa-results.md` `[R7]` |
| TC-130 | AC-3, R4 (D9) | unit | negative | `passed`-этап, Artifact только `` `merged` `` (не путь) | `status.md` `[R4]` |
| TC-131 | AC-3, AC-5 (D9) | unit | boundary | Не-`passed` этап с пустым Artifact | проблем нет |
| TC-132 | AC-2, R5 (D10) | unit | negative | `delivery-report.md` AC `passed` с evidence `""` / `TBD` / `all fine` | `delivery-report.md` `[R5]` |
| TC-133 | AC-2, R5 (D10) | unit | negative | `delivery-report.md` AC статус `ok` | `delivery-report.md` `[R5]` |
| TC-134 | AC-2, R5 (D10) | unit | negative | `delivery-report.md` без `## Acceptance criteria` | `delivery-report.md` `[R5]` |
| TC-135 | AC-4, R10 (D10) | unit | negative | `accepted`, `acceptance.md` всё `passed`, но `qa-results.md` AC-2 `failed`/`not_run`/`blocked` | `[R10]` в обоих accepted-файлах |
| TC-136 | AC-5 (D11) | integration | boundary | CLI аргумент `task/` (с `/`), без `request.md` | строка начинается с `task/` и содержит `request.md:` `[R1]`; `FAIL task/ (` |
| TC-137 | AC-5 (D11) | integration | boundary | CLI относительный аргумент `task`, без `request.md` | `task/request.md: ...`; `FAIL task (n problems)` |
| TC-138 | AC-5 (D11) | integration | positive | CLI относительный аргумент `task`, валидная папка | exit 0; `OK task` |
| TC-139 | AC-2..AC-4 (D11) | unit | negative | `Passed` (AC, ×2 файла: `Passed`/`PASSED`), `Passed` (Verification), `Passed` (этап), `Approved`, `Accepted` | `[R5]` / `[R5]` / `[R7]` / `[R2]` / `[R8]` / `[R9]` с префиксом файла |
| TC-140 | AC-2, R6 | unit | negative | AC `failed` с несуществующим путём (решение `rejected`) | `acceptance.md` `[R6]` |
| TC-141 | AC-2, R6 | unit | boundary | Evidence `` `artifacts/logs/unit.log:12` `` и `#L3` (AC + Verification) | проблем нет |
| TC-142 | AC-3, R2 | unit | negative | Опечатка в имени этапа `INTEGRATON` | `status.md` `[R2]` |
| TC-143 | AC-5 | unit | boundary | Все файлы валидной фикстуры в CRLF | проблем нет |
| TC-144 | AC-4, R10 | unit | negative | CRLF + AC-2 `failed` + `accepted` | `[R10]` в обоих accepted-файлах |
| TC-145 | AC-5, AC-1 | unit + integration | boundary | Путь `.../my repo/my task` с пробелами: валидный → exit 0; без `review.md` → exit 1, строка `<taskDir>/review.md:` | как описано |
| TC-146 | AC-4, R10 (D12) | unit | negative | `accepted` + в `qa-results.md` / `delivery-report.md` таблица AC без строк (×2 файла) | `[R10]` в обоих accepted-файлах |
| TC-147 | AC-4, R10 (D12) | unit | negative | `accepted` + AC-1 `not_run` / `failed` в `qa-results.md` / `delivery-report.md` (4 подкейса) | `[R10]` в обоих accepted-файлах |
| TC-148 | AC-4, R10 (D12) | unit | boundary | AC-1 `failed` в `qa-results.md` / `delivery-report.md`, решения `blocked` | нет `[R10]` |
| TC-149 | AC-2, R11 (D13) | unit | boundary | Папка задачи вне `repoRoot`, evidence внутри папки задачи | проблем нет |
| TC-150 | AC-2, R11 (D13) | unit | negative | Папка задачи вне `repoRoot`, `` `../sibling.log` `` выходит за обе границы (файл существует) | `acceptance.md` `[R11]` |
| TC-151 | AC-4, AC-5 (D14) | unit | positive | Самопроверка фикстуры: `specification.md` под `## Acceptance criteria` содержит ровно `- **AC-1:**`, `- **AC-2:**` | `['AC-1','AC-2']` |
| TC-152 | AC-4, R10 (D14, R2-1) | unit | negative | AC-2 удалён из всех трёх таблиц, спецификация его определяет, `accepted` | `[R10]` в обоих accepted-файлах |
| TC-153 | AC-4, R10 (D14) | unit | negative | AC-2 удалён только из `acceptance.md` / `qa-results.md` / `delivery-report.md` (3 подкейса) | `[R10]` в обоих accepted-файлах |
| TC-154 | AC-4, R10 (D14) | unit | negative | В спецификацию добавлен `- **AC-3:**`, в таблицах его нет, `accepted` | `[R10]` в обоих accepted-файлах |
| TC-155 | AC-4, R10 (D14) | unit | boundary | Раздел `## Acceptance criteria` спецификации без пунктов AC, `accepted` | `[R10]` в обоих accepted-файлах |
| TC-156 | AC-4, R10 (D14) | unit | negative | В спецификации нет заголовка `## Acceptance criteria…`, `accepted` | `[R10]` в обоих accepted-файлах |
| TC-157 | AC-2, R5 (D14) | unit | negative | Строка `AC-3` (нет в спецификации) в таблице `acceptance.md` / `qa-results.md` / `delivery-report.md` | `<file>` `[R5]` |
| TC-158 | AC-4, R10 (D14) | unit | boundary | AC-2 удалён из всех таблиц, решения `blocked` | нет `[R10]` |
| TC-159 | AC-4 (D14) | unit | boundary | `- **AC-9:**` под другим заголовком спецификации (`## Out of scope`) | проблем нет |
| TC-160 | AC-2, R5 (D15, R2-2) | unit | negative | Строка-декой N1b (```` ```node --test``` was run ````) или N2b (`` `<!--` `` в inline code) в `acceptance.md`, затем видимый второй `## Acceptance criteria` с AC-2 `failed` (2 подкейса) | `acceptance.md` `[R5]` |
| TC-161 | AC-5 (D15) | unit | boundary | Та же строка-декой без дубля (2 подкейса) | проблем нет (не открывает fence/comment) |
| TC-162 | AC-4, R8 (D15) | unit | boundary | `` `<!--` `` в inline code в `review.md` над `## Verdict` | проблем нет (вердикт не скрыт) |
| TC-163 | R1 (D15) | unit | negative | Незакрытый ```` ``` ````, `~~~` или `<!--` в конце `acceptance.md` / `review.md` (6 подкейсов) | `<file>` `[R1]` |
| TC-164 | AC-2, R5 (D16, R2-3) | unit | negative | AC `passed`, evidence только `` ~~`artifacts/logs/unit.log`~~ not re-run `` | `acceptance.md` `[R5]` |
| TC-165 | AC-2, R7 (D16) | unit | negative | `` - unit: passed — ~~`artifacts/logs/unit.log`~~ `` | `qa-results.md` `[R7]` |
| TC-166 | AC-2, R6 (D16) | unit | boundary | Зачёркнутый несуществующий путь + живой существующий путь | проблем нет |
| TC-167 | AC-2, R11 (R2-4) | unit | negative | AC evidence — абсолютный путь существующего файла **внутри** `repoRoot` | `acceptance.md` `[R11]` |
| TC-168 | AC-2, R11 (R2-4) | unit | negative | Verification evidence — абсолютный путь внутри `repoRoot` | `qa-results.md` `[R11]` |

## Coverage
| AC | Test cases |
|---|---|
| AC-1 | TC-10, TC-11, TC-12, TC-13, TC-14, TC-57, TC-58, TC-68, TC-145 |
| AC-2 | TC-20…TC-40 (R5: TC-20–22, 29, 31–33; R6: TC-23–30; R7: TC-34–40), TC-58, TC-103, TC-104, TC-106, TC-108–110, TC-116–122, TC-126–129, TC-132–134, TC-139–141, TC-149, TC-150, TC-157, TC-160, TC-164–168 |
| AC-3 | TC-60…TC-74 (R2: TC-60–63, 72, 74; R3: TC-64–66; R4: TC-67–71), TC-111, TC-123, TC-130, TC-131, TC-139, TC-142 |
| AC-4 | TC-80…TC-94 (R8: TC-80–83; R9: TC-89–91, 93; R10: TC-83–88, 92, 94), TC-100–102, TC-105, TC-107, TC-109, TC-112–115, TC-135, TC-139, TC-144, TC-146–148, TC-151–159, TC-162 |
| AC-5 | TC-50…TC-59, TC-103, TC-124, TC-125, TC-131, TC-136–138, TC-143, TC-145, TC-151, TC-161, TC-163 |

Регрессия review #1: f1 → TC-100–103; f2 → TC-104–107; f3 → TC-108–111; f4 → TC-112–114; f5/D5 → TC-116–118;
f6/D6 → TC-119–123; f7/D7 → TC-124–125; f8/D8 → TC-126–128; f9/D9 → TC-70, TC-130–131; f10/D10 → TC-132–135;
f11 → TC-31/32/38 (точные id), TC-83–88 (префикс файла), TC-115, TC-129, TC-140–145; f12/f13/D11 → TC-136–139; D12 → TC-135, TC-146–148; D13 → TC-121, TC-149–150.
Регрессия review #2: R2-1/D14 → TC-151–159; R2-2/D15 → TC-160–163; R2-3/D16 → TC-164–166; R2-4 → TC-167–168.
R1 (незакрытый fence/comment, D15) — TC-163.

## Ambiguities
Закрыты Clarifications log и D1–D11 (2026-11-08): rule id для отсутствующих разделов (R5/R7/R8/R9), fallback путей
для R6/R7, префикс файла для R10, AC-таблицы `qa-results.md`/`delivery-report.md` в R10 (D12), граница R11 (D13), набор AC из спецификации (D14), fence/comment (D15), зачёркнутый evidence (D16), вывод `<taskDir>` дословно, регистр ключевых слов, R5 для `delivery-report.md`.

Остаются открытыми (тесты написаны терпимо, решение не принято QA):
1. Несуществующий путь в Verification — `[R7]` или `[R6]` (TC-37 принимает любой).
2. D6/R11 для `Artifact` в `status.md`: «путь-доказательство» явно про evidence; TC-123 принимает `[R4]` или `[R11]`.
3. D11 + завершающий `/`: «дословно» — допускается ли `task//request.md` или ожидается `task/request.md`?
   TC-136 проверяет только префикс `task/` и `FAIL task/ (`.
4. D4: строка вердикта, ставшая пустой после удаления `~~…~~` — это «первая непустая строка» или пропускается?
   TC-114 требует лишь `[R8]` или `[R10]`.
5. Если `accepted` в обоих файлах, R10 ожидается с префиксом **каждого** (TC-83–86, 101, 102, 112, 135, 144) — прямое
   прочтение правила «префикс того файла, где стоит `accepted`».
6. Поведение `checkTask()` (модуль, не CLI) для нечитаемого файла не определено (D7 говорит про exit 2) — проверяется только CLI.
7. D6 и `..` внутри `repoRoot` (TC-122) считаются допустимыми, т.к. D6 требует «разрешаться внутри корня», а не «без `..`».
8. Неизвестный лишний этап (кроме опечатки, TC-142) не покрыт: R2 не говорит, нарушение ли лишняя строка.
