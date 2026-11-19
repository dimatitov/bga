# Acceptance — SWR-007

## Pre-QA business validation
Analyst, 2026-11-19 (`artifacts/logs/business-validation.log`): чистая БД с относительным URL `file:./bv-dev.db` (как в
`.env.example`) → `prisma migrate deploy` создаёт её в `apps/api/prisma/` (не в cwd), 4 миграции применены; собранный API
(`node dist/main.js`, NestJS 12 через `require(esm)`, Prisma 7 + адаптер) стартует, `/api/health` → ok, `/api/sessions` → `[]`,
`/api/dev/ai/status` → mock-провайдер, OpenAI выключен. Порты 3000/5173 и основной checkout не трогались. Дефектов нет.
Проверки сценария «клон → install»: `artifacts/logs/clean-install.log`.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-01 | passed | `artifacts/logs/qa-config.log`, `artifacts/logs/engines-node20.log` |
| AC-02 | passed | `artifacts/logs/pnpm-corepack.log`, `artifacts/logs/clean-install.log` |
| AC-03 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/qa-diff.log` |
| AC-04 | passed | `artifacts/logs/qa-verify.log`, `artifacts/logs/business-validation.log` |
| AC-05 | passed | `artifacts/logs/prisma7-fixture-compat.log`, `artifacts/logs/qa-fixture-prisma7.log` |
| AC-06 | passed | `implementation-plan.md`, `artifacts/logs/qa-config.log` |
| AC-07 | passed | `artifacts/logs/qa-ci-workflow.log` |
| AC-08 | passed | `artifacts/logs/qa-ci-workflow.log`, `artifacts/logs/prisma7-dotenv-probe.log` (AC уточнён по QA D-2) |
| AC-09 | passed | `artifacts/logs/final-verify.log`, `artifacts/logs/qa-check-task.log` |
| AC-10 | passed | `artifacts/logs/qa-docs.log` |
| AC-11 | passed | `delivery-report.md`, `artifacts/logs/qa-diff.log` |
| AC-12 | not_run | push/PR не согласованы PO |

## Final decision
blocked — AC-12 ждёт согласия PO на push и PR (остальные AC приняты)
