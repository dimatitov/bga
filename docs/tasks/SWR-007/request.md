# Request — SWR-007

Источник: решение Product Owner (2026-11-19) — техническая задача выполняется **параллельно** с SWR-006 (AI Commander),
в отдельном git worktree (ветка `swr-007-node22-ci`), бриф передан сессией-оркестратором.

```yaml
id: SWR-007
title: "Node 22 LTS, обновление зависимостей и CI"
description: |
  Перевести проект с Node 20.19.5 на актуальный Node 22 LTS; обновить мажорные зависимости, придержанные из-за Node 20
  (openai 7.x, NestJS 12, Prisma 7, @testing-library/jest-dom 7+, прочие из SWR-002 plan-backend §10) — там, где это безопасно,
  остальное — отложить с причиной; добавить CI на GitHub Actions (push/PR: frozen lockfile, браузеры Playwright, pnpm verify,
  check-task по всем задачам, кэш pnpm store, без секретов); обновить документацию.
acceptance_criteria:
  - "Node 22 LTS: .nvmrc, engines, @types/node; pnpm работает (версия, которую запускает corepack, — проверено и задокументировано)"
  - "openai 7.x: поведение AIProvider и его тесты идентичны; в тестах нет реальных вызовов API"
  - "NestJS 12, Prisma 7 (SQLite driver adapter; миграции и данные совместимы — проверено на КОПИИ фикстуры dev-БД), jest-dom 7 и прочие — обновлены с обоснованием или отложены с причиной"
  - "GitHub Actions: push/PR, frozen lockfile, установка браузеров Playwright, pnpm verify, check-task по всем папкам задач, кэш pnpm store, без секретов (OpenAI замокан, тесты не читают реальный ключ)"
  - "Документация (README, application.md, runtime notes) обновлена; устаревшие заметки о Node 20 удалены"
  - "pnpm verify зелёный под Node 22 в worktree; check-task OK; CI зелёный, если ветка запушена (только с явного согласия PO)"
business_value: |
  Снимает техдолг «пин на Node 20» (блокировал обновления SDK OpenAI, Nest, Prisma и др.) и даёт автоматическую проверку
  каждого push/PR — защиту от регрессий по мере роста AI-слоя (SWR-006+).
constraints:
  - "Параллельно с SWR-006 на main: дифф — только tooling, манифесты, lockfile, конфиги, CI и минимальные вынужденные правки кода; каждый тронутый исходник перечислить"
  - "Не трогать основной checkout, его node_modules и apps/api/prisma/dev.db"
  - "Коммит/push/PR — только с явного согласия человека"
  - "Стек не меняется (AGENTS.md); новые пакеты — только вынужденные апгрейдом (например, драйвер-адаптер SQLite для Prisma 7)"
references:
  - docs/tasks/SWR-002/plan-backend.md §10
  - docs/tasks/SWR-005B/delivery-report.md (Known issues: Node 22 / openai 7.x)
priority: medium
dependencies: []
out_of_scope:
  - "Новые продуктовые функции, изменения API/контрактов"
  - "Переход на TypeScript 6/7 (не связан с Node; typescript-eslint требует < 6.1)"
  - "Деплой, релизы, секреты в CI"
```
