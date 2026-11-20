# Review — SWR-005C

Reviewer: reviewer (independent subagent, 2026-11-20) · Author(s) of reviewed code: backend-worker W1 (`@bga/platform/rules-kb`),
backend-worker W2 (Rebellion KB data, tests, docs), backend-lead (plan/integration). Reviewer did not write any of the reviewed code.

Scope: `packages/platform/src/rules-kb/**`, `packages/platform/test/rules-kb/**`, `exports["./rules-kb"]` in
`packages/platform/package.json`, `packages/games/rebellion/knowledge/**`, `packages/games/rebellion/test/knowledge/**`,
`docs/game-rules/knowledge-base.md`, `docs/architecture/rules-knowledge.md`, generated `docs/game-rules/rebellion/*.md`.
SWR-006 files were ignored.

## Checks run by the reviewer (read-only)

| Command | Result |
|---|---|
| `pnpm --filter @bga/platform exec vitest run test/rules-kb` | 7 files, 135 tests passed |
| `pnpm --filter @bga/game-rebellion exec vitest run test/knowledge` | 8 files, 94 tests passed |
| `pnpm --filter @bga/platform typecheck` | exit 0 |
| `pnpm exec eslint packages/platform/src/rules-kb packages/platform/test/rules-kb packages/games/rebellion/test/knowledge --max-warnings=0` | exit 0 |
| `pnpm exec prettier --check` (the 4 task dirs) | clean |
| `git diff --stat c1ace26 -- packages/games/rebellion/src/rules packages/games/rebellion/src/scenario` | empty |
| `git diff c1ace26 -- packages/platform/package.json` | only the additive `./rules-kb` exports block |
| `git ls-files '*.pdf' '*.PDF'`; `find` for PDFs in KB and docs | empty |
| grep `rebellion`/`node:`/`@bga` and type escapes (`any`, `as X`, `!`, `@ts-`) in `packages/platform/src/rules-kb` | none (only the stop word `'any'` in `text.ts`) |
| script (in the scratchpad) against the built `dist/rules-kb`: Command Phase context for both sides + extra searches | rebels 5932 chars / 22 ids, empire 5934 / 22, `truncated: false` |
| issue code → negative test mapping (grep over `validate*.test.ts`, `parse.test.ts`) | all 38 codes have a test; `validate.test.ts` also asserts that the code list and the tests match (TC-V-30) |
| every coverage `implementation.symbol` is *defined* (not only referenced) in its cited file | 26/26 defined |
| all 5 `quote`s compared with the source texts | verbatim, ≤ 15 words |

Not run by the reviewer: `pnpm verify` (a run was going on in the background, see brief), sha256 of the PDFs (only the
extracted text was available), `node scripts/check-task.mjs`.

## Summary

- **Contract (C-1..C-4, plan §2/§2.1):** the API, issue codes, `KnowledgeBaseIo`, render options, `formatCitation` and
  search/context semantics match the contract. Platform code imports only `zod` and relative modules and is game-agnostic.
  Strict Zod objects, no type escapes.
- **Determinism / limits:** search ties are broken by `id`; IDF is computed over the whole KB; renders contain no dates.
  `buildRulesContext` adds whole lines until the first line that does not fit, so `text.length ≤ maxChars` always holds;
  `maxChars` that is not a positive integer throws `RangeError`. Tests cover the limits (1, 50, 200, …, `full-1`).
- **Validator:** every code is reached by a single-mutation negative test that also asserts the exact `{code, path}` list
  (so a mutation cannot pass because of a different issue). io checks are covered with in-memory io.
- **Copyright:** no PDFs. Texts are own paraphrases (≤ 600 chars, tested). 5 short verbatim quotes.
- **Rules accuracy:** 45 verified entries + 11 interpretations + 18 discrepancies sampled (see below). No factual error found. Two wording nits (F-3, F-4).
- **Engine vs coverage:** checked against `src/rules/core/*` and `src/scenario/core/*`. The first game setup, the unit
  catalog and the base eligibility match the claims. No real engine/rules mismatch is missing from `discrepancies.json`.
  Two `implemented` claims are overstated (F-2). Coverage does not include slice entries other than `rule` (F-1, AC-5).

