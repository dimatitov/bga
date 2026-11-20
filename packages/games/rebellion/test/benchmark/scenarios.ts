/**
 * SWR-008 W9 — Rebellion benchmark scenarios (plan-backend §8.1, spec AC-14, test-cases TC-BEN-01..03, TC-H-09).
 *
 * Every scenario is REACHED by real engine commands on the real base-game data: a new `core-v1` AI game
 * (`createCoreInitialState`, the hidden base is picked by `chooseRebelBase` from the session id) and then a script of
 * `ACTIVATE_SYSTEM` / `MOVE_PIECES` / `FINISH_ACTIVATION` / `PASS` commands applied through `applyCommand` (the AI
 * side with `origin: 'auto'`, the human side with `origin: 'player'`). No state is edited by hand, so every scenario
 * stays a state the engine really reaches (incl. the SWR-008 DISC-009 reveal point `runStateChecks`).
 *
 * The decision point of a scenario is built exactly as the server builds it: `module.parseState` →
 * `automation.pendingActor` → `automation.decisionPoint` (the bot's `buildDecision` over `toSideView(state, aiSide)`,
 * i.e. the AI side's own view only, with the public `rulesQuery`) → `AutomationDecisionPointSchema.parse`.
 *
 * The rubric (`expected` / `acceptable` / `wrong` matchers, `passUnjustified`) is matched against the candidates of
 * that point by type / target / summary substring (candidate ids are opaque). See `../../benchmark/README.md`.
 *
 * `packages/games/rebellion/benchmark/scenarios.json` is generated from `buildScenarioFile()`; regenerate with
 * `UPDATE_BENCH_SCENARIOS=1 pnpm --filter @bga/game-rebellion exec vitest run test/benchmark/scenarios.test.ts`
 * and then `npx prettier --write packages/games/rebellion/benchmark/scenarios.json` (the test compares parsed JSON).
 */
import {
  AutomationDecisionPointSchema,
  type AutomationCandidate,
  type AutomationDecisionPoint,
  type ServerGameModule,
} from '@bga/platform';
import { z } from 'zod';
import { applyCommand, chooseRebelBase } from '../../src/rules';
import { coreDataBaseV1 } from '../../src/scenario';
import {
  CoreGameStateV3Schema,
  eligibleRebelBaseSystemIds,
  opponentOf,
  settingsFromSetupInput,
  toStoredSetup,
  type Command,
  type CoreGameState,
  type Difficulty,
  type Faction,
  type RebellionSettings,
} from '../../src/schema';
import { createCoreInitialState, createRebellionServerModule } from '../../src/server';

/** Fixed creation / command time of every scenario (deterministic file). */
export const BENCH_NOW = '2026-11-20T10:00:00.000Z';
export const BENCH_GAME_ID = 'rebellion';
export const BENCH_FORMAT_VERSION = 1;

// ---------------------------------------------------------------------------------------------------------
// File format (plan-backend §8.1; game-agnostic, read by apps/api/src/bench — W8)
// ---------------------------------------------------------------------------------------------------------

const nonEmpty = z.string().min(1);

/** Matched against a candidate of the decision point: same `type`, and `target` / summary substring if given. */
export const BenchMatcherSchema = z.strictObject({
  type: nonEmpty,
  target: nonEmpty.optional(),
  summaryIncludes: nonEmpty.optional(),
});
export type BenchMatcher = z.infer<typeof BenchMatcherSchema>;

export const BenchRubricSchema = z.strictObject({
  /** Score 1: the action that best serves the side's goal here. */
  expected: z.array(BenchMatcherSchema).min(1),
  /** Score 0.5: does not hurt the goal, but advances it less than `expected`. */
  acceptable: z.array(BenchMatcherSchema),
  /** Score 0: works against the goal or rests on a misread rule. A candidate matching nothing scores 0.25. */
  wrong: z.array(BenchMatcherSchema),
  /** PASS is "unjustified" here: a legal non-PASS candidate advances the side's goal. */
  passUnjustified: z.boolean(),
});
export type BenchRubric = z.infer<typeof BenchRubricSchema>;

export const BenchScenarioSchema = z.strictObject({
  id: z.string().regex(/^(emp|reb)-\d{2}-[a-z0-9-]+$/),
  side: z.enum(['empire', 'rebels']),
  title: nonEmpty,
  goal: nonEmpty,
  justificationRuleIds: z.array(z.string().regex(/^rebellion:[a-z0-9.-]+$/)).min(1),
  sessionId: nonEmpty,
  version: z.int().min(1),
  state: z.unknown(),
  rubric: BenchRubricSchema,
});
export type BenchScenario = z.infer<typeof BenchScenarioSchema>;

