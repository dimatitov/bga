/**
 * SWR-005 W6b — victories on `core-v1` through HTTP (AC-07, AC-13; TC-AI-08, TC-HS-11, TC-H-18, TC-P-07):
 * Rebels by time (Rebels vs AI and Empire vs AI, 13 passes) and Empire by capturing the revealed base
 * (hot-seat: the AI Rebels never leave their base, W5 decision). After the end: `outcome` in the view,
 * `legalActions` empty, `status: 'completed'` in GET / the list / the row (platform `statusOf`), and ANY command
 * → 422 `gameOver` (checked before the version) with nothing changed.
 * The command response envelope `{ok, view, events}` has no `status` field (platform contract unchanged):
 * the status of the same commit is read from GET / the list right after it.
 */
import type { INestApplication } from '@nestjs/common';
import { ListSessionsResponseSchema } from '@bga/platform';
import { RebellionSessionDetailsSchema, type Faction } from '@bga/game-rebellion/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AI_EMP_SETUP,
  AI_REB_SETUP,
  BASE_SYSTEM,
  BASE_UNITS,
  CoreSession,
  ERR,
  HS_SESSION_2,
  HS_SETUP,
  accept,
  activate,
  advancePhase,
  asCore,
  createCore,
  expectConsecutiveEvents,
  expectRejected,
  finish,
  fixedIds,
  getSession,
  lines,
  move,
  pass,
  storedRow,
  storedState,
  type Step,
} from './support/core-fixtures';
import { R, tickingClock } from './support/fixtures';
import { api, createTestDb, startApp, stopApp, type TestDb } from './support/test-app';

/** W5 `SEED_WIN_STEPS`: round 2, Empire to move, the Rebels evacuated the still-hidden base. */
const SEED_WIN_STEPS: Step[] = [
  activate('rebels', 'leia', 'rodia'),
  move('rebels', ['u-02'], 'bothawui', 'rodia'),
  finish('rebels'),
  accept('empire'),
  activate('empire', 'vader', 'malastare'),
  move('empire', ['u-40', 'u-41', 'u-43', 'u-45'], 'sullust', 'malastare'),
  finish('empire'),
  accept('rebels'),
  pass('rebels'),
  accept('empire'),
  pass('empire'),
  accept('rebels'),
  activate('rebels', 'dodonna', 'bothawui'),
  move('rebels', ['u-02', ...BASE_UNITS], 'rodia', 'bothawui'),
  finish('rebels'),
  accept('empire'),
];