## Findings
| # | Severity | File:line | Finding | Recommendation |
|---|---|---|---|---|
| F-1 | major | `packages/games/rebellion/test/knowledge/coverage.test.ts:43`; `packages/games/rebellion/knowledge/coverage.json` | AC-5 asks that `coverage.json` hold **all entries of the slice categories** (plan §3 says the same: "все записи категорий среза в coverage"). The data and the test cover only `kind: 'rule'`. As a result 33 slice entries have no item. Among them are interpretations/clarifications the engine **does** implement: `command.pass-not-mid-activation` (`apply.ts:98`), `command.move.no-enemy-pinning` (`movement.ts:60`, own leader only), `command.activate.own-leader-system` and `command.activate.zero-units` (`activation.ts`, `legal.ts`), `base.death-star-does-not-reveal` (`unitTypeRevealsRebelBase`). There are also errata it does **not** implement: `base.voluntary-reveal-timing`, `setup.rebel-units-errata`. Scenario 1 (a Game Core developer reads the matrix) cannot see these engine decisions. | Either (a) add coverage items for the slice `interpretation`/`clarification` entries (implementation-notes may stay out), with implementation+test evidence for the implemented ones and DISC refs for the others, and change the test to filter `kind !== 'implementation-note'`; or (b) Analyst amends AC-5 to "all `rule` entries" and records this in `specification.md`. With (b) this finding is closed without code changes. |
| F-2 | minor | `packages/games/rebellion/knowledge/coverage.json:157` (`units.ships`), `:1046` (`command.turn-order`) | `implemented` is overstated. `units.ships` includes the capital ship / fighter / space station split, which the engine does not model (only `arena`). `command.turn-order` defines a turn as "activate a system **or reveal an assigned mission**", and the engine has no mission reveal. The notes say so, but the status says otherwise. | Make both `partial`: `units.ships` with `DISC-001`, `command.turn-order` with `DISC-002`. Update the AC-6 test row for R-3 if it changes, or narrow the entry text instead. |
| F-3 | nit | `packages/games/rebellion/knowledge/entries/combat.json:3` (`combat.trigger`) | The text says combat happens only when a player moves units in. RR p.2 activation step 4 says combat happens whenever both factions share a system and a theater after movement, and that includes activations with zero moved units. `command.activate.steps` already says it correctly, so the two entries differ. Search returns `combat.trigger` first for "combat if I activate … but move nothing". | Add "or, after an activation's movement, both factions share a theater (RR p.2 step 4)" or add an `exceptions`/`related` link to `command.activate.steps`. |
| F-4 | nit | `packages/games/rebellion/knowledge/entries/rebel-base.json:267` (`base.death-star-does-not-reveal`) | "only Imperial ground units moving into the system do" contradicts the permanent condition in `base.reveal-condition` (Imperial **loyalty** also reveals, RR p.11). The FAQ wording is about the Death Star only. | Write "ships, including the Death Star, never reveal it; only Imperial ground units or loyalty do (RR p.11)". |
| F-5 | minor | `docs/game-rules/knowledge-base.md:65` vs `packages/platform/src/rules-kb/validate-io.ts:70` | The doc says that `tests[].name` must be a substring of an `it(`/`describe(` title. The code checks a substring of the **whole file**, so comments and imports also match. `SYMBOL_NOT_FOUND` likewise accepts any whole-word occurrence, for example an import. This conforms to C-3, but the doc promises a stronger check than the code does. | Fix the doc wording to match C-3, or (optional, later) match `it\|describe\|test(` titles in the code. |
| F-6 | minor | `packages/platform/src/rules-kb/validate.ts:240-266` | `SECTION_NOT_COVERED` works at page level: a section counts as covered if **any** entry cites that page. RR has 88 sections on 14 pages. If, for example, the Spec Ops entry were deleted, no issue would fire. This conforms to C-3 ("covered by an entry with this source/page"), but AC-3 completeness is then only weakly automated. The reviewer matched every RR section manually to an entry `section` name: all are present (the 14 "see X" index aliases resolve to their targets). | Accept for now and record it as a known limitation in `knowledge-base.md`. Optional follow-up: let `sourceSections[].coveredBy` list entry ids, or match on `section` title. |
| F-7 | minor | `packages/platform/src/rules-kb/context.ts:45,61`; all `entries/implementation-notes.json` (`ai: none`) | `include` cannot override `ai: 'none'` (literal reading of plan §2.2), and every implementation-note is `ai: none`. So the AI context can never say "core-v1 has no combat/missions", even when the integrator asks for it by id. Meanwhile core entries such as `command.activate.steps` mention combat and subjugation. Low risk, because the AI only picks legal actions, but it matters for the planned SWR-006 integration. | Decide in the integration task: either let `include` bypass `ai: 'none'`, or mark 2–3 key implementation-notes `situational` with `appliesTo.phases: ['command']`. Record it in `docs/architecture/rules-knowledge.md` §4. Remaining budget is ~66 chars, so any addition truncates; the test catches this. |
| F-8 | nit | `packages/games/rebellion/knowledge/manifest.json:125,131` | `sources[LTP].sha256` holds the **mirror's** hash (the same value as `mirror.sha256`), while the field means the official file. The `reason` explains this, but the field is misleading for tools. | Leave `sha256` as is but add "sha256 = mirror" to `notes`, or (future format change) allow `sha256` to be optional when `mirror` is present. |
| F-9 | nit | `packages/platform/src/rules-kb/search.ts:107` | `limit: NaN` gives `Math.max(0, NaN) = NaN` → `slice(0, NaN)` → `[]`, silently. | Fall back to the default for a limit that is not finite. |

