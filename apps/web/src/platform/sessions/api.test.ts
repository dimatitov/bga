import { describe, expect, it } from 'vitest';
import { ApiError, isClientError, isNetworkError, isNotFound } from '@/shared/api';
import { mockFetch } from '@/shared/test';
import { makeSessionEnvelope, makeSessionSummary } from '../test/fakeGame';
import { createSession, getSession, listSessions, postSessionCommand } from './api';
import { sessionKeys } from './queries';

async function catchError(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('expected rejection');
}

const envelope = { actor: 'empire', expectedVersion: 1, command: { type: 'ADVANCE_PHASE' } };

describe('platform/sessions/api', () => {
  it('createSession: POST /api/sessions { gameId, setup } → envelope with view: unknown', async () => {
    const body = makeSessionEnvelope({ view: { anything: ['goes'] } });
    const { requests } = mockFetch({ 'POST /api/sessions': { status: 201, body } });
    await expect(createSession({ gameId: 'test-game', setup: { answer: 42 } })).resolves.toEqual(
      body,
    );
    expect(requests[0]).toMatchObject({
      method: 'POST',
      url: '/api/sessions',
      body: { gameId: 'test-game', setup: { answer: 42 } },
    });
    expect(requests[0]?.headers).not.toHaveProperty('idempotency-key');
  });

  it('createSession: idempotencyKey → Idempotency-Key header; 200 replay parses like 201 (status, settings)', async () => {
    const body = makeSessionEnvelope({ status: 'active', settings: { side: 'x' } });
    const { requests } = mockFetch({
      'POST /api/sessions': { status: 200, body, headers: { 'Idempotent-Replay': 'true' } },
    });
    const key = '0b6c3f2e-3c1a-4b8e-9d0f-1a2b3c4d5e6f';
    await expect(
      createSession({ gameId: 'test-game', setup: {} }, { idempotencyKey: key }),
    ).resolves.toEqual(body);
    expect(requests[0]?.headers['idempotency-key']).toBe(key);
  });

  it.each([
    ['status', { status: undefined }],
    ['settings', { settings: undefined }],
    ['unknown status', { status: 'paused' }],
  ])('createSession/getSession: envelope without valid %s → INVALID_RESPONSE', async (_, patch) => {
    const body = { ...makeSessionEnvelope(), ...patch };
    mockFetch({
      'POST /api/sessions': { status: 201, body },
      'GET /api/sessions/s1': { status: 200, body },
    });
    expect((await catchError(createSession({ gameId: 'x', setup: {} }))).code).toBe(
      'INVALID_RESPONSE',
    );
    expect((await catchError(getSession('s1'))).code).toBe('INVALID_RESPONSE');
  });

  it.each([
    [404, 'NOT_FOUND', 'errors.gameNotFound'],
    [422, 'GAME_UNAVAILABLE', 'errors.gameUnavailable'],
    [400, 'VALIDATION', 'errors.validation'],
    [422, 'SETUP_UNSUPPORTED', 'errors.setupUnsupported'],
    [409, 'IDEMPOTENCY_KEY_REUSED', 'errors.idempotencyKeyReused'],
  ])(
    'createSession: %i → throws ApiError with code and messageKey',
    async (status, code, messageKey) => {
      mockFetch({
        'POST /api/sessions': { status, body: { ok: false, error: { code, messageKey } } },
      });
      const err = await catchError(createSession({ gameId: 'x', setup: {} }));
      expect(err).toMatchObject({ status, code, messageKey });
      expect(isClientError(err)).toBe(true);
    },
  );

  it('createSession: response without gameId → INVALID_RESPONSE', async () => {
    mockFetch({ 'POST /api/sessions': { status: 201, body: { sessionId: 's1', view: {} } } });
    expect((await catchError(createSession({ gameId: 'x', setup: {} }))).code).toBe(
      'INVALID_RESPONSE',
    );
  });

  it('listSessions: ?gameId= is encoded; without params → all games; validated by SessionSummarySchema', async () => {
    const list = [makeSessionSummary({ details: { round: 2, phase: 'command', ai: true } })];
    const { requests } = mockFetch({ 'GET /api/sessions': { status: 200, body: list } });
    await expect(listSessions({ gameId: 'star-wars-rebellion' })).resolves.toEqual(list);
    await expect(listSessions()).resolves.toEqual(list);
    await listSessions({ gameId: 'a b&c' });
    expect(requests.map((r) => r.url)).toEqual([
      '/api/sessions?gameId=star-wars-rebellion',
      '/api/sessions',
      '/api/sessions?gameId=a%20b%26c',
    ]);
  });

  it('listSessions: invalid summary → INVALID_RESPONSE; network → ApiError{status:null}', async () => {
    mockFetch({ 'GET /api/sessions': { status: 200, body: [{ sessionId: 's1' }] } });
    expect((await catchError(listSessions())).code).toBe('INVALID_RESPONSE');
    mockFetch({ 'GET /api/sessions': 'network' });
    const err = await catchError(listSessions({ gameId: 'g' }));
    expect(isNetworkError(err)).toBe(true);
  });

  it('getSession: GET /api/sessions/:id (encoded); 404 → isNotFound; 422 GAME_UNAVAILABLE → ApiError', async () => {
    const body = makeSessionEnvelope({ sessionId: 'a/b' });
    const { requests } = mockFetch({
      'GET /api/sessions/a%2Fb': { status: 200, body },
      'GET /api/sessions/missing': {
        status: 404,
        body: { ok: false, error: { code: 'NOT_FOUND', messageKey: 'errors.sessionNotFound' } },
      },
      'GET /api/sessions/old': {
        status: 422,
        body: {
          ok: false,
          error: { code: 'GAME_UNAVAILABLE', messageKey: 'errors.gameUnavailable' },
        },
      },
    });
    await expect(getSession('a/b')).resolves.toEqual(body);
    expect(requests[0]?.url).toBe('/api/sessions/a%2Fb');
    expect(isNotFound(await catchError(getSession('missing')))).toBe(true);
    expect(await catchError(getSession('old'))).toMatchObject({
      status: 422,
      code: 'GAME_UNAVAILABLE',
    });
  });

  it('postSessionCommand: 200 → ok frame (view/events unknown); sends the envelope as is', async () => {
    const body = { ok: true, view: { v: 2 }, events: [{ type: 'X' }] };
    const { requests } = mockFetch({ 'POST /api/sessions/s1/commands': { status: 200, body } });
    await expect(postSessionCommand('s1', envelope)).resolves.toEqual(body);
    expect(requests[0]).toMatchObject({ url: '/api/sessions/s1/commands', body: envelope });
  });

  it.each([
    [400, 'VALIDATION', 'errors.validation'],
    [404, 'NOT_FOUND', 'errors.sessionNotFound'],
    [409, 'VERSION_CONFLICT', 'errors.versionConflict'],
    [422, 'ILLEGAL_COMMAND', 'errors.notAdjacent'],
  ])(
    'postSessionCommand: %i with {ok:false} body is returned, not thrown',
    async (status, code, messageKey) => {
      const body = { ok: false, error: { code, messageKey } };
      mockFetch({ 'POST /api/sessions/s1/commands': { status, body } });
      await expect(postSessionCommand('s1', envelope)).resolves.toEqual(body);
    },
  );

  it('postSessionCommand: 500, network and unparseable 422 throw', async () => {
    mockFetch({
      'POST /api/sessions/s1/commands': {
        status: 500,
        body: { ok: false, error: { code: 'INTERNAL', messageKey: 'errors.internal' } },
      },
      'POST /api/sessions/s2/commands': 'network',
      'POST /api/sessions/s3/commands': { status: 422, body: { weird: true } },
    });
    expect(await catchError(postSessionCommand('s1', envelope))).toMatchObject({
      status: 500,
      code: 'INTERNAL',
    });
    expect(await catchError(postSessionCommand('s2', envelope))).toMatchObject({
      status: null,
      code: 'NETWORK',
    });
    expect(await catchError(postSessionCommand('s3', envelope))).toMatchObject({
      status: 422,
      code: 'HTTP_ERROR',
    });
  });

  it('sessionKeys: lists() is a prefix of every list key; detail is separate', () => {
    expect(sessionKeys.list('g').slice(0, 2)).toEqual([...sessionKeys.lists()]);
    expect(sessionKeys.list()).toEqual(['sessions', 'list', '*']);
    expect(sessionKeys.detail('s1')).toEqual(['sessions', 'detail', 's1']);
  });
});
