/**
 * SWR-008 W9 — Rebellion benchmark scenarios (AC-14; TC-BEN-01..03, TC-H-09 data part; plan-backend §8.1).
 * The committed `packages/games/rebellion/benchmark/scenarios.json` must equal what the builders produce.
 * Regenerate: UPDATE_BENCH_SCENARIOS=1 pnpm --filter @bga/game-rebellion exec vitest run test/benchmark/scenarios.test.ts
 * then: npx prettier --write packages/games/rebellion/benchmark/scenarios.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { KbEntrySchema } from '@bga/platform/rules-kb';
import type { AutomationDecisionPoint } from '@bga/platform';
import { buildDecision, rulesQueryFor } from '../../src/ai';
import { toSideView } from '../../src/rules';
import { coreDataBaseV1 } from '../../src/scenario';
import {
  CoreGameStateV3Schema,
  eligibleRebelBaseSystemIds,
  unitTypeRevealsRebelBase,
  type CoreGameState,
} from '../../src/schema';
import { relocateBase } from '../ai/fixtures/relocate-base';
import { loadRawEntries } from '../knowledge/load-kb';
import {
  BenchScenarioFileSchema,
  SCENARIO_SPECS,
  SLICE_FEATURES,
  benchModule,
  buildScenarioFile,
  classifyCandidate,
  decisionPointOf,
  matchesCandidate,
  type BenchMatcher,
  type BenchScenario,
  type RubricClass,
} from './scenarios';

const FILE = fileURLToPath(new URL('../../benchmark/scenarios.json', import.meta.url));
const README = fileURLToPath(new URL('../../benchmark/README.md', import.meta.url));
const REGENERATE =
  'run: UPDATE_BENCH_SCENARIOS=1 pnpm --filter @bga/game-rebellion exec vitest run test/benchmark/scenarios.test.ts && npx prettier --write packages/games/rebellion/benchmark/scenarios.json';
const update = process.env['UPDATE_BENCH_SCENARIOS'] === '1';

const built = buildScenarioFile();
if (update) {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(built, null, 2)}\n`);
}

const scenarios = built.scenarios;
const points = new Map<string, AutomationDecisionPoint>(
  scenarios.map((s) => [s.id, decisionPointOf(s)]),
);
const specById = new Map(SCENARIO_SPECS.map((s) => [s.id, s]));

function pointOf(id: string): AutomationDecisionPoint {
  const point = points.get(id);
  if (!point) throw new Error(`no decision point for ${id}`);
  return point;
}

function stateOf(scenario: BenchScenario): CoreGameState {
  return CoreGameStateV3Schema.parse(scenario.state) as CoreGameState;
}

const CLASSES = ['expected', 'acceptable', 'wrong'] as const;

/** Every matcher of the rubric with its class. */
function matchersOf(scenario: BenchScenario): [(typeof CLASSES)[number], BenchMatcher][] {
  return CLASSES.flatMap((cls) =>
    scenario.rubric[cls].map((m): [typeof cls, BenchMatcher] => [cls, m]),
  );
}

