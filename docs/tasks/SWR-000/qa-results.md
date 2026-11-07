# QA results — SWR-000

QA worker: qa-worker (independent subagent, S4; wrote none of the code, tests or fixtures). Date: 2026-11-08. Node v20.19.5, macOS.

Scope: execution of `test-cases.md` (135 designed TC ids, 225 automated `node:test` cases in `scripts/check-task.test.mjs`) plus manual CLI runs per AC-1..AC-5 on scratch copies of `scripts/fixtures/valid-task` outside the repo (scratch root `/private/tmp/claude-501/-Users-dimatitov-WebstormProjects-Game-automa/qa/`, which holds its own `AGENTS.md`). The script used for the manual runs is saved as `artifacts/logs/qa-cli-script.log`.

## Executed
| TC | Status | Command | Evidence |
|---|---|---|---|
| All automated TC (TC-10…TC-168, 135 ids; 225 tests, 24 suites) | passed | node --test scripts/ | `artifacts/logs/qa-unit.log` (225 pass, 0 fail, 0 skipped, exit=0; every TC id from `test-cases.md` has an `ok` line) |
| Syntax check of checker and tests | passed | node --check on each file separately | `artifacts/logs/qa-syntax.log` (both exit=0) |
| CLI integration TC (TC-13, 33, 52, 54–59, 74, 94, 124, 125, 136–138, 145) | passed | node --test scripts/ (spawned CLI) | `artifacts/logs/qa-unit.log` (TC-124/125 ran, not skipped) |
| Manual AC-1: missing files (a1, a1empty, ok + a1b) | passed | node check-task.mjs a1 / a1empty / ok a1b | `artifacts/logs/qa-cli.log` (exit=1, one [R1] per missing file, 9 for empty dir; OK ok + FAIL a1b) |
| Manual AC-2: evidence (a2tbd, a2ghost, a2free, a2ver, a2abs, control a2nr) | passed | node check-task.mjs <case> | `artifacts/logs/qa-cli.log` ([R5]/[R6]/[R7]/[R11], exit=1; control not_run without evidence → OK, exit=0) |
| Manual AC-3: status.md (a3dup, a3miss, a3swap, a3bad, a3order, a3art) | passed | node check-task.mjs <case> | `artifacts/logs/qa-cli.log` ([R2]/[R3]/[R4], exit=1) |
| Manual AC-4: accepted gate (a4ac, a4rev, a4fa, a4verd, a4dec, a4drop, control a4ctl) | passed | node check-task.mjs <case> | `artifacts/logs/qa-cli.log` ([R8]/[R9]/[R10], exit=1; honest rejected/blocked control → OK, exit=0) |
| Manual AC-5: valid copy, path with space, _template, no args, missing dir | passed | node check-task.mjs ok / "my dir" / docs/tasks/_template; no args; does-not-exist | `artifacts/logs/qa-cli.log` (OK exit=0 ×3; usage exit=2; not found exit=2) |
| Self-check of this task folder | passed | node scripts/check-task.mjs docs/tasks/SWR-000 | `artifacts/logs/qa-check-task.log` (OK, exit=0; status.md still has QA_EXECUTION in_progress) |

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `artifacts/logs/qa-unit.log` (TC-10…14, 57, 58, 68, 145), `artifacts/logs/qa-cli.log` (a1, a1empty, a1b) |
| AC-2 | passed | `artifacts/logs/qa-unit.log` (TC-20…40, 116–122, 132–134, 160, 164–168 et al.), `artifacts/logs/qa-cli.log` (a2tbd, a2ghost, a2free, a2ver, a2abs, a2nr) |
| AC-3 | passed | `artifacts/logs/qa-unit.log` (TC-60…74, 111, 123, 130, 131, 142), `artifacts/logs/qa-cli.log` (a3dup, a3miss, a3swap, a3bad, a3order, a3art) |
| AC-4 | passed | `artifacts/logs/qa-unit.log` (TC-80…94, 100–102, 112–115, 135, 146–159), `artifacts/logs/qa-cli.log` (a4ac, a4rev, a4fa, a4verd, a4dec, a4drop, a4ctl) |
| AC-5 | passed | `artifacts/logs/qa-unit.log` (TC-50…59, 124, 125, 136–138, 143, 145), `artifacts/logs/qa-cli.log` (ok, my dir, _template, no args, does-not-exist) |

## Verification
- lint: not_run — no ESLint tooling exists in Stage A (appears in Stage B)
- typecheck: not_run — no TypeScript in Stage A; plain .mjs only (syntax checked instead, see `artifacts/logs/qa-syntax.log`)
- build: not_run — nothing to build in Stage A (no Vite/pnpm workspace yet)
- syntax: passed — `artifacts/logs/qa-syntax.log`
- unit: passed — `artifacts/logs/qa-unit.log`
- integration: passed — `artifacts/logs/qa-cli.log` (manual CLI) and CLI-spawning tests in `artifacts/logs/qa-unit.log`
- e2e: not_run — no UI and no Playwright in Stage A

## Defects
| # | Severity | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|

No defects found in `scripts/check-task.mjs` against AC-1..AC-5 and D1–D16.

## Notes
- Process note (not a product defect): the brief's command `node --check scripts/check-task.mjs scripts/check-task.test.mjs` checks only the first file; Node passes the second as argv. Proven in `artifacts/logs/qa-syntax.log` with a scratch file containing a syntax error (exit=0 when passed second, exit=1 when passed alone). Each file was therefore checked separately. Anyone relying on the two-file form should switch to one call per file.
- Cosmetic (not filed): summary line reads `FAIL a2tbd (1 problems)`; this matches the spec format `(<n> problems)` literally.
- Cascading messages are expected and fail-safe: removing a required file also yields [R4]/[R10] lines (case a1); a missing stage yields [R3] for every later passed stage (a3miss). A single dropped AC is reported 6 times (a4drop), already known as review finding R3-3 (follow-up).
- Not re-tested here: review follow-ups R2-5, R2-6, R3-1, R3-2 (moved out of SWR-000 by the Analyst).
