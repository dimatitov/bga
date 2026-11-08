# Implementation plan — SWR-002

Детальные планы лидов: [`plan-backend.md`](plan-backend.md) (backend-lead), [`plan-frontend.md`](plan-frontend.md) (frontend-lead).
UX: [`docs/product/ux-decisions.md`](../../product/ux-decisions.md). Архитектура: [`docs/architecture/application.md`](../../architecture/application.md).
Этот файл — сводка оркестратора: состав, последовательность, владение файлами и решения по стыкам.

## Roles involved
| Role | Executor | Why |
|---|---|---|
| analyst / orchestrator | main session | spec, clarifications, dispatch, business validation, acceptance |
| backend-lead | subagent | plan-backend.md, application.md, BE integration |
| frontend-lead | subagent | plan-frontend.md, ux-decisions.md, FE integration |
| qa-lead | subagent | test-cases.md, Playwright e2e specs, QA execution |
| backend-worker ×3 | subagents | W0 foundation, W-CORE, W-API |
| frontend-worker ×2 | subagents | FE-SHELL, FE-TABLE |
| reviewer | subagent (не автор) | review.md |

## Contracts (frozen)
`specification.md` → Architecture contract + Clarifications + Approved amendments; детали схем — `plan-backend.md` §3–§6.

## Interface decisions between plans (Analyst)
- **W0 в `apps/web`** — только каркас по таблице `plan-frontend.md` §9 «W0»: `package.json`, `index.html`, `vite.config.ts`
  (порт `WEB_PORT ?? 5173`, proxy `/api` → `API_PROXY_TARGET ?? http://localhost:3000`, `resolve.conditions` `@swr/source`),
  `vitest.config.ts`, `tsconfig*.json`, `src/main.tsx`, `src/vite-env.d.ts`, `src/app/App.tsx` (стаб), `src/test/setup.ts`,
  `src/features/game-session/{index.ts,GameTablePage.tsx}` (стабы). **W0 не создаёт** `router.tsx` и `shared/i18n` — это FE-SHELL
  (вариант frontend-lead; plan-backend §8.2 в этой части заменён). Локали — `apps/web/src/locales/{ru,en}/<ns>.json`.
- Env-переменные e2e: `WEB_PORT=5174`, `API_PROXY_TARGET=http://localhost:3100`, `VITE_E2E=1`, `PORT=3100` для api.
- После W0 `apps/web/package.json` и конфиги меняет только frontend-lead; корневые конфиги — только backend-lead.

## Subtasks and file ownership
| Subtask | Role | OWNED FILES | Depends on |
|---|---|---|---|
| W0 foundation | backend-worker | `plan-backend.md` §8.2 (root, `packages/contracts/**`, `packages/game-data/**`, game-core каркас, apps/api каркас) + apps/web каркас (см. выше) | contracts |
| W-CORE | backend-worker | `packages/game-core/src/**`, `packages/game-core/test/**` | W0 |
| W-API | backend-worker | `apps/api/src/**`, `apps/api/test/**` | W0 (W-CORE для зелёных int-тестов) |
| FE-SHELL | frontend-worker | `plan-frontend.md` §9 FE-SHELL | W0 |
| FE-TABLE | frontend-worker | `plan-frontend.md` §9 FE-TABLE | W0 (+ FE-SHELL S1 для T2) |
| QA e2e specs | qa-lead | `e2e/**` кроме `e2e/smoke.spec.ts`, `docs/tasks/SWR-002/test-cases.md` | W0 |
| BE integration | backend-lead | слияние, root-конфиги | W-CORE, W-API |
| FE integration | frontend-lead | `apps/web/package.json`, web-конфиги, стыки | FE-SHELL, FE-TABLE |

## Dependency graph
```text
W0 ─┬─ W-CORE ─┐
    ├─ W-API ──┴─ BE integration ─┐
    ├─ FE-SHELL ─┐                ├─ INTEGRATION ─ CODE_REVIEW ─ BUSINESS_VALIDATION ─ QA_EXECUTION
    ├─ FE-TABLE ─┴─ FE integration┘
    └─ QA e2e specs ───────────────┘
```

