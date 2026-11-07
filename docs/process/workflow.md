# Workflow задачи, handoff и quality gates

Применяется к каждой задаче в `docs/tasks/<ID>/`. Роли — [`docs/agents/roles/`](../agents/roles/).
Рантайм-специфика — [`runtime-adapters.md`](runtime-adapters.md).

## 1. Этапы

| # | Stage | Ответственный | Артефакт | Gate (условие `passed`) |
|---|---|---|---|---|
| 1 | INTAKE | Analyst | `request.md` | есть `title`, `description`, `acceptance_criteria`; ID присвоен |
| 2 | ANALYSIS | Analyst | `specification.md` | каждый AC переписан в проверяемое утверждение `AC-n`; assumptions/risks/out-of-scope записаны |
| 3 | TECH_PLANNING | FE/BE Lead | `implementation-plan.md` | зоны изменений, владение файлами, контракты, dependency graph |
| 4 | EARLY_QA_DESIGN | QA Lead | `test-cases.md` | каждый `AC-n` покрыт ≥1 тест-кейсом, есть негативные сценарии; **до** реализации |
| 5 | IMPLEMENTATION | Workers | изменённые файлы + список в `implementation-plan.md` | worker приложил список файлов, тестов, ограничений |
| 6 | INTEGRATION | Lead | изменённые файлы | части собраны, локальные проверки зоны зелёные |
| 7 | CODE_REVIEW | Reviewer (не автор) | `review.md` | вердикт `approved`, нет блокирующих замечаний |
| 8 | BUSINESS_VALIDATION | Analyst | `acceptance.md` (раздел pre-QA) | бизнес-сценарий проходит глазами Analyst **до** QA |
| 9 | QA_EXECUTION | QA Lead / QA Workers | `qa-results.md` | тест-кейсы выполнены, дефекты заведены, есть логи |
| 10 | FINAL_ACCEPTANCE | Analyst | `acceptance.md` | у каждого AC вердикт + доказательство |
| 11 | DELIVERY | Analyst | `delivery-report.md` | отчёт по шаблону, `check-task` зелёный |

TECH_PLANNING ‖ EARLY_QA_DESIGN и INTEGRATION ‖ CODE_REVIEW могут идти параллельно.

Статусы этапа: `pending | in_progress | passed | failed | blocked`. Текущее состояние — в `status.md`.

## 2. Обязательные проверки (до FINAL_ACCEPTANCE)

1. lint и typecheck — успешно (когда появятся; до этого `not_run`).
2. unit/integration — пройдены соответствующие тесты.
3. build — успешно (когда появится).
4. UI-изменения — E2E Playwright; при необходимости screenshots/traces (skill `browser-qa`).
5. Изменения игрового состояния — тесты переходов, инвариантов и ошибочных команд.
6. Каждый AC имеет вердикт и доказательство.
7. У reviewer нет блокирующих замечаний.
8. Не проверявшееся — `not_run`, не `passed`.

## 3. Dispatch и handoff

Оркестратор (Analyst) назначает работу сообщением-брифом. Бриф **обязан** содержать:

```text
TASK: <ID>/<подзадача>
ROLE: <role>
GOAL: <что должно быть правдой по завершении>
INPUTS: <файлы спецификации/плана/тест-кейсов>
OWNED FILES: <пути, которые можно менять>        # всё остальное — только чтение
CONTRACTS: <интерфейсы, которые нельзя менять>
DONE WHEN: <проверяемые условия>
REPORT: changed files, tests run (команда + результат), known limitations, open questions
```

Ответ исполнителя (handoff back) — в том же порядке, что `REPORT`. Команды проверок указываются
дословно, с фактическим результатом. Утверждение без команды/файла считается неподтверждённым.

Минимальный состав: оркестратор не вызывает роль, если её работа сводится к паре правок — делает сам,
но **никогда** не совмещает в одном лице автора кода и reviewer, автора кода и QA.

## 4. Возвраты, повторы, эскалация

- **Дефект из QA** → `qa-results.md` (шаги, severity, ожидаемое/фактическое) → этап IMPLEMENTATION снова
  `in_progress` → исправление → повтор затронутых кейсов + регрессия.
- **Блокирующее замечание review** → CODE_REVIEW `failed` → автор исправляет → повторное ревью.
- **Лимит повторов:** 3 цикла на один дефект. Дальше — `blocked` и эскалация к Analyst → Product Owner.
- **Спорное требование** → Analyst; продуктовое решение → Product Owner (человек).
- **Сбой инструмента/рантайма** (агент упал, команда недоступна) → фиксируется как `blocked` с причиной,
  не маскируется под `passed`.

## 5. Машинно-проверяемые форматы

`scripts/check-task.mjs` проверяет папку задачи. Форматы ниже — контракт между людьми, агентами и скриптом.

### `status.md`

```markdown
| Stage | Status | Owner | Artifact | Reason |
|---|---|---|---|---|
| INTAKE | passed | analyst | `request.md` | ... |
```

- Все 11 этапов из §1, в этом порядке, каждый ровно один раз.
- `Status` ∈ `pending, in_progress, passed, failed, blocked`.
- Если этап `passed` — все предыдущие этапы `passed`, и все пути в обратных кавычках в `Artifact` существуют
  (относительно папки задачи, затем корня репозитория).

### Таблица AC (`acceptance.md`, `qa-results.md`)

Под заголовком `## Acceptance criteria`:

```markdown
| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `artifacts/logs/unit.log` |
```

- `Status` ∈ `passed, failed, not_run, blocked`.
- `passed` ⇒ `Evidence` не пустое и не заглушка (`-`, `—`, `TBD`, `TODO`, `n/a`).
- Путь в обратных кавычках (содержит `/` или расширение файла и без пробелов) должен существовать.

### Verification (`qa-results.md`, `delivery-report.md`)

Под заголовком `## Verification`, строки вида `- <check>: <status> — <evidence>`:

- `status` ∈ `passed, failed, not_run, blocked`.
- `passed` ⇒ есть evidence после статуса; пути в нём существуют.

### Review (`review.md`)

Под `## Verdict` первая непустая строка: `approved | changes_requested | blocked`.

### Final decision (`acceptance.md`, `delivery-report.md`)

Под `## Final decision` первая непустая строка начинается с `accepted | rejected | blocked`.
`accepted` допустимо только если: все AC в `acceptance.md` — `passed`; вердикт `review.md` — `approved`;
этап FINAL_ACCEPTANCE в `status.md` — `passed`.
