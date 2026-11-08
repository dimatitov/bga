# Review — SWR-004

Reviewer: independent reviewer (Claude subagent, 2026-11-08) · Author(s) of reviewed code: backend-workers R0 / B1 / W-API / W-C,
frontend-workers FE-B-assets / FE-1a / FE-1b / FE-A / FE-B / FE-C, frontend-lead (INTEGRATION), qa-lead (e2e). Reviewer wrote none of it.

Scope: SWR-004 changes in the uncommitted tree on top of `d4895ac` (SWR-003, accepted earlier, is also uncommitted — SWR-004 files
were located through the `implementation-plan.md` log). Read: `AGENTS.md`, `docs/agents/roles/reviewer.md`, `docs/process/workflow.md` §5,
`request.md` (PO checklist), `specification.md` (contract, Clarifications Q-1..Q-25, Decisions incl. accepted deviations), `plan-backend.md`,
`plan-frontend.md`, `docs/architecture/{application,adding-a-game}.md`. Out of scope as instructed: in-progress diffs of
`apps/web/src/app/theme/**` (focus ring, frontend-lead) and `e2e/support/a11y.ts` (qa-lead).

## Checks run by the reviewer
- `pnpm lint` → exit 0 (eslint `--max-warnings=0` + prettier clean).
- `pnpm typecheck` → exit 0 (all workspaces incl. api build tsconfig and e2e).
- `pnpm test` → **exit 1**: scripts 357/357, platform 59, forbidden-stars 5, rebellion 20 files / 200; web 33 files, 250 passed /
  **3 failed — all in `apps/web/src/app/theme/createAppTheme.test.tsx`** (new untracked test of the in-progress focus-ring work,
  `expected 'none' to be 'solid'`), i.e. the excluded theme diff, not SWR-004 code under review. See O-1.
- `pnpm --filter @bga/api test` (run separately because the root run stops at web) → exit 0: 18 files / 178 passed + 1 skipped (opt-in dev-DB test).
- `pnpm check:bundle` → exit 0: 5 content rules OK (incl. `board-debug-hook` → `__boardDebug` absent in prod); module check:
  only `rebellion/{assets,board,definition,schema}` + `forbidden-stars/{assets,definition}` in the bundle.
- Migration on a **copy** of `apps/api/prisma/dev.pre-swr004.db` (scratchpad): `prisma migrate deploy` applied
  `20261108200000_session_status_idempotency`; 4 rows → `status=prototype`, key NULL; `SessionEvent` 12 rows unchanged;
  `pragma integrity_check` ok. (`dev.db` itself already contains the migration and 2 v2 rows — applied earlier by someone else, not by me.)
- API probe on that copy, `node dist/main.js` PORT=3400 (after `pnpm --filter @bga/api build`): list/GET of v1 rows → `rebels/empire`,
  `ruleset base`, `gameMode digital`, `status prototype`; command on a v1 row → 200, snapshot rewritten as `schemaVersion 2`, old
  `SessionEvent.actor='rebellion'` kept (Q-16); create 201 → replay 200 + `Idempotent-Replay: true` → other body 409 (no details);
  `rise-of-the-empire`+`physical_companion` → 422 `rulesetUnavailable`, `details.unsupported=[ruleset,gameMode]`; `aiFaction` /
  `opponentFaction` / human+`aiDifficulty` / AI+`aiDifficulty:null` / `playerFaction:'rebellion'` → 400 under `setup.*`; malformed
  key → 400 `headers.idempotency-key`; 12 parallel POSTs with one key → 1×201 + 11×200, one row, no ERROR in the log, key never logged;
  hot-seat: END_TURN → bare handoff view + `events: []`, ACCEPT by the inactive side → 422 `notYourTurn`. Server stopped (port 3400 free).
- `shasum -a 256` of `dev.db`, `dev.pre-swr003.db`, `dev.pre-swr004.db` before = after (unchanged).
- `pnpm e2e` / `pnpm dev` — not_run (forbidden for this review). e2e results (75/75) are from the INTEGRATION log, not verified by me.

## Focus areas — conclusions
1. **Hidden information — OK.** `toPlayerView` picks the viewer from state (never from the request; `?viewer=` ignored); during
   `handoffPending` only the strict `HandoffViewSchema` (`kind,id,version,activeSide,round,phase,sessionStatus`) is sent by POST command,
   GET, idempotent replay; `toPlayerEvents` → `[]` while pending; list `details` = public settings + round/phase. Error `details` echo only
   the actor. Client: `setQueryData` replaces the cached view with the handoff view, `HandoffScreen` runs `resetBoardState` in a layout effect
   (selection/drag/viewport), the board (and with it `useBoardDebug`) is unmounted; `Table` is keyed by viewer. Tests are real leak checks:
   `hotseat.int.test.ts` scans the raw body for every scenario id/typeKey and board keys; `HandoffScreen.test.tsx` asserts cache, stores and
   `window.__boardDebug` are empty; e2e `hot-seat.spec.ts` checks `__boardDebug === undefined`; `check:bundle` covers prod.