export const BenchScenarioFileSchema = z.strictObject({
  formatVersion: z.literal(BENCH_FORMAT_VERSION),
  gameId: z.literal(BENCH_GAME_ID),
  scenarios: z.array(BenchScenarioSchema).min(12),
});
export type BenchScenarioFile = z.infer<typeof BenchScenarioFileSchema>;

/** Does `candidate` satisfy `matcher`? (`type` equal; `target` equal if given; `summary` contains the substring.) */
export function matchesCandidate(matcher: BenchMatcher, candidate: AutomationCandidate): boolean {
  if (candidate.type !== matcher.type) return false;
  if (matcher.target !== undefined && candidate.target !== matcher.target) return false;
  if (matcher.summaryIncludes !== undefined && !candidate.summary.includes(matcher.summaryIncludes))
    return false;
  return true;
}

export type RubricClass = 'expected' | 'acceptable' | 'wrong' | 'unmatched';
export const RUBRIC_SCORES: Record<RubricClass, number> = {
  expected: 1,
  acceptable: 0.5,
  wrong: 0,
  unmatched: 0.25,
};

/** Rubric class of a candidate (first hit in the order expected → acceptable → wrong). */
export function classifyCandidate(
  rubric: BenchRubric,
  candidate: AutomationCandidate,
): RubricClass {
  if (rubric.expected.some((m) => matchesCandidate(m, candidate))) return 'expected';
  if (rubric.acceptable.some((m) => matchesCandidate(m, candidate))) return 'acceptable';
  if (rubric.wrong.some((m) => matchesCandidate(m, candidate))) return 'wrong';
  return 'unmatched';
}

// ---------------------------------------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------------------------------------

/** One engine command of the script; `expectedVersion` is always the current version. */
export interface Step {
  actor: Faction;
  command: Command;
}

const activate = (actor: Faction, leaderId: string, systemId: string): Step => ({
  actor,
  command: { type: 'ACTIVATE_SYSTEM', leaderId, systemId },
});
const move = (
  actor: Faction,
  pieceIds: string[],
  fromSystemId: string,
  toSystemId: string,
): Step => ({
  actor,
  command: { type: 'MOVE_PIECES', pieceIds, fromSystemId, toSystemId },
});
const finish = (actor: Faction): Step => ({ actor, command: { type: 'FINISH_ACTIVATION' } });
const pass = (actor: Faction): Step => ({ actor, command: { type: 'PASS' } });

/** Both sides pass (Rebels first): the round ends, leaders return, time advances. */
const passRound = (): Step[] => [pass('rebels'), pass('empire')];

/**
 * Unit ids on the real base-game data (`createCoreGame`: `u-01…` in start-setup order):
 * Rebels at Bothawui — u-01 corvette (capacity 2), u-02 transport (4), u-03 x-wing, u-04 y-wing, u-05..u-07 troopers,
 * u-08 airspeeder; on the base — u-09 x-wing, u-10 y-wing, u-11..u-13 troopers, u-14 airspeeder.
 * Empire — Saleucami u-15 Star Destroyer (6), u-16/17 TIE, u-18/19 stormtroopers, u-20 AT-ST; Mandalore u-21 Death
 * Star (8), u-22..25 TIE, u-26/27 stormtroopers, u-28 AT-ST; Coruscant u-29 SD, u-30 assault carrier (4), u-31/32
 * TIE, u-33..35 stormtroopers, u-36 AT-AT, u-37 AT-ST; Corellia u-38 assault carrier, u-39 stormtrooper; Sullust
 * u-40 SD, u-41/42 TIE, u-43/44 stormtroopers, u-45 AT-ST; Mustafar u-46 assault carrier, u-47/48 TIE, u-49/50
 * stormtroopers, u-51 AT-ST.
 */
const BASE_UNITS = ['u-09', 'u-10', 'u-11', 'u-12', 'u-13', 'u-14'];
const SULLUST_STRIKE = ['u-40', 'u-43', 'u-44', 'u-45'];

export interface ScenarioSpec {
  id: string;
  side: Faction;
  title: string;
  goal: string;
  justificationRuleIds: string[];
  /** Public AI difficulty of the game (decides the bot's candidate short-list). */
  difficulty: Difficulty;
  /** Where the hidden base is (the session id is searched so that `chooseRebelBase` picks it). */
  baseSystemId: string;
  steps: readonly Step[];
  /**
   * Only for `easy` (seeded noise in the bot's short-list): the session id is also searched so that the decision
   * point offers a candidate for each of these matchers (still the first such `bench-<id>-<n>`, deterministic).
   */
  offers?: readonly BenchMatcher[];
  rubric: BenchRubric;
  /** Which part of the core-v1 slice the scenario exercises (TC-BEN-03; not written to the file). */
  covers: readonly SliceFeature[];
}

