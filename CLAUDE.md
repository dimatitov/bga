@AGENTS.md

## Дополнительно для Claude Code

- Сабагенты ролей: `.claude/agents/*.md` (тонкие обёртки над `docs/agents/roles/*.md`).
- Skills: `.claude/skills` — симлинк на `.agents/skills` (общие с Codex).
- Сабагенты Claude Code не могут вызывать других сабагентов: главная сессия = Analyst/Orchestrator,
  она сама вызывает лидов и воркеров. Подробности — `docs/process/runtime-adapters.md`.
