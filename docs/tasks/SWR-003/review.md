# Review — SWR-003

Reviewer: independent reviewer (Claude subagent, 2026-11-08) · Author(s) of reviewed code: backend-worker W0-R / W-API,
frontend-worker FE-PLATFORM / FE-MOVE, backend-lead / frontend-lead (INTEGRATION), qa-lead (e2e). Reviewer wrote none of it.

Scope: uncommitted working tree on top of `d4895ac` (`git diff d4895ac --stat`: 228 files). Read: `AGENTS.md`,
`docs/agents/roles/reviewer.md`, `docs/process/workflow.md` §5, `specification.md` (AC-1..AC-9, contract, Q-1..Q-25,
Decisions), `implementation-plan.md` log, `plan-backend.md`, `plan-frontend.md`, `docs/architecture/{application,adding-a-game}.md`.

## Checks run by the reviewer (main repo, read-only)
- `pnpm lint` → exit 0 (eslint + prettier clean).
- `pnpm typecheck` → exit 0.
- `pnpm test` → exit 0: scripts 357/357, platform 32, forbidden-stars 5, rebellion 115, web 24 files / 166, api 9 files / 94.
- `pnpm check:bundle` → exit 0: content rules OK (5 rules); module check: only `forbidden-stars/{assets,definition}`,
  `rebellion/{assets,board,definition,schema}` in the bundle.
- `pnpm e2e` / `pnpm dev` — not_run (forbidden for this review: analyst BV uses :3000/:5173). Integration log reports e2e 50 passed — not verified by me.

