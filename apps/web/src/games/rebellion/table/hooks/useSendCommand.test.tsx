import type { Command } from '@bga/game-rebellion/schema';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SessionEnvelope, sessionKeys } from '@/platform';
import { createTestQueryClient, mockFetch, type MockReply } from '@/shared/test';
import type { PlayerView, PlayerViewCore } from '@bga/game-rebellion/schema';
import { makeHandoffView, makeRebellionSession, makeView, SESSION_ID } from '../../test/fixtures';
import {
  CORE_SESSION_ID,
  CS_CORELLIA,
  CS_SULLUST,
  L_LEIA,
  makeCoreActivationView,
  makeCoreEmpireView,
  makeCoreOutcomeView,
  makeCoreSession,
  makeCoreView,
  U_RT_SULLUST,
  U_TRANSPORT,
} from '../../test/coreFixtures';
import { useSendCommand } from './useSendCommand';

const MOVE: Command = {
  type: 'MOVE_PIECES',
  pieceIds: ['pc-01'],
  fromSystemId: 'sys-aurelis',
  toSystemId: 'sys-brevora',
};
const PATH = `POST /api/sessions/${SESSION_ID}/commands`;

function setup(replies: MockReply[], view: PlayerView = makeView()) {
  const queue = [...replies];
  mockFetch({ [PATH]: () => queue.shift() ?? 'network' });
  const qc = createTestQueryClient();
  qc.setQueryData(sessionKeys.detail(SESSION_ID), makeRebellionSession(view));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useSendCommand(SESSION_ID), { wrapper }), qc };
}

const ok = (): MockReply => ({
  status: 200,
  body: { ok: true, view: makeView({ version: 4 }), events: [] },
});
const illegal: MockReply = {
  status: 422,
  body: { ok: false, error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.notAdjacent' } },
};

describe('useSendCommand — save indicator (review nit #6)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stays idle after a rejected (4xx) command when nothing was ever saved', async () => {
    const { result } = setup([illegal]);
    let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      outcome = await result.current.send(MOVE);
    });
    expect(outcome?.ok).toBe(false);
    expect(result.current.saveStatus).toBe('idle');
  });

  it('keeps "saved" from the previous accepted command after a 4xx', async () => {
    const { result } = setup([ok(), illegal]);
    await act(async () => {
      await result.current.send(MOVE);
    });
    expect(result.current.saveStatus).toBe('saved');
    await act(async () => {
      await result.current.send(MOVE);
    });
    expect(result.current.saveStatus).toBe('saved');
  });

  it('keeps "error" from a previous network failure after a 4xx', async () => {
    const { result } = setup(['network', illegal]);
    await act(async () => {
      await result.current.send(MOVE);
    });
    expect(result.current.saveStatus).toBe('error');
    await act(async () => {
      await result.current.send(MOVE);
    });
    expect(result.current.saveStatus).toBe('error');
  });

  it('switches to "saved" only on an accepted command', async () => {
    const { result } = setup([ok()]);
    await act(async () => {
      await result.current.send(MOVE);
    });
    expect(result.current.saveStatus).toBe('saved');
  });
});

describe('useSendCommand — session cache (SWR-003 plan-frontend §3.1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envelope from the cached session view; ok → detail view replaced, lists invalidated', async () => {
    const { result, qc } = setup([ok()]);
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    await act(async () => {
      await result.current.send(MOVE);
    });
    const post = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      actor: 'empire',
      expectedVersion: 3,
      command: MOVE,
    });
    const cached = qc.getQueryData<SessionEnvelope>(sessionKeys.detail(SESSION_ID));
    expect(cached?.gameId).toBe('star-wars-rebellion');
    expect((cached?.view as { version: number }).version).toBe(4);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.lists() });
  });

  it('409 → invalidates the session detail (refetch), cache view unchanged', async () => {
    const { result, qc } = setup([
      {
        status: 409,
        body: {
          ok: false,
          error: { code: 'VERSION_CONFLICT', messageKey: 'errors.versionConflict' },
        },
      },
    ]);
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      outcome = await result.current.send(MOVE);
    });
    expect(outcome).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.detail(SESSION_ID) });
  });

  it('accepted command with a non-Rebellion view → INVALID_RESPONSE, detail invalidated', async () => {
    const { result, qc } = setup([{ status: 200, body: { ok: true, view: { x: 1 }, events: [] } }]);
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      outcome = await result.current.send(MOVE);
    });
    expect(outcome).toMatchObject({ ok: false, code: 'INVALID_RESPONSE' });
    expect(result.current.saveStatus).toBe('error');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.detail(SESSION_ID) });
  });

  it('SWR-004 hot-seat: handoff view in the cache → actor = activeSide (Q-11); a handoff response replaces the view', async () => {
    const handoff = makeHandoffView({ activeSide: 'rebels', version: 4 });
    const { result, qc } = setup(
      [
        { status: 200, body: { ok: true, view: handoff, events: [] } },
        {
          status: 200,
          body: {
            ok: true,
            view: makeView({ version: 5, viewer: 'rebels', activeSide: 'rebels' }),
            events: [],
          },
        },
      ],
      makeView({ version: 3, legalActions: [{ type: 'END_TURN' }] }),
    );
    let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      outcome = await result.current.send({ type: 'END_TURN' });
    });
    expect(outcome).toMatchObject({ ok: true, view: { kind: 'handoff' }, events: [] });
    const cached = qc.getQueryData<SessionEnvelope>(sessionKeys.detail(SESSION_ID));
    // Replaced, not merged: nothing of the previous player view stays in the cache.
    expect(cached?.view).toEqual(handoff);
    expect(cached?.settings).toBeDefined();

    await act(async () => {
      await result.current.send({ type: 'ACCEPT_HANDOFF' });
    });
    const second = vi.mocked(fetch).mock.calls[1];
    expect(JSON.parse(String(second?.[1]?.body))).toEqual({
      actor: 'rebels',
      expectedVersion: 4,
      command: { type: 'ACCEPT_HANDOFF' },
    });
  });
});