## Implementation log (filled by workers)
| Subtask | Changed files | Tests run (command → result) | Limitations |
|---|---|---|---|
| W0 foundation | root tooling, `packages/contracts/**`, `packages/game-data/**`, game-core skeleton, apps/api skeleton, apps/web skeleton, `e2e/smoke.spec.ts`, README «Запуск» | `artifacts/logs/w0-install.log`, `w0-dev.log`, `w0-lint.log`, `w0-typecheck.log`, `w0-test.log`, `w0-build.log`, `w0-e2e.log`, `w0-source-condition.log`, `w0-lint-boundary.log` — all exit 0 (boundary check: 6 expected errors then 0); analyst re-ran typecheck/lint → 0 | `vitest.config.mts` in CJS packages; JSX-literal rule via `no-restricted-syntax`; jest-dom 6.9.1 (7.x needs Node 22); dev DB at `apps/api/prisma/dev.db` |
| W-CORE | `packages/game-core/src/{index,create-game,apply-command,legal-actions,player-view,mock-rules,internal/state}.ts`, `packages/game-core/test/*` | `artifacts/logs/wcore-test.log` (48 tests, TC-GC-01..32), `wcore-typecheck.log`, `wcore-lint.log`, `wcore-build.log` — exit 0 | no reveal command; `createGame` throws on invalid setup/scenario (programming error) |
| W-API | `apps/api/src/{common,games,commands}/**`, `app.module.ts`, `app.factory.ts` (clock/idGenerator, global filter), `apps/api/test/**` | `artifacts/logs/wapi-test.log` (57 tests, TC-API-01..26), `wapi-typecheck.log`, `wapi-lint.log`, `wapi-build.log`, `wapi-smoke.log` — exit 0 | malformed JSON on unknown game → 400 (body parser before routing); over-long id → 404; `expectedVersion: 0` → 400 |
| BE integration | `packages/{contracts,game-data,game-core}/package.json`, `apps/api/package.json` (+ `lint: eslint . --max-warnings=0`), `playwright.config.ts` (`workers: 1`, QA request); reviewed W-CORE/W-API vs plan-backend — no source changes needed; `app.factory.ts`/`app.module.ts` (clock, idGenerator, global ApiExceptionFilter) approved | `artifacts/logs/be-integration.log`: `pnpm --filter` ×4 BE pkgs `build`/`typecheck`/`lint`/`test` → exit 0 (contracts 34, game-data 13, game-core 48, api 57 tests); prettier on touched files → 0; `tsc -p e2e/tsconfig.json` → 0. Root `dev`/`e2e`/`verify` — not_run (FE in progress) | 500 ERROR lines in api test log are expected (TC-API-25 corrupt snapshot); `AppModule` is `global: true` to share CLOCK/ID_GENERATOR/SCENARIO |
| FE-SHELL | `apps/web/src/app/**`, `apps/web/src/shared/**`, `apps/web/src/features/game-setup/**`, `apps/web/src/test/setup.ts`, locales common/setup/settings/errors | `artifacts/logs/feshell-test.log` (60 tests), `feshell-typecheck.log` exit 0; `feshell-lint.log` exit 1 only from FE-TABLE WIP files, own files 0 | create flow tested with mocked fetch only; custom `ChoiceGroup` radios; extra testids (`menu-error`, `settings-back`, `not-found`, `menu-mock-badge`, `setup-mock-badge`) |
| FE-TABLE | `apps/web/src/features/{game-board,game-session,ai-opponent}/**`, locales session/board/gameData | `artifacts/logs/fetable-test.log` (87 web tests incl. FE-SHELL), `fetable-typecheck.log`, `fetable-lint.log`, `fetable-build.log` — exit 0; `grep __boardDebug dist` → no match; manual gesture check vs scratch mock API | BoardContext instead of cross-feature import; window resize doesn't re-fit; main chunk 761 kB warning; keyboard move path via `system-item-<id>-move` |
| FE integration (frontend-lead) | `apps/web/vite.config.ts` (rolldown chunk groups), `vitest.config.ts`, `tsconfig.node.json`, `README.md`, `NewGamePage.tsx` (difficulty disabled for human), prettier-only formatting in game-board/game-session | `artifacts/logs/integration-{lint,typecheck,test,build}.log` exit 0; `integration-e2e.log` exit 1 (35 passed, 2 failed: TC-E2E-21, TC-E2E-25 — spec mismatches, sent to QA); `integration-dev-smoke.log` OK | `ux-decisions.md` still mentions aria-selected on buttons (listbox implemented) |
| FE review fixes (frontend-lead) | `apps/web/src/features/game-session/hooks/useSendCommand.ts` (nit #6: after a 4xx the save indicator restores its previous value — `idle`/`saved`/`error` — instead of `saved`), new `apps/web/src/features/game-session/hooks/useSendCommand.test.tsx` (4 tests), `docs/product/ux-decisions.md` (nit #7: D-A-4/D-F-2/D-A-2 → listbox/option + `aria-selected`, keyboard path `system-item-<id>-move`; new §11 Implementation notes) | `artifacts/logs/review-fix-fe.log`: `pnpm --filter @swr/web run test` → exit 0 (14 files, 91 tests), `run typecheck` → exit 0, `run lint` → exit 0. e2e not run (coordinator runs `pnpm dev`) | eslint.config.mjs not touched; root `pnpm lint` (incl. new BE rules) not re-run |
| Review fix BE (#1–#3) | `apps/api/src/games/games.service.ts` (list skips corrupt snapshots, logs gameId+code), `apps/api/test/games.int.test.ts` (+ corrupt-row list test), `apps/api/test/routes.int.test.ts` (TC-API-25: list now 200), `eslint.config.mjs` (JSX UI-text attrs/expression literals; web dynamic `import()` boundary), `scripts/check-web-bundle.mjs` + `scripts/check-web-bundle.test.mjs`, root `package.json` (`check:bundle`, in `verify` after `build`) | `artifacts/logs/review-fix-be.log`: `pnpm lint` → 0, `pnpm typecheck` → 0, `pnpm test` → 0 (process 231, contracts 34, game-data 13, game-core 48, web 91, api 58), `pnpm build` → 0, `pnpm check:bundle` → 0 (OK, 5 rules). ESLint rules probed via `ESLint.lintText` on virtual web files (all bad cases flagged, testid/className/t() allowed); current `apps/web` → 0 offenders. `pnpm e2e` not_run (QA) | bundle check reads `packages/game-data/dist` (needs `build:packages`); builds web only if `apps/web/dist` missing (`--rebuild` to force) |
