---
name: task-report
description: "Write or update delivery-report.md / qa-results.md / acceptance.md for a task with honest passed/failed/not_run statuses backed by real evidence, then run the task artifact checker. Use at QA_EXECUTION, FINAL_ACCEPTANCE and DELIVERY."
---

# Task report

1. Собери доказательства: для каждой проверки — дословная команда, exit code, путь к логу.
   Лог сохраняй так: `<cmd> > docs/tasks/<ID>/artifacts/logs/<name>.log 2>&1; echo "exit=$?" >> …/<name>.log`.
2. Заполни по шаблонам `docs/tasks/_template/` (форматы — `docs/process/workflow.md` §5):
   - `## Acceptance criteria`: `| AC-n | passed/failed/not_run/blocked | evidence |`
   - `## Verification`: `- unit: passed — \`artifacts/logs/unit.log\``
   - `## Final decision`: `accepted | rejected | blocked` + причина.
3. Правила честности:
   - не запускал → `not_run` (и почему); команда недоступна → `blocked`;
   - «запланировано» и «выполнено» — разные разделы;
   - `accepted` только если все AC `passed`, review `approved`, FINAL_ACCEPTANCE `passed`.
4. Запусти `node scripts/check-task.mjs docs/tasks/<ID>` и приложи вывод. Ненулевой exit — исправь артефакты, не скрипт.
