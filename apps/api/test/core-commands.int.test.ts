/**
 * SWR-005 W6b — every `core-v1` rejection through HTTP (AC-03, AC-04, AC-05, AC-09; plan-backend §3.3, §7 W6b):
 * each key → its status/code/messageKey/details, and the stored row + event rows are unchanged (version too).
 * Real Nest app, real base-game data; fixed session ids (base = Rodia, read back from the row).
 * `gameOver` is covered in `core-victory.int.test.ts`; `wrongPhase` is unreachable in a stored state (Q-6) —
 * a stored running state outside the command phase fails the schema → 500, nothing written (last test).
 */
import type { INestApplication } from '@nestjs/common';
import { REBELLION_ERROR_MESSAGE_KEYS } from '@bga/game-rebellion/schema';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  AI_REB_SETUP,
  BASE_SYSTEM,
  CoreSession,
  ERR,
  HS_SESSION,
  HS_SETUP,
  accept,
  activate,
  advancePhase,
  asCore,
  asHandoff,
  createCore,
  endTurn,
  expectRejected,
  finish,
  fixedIds,
  move,
  pass,
  storedState,
  type Step,
} from './support/core-fixtures';
import { dbSnapshot, expectError, postCommand, prismaOf, tickingClock } from './support/fixtures';
import { createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

const covered = new Set<string>();
const ILLEGAL = 'ILLEGAL_COMMAND';

describe('core-v1 commands over HTTP: every rejection key (422 + nothing changed)', () => {
  let db: TestDb;
  let app: INestApplication;

  async function boot(...ids: string[]) {
    db = createTestDb();
    app = await startApp(db.url, { clock: tickingClock(), idGenerator: fixedIds(...ids) });
  }

  afterEach(async () => {
    await stopApp(app, db);
  });

  afterAll(() => {
    // Every game key a core-v1 session can return over HTTP is exercised here, except:
    // setup keys (session creation), `gameOver` (core-victory) and `wrongPhase` (unreachable, Q-6).
    const elsewhere = new Set(['rulesetUnavailable', 'modeUnavailable', 'gameOver', 'wrongPhase']);
    const expected = Object.keys(REBELLION_ERROR_MESSAGE_KEYS).filter((k) => !elsewhere.has(k));
    expect([...covered].sort()).toEqual(expected.sort());
  });

  async function reject(
    session: CoreSession,
    step: Step,
    key: string,
    details?: unknown,
    expectedVersion?: number,
  ) {
    covered.add(key);
    return expectRejected(
      app,
      session,
      step,
      { status: 422, code: ILLEGAL, messageKey: ERR(key), details },
      expectedVersion,
    );
  }

  async function hotSeat() {
    await boot(HS_SESSION);
    const created = await createCore(app, HS_SETUP);
    expect(created.sessionId).toBe(HS_SESSION);
    expect((await storedState(app, HS_SESSION)).rebelBase.systemId).toBe(BASE_SYSTEM);
    const view = asCore(created.view);
    expect(view).toMatchObject({ viewer: 'rebels', activeSide: 'rebels', round: 1 });
    return new CoreSession(app, HS_SESSION, view.version);
  }

  it('envelope, version and engine checks; ACTIVATE_SYSTEM keys before any activation (AC-03, AC-04)', async () => {
    const s = await hotSeat();

    // 400 VALIDATION: frame / command schema (CommandSchema = both engines, strict).
    for (const body of [
      { actor: 'rebels', command: { type: 'PASS' } },
      { actor: 'rebels', expectedVersion: s.version, command: { type: 'FLY' } },
      { actor: 'rebels', expectedVersion: s.version, command: { type: 'PASS', extra: 1 } },
      { actor: 'sith', expectedVersion: s.version, command: { type: 'PASS' } },
    ]) {
      const before = await dbSnapshot(app, s.id);
      expectError(await postCommand(app, s.id, body), 400, 'VALIDATION', 'errors.validation');
      expect(await dbSnapshot(app, s.id)).toEqual(before);
    }

    // 409 VERSION_CONFLICT
    await expectRejected(
      app,
      s,
      pass('rebels'),
      {
        status: 409,
        code: 'VERSION_CONFLICT',
        messageKey: 'errors.versionConflict',
        details: { currentVersion: s.version },
      },
      s.version + 5,
    );

    // AC-03: phases and rounds are the engine's — ADVANCE_PHASE / END_TURN → 422 commandUnavailable.
    await reject(s, advancePhase('rebels'), 'commandUnavailable', {
      actor: 'rebels',
      type: 'ADVANCE_PHASE',
    });
    await reject(s, endTurn('rebels'), 'commandUnavailable', { actor: 'rebels', type: 'END_TURN' });
    // commandUnavailable comes before the actor checks (§3.3 #4).
    await reject(s, endTurn('empire'), 'commandUnavailable', { actor: 'empire', type: 'END_TURN' });

    await reject(s, activate('empire', 'vader', 'malastare'), 'notYourTurn', { actor: 'empire' });
    await reject(s, accept('rebels'), 'handoffNotAvailable', { actor: 'rebels' });
    await reject(s, move('rebels', ['u-03'], 'bothawui', 'toydaria'), 'noActivation', {
      actor: 'rebels',
    });
    await reject(s, finish('rebels'), 'noActivation', { actor: 'rebels' });

    await reject(s, activate('rebels', 'yoda', 'toydaria'), 'unknownLeader', { leaderId: 'yoda' });
    await reject(s, activate('rebels', 'vader', 'toydaria'), 'leaderNotInPool', {
      leaderId: 'vader',
    });
    await reject(s, activate('rebels', 'mon-mothma', 'toydaria'), 'leaderCannotActivate', {
      leaderId: 'mon-mothma',
    });
    await reject(s, activate('rebels', 'leia', 'nowhere'), 'unknownSystem', {
      systemId: 'nowhere',
    });

    // Nothing above moved the version; a legal command still works with it.
    const ok = await s.send(activate('rebels', 'leia', 'toydaria'));
    expect(asCore(ok.view).activation).toMatchObject({ side: 'rebels', leaderId: 'leia' });
  });

  it('MOVE_PIECES / PASS keys during an activation; handoff keys; pinned / leader on the map (AC-04, AC-05, AC-09)', async () => {
    const s = await hotSeat();
    await s.send(activate('rebels', 'leia', 'toydaria'));

    await reject(s, activate('rebels', 'dodonna', 'bothawui'), 'activationInProgress', {
      actor: 'rebels',
    });
    await reject(s, pass('rebels'), 'activationInProgress', { actor: 'rebels' });
    await reject(s, move('rebels', ['u-03'], 'nowhere', 'toydaria'), 'unknownSystem', {
      systemId: 'nowhere',
    });
    await reject(s, move('rebels', ['u-03'], 'bothawui', 'nowhere'), 'unknownSystem', {
      systemId: 'nowhere',
    });
    await reject(s, move('rebels', ['u-03'], 'bothawui', 'malastare'), 'notActivatedSystem', {
      toSystemId: 'malastare',
    });
    await reject(s, move('rebels', ['u-03'], 'toydaria', 'toydaria'), 'sameSystem', {
      fromSystemId: 'toydaria',
      toSystemId: 'toydaria',
    });
    await reject(s, move('rebels', ['u-03'], 'coruscant', 'toydaria'), 'notAdjacent', {
      fromSystemId: 'coruscant',
      toSystemId: 'toydaria',
    });
    await reject(s, move('rebels', ['u-999'], 'bothawui', 'toydaria'), 'unknownPiece', {
      pieceId: 'u-999',
    });
    await reject(s, move('rebels', ['u-03', 'u-40'], 'bothawui', 'toydaria'), 'notOwner', {
      pieceId: 'u-40',
    });
    await reject(s, move('rebels', ['u-09'], 'bothawui', 'toydaria'), 'notInFromSystem', {
      pieceId: 'u-09',
      fromSystemId: 'bothawui',
    });
    await reject(
      s,
      move('rebels', ['u-03', 'u-05'], 'bothawui', 'toydaria'),
      'insufficientCapacity',
      { fromSystemId: 'bothawui', required: 1, available: 0 },
    );

    // The same units with the transport → accepted (all or nothing).
    const moved = await s.send(move('rebels', ['u-02', 'u-05', 'u-06'], 'bothawui', 'toydaria'));
    expect(
      asCore(moved.view)
        .units.filter((u) => u.location.kind === 'system' && u.location.systemId === 'toydaria')
        .map((u) => u.id)
        .sort(),
    ).toEqual(['u-02', 'u-05', 'u-06']);

    // FINISH → handoff to the Empire (TC-HS-06).
    const handoff = await s.send(finish('rebels'));
    expect(asHandoff(handoff.view).activeSide).toBe('empire');
    await reject(s, activate('empire', 'vader', 'malastare'), 'handoffPending', {
      actor: 'empire',
    });
    await reject(s, pass('rebels'), 'notYourTurn', { actor: 'rebels' });
    await reject(s, accept('rebels'), 'notYourTurn', { actor: 'rebels' });

    await s.play([accept('empire'), activate('empire', 'vader', 'malastare'), finish('empire')]);
    await s.send(accept('rebels'));

    // Leia stands in Toydaria: not in the pool any more.
    await reject(s, activate('rebels', 'leia', 'bothawui'), 'leaderNotInPool', {
      leaderId: 'leia',
    });
    // Activating a system with an own leader already there is legal (Q-BE-3) …
    await s.send(activate('rebels', 'dodonna', 'bothawui'));
    // … but units in a system with an own leader stay (R-5).
    await reject(s, move('rebels', ['u-02'], 'toydaria', 'bothawui'), 'pinnedByLeader', {
      fromSystemId: 'toydaria',
    });
  });

  it('immobileUnit: a structure never moves (synthetic stored state with a shield generator)', async () => {
    const s = await hotSeat();
    // The base-game start setup has no structures: add one to the stored state (schema-valid, Q-35 style seed).
    const state = await storedState(app, s.id);
    const seeded = {
      ...state,
      units: [
        ...state.units,
        {
          id: 'u-99',
          owner: 'rebels',
          typeKey: 'unit.rebels.shield-generator',
          systemId: 'bothawui',
        },
      ],
    };
    await prismaOf(app).session.update({
      where: { id: s.id },
      data: { state: JSON.stringify(seeded) },
    });
    await s.send(activate('rebels', 'leia', 'toydaria'));
    await reject(s, move('rebels', ['u-02', 'u-99'], 'bothawui', 'toydaria'), 'immobileUnit', {
      pieceId: 'u-99',
    });
  });

  it('AI game: the AI side and handoffs are not the player’s (notYourSide, handoffNotAvailable, TC-AI-11)', async () => {
    await boot('ai-commands-1');
    const created = await createCore(app, AI_REB_SETUP);
    const s = new CoreSession(app, created.sessionId, created.view.version);
    await reject(s, activate('empire', 'vader', 'malastare'), 'notYourSide', { actor: 'empire' });
    await reject(s, pass('empire'), 'notYourSide', { actor: 'empire' });
    await reject(s, accept('rebels'), 'handoffNotAvailable', { actor: 'rebels' });
    await reject(s, endTurn('rebels'), 'commandUnavailable', { actor: 'rebels', type: 'END_TURN' });
  });

  it('wrongPhase is unreachable: a stored running state outside the command phase → 500, nothing written', async () => {
    const s = await hotSeat();
    const state = await storedState(app, s.id);
    await prismaOf(app).session.update({
      where: { id: s.id },
      data: { state: JSON.stringify({ ...state, phase: 'refresh' }) },
    });
    const before = await dbSnapshot(app, s.id);
    const res = await s.post(pass('rebels'));
    const err = expectError(res, 500, 'INTERNAL');
    expect(JSON.stringify(err)).not.toContain('refresh');
    expect(await dbSnapshot(app, s.id)).toEqual(before);
  });
});