No blocker. No security or hidden-information concerns: the KB is public rules data and holds no state; filtering by `side` only selects public rules.

## Engine audit (coverage claims vs `src/rules/core/*`, `src/scenario/core/*`)

| Claim | Engine evidence | Verdict |
|---|---|---|
| R-3 Rebels first, alternate, a pass lasts the whole phase, refresh when both passed | `turn-flow.ts` `handOver`, `applyPass`, `endCommandPhase` (Rebels reset first) | correct (mission-turn option missing → F-2) |
| R-4 own pool leader into any system; `canActivate` gate; system with a leader allowed | `activation.ts:17-31`, `legal.ts:27-37` | correct |
| R-5 into the activated system only, from adjacent systems, own leader pins, immobile, transport within the command | `movement.ts:44-79` | correct; DISC-013 accurately describes the per-command capacity |
| PASS rejected during an own activation | `apply.ts:98` | matches the interpretation and DISC-012 |
| R-7 refresh steps 1 and 5 only | `turn-flow.ts:60-98` | correct, `partial` + DISC-003 |
| R-8 reveal at Imperial `FINISH_ACTIVATION` of the base system with a ground unit; ships/DS never | `victory.ts:14-23`, `data.ts:51` | correct; DISC-009 latent gap accurately described |
| R-9 Empire wins on a revealed base with an Imperial unit and no Rebel units, checked after every move and after the reveal; Rebels win at time ≥ reputation | `victory.ts:26-30,53`, `movement.ts:89`, `turn-flow.ts:80` | correct |
| R-10 / D-4 engine picks the base (FNV-1a), excludes Bothawui | `base.ts`, `data.ts:111+`, `start-setup.ts:86-93` | correct, DISC-007 |
| First game setup (LTP p.16) | `start-setup.ts:31-84` vs LTP p.16 | identical unit by unit |
| Capacities SD 6, AC 4, SSD 8, DS 8; Rebel 2/4/4; X/Y-wing 0 | `catalog.ts:58-81` | matches the entry and DISC-014; Imperial numbers appear in the faction sheet illustrations on RR p.9 / LTP p.4–7, Rebel ones are unverified |
| Missing mismatches? | combat, missions, loyalty, reveal timing, base space, base choice, setup, leaders, PASS, transport, data, limits | all are in DISC-001..018; none missing |

