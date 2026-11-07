---
name: feature-delivery
description: "Run a Star Wars: Rebellion AI task end-to-end through the agent workflow (intake, spec, planning, early QA design, implementation, review, business validation, QA, acceptance, delivery). Use when the orchestrator picks up a new task or SWR-* ID."
---

# Feature delivery (оркестратор)

Ты — Analyst/Orchestrator (`docs/agents/roles/analyst.md`). Процесс — `docs/process/workflow.md`.

1. **INTAKE.** `cp -R docs/tasks/_template docs/tasks/<ID>`. Заполни `request.md` (минимум title, description, acceptance_criteria).
   Неполный запрос → один блокирующий вопрос человеку, остальное — assumptions.
2. **ANALYSIS.** `specification.md`: цель, сценарии, `AC-n` как проверяемые утверждения, assumptions, risks, out-of-scope.
3. **Состав ролей.** Выбери минимальный: FE/BE lead только если задача затрагивает их зону; QA lead и reviewer — всегда,
   но не тот же исполнитель, что писал код.
4. **TECH_PLANNING ‖ EARLY_QA_DESIGN.** Параллельно: лид → `implementation-plan.md` (OWNED FILES на каждого worker, контракты);
   QA lead → `test-cases.md` по спецификации, **до** кода.
5. **IMPLEMENTATION.** Брифы воркерам строго по формату `workflow.md` §3. Независимые подзадачи с непересекающимися
   OWNED FILES — параллельно.
6. **INTEGRATION ‖ CODE_REVIEW.** Лид собирает; reviewer (не автор) → `review.md`.
7. **BUSINESS_VALIDATION.** Сам пройди бизнес-сценарий, запиши в `acceptance.md` (раздел Pre-QA).
8. **QA_EXECUTION.** QA → `qa-results.md` + логи в `artifacts/logs/`. Дефект → возврат (лимит 3 цикла).
9. **FINAL_ACCEPTANCE.** Вердикт по каждому AC с доказательством.
10. **DELIVERY.** Skill `task-report` → `delivery-report.md`; `node scripts/check-task.mjs docs/tasks/<ID>` → exit 0.

После каждого этапа обновляй `status.md`. Никогда не переводи этап в `passed` по неподтверждённому утверждению исполнителя.
