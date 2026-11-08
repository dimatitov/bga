# Review — SWR-002

Reviewer: reviewer (independent subagent, Claude Code; did not write any SWR-002 code)  ·  Author(s) of reviewed code: backend-worker ×3 (W0, W-CORE, W-API), frontend-worker ×2 (FE-SHELL, FE-TABLE), backend-lead / frontend-lead (integration)

Scope: `packages/{contracts,game-core,game-data}`, `apps/api`, `apps/web`, root tooling (`package.json`, `eslint.config.mjs`,
`playwright.config.ts`, tsconfigs, `.gitignore`), `README.md`; `e2e/**` only checked for whether specs could hide app bugs.

## Checks run by reviewer (2026-11-08, Node 20.19.5)
| Command | Result |
|---|---|
| `pnpm lint` | exit 0 (ESLint 0 problems, Prettier clean) |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | exit 0 — process 225, contracts 34, game-data 13, game-core 48, web 87, api 57 tests passed |
| `pnpm --filter @swr/web build` | exit 0 (largest chunk vendor-konva 330 kB) |
| `grep -rlF` in `apps/web/dist` | `__boardDebug`, `mockScenario`, `pc-21`, `pc-0*`: no match. `rebelBaseSystemId`: only as a field name of `ScenarioSchema` (zod), no value. `sys-hollin`: only in `mapLayout` and the system-name translations (all 10 systems present equally). `covert-cell`: only in the `pieces` translation catalog (no piece mapping). The base location and hidden-piece type do not reach the bundle. |
| ESLint probes via `eslint --stdin --stdin-filename` | in `apps/web/src`: `@swr/game-core`, `@swr/game-data`, `@swr/game-data/src/scenario`, relative `../packages/...` paths → error; `@swr/game-data/layout` → allowed. `packages/game-core/src` importing `@swr/game-data` → error. `packages/game-data/src/layout.ts` importing `./scenario` → error. JSX text `<div>Hello</div>` → error. **Not caught:** `import('@swr/game-core')` (dynamic), `aria-label="Hello"`, `{'Hello'}` (findings 2, 3) |
| `pnpm --filter @swr/api build`, then `node dist/main.js` with `PORT=3300` and a scratch SQLite DB (`prisma migrate deploy`); stopped afterwards | see probes below |

