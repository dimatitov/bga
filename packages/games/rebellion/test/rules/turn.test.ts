/** SWR-004 hot-seat (TC-U-16..TC-U-25, AC-14): END_TURN / ACCEPT_HANDOFF, check order, handoff view. */
import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  getLegalActions,
  toPlayerEvents,
  toPlayerView,
  toSideView,
} from '../../src/rules';
import {
  HandoffViewSchema,
  PlayerViewSchema,
  UNKNOWN_TYPE_KEY,
  type CommandEnvelope,
  type Faction,
  type MockGameState,
} from '../../src/schema';
import {
  ACCEPT,
  ADVANCE,
  APPLY_CTX,
  END_TURN,
  EMPIRE_VS_AI,
  REBELS_VS_HUMAN,
  REBELLION_VS_AI,
  adjacent,
  clone,
  deepFreeze,
  env,
  hiddenPieceOf,
  move,
  mulberry32,
  newGame,
} from './helpers';

const HANDOFF_KEYS = [
  'activeSide',
  'id',
  'kind',
  'phase',
  'round',
  'rulesEngine',
  'sessionStatus',
  'version',
];

function ok(state: MockGameState, envelope: CommandEnvelope) {
  const result = applyCommand(state, envelope, APPLY_CTX);
  if (!result.ok) throw new Error(`rejected: ${result.error.messageKey}`);
  return result;
}

function rejectedWith(state: MockGameState, envelope: unknown, messageKey: string) {
  const snapshot = clone(state);
  const result = applyCommand(state, envelope, APPLY_CTX);
  expect(result).toEqual({
    ok: false,
    error: {
      code: 'ILLEGAL_COMMAND',
      messageKey,
      details: { actor: (envelope as CommandEnvelope).actor },
    },
  });
  expect(state).toEqual(snapshot);
}

/** Human game after the rebels passed the turn: empire active, handoff pending. */
function pendingForEmpire(): MockGameState {
  const s0 = newGame(REBELS_VS_HUMAN);
  return deepFreeze(ok(s0, env(s0, END_TURN)).state);
}

/** Some own piece move that is legal for the active side. */
function someMove(state: MockGameState, side: Faction) {
  const p = state.pieces.find((x) => x.owner === side)!;
  return move([p.id], p.systemId, adjacent(state, p.systemId)[0]!);
}

describe('hot-seat: AI game (TC-U-16)', () => {
  for (const setup of [EMPIRE_VS_AI, REBELLION_VS_AI]) {
    it(`${setup.playerFaction} vs AI: active = player, no handoff; END_TURN / ACCEPT_HANDOFF → handoffNotAvailable`, () => {
      const state = deepFreeze(newGame(setup));
      expect([state.activeSide, state.handoffPending]).toEqual([setup.playerFaction, false]);
      rejectedWith(state, env(state, END_TURN), 'errors.handoffNotAvailable');
      rejectedWith(state, env(state, ACCEPT), 'errors.handoffNotAvailable');
      // The AI side is not a participant at all (Q-11) — notYourSide comes first.
      rejectedWith(
        state,
        env(state, END_TURN, { actor: setup.opponentFaction }),
        'errors.notYourSide',
      );
      rejectedWith(
        state,
        env(state, ADVANCE, { actor: setup.opponentFaction }),
        'errors.notYourSide',
      );
    });
  }

  it('AI game: legal actions never contain END_TURN; the view is always the player board', () => {
    const state = newGame(REBELLION_VS_AI);
    expect(getLegalActions(state, 'rebels').some((a) => a.type === 'END_TURN')).toBe(false);
    expect(toPlayerView(state, 'prototype')).toMatchObject({ kind: 'player', viewer: 'rebels' });
  });
});

