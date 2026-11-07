# AGENTS.md — Star Wars: Rebellion AI

Инструкции для всех агентов разработки (Codex, Claude Code и люди). Рабочий язык документов — русский;
имена файлов, идентификаторы и код — английский.

## Что это за проект

Веб-компаньон для настольной игры Star Wars: Rebellion: соло-партия против AI за любую сторону.
Полный blueprint: [`docs/architecture/blueprint.md`](docs/architecture/blueprint.md).

Текущий этап: **A — Agent Foundation** (+ подготовка к B). Код приложения ещё не создан.
**Не реализовывать** игровое поле, правила и AI-противника, пока задача явно этого не требует.

## Три зоны ответственности (не смешивать)

1. **Агенты разработки** — организуют и проверяют создание приложения (этот файл, `docs/process/`).
2. **Game-core** — единственный источник истины по правилам и состоянию (чистый TypeScript, без React/NestJS/OpenAI).
3. **LLM в рантайме** — только выбирает среди legal actions, которые вычислил game-core.

## Стек (зафиксирован, менять только через Product Owner)

React + TS + Vite, MUI, Zustand, TanStack Query, React Konva · NestJS · Zod (`packages/contracts`) ·
SQLite + Prisma · OpenAI Responses API (только сервер) · Vitest, Playwright · pnpm workspaces ·
ESLint, Prettier, TS strict. Не добавлять Redis, микросервисы, event bus, real-time multiplayer, 3D.

## Как работать над задачей

1. Любая задача живёт в `docs/tasks/<ID>/` (шаблоны в `docs/tasks/_template/`).
2. Процесс и quality gates: [`docs/process/workflow.md`](docs/process/workflow.md). Коротко:
   `INTAKE → ANALYSIS → TECH_PLANNING + EARLY_QA_DESIGN → IMPLEMENTATION → INTEGRATION + CODE_REVIEW → BUSINESS_VALIDATION → QA_EXECUTION → FINAL_ACCEPTANCE → DELIVERY`.
3. Роли и их полномочия: [`docs/agents/roles/`](docs/agents/roles/). Оркестратор выбирает **минимальный** состав под задачу.
4. Сквозной сценарий ведения задачи — skill `feature-delivery`; отчёт — skill `task-report`; браузерный QA — skill `browser-qa`.
5. Перед сдачей: `node scripts/check-task.mjs docs/tasks/<ID>` должен завершиться с кодом 0.

## Жёсткие правила

- **Честность проверок.** Не запускалось → `not_run`. Никогда не писать `passed` без ссылки на реальный лог/тест/файл.
  В отчётах различать «выполнено» и «запланировано».
- **Независимость.** Reviewer не ревьюит свой код. QA не чинит продуктовый код молча — заводит дефект и возвращает лиду.
- **Владение файлами.** Worker меняет только файлы из своего назначения. Публичные контракты (`packages/contracts`,
  API, схемы событий) — только с согласия лида и Analyst.
- **Скрытая информация** фильтруется на сервере через `PlayerView`, а не в UI. Секреты одной стороны не попадают в prompts/логи другой.
- **Секреты.** OpenAI-ключ только на сервере (`.env`, не коммитится). Не коммитить `.env`, большие traces, лицензионные ассеты.
- **Без лишней инфраструктуры.** Не строить собственную платформу оркестрации — использовать штатные сабагенты Codex/Claude.
- **Неопределённость.** Некритичное — фиксировать как assumption и двигаться дальше; блокирующее продуктовое — эскалировать человеку.
- **Git.** Коммитить и пушить только по просьбе человека.

## Команды

```bash
node --test scripts/          # тесты инструментов процесса
node scripts/check-task.mjs docs/tasks/SWR-000   # проверка артефактов задачи
```

Команды lint/typecheck/build/e2e появятся на Этапах B–C. Пока их нет — в отчётах они `not_run`.

## Рантаймы

Как это подключено к Codex и Claude Code, что реально проверено и известные ограничения:
[`docs/process/runtime-adapters.md`](docs/process/runtime-adapters.md).
