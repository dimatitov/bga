---
name: browser-qa
description: "Browser/E2E verification of UI changes with Playwright: run scenarios from test-cases.md, capture screenshots and traces as evidence, report defects. Use for any task that changes apps/web."
---

# Browser QA

> Playwright появится на Этапах B–C. Пока его нет, браузерные кейсы — `not_run` с причиной «Playwright не настроен»,
> либо ручная проверка во встроенном браузере агента со скриншотом как доказательством (пометить как `manual`).

1. Подними приложение командой из `AGENTS.md` (раздел «Команды»).
2. Для каждого UI-кейса из `test-cases.md`:
   - `pnpm exec playwright test <spec> --trace on` (когда настроено);
   - скриншоты → `docs/tasks/<ID>/artifacts/screenshots/<TC-id>.png`;
   - traces → `docs/tasks/<ID>/artifacts/playwright-traces/` (**не коммитить** крупные .zip по умолчанию — они в `.gitignore`).
3. Проверяй и негатив: недопустимое действие → видимая причина, откат предпросмотра, состояние не изменилось после reload.
4. Скрытая информация: убедись по ответам сети (не по DOM/CSS), что сервер не отдал секреты противоположной стороны.
5. Результаты — в `qa-results.md` по формату `workflow.md` §5. Дефект: шаги, severity, ожидаемое/фактическое, скриншот.
6. Продуктовый код не чинить.
