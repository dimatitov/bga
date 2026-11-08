import { describe, expect, it } from 'vitest';
import { makeSummary, makeView, mockFetch } from '@/shared/test';
import { ApiError, isClientError, isNetworkError, isNotFound } from './errors';
import { createGame, getGameView, listGames, postCommand } from './games';

const envelope = {
  actor: 'empire' as const,
  expectedVersion: 1,
  command: {
    type: 'MOVE_PIECES' as const,
    pieceIds: ['P_E1'],
    fromSystemId: 'S_A',
    toSystemId: 'S_B',
  },
};

async function catchError(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('expected rejection');
}

describe('shared/api', () => {
  it('listGames validates and returns summaries from GET /api/games', async () => {
    const games = [makeSummary('g1', '2026-11-08T10:00:00.000Z')];
    const { requests } = mockFetch({ 'GET /api/games': { status: 200, body: games } });
    await expect(listGames()).resolves.toEqual(games);
    expect(requests[0]).toMatchObject({ method: 'GET', url: '/api/games' });
  });

  it('createGame posts the setup as JSON and returns { gameId, view }', async () => {
    const view = makeView();
    const { requests } = mockFetch({
      'POST /api/games': { status: 201, body: { gameId: 'g1', view } },
    });
    const res = await createGame({ humanFaction: 'empire', opponent: { kind: 'ai' } });
    expect(res).toEqual({ gameId: 'g1', view });
    expect(requests[0]?.body).toEqual({ humanFaction: 'empire', opponent: { kind: 'ai' } });
  });

  it('getGameView: never sends ?viewer= (A-3); 404 → ApiError{status:404}', async () => {
    const { requests } = mockFetch({
      'GET /api/games/g1': { status: 200, body: makeView() },
      'GET /api/games/missing': {
        status: 404,
        body: { ok: false, error: { code: 'NOT_FOUND', messageKey: 'errors.notFound' } },
      },
    });
    await expect(getGameView('g1')).resolves.toMatchObject({ id: 'g1', version: 1 });
    expect(requests[0]?.url).toBe('/api/games/g1');
    const err = await catchError(getGameView('missing'));
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND', messageKey: 'errors.notFound' });
    expect(isNotFound(err)).toBe(true);
    expect(isClientError(err)).toBe(true);
  });

  it('invalid 2xx body → ApiError INVALID_RESPONSE', async () => {
    mockFetch({ 'GET /api/games': { status: 200, body: [{ nope: true }] } });
    const err = await catchError(listGames());
    expect(err.code).toBe('INVALID_RESPONSE');
    expect(err.messageKey).toBeUndefined();
  });

  it('network failure → ApiError{status:null, code:NETWORK}', async () => {
    mockFetch({ 'GET /api/games': 'network' });
    const err = await catchError(listGames());
    expect(err.status).toBeNull();
    expect(err.code).toBe('NETWORK');
    expect(err.messageKey).toBe('errors.network');
    expect(isNetworkError(err)).toBe(true);
    expect(isClientError(err)).toBe(false);
  });

  it('postCommand: 200 → CommandResult ok', async () => {
    const view = makeView({ version: 2 });
    const { requests } = mockFetch({
      'POST /api/games/g1/commands': { status: 200, body: { ok: true, view, events: [] } },
    });
    await expect(postCommand('g1', envelope)).resolves.toEqual({ ok: true, view, events: [] });
    expect(requests[0]?.body).toEqual(envelope);
  });

  it.each([
    [400, 'VALIDATION', 'errors.validation'],
    [404, 'NOT_FOUND', 'errors.notFound'],
    [409, 'VERSION_CONFLICT', 'errors.versionConflict'],
    [422, 'ILLEGAL_COMMAND', 'errors.notAdjacent'],
  ])(
    'postCommand: %i with CommandResult body is returned, not thrown',
    async (status, code, messageKey) => {
      const body = { ok: false, error: { code, messageKey } };
      mockFetch({ 'POST /api/games/g1/commands': { status, body } });
      await expect(postCommand('g1', envelope)).resolves.toEqual(body);
    },
  );

  it('postCommand: 500 → throws ApiError; network → throws; unparseable 422 → throws', async () => {
    mockFetch({
      'POST /api/games/g1/commands': {
        status: 500,
        body: { ok: false, error: { code: 'INTERNAL', messageKey: 'errors.internal' } },
      },
      'POST /api/games/g2/commands': 'network',
      'POST /api/games/g3/commands': { status: 422, body: { weird: true } },
    });
    expect(await catchError(postCommand('g1', envelope))).toMatchObject({
      status: 500,
      code: 'INTERNAL',
    });
    expect(await catchError(postCommand('g2', envelope))).toMatchObject({
      status: null,
      code: 'NETWORK',
    });
    expect(await catchError(postCommand('g3', envelope))).toMatchObject({
      status: 422,
      code: 'HTTP_ERROR',
    });
  });
});
