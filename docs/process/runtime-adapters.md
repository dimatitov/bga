# Runtime adapters: Codex и Claude Code

Источник истины для ролей и процесса — переносимая документация:
`AGENTS.md`, `docs/process/*.md`, `docs/agents/roles/*.md`, `.agents/skills/*/SKILL.md`.
Файлы конкретных рантаймов — тонкие адаптеры, которые ссылаются на неё и не дублируют содержание.

## Проверка окружения (2026-11-08, машина разработчика)

| Факт | Результат | Как проверено |
|---|---|---|
| Claude Code | установлен, `2.1.317` | `claude --version` |
| Codex CLI | **не установлен** | `codex` → command not found |
| Node.js | `v20.19.5` (с SWR-007, 2026-11-19 — `v22.23.5`, см. ниже) | `node -v` |
| pnpm | **сломан**: corepack пытается скачать pnpm 12.18.0 и падает (исправлено: см. ниже) | `pnpm -v` |
| git | есть | `git init` |

Следствия:
- Конфиги `.codex/` написаны по документации Codex, но **локально не запускались**. Статус: `not_run`.
- Конфиги `.claude/`: frontmatter провалидирован скриптом; **подхват сабагентов свежей сессией Claude Code не проверен**
  (сессия, создавшая их, стартовала раньше; `claude agents --json` показывает другие сущности). Проверка: открыть новую
  сессию в репозитории и выполнить `/agents` — должны быть 8 ролей.
- Workflow фактически проверен на SWR-000 (см. `docs/tasks/SWR-000/delivery-report.md`) через general-purpose сабагентов,
  которым передавалась роль из `docs/agents/roles/*.md`.
- Скрипты Этапа A используют только встроенные модули Node (`node --test`), без зависимостей, чтобы не зависеть от pnpm.

### Текущее окружение (SWR-007, 2026-11-19)

| Факт | Результат | Как проверено |
|---|---|---|
| Node.js | `v22.23.5` (Node 22 LTS «Jod», `.nvmrc`; `engines` `>=22.22.2`) | `node -v` |
| corepack | `0.36.0` (встроен в Node 22.23.5) | `corepack --version` |
| pnpm | `12.21.0` из `packageManager` через corepack | `pnpm -v` (`docs/tasks/SWR-007/artifacts/logs/pnpm-corepack.log`) |
| CI | GitHub Actions `.github/workflows/ci.yml`: `pnpm verify` + `check-task` на push/PR | см. `docs/tasks/SWR-007/delivery-report.md` |

Заметки: `node --test` в Node 22 не разворачивает каталог — тесты процесса запускаются как `node --test "scripts/*.test.mjs"`
(Node сам раскрывает glob). pnpm 11+ вместо `onlyBuiltDependencies` читает `allowBuilds` (`pnpm-workspace.yaml`) и по
умолчанию не ставит версии моложе суток (`minimumReleaseAge`).

## Codex

По документации OpenAI ([Subagents](https://developers.openai.com/codex/subagents), [Agent Skills](https://developers.openai.com/codex/skills)):

| Что | Где | Формат |
|---|---|---|
| Проектные инструкции | `AGENTS.md` (корень) | Markdown, читается нативно |
| Кастомные агенты | `.codex/agents/<role>.toml` | один агент на файл: `name`, `description`, `developer_instructions` (+ опционально `model`, `model_reasoning_effort`, `sandbox_mode`) |
| Глобальные настройки сабагентов | `.codex/config.toml`, секция `[agents]` | `max_threads`, `max_depth` |
| Skills | `.agents/skills/<name>/SKILL.md` | frontmatter `name`, `description` |

Сомнения, которые надо снять при первой установке Codex:
- точный список обязательных полей TOML агента (источники расходятся);
- подхватывает ли Codex `.agents/skills` из корня репозитория при запуске из подпапки.

## Claude Code

| Что | Где | Формат |
|---|---|---|
| Проектные инструкции | `CLAUDE.md` → импортирует `@AGENTS.md` | Markdown |
| Сабагенты | `.claude/agents/<role>.md` | frontmatter `name`, `description`, `tools`, опционально `model` |
| Skills | `.claude/skills` → **симлинк** на `../.agents/skills` | тот же `SKILL.md` |

Ограничение Claude Code: **сабагент не может запускать других сабагентов**. Поэтому иерархия
«Lead → Worker» в Claude Code исполняется так: главная сессия играет роль Analyst/Orchestrator и сама
вызывает и лидов, и воркеров; лид получает задачи «спланировать / проверить интеграцию своей зоны»,
а не «делегировать». Для паритета в Codex установлено `max_depth = 1`.

Новые сабагенты из `.claude/agents/` подхватываются при старте сессии. Если сессия была запущена
до их создания — перезапустить Claude Code или вызвать general-purpose агента с инструкцией
«прочитай `docs/agents/roles/<role>.md` и действуй в этой роли» (так был проведён SWR-000).

## Известные проблемы

- `node --check a b` проверяет только `a` — проверять файлы по одному (находка QA в SWR-000).

- Codex не установлен — адаптер `.codex/` не проверен.
