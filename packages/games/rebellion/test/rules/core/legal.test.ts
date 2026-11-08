/**
 * Legal actions ⇔ accepted commands (TC-U-31, TC-U-54; plan-backend §7 W3 `legal.test.ts`): everything
 * listed is accepted, commands outside the list are rejected — on hand-built and on seeded random states.
 */
import { describe, expect, it } from 'vitest';
import {
  CoreLegalActionSchema,
  type Command,
  type CoreGameState,
  type Faction,
} from '../../../src/schema';
import { getLegalActions } from '../../../src/rules';
import { SYSTEM_IDS, T } from './fixtures/mini-data';
import {
  ACCEPT,
  EMPIRE_VS_AI,
  FINISH,
  HOT_SEAT,
  PASS,
  REBELS_VS_AI,
  activate,
  mulberry32,
  mv,
  newCore,
  originFor,
  randomStep,
  scenario,
  tryApply,
} from './helpers';

function accepted(state: CoreGameState, actor: Faction, command: Command): boolean {
  return tryApply(state, actor, command, { origin: originFor(state, actor) }).ok;
}

describe('legal actions during an activation (TC-U-54)', () => {
  it('one MOVE_PIECES per adjacent source without an own leader with movable units, + FINISH_ACTIVATION', () => {
    // Activation in delta (adjacent beta, gamma, zeta).
    const state = scenario({
      base: 'eta',
      units: [
        [T.XW, 'beta'], // u-01 → listed
        [T.RT, 'beta'], // u-02 needs transport, no carrier in beta → not listed
        [T.CC, 'gamma'], // u-03 carrier
        [T.RT, 'gamma'], // u-04 listed (carrier present)
        [T.SG, 'gamma'], // u-05 immobile → not listed
        [T.TR, 'zeta'], // u-06 pinned by Dodonna → system not listed
        [T.XW, 'alpha'], // u-07 not adjacent
        [T.SD, 'beta'], // u-08 Empire
        [T.RT, 'delta'], // u-09 already in the activated system
      ],
      leadersAt: { dodonna: 'zeta' },
      activation: { leaderId: 'leia', systemId: 'delta' },
    });
    expect(getLegalActions(state, 'rebels')).toEqual([
      {
        type: 'MOVE_PIECES',
        fromSystemId: 'beta',
        toSystemId: 'delta',
        pieces: [{ pieceId: 'u-01', transportCapacity: 0, requiresTransport: false }],
      },
      {
        type: 'MOVE_PIECES',
        fromSystemId: 'gamma',
        toSystemId: 'delta',
        pieces: [
          { pieceId: 'u-03', transportCapacity: 2, requiresTransport: false },
          { pieceId: 'u-04', transportCapacity: 0, requiresTransport: true },
        ],
      },
      { type: 'FINISH_ACTIVATION' },
    ]);
    expect(getLegalActions(state, 'empire')).toEqual([]);
  });

  it('only FINISH_ACTIVATION when nothing can move', () => {
    const state = scenario({
      base: 'eta',
      units: [[T.RT, 'beta']],
      activation: { leaderId: 'leia', systemId: 'delta' },
    });
    expect(getLegalActions(state, 'rebels')).toEqual([{ type: 'FINISH_ACTIVATION' }]);
  });

  it('nothing while a handoff is pending, for the passive side, outside the command phase', () => {
    expect(
      getLegalActions(scenario({ activeSide: 'empire', handoffPending: true }), 'empire'),
    ).toEqual([]);
    expect(getLegalActions(scenario(), 'empire')).toEqual([]);
    expect(getLegalActions({ ...scenario(), phase: 'assignment' }, 'rebels')).toEqual([]);
  });
});

