import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CommandEnvelopeFrameSchema,
  CreateSessionRequestSchema,
  ListSessionsQuerySchema,
  ListSessionsResponseSchema,
  ERROR_MESSAGE_KEYS,
  MAX_SESSIONS_LISTED,
  SessionCommandResultSchema,
  SessionDetailsSchema,
  SessionResponseSchema,
  SessionSettingsSchema,
  SessionStatusSchema,
  SessionSummarySchema,
  defineServerGameModule,
  makeCommandOkSchema,
  makeSessionResponseSchema,
  toValidationIssues,
  type GameDefinition,
  type ServerGameModule,
  type SessionEventRecord,
  type SessionStatus,
  type SetupParseResult,
} from '../src';

const AT = '2026-11-08T10:00:00.000Z';
const SUMMARY = {
  sessionId: 's-1',
  gameId: 'some-game',
  status: 'prototype',
  version: 3,
  createdAt: AT,
  updatedAt: AT,
  details: { side: 'a', round: 2, ai: true },
};

describe('session DTOs', () => {
  it('SessionStatus: exactly setup | prototype | active | completed', () => {
    expect(SessionStatusSchema.options).toEqual(['setup', 'prototype', 'active', 'completed']);
    for (const status of SessionStatusSchema.options) {
      expect(SessionStatusSchema.safeParse(status).success).toBe(true);
    }
    for (const bad of ['', 'Prototype', 'finished', null, 1]) {
      expect(SessionStatusSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('SessionSettings: any JSON object (the game validates it), not a primitive/array/null', () => {
    const settings = { a: 'x', b: null, c: { nested: [1, 2] } };
    expect(SessionSettingsSchema.parse(settings)).toEqual(settings);
    expect(SessionSettingsSchema.safeParse({}).success).toBe(true);
    for (const bad of [null, 'x', 1, [], undefined]) {
      expect(SessionSettingsSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('SessionDetails: flat string | number | boolean | null values (Q-20)', () => {
    expect(SessionDetailsSchema.safeParse({ a: 'x', b: 1, c: false, d: null }).success).toBe(true);
    expect(SessionDetailsSchema.safeParse({ a: { x: 1 } }).success).toBe(false);
    expect(SessionDetailsSchema.safeParse({ a: [1] }).success).toBe(false);
    expect(SessionDetailsSchema.safeParse({ a: undefined }).success).toBe(false);
  });

  it('SessionSummary: status required and validated; details may hold null', () => {
    const { status: _status, ...withoutStatus } = SUMMARY;
    expect(SessionSummarySchema.safeParse(withoutStatus).success).toBe(false);
    expect(SessionSummarySchema.safeParse({ ...SUMMARY, status: 'done' }).success).toBe(false);
    expect(
      SessionSummarySchema.safeParse({ ...SUMMARY, status: 'active', details: { level: null } })
        .success,
    ).toBe(true);
  });

  it('SessionSummary: flat details only, strict', () => {
    expect(SessionSummarySchema.parse(SUMMARY)).toEqual(SUMMARY);
    expect(ListSessionsResponseSchema.parse([SUMMARY])).toHaveLength(1);
    expect(
      SessionSummarySchema.safeParse({ ...SUMMARY, details: { nested: { x: 1 } } }).success,
    ).toBe(false);
    expect(SessionSummarySchema.safeParse({ ...SUMMARY, version: 0 }).success).toBe(false);
    expect(SessionSummarySchema.safeParse({ ...SUMMARY, gameId: 'Bad Id' }).success).toBe(false);
    expect(SessionSummarySchema.safeParse({ ...SUMMARY, setup: {} }).success).toBe(false);
    expect(MAX_SESSIONS_LISTED).toBe(20);
  });

  it('list query (Q-5, R-2): missing/empty → no filter; malformed or repeated → invalid; extras ignored', () => {
    expect(ListSessionsQuerySchema.parse({})).toEqual({});
    expect(ListSessionsQuerySchema.parse({ gameId: '' }).gameId).toBeUndefined();
    expect(ListSessionsQuerySchema.parse({ gameId: 'unknown-game' }).gameId).toBe('unknown-game');
    expect(ListSessionsQuerySchema.parse({ gameId: 'x', page: '2' })).toEqual({ gameId: 'x' });
    expect(ListSessionsQuerySchema.safeParse({ gameId: 'Foo Bar' }).success).toBe(false);
    expect(ListSessionsQuerySchema.safeParse({ gameId: ['a', 'b'] }).success).toBe(false);
  });

  it('create request: gameId + any setup, strict', () => {
    expect(CreateSessionRequestSchema.safeParse({ gameId: 'g', setup: { a: 1 } }).success).toBe(
      true,
    );
    expect(CreateSessionRequestSchema.safeParse({ setup: {} }).success).toBe(false);
    expect(CreateSessionRequestSchema.safeParse({ gameId: 'g', setup: {}, x: 1 }).success).toBe(
      false,
    );
  });

  it('session response: { sessionId, gameId, status, settings, view }, strict', () => {
    const body = {
      sessionId: 's-1',
      gameId: 'g',
      status: 'prototype',
      settings: { level: null, side: 'a' },
      view: { n: 1 },
    };
    expect(SessionResponseSchema.parse(body)).toEqual(body);
    expect(Object.keys(SessionResponseSchema.shape)).toEqual([
      'sessionId',
      'gameId',
      'status',
      'settings',
      'view',
    ]);
    const { status: _status, ...withoutStatus } = body;
    const { settings: _settings, ...withoutSettings } = body;
    expect(SessionResponseSchema.safeParse(withoutStatus).success).toBe(false);
    expect(SessionResponseSchema.safeParse(withoutSettings).success).toBe(false);
    expect(SessionResponseSchema.safeParse({ ...body, status: 'x' }).success).toBe(false);
    expect(SessionResponseSchema.safeParse({ ...body, settings: 'x' }).success).toBe(false);
    expect(SessionResponseSchema.safeParse({ ...body, setup: {} }).success).toBe(false);
  });

  it('makeSessionResponseSchema: the game narrows view and (optionally) settings', () => {
    const body = {
      sessionId: 's-1',
      gameId: 'g',
      status: 'active',
      settings: { side: 'a' },
      view: { n: 1 },
    };
    const typed = makeSessionResponseSchema(z.strictObject({ n: z.number() }));
    expect(typed.safeParse(body).success).toBe(true);
    expect(typed.safeParse({ ...body, view: { n: 'x' } }).success).toBe(false);
    expect(typed.safeParse({ ...body, settings: [] }).success).toBe(false);

    const withSettings = makeSessionResponseSchema(
      z.strictObject({ n: z.number() }),
      z.strictObject({ side: z.enum(['a', 'b']) }),
    );
    const parsed = withSettings.parse(body);
    expect(parsed.settings.side).toBe('a');
    expect(withSettings.safeParse({ ...body, settings: { side: 'c' } }).success).toBe(false);
    expect(withSettings.safeParse({ ...body, settings: { side: 'a', x: 1 } }).success).toBe(false);
    expect(withSettings.safeParse({ ...body, status: 'nope' }).success).toBe(false);
  });

  it('command result: ok with view/events or the platform error body', () => {
    expect(SessionCommandResultSchema.safeParse({ ok: true, view: {}, events: [] }).success).toBe(
      true,
    );
    expect(
      SessionCommandResultSchema.safeParse({
        ok: false,
        error: { code: 'VERSION_CONFLICT', messageKey: 'errors.versionConflict' },
      }).success,
    ).toBe(true);
    const typed = makeCommandOkSchema(z.object({ n: z.number() }), z.object({ seq: z.number() }));
    expect(typed.safeParse({ ok: true, view: { n: 1 }, events: [{ seq: 1 }] }).success).toBe(true);
    expect(typed.safeParse({ ok: true, view: { n: 1 }, events: [{}] }).success).toBe(false);
  });

  it('command envelope frame', () => {
    expect(
      CommandEnvelopeFrameSchema.safeParse({ actor: 'a', expectedVersion: 1, command: { t: 1 } })
        .success,
    ).toBe(true);
    expect(CommandEnvelopeFrameSchema.safeParse({ actor: '', expectedVersion: 1 }).success).toBe(
      false,
    );
    expect(CommandEnvelopeFrameSchema.safeParse({ actor: 'a', expectedVersion: 0 }).success).toBe(
      false,
    );
  });

  it('toValidationIssues prefixes paths and stringifies symbols', () => {
    const r = z.object({ a: z.number() }).safeParse({ a: 'x' });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(toValidationIssues(r.error, ['setup'])).toEqual([
      expect.objectContaining({ path: ['setup', 'a'], code: 'invalid_type' }),
    ]);
  });
});

describe('ServerGameModule', () => {
  interface CounterState {
    id: string;
    version: number;
    n: number;
  }
  interface CounterEvent extends SessionEventRecord {
    type: 'INC';
  }
  const definition: GameDefinition = {
    id: 'counter',
    name: 'Counter',
    descriptionKey: 'counter.meta:description',
    status: 'available',
    supportedPlayers: [1],
    supportsAI: false,
  };

  it('a concrete module is assignable to the registry type (method bivariance)', () => {
    const counter = defineServerGameModule<CounterState, { start: number }, CounterEvent>({
      definition,
      parseSetup: (input) =>
        typeof input === 'object' && input !== null && 'start' in input
          ? { ok: true, value: { start: Number(input.start) } }
          : {
              ok: false,
              kind: 'invalid',
              issues: [{ path: [], code: 'custom', message: 'start' }],
            },
      parseStoredSetup: (raw) => raw as { start: number },
      initialStatus: () => 'active',
      publicSettings: (setup) => ({ start: setup.start }),
      createInitialState: (setup, ctx) => ({
        state: { id: ctx.sessionId, version: 1, n: setup.start },
        events: [],
      }),
      setupOf: (s) => ({ start: s.n }),
      parseState: (raw) => raw as CounterState,
      version: (s) => s.version,
      applyCommand: (s, _envelope, ctx) => ({
        ok: true,
        state: { ...s, version: s.version + 1, n: s.n + 1 },
        events: [{ seq: s.version, type: 'INC', actor: 'p', at: ctx.now, payload: null }],
      }),
      toPlayerView: (s, ctx) => ({ n: s.n, status: ctx.status }),
      toPlayerEvents: (events) => [...events],
      summarize: (s) => ({ n: s.n }),
    });
    const registry: readonly ServerGameModule[] = [counter];
    const m = registry[0]!;
    expect(m.parseSetup({ start: 2 })).toEqual({ ok: true, value: { start: 2 } });
    const { state } = m.createInitialState({ start: 2 }, { sessionId: 's-1', now: AT });
    expect(m.version(state)).toBe(1);
    expect(m.setupOf(state)).toEqual({ start: 2 });
    expect(m.parseSetup(null)).toMatchObject({ ok: false, kind: 'invalid' });
    expect(m.parseStoredSetup({ start: 5 })).toEqual({ start: 5 });
    expect(m.initialStatus({ start: 2 })).toBe('active');
    expect(m.publicSettings({ start: 2 })).toEqual({ start: 2 });
    expect(m.toPlayerView(state, { status: 'prototype' })).toEqual({ n: 2, status: 'prototype' });
    const res = m.applyCommand(state, {}, { now: AT });
    expect(res.ok && m.summarize(res.state)).toEqual({ n: 3 });
  });

  it('SetupParseResult distinguishes invalid (400) from unsupported (422)', () => {
    const toHttp = (r: SetupParseResult<unknown>): [number, string] => {
      if (r.ok) return [201, ''];
      switch (r.kind) {
        case 'invalid':
          return [400, r.issues.map((i) => i.path.join('.')).join(',')];
        case 'unsupported':
          return [422, r.messageKey];
      }
    };
    expect(toHttp({ ok: true, value: 1 })).toEqual([201, '']);
    expect(
      toHttp({ ok: false, kind: 'invalid', issues: [{ path: ['a'], code: 'x', message: 'm' }] }),
    ).toEqual([400, 'a']);
    expect(
      toHttp({
        ok: false,
        kind: 'unsupported',
        messageKey: ERROR_MESSAGE_KEYS.setupUnsupported,
        details: { unsupported: ['mode'] },
      }),
    ).toEqual([422, 'errors.setupUnsupported']);
    const status: SessionStatus = 'setup';
    expect(SessionStatusSchema.parse(status)).toBe('setup');
  });
});
