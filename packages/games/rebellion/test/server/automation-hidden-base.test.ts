/**
 * SWR-006 W5, plan-backend §9.3 (AC-04, PO test 4): the AI Empire's decision does not depend on where the hidden
 * rebel base is. For states that differ ONLY by the base location (`relocateBase`), before the reveal:
 * premise `toSideView(A, 'empire') ≡ toSideView(B, 'empire')`; then `decisionPoint(A) ≡ decisionPoint(B)` through
 * the server module, the bot's intel / situation are equal, and draining both games with the real bot gives the
 * same sequence of Imperial decision points up to a reveal.
 * SWR-008 W4 (TC-H-02, C-4, QD-7): the points carry `rulesQuery = rulesQueryFor(view)` and the rules-selection
 * input `{actor, phase, commandTypes, tags}` (plan-backend §3.1) is equal for every relocation and every drained
 * point before the reveal.
 */
import {
  RULES_CONTEXT_LIMITS,
  rulesSelectionInputOf,
  type AutomationDecisionPoint,
  type GameAutomation,
  type RulesSelectionInput,
} from '@bga/platform';
import { describe, expect, it } from 'vitest';
import { deriveBaseIntel, rulesQueryFor, situationFor } from '../../src/ai';
import { chooseRebelBase, createCoreGame, toSideView } from '../../src/rules';
import { coreDataBaseV1 } from '../../src/scenario';
import {
  CoreGameStateV3Schema,
  eligibleRebelBaseSystemIds,
  type CoreGameState,
  type Difficulty,
  type GameEvent,
  type GameState,
} from '../../src/schema';
import { rebellionServerModule } from '../../src/server';
import { NOW, REBELS_VS_AI, activate, finish, move, pass, type Step } from './core-script';
import { drain } from './drain-automation';
import { swapLocationCard } from '../ai/fixtures/relocate-base';

const automation = rebellionServerModule.automation as GameAutomation<GameState, GameEvent>;
const ELIGIBLE = eligibleRebelBaseSystemIds(coreDataBaseV1);
/** Eligible bases adjacent to Bothawui (start of the Rebel fleet): the "entered the base" variant. */
const NEAR_BOTHAWUI = ELIGIBLE.filter((id) =>
  coreDataBaseV1.systems.find((s) => s.id === id)?.adjacentSystemIds.includes('bothawui'),
);

function sessionIdWithBase(base: string, prefix: string): string {
  for (let i = 0; i < 10_000; i += 1) {
    const id = `${prefix}-${i}`;
    if (chooseRebelBase(id, ELIGIBLE) === base) return id;
  }
  throw new Error(`no session id for base ${base}`);
}

/**
 * The same game with the base in `to`: every Rebel unit / leader / the Rebel activation in the old base system
 * and every Rebel `SYSTEM_ACTIVATED` / `PIECES_MOVED` reference to it are moved to `to`.
 * SWR-010: the Location card is exchanged with `to`'s deck card at the same position (plan-backend §10.3).
 */
function relocateBase(state: CoreGameState, to: string): CoreGameState {
  const from = state.rebelBase.systemId;
  const withCards = swapLocationCard(state, from, to);
  if (withCards === null) throw new Error(`card of ${to} is not in the deck`);
  const swap = (id: string) => (id === from ? to : id);
  const log = state.log.map((event) => {
    if (event.actor !== 'rebels') return event;
    if (event.type === 'SYSTEM_ACTIVATED') {
      return { ...event, payload: { ...event.payload, systemId: swap(event.payload.systemId) } };
    }
    if (event.type === 'PIECES_MOVED') {
      return {
        ...event,
        payload: {
          ...event.payload,
          fromSystemId: swap(event.payload.fromSystemId),
          toSystemId: swap(event.payload.toSystemId),
        },
      };
    }
    return event;
  });
  return CoreGameStateV3Schema.parse({
    ...withCards,
    rebelBase: { ...state.rebelBase, systemId: to },
    units: state.units.map((u) =>
      u.owner === 'rebels' ? { ...u, systemId: swap(u.systemId) } : u,
    ),
    leaders: state.leaders.map((l) =>
      l.owner === 'rebels' && l.systemId !== null ? { ...l, systemId: swap(l.systemId) } : l,
    ),
    activation:
      state.activation?.side === 'rebels'
        ? { ...state.activation, systemId: swap(state.activation.systemId) }
        : state.activation,
    log,
  });
}

