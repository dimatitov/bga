/**
 * SWR-006 W7 (TR-2): a game-agnostic fake game WITH `automation` (`FAKE_AUTO`) and a scripted commander strategy
 * (`FAKE_STRAT`) for the automation runner tests. No real game package is imported: the runner must work for any game.
 *
 * Setup `{ botMoves = 3, automated = true, botFirst = false, finishAfter? }`; state
 * `{ id, version, setup, pending, count, human, finished? }`:
 * - human (`actor: 'p1'`) `END_TURN` → `pending = botMoves` (the automated side 'p2' moves); `FINISH` → completed;
 *   any human command while `pending > 0` → 422 `errors.fakeNotYourTurn`;
 * - automation: `pendingActor` = 'p2' while `pending > 0`; candidates `c1` (MOVE), `c2` (MOVE), `c3` (WAIT), the bot's
 *   pick = `control.fallbackId` (default `c1`); each applied candidate → `pending - 1` (unless `pendingForever`),
 *   `count + 1`, version + 1, one `BOT_MOVED` event whose payload holds a secret that `toPlayerEvents` removes.
 * `control` switches failures on/off at run time (rejected ids, invalid / throwing decision point, endless turn).
 */
import {
  CommandEnvelopeFrameSchema,
  ERROR_MESSAGE_KEYS,
  defineServerGameModule,
  toValidationIssues,
  type AutomationDecisionPoint,
  type GameDefinition,
  type ServerGameModule,
} from '@bga/platform';
import { z } from 'zod';
import type {
  CommanderChoice,
  CommanderRun,
  CommanderRunContext,
  CommanderStrategy,
} from '../../src/sessions/automation/commander-strategy';

export const FAKE_AUTO_ID = 'fake-auto';
export const FAKE_AUTO_SECRET = 'FAKE-AUTO-SECRET';
export const FAKE_NOT_YOUR_TURN = 'errors.fakeNotYourTurn';

export const fakeAutoDefinition: GameDefinition = {
  id: FAKE_AUTO_ID,
  name: 'Fake Auto',
  descriptionKey: 'fake.meta:auto',
  status: 'available',
  supportedPlayers: [1],
  supportsAI: true,
};

const SetupSchema = z.strictObject({
  botMoves: z.int().min(0).max(100).default(3),
  automated: z.boolean().default(true),
  botFirst: z.boolean().default(false),
  finishAfter: z.int().min(1).optional(),
});
export type FakeAutoSetup = z.input<typeof SetupSchema>;
type Setup = z.output<typeof SetupSchema>;

const StateSchema = z.strictObject({
  id: z.string(),
  version: z.int().positive(),
  setup: SetupSchema,
  pending: z.int().min(0),
  count: z.int().min(0),
  human: z.int().min(0),
  finished: z.literal(true).optional(),
});
export type FakeAutoState = z.infer<typeof StateSchema>;

export interface FakeAutoEvent {
  seq: number;
  type: 'STARTED' | 'HUMAN_ENDED' | 'HUMAN_FINISHED' | 'BOT_MOVED';
  actor: 'system' | 'p1' | 'p2';
  at: string;
  payload: { count: number; candidateId?: string; secret?: string };
}

const EnvelopeSchema = CommandEnvelopeFrameSchema.extend({
  actor: z.literal('p1'),
  command: z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('END_TURN') }),
    z.strictObject({ type: z.literal('FINISH') }),
  ]),
}).strict();

export interface FakeAutoControl {
  /** `applyCandidate` rejects these ids (`ok: false`). */
  reject: Set<string>;
  /** The bot's pick (`fallbackCandidateId`). */
  fallbackId: 'c1' | 'c2' | 'c3';
  /** The automated turn never ends (`pending` is not decremented). */
  pendingForever: boolean;
  /** `decisionPoint` returns a point the platform schema rejects. */
  invalidPoint: boolean;
  /** `decisionPoint` throws. */
  throwPoint: boolean;
  /** Only one candidate is offered. */
  singleCandidate: boolean;
  /** The platform-facing `automation.pendingActor` throws (review F-1: programming error of a game). */
  throwPendingActor: boolean;
  /** Ids passed to `applyCandidate`, in order. */
  applied: string[];
  decisionPoints: number;
}

export function fakeAutoControl(): FakeAutoControl {
  return {
    reject: new Set(),
    fallbackId: 'c1',
    pendingForever: false,
    invalidPoint: false,
    throwPoint: false,
    singleCandidate: false,
    throwPendingActor: false,
    applied: [],
    decisionPoints: 0,
  };
}

const CANDIDATES = [
  { id: 'c1', type: 'MOVE', target: 'north', summary: 'Move one step north.' },
  { id: 'c2', type: 'MOVE', target: 'south', summary: 'Move one step south.' },
  { id: 'c3', type: 'WAIT', summary: 'Wait and end this move.' },
] as const;

function decisionPointOf(state: FakeAutoState, control: FakeAutoControl): AutomationDecisionPoint {
  const candidates = control.singleCandidate
    ? [CANDIDATES.find((c) => c.id === control.fallbackId) ?? CANDIDATES[0]]
    : [...CANDIDATES];
  return {
    actor: 'p2',
    phase: 'bot-turn',
    objective: 'Make the configured number of moves.',
    situation: `Moves left this turn: ${state.pending}. Moves made so far: ${state.count}.`,
    candidates,
    fallbackCandidateId: control.fallbackId,
    policyId: 'fake-bot-v1',
  };
}