describe('benchmark scenario file (TC-BEN-01)', () => {
  it('the committed file exists and equals the builders', () => {
    expect(existsSync(FILE), `benchmark/scenarios.json missing — ${REGENERATE}`).toBe(true);
    const stored = BenchScenarioFileSchema.parse(JSON.parse(readFileSync(FILE, 'utf8')));
    expect(stored, `benchmark/scenarios.json is stale — ${REGENERATE}`).toEqual(
      JSON.parse(JSON.stringify(built)),
    );
  });

  it('the builders are deterministic (same file twice)', () => {
    expect(JSON.stringify(buildScenarioFile())).toBe(JSON.stringify(built));
  });

  it('has >= 12 scenarios, >= 6 per side, unique ids, every rubric field present', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(12);
    expect(scenarios.filter((s) => s.side === 'empire').length).toBeGreaterThanOrEqual(6);
    expect(scenarios.filter((s) => s.side === 'rebels').length).toBeGreaterThanOrEqual(6);
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
    for (const s of scenarios) {
      expect(s.id.startsWith(s.side === 'empire' ? 'emp-' : 'reb-'), s.id).toBe(true);
      expect(s.rubric.expected.length, s.id).toBeGreaterThan(0);
      expect(s.rubric.acceptable.length + s.rubric.wrong.length, s.id).toBeGreaterThan(0);
      expect(typeof s.rubric.passUnjustified).toBe('boolean');
      expect(s.goal.length).toBeGreaterThan(40);
      expect(s.justificationRuleIds.length).toBeGreaterThan(0);
      // English / ASCII texts (they go to reports, never to the model).
      expect(/^[\x20-\x7e]+$/.test(`${s.title}${s.goal}`), s.id).toBe(true);
    }
    // Across the set every rubric class is used, and PASS is unjustified in some scenarios and fine in others.
    for (const cls of CLASSES) expect(scenarios.some((s) => s.rubric[cls].length > 0)).toBe(true);
    expect(scenarios.some((s) => s.rubric.passUnjustified)).toBe(true);
    expect(scenarios.some((s) => s.rubric.expected.some((m) => m.type === 'PASS'))).toBe(true);
  });

  it('the README documents the rubric and every scenario', () => {
    const readme = readFileSync(README, 'utf8');
    for (const word of [
      'expected',
      'acceptable',
      'wrong',
      'passUnjustified',
      '0.25',
      'UPDATE_BENCH_SCENARIOS',
    ]) {
      expect(readme, word).toContain(word);
    }
    for (const s of scenarios) expect(readme, s.id).toContain(s.id);
  });
});

describe.each(scenarios.map((s) => [s.id, s] as const))(
  'scenario %s (TC-BEN-02)',
  (id, scenario) => {
    const point = pointOf(id);
    const state = stateOf(scenario);

    it('is a stored core-v1 state of a running AI game with the AI side to move', () => {
      expect(state.rulesEngine).toBe('core-v1');
      expect(state.id).toBe(scenario.sessionId);
      expect(state.version).toBe(scenario.version);
      expect(state.outcome).toBeNull();
      expect(state.settings.opponentType).toBe('ai');
      expect(state.settings.opponentFaction).toBe(scenario.side);
      expect(state.activeSide).toBe(scenario.side);
      expect(point.actor).toBe(scenario.side);
    });

    it('the decision point is built from the AI side view only (bot builder + public rulesQuery)', () => {
      const view = toSideView(state, scenario.side);
      const decision = buildDecision(view);
      expect(decision).not.toBeNull();
      expect(point).toEqual(JSON.parse(JSON.stringify(decision?.point)));
      expect(point.rulesQuery).toEqual(rulesQueryFor(view));
    });

    it('every matcher matches at least one candidate; no candidate falls in two classes', () => {
      for (const [cls, matcher] of matchersOf(scenario)) {
        expect(
          point.candidates.some((c) => matchesCandidate(matcher, c)),
          `${cls} ${JSON.stringify(matcher)} matches no candidate`,
        ).toBe(true);
      }
      for (const candidate of point.candidates) {
        const hits = CLASSES.filter((cls) =>
          scenario.rubric[cls].some((m) => matchesCandidate(m, candidate)),
        );
        expect(
          hits.length,
          `${candidate.id} ${candidate.summary}: ${hits.join(',')}`,
        ).toBeLessThanOrEqual(1);
      }
    });

    it('PASS is "unjustified" exactly when PASS is legal, wrong and a non-PASS candidate is expected', () => {
      const passCandidate = point.candidates.find((c) => c.type === 'PASS');
      const passClass: RubricClass | null = passCandidate
        ? classifyCandidate(scenario.rubric, passCandidate)
        : null;
      if (scenario.rubric.passUnjustified) {
        expect(passClass).toBe('wrong');
        expect(
          point.candidates.some(
            (c) => c.type !== 'PASS' && classifyCandidate(scenario.rubric, c) === 'expected',
          ),
        ).toBe(true);
      } else {
        expect(passClass === null || passClass !== 'wrong').toBe(true);
      }
    });

    it('the rubric is consistent with the public rules query (activation state, base revealed)', () => {
      const types = new Set(matchersOf(scenario).map(([, m]) => m.type));
      for (const type of types) expect(point.rulesQuery?.commandTypes, type).toContain(type);
      expect(point.rulesQuery?.tags).toContain(
        state.rebelBase.revealed ? 'base-revealed' : 'base-hidden',
      );
    });
  },
);