## Rules accuracy sample (entry id → verdict against the extracted official texts)

Verified entries, **RR (22):**

| Entry | Source checked | Verdict |
|---|---|---|
| `command.activate.place-leader` | RR p.2 | accurate |
| `command.activate.steps` | RR p.2 steps 1–5 | accurate |
| `command.activate.system-with-leader` | RR p.2 (quote verbatim) | accurate |
| `command.activate.tactic-values-required` | RR p.2, p.9 | accurate |
| `command.activate.overflow` | RR p.2 | accurate |
| `command.move.into-activated-from-adjacent` | RR p.9 | accurate |
| `command.move.own-leader-locks` (+ exceptions) | RR p.9, p.3 | accurate |
| `command.transport.restriction-icon` | RR p.9 | accurate |
| `command.pass` | RR p.6 (quote verbatim) + LTP p.7 "turn is skipped" | accurate |
| `command.passed-player-still-reacts` | RR p.6 | accurate |
| `base.reveal-condition` (+ exceptions) | RR p.11 (quote verbatim) | accurate |
| `base.reveal-timing` | RR p.2 step 3, p.11 | accurate |
| `base.ships-do-not-reveal` | RR p.11 | accurate |
| `base.leader-in-space-locks` | RR p.9, p.10 | accurate |
| `victory.empire` | RR p.14, LTP p.11 | accurate |
| `victory.rebels` / `victory.reputation` | RR p.12, p.14 | accurate |
| `refresh.steps` | RR p.12 | accurate |
| `combat.retreat-limits` | RR p.5 | accurate |
| `loyalty.subjugation` | RR p.13 | accurate |
| `general.component-limits` | RR p.6 | accurate |
| `setup.standard-rebel-units` | RR p.15 step 8.III | accurate (errata pointer correct) |
| `combat.trigger` | RR p.4 | accurate to RR p.4, narrower than RR p.2 step 4 → F-3 |

**LTP (9):**

| Entry | Source checked | Verdict |
|---|---|---|
| `setup.first-game-rebels` | LTP p.16 items 1–5 | accurate |
| `setup.first-game-empire` | LTP p.16 items 6–11 | accurate |
| `setup.base-choice-restrictions` | LTP p.5 step 9 | accurate |
| `setup.starting-action-cards` (first game part) | LTP p.4 step 5 | accurate |
| `deploy.subjugated-not-for-rebels` | LTP p.13 | accurate |
| `recruit.first-game` | LTP p.10 | accurate |
| `deathstar.superlaser` | LTP p.11 | accurate |
| `missions.rebel-base-space` | LTP p.8 | accurate |
| `map.systems` (32 systems) | LTP p.7, RR p.14 | accurate |

**FAQ v2.1 (14, all pages 1–5; no page 6–8 citation exists — scripted check):**

| Entry | Source checked | Verdict |
|---|---|---|
| `loyalty.neutral-errata` | FAQ p.1 errata (quote verbatim) | accurate |
| `base.voluntary-reveal-timing` | FAQ p.1 errata | accurate |
| `setup.rebel-units-errata` | FAQ p.1 errata | accurate |
| `missions.card-errata` | FAQ p.1 errata (Sabotage, Covert Operation, Independent Operation) | accurate |
| `base.death-star-does-not-reveal` | FAQ p.1 | accurate to FAQ; "only" overstates → F-4 |
| `command.activate.zero-units` | FAQ p.1 | accurate |
| `combat.retreat-faq` | FAQ p.2 | accurate |
| `leaders.lured-not-captured` | FAQ p.3 | accurate |
| `victory.empire-first-in-same-step` | FAQ p.4 | accurate (generalised from Major Victory / Rebel Assault) |
| `recruit.card-choice` | FAQ p.5 | accurate |
| `command.pass-is-not-action` | FAQ p.5 (quote verbatim) | accurate |
| `base.voluntary-reveal-after-pass` | FAQ p.5 | accurate |
| `base.deploy-when-revealed` | FAQ p.5 | accurate |
| `general.component-limits.destroy-own` | FAQ p.5 | accurate |