export const SLICE_FEATURES = [
  'activation',
  'transport',
  'leader-pin',
  'base-hunt',
  'ships-do-not-reveal',
  'base-revealed',
  'base-defence',
  'base-evacuation',
  'finish',
  'pass',
  'opponent-passed',
  'end-of-time',
] as const;
export type SliceFeature = (typeof SLICE_FEATURES)[number];

/** AI game settings where `aiSide` is played by the AI (the scenario's side). */
export function settingsFor(aiSide: Faction, difficulty: Difficulty): RebellionSettings {
  return settingsFromSetupInput({
    playerFaction: opponentOf(aiSide),
    opponentType: 'ai',
    aiDifficulty: difficulty,
    ruleset: 'base',
    gameMode: 'digital',
  });
}

const MAX_SESSION_SEARCH = 10_000;

/** The ids `bench-<id>-<n>` (n = 0, 1, ...) whose hidden base is `baseSystemId`, in order (deterministic). */
export function* sessionIdsFor(id: string, baseSystemId: string): Generator<string> {
  const eligible = eligibleRebelBaseSystemIds(coreDataBaseV1);
  if (!eligible.includes(baseSystemId))
    throw new Error(`${id}: ${baseSystemId} cannot hold the base`);
  for (let n = 0; n < MAX_SESSION_SEARCH; n += 1) {
    const sessionId = `bench-${id}-${n}`;
    if (chooseRebelBase(sessionId, eligible) === baseSystemId) yield sessionId;
  }
}
type PlayableSpec = Pick<ScenarioSpec, 'id' | 'side' | 'difficulty' | 'baseSystemId' | 'steps'>;

/** Play the script on a new game with this session id; every step must be accepted; schema-checked final state. */
export function playScript(spec: PlayableSpec, sessionId: string): CoreGameState {
  const settings = settingsFor(spec.side, spec.difficulty);
  let state = createCoreInitialState(toStoredSetup(settings), { sessionId, now: BENCH_NOW }).state;
  spec.steps.forEach((step, i) => {
    const origin = step.actor === spec.side ? 'auto' : 'player';
    const result = applyCommand(
      state,
      { actor: step.actor, expectedVersion: state.version, command: step.command },
      { now: BENCH_NOW, origin },
    );
    if (!result.ok) {
      throw new Error(
        `${spec.id}: step ${i} (${step.actor} ${step.command.type}) rejected: ${result.error.messageKey}`,
      );
    }
    if (result.state.rulesEngine !== 'core-v1') throw new Error(`${spec.id}: not core-v1`);
    state = CoreGameStateV3Schema.parse(JSON.parse(JSON.stringify(result.state))) as CoreGameState;
  });
  return state;
}

/**
 * The scenario state: the script played on the first session id whose base is `baseSystemId` (and, with `offers`,
 * whose decision point offers every listed candidate).
 */
export function playScenario(spec: PlayableSpec & Pick<ScenarioSpec, 'offers'>): CoreGameState {
  const offers = spec.offers ?? [];
  if (offers.length > 0 && spec.difficulty !== 'easy') {
    throw new Error(`${spec.id}: 'offers' is only meaningful for the seeded easy short-list`);
  }
  for (const sessionId of sessionIdsFor(spec.id, spec.baseSystemId)) {
    const state = playScript(spec, sessionId);
    if (offers.length === 0) return state;
    const point = decisionPointOf({
      id: spec.id,
      side: spec.side,
      sessionId,
      version: state.version,
      state,
    });
    if (offers.every((m) => point.candidates.some((c) => matchesCandidate(m, c)))) return state;
  }
  throw new Error(`${spec.id}: no session id within ${MAX_SESSION_SEARCH} fits`);
}

/** The production module (bot policy) — the same decision point the server runner and the harness build. */
export const benchModule: ServerGameModule = createRebellionServerModule();