describe('justification rule ids (TC-BEN-02)', () => {
  const entries = new Map(
    z
      .array(KbEntrySchema)
      .parse(loadRawEntries())
      .map((e) => [e.id, e]),
  );

  it.each(scenarios.map((s) => [s.id, s.justificationRuleIds] as const))(
    '%s cites existing, verified KB entries that may reach the AI context',
    (_id, ids) => {
      expect(new Set(ids).size).toBe(ids.length);
      for (const ruleId of ids) {
        const entry = entries.get(ruleId);
        expect(entry, `${ruleId} missing from the KB`).toBeDefined();
        expect(entry?.status, ruleId).toBe('verified');
        expect(entry?.ai, ruleId).not.toBe('none');
      }
    },
  );
});

describe('slice coverage (TC-BEN-03)', () => {
  const covered = (side: string) =>
    new Set(SCENARIO_SPECS.filter((s) => s.side === side).flatMap((s) => s.covers));

  it('covers the core-v1 slice: activation, transport, leader pin, hunt, defence/evacuation, PASS/FINISH', () => {
    const all = new Set(SCENARIO_SPECS.flatMap((s) => s.covers));
    for (const feature of SLICE_FEATURES) expect(all.has(feature), feature).toBe(true);
    expect(covered('empire').has('base-hunt')).toBe(true);
    for (const f of ['base-defence', 'base-evacuation', 'leader-pin'] as const) {
      expect(covered('rebels').has(f), f).toBe(true);
    }
    expect(covered('empire').has('leader-pin')).toBe(true);
    // Terminal actions are the expected answer somewhere.
    expect(
      scenarios.some((s) => s.rubric.expected.some((m) => m.type === 'FINISH_ACTIVATION')),
    ).toBe(true);
    expect(scenarios.some((s) => s.rubric.expected.some((m) => m.type === 'PASS'))).toBe(true);
  });

  it('no scenario is about combat or missions (not in core-v1)', () => {
    for (const s of scenarios) {
      expect(/combat|battle|mission/i.test(`${s.title} ${s.goal}`), s.id).toBe(false);
      for (const ruleId of s.justificationRuleIds) {
        expect(/^rebellion:(combat|missions)\./.test(ruleId), `${s.id} ${ruleId}`).toBe(false);
      }
    }
  });

  it('every spec is in the file in the same order', () => {
    expect(scenarios.map((s) => s.id)).toEqual(SCENARIO_SPECS.map((s) => s.id));
    for (const s of scenarios) expect(specById.get(s.id)?.side).toBe(s.side);
  });
});

describe('hidden information (TC-H-09, data part)', () => {
  const empire = scenarios.filter((s) => s.side === 'empire');

  it.each(empire.map((s) => [s.id, s] as const))(
    '%s: no base id in the title, goal or matchers',
    (_id, scenario) => {
      const baseId = stateOf(scenario).rebelBase.systemId;
      const visible = JSON.stringify([scenario.title, scenario.goal, scenario.rubric]);
      expect(visible.includes(baseId), `${baseId} named`).toBe(false);
    },
  );

  const hidden = empire.filter((s) => !stateOf(s).rebelBase.revealed);
  it('most Empire scenarios are about the hidden base', () => {
    expect(hidden.length).toBeGreaterThanOrEqual(5);
  });

  it.each(hidden.map((s) => [s.id, s] as const))(
    '%s: the decision point (hence the rubric outcome) does not depend on where the hidden base is',
    (id, scenario) => {
      const state = stateOf(scenario);
      const types = new Map(state.unitTypes.map((t) => [t.typeKey, t]));
      const imperialGroundIn = (systemId: string) =>
        state.units.some((u) => {
          const type = types.get(u.typeKey);
          return (
            u.owner === 'empire' &&
            u.systemId === systemId &&
            !!type &&
            unitTypeRevealsRebelBase(type)
          );
        });
      const original = pointOf(id);
      let relocations = 0;
      for (const to of eligibleRebelBaseSystemIds(coreDataBaseV1)) {
        // A hidden base can never stand with Imperial ground (it would be revealed, DISC-009): skip such targets.
        if (imperialGroundIn(to)) continue;
        const moved = relocateBase(state, to);
        if (moved === null) continue;
        const parsed = CoreGameStateV3Schema.parse(moved) as CoreGameState;
        const point = decisionPointOf({ ...scenario, state: parsed });
        expect(point, `base ${to}`).toEqual(original);
        relocations += 1;
      }
      expect(relocations).toBeGreaterThanOrEqual(3);
    },
  );
});