describe('useSendCommand — core-v1 commands (SWR-005 FE-0)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const CORE_PATH = `POST /api/sessions/${CORE_SESSION_ID}/commands`;

  function setupCore(replies: MockReply[], view: PlayerViewCore) {
    const queue = [...replies];
    mockFetch({ [CORE_PATH]: () => queue.shift() ?? 'network' });
    const qc = createTestQueryClient();
    qc.setQueryData(sessionKeys.detail(CORE_SESSION_ID), makeCoreSession(view));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    return { ...renderHook(() => useSendCommand(CORE_SESSION_ID), { wrapper }), qc };
  }
  const body = (n: number) => JSON.parse(String(vi.mocked(fetch).mock.calls[n]?.[1]?.body));

  it.each<[string, PlayerViewCore, Command]>([
    [
      'ACTIVATE_SYSTEM',
      makeCoreView(),
      { type: 'ACTIVATE_SYSTEM', leaderId: L_LEIA, systemId: CS_CORELLIA },
    ],
    [
      'MOVE_PIECES',
      makeCoreActivationView(),
      {
        type: 'MOVE_PIECES',
        pieceIds: [U_TRANSPORT, U_RT_SULLUST],
        fromSystemId: CS_SULLUST,
        toSystemId: CS_CORELLIA,
      },
    ],
    ['FINISH_ACTIVATION', makeCoreActivationView(), { type: 'FINISH_ACTIVATION' }],
    ['PASS', makeCoreEmpireView(), { type: 'PASS' }],
  ])(
    '%s: actor = viewer, expectedVersion = cached view.version; view replaced',
    async (_, view, command) => {
      const next = { ...view, version: view.version + 2 };
      const { result, qc } = setupCore(
        [{ status: 200, body: { ok: true, view: next, events: [] } }],
        view,
      );
      const invalidate = vi.spyOn(qc, 'invalidateQueries');
      let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
      await act(async () => {
        outcome = await result.current.send(command);
      });
      expect(body(0)).toEqual({ actor: view.viewer, expectedVersion: view.version, command });
      expect(outcome).toMatchObject({ ok: true, view: { version: view.version + 2 } });
      const cached = qc.getQueryData<SessionEnvelope>(sessionKeys.detail(CORE_SESSION_ID));
      expect(cached?.view).toEqual(next);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.lists() });
      // No GAME_OVER: the session detail is not refetched.
      expect(invalidate).not.toHaveBeenCalledWith({
        queryKey: sessionKeys.detail(CORE_SESSION_ID),
      });
    },
  );

  it('a response with GAME_OVER updates the view and invalidates detail (status) and lists (AM-FE-10)', async () => {
    const over = makeCoreOutcomeView('rebels');
    const gameOver = over.log.at(-1)!;
    const { result, qc } = setupCore(
      [{ status: 200, body: { ok: true, view: over, events: [gameOver] } }],
      makeCoreView(),
    );
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      outcome = await result.current.send({ type: 'PASS' });
    });
    expect(outcome).toMatchObject({ ok: true, events: [{ type: 'GAME_OVER' }] });
    expect(qc.getQueryData<SessionEnvelope>(sessionKeys.detail(CORE_SESSION_ID))?.view).toEqual(
      over,
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.detail(CORE_SESSION_ID) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.lists() });
    expect(result.current.saveStatus).toBe('saved');
  });

  it('422 gameOver → localized key returned, cache untouched, nothing invalidated', async () => {
    const view = makeCoreOutcomeView('empire');
    const { result, qc } = setupCore(
      [
        {
          status: 422,
          body: { ok: false, error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.gameOver' } },
        },
      ],
      view,
    );
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      outcome = await result.current.send({ type: 'PASS' });
    });
    expect(outcome).toEqual({
      ok: false,
      code: 'ILLEGAL_COMMAND',
      messageKey: 'errors.gameOver',
      details: undefined,
    });
    expect(qc.getQueryData<SessionEnvelope>(sessionKeys.detail(CORE_SESSION_ID))?.view).toEqual(
      view,
    );
    expect(invalidate).not.toHaveBeenCalled();
    expect(result.current.saveStatus).toBe('idle');
  });
});
