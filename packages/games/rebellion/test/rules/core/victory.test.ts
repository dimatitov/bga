/** R-9 victories and the end of the game (TC-U-60, TC-U-62..TC-U-67, TC-U-69). Base = zeta. */
import { describe, expect, it } from 'vitest';
import {
  REBELLION_ERROR_MESSAGE_KEYS as K,
  type Command,
  type CoreGameState,
} from '../../../src/schema';
import { getLegalActions, toPlayerView, toSideView } from '../../../src/rules';
import { T, type TypeKey } from './fixtures/mini-data';
import {
  ACCEPT,
  ADVANCE,
  END_TURN,
  EMPIRE_VS_AI,
  FINISH,
  PASS,
  REBELS_VS_AI,
  activate,
  mv,
  ok,
  play,
  rejected,
  scenario,
  tryApply,
} from './helpers';

function expectOver(state: CoreGameState, winner: 'rebels' | 'empire') {
  expect(state.outcome?.winner).toBe(winner);
  expect(state.activation).toBeNull();
  expect(state.handoffPending).toBe(false);
  expect(getLegalActions(state, 'rebels')).toEqual([]);
  expect(getLegalActions(state, 'empire')).toEqual([]);
}

describe('Empire victory (rebel base captured)', () => {
  it('reveal with no Rebel unit in the base → BASE_REVEALED then GAME_OVER in one response (TC-U-60, Q-41)', () => {
    const state = scenario({
      base: 'zeta',
      units: [
        [T.AC, 'delta'],
        [T.ST, 'delta'],
        [T.XW, 'theta'],
      ],
      activeSide: 'empire',
    });
    const moved = play(state, [
      ['empire', activate('vader', 'zeta')],
      ['empire', mv(['u-01', 'u-02'], 'delta', 'zeta')],
    ]);
    expect(moved.outcome).toBeNull(); // not revealed yet → no victory after the move
    const { state: over, events } = ok(moved, 'empire', FINISH);
    expect(events.map((e) => [e.type, e.payload])).toEqual([
      ['ACTIVATION_FINISHED', { auto: false }],
      ['BASE_REVEALED', { systemId: 'zeta' }],
      ['GAME_OVER', { winner: 'empire', reason: 'rebelBaseCaptured' }],
    ]);
    expect(over.outcome).toEqual({ winner: 'empire', reason: 'rebelBaseCaptured' });
    expect(over.activeSide).toBe('empire');
    expectOver(over, 'empire');
  });

  it('any remaining Rebel unit (ship, structure, ground) prevents it (TC-U-62)', () => {
    for (const last of [T.XW, T.SG, T.RT] as TypeKey[]) {
      const state = scenario({
        base: 'zeta',
        revealed: true,
        units: [
          [T.ST, 'zeta'],
          [last, 'zeta'],
          [T.SD, 'delta'],
        ],
        activeSide: 'empire',
        activation: { leaderId: 'vader', systemId: 'zeta' },
      });
      expect(ok(state, 'empire', mv(['u-03'], 'delta', 'zeta')).state.outcome).toBeNull();
    }
  });

  it('checked after a Rebel move: the last Rebel units leave the revealed base (TC-U-63, Q-12)', () => {
    const state = scenario({
      base: 'zeta',
      revealed: true,
      units: [
        [T.ST, 'zeta'],
        [T.XW, 'zeta'],
      ],
      activation: { leaderId: 'leia', systemId: 'delta' },
    });
    const { state: over, events } = ok(state, 'rebels', mv(['u-02'], 'zeta', 'delta'));
    expect(events.map((e) => e.type)).toEqual(['PIECES_MOVED', 'GAME_OVER']);
    expect(over.outcome).toEqual({ winner: 'empire', reason: 'rebelBaseCaptured' });
    expect(over.activeSide).toBe('rebels');
    expectOver(over, 'empire');
    // the activating leader stays on the map; nothing else changes
    expect(over.leaders.find((l) => l.id === 'leia')?.systemId).toBe('delta');
  });

  it('any Imperial unit suffices — a lone ship (TC-U-64); none at all → no victory (TC-U-64a)', () => {
    const empty = scenario({
      base: 'zeta',
      revealed: true,
      units: [
        [T.SD, 'delta'],
        [T.XW, 'beta'],
      ],
      activeSide: 'empire',
      activation: { leaderId: 'vader', systemId: 'zeta' },
    });
    expect(ok(empty, 'empire', mv(['u-01'], 'delta', 'zeta')).state.outcome).toEqual({
      winner: 'empire',
      reason: 'rebelBaseCaptured',
    });
    const elsewhere = scenario({
      base: 'zeta',
      revealed: true,
      units: [
        [T.SD, 'gamma'],
        [T.XW, 'beta'],
      ],
      activeSide: 'empire',
      activation: { leaderId: 'vader', systemId: 'delta' },
    });
    expect(ok(elsewhere, 'empire', mv(['u-01'], 'gamma', 'delta')).state.outcome).toBeNull();
  });
});

