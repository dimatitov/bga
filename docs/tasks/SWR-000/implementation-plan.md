# Implementation plan — SWR-000

## Roles involved
| Role | Executor | Why |
|---|---|---|
| analyst (+ backend-lead planning) | main session | маленькая tooling-задача: отдельный лид не нужен, план пишет оркестратор |
| backend-worker | subagent #1 | реализация `scripts/check-task.mjs` |
| qa-lead | subagent #2 (независим от #1) | `test-cases.md` и автотесты по спецификации, **без доступа к реализации** (пишутся параллельно) |
| reviewer | subagent #3 (не автор) | `review.md` |
| qa-worker | subagent #4 | прогон тестов и CLI, логи, `qa-results.md` |

Frontend-роли не задействованы: UI нет.

## Contracts (frozen before parallel work)
- CLI и exit codes — `specification.md` → Interface.
- `export function checkTask(taskDir, { repoRoot } = {}) → { problems: string[] }` из `scripts/check-task.mjs`.
  Каждый problem — строка, начинающаяся с имени файла задачи (`status.md: ...`) и содержащая id правила (`[R5]`).
- Импорт модуля **не** должен запускать CLI (проверка `import.meta.url` vs `process.argv[1]`).

## Subtasks and file ownership
| Subtask | Role | OWNED FILES | Depends on |
|---|---|---|---|
| S1 checker | backend-worker | `scripts/check-task.mjs` | contracts |
| S2 test design + tests | qa-lead | `docs/tasks/SWR-000/test-cases.md`, `scripts/check-task.test.mjs`, `scripts/fixtures/**` | contracts |
| S3 review | reviewer | `docs/tasks/SWR-000/review.md` | S1, S2 |
| S4 QA run | qa-worker | `docs/tasks/SWR-000/qa-results.md`, `docs/tasks/SWR-000/artifacts/logs/**` | S1, S2, S3 |

## Dependency graph
```text
contracts ─┬─ S1 ─┐
           └─ S2 ─┴─ S3 ─ S4 ─ FINAL_ACCEPTANCE ─ DELIVERY
```

## Implementation log (filled by workers)
| Subtask | Changed files | Tests run (command → result) | Limitations |
|---|---|---|---|
| S1 checker | `scripts/check-task.mjs` (new) | manual CLI smoke by worker: template → exit 0; no args → 2; missing dir → 2; 9 mutated scratch copies → expected [R1]–[R10]; fully passing copy → 0 (not independently verified — see QA) | simple table parser (`|` in cell breaks columns); AC tables in delivery-report.md not checked (R5 scope) |

## Analyst decisions on worker's open questions (2026-11-08)
- Empty `## Verification` section is a violation — **accepted** (a report without checks must not pass silently).
- R8 allows trailing text after the verdict word (`approved — no blockers`) — **accepted**, spec R8 clarified accordingly.
- R6 checks evidence paths on every AC row, not only `passed` — **accepted** (a broken link is wrong whatever the status).
| S1 rework cycle 1 (D1–D13) | `scripts/check-task.mjs` (rewritten) | worker probes for review f1–f8, f12–f13 and D12 on scratch copies → expected R-ids; template → exit 0 (not independently verified — see QA) | missing path may be reported twice (by token and as "no existing file"); 4-space indented code blocks not stripped; check name containing ` - ` splits wrongly |
| S1 rework cycle 2 (D14–D16) | `scripts/check-task.mjs` | worker probes n3, nospec, unk, n1b, n2b, unfence, uncomm, ctl, n5 → expected; integration `artifacts/logs/integration-r3.log` | R10 duplicated per accepted file; union of multiple spec AC sections not flagged; inline code spans single-line only |