**All interpretations (11; 10 are `needs-review`):**

| Entry | Status | Verdict |
|---|---|---|
| `command.pass-not-mid-activation` | needs-review | reasoning sound (RR p.6 + FAQ p.5); correctly unverified |
| `command.activate.own-leader-system` | needs-review | sound literal reading of RR p.2; OK |
| `command.move.no-enemy-pinning` | needs-review | sound: RR p.9 lists the restrictions and none is about enemies |
| `base.units-on-space` | needs-review | sound inference from RR p.10–11 |
| `leaders.mon-mothma-no-tactics` | needs-review | rule official (RR p.2); data unverifiable from text; correct flag + DISC-017 |
| `units.faction-sheet-values` | needs-review | Imperial numbers consistent with the sheet illustration (also on RR p.9 — could be cited); Rebel unverified; correct flag + DISC-014 |
| `map.region-names` | needs-review | correct: no region names in RR/LTP |
| `map.mustafar-utapau` | needs-review | correct flag; not determinable from text |
| `refresh.time-track-icons` | needs-review | correct flag |
| `setup.coruscant-placement` | needs-review | reasonable (RR p.8 + LTP p.16); correctly unverified |
| `round.rr-activation-phase-typo` | verified | correct: RR p.13 literally says "Activation Phase"; all other sources say Assignment |

**All discrepancies (18):** DISC-001 (combat) ✓, DISC-002 (missions) ✓, DISC-003 (refresh) ✓, DISC-004 (objectives) ✓,
DISC-005 (loyalty/subjugation) ✓, DISC-006 (voluntary reveal, FAQ p.1/p.5 cited correctly) ✓, DISC-007 (base choice; LTP p.5
"not adjacent" correct, Bothawui officially allowed) ✓, DISC-008 (Rebel Base space; RR p.9–11 correct) ✓, DISC-009 (latent
gap "ever", RR p.11) ✓, DISC-010 (first game vs standard setup) ✓, DISC-011 (starting leaders, SSD) ✓, DISC-012 (PASS
interpretation) ✓, DISC-013 (transport per command; RR p.9 pooled capacity is equivalent) ✓, DISC-014 (Rebel sheet values) ✓,
DISC-015 (component limits) ✓, DISC-016 (map data) ✓, DISC-017 (leader tactic values) ✓, DISC-018 (time track icons) ✓.
Each one's engine behaviour matches the code above, and its official behaviour matches the cited pages.

Sample total: 22 RR + 9 LTP + 14 FAQ verified entries, 11 interpretations, 18 discrepancies. No factual error.

## Round 1 verdict (superseded)
`changes_requested`. Reason: F-1 (major, AC-5 coverage scope).

## Round 2 (2026-11-20)

W2 changed `knowledge/coverage.json`, `manifest.json`, `entries/combat.json`, `entries/rebel-base.json`,
`test/knowledge/coverage.test.ts`, the generated docs, `knowledge-base.md` and `rules-knowledge.md`. The Analyst added C-4 Q-8
to `specification.md`.

### Checks re-run by the reviewer
| Command | Result |
|---|---|
| `pnpm --filter @bga/game-rebellion exec vitest run test/knowledge` | 8 files, 96 tests passed. `validate.test.ts` gives 0 issues with `nodeIo`, so every cited file, symbol and test name exists |
| `pnpm --filter @bga/platform exec vitest run test/rules-kb` | 135 tests passed |
| `pnpm --filter @bga/game-rebellion typecheck` | exit 0 |
| `pnpm exec eslint packages/games/rebellion/test/knowledge --max-warnings=0` | exit 0 |
| `pnpm exec prettier --check packages/games/rebellion/knowledge packages/games/rebellion/test/knowledge` | clean |
| `git diff --stat c1ace26 -- packages/games/rebellion/src/rules packages/games/rebellion/src/scenario` | empty |
| script: slice-category entries (kind ≠ implementation-note) with no coverage item | none (coverage has 157 items) |

