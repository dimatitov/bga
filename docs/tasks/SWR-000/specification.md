# Specification — SWR-000

## Business goal
Автоматический gate честности отчётов агентов: статус `passed`/`accepted` нельзя поставить без проверяемых оснований.

## Scenarios
1. Оркестратор на DELIVERY запускает `node scripts/check-task.mjs docs/tasks/SWR-000` → видит список нарушений или «OK».
2. CI (позже) запускает тот же скрипт для всех `docs/tasks/SWR-*`.

## Interface
- `node scripts/check-task.mjs <taskDir> [<taskDir> ...]`
- Exit `0` — нарушений нет; `1` — есть нарушения; `2` — ошибка использования (нет аргументов / папка не существует).
- Вывод: по строке на нарушение: `<taskDir>/<file>: <message>`; в конце `OK <taskDir>` или `FAIL <taskDir> (<n> problems)`.
- Модуль экспортирует `checkTask(taskDir, { repoRoot }) → { problems: string[] }` для тестов.
- Корень репозитория по умолчанию — ближайший предок с `AGENTS.md`, иначе cwd.

## Rules (из `docs/process/workflow.md` §5)
- R1 Обязательные файлы: `request.md, specification.md, implementation-plan.md, test-cases.md, review.md, qa-results.md, acceptance.md, delivery-report.md, status.md`.
- R2 `status.md`: все 11 этапов, в каноническом порядке, ровно по разу; статус из допустимого набора.
- R3 Этап `passed` ⇒ все предыдущие `passed`.
- R4 Этап `passed` ⇒ пути в обратных кавычках в `Artifact` существуют (относительно папки задачи, затем корня репо).
- R5 Таблица `## Acceptance criteria` в `acceptance.md` и `qa-results.md`: статус ∈ `passed, failed, not_run, blocked`;
  `passed` ⇒ evidence не пустое и не заглушка (`-`, `—`, `TBD`, `TODO`, `n/a`, регистронезависимо).
- R6 Путь-подобный токен в обратных кавычках в evidence (без пробелов, содержит `/` или оканчивается на `.<ext>`) должен существовать.
  Токены, начинающиеся с `node `, команды с пробелами — не пути.
- R7 `## Verification` в `qa-results.md` и `delivery-report.md`: строки `- <check>: <status>[ — evidence]`;
  статус допустимый; `passed` ⇒ evidence есть; пути (R6) существуют.
- R8 `review.md`: под `## Verdict` первое слово первой непустой строки ∈ `approved, changes_requested, blocked` (дальше допускается пояснение).
- R9 `## Final decision` в `acceptance.md` и `delivery-report.md`: первое слово первой непустой строки ∈ `accepted, rejected, blocked`.
- R10 `accepted` (в любом из двух файлов) ⇒ все AC в `acceptance.md` `passed` (и есть хотя бы один AC), вердикт ревью `approved`,
  FINAL_ACCEPTANCE в `status.md` `passed`.
- Отсутствие нужного раздела/таблицы в существующем файле — нарушение с id правила этого раздела
  (`## Acceptance criteria` → R5, `## Verification` → R7, `## Verdict` → R8, `## Final decision` → R9).
- Порядок поиска путей одинаков для R4, R6, R7: папка задачи, затем корень репозитория; суффикс `:line` / `#anchor` отбрасывается.
- Нарушение R10 сообщается с префиксом того файла, где стоит `accepted`.
- Строки вывода CLI начинаются с `<taskDir>` ровно в том виде, в каком он передан аргументом.

### Clarifications log
2026-11-08 (Analyst, после EARLY_QA_DESIGN и S1): закрыты вопросы QA lead о rule id для отсутствующих разделов,
fallback путей для R6, файле для R10 и формате пути в выводе; R8 допускает пояснение после вердикта.

## Acceptance criteria (testable)
- **AC-1:** Для папки без любого из файлов R1 скрипт сообщает о каждом отсутствующем файле и выходит с кодом 1.
- **AC-2:** AC-строка `passed` с пустым/заглушечным evidence или со ссылкой на несуществующий путь даёт нарушение (R5, R6); то же для Verification (R7).
- **AC-3:** `status.md` с пропущенным/дублированным/переставленным этапом, недопустимым статусом или `passed` после не-`passed` этапа даёт нарушение (R2–R4).
- **AC-4:** `accepted` при любом не-`passed` AC, вердикте ревью не `approved` или FINAL_ACCEPTANCE не `passed` даёт нарушение (R8–R10).
- **AC-5:** Полностью корректная папка-фикстура → exit 0 и `OK`; `docs/tasks/_template` (свежий шаблон) → exit 0
  (шаблон честен: всё `pending`/`not_run`/`blocked`); нет аргументов → exit 2.