2. **Server validation & trust — OK.** Strict `RebellionSetupInputSchema` (extra `aiFaction`/`opponentFaction` → 400), `opponentFaction`
   derived by `opponentOf`, Q-6 refinements, 422 `SETUP_UNSUPPORTED` after schema errors (Q-8). `applyCommand` order: schema → version →
   `notYourSide` → `notYourTurn` → `handoffNotAvailable` (AI game) → `handoffPending` → rules. `GameStateSchema` refines AI games
   (`activeSide = playerFaction`, no handoff). Hot-seat trust limitation is documented (spec, `handoff.trustNote`).
3. **Idempotency — OK.** Unique index; key/hash stored only with a created session (400/422 never burn it — TC-I-22/23); P2002 resolved
   as replay/409 only if a row with the key really exists (`sessions.repository.ts:123-134`); replay = current envelope via the same
   `envelope()` as GET (TC-I-15 compares bodies); race tests TC-I-20/21 + deterministic Q-4 test. Accepted deviation (malformed key → 400
   before 404/422) is implemented as decided.
4. **Data upgrade v1→v2 — OK** (one minor, #1). Frozen `legacy-v1.ts` schemas, pure idempotent upcaster, unknown `schemaVersion` → throw
   (500), migrated human games get `activeSide = playerFaction`, `handoffPending = false` (Q-17). Migration SQL is additive
   (3× `ADD COLUMN` + unique index, no table rebuild, no JSON rewrite) — safe for the dev DB; verified on a copy.
5. **Platform game-agnostic — OK.** grep of `packages/platform/src`, `apps/api/src/sessions`, `apps/web/src/{platform,shared,app}` for
   faction/ruleset/gameMode/rebels/empire → only comments with examples; `architecture.int.test.ts` (TC-A-01/02) pins it. New
   `ServerGameModule` members (`parseSetup` invalid/unsupported, `parseStoredSetup`, `initialStatus`, `publicSettings`) are generic and
   exercised by the api fake game (generic TC-I-14/23).
6. **Client ↔ server validation duplication — OK.** The form validates with the package's `RebellionSetupInputSchema` +
   `unsupportedSetupFields`; caption uses the package `opponentOf`; defaults are the package's frozen `REBELLION_SETUP_DEFAULTS`.
   Only a small helper is duplicated (#3).
7. **Tests — OK.** AC-01..AC-15 are backed by non-tautological tests (int tests assert DB rows and raw bodies, not only mocks); PO
   TC-001..TC-006 present in `e2e/game-setup.spec.ts` (TC-004 backend-restart part → int test per Q-14; app#2 tests in
   `hotseat.int.test.ts` / `idempotency.int.test.ts`); migration TC-M-01..07 on real pre-migration DBs.

## Findings
| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| 1 | minor | `apps/api/src/sessions/session-commands.service.ts:43-50`; `packages/games/rebellion/src/server/rebellion-server-module.ts:46-48`; `apps/api/src/sessions/sessions.service.ts:173` | The settings live in two places: `Session.setup` (→ `settings` of the envelope, via `parseStoredSetup`) and `state.settings` (→ `view.settings`, rules). For migrated rows only `state` is ever rewritten as v2; `Session.setup` stays v1 forever, so the setup upcaster can never be retired and nothing checks that both copies agree (Q-16 says "при следующей записи сохраняется v2"). Behaviour is correct today (both derived from the same v1 setup). | Either derive `publicSettings` from `state.settings` (single source), or assert equality in `envelope()`/`parseState` and document that `Session.setup` is immutable creation input. Record it in `adding-a-game.md`. |
| 2 | minor | `apps/web/src/platform/sessions/useCreateSession.ts:58-60` | A 2xx whose body fails the client schema (`INVALID_RESPONSE`) counts as "server responded" → the key is dropped → «Начать игру» again sends a new key and creates a **second** session although the first one was created. Consistent with the letter of refined Q-5, but defeats AC-10 in that edge case. | Keep the key when the response was 2xx-but-unparseable (the replay returns the existing session), or navigate using `sessionId` if it is present. Add a unit case. |
| 3 | nit | `apps/web/src/platform/sessions/useCreateSession.ts:12`; `apps/api/src/sessions/idempotency.ts:8` | Two implementations of "canonical JSON, keys sorted" for the same comparison (client key reuse vs server body hash); they can drift (e.g. `undefined` in arrays). | Move a pure `canonicalJson` into `@bga/platform` (`idempotency.ts`) and use it on both sides; hashing stays in the API. |
| 4 | nit | `packages/games/rebellion/src/server/upcast.ts:94`, `src/server/index.ts:6` | `upcastEvent` / `upcastSettings` are exported but have no production reader (nothing reads `SessionEvent` rows yet), so the Q-16 "journal is normalised on read" is a promise, not wired code. | Fine as preparation; mention in `adding-a-game.md` that any future `SessionEvent` reader must go through `upcastEvent`. |

Observation (not a code finding): **O-1** — root `pnpm test` is red only because of `apps/web/src/app/theme/createAppTheme.test.tsx` (3 tests,
frontend-lead's in-progress focus-ring change, excluded from this review). The gate must be green again before QA_EXECUTION.

## Verdict
approved