## AC-5 extensibility experiment (scratch copy, removed afterwards)
`rsync` of the working tree (without `node_modules`, `.git`, `dist`, `*.db`) into the scratchpad, `git init` baseline,
`pnpm install --offline`. Added a real, playable dummy game `counter` exactly per `adding-a-game.md`:
`packages/games/counter` (definition / schema / rules / server / assets + a test), `apps/web/src/games/counter`
(`entry.ts`, lazy `SetupScreen`/`TableScreen`, `locales/{ru,en}/{meta,ui}.json`).
Files that had to change outside the two new folders (`git diff --stat`): `apps/api/src/game-registry/{definitions,registry}.ts`,
`apps/web/src/games/registry.ts`, `packages/tsconfig.json`, `apps/{api,web}/package.json`, `pnpm-lock.yaml` — i.e. exactly
"package + two registries + Q-9 wiring". **Zero** changes in `apps/api/src/{sessions,common}`, Prisma, `apps/web/src/{app,platform,shared}`,
routes, i18n setup, ESLint config, `check-web-bundle`.
- In the copy: `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build` 0, `pnpm check:bundle` 0 (counter/{assets,definition,schema} only);
  workspace tests: all green except 5 tests that **pin the current registry contents** (see #1, #2).
- Negative: `import '@bga/game-counter/rules'` in the counter TableScreen → ESLint error **and** `check:bundle` exit 1
  (`FORBIDDEN module …/counter/src/rules/index.ts`). Guards work for a new game without config changes.
- Runtime (built API from the copy, `PORT=3400`, temp DB = migrated copy of `dev.pre-swr003.db`, stopped afterwards, port free):
  create counter 201 `{sessionId, gameId:'counter', view}`; command 200; stale `expectedVersion` 409 `currentVersion:2`;
  `?gameId=counter` → only counter; unfiltered list mixes counter + 3 migrated Rebellion sessions with correct `details`;
  state secret string absent from all responses; Forbidden Stars 422 `GAME_UNAVAILABLE`; unknown game 404 `errors.gameNotFound`;
  missing `setup` 400 (before game lookup, Q-3); `?gameId=BAD!` 400, repeated `gameId` 400, unknown well-formed `[]` 200 (Q-5/R-2);
  command on unknown session with bad body → 404 first; `/api/games` → 404.

Conclusion: the AC-5 claim holds for production code. The only friction is in tests/docs (#1, #2).

## Data migration (`apps/api/prisma/migrations/20261108120000_sessions/migration.sql`)
On a COPY of `apps/api/prisma/dev.pre-swr003.db` (3 games / 10 events; the real `dev.db` was never targeted — it is
already migrated and held open by the analyst's API on :3000): `prisma migrate deploy` OK; `Session` rows
(id, version, updatedAt) and `SessionEvent` rows (all columns) identical to the source `Game`/`GameEvent` dumps;
`gameId` = `star-wars-rebellion` for all; `integrity_check` ok; `foreign_key_check` empty; `sqlite_sequence` carried
(`SessionEvent|10`); `prisma migrate diff --from-url <copy> --to-schema-datamodel schema.prisma --exit-code` → "No difference" (0);
second deploy → no pending. FK `ON DELETE CASCADE` and `(gameId, updatedAt)` / `(updatedAt)` / unique `(sessionId, seq)`
indexes match `schema.prisma`. `PRAGMA foreign_keys` toggled correctly. Covered by `apps/api/test/migration.int.test.ts` (TC-MIG-01..06).

## Boundaries / hidden information
- Production platform code (`apps/api/src/{sessions,common,persistence,health}`, `apps/web/src/{app,platform,shared}`,
  `packages/platform/src`) contains no game id, faction, phase or Rebellion term (grep); ESLint B-9/B-12 enforce it,
  `scripts/eslint-boundaries.test.mjs` probes it.
- `rebellionServerModule.summarize` → `{humanFaction, opponent, difficulty?, round, phase}` through a strict schema — no base / hidden pieces.
- Logs: `sessionId`, `gameId`, `code`, status, error class name only; corrupt snapshot → 500 without internals.
- Web gets only `PlayerView` (`toPlayerView` parsed by `PlayerViewSchema`); `check:bundle` sourcemap check generic for all games.

## Tests vs d4895ac
Counts: rebellion 95→115, web 91→166, api 58→94, scripts 231→357. Every removed test title was checked against its
successor (e.g. TC-API-02..10/18/23/25/26 → TC-SES-01..18 / TC-API-05/18/25/26 on `/api/sessions`; TC-WEB-01..03 → TC-GP-02..05;
TC-E2E-02..05/23 → TC-GP-13..15, TC-NEW-05..07); none weakened. Removed without successor only: the SWR-002 `shared/api/games.test.ts`
client tests (client deleted, replaced by `platform/sessions/api.test.ts`). AC-5(a) (`game-registry.int.test.ts` fake module,
create/get/list/command incl. 409/422/400/404 order and secret never leaving), AC-5(б) (`platform/extensibility.test.tsx`, real
routes + injected fake entry), AC-6 (FS 422, package-shape test), AC-7 (migration + filter tests) are real, not tautological.

## Findings
| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| 1 | minor | `apps/api/test/game-registry.int.test.ts:147`, `:66` | The "automatic" per-module conformance suite needs a hand-added valid setup in `setupFor` (otherwise `parseSetup(undefined)` fails for any new game), and TC-FS-03 pins `SERVER_GAME_MODULES`/`GAME_DEFINITIONS` to `[R]`/`[R, FS]`. Reproduced with the dummy game. `adding-a-game.md` §10 calls the server suite "автоматически". | Let a module (or a test-only map documented in §10) provide a sample setup, or document the `setupFor` entry and the TC-FS-03 list update as required steps in `adding-a-game.md` §10/§11. |
| 2 | minor | `apps/web/src/platform/extensibility.test.tsx:32`, `apps/web/src/platform/catalog/CatalogPage.test.tsx:15`, `apps/web/src/games/registry.test.ts:13` | Platform tests pin the real registry's id list; adding a real game breaks 3 web tests, including the AC-5(б) proof itself and a platform (`platform/**`) test — mildly contradicts "platform untouched". `adding-a-game.md` §7 mentions only `registry.test.ts`. | Derive expected ids from `gameRegistry` in `extensibility.test.tsx` / `CatalogPage.test.tsx` (e.g. `[...gameRegistry.map(id), …fake]` with the documented ordering rule), keep the explicit pin only in `games/registry.test.ts`, and list it in the doc. |
| 3 | minor | `apps/api/src/sessions/sessions.service.ts:75-98` | `list()` takes 20 rows then drops rows of unregistered games / corrupt snapshots, so the response can have < 20 items although more valid sessions exist (Q-7 edge). Acceptable for the prototype; not specified. | Either document "up to 20, after skipping" in the contract or over-fetch / filter `gameId IN registry` in the query. |
| 4 | nit | `eslint.config.mjs:297` | For a web game folder importing `@bga/game-<own>/rules`, the error message says "must not import the registry or other games (only @/games/types)" — misleading (the real reason is rules/server/ai are server-only). B-17 overrides B-8's message. | Compose the message ("…; game packages: only definition/schema/board/assets"). |
| 5 | nit | `apps/web/src/games/rebellion/table/TableScreen.tsx:104`, `board/model/boardContext.ts:19`, `board/model/selectionStore.ts:12` | `BoardContext.gameId` / `selectionStore.gameId` / `activateGame` hold the **session** id while `gameId` now means the catalogue id (Q-10). Known naming debt (also `GameState.id`, `CreateContext.gameId`), logged by workers. | Rename to `sessionId` in a follow-up (SWR-004 touches the state anyway). |
| 6 | nit | `scripts/check-web-bundle.mjs:19` | The value-rule part checks the existing `apps/web/dist` (built only if missing), so a standalone `pnpm check:bundle` can validate a stale build; `pnpm verify` builds first, so CI is fine. Pre-existing behaviour. | Optionally rebuild when `dist` is older than sources, or note it in the script help. |
| 7 | nit | `docs/architecture/adding-a-game.md` §10 vs §7 | §7 (web) was updated during review to list required test edits, §10 still says the server suite is automatic (see #1); §11 checklist doesn't mention updating pinned tests. | Align §10/§11 with §7. |

No blocking or major findings. API contract/order (Q-3, Q-5/R-2, Q-7, AM-4), error format and `GAME_UNAVAILABLE` verified
by code reading, integration tests and the :3400 probe. SWR-002 behaviour kept: 409 → invalidate + refetch, refetch-failure
warning with Retry (`session-refetch-warning`, restored in P4 with 2 tests), 404 wins over cache, settings key
`swr.settings.v1` → `bga.settings.v1` one-time move (tested), ru/en parity tests for platform and `rebellion.*` namespaces.

## Verdict
approved

Approved with minor follow-ups (#1–#3 recommended before the next game is added; #4–#7 optional). e2e not run by the reviewer.