describe('decisive rubric claims are confirmed by the engine', () => {
  /** Outcome winner after applying the candidate through the automation (origin 'auto'), `null` if the game goes on. */
  function winnerAfter(id: string, candidateId: string): string | null {
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) throw new Error(id);
    const automation = benchModule.automation;
    if (!automation) throw new Error('no automation');
    const result = automation.applyCandidate(
      benchModule.parseState(scenario.state, {
        sessionId: scenario.sessionId,
        version: scenario.version,
      }),
      candidateId,
      { now: '2026-11-20T11:00:00.000Z' },
    );
    if (!result.ok) throw new Error(`${id} ${candidateId}: ${result.error.messageKey}`);
    const state = CoreGameStateV3Schema.parse(result.state) as CoreGameState;
    return state.outcome?.winner ?? null;
  }

  function idsOf(id: string, cls: RubricClass): string[] {
    const scenario = scenarios.find((s) => s.id === id);
    if (!scenario) throw new Error(id);
    return pointOf(id)
      .candidates.filter((c) => classifyCandidate(scenario.rubric, c) === cls)
      .map((c) => c.id);
  }

  it('emp-07: every expected move (ships only included) captures the empty revealed base; FINISH does not', () => {
    const expected = idsOf('emp-07-capture-empty-base', 'expected');
    expect(expected.length).toBeGreaterThanOrEqual(2);
    for (const id of expected) expect(winnerAfter('emp-07-capture-empty-base', id)).toBe('empire');
    for (const id of idsOf('emp-07-capture-empty-base', 'wrong')) {
      expect(winnerAfter('emp-07-capture-empty-base', id)).toBeNull();
    }
  });

  it.each([
    'reb-01-hold-revealed-base',
    'reb-02-keep-last-units-home',
    'reb-06-finish-without-useful-move',
  ])(
    '%s: only the wrong (emptying) move can lose; expected / acceptable keep the game going',
    (id) => {
      const revealed = stateOf(scenarios.find((s) => s.id === id) as BenchScenario).rebelBase
        .revealed;
      for (const c of idsOf(id, 'wrong')) {
        // Revealed base: immediate loss; hidden base: the base is merely empty (lost at the next Imperial search).
        expect(winnerAfter(id, c)).toBe(revealed ? 'empire' : null);
      }
      for (const cls of ['expected', 'acceptable'] as const) {
        for (const c of idsOf(id, cls)) expect(winnerAfter(id, c)).toBeNull();
      }
    },
  );
});

describe('bot reference (informational)', () => {
  it('logs the rubric class of the bot fallback per scenario', () => {
    const line = scenarios
      .map((s) => {
        const point = pointOf(s.id);
        const fallback = point.candidates.find((c) => c.id === point.fallbackCandidateId);
        return `${s.id}=${fallback ? classifyCandidate(s.rubric, fallback) : 'none'}`;
      })
      .join(' ');
    console.log(`[swr008-bench] scenarios=${scenarios.length} bot: ${line}`);
    expect(line.length).toBeGreaterThan(0);
  });
});
