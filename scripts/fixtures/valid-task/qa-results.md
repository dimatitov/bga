# QA results — FIX-001

## Executed
| TC | Status | Command | Evidence |
|---|---|---|---|
| TC-1 | passed | node --test | artifacts/logs/unit.log |

## Acceptance criteria
| AC | Status | Evidence |
|---|---|---|
| AC-1 | passed | `artifacts/logs/unit.log` |
| AC-2 | passed | `artifacts/logs/cli.log` |

## Verification
- unit: passed — `artifacts/logs/unit.log`
- cli: passed — `artifacts/logs/cli.log`
- e2e: not_run — no UI in this fixture

## Defects
| # | Severity | Steps | Expected | Actual | Status |
|---|---|---|---|---|---|