export function createFakeAutoGame(control: FakeAutoControl = fakeAutoControl()): {
  module: ServerGameModule;
  control: FakeAutoControl;
} {
  const pendingActor = (state: FakeAutoState): string | null =>
    state.setup.automated && state.finished !== true && state.pending > 0 ? 'p2' : null;

  const typed: ServerGameModule<FakeAutoState, Setup, FakeAutoEvent> = {
    definition: fakeAutoDefinition,
    parseSetup(input) {
      const parsed = SetupSchema.safeParse(input ?? {});
      return parsed.success
        ? { ok: true, value: parsed.data }
        : { ok: false, kind: 'invalid', issues: toValidationIssues(parsed.error) };
    },
    parseStoredSetup: (raw) => SetupSchema.parse(raw),
    initialStatus: () => 'active',
    statusOf: (state) => (state.finished === true ? 'completed' : 'active'),
    publicSettings: (setup) => ({ botMoves: setup.botMoves, automated: setup.automated }),
    createInitialState(setup, ctx) {
      return {
        state: {
          id: ctx.sessionId,
          version: 1,
          setup: { ...setup },
          pending: setup.botFirst ? setup.botMoves : 0,
          count: 0,
          human: 0,
        },
        events: [{ seq: 1, type: 'STARTED', actor: 'system', at: ctx.now, payload: { count: 0 } }],
      };
    },
    setupOf: (state) => ({ ...state.setup }),
    parseState(raw, expected) {
      const state = StateSchema.parse(raw);
      if (state.id !== expected.sessionId || state.version !== expected.version) {
        throw new Error('fake-auto snapshot mismatch');
      }
      return state;
    },
    version: (state) => state.version,
    applyCommand(state, envelope, ctx) {
      const parsed = EnvelopeSchema.safeParse(envelope);
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
      if (state.pending > 0 || state.finished === true) {
        return { ok: false, error: { code: 'ILLEGAL_COMMAND', messageKey: FAKE_NOT_YOUR_TURN } };
      }
      const finish = parsed.data.command.type === 'FINISH';
      const next: FakeAutoState = {
        ...state,
        version: state.version + 1,
        human: state.human + 1,
        pending: finish ? 0 : state.setup.botMoves,
        ...(finish ? { finished: true as const } : {}),
      };
      return {
        ok: true,
        state: next,
        events: [
          {
            seq: next.version,
            type: finish ? 'HUMAN_FINISHED' : 'HUMAN_ENDED',
            actor: 'p1',
            at: ctx.now,
            payload: { count: next.count },
          },
        ],
      };
    },
    toPlayerView: (state, ctx) => ({
      version: state.version,
      count: state.count,
      human: state.human,
      pending: state.pending,
      status: ctx.status,
    }),
    toPlayerEvents: (events) =>
      events.map((e) => ({
        seq: e.seq,
        type: e.type,
        actor: e.actor,
        count: e.payload.count,
        ...(e.payload.candidateId === undefined ? {} : { candidateId: e.payload.candidateId }),
      })),
    summarize: (state) => ({ count: state.count }),
    automation: {
      isAutomated: (state) => state.setup.automated,
      pendingActor(state) {
        if (control.throwPendingActor) throw new Error('fake-auto: pendingActor failure');
        return pendingActor(state);
      },
      decisionPoint(state) {
        control.decisionPoints += 1;
        if (control.throwPoint) throw new Error('fake-auto: decision point failure');
        if (pendingActor(state) === null) throw new Error('fake-auto: nothing pending');
        const point = decisionPointOf(state, control);
        return control.invalidPoint ? { ...point, fallbackCandidateId: 'not-a-candidate' } : point;
      },
      applyCandidate(state, candidateId, ctx) {
        control.applied.push(candidateId);
        if (
          pendingActor(state) === null ||
          control.reject.has(candidateId) ||
          !CANDIDATES.some((c) => c.id === candidateId)
        ) {
          return {
            ok: false,
            error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.fakeRejected' },
          };
        }
        const count = state.count + 1;
        const finished = state.setup.finishAfter !== undefined && count >= state.setup.finishAfter;
        const next: FakeAutoState = {
          ...state,
          version: state.version + 1,
          count,
          pending: control.pendingForever ? state.pending : state.pending - 1,
          ...(finished ? { finished: true as const } : {}),
        };
        return {
          ok: true,
          state: next,
          events: [
            {
              seq: next.version,
              type: 'BOT_MOVED',
              actor: 'p2',
              at: ctx.now,
              payload: { count, candidateId, secret: FAKE_AUTO_SECRET },
            },
          ],
        };
      },
    },
  };
  return { module: defineServerGameModule(typed), control };
}

/** `createApp` options with the fake automated game registered next to nothing else. */
export function fakeAutoApp(module: ServerGameModule) {
  return { gameModules: [module], gameDefinitions: [fakeAutoDefinition] };
}

// ---------------------------------------------------------------------------------------------------------
// FAKE_STRAT
// ---------------------------------------------------------------------------------------------------------

export type FakePick = (
  point: AutomationDecisionPoint,
  call: number,
) => CommanderChoice | Promise<CommanderChoice>;

/** A scripted `CommanderStrategy` that counts runs and calls; `gate` holds every call until it resolves. */
export class FakeStrategy implements CommanderStrategy {
  readonly id: 'bot' | 'openai';
  calls = 0;
  runs: CommanderRunContext[] = [];
  gate: Promise<void> | null = null;

  constructor(
    private readonly pick: FakePick = (point) => ({
      candidateId: point.fallbackCandidateId,
      source: 'bot',
    }),
    id: 'bot' | 'openai' = 'openai',
  ) {
    this.id = id;
  }

  startRun(ctx: CommanderRunContext): CommanderRun {
    this.runs.push(ctx);
    return {
      choose: async (point) => {
        this.calls += 1;
        const call = this.calls;
        if (this.gate) await this.gate;
        return this.pick(point, call);
      },
    };
  }
}

/** A promise with its resolver (gates of concurrency tests). */
export function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