## Assumptions
- Markdown-таблицы простые (`|`-разделители, без `|` внутри ячеек).
- Пути проверяются только на существование, не на содержимое.

## Risks
- Слишком строгий парсер будет мешать людям — сообщения должны указывать файл и правило.

## Out of scope
См. `request.md`.

### Rework decisions after CODE_REVIEW #1 (2026-11-08, Analyst)
Review: `review.md` (verdict changes_requested, findings 1–14). Decisions:
- **D1 (f1):** содержимое внутри fenced code blocks (```` ``` ````/`~~~`) и HTML-комментариев `<!-- -->` игнорируется при поиске разделов и таблиц.
- **D2 (f2):** повторный раздел `## Acceptance criteria` / `## Verification` / `## Verdict` / `## Final decision` в одном файле — нарушение правила этого раздела (R5/R7/R8/R9).
- **D3 (f3):** таблица — непрерывный блок строк `|`; строка таблицы AC, идущая в разделе после разрыва, — тоже нарушение R5 («table rows must be contiguous»), а не молча пропускается. Аналогично для `status.md` (R2).
- **D4 (f4):** при определении вердикта/решения зачёркнутый текст `~~…~~` удаляется целиком, а не только тильды.
- **D5 (f5) — ужесточение R5/R7:** `passed` ⇒ evidence содержит **хотя бы один** путь-подобный токен в обратных кавычках, который существует. Команда или свободный текст без файла — нарушение. (AGENTS.md: «passed только со ссылкой на реальный лог/тест/файл».)
- **D6 (f6) — R11:** путь-доказательство должен быть относительным, разрешаться внутри корня репозитория и указывать на файл (не каталог).
- **D7 (f7):** нечитаемый файл/каталог задачи → exit 2 с сообщением, без stack trace.
- **D8 (f8):** вложенные (с отступом) пункты под `## Verification` игнорируются; имя проверки может содержать `:` (статус — первое слово после последнего `: ` перед разделителем evidence). Свободный текст верхнего уровня — по-прежнему нарушение R7.
- **D9 (f9) — R4:** этап `passed` ⇒ в `Artifact` есть хотя бы один существующий путь.
- **D10 (f10) — R10/R5:** таблица AC в `delivery-report.md` тоже проверяется по R5; `accepted` также требует, чтобы в `qa-results.md` все AC были `passed`.
- **D11 (f12, f13):** вывод CLI использует аргумент дословно (включая завершающий `/`); все статусы, вердикты и решения сравниваются регистрозависимо в нижнем регистре.
- f14 (поиск AGENTS.md от cwd) — оставить как есть.
- **D12 (worker Q1/Q2):** `accepted` требует, чтобы таблица AC в `qa-results.md` и в `delivery-report.md` содержала ≥1 AC и все они были `passed` (нарушение — R10).
- **D13 (worker Q3):** граница R11 — корень репозитория **или** папка задачи (нужно для задач во временных каталогах тестов) — принято.
- **Accepted as known limitations (not blocking, 2026-11-08):** QA open items 1–4, 6–9 (tolerant assertions: R6 vs R7 for Verification paths, R4 vs R11 for artifacts, empty verdict after strike-through, unknown extra stage, D7 tests skipped as root). Candidates for a follow-up tightening task.

### Rework decisions after CODE_REVIEW #2 (2026-11-08, Analyst) — cycle 2/3
- **D14 (R2-1) — R10:** набор AC задачи = идентификаторы `AC-n` из пунктов вида `- **AC-n:**` под заголовком `specification.md`, начинающимся с `## Acceptance criteria`. При `accepted` каждый такой `AC-n` обязан присутствовать со статусом `passed` во всех трёх таблицах (acceptance, qa-results, delivery-report); пустой набор в спецификации при `accepted` — тоже R10. AC в таблице, которого нет в спецификации, — R5.
- **D15 (R2-2):** fenced block открывается только строкой, где после открывающего ```` ``` ````/`~~~` нет такого же закрывающего маркера; маркер комментария внутри inline-кода (`` `…` ``) не открывает комментарий; незакрытый fenced block или комментарий в конце файла — нарушение (R1, «unterminated code block/comment»).
- **D16 (R2-3):** зачёркнутый текст `~~…~~` удаляется и из evidence перед поиском путей.
- **R2-4:** тест на абсолютный путь, указывающий внутрь репозитория (должен быть R11).
- **Follow-up (не в SWR-000):** R2-5 (evidence = любой существующий файл), R2-6 (шум от отступленной таблицы-декоя) и ранее принятые ограничения QA.