describe('Rebel victory (time reaches reputation)', () => {
  it('round 13 → 14 = reputation: TIME_ADVANCED then GAME_OVER, phase refresh, no new round (TC-U-65)', () => {
    const state = scenario({ round: 13, activeSide: 'empire', passed: { rebels: true } });
    const { state: over, events } = ok(state, 'empire', PASS);
    expect(events.map((e) => [e.type, e.payload])).toEqual([
      ['PASSED', { auto: false }],
      ['PHASE_STARTED', { round: 13, phase: 'refresh' }],
      ['LEADERS_RETURNED', { leaderIds: [] }],
      ['TIME_ADVANCED', { from: 13, to: 14 }],
      ['GAME_OVER', { winner: 'rebels', reason: 'timeReachedReputation' }],
    ]);
    expect(over).toMatchObject({
      round: 14,
      phase: 'refresh',
      activeSide: 'empire',
      outcome: { winner: 'rebels', reason: 'timeReachedReputation' },
    });
    expectOver(over, 'rebels');
  });

  it('round 12 → 13: the game goes on (TC-U-66)', () => {
    const state = scenario({ round: 12, activeSide: 'empire', passed: { rebels: true } });
    expect(ok(state, 'empire', PASS).state).toMatchObject({
      round: 13,
      outcome: null,
      phase: 'command',
    });
  });
});

describe('after the end of the game', () => {
  const COMMANDS: Command[] = [
    activate('leia', 'alpha'),
    mv(['u-01'], 'delta', 'zeta'),
    FINISH,
    PASS,
    ACCEPT,
    ADVANCE,
    END_TURN,
  ];

  it('every command of either side → gameOver {actor}, before 409; schema errors stay 400 (TC-U-67)', () => {
    const over = scenario({ round: 13, activeSide: 'empire', passed: { rebels: true } });
    const finished = ok(over, 'empire', PASS).state;
    for (const actor of ['rebels', 'empire'] as const) {
      for (const command of COMMANDS) {
        for (const expectedVersion of [finished.version, 1]) {
          expect(
            rejected(finished, actor, command, K.gameOver, { expectedVersion }).details,
          ).toEqual({
            actor,
          });
        }
      }
    }
    const invalid = tryApply(finished, 'rebels', { type: 'PASS', x: 1 });
    expect(invalid.ok ? null : invalid.error.code).toBe('VALIDATION');
  });

  it('no handoff and the base is visible to the Empire on the final screen, both reasons (TC-U-69, Q-14)', () => {
    // Rebels win by time in a hot-seat game: the last pass by the Rebels.
    // Before that the Rebels activated their (hidden) base.
    const byTime = play(scenario({ base: 'zeta', round: 13, passed: { empire: true } }), [
      ['rebels', activate('leia', 'zeta')],
      ['rebels', FINISH],
      ['rebels', PASS],
    ]);
    // Empire wins on a Rebel move.
    const byCapture = ok(
      scenario({
        base: 'zeta',
        revealed: true,
        units: [
          [T.ST, 'zeta'],
          [T.XW, 'zeta'],
        ],
        activation: { leaderId: 'leia', systemId: 'delta' },
      }),
      'rebels',
      mv(['u-02'], 'zeta', 'delta'),
    ).state;
    for (const over of [byTime, byCapture]) {
      expect(over.handoffPending).toBe(false);
      const empireView = toSideView(over, 'empire');
      expect(empireView.rebelBase.systemId).toBe(over.rebelBase.systemId);
      expect(empireView.units.every((u) => u.location.kind === 'system')).toBe(true);
      expect(toPlayerView(over, 'completed').kind).toBe('player');
    }
    // An unrevealed base becomes visible at the end of the game (time victory before any reveal).
    expect(byTime.rebelBase.revealed).toBe(false);
    expect(
      toSideView(byTime, 'empire').log.find((e) => e.type === 'SYSTEM_ACTIVATED')?.payload,
    ).toEqual({
      leaderId: 'leia',
      systemId: 'zeta',
    });
  });

  it('AI game: the game may end on the AI turn; no handoff, legal actions empty for both', () => {
    const aiTurn = scenario({
      settings: REBELS_VS_AI,
      round: 13,
      parse: false,
      activeSide: 'empire',
      passed: { rebels: true },
    });
    const over = ok(aiTurn, 'empire', PASS, { origin: 'auto' }).state;
    expectOver(over, 'rebels');
    const aiRebels = scenario({
      settings: EMPIRE_VS_AI,
      round: 13,
      parse: false,
      activeSide: 'rebels',
      passed: { empire: true },
    });
    expectOver(ok(aiRebels, 'rebels', PASS, { origin: 'auto' }).state, 'rebels');
  });
});