/** Decision point of a stored scenario, built like the harness does (§8.2). */
export function decisionPointOf(
  scenario: Pick<BenchScenario, 'id' | 'side' | 'sessionId' | 'version' | 'state'>,
  module: ServerGameModule = benchModule,
): AutomationDecisionPoint {
  const automation = module.automation;
  if (!automation) throw new Error('the module has no automation');
  const state = module.parseState(scenario.state, {
    sessionId: scenario.sessionId,
    version: scenario.version,
  });
  const actor = automation.pendingActor(state);
  if (actor !== scenario.side) {
    throw new Error(`${scenario.id}: pending actor ${String(actor)}, expected ${scenario.side}`);
  }
  return AutomationDecisionPointSchema.parse(automation.decisionPoint(state));
}

export function buildScenario(spec: ScenarioSpec): BenchScenario {
  const state = playScenario(spec);
  return BenchScenarioSchema.parse({
    id: spec.id,
    side: spec.side,
    title: spec.title,
    goal: spec.goal,
    justificationRuleIds: spec.justificationRuleIds,
    sessionId: state.id,
    version: state.version,
    state: JSON.parse(JSON.stringify(state)) as unknown,
    rubric: spec.rubric,
  });
}

// ---------------------------------------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------------------------------------

const ACT = 'ACTIVATE_SYSTEM';
const MOVE = 'MOVE_PIECES';
const FIN = 'FINISH_ACTIVATION';
const PASS = 'PASS';

/** Round 1, Rebels: Rieekan activates Toydaria (nowhere near the base candidates of the scripts) and finishes. */
const REBELS_TOYDARIA: Step[] = [activate('rebels', 'rieekan', 'toydaria'), finish('rebels')];
/** Empire: Vader activates Naboo; the Sullust Star Destroyer carries the stormtroopers and the AT-ST in. */
const EMPIRE_NABOO_STRIKE: Step[] = [
  activate('empire', 'vader', 'naboo'),
  move('empire', SULLUST_STRIKE, 'sullust', 'naboo'),
  finish('empire'),
];
/** Rebels: Leia activates their own base (Rodia) and brings the empty transport in (the base gets a carrier). */
const REBEL_TRANSPORT_TO_RODIA: Step[] = [
  activate('rebels', 'leia', 'rodia'),
  move('rebels', ['u-02'], 'bothawui', 'rodia'),
  finish('rebels'),
];
/**
 * Base Rodia revealed by the Empire (round 2), then the Imperial strike force leaves it again (round 3) and the Rebels
 * evacuate it (round 4): the revealed base is empty — the Empire is to move.
 */
const ABANDONED_REVEALED_RODIA: Step[] = [
  ...REBEL_TRANSPORT_TO_RODIA,
  ...EMPIRE_NABOO_STRIKE,
  ...passRound(),
  // Round 2: the Rebels pass; the Empire searches Rodia — BASE_REVEALED at its FINISH (DISC-009 check point).
  pass('rebels'),
  activate('empire', 'tarkin', 'rodia'),
  move('empire', SULLUST_STRIKE, 'naboo', 'rodia'),
  finish('empire'),
  pass('empire'),
  // Round 3: the Empire pulls its strike force back to Naboo.
  pass('rebels'),
  activate('empire', 'vader', 'naboo'),
  move('empire', SULLUST_STRIKE, 'rodia', 'naboo'),
  finish('empire'),
  pass('empire'),
  // Round 4: the Rebels carry the whole garrison out to Tatooine.
  activate('rebels', 'leia', 'tatooine'),
  move('rebels', ['u-02', ...BASE_UNITS], 'rodia', 'tatooine'),
  finish('rebels'),
];
/**
 * Hidden base Rodia with a carrier; the Imperial strike force stands at Naboo next to it (round 2, not pinned); the
 * Rebels evacuate the base to Tatooine (Dodonna stays there: Tatooine is pinned for the round); the Empire wastes its
 * turn far away — the Rebels are to move with an EMPTY hidden base next to unpinned Imperial ground.
 */
const EMPTIED_HIDDEN_RODIA: Step[] = [
  ...REBEL_TRANSPORT_TO_RODIA,
  ...EMPIRE_NABOO_STRIKE,
  ...passRound(),
  activate('rebels', 'dodonna', 'tatooine'),
  move('rebels', ['u-02', ...BASE_UNITS], 'rodia', 'tatooine'),
  finish('rebels'),
  activate('empire', 'tarkin', 'mustafar'),
  finish('empire'),
];

/** Rebel MOVE summaries from the base Rodia (transport + x-wing + y-wing + 3 troopers + airspeeder). */
const RODIA_EMPTIED = 'Move 7 units (4 ground, 3 ships) from rodia';
const RODIA_SHIPS_LEAVE = 'Move 3 units (0 ground, 3 ships) from rodia';
const RODIA_GROUND_LEAVES = 'Move 5 units (4 ground, 1 ship) from rodia';