describe('hot-seat: human game (TC-U-17..TC-U-23)', () => {
  it('TC-U-18: END_TURN by the active side → other side active, handoff pending, version+1, TURN_ENDED; phase/round unchanged', () => {
    const s0 = deepFreeze(newGame(REBELS_VS_HUMAN));
    const r = ok(s0, env(s0, END_TURN));
    expect(r.state).toMatchObject({
      activeSide: 'empire',
      handoffPending: true,
      version: s0.version + 1,
      round: s0.round,
      phase: s0.phase,
    });
    expect(r.events).toEqual([
      {
        seq: 2,
        type: 'TURN_ENDED',
        actor: 'rebels',
        payload: { toSide: 'empire' },
        at: APPLY_CTX.now,
      },
    ]);
    expect(r.state.log).toEqual([...s0.log, ...r.events]);
    expect(r.state.pieces).toEqual(s0.pieces);
    // The response to END_TURN carries no events (AC-14).
    expect(toPlayerEvents(r.events, r.state)).toEqual([]);
  });

  it('TC-U-19: while the handoff is pending only ACCEPT_HANDOFF is accepted', () => {
    const state = pendingForEmpire();
    rejectedWith(state, env(state, someMove(state, 'empire')), 'errors.handoffPending');
    rejectedWith(state, env(state, ADVANCE), 'errors.handoffPending');
    rejectedWith(state, env(state, END_TURN), 'errors.handoffPending');
    expect(applyCommand(state, env(state, ACCEPT), APPLY_CTX).ok).toBe(true);
  });

  it('TC-U-20: ACCEPT_HANDOFF by the side that just passed → notYourTurn; state unchanged', () => {
    const state = pendingForEmpire();
    rejectedWith(state, env(state, ACCEPT, { actor: 'rebels' }), 'errors.notYourTurn');
    rejectedWith(state, env(state, ADVANCE, { actor: 'rebels' }), 'errors.notYourTurn');
  });

  it('version is checked before the side (409 before 422)', () => {
    const state = pendingForEmpire();
    const result = applyCommand(
      state,
      env(state, ACCEPT, { actor: 'rebels', expectedVersion: 1 }),
      APPLY_CTX,
    );
    expect(result).toMatchObject({ ok: false, error: { code: 'VERSION_CONFLICT' } });
  });

  it('TC-U-21: ACCEPT_HANDOFF by the new active side → handoff cleared, HANDOFF_ACCEPTED; legal actions only for its pieces', () => {
    const state = pendingForEmpire();
    const r = ok(state, env(state, ACCEPT));
    expect(r.state).toMatchObject({
      activeSide: 'empire',
      handoffPending: false,
      version: state.version + 1,
    });
    expect(r.events).toEqual([
      { seq: 3, type: 'HANDOFF_ACCEPTED', actor: 'empire', payload: {}, at: APPLY_CTX.now },
    ]);
    expect(toPlayerEvents(r.events, r.state)).toEqual(r.events);
    const actions = getLegalActions(r.state, 'empire');
    const empirePieces = r.state.pieces.filter((p) => p.owner === 'empire').map((p) => p.id);
    expect(actions.flatMap((a) => (a.type === 'MOVE_PIECES' ? [a.pieceId] : [])).sort()).toEqual(
      empirePieces.sort(),
    );
    expect(actions.slice(-2)).toEqual([{ type: 'ADVANCE_PHASE' }, { type: 'END_TURN' }]);
    expect(getLegalActions(r.state, 'rebels')).toEqual([]);
    // ACCEPT_HANDOFF with nothing pending → handoffNotAvailable.
    rejectedWith(deepFreeze(r.state), env(r.state, ACCEPT), 'errors.handoffNotAvailable');
  });

  it('TC-U-22: no handoff, rebels active — the empire may not act (notYourTurn)', () => {
    const state = deepFreeze(newGame(REBELS_VS_HUMAN));
    rejectedWith(
      state,
      env(state, someMove(state, 'empire'), { actor: 'empire' }),
      'errors.notYourTurn',
    );
    rejectedWith(state, env(state, END_TURN, { actor: 'empire' }), 'errors.notYourTurn');
    expect(getLegalActions(state, 'empire')).toEqual([]);
  });

  it('TC-U-23: REB END_TURN → EMP ACCEPT → EMP END_TURN → REB ACCEPT returns to rebels; phase/round untouched', () => {
    let state = deepFreeze(newGame(REBELS_VS_HUMAN));
    const start = state;
    for (const _ of [1, 2]) {
      state = deepFreeze(ok(state, env(state, END_TURN)).state);
      state = deepFreeze(ok(state, env(state, ACCEPT)).state);
    }
    expect(state).toMatchObject({
      activeSide: 'rebels',
      handoffPending: false,
      version: start.version + 4,
      round: start.round,
      phase: start.phase,
    });
    expect(state.log.map((e) => [e.type, e.actor])).toEqual([
      ['GAME_CREATED', 'system'],
      ['TURN_ENDED', 'rebels'],
      ['HANDOFF_ACCEPTED', 'empire'],
      ['TURN_ENDED', 'empire'],
      ['HANDOFF_ACCEPTED', 'rebels'],
    ]);
  });

  it('a human-game side may still advance the phase and move on its own turn', () => {
    const state = deepFreeze(newGame(REBELS_VS_HUMAN));
    expect(ok(state, env(state, ADVANCE)).state.phase).toBe('command');
    expect(ok(state, env(state, someMove(state, 'rebels'))).state.version).toBe(2);
  });
});