/** Check "listed ⇒ accepted" and "not listed ⇒ rejected" exhaustively-ish for the active side. */
function checkLegalEquivalence(state: CoreGameState, rng: () => number): number {
  let checks = 0;
  const side = state.activeSide;
  const other: Faction = side === 'rebels' ? 'empire' : 'rebels';
  const actions = getLegalActions(state, side);
  for (const action of actions) CoreLegalActionSchema.parse(action);
  expect(getLegalActions(state, other)).toEqual([]);
  if (state.handoffPending) {
    expect(actions).toEqual([]);
    return 0;
  }
  const types = actions.map((a) => a.type);

  // Listed ⇒ accepted.
  for (const action of actions) {
    switch (action.type) {
      case 'ACTIVATE_SYSTEM':
        expect(action.systemIds).toEqual([...SYSTEM_IDS]);
        expect(action.leaderIds.length).toBeGreaterThan(0);
        for (const leaderId of action.leaderIds) {
          for (const systemId of [SYSTEM_IDS[Math.floor(rng() * SYSTEM_IDS.length)]!, 'theta']) {
            expect(accepted(state, side, activate(leaderId, systemId))).toBe(true);
            checks += 1;
          }
        }
        break;
      case 'MOVE_PIECES': {
        const ships = action.pieces.filter((p) => !p.requiresTransport);
        for (const p of ships) {
          expect(
            accepted(state, side, mv([p.pieceId], action.fromSystemId, action.toSystemId)),
          ).toBe(true);
          checks += 1;
        }
        for (let i = 0; i < 4; i += 1) {
          const subset = action.pieces.filter(() => rng() < 0.5);
          if (subset.length === 0) continue;
          const required = subset.filter((p) => p.requiresTransport).length;
          const available = subset
            .filter((p) => !p.requiresTransport)
            .reduce((n, p) => n + p.transportCapacity, 0);
          const command = mv(
            subset.map((p) => p.pieceId),
            action.fromSystemId,
            action.toSystemId,
          );
          expect(accepted(state, side, command)).toBe(required <= available);
          checks += 1;
        }
        break;
      }
      case 'FINISH_ACTIVATION':
        expect(accepted(state, side, FINISH)).toBe(true);
        checks += 1;
        break;
      case 'PASS':
        expect(accepted(state, side, PASS)).toBe(true);
        checks += 1;
        break;
      default: {
        const unreachable: never = action;
        throw new Error(String(unreachable));
      }
    }
  }

  // Not listed ⇒ rejected.
  if (!types.includes('PASS')) expect(accepted(state, side, PASS)).toBe(false);
  if (!types.includes('FINISH_ACTIVATION')) expect(accepted(state, side, FINISH)).toBe(false);
  expect(accepted(state, side, ACCEPT)).toBe(false);
  const listedLeaders = new Set(
    actions.flatMap((a) => (a.type === 'ACTIVATE_SYSTEM' ? a.leaderIds : [])),
  );
  for (const leader of state.leaders) {
    if (!listedLeaders.has(leader.id)) {
      expect(accepted(state, side, activate(leader.id, 'alpha'))).toBe(false);
      checks += 1;
    }
  }
  const listedPieces = new Map(
    actions.flatMap((a) =>
      a.type === 'MOVE_PIECES' ? a.pieces.map((p) => [p.pieceId, a] as const) : [],
    ),
  );
  for (const unit of state.units) {
    const listed = listedPieces.get(unit.id);
    for (const toSystemId of SYSTEM_IDS) {
      if (listed && listed.toSystemId === toSystemId && listed.fromSystemId === unit.systemId)
        continue;
      expect(accepted(state, side, mv([unit.id], unit.systemId, toSystemId))).toBe(false);
      checks += 1;
    }
  }
  // Every command of the passive side is rejected.
  for (const command of [PASS, FINISH, activate('leia', 'alpha'), activate('vader', 'alpha')]) {
    expect(tryApply(state, other, command).ok).toBe(false);
  }
  return checks;
}

describe('legal actions ⇔ accepted commands on seeded random games', () => {
  for (const [name, settings] of [
    ['hot-seat', HOT_SEAT],
    ['Rebels vs AI', REBELS_VS_AI],
    ['Empire vs AI', EMPIRE_VS_AI],
  ] as const) {
    it(`${name}: 6 games × 60 steps`, () => {
      let checks = 0;
      for (let seed = 1; seed <= 6; seed += 1) {
        const rng = mulberry32(seed * 7919);
        let state = newCore(settings, `legal-${name}-${seed}`);
        for (let step = 0; step < 60 && state.outcome === null; step += 1) {
          checks += checkLegalEquivalence(state, rng);
          state = randomStep(state, rng).state;
        }
      }
      expect(checks).toBeGreaterThan(500);
    });
  }
});