export const SCENARIO_SPECS: readonly ScenarioSpec[] = [
  // ------------------------------------------------------------------------------------------------- Empire
  {
    id: 'emp-01-hunt-adjacent',
    side: 'empire',
    title: 'Search a possible base system next to the strike force',
    goal:
      'Find the hidden Rebel base. The strike force at Naboo (searched last round, not pinned now) can reach three ' +
      'unsearched systems that are still possible base locations; activating one of them and moving ground units ' +
      'in searches it this turn. Activations that only bring ground closer to other possible locations search ' +
      'nothing yet; passing wastes the leaders of the round.',
    justificationRuleIds: [
      'rebellion:command.activate.place-leader',
      'rebellion:command.move.into-activated-from-adjacent',
      'rebellion:command.transport.capacity',
      'rebellion:base.reveal-condition',
      'rebellion:base.reveal-timing',
      'rebellion:setup.base-choice-restrictions',
    ],
    difficulty: 'hard',
    baseSystemId: 'ryloth',
    steps: [
      ...REBELS_TOYDARIA,
      ...EMPIRE_NABOO_STRIKE,
      ...passRound(),
      activate('rebels', 'rieekan', 'nal-hutta'),
      finish('rebels'),
    ],
    rubric: {
      expected: [
        { type: ACT, target: 'geonosis' },
        { type: ACT, target: 'rodia' },
        { type: ACT, target: 'utapau' },
      ],
      acceptable: [
        { type: ACT, target: 'bespin' },
        { type: ACT, target: 'dathomir' },
        { type: ACT, target: 'hoth' },
        { type: ACT, target: 'mygeeto' },
        { type: ACT, target: 'ord-mantell' },
      ],
      wrong: [{ type: PASS }],
      passUnjustified: true,
    },
    covers: ['activation', 'base-hunt', 'transport', 'pass'],
  },
  {
    id: 'emp-02-ground-strike',
    side: 'empire',
    title: 'Bring ground units into the activated system, not ships only',
    goal:
      'The Empire activated an unsearched system and wants it searched. Only Imperial ground units reveal the base; ' +
      'they need a Star Destroyer to carry them. Moving the ground in (with or without the TIE fighters) searches ' +
      'the system when the activation ends; moving the ship alone or finishing now leaves it unsearched.',
    justificationRuleIds: [
      'rebellion:base.reveal-condition',
      'rebellion:base.ships-do-not-reveal',
      'rebellion:command.transport.capacity',
      'rebellion:command.transport.restriction-icon',
      'rebellion:command.activate.steps',
    ],
    difficulty: 'normal',
    baseSystemId: 'ilum',
    steps: [...REBELS_TOYDARIA, activate('empire', 'vader', 'naboo')],
    rubric: {
      expected: [{ type: MOVE, summaryIncludes: '(3 ground' }],
      acceptable: [],
      wrong: [{ type: MOVE, summaryIncludes: '(0 ground' }, { type: FIN }],
      passUnjustified: false,
    },
    covers: ['transport', 'base-hunt', 'ships-do-not-reveal'],
  },
  {
    id: 'emp-03-death-star-alone',
    side: 'empire',
    title: 'The Death Star alone does not search a system',
    goal:
      'The Empire activated an unsearched system and moved only the Death Star in; the troops it could have carried ' +
      'stayed behind without transport. Ships, the Death Star included, never reveal the base, so the system is not ' +
      'searched yet: ground units must still come in from the other neighbour before the activation is finished.',
    justificationRuleIds: [
      'rebellion:base.death-star-does-not-reveal',
      'rebellion:base.ships-do-not-reveal',
      'rebellion:base.reveal-condition',
      'rebellion:command.transport.restriction-icon',
    ],
    difficulty: 'normal',
    baseSystemId: 'ilum',
    steps: [
      ...REBELS_TOYDARIA,
      activate('empire', 'tarkin', 'kashyyyk'),
      move('empire', ['u-21'], 'mandalore', 'kashyyyk'),
    ],
    rubric: {
      expected: [{ type: MOVE, summaryIncludes: '(3 ground' }],
      acceptable: [],
      wrong: [{ type: FIN }, { type: MOVE, summaryIncludes: '(0 ground' }],
      passUnjustified: false,
    },
    covers: ['ships-do-not-reveal', 'transport', 'finish', 'base-hunt'],
  },
  {
    id: 'emp-04-finish-after-strike',
    side: 'empire',
    title: 'Finish the activation once the ground is in',
    goal:
      'Imperial ground units already moved into the activated, unsearched system. The search happens when the ' +
      'movement of the activation is over, so finishing now completes it. One more troop move is harmless but adds ' +
      'nothing; moving an empty carrier in strands the stormtrooper it would have carried.',
    justificationRuleIds: [
      'rebellion:base.reveal-timing',
      'rebellion:command.activate.steps',
      'rebellion:command.activate.zero-units',
      'rebellion:command.transport.restriction-icon',
    ],
    difficulty: 'normal',
    baseSystemId: 'ilum',
    steps: [
      ...REBELS_TOYDARIA,
      activate('empire', 'vader', 'cato-neimoidia'),
      move('empire', SULLUST_STRIKE, 'sullust', 'cato-neimoidia'),
    ],
    rubric: {
      expected: [{ type: FIN }],
      acceptable: [{ type: MOVE, summaryIncludes: '(1 ground' }],
      wrong: [{ type: MOVE, summaryIncludes: '(0 ground' }],
      passUnjustified: false,
    },
    covers: ['finish', 'base-hunt'],
  },
  {
    id: 'emp-05-leader-pin',
    side: 'empire',
    title: 'Do not lock your own forces with a leader',
    goal:
      'Vader stays at Naboo until the Refresh Phase, so the strike force there cannot move this round. Keep hunting ' +
      'with forces that can still move: activate an unsearched system without Imperial units that ground can reach. ' +
      'Activating a system that already holds Imperial ground searches nothing (the base would already be revealed ' +
      'there) and pins those units too; passing wastes the remaining leaders.',
    justificationRuleIds: [
      'rebellion:command.move.own-leader-locks',
      'rebellion:leaders.overview',
      'rebellion:command.activate.place-leader',
      'rebellion:base.reveal-condition',
    ],
    difficulty: 'normal',
    baseSystemId: 'endor',
    steps: [
      ...REBELS_TOYDARIA,
      ...EMPIRE_NABOO_STRIKE,
      activate('rebels', 'dodonna', 'nal-hutta'),
      finish('rebels'),
    ],
    rubric: {
      expected: [{ type: ACT, summaryIncludes: 'your ground units there: 0;' }],
      acceptable: [],
      wrong: [
        { type: ACT, target: 'corellia' },
        { type: ACT, target: 'coruscant' },
        { type: PASS },
      ],
      passUnjustified: true,
    },
    covers: ['leader-pin', 'activation', 'base-hunt', 'pass'],
  },
  {
    id: 'emp-06-assault-abandoned-base',
    side: 'empire',
    title: 'Activate the revealed, abandoned base',
    goal:
      'The base is revealed and no Rebel unit is left in it; Imperial units stand next to it. Activating the base ' +
      'system lets them move in, and the Empire wins as soon as one Imperial unit is there with no Rebel unit. Any ' +
      'other activation or a pass gives the Rebels a turn to move units back in.',
    justificationRuleIds: [
      'rebellion:victory.empire',
      'rebellion:command.activate.place-leader',
      'rebellion:command.move.into-activated-from-adjacent',
      'rebellion:base.after-reveal',
    ],
    difficulty: 'normal',
    baseSystemId: 'rodia',
    steps: ABANDONED_REVEALED_RODIA,
    rubric: {
      expected: [{ type: ACT, summaryIncludes: 'revealed base' }],
      acceptable: [],
      wrong: [{ type: ACT, summaryIncludes: 'not the base' }, { type: PASS }],
      passUnjustified: true,
    },
    covers: ['base-revealed', 'activation', 'pass'],
  },
  {
    id: 'emp-07-capture-empty-base',
    side: 'empire',
    title: 'Move any unit into the empty revealed base',
    goal:
      'The Empire activated the revealed base that holds no Rebel unit. Any Imperial unit moving in wins the game at ' +
      'once: a ship is enough here, because the base is already revealed. Finishing without a move throws the ' +
      'win away.',
    justificationRuleIds: [
      'rebellion:victory.empire',
      'rebellion:command.move.into-activated-from-adjacent',
      'rebellion:command.activate.zero-units',
    ],
    difficulty: 'normal',
    baseSystemId: 'rodia',
    steps: [...ABANDONED_REVEALED_RODIA, activate('empire', 'vader', 'rodia')],
    rubric: {
      expected: [{ type: MOVE }],
      acceptable: [],
      wrong: [{ type: FIN }],
      passUnjustified: false,
    },
    covers: ['base-revealed', 'finish', 'transport'],
  },
  {
    id: 'emp-08-rebels-passed',
    side: 'empire',
    title: 'Keep hunting after the Rebels passed',
    goal:
      'The Rebels passed for the round. If the Empire passes too, the Command Phase ends at once and time advances ' +
      'towards the Rebel victory, while all four Imperial leaders are still unused. No possible base location is in ' +
      'reach yet, so the useful turn is to activate a system that brings ground next to possible locations.',
    justificationRuleIds: [
      'rebellion:command.pass',
      'rebellion:command.turn-order',
      'rebellion:round.structure',
      'rebellion:victory.rebels',
      'rebellion:setup.base-choice-restrictions',
    ],
    difficulty: 'hard',
    baseSystemId: 'ryloth',
    steps: [pass('rebels')],
    rubric: {
      expected: [{ type: ACT }],
      acceptable: [],
      wrong: [{ type: PASS }],
      passUnjustified: true,
    },
    covers: ['opponent-passed', 'pass', 'activation', 'base-hunt'],
  },
  // ------------------------------------------------------------------------------------------------- Rebels
  {
    id: 'reb-01-hold-revealed-base',
    side: 'rebels',
    title: 'Keep a unit in the revealed base',
    goal:
      'The base is revealed and Imperial ground units stand in it. The Empire wins the moment no Rebel unit is left ' +
      'there, so carrying the whole garrison out loses at once. Finishing (or moving the fleet from Bothawui) keeps ' +
      'the base held; moving part of the garrison out still leaves it held but weaker.',
    justificationRuleIds: [
      'rebellion:victory.empire',
      'rebellion:base.after-reveal',
      'rebellion:command.move.into-activated-from-adjacent',
    ],
    difficulty: 'normal',
    baseSystemId: 'rodia',
    steps: [
      ...REBEL_TRANSPORT_TO_RODIA,
      ...EMPIRE_NABOO_STRIKE,
      ...passRound(),
      pass('rebels'),
      activate('empire', 'tarkin', 'rodia'),
      move('empire', SULLUST_STRIKE, 'naboo', 'rodia'),
      finish('empire'),
      pass('empire'),
      activate('rebels', 'leia', 'tatooine'),
    ],
    rubric: {
      expected: [{ type: FIN }, { type: MOVE, summaryIncludes: 'from bothawui' }],
      acceptable: [
        { type: MOVE, summaryIncludes: RODIA_SHIPS_LEAVE },
        { type: MOVE, summaryIncludes: RODIA_GROUND_LEAVES },
      ],
      wrong: [{ type: MOVE, summaryIncludes: RODIA_EMPTIED }],
      passUnjustified: false,
    },
    covers: ['base-revealed', 'base-defence', 'base-evacuation', 'finish'],
  },
  {
    id: 'reb-02-keep-last-units-home',
    side: 'rebels',
    title: 'Do not empty the hidden base under threat',
    goal:
      'Imperial ground units stand next to the hidden base and can move in on the next Imperial turn. Their arrival ' +
      'reveals the base; if no Rebel unit is in it then, the Empire wins at once. Keep the garrison home: finish or ' +
      'move the fleet from Bothawui. Moving part of the garrison out keeps the base held but weaker.',
    justificationRuleIds: [
      'rebellion:base.reveal-condition',
      'rebellion:base.reveal-timing',
      'rebellion:victory.empire',
    ],
    difficulty: 'normal',
    baseSystemId: 'rodia',
    steps: [
      ...REBEL_TRANSPORT_TO_RODIA,
      ...EMPIRE_NABOO_STRIKE,
      ...passRound(),
      activate('rebels', 'dodonna', 'tatooine'),
    ],
    rubric: {
      expected: [{ type: FIN }, { type: MOVE, summaryIncludes: 'from bothawui' }],
      acceptable: [
        { type: MOVE, summaryIncludes: RODIA_SHIPS_LEAVE },
        { type: MOVE, summaryIncludes: RODIA_GROUND_LEAVES },
      ],
      wrong: [{ type: MOVE, summaryIncludes: RODIA_EMPTIED }],
      passUnjustified: false,
    },
    covers: ['base-defence', 'base-evacuation', 'finish'],
  },
  {
    id: 'reb-03-reoccupy-empty-base',
    side: 'rebels',
    title: 'Reoccupy the empty base before the Empire arrives',
    goal:
      'The hidden base is empty and unpinned Imperial ground stands next to it: if it moves in, the base is revealed ' +
      'with no Rebel unit and the Empire wins. The evacuated garrison cannot come back this round (Dodonna pins ' +
      'Tatooine), but the fleet at Bothawui can: activate the base now. Passing or activating elsewhere leaves the ' +
      'base open.',
    justificationRuleIds: [
      'rebellion:victory.empire',
      'rebellion:base.reveal-condition',
      'rebellion:command.move.own-leader-locks',
      'rebellion:command.pass',
    ],
    difficulty: 'easy',
    baseSystemId: 'rodia',
    steps: EMPTIED_HIDDEN_RODIA,
    offers: [{ type: ACT, summaryIncludes: 'your base' }],
    rubric: {
      expected: [{ type: ACT, summaryIncludes: 'your base' }],
      acceptable: [],
      wrong: [{ type: PASS }, { type: ACT, summaryIncludes: 'that can move in: 0.' }],
      passUnjustified: true,
    },
    covers: ['base-defence', 'leader-pin', 'activation', 'pass'],
  },
  {
    id: 'reb-04-move-back-into-base',
    side: 'rebels',
    title: 'Move units back into the empty base',
    goal:
      'The Rebels activated their empty hidden base while Imperial ground stands next to it. Any Rebel unit moved in ' +
      'keeps the Empire from winning when it arrives; the fleet at Bothawui can carry troops (the evacuated ' +
      'garrison at Tatooine is pinned by its leader). Finishing without a move leaves the base empty.',
    justificationRuleIds: [
      'rebellion:victory.empire',
      'rebellion:command.transport.capacity',
      'rebellion:command.move.into-activated-from-adjacent',
      'rebellion:command.move.own-leader-locks',
    ],
    difficulty: 'normal',
    baseSystemId: 'rodia',
    steps: [...EMPTIED_HIDDEN_RODIA, activate('rebels', 'leia', 'rodia')],
    rubric: {
      expected: [{ type: MOVE }],
      acceptable: [],
      wrong: [{ type: FIN }],
      passUnjustified: false,
    },
    covers: ['base-defence', 'transport', 'leader-pin', 'finish'],
  },
  {
    id: 'reb-05-end-of-time-pass',
    side: 'rebels',
    title: 'Last round: passing is fine',
    goal:
      'Time is one space short of reputation and the base is hidden and guarded. When both sides pass, time ' +
      'advances and the Rebels win. Passing ends the Rebel part of the round with no risk; activating a system ' +
      'elsewhere is harmless; activating the base itself only shows the Empire where it is.',
    justificationRuleIds: [
      'rebellion:victory.rebels',
      'rebellion:command.pass',
      'rebellion:refresh.advance-time',
      'rebellion:base.secret-location',
    ],
    difficulty: 'normal',
    baseSystemId: 'rodia',
    steps: Array.from({ length: 12 }, () => passRound()).flat(),
    rubric: {
      expected: [{ type: PASS }],
      acceptable: [{ type: ACT, summaryIncludes: 'that can move in: 0.' }],
      wrong: [{ type: ACT, summaryIncludes: 'your base' }],
      passUnjustified: false,
    },
    covers: ['end-of-time', 'pass'],
  },
  {
    id: 'reb-06-finish-without-useful-move',
    side: 'rebels',
    title: 'Finish when no move helps',
    goal:
      'The Rebels activated a system next to their hidden base; the only units that could move in are the base ' +
      'garrison. No Imperial force is near, so moving it out gains nothing: finish the activation. Moving part of ' +
      'the garrison keeps the base held; carrying all of it out leaves the base empty for the first Imperial search.',
    justificationRuleIds: [
      'rebellion:command.activate.zero-units',
      'rebellion:base.reveal-condition',
      'rebellion:victory.empire',
    ],
    difficulty: 'normal',
    baseSystemId: 'rodia',
    steps: [
      ...REBEL_TRANSPORT_TO_RODIA,
      activate('empire', 'vader', 'coruscant'),
      finish('empire'),
      ...passRound(),
      activate('rebels', 'dodonna', 'geonosis'),
    ],
    rubric: {
      expected: [{ type: FIN }],
      acceptable: [
        { type: MOVE, summaryIncludes: RODIA_SHIPS_LEAVE },
        { type: MOVE, summaryIncludes: RODIA_GROUND_LEAVES },
      ],
      wrong: [{ type: MOVE, summaryIncludes: RODIA_EMPTIED }],
      passUnjustified: false,
    },
    covers: ['finish', 'base-evacuation'],
  },
];

export function buildScenarioFile(
  specs: readonly ScenarioSpec[] = SCENARIO_SPECS,
): BenchScenarioFile {
  return BenchScenarioFileSchema.parse({
    formatVersion: BENCH_FORMAT_VERSION,
    gameId: BENCH_GAME_ID,
    scenarios: specs.map(buildScenario),
  });
}