describe('hot-seat views (TC-U-24, TC-U-25)', () => {
  it('TC-U-24: handoff pending → only {kind, rulesEngine, id, version, activeSide, round, phase, sessionStatus}', () => {
    const state = pendingForEmpire();
    for (const status of ['setup', 'prototype', 'active', 'completed'] as const) {
      const view = toPlayerView(state, status);
      expect(Object.keys(view).sort()).toEqual(HANDOFF_KEYS);
      expect(HandoffViewSchema.parse(view)).toEqual({
        kind: 'handoff',
        rulesEngine: 'mock-v1',
        id: state.id,
        version: state.version,
        activeSide: 'empire',
        round: state.round,
        phase: state.phase,
        sessionStatus: status,
      });
    }
    const json = JSON.stringify(toPlayerView(state, 'prototype'));
    for (const s of state.systems) expect(json).not.toContain(s.id);
    for (const p of state.pieces) expect(json).not.toContain(p.id);
  });

  it('TC-U-25: no handoff → the board of the active side; for the Empire the rebel secrets are masked', () => {
    const s0 = newGame(REBELS_VS_HUMAN);
    const hidden = hiddenPieceOf(s0, 'rebels');
    const rebelsView = toPlayerView(s0, 'prototype');
    expect(rebelsView).toMatchObject({ kind: 'player', viewer: 'rebels', activeSide: 'rebels' });

    const pending = ok(s0, env(s0, END_TURN)).state;
    const state = ok(pending, env(pending, ACCEPT)).state;
    const view = toPlayerView(state, 'prototype');
    if (view.kind !== 'player') throw new Error('expected the board');
    expect(view).toEqual(toSideView(state, 'empire'));
    expect(view.viewer).toBe('empire');
    expect(view.rebelBase.systemId).toBeNull();
    expect(view.pieces.find((p) => p.id === hidden.id)?.typeKey).toBe(UNKNOWN_TYPE_KEY);
    expect(JSON.stringify(view)).not.toContain(hidden.typeKey);
  });

  it('property: random hot-seat sequences — handoff view has exactly 7 keys; otherwise viewer = activeSide and secrets stay hidden', () => {
    const rand = mulberry32(20261108);
    let state = deepFreeze(newGame(REBELS_VS_HUMAN));
    const hiddenRebel = hiddenPieceOf(state, 'rebels');
    const baseId = state.rebelBase.systemId!;
    let handoffs = 0;
    let empireBoards = 0;

    for (let step = 0; step < 400; step += 1) {
      const actor: Faction =
        rand() < 0.15 ? (state.activeSide === 'rebels' ? 'empire' : 'rebels') : state.activeSide;
      let command: CommandEnvelope['command'];
      if (state.handoffPending) {
        command = rand() < 0.7 ? ACCEPT : pickOne(rand, [ADVANCE, END_TURN]);
      } else {
        const legal = getLegalActions(state, state.activeSide);
        const action = legal[Math.floor(rand() * legal.length)]!;
        if (action.type === 'MOVE_PIECES') {
          const from = state.pieces.find((p) => p.id === action.pieceId)!.systemId;
          command = move([action.pieceId], from, pickOne(rand, action.toSystemIds));
        } else {
          command = action.type === 'END_TURN' ? END_TURN : ADVANCE;
        }
      }
      const result = applyCommand(state, env(state, command, { actor }), APPLY_CTX);
      if (result.ok) {
        expect(actor).toBe(state.activeSide);
        state = deepFreeze(result.state);
        if (state.handoffPending) expect(toPlayerEvents(result.events, state)).toEqual([]);
      }

      const view = PlayerViewSchema.parse(toPlayerView(state, 'prototype'));
      if (state.handoffPending) {
        handoffs += 1;
        expect(Object.keys(view).sort()).toEqual(HANDOFF_KEYS);
        expect(view).toMatchObject({ kind: 'handoff', activeSide: state.activeSide });
      } else {
        if (view.kind !== 'player' || view.rulesEngine !== 'mock-v1')
          throw new Error('expected the board');
        expect(view.viewer).toBe(state.activeSide);
        if (view.viewer === 'empire') {
          empireBoards += 1;
          expect(view.rebelBase.systemId).toBeNull();
          const json = JSON.stringify(view);
          expect(json).not.toContain(hiddenRebel.typeKey);
          expect(view.pieces.find((p) => p.id === hiddenRebel.id)?.typeKey).toBe(UNKNOWN_TYPE_KEY);
        } else {
          expect(view.rebelBase.systemId).toBe(baseId);
        }
      }
    }
    expect(handoffs).toBeGreaterThan(10);
    expect(empireBoards).toBeGreaterThan(10);
  });
});

function pickOne<T>(rand: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) throw new Error('pick from empty list');
  return item;
}
