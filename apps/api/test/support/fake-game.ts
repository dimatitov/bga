/**
 * TR-4: a fake game used to prove that the session service is game-independent (AC-5(a)).
 * Typed with the `ServerGameModule` interface of `@bga/platform` — compiling it is the contract check.
 * Must not import a real game package (ESLint B-14).
 *
 * setup `{ start: number, mode?: 'normal' | 'unsupported' }` (`mode: 'unsupported'` → 422 SETUP_UNSUPPORTED
 * `errors.fakeModeUnavailable`, details `{ unsupported: ['mode'] }`); stored setup `{ start, mode }`;
 * initial status `'active'` (TC-I-36: the status comes from the module, not the platform);
 * state `{ count, version, secret: 'FAKE-SECRET', setup, finished? }` (`setupOf` → `setup`, review #1);
 * commands `{ type: 'INC' }` (`count >= 3` → 422 `errors.fakeLimit`) and `{ type: 'FINISH' }` (SWR-005: sets
 * `finished: true`; `statusOf` → `'completed'`, otherwise `'active'`, so the status write is checked generically);
 * view `{ count, version, status }` (no secret); summarize → `{ count }`.
 */
import {
  CommandEnvelopeFrameSchema,
  ERROR_MESSAGE_KEYS,
  defineServerGameModule,
  toValidationIssues,
  type GameDefinition,
  type ServerGameModule,
} from '@bga/platform';
import { z } from 'zod';

export const FAKE_GAME_ID = 'fake-game';
export const FAKE_SOON_ID = 'fake-soon';
export const FAKE_SECRET = 'FAKE-SECRET';
export const FAKE_LIMIT = 3;

export const fakeGameDefinition: GameDefinition = {
  id: FAKE_GAME_ID,
  name: 'Fake Game',
  descriptionKey: 'fake.meta:description',
  status: 'available',
  supportedPlayers: [1, 2],
  supportsAI: false,
};

/** A catalogue entry without a server module. */
export const fakeSoonDefinition: GameDefinition = {
  id: FAKE_SOON_ID,
  name: 'Fake Soon',
  descriptionKey: 'fake.meta:soon',
  status: 'coming_soon',
  supportedPlayers: [2],
  supportsAI: true,
};

export const FAKE_STATUS = 'active';
/** `statusOf` after a `FINISH` command (SWR-005). */
export const FAKE_FINISHED_STATUS = 'completed';
export const FAKE_UNSUPPORTED_KEY = 'errors.fakeModeUnavailable';

const FakeSetupSchema = z.strictObject({
  start: z.int().min(0),
  mode: z.enum(['normal', 'unsupported']).default('normal'),
});
type FakeSetup = z.output<typeof FakeSetupSchema>;

const FakeStateSchema = z.strictObject({
  id: z.string(),
  count: z.int().min(0),
  version: z.int().positive(),
  secret: z.literal(FAKE_SECRET),
  setup: FakeSetupSchema,
  /** Absent until `FINISH` (keeps SWR-004 fake snapshots byte-identical). */
  finished: z.literal(true).optional(),
});
type FakeState = z.infer<typeof FakeStateSchema>;

interface FakeEvent {
  seq: number;
  type: 'STARTED' | 'INCREMENTED' | 'FINISHED';
  actor: 'player';
  at: string;
  payload: { count: number };
}

const FakeEnvelopeSchema = CommandEnvelopeFrameSchema.extend({
  actor: z.literal('player'),
  command: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('INC') }),
    z.strictObject({ type: z.literal('FINISH') }),
  ]),
}).strict();

const typedFakeGameModule: ServerGameModule<FakeState, FakeSetup, FakeEvent> = {
  definition: fakeGameDefinition,
  parseSetup(input) {
    const parsed = FakeSetupSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, kind: 'invalid', issues: toValidationIssues(parsed.error) };
    }
    if (parsed.data.mode === 'unsupported') {
      return {
        ok: false,
        kind: 'unsupported',
        messageKey: FAKE_UNSUPPORTED_KEY,
        details: { unsupported: ['mode'] },
      };
    }
    return { ok: true, value: parsed.data };
  },
  parseStoredSetup: (raw) => FakeSetupSchema.parse(raw),
  initialStatus: () => FAKE_STATUS,
  statusOf: (state) => (state.finished === true ? FAKE_FINISHED_STATUS : FAKE_STATUS),
  publicSettings: (setup) => ({ start: setup.start, mode: setup.mode }),
  createInitialState(setup, ctx) {
    const state: FakeState = {
      id: ctx.sessionId,
      count: setup.start,
      version: 1,
      secret: FAKE_SECRET,
      setup: { ...setup },
    };
    return {
      state,
      events: [
        { seq: 1, type: 'STARTED', actor: 'player', at: ctx.now, payload: { count: setup.start } },
      ],
    };
  },
  setupOf: (state) => ({ ...state.setup }),
  parseState(raw, expected) {
    const state = FakeStateSchema.parse(raw);
    if (state.id !== expected.sessionId || state.version !== expected.version) {
      throw new Error('fake snapshot mismatch');
    }
    return state;
  },
  version: (state) => state.version,
  applyCommand(state, envelope, ctx) {
    const parsed = FakeEnvelopeSchema.safeParse(envelope);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          messageKey: ERROR_MESSAGE_KEYS.validation,
          details: { issues: toValidationIssues(parsed.error) },
        },
      };
    }
    if (parsed.data.expectedVersion !== state.version) {
      return {
        ok: false,
        error: {
          code: 'VERSION_CONFLICT',
          messageKey: ERROR_MESSAGE_KEYS.versionConflict,
          details: { currentVersion: state.version },
        },
      };
    }
    if (parsed.data.command.type === 'FINISH') {
      const finished: FakeState = { ...state, version: state.version + 1, finished: true };
      return {
        ok: true,
        state: finished,
        events: [
          {
            seq: finished.version,
            type: 'FINISHED',
            actor: 'player',
            at: ctx.now,
            payload: { count: finished.count },
          },
        ],
      };
    }
    if (state.count >= FAKE_LIMIT) {
      return { ok: false, error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.fakeLimit' } };
    }
    const next: FakeState = { ...state, count: state.count + 1, version: state.version + 1 };
    return {
      ok: true,
      state: next,
      events: [
        {
          seq: next.version,
          type: 'INCREMENTED',
          actor: 'player',
          at: ctx.now,
          payload: { count: next.count },
        },
      ],
    };
  },
  toPlayerView: (state, ctx) => ({
    count: state.count,
    version: state.version,
    status: ctx.status,
  }),
  toPlayerEvents: (events) =>
    events.map((e) => ({ seq: e.seq, type: e.type, count: e.payload.count })),
  summarize: (state) => ({ count: state.count }),
};

export const fakeGameModule: ServerGameModule = defineServerGameModule(typedFakeGameModule);
