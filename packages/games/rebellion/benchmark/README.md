# Rebellion AI benchmark scenarios (SWR-008, AC-14)

`scenarios.json` is a reproducible set of tactical decision points on the `core-v1` slice (Command Phase only:
activate, move with transport, finish, pass; no combat, missions, production or loyalty). The game-agnostic harness
(`apps/api/src/bench`, SWR-008 W8) runs every scenario with the variants `bot`, `openai-no-rules` and `openai-rules`
and scores the chosen candidate with the rubric below.

- Source of truth: `packages/games/rebellion/test/benchmark/scenarios.ts` (builders, format, matcher semantics).
- Consistency test: `packages/games/rebellion/test/benchmark/scenarios.test.ts` (TC-BEN-01..03, TC-H-09 data part).
- Regenerate after changing a builder, the engine, the bot or the data:

  ```bash
  UPDATE_BENCH_SCENARIOS=1 pnpm --filter @bga/game-rebellion exec vitest run test/benchmark/scenarios.test.ts
  npx prettier --write packages/games/rebellion/benchmark/scenarios.json
  ```

  The test compares the parsed JSON with the builders, so the prettier formatting does not matter for freshness.

## How a scenario is made

1. A new `core-v1` AI game on the real base-game data (`createCoreInitialState`); the AI side is the scenario's
   `side`. The hidden base is chosen by the engine (`chooseRebelBase`) from the session id: the builder takes the
   first `bench-<scenario id>-<n>` that puts the base where the script needs it.
2. A script of real engine commands (`ACTIVATE_SYSTEM`, `MOVE_PIECES`, `FINISH_ACTIVATION`, `PASS`) is applied with
   `applyCommand` (AI side `origin: 'auto'`, human side `origin: 'player'`). Every step must be accepted and every
   intermediate state passes `CoreGameStateV3Schema`. No state is edited by hand, so the scenarios stay reachable
   states under the SWR-008 engine change (DISC-009: the base is revealed only by `runStateChecks`, at the end of
   the Imperial activation).
3. The stored `state` is the final snapshot (`sessionId`, `version` = its row). The harness rebuilds the decision
   point exactly like the server: `module.parseState` → `automation.pendingActor` (must equal `side`) →
   `automation.decisionPoint` (the bot's `buildDecision` over `toSideView(state, side)`: the AI side's own view only,
   with the public `rulesQuery`) → `AutomationDecisionPointSchema.parse`. The model never sees `state`, `title`,
   `goal` or the rubric — only the decision point (objective, situation, top-10 candidates) and, for
   `openai-rules`, the selected rules.
4. `reb-03` uses the `easy` difficulty, whose short-list contains seeded noise: there the session id search also
   requires that the base activation is offered (`offers`). All other scenarios take the first session id with the
   right base.

## File format (`formatVersion: 1`)

```ts
interface BenchScenarioFile { formatVersion: 1; gameId: 'rebellion'; scenarios: BenchScenario[] }
interface BenchScenario {
  id: string;                     // emp-NN-… / reb-NN-…
  side: 'empire' | 'rebels';      // the AI side = pendingActor of the state
  title: string; goal: string;    // English: what the side wants here and why (rationale), for reports only
  justificationRuleIds: string[]; // KB ids that justify the rubric: exist, `verified`, `ai !== 'none'`
  sessionId: string; version: number;
  state: unknown;                 // stored core-v1 snapshot (module.parseState input)
  rubric: {
    expected: BenchMatcher[];     // score 1
    acceptable: BenchMatcher[];   // score 0.5
    wrong: BenchMatcher[];        // score 0
    passUnjustified: boolean;     // PASS here is "unjustified"
  };
}
interface BenchMatcher { type: string; target?: string; summaryIncludes?: string }
```

## Rubric (goal alignment)

Candidate ids (`c1..c10`) are opaque, so a matcher describes candidates by content: a candidate matches when its
`type` is equal, its `target` is equal (if the matcher has one) and its `summary` contains `summaryIncludes` (if
given). The class of the chosen candidate is the first hit in the order `expected` → `acceptable` → `wrong`; the test
guarantees that no candidate of the point matches two classes and that every matcher matches at least one candidate.

| Class | Score | Meaning |
|---|---|---|
| `expected` | 1 | best serves the side's goal here, by the rules cited in `justificationRuleIds` |
| `acceptable` | 0.5 | does not hurt the goal, but advances it less (or only prepares) |
| `wrong` | 0 | works against the goal or rests on a misread rule (e.g. "ships reveal the base", leaving the base empty) |
| unmatched | 0.25 | a legal candidate the rubric does not rate (neither clearly useful nor clearly harmful) |

The goal score of a variant is the mean score of its decisions; "hit the expected action" is the share of score 1.
An empty `acceptable` (or `wrong`) list means the point offers no candidate of that class.

**Unjustified PASS.** `passUnjustified: true` means: PASS is a candidate, it is rated `wrong`, and at least one
non-PASS candidate is `expected` (a goal-advancing alternative exists). A decision is an unjustified pass when the
chosen candidate is PASS and the scenario has `passUnjustified: true`. Inside an activation PASS is not legal, so
those scenarios have `false`; scenarios where passing is fine (`reb-05`) also have `false`.