### Finding status
| # | Status | Evidence |
|---|---|---|
| F-1 | fixed | C-4 Q-8 defines the AC-5 scope as rule + clarification + interpretation of the slice categories, with implementation-notes excluded. `coverage.test.ts:53-56` checks this using sub-categories, and `:44-49` forbids implementation-notes in coverage. All 33 previously missing entries now have items. |
| F-2 | fixed | `units.ships` is now `partial` with DISC-001, and `command.turn-order` is now `partial` with DISC-002. |
| F-3 | fixed | The `combat.trigger` text now says "after the movement step… includes activations that moved no units", with `related` → `command.activate.steps`. Matches RR p.2 step 4 and RR p.4. |
| F-4 | fixed | `base.death-star-does-not-reveal` now says "only Imperial ground units or Imperial loyalty… (RR p.11)". Accurate. |
| F-5 | fixed | `knowledge-base.md:65` now describes the real check (whole word / substring anywhere in the file). |
| F-6 | accepted as a known limitation | Documented in `knowledge-base.md:81`. |
| F-7 | open integration decision | Documented in `rules-knowledge.md:82-84`. The decision belongs to the SWR-006 integration task. |
| F-8 | accepted | `manifest.json` LTP `notes` explains that `sha256` is the mirror's hash, and the schema requires 64 hex characters. |
| F-9 | deferred (nit) | Not changed. |

### New `implemented` / `deviation` claims checked against the engine and the cited tests
| Coverage item | Engine | Cited test (opened and read) | Verdict |
|---|---|---|---|
| `command.pass-not-mid-activation` (interp.) | `apply.ts:98` rejects PASS with `activationInProgress`; `legal.ts` lists no PASS during an activation | `turn-flow.test.ts:212` asserts `activationInProgress` | true |
| `command.pass-is-not-action` (clar.) | `applyPass` uses up the whole turn; it is accepted only without an activation | same test, plus the pass/handoff test | true |
| `command.activate.own-leader-system` (interp.) | `validateActivate` has no own-leader check on the target | `activate.test.ts:145` activates `delta`, which holds an own leader | true |
| `command.activate.zero-units` (clar.) | `FINISH_ACTIVATION` needs no prior move | `legal.test.ts:75` offers only FINISH; `turn-flow` "activation + finish" | true |
| `command.move.no-enemy-pinning` (interp.) | `hasOwnLeaderIn` checks the owner (`helpers.ts:54-56`) | `move.test.ts:42`: moving out from beside Vader is accepted | true |
| `base.death-star-does-not-reveal` (clar.) | `unitTypeRevealsRebelBase` = Imperial and ground (`data.ts:51-53`) | `reveal.test.ts` "ships, TIE fighters and the Death Star do not reveal" | true |
| `units.faction-sheet-values`, `map.region-names`, `map.mustafar-utapau`, `leaders.mon-mothma-no-tactics` (interp., data) | values are in `catalog.ts` / `map.ts` | `core-data.test.ts` cases cited; DISC-014/016/017 still attached | true (still needs-review, correctly) |
| `base.units-on-space` → `deviation` | D-6: base units are in the base system (`createCoreGame`) | `create.test.ts` "base units stand in the base" | correctly a deviation with DISC-008 |
| Other new items (`not-implemented` / `not-applicable`) | voluntary reveal, errata of setup, FAQ card rulings, etc. are absent from the engine | n/a | statuses correct, each has a DISC or a note |

One weak link that needs no change: `command.pass-not-mid-activation` also cites `legal.test.ts` "one MOVE_PIECES per adjacent
source…", which shows the legal list during an activation only indirectly. The `turn-flow` test is the real evidence.

No new findings in round 2.

## Verdict
approved

Round 2: F-1..F-5 are fixed. F-6 and F-8 are accepted as documented limitations. F-7 is an open decision for the SWR-006
integration task. F-9 is a deferred nit. No blocking or major findings remain. Not run by the reviewer: `pnpm verify`, PDF sha256.
