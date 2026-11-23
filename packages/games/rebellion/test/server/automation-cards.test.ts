/**
 * SWR-010 W5 (plan-backend §5.7, §8.2; AC-13, AC-14, AC-18): the server automation and the physical table.
 * - a non-empty table queue → `pendingActor` null, `decisionPoint` throws (no paid call is possible),
 *   `applyCandidate` → 422 `notYourTurn`; the AI resumes after the last confirmation;
 * - a drain stops right after the AI step that created a task (the runner reports `humanTurn`);
 * - the decision point never offers card / table commands (the bot does not use probes, A-11);
 * - the AI decision is invariant to the human's secret cards (S3) and to the deck order (S4).
 */
import type { AutomationDecisionPoint, GameAutomation } from '@bga/platform';
import { describe, expect, it } from 'vitest';
import {
  REBELLION_ERROR_MESSAGE_KEYS as K,
  type CoreGameState,
  type GameEvent,
  type GameState,
} from '../../src/schema';
import { rebellionServerModule } from '../../src/server';
import { NOW } from '../rules/core/helpers';
import {
  confirmAll,
  humanOk,
  physicalGame,
  register,
  registeredRebels,
} from '../rules/core/table-fixtures';
import { toSideView } from '../../src/rules';
import {
  DIG_EMP,
  DIG_REB,
  newGame,
  permuteDeck,
  rounds,
  swapHand,
} from '../rules/core/cards-helpers';
import { drain } from './drain-automation';

const automation = rebellionServerModule.automation as GameAutomation<GameState, GameEvent>;

const CARD_COMMANDS = ['REGISTER_CARD', 'CONFIRM_TABLE_TASK'];

function expectBlocked(state: CoreGameState): void {
  expect((state.table?.tasks.length ?? 0) > 0).toBe(true);
  expect(automation.pendingActor(state)).toBeNull();
  expect(() => automation.decisionPoint(state)).toThrow(/no automated move is pending/);
  const result = automation.applyCandidate(state, 'c-1', { now: NOW });
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error).toEqual({ code: 'ILLEGAL_COMMAND', messageKey: K.notYourTurn });
  }
}

function candidateTypes(point: AutomationDecisionPoint): string[] {
  return point.candidates.map((c) => JSON.stringify(c));
}

describe('a pending table task blocks the AI (AC-13)', () => {
  it('human Empire vs AI Rebels: the initial setup task blocks; confirming it lets the AI move', () => {
    const created = physicalGame('empire');
    expect(created.table?.tasks.map((t) => t.kind)).toEqual(['initialSetup']);
    expectBlocked(created);
    const confirmed = confirmAll(created);
    expect(confirmed.table?.tasks).toEqual([]);
    if (confirmed.activeSide === 'rebels')
      expect(automation.pendingActor(confirmed)).toBe('rebels');
  });

  it('human Rebels vs AI Empire: blocked until the Location card is registered', () => {
    const created = physicalGame('rebels');
    expectBlocked(created);
    const afterSetup = confirmAll(created);
    expect(afterSetup.table?.tasks.map((t) => t.kind)).toEqual(['registerBase']);
    expectBlocked(afterSetup);
    const registered = registeredRebels();
    expect(registered.table?.tasks).toEqual([]);
    expect(registered.table?.baseRegistration).toBeNull();
  });

  it('a drain stops after the AI step that created a task; it resumes after the confirmation', () => {
    let state = confirmAll(physicalGame('empire'));
    let sawTask = false;
    for (let round = 0; round < 6 && state.outcome === null; round += 1) {
      const drained = drain(rebellionServerModule, state, NOW);
      state = drained.state as CoreGameState;
      if ((state.table?.tasks.length ?? 0) > 0) {
        sawTask = true;
        expectBlocked(state);
        // The last automated step created the head task (nothing ran after it).
        if (drained.steps > 0) {
          expect(state.table?.tasks.at(-1)?.createdAtVersion).toBe(state.version);
        }
        state = confirmAll(state);
        continue;
      }
      // Human Empire to move: pass (the Refresh it may trigger creates a task, confirmed above next loop).
      if (state.activeSide === 'empire') {
        const r = rebellionServerModule.applyCommand(
          state,
          { actor: 'empire', expectedVersion: state.version, command: { type: 'PASS' } },
          { now: NOW },
        );
        if (!r.ok) throw new Error(r.error.messageKey);
        state = r.state as CoreGameState;
      }
    }
    expect(sawTask).toBe(true);
  });
});