describe('core-v1 victories over HTTP (AC-07, AC-13)', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeEach(async () => {
    db = createTestDb();
    app = await startApp(db.url, {
      clock: tickingClock(),
      idGenerator: fixedIds(HS_SESSION_2, 'victory-2', 'victory-3'),
    });
  });

  afterEach(async () => {
    await stopApp(app, db);
  });

  async function expectStatus(sessionId: string, status: 'prototype' | 'completed') {
    expect((await getSession(app, sessionId)).status).toBe(status);
    expect((await storedRow(app, sessionId)).status).toBe(status);
    const list = ListSessionsResponseSchema.parse(
      (await api(app).get(`/api/sessions?gameId=${R}`)).body,
    );
    const summary = list.find((x) => x.sessionId === sessionId);
    expect(summary?.status).toBe(status);
    return RebellionSessionDetailsSchema.parse(summary?.details);
  }

  /** After the end any command of either side → 422 gameOver (before 409), nothing changes. */
  async function expectGameOver(s: CoreSession, sides: Faction[]) {
    for (const actor of sides) {
      for (const step of [
        pass(actor),
        activate(actor, actor === 'rebels' ? 'leia' : 'vader', 'toydaria'),
        finish(actor),
        accept(actor),
        advancePhase(actor),
      ]) {
        await expectRejected(app, s, step, {
          status: 422,
          code: 'ILLEGAL_COMMAND',
          messageKey: ERR('gameOver'),
          details: { actor },
        });
      }
      // gameOver is checked before the version (§3.3 #2).
      await expectRejected(
        app,
        s,
        pass(actor),
        { status: 422, code: 'ILLEGAL_COMMAND', messageKey: ERR('gameOver') },
        s.version - 3,
      );
    }
  }

  it.each([
    ['Rebels vs AI', AI_REB_SETUP, 'rebels', 1],
    ['Empire vs AI', AI_EMP_SETUP, 'empire', 2],
  ] as const)(
    'TC-AI-08 / TC-P-07 / TC-H-18: %s — 13 player passes → time 14 = reputation → Rebels win',
    async (_name, setup, player, startVersion) => {
      const created = await createCore(app, setup);
      const s = new CoreSession(app, created.sessionId, created.view.version);
      expect(s.version).toBe(startVersion);

      for (let i = 1; i <= 12; i += 1) {
        const res = await s.send(pass(player));
        expect(asCore(res.view).round).toBe(1 + i);
      }
      // After the 12th: the game goes on.
      const before = asCore((await getSession(app, s.id)).view);
      expect(before).toMatchObject({
        round: 13,
        outcome: null,
        markers: { time: 13, reputation: 14 },
      });
      expect(before.legalActions.length).toBeGreaterThan(0);
      expect((await expectStatus(s.id, 'prototype')).winner).toBeNull();

      const last = await s.send(pass(player));
      const view = asCore(last.view);
      expect(view).toMatchObject({
        viewer: player,
        round: 14,
        phase: 'refresh',
        outcome: { winner: 'rebels', reason: 'timeReachedReputation' },
        legalActions: [],
        activation: null,
      });
      // The AI does not move after the end; the last events end with GAME_OVER.
      expect(lines(last.events).at(-1)).toBe('GAME_OVER system');
      expect(last.events.filter((e) => e.payload.auto === true)).toEqual(
        player === 'rebels' ? [expect.objectContaining({ type: 'PASSED', actor: 'empire' })] : [],
      );
      // TC-H-18: after the end nothing is hidden — the Empire sees the base too.
      const base = (await storedState(app, s.id)).rebelBase.systemId;
      expect(view.rebelBase).toEqual({ systemId: base, revealed: false });
      expect(view.units.every((u) => u.location.kind === 'system')).toBe(true);

      // AC-13: 'completed' via the platform (same commit), in GET, the list and the row.
      const details = await expectStatus(s.id, 'completed');
      expect(details).toMatchObject({
        winner: 'rebels',
        round: 14,
        phase: 'refresh',
        rulesEngine: 'core-v1',
      });
      expect((await getSession(app, s.id)).view).toEqual(last.view);
      await expectConsecutiveEvents(app, s.id);

      await expectGameOver(s, [player]);
    },
  );

  it('TC-HS-11 / TC-P-07: hot-seat — revealing the evacuated base with ground units → Empire wins at once', async () => {
    const created = await createCore(app, HS_SETUP);
    expect(created.sessionId).toBe(HS_SESSION_2);
    expect((await storedState(app, HS_SESSION_2)).rebelBase.systemId).toBe(BASE_SYSTEM);
    const s = new CoreSession(app, created.sessionId, created.view.version);
    await s.play(SEED_WIN_STEPS);
    await expectStatus(s.id, 'prototype');

    await s.send(activate('empire', 'vader', BASE_SYSTEM));
    await s.send(move('empire', ['u-40', 'u-43', 'u-45'], 'malastare', BASE_SYSTEM));
    const last = await s.send(finish('empire'));
    // The final view is the board, not a handoff (TC-HS-11).
    const view = asCore(last.view);
    expect(view).toMatchObject({
      kind: 'player',
      viewer: 'empire',
      outcome: { winner: 'empire', reason: 'rebelBaseCaptured' },
      legalActions: [],
      rebelBase: { systemId: BASE_SYSTEM, revealed: true },
    });
    // Q-41: ACTIVATION_FINISHED → BASE_REVEALED → GAME_OVER in one command.
    expect(lines(last.events)).toEqual([
      'ACTIVATION_FINISHED empire',
      'BASE_REVEALED system',
      'GAME_OVER system',
    ]);
    expect(last.events[1]?.payload).toEqual({ systemId: BASE_SYSTEM });
    const stored = await storedState(app, s.id);
    expect(stored).toMatchObject({ handoffPending: false, activation: null });

    const details = await expectStatus(s.id, 'completed');
    expect(details).toMatchObject({ winner: 'empire', round: 2, rulesEngine: 'core-v1' });
    await expectConsecutiveEvents(app, s.id);
    await expectGameOver(s, ['rebels', 'empire']);
  });
});
