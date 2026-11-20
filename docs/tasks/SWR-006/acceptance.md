# Acceptance — SWR-006

## Pre-QA business validation
Analyst, 2026-11-20, after INTEGRATION (`artifacts/logs/integration-verify-final.log`: `pnpm verify` EXIT=0, e2e 136/136) and review
round 2 approved. In-app browser against `pnpm dev`. Evidence: `artifacts/logs/business-validation.log`.
- BV-A (bot, PO default scenario Rebels vs AI Empire Normal): «AI Commander · бот · Обычная»; after the human pass the AI Empire made
  13 meaningful actions (4 leader activations moving ships with ground troops, finishes, pass), round 1 → 2, turn back to the human, 13 log
  entries marked «AI»; reload → state persisted.
- BV-B (AC-12, live OpenAI, PO «да» with 0.05 USD cap): «AI Commander · OpenAI · Обычная», «ИИ думает…» during the request; 14 AI actions,
  0 fallbacks, `stopReason=humanTurn`, 22.9 s; AiUsage: 10 calls `gpt-6-luna`, all ok, 9474 in / 466 out / 0 reasoning tokens,
  ≈ 0.001184 USD.
- Defect BV-1 (minor): stale hint «в прототипе AI не ходит» on the new-game form → fixed by frontend-worker (`artifacts/logs/bv-1-fix.log`).
- Note: the first «Начать игру» in a fresh `pnpm dev` hit a dev-only start-up race (proxy ECONNREFUSED while `nest --watch` restarted) — not a product defect.
Result: business scenario passes in both modes; no blocking defects.

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-01 | passed | `qa-results.md`, `artifacts/logs/w1-platform.log`, `artifacts/logs/gate-verify-on-head.log` |
| AC-02 | passed | `artifacts/logs/w7-runner.log`, `artifacts/logs/w9-scenarios.log`, `artifacts/logs/gate-verify-on-head.log` |
| AC-03 | passed | `artifacts/logs/w2-bot-core.log`, `artifacts/logs/w8-calibration.log`, `artifacts/logs/gate-verify-on-head.log` |
| AC-04 | passed | `artifacts/logs/w5-server.log`, `artifacts/logs/w9-scenarios.log`, `artifacts/logs/gate-verify-on-head.log` |
| AC-05 | passed | `artifacts/logs/w8-calibration.log`, `artifacts/logs/w9-scenarios.log` |
| AC-06 | passed | `artifacts/logs/w8-calibration.log` (frozen thresholds met) |
| AC-07 | passed | `artifacts/logs/w9-scenarios.log`, `artifacts/logs/qa-f3-tests.log`, `artifacts/logs/be-integration.log` |
| AC-08 | passed | `artifacts/logs/w8-calibration.log`, `artifacts/logs/w9-scenarios.log` |
| AC-09 | passed | `artifacts/logs/w9-scenarios.log`, `artifacts/logs/qa-f3-tests.log`, `artifacts/logs/w3-env.log` |
| AC-10 | passed | `artifacts/logs/qa-e2e.log`, `artifacts/logs/fe-2-3-rebellion.log`, `artifacts/logs/bv-1-fix.log`, `artifacts/screenshots/swr006-rebels-vs-ai-after-turn-en-1440.png` |
| AC-11 | passed | `artifacts/logs/gate-verify-on-head.log` (old e2e/hot-seat/dev-ai/check:bundle), `artifacts/logs/qa-f3-tests.log` |
| AC-12 | passed | `artifacts/logs/business-validation.log` (live OpenAI, Analyst, ≈0.001184 USD) |
| AC-13 | passed | `artifacts/logs/gate-verify-on-head.log` (`pnpm verify` EXIT=0), `artifacts/logs/gate-verify-final.log` (EXIT=0, clean SWR-006 worktree) |

## Final acceptance (Analyst, 2026-11-20)
- Каждый AC подтверждён доказательством выше; детали QA — `qa-results.md` (AC-таблица, карта обязательных тестов PO п. 8 → TC → evidence: 14/14 passed).
- Review: round 2 `approved` (`review.md`); дефекты D-1 (UI), BV-1 (текст), TC-E-04 (спек), D-2 (чужие файлы SWR-005C) — закрыты; флейки
  старых тестов под внешней нагрузкой — minor, test infra, follow-up.
- Гейт: `pnpm verify` EXIT=0 на `236fe54` + SWR-006 (`artifacts/logs/gate-verify-on-head.log`) и в чистом worktree только с SWR-006
  (`artifacts/logs/gate-verify-final.log`).
- Живой OpenAI (AC-12): выполнен Analyst после «да» PO, ≈ 0.001184 USD из лимита 0.05.

## Final decision
accepted — AC-01..AC-13 passed with evidence; review approved; QA passed; nothing committed or pushed (awaiting the user).