describe('decision points never carry card / table commands (§8.2, A-11)', () => {
  it('AI Empire and AI Rebels points after Refreshes', () => {
    const empireAi = rounds(newGame(DIG_REB, 'w5-auto-cards'), 2);
    const states = [empireAi, confirmAll(physicalGame('empire')), registeredRebels()];
    let checked = 0;
    for (const state of states) {
      if (automation.pendingActor(state) === null) continue;
      const point = automation.decisionPoint(state);
      for (const c of candidateTypes(point)) {
        for (const type of CARD_COMMANDS) expect(c).not.toContain(type);
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

/** The human passes once when it is its turn, so that the AI side is to move. */
function aiToMove(state: CoreGameState): CoreGameState {
  if (automation.pendingActor(state) !== null) return state;
  const human = state.settings.playerFaction;
  const r = rebellionServerModule.applyCommand(
    state,
    { actor: human, expectedVersion: state.version, command: { type: 'PASS' } },
    { now: NOW },
  );
  if (!r.ok) throw new Error(r.error.messageKey);
  const next = r.state as CoreGameState;
  expect(automation.pendingActor(next)).toBe(state.settings.opponentFaction);
  return next;
}

describe('decision points are invariant to secrets the AI must not see (S3, S4)', () => {
  it('AI Rebels: the human Empire’s probe hand and the deck order do not change the point', () => {
    // Human Empire, AI Rebels, digital: after 2 Refreshes the Empire holds 4 probes.
    const state = aiToMove(rounds(newGame(DIG_EMP, 'w5-s3'), 2));
    const point = automation.decisionPoint(state);
    expect(automation.decisionPoint(swapHand(state))).toEqual(point);
    for (const k of [1, 2, 3])
      expect(automation.decisionPoint(permuteDeck(state, k))).toEqual(point);
  });

  it('AI Empire: the deck order does not change the point (its own hand is in the situation)', () => {
    const state = aiToMove(rounds(newGame(DIG_REB, 'w5-s4'), 2));
    const point = automation.decisionPoint(state);
    expect(point.situation).toContain('Your probe cards');
    for (const k of [1, 2, 3])
      expect(automation.decisionPoint(permuteDeck(state, k))).toEqual(point);
  });
});

describe('S5 (review #6): the registered Location is invisible to the AI Empire before a reveal', () => {
  it('every eligible registration gives a byte-identical Empire view and decision point (no card token of the base)', () => {
    const created = confirmAll(physicalGame('rebels'));
    const eligible = created.table?.baseRegistration?.eligibleSystemIds ?? [];
    expect(eligible).toHaveLength(9);
    const views = new Set<string>();
    const points = new Set<string>();
    for (const systemId of eligible) {
      const registered = humanOk(created, register(systemId)).state;
      expect(registered.rebelBase.systemId).toBe(systemId);
      expect(registered.table?.tasks).toEqual([]);
      // The human Rebels pass → the AI Empire is to move (round 1, before any Refresh or reveal).
      const passed = humanOk(registered, { type: 'PASS' }).state;
      expect(passed.rebelBase.revealed).toBe(false);
      expect(automation.pendingActor(passed)).toBe('empire');
      const view = JSON.stringify(toSideView(passed, 'empire'));
      const point = JSON.stringify(automation.decisionPoint(passed));
      // System ids are public map data; the base's CARD must never be named (`probe-<id>` / `probe-<id>#1`).
      for (const text of [view, point]) {
        expect(text).not.toMatch(new RegExp(`probe-${systemId}(?![A-Za-z0-9-])`));
      }
      views.add(view);
      points.add(point);
    }
    expect(views.size).toBe(1);
    expect(points.size).toBe(1);
  });
});