API probes (curl, `:3300`):
- Empire game: `POST /api/games` and `GET /api/games/:id` (also `?viewer=rebellion`) → `rebelBase {"systemId":null,"revealed":false}`; `covert-cell` occurs 0 times in either body. Rebellion game → `systemId:"sys-hollin"` (correct: it is the Rebels' own secret).
- Error order: `/games/nope/commands` `{}` → 404; existing game `{}` → 400; bad version + bogus piece → 409 (409 before 422); move of the hidden Rebel piece `pc-21` as empire → 422 `errors.notOwner` with details `{pieceId}` only; `actor:"rebellion"` in an empire game → 422 `errors.notYourSide`; duplicate `pieceIds` → 400; human opponent with `difficulty` → 400; 100-char id → 404; `PUT`/`DELETE` → 404 in the unified body; `text/plain` body → 400; CORS preflight from a foreign Origin → 404, no `Access-Control-*` headers (CORS not enabled, same-origin through the Vite proxy).
- Concurrency: 12 parallel identical `MOVE_PIECES` with `expectedVersion:1` → exactly 1×200 and 11×409; afterwards `version 2`, log seqs `1:GAME_CREATED,2:PIECES_MOVED`; `GameEvent` table has the same 2 rows (snapshot and mirror match).
- Corrupt `Game.state` (sqlite update) → `GET /games/:id`, `GET /games`, `POST commands` → 500 `{"ok":false,"error":{"code":"INTERNAL","messageKey":"errors.internal"}}`; the log line has only `gameId code status error=ZodError` (no state, stack or payload).

Verified by reading code (no defects found):
- AC-12: web imports only `@swr/contracts` and types/values from `@swr/game-data/layout` (the only scenario import is in the `*.i18n.test.ts` test). Move targets come only from `legalActions` (`model/legal.ts`: lookup/intersection). `adjacentSystemIds` is used only for `LinkLines` and the informational neighbour list. No coordinates in `GameStateSchema` (strict). Only `POST /games` and `POST /games/:id/commands` write; writes happen only in `GamesRepository.insertGame/commitCommand`. The same `CommandEnvelope` goes into `applyCommand`, so a future AI can use it.
- Hidden info: `toPlayerView` and `toPlayerEvents` are the single redaction point. All responses go through strict `PlayerViewSchema` / `CommandOkSchema` / `ListGamesResponseSchema`. The list endpoint returns only `setup/round/phase`. `ILLEGAL_COMMAND.details` contain only request ids. The filter never forwards exception text.
- Concurrency: fast-path 409, then `updateMany WHERE version = expected` inside an interactive transaction, plus `@@unique([gameId, seq])` as a second guard. The parser cross-checks `state.version/id` against the row.
- Frontend: server state lives in TanStack Query only (cache changed only by server data, no optimistic writes); UI state lives in zustand. 409/404 → invalidate + reconcile the selection. Drag rollback in `finally` puts the node back from the latest view. There is one `aria-live` region; the listbox/option uses roving tabindex. `prefers-reduced-motion` is the default and turns off MUI transitions/ripple and Konva tweens. The debug hook is a dynamic import behind `DEV || VITE_E2E` (absent from dist). Secrets: `apps/api/.env`, `*.db`, `.tmp/`, `dist-e2e/` are ignored (`git check-ignore` confirmed).
- e2e: no `test.skip/fixme`. The one `force: true` click (00-empty-db) is a deliberate disabled-button check followed by a URL assertion. `__boardDebug` is used only for reads. Limitation: e2e runs against `vite dev`, not the production bundle (see 3).

## Findings
| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| 1 | minor | apps/api/src/games/games.service.ts:47-60 | `GET /api/games` parses every full snapshot; one corrupt or unparseable row turns the whole list into 500 (probed). That breaks «Продолжить» / «Недавние партии» for all other saves. It also deserialises full `GameState` ×20 only to read `round/phase`. | Skip and log bad rows in `list()` (or store `round`/`phase` as columns and select only summary fields). Not blocking for the prototype. |
| 2 | minor | eslint.config.mjs:160-170 | The i18n gate («no literals in JSX») only matches `JSXText`. String literals in attributes (`aria-label="Hello"`, `title`, `label`, `placeholder`, `alt`) and `{'Hello'}` expressions pass (probed: 0 errors). Current source has none (grep), so this is a gate gap, not a defect. | Add `no-restricted-syntax` selectors for `JSXAttribute[name.name=/^(aria-label\|title\|label\|placeholder\|alt)$/] > Literal` and `JSXExpressionContainer > Literal[value=/\p{L}/u]`. |
| 3 | minor | eslint.config.mjs:130-158; test-cases.md:203 (TC-ARCH-08) | `no-restricted-imports` does not cover dynamic `import('@swr/game-core')` or `import('@swr/game-data')` (probed: 0 errors). No automated check proves the built bundle is free of the scenario: TC-ARCH-08 greps only `__boardDebug`, and e2e runs on `vite dev`. Today the bundle is clean (my grep), but AC-12 «проверяемы» depends on a manual step. | Add a `no-restricted-syntax` `ImportExpression[source.value=/^@swr\/(game-core\|game-data$)/]` rule for web. Extend TC-ARCH-08 (or a small `scripts/` check in `pnpm build`/`verify`) to grep `apps/web/dist` for `"rebelBaseSystemId":"` / `rebelBaseSystemId:"` values and the `mockScenario` piece ids. |
| 4 | nit | apps/api/src/common/api-exception.filter.ts:13-19, 37 | Malformed JSON returns `issues:[{code:"http_400",message:"Invalid request"}]`, not `invalid_json` (probed). Nest wraps the body-parser error in `BadRequestException` without `cause`, so the `isBodyParseError` branches never fire. The status and `code: VALIDATION` are correct. | Check `exception.getResponse()`/message for the parse failure or drop the dead branch. Low priority. |
| 5 | nit | apps/api/src/common/api-exception.filter.ts:67 | 500 log lines carry only the error class (`error=ZodError`): no stack and no issue paths. That is safe for hidden info but hard to diagnose. | Also log Zod issue paths/codes (no values) or the stack at `debug` level, still without state/payload. |
| 6 | nit | apps/web/src/features/game-session/hooks/useSendCommand.ts:57 | After a 400/409/422 the save indicator switches to `saved`, even when it was `idle` and nothing was saved in this session. The wording is slightly misleading but harmless. | Restore the previous status instead of forcing `saved`. |
| 7 | nit | docs/product/ux-decisions.md:248, 262 | D-F-2/D-A-4 still describe buttons with `aria-selected`/`aria-current`. The implementation (correctly, per the approved amendment) uses `listbox`/`option`. This is already noted in the implementation log. | Update the doc text to the listbox model. |
| 8 | nit | packages/game-data/src/scenario.ts:175; apps/web/src/locales/*/gameData.json | The hidden typeKey string `token.rebellion.covert-cell` ships in the web bundle as a translation-catalog entry. That is not a leak: the type catalogue is public, and the piece→type mapping is absent. But the scenario comment says the key is unique «so leak tests can grep for it», and a naive bundle grep would false-positive. | When adding the bundle check (finding 3), grep for the piece mapping/base value, not the bare catalog key; adjust the comment. |

Prototype-scope limitations already recorded in the spec (not counted as defects): `actor` in `CommandEnvelope` is client-supplied without auth (A-2/A-3; it only has to equal `setup.humanFaction`); hot-seat is not supported; `ADVANCE_PHASE` and movement rules are mocks; e2e uses a dev server; the main chunk was split into vendor chunks (no warning in my build).

No blocking or major findings.

## Round 2 (re-review of fixes, 2026-11-08)

Checks run by reviewer:
| Command | Result |
|---|---|
| `pnpm lint` | exit 0 |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | exit 0 — process 231, contracts 34, game-data 13, game-core 48, web 91, api 58 |
| `pnpm check:bundle` | exit 0 — `OK check-web-bundle: 8 files in apps/web/dist, 5 rules` |
| `node scripts/check-web-bundle.mjs --dist <scratch copy of dist>` | clean copy → exit 0 |
| Mutation test: string appended to the `index-*.js` chunk in a scratch copy of dist | every case below → `FAIL`, exit 1:<br>• `{"rebelBaseSystemId":"sys-hollin"}`<br>• minified `{rebelBaseSystemId:` + backtick-quoted `sys-hollin`<br>• view-shaped `{rebelBase:{systemId:"sys-hollin"}}`<br>• `["pc-21"]`<br>• `{id:"pc-21",typeKey:"token.rebellion.covert-cell"}`<br>• `window.__boardDebug`<br><br>Expected limitation: a bare `"sys-hollin"` with no rebelBase key → exit 0, because every system id legitimately appears in the layout and i18n. |
| ESLint probes (`eslint --stdin --stdin-filename apps/web/src/features/game-board/…`) | Flagged: `import('@swr/game-core')`, `import('@swr/game-data')`, `import(m)`, template `import(…)`, `import('…/packages/game-core/src')`, `export * from '@swr/game-core'`, `aria-label="Hello"`, `title="Hello"`, `placeholder="Hi"`, `{'Hello'}`, template-literal child, `aria-label={'Hello'}`, `{cond ? 'Yes' : 'No'}` (2), `<div>Hello</div>`. Not flagged (correct): `import('@swr/game-data/layout')`, `data-testid`/`className`/`role` literals, `t(...)`. The `.tsx` block repeats the dynamic-import selectors, so the override does not drop them. |

| # | Status | Evidence |
|---|---|---|
| 1 | closed | `apps/api/src/games/games.service.ts` `list()`: skips a row whose snapshot fails to parse and logs only `gameId code=CORRUPT_SNAPSHOT`. `GET /games/:id` for that game still returns 500. New test `apps/api/test/games.int.test.ts:147`, TC-API-25 updated; api tests 58/58. |
| 2 | closed | `eslint.config.mjs` `JSX_UI_LITERALS`: probes above; current code still lints clean. |
| 3 | closed | `WEB_DYNAMIC_IMPORTS` selectors (probes above); `scripts/check-web-bundle.mjs` (+ `.test.mjs`) wired into `pnpm check:bundle` and into `verify` after `build`; the mutation test confirms it catches the leak shapes listed above. |
| 4 | open (nit, accepted) | Not changed; no functional impact. |
| 5 | open (nit, accepted) | Not changed. |
| 6 | closed | `useSendCommand.ts`: after a 4xx the status returns to its value before the send (`statusRef`); 4 new tests; web 91/91. |
| 7 | closed | `docs/product/ux-decisions.md` D-F-2 / D-A-4 / summary table now describe listbox/option + `aria-selected` on options. |
| 8 | closed (by design) | The bundle script deliberately does not search bare typeKeys (they belong to the i18n catalogue). It checks the piece→typeKey mapping and piece-id literals instead. |

New observations (no regressions found):
| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| 9 | nit | scripts/check-web-bundle.mjs (main, `--rebuild`) | A standalone `pnpm check:bundle` scans an existing `apps/web/dist` without rebuilding it, so it can pass on a stale bundle. Inside `verify` it runs right after `build`, so the gate itself is correct. | Mention this in README, or make `check:bundle` use `--rebuild` when run outside `verify`. |
| 10 | nit | apps/api/src/games/games.service.ts `list()` | Corrupt rows are filtered after `take: 20`, so the list may hold fewer than 20 games even when more exist. Acceptable for the prototype. | None needed now. |

## Verdict
approved

The architecture boundaries hold, hidden information is redacted on the server, and the 404→400→409→422 order and optimistic concurrency are correct. Round 2: findings 1, 2, 3, 6, 7 and 8 are verified closed; nits 4 and 5 stay open (accepted); new nits 9 and 10 are not blocking. All gates I ran passed: lint, typecheck, test, check:bundle, plus the bundle mutation check. e2e was not run by me (QA's run).
