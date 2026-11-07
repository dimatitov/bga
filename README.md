# Star Wars: Rebellion AI

Веб-компаньон для соло-партий в Star Wars: Rebellion против AI. Сейчас реализован **Этап A — Agent Foundation**:
система агентной разработки. Кода приложения пока нет.

- Инструкции агентам: [`AGENTS.md`](AGENTS.md) (Claude Code читает его через [`CLAUDE.md`](CLAUDE.md))
- Blueprint: [`docs/architecture/blueprint.md`](docs/architecture/blueprint.md)
- Процесс: [`docs/process/workflow.md`](docs/process/workflow.md), рантаймы: [`docs/process/runtime-adapters.md`](docs/process/runtime-adapters.md)
- Роли: [`docs/agents/roles/`](docs/agents/roles/) · адаптеры: `.codex/agents/`, `.claude/agents/` · skills: `.agents/skills/`
- Демонстрационная задача: [`docs/tasks/SWR-000/`](docs/tasks/SWR-000/)

```bash
node --test scripts/
node scripts/check-task.mjs docs/tasks/SWR-000
```