**Side goals** (the same as the decision point's `objective`):

- Empire: find the hidden base (only Imperial ground units in its system reveal it, at the end of the activation);
  after the reveal, win by holding the base with no Rebel unit in it.
- Rebels: survive until time reaches reputation; keep the base hidden and never leave it without a Rebel unit
  (in `core-v1` the Empire can only win through an empty revealed base).

**Hidden information.** Rubrics of Empire scenarios are defined from the Empire's view only: they never name the base
system (title, goal and matchers are checked), and for every Empire scenario with a hidden base the decision point is
identical when the base is moved to any other eligible system (TC-H-09) — the rubric outcome cannot depend on where
the base really is. The rubric may therefore rate a system as the best search target although the base is elsewhere.

## Scenarios

| Id | Side | Difficulty | Situation | Expected | Acceptable | Wrong | PASS unjustified |
|---|---|---|---|---|---|---|---|
| `emp-01-hunt-adjacent` | Empire | hard | round 2, strike force at Naboo (searched, free) next to 3 unsearched possible base systems | activate Geonosis / Rodia / Utapau | staging activations next to other possible locations | PASS | yes |
| `emp-02-ground-strike` | Empire | normal | own activation of an unsearched system, Star Destroyer + troops adjacent | move with ground units | — | ships only; FINISH | no |
| `emp-03-death-star-alone` | Empire | normal | the Death Star alone moved in, its troops stranded | move ground in from the other neighbour | — | FINISH; ships only | no |
| `emp-04-finish-after-strike` | Empire | normal | ground already moved into the activated system | FINISH | one more troop move | empty carrier move | no |
| `emp-05-leader-pin` | Empire | normal | Vader pins the strike force at Naboo this round | activate an unsearched system with no own units that free ground can reach | — | activate Corellia / Coruscant (own ground: cannot hold the base, pins it); PASS | yes |
| `emp-06-assault-abandoned-base` | Empire | normal | revealed base, no Rebel and no Imperial unit in it, Imperial units adjacent | activate the revealed base | — | any other activation; PASS | yes |
| `emp-07-capture-empty-base` | Empire | normal | own activation of the empty revealed base | any move in (a ship is enough) | — | FINISH | no |
| `emp-08-rebels-passed` | Empire | hard | round 1, the Rebels passed, all leaders unused | any (staging) activation | — | PASS (ends the round, time advances) | yes |
| `reb-01-hold-revealed-base` | Rebels | normal | revealed base with Imperial ground in it; Rebels activated Tatooine | FINISH; fleet move from Bothawui | partial withdrawal from the base | carry the whole garrison out (immediate loss) | no |
| `reb-02-keep-last-units-home` | Rebels | normal | hidden base, Imperial ground adjacent; Rebels activated Tatooine | FINISH; fleet move from Bothawui | partial withdrawal | empty the base | no |
| `reb-03-reoccupy-empty-base` | Rebels | easy | hidden base empty, unpinned Imperial ground adjacent, evacuated garrison pinned at Tatooine | activate the base | — | PASS; activations where nothing can move | yes |
| `reb-04-move-back-into-base` | Rebels | normal | own activation of the empty base, fleet at Bothawui | any move in | — | FINISH | no |
| `reb-05-end-of-time-pass` | Rebels | normal | round 13, time one short of reputation, base hidden and guarded | PASS | activations elsewhere (nothing moves) | activate the base (public clue for nothing) | no |
| `reb-06-finish-without-useful-move` | Rebels | normal | activated a neighbour of the hidden base, only the garrison could move, no threat | FINISH | partial withdrawal | empty the base | no |

Slice coverage (TC-BEN-03): activation, movement with transport (`emp-02`, `emp-03`, `reb-04`), leader pin
(`emp-05`, `reb-03`, `reb-04`), base hunt (Empire), base defence and evacuation (Rebels), ships / Death Star do not
reveal (`emp-02`, `emp-03`), revealed base (`emp-06`, `emp-07`, `reb-01`), terminal FINISH and PASS, an opponent who
passed (`emp-08`), the end of time (`reb-05`). No scenario is about combat or missions.

## Running the benchmark (harness `apps/api/src/bench`, W8)

The harness is game-agnostic; it reads this file as data and runs three variants on the same pipeline as the server
commander: `bot` (the game's own pick, no calls), `openai-no-rules` (SWR-006 prompt) and `openai-rules` (SWR-008
Rules Context). Node 22 (`nvm use`) is required.

```bash
pnpm --filter @bga/api bench:ai                                   # mock provider: checks the pipeline, not a measurement
pnpm --filter @bga/api bench:ai -- --real --max-usd 1 --repeats 3 --dry-run   # plan + worst-case cost, no network
pnpm --filter @bga/api bench:ai -- --real --max-usd 1 --repeats 3            # paid run (explicit approval only)
```

- `--real` — real OpenAI calls; refused without `--max-usd`. `--max-usd` — hard cap, decimal in `(0, 1]` (PO-2): every
  call reserves its worst case in a run-local budget, the first refusal stops all further calls (`stopped: 'cost-cap'`).
- `--repeats` — repeats per scenario × variant (real runs: at least 3). `--role` — model role (default
  `AI_COMMANDER_MODEL_ROLE`). `--out` — report directory.
- `NODE_ENV=test`, OpenAI disabled or a model without a price → refused before any network call. Player sessions,
  their budgets and the database are never touched.
- Report: `<out>/<mock|real>-<YYYYMMDD-HHmmss>.json` and `.md` — per variant: valid-decision rate, unjustified-PASS
  rate, mean rubric score, expected-action hit rate, fallbacks, input/output/rules tokens, cost, latency p50/p95
  (nearest rank), and the rules-on vs rules-off comparison with a 95% interval. SWR-008 reports live in
  `docs/tasks/SWR-008/artifacts/benchmark/`.

## Known limits

- The candidates are the bot's top-10 short-list (SWR-006): the rubric can only rate what the point offers. When the
  bot, the engine or the data change, the test fails until the scenarios are reviewed and regenerated.
- `core-v1` has no combat: "defending" the base means keeping at least one Rebel unit in it; the rubric does not
  reward force ratios.
- Possible base locations differ by difficulty (`hard` applies the first-game setup rule); each scenario's rubric is
  written for the situation its point shows.