/** Player Rebels vs AI Empire, the scripted Rebel steps applied: the AI Empire to move. */
function empireToMove(sessionId: string, difficulty: Difficulty, steps: readonly Step[]) {
  let state = createCoreGame({ ...REBELS_VS_AI, aiDifficulty: difficulty }, coreDataBaseV1, {
    gameId: sessionId,
    now: NOW,
  });
  for (const step of steps) {
    const result = rebellionServerModule.applyCommand(
      state,
      { actor: step.actor, expectedVersion: state.version, command: step.command },
      { now: NOW },
    );
    if (!result.ok) throw new Error(`${step.command.type} rejected: ${result.error.messageKey}`);
    state = CoreGameStateV3Schema.parse(result.state);
  }
  expect(automation.pendingActor(state)).toBe('empire');
  return state;
}

/** Imperial decision points of one drain up to (and including) the last one taken before a reveal. */
function pointsBeforeReveal(state: CoreGameState): AutomationDecisionPoint[] {
  const points: AutomationDecisionPoint[] = [];
  let revealed = false;
  drain(rebellionServerModule, state, NOW, {
    onPoint(point, current) {
      if (current.rulesEngine === 'core-v1' && current.rebelBase.revealed) revealed = true;
      if (!revealed) points.push(point);
    },
  });
  return points;
}

/** SWR-008 §3.1: the rules-selection input of a point, built exactly as the server builds it. */
function selectionInputOf(point: AutomationDecisionPoint): RulesSelectionInput {
  if (point.rulesQuery === undefined)
    throw new Error('the Rebellion point always carries rulesQuery');
  return rulesSelectionInputOf(point, RULES_CONTEXT_LIMITS.maxCharsDefault);
}

function expectInvariant(a: CoreGameState, others: readonly string[]): void {
  const viewA = toSideView(a, 'empire');
  const pointA = automation.decisionPoint(a);
  expect(pointA).toMatchObject({ rulesQuery: rulesQueryFor(viewA) });
  const inputA = selectionInputOf(pointA);
  const intelA = deriveBaseIntel(viewA);
  const situationA = situationFor(viewA, intelA);
  const drainedA = pointsBeforeReveal(a);
  expect(drainedA.length).toBeGreaterThan(0);
  for (const to of others) {
    const b = relocateBase(a, to);
    expect(b.rebelBase.systemId).toBe(to);
    const viewB = toSideView(b, 'empire');
    // Premise: the Empire cannot tell the two games apart.
    expect(viewB, to).toEqual(viewA);
    const pointB = automation.decisionPoint(b);
    expect(pointB, to).toEqual(pointA);
    expect(selectionInputOf(pointB), to).toEqual(inputA);
    expect(deriveBaseIntel(viewB), to).toEqual(intelA);
    expect(situationFor(viewB, deriveBaseIntel(viewB)), to).toBe(situationA);
    const drainedB = pointsBeforeReveal(b);
    const n = Math.min(drainedA.length, drainedB.length);
    expect(n, to).toBeGreaterThan(0);
    expect(drainedB.slice(0, n), to).toEqual(drainedA.slice(0, n));
    expect(drainedB.slice(0, n).map(selectionInputOf), to).toEqual(
      drainedA.slice(0, n).map(selectionInputOf),
    );
  }
}

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

describe('AI Empire decisions are invariant to the hidden base (§9.3, AC-04)', () => {
  it('9 eligible bases; Bothawui neighbours exist for the "entered the base" variant', () => {
    expect(ELIGIBLE).toHaveLength(9);
    expect(NEAR_BOTHAWUI.length).toBeGreaterThanOrEqual(2);
  });

  it.each(DIFFICULTIES)(
    '%s: the Rebels did not touch the base (pass / public activation) — every base gives the same decisions',
    (difficulty) => {
      const scripts: Step[][] = [
        [pass('rebels')],
        [activate('rebels', 'leia', 'toydaria'), finish('rebels')],
      ];
      for (const [i, steps] of scripts.entries()) {
        for (const seed of ['hb-a', 'hb-b']) {
          const a = empireToMove(`${seed}-${difficulty}-${i}`, difficulty, steps);
          expect(a.rebelBase.revealed).toBe(false);
          expectInvariant(
            a,
            ELIGIBLE.filter((id) => id !== a.rebelBase.systemId),
          );
        }
      }
    },
  );

  it.each(DIFFICULTIES)(
    '%s: the Rebels activated the base and moved in from Bothawui (adjacent to both bases of the pair)',
    (difficulty) => {
      for (const base of NEAR_BOTHAWUI) {
        const sessionId = sessionIdWithBase(base, `hb-in-${difficulty}`);
        const a = empireToMove(sessionId, difficulty, [
          activate('rebels', 'leia', base),
          move('rebels', ['u-03'], 'bothawui', base),
          finish('rebels'),
        ]);
        expect(a.rebelBase).toEqual({ systemId: base, revealed: false });
        expect(a.units.find((u) => u.id === 'u-03')?.systemId).toBe(base);
        expectInvariant(
          a,
          NEAR_BOTHAWUI.filter((id) => id !== base),
        );
      }
    },
  );
});
