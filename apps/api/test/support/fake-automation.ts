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
 *
 * SWR-008 (W6b, TC-CT-06 / TC-FB-05): the decision point carries a public `rulesQuery` (`control.rulesQuery`, default
 * `{ commandTypes: ['MOVE', 'WAIT'], tags: [] }`; `null` → absent), and `createFakeAutoGame(control, { rules })`
 * optionally registers `GameRulesSupport` on the tiny knowledge base `test/fixtures/tiny-kb` (game `fake`, ids
 * `fake:*`, pinned `fake:impl.engine-scope`, tag `quiet` → `fake:move.wait`) — see `tinyKbRules`. Only the generic
 * platform rules-kb provider is used: no Rebellion code.
 */
import { fileURLToPath } from 'node:url';
import {
  CommandEnvelopeFrameSchema,
  ERROR_MESSAGE_KEYS,
  defineServerGameModule,
  toValidationIssues,
  type AutomationDecisionPoint,
  type AutomationRulesQuery,
  type GameDefinition,
  type GameRulesSupport,
  type RulesContextProvider,
  type ServerGameModule,
} from '@bga/platform';
import { createKnowledgeBaseRulesProvider } from '@bga/platform/rules-kb';
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
  /** A fourth candidate `c4` (MOVE east) is offered: other candidates, same public `rulesQuery` (TC-INT-02). */
  extraCandidate: boolean;
  /** SWR-008: public `rulesQuery` of the decision point; `null` → the point has none. */
  rulesQuery: Readonly<AutomationRulesQuery> | null;
  /** Ids passed to `applyCandidate`, in order. */
  applied: string[];
  decisionPoints: number;
}

/** Default public `rulesQuery` of the fake decision point (the public command types of an automated move). */
export const FAKE_RULES_QUERY: Readonly<AutomationRulesQuery> = Object.freeze({
  commandTypes: ['MOVE', 'WAIT'],
  tags: [],
});

export function fakeAutoControl(): FakeAutoControl {
  return {
    reject: new Set(),
    fallbackId: 'c1',
    pendingForever: false,
    invalidPoint: false,
    throwPoint: false,
    singleCandidate: false,
    throwPendingActor: false,
    extraCandidate: false,
    rulesQuery: FAKE_RULES_QUERY,
    applied: [],
    decisionPoints: 0,
  };
}

const CANDIDATES = [
  { id: 'c1', type: 'MOVE', target: 'north', summary: 'Move one step north.' },
  { id: 'c2', type: 'MOVE', target: 'south', summary: 'Move one step south.' },
  { id: 'c3', type: 'WAIT', summary: 'Wait and end this move.' },
  { id: 'c4', type: 'MOVE', target: 'east', summary: 'Move one step east.' },
] as const;

/** Candidates offered by default (`c4` only with `control.extraCandidate`). */
const BASE_CANDIDATES = CANDIDATES.slice(0, 3);

function decisionPointOf(state: FakeAutoState, control: FakeAutoControl): AutomationDecisionPoint {
  const offered = control.extraCandidate ? [...CANDIDATES] : [...BASE_CANDIDATES];
  const candidates = control.singleCandidate
    ? [CANDIDATES.find((c) => c.id === control.fallbackId) ?? CANDIDATES[0]]
    : offered;
  return {
    actor: 'p2',
    phase: 'bot-turn',
    objective: 'Make the configured number of moves.',
    situation: `Moves left this turn: ${state.pending}. Moves made so far: ${state.count}.`,
    candidates,
    fallbackCandidateId: control.fallbackId,
    policyId: 'fake-bot-v1',
    ...(control.rulesQuery === null
      ? {}
      : {
          rulesQuery: {
            commandTypes: [...control.rulesQuery.commandTypes],
            tags: [...control.rulesQuery.tags],
          },
        }),
  };
}

// ---------------------------------------------------------------------------------------------------------
// SWR-008: rules of the fake game (tiny knowledge base, generic platform provider)
// ---------------------------------------------------------------------------------------------------------

/** Absolute directory of the tiny knowledge base (game `fake`). */
export const TINY_KB_DIR = fileURLToPath(new URL('../fixtures/tiny-kb', import.meta.url));
export const TINY_KB_ENGINE_SCOPE = 'fake:impl.engine-scope';
/** Tag → entries of the fake game (`quiet` → the waiting rule). */
export const TINY_KB_TAG_RULES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  quiet: Object.freeze(['fake:move.wait']),
});

export interface TinyKbRulesSpy {
  /** Every provider built from this support (one per server start). */
  providers: RulesContextProvider[];
  /** Number of `selectRules` calls over all providers. */
  selections: number;
  /** When set, `selectRules` throws this error (TC-FB-09). */
  throwOnSelect: Error | null;
  /** When set, `selectRules` results are rewritten (a provider that breaks its contract). */
  rewrite: ((result: ReturnType<RulesContextProvider['selectRules']>) => unknown) | null;
}

/**
 * `GameRulesSupport` on the tiny knowledge base through the generic `createKnowledgeBaseRulesProvider` (the same path
 * a real game uses), with a spy that counts selections and can make them fail.
 */
export function tinyKbRules(knowledgeBaseDir: string = TINY_KB_DIR): {
  rules: GameRulesSupport;
  spy: TinyKbRulesSpy;
} {
  const spy: TinyKbRulesSpy = { providers: [], selections: 0, throwOnSelect: null, rewrite: null };
  const rules: GameRulesSupport = {
    knowledgeBaseDir,
    createRulesContextProvider(source) {
      const inner = createKnowledgeBaseRulesProvider(source, {
        pinnedRuleIds: [TINY_KB_ENGINE_SCOPE],
        tagRules: TINY_KB_TAG_RULES,
      });
      const provider: RulesContextProvider = {
        rulesVersion: inner.rulesVersion,
        requiredChars: inner.requiredChars,
        selectRules(input) {
          spy.selections += 1;
          if (spy.throwOnSelect) throw spy.throwOnSelect;
          const result = inner.selectRules(input);
          return spy.rewrite ? (spy.rewrite(result) as typeof result) : result;
        },
      };
      spy.providers.push(provider);
      return provider;
    },
  };
  return { rules, spy };
}

export function createFakeAutoGame(
  control: FakeAutoControl = fakeAutoControl(),
  options: { rules?: GameRulesSupport } = {},
): {
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
          !CANDIDATES.some((c) => c.id === candidateId) ||
          (candidateId === 'c4' && !control.extraCandidate)
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
    ...(options.rules === undefined ? {} : { rules: options.rules }),
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

/**
 * A scripted `CommanderStrategy` that counts runs and calls; `gate` holds every call until it resolves.
 * `atGate` counts the calls that have reached the gate (SWR-008 review F-1): `reachedGate(n)` resolves once `n` calls
 * are waiting there, so a concurrency test can release the gate only after every run has really loaded its state.
 */
export class FakeStrategy implements CommanderStrategy {
  readonly id: 'bot' | 'openai';
  calls = 0;
  runs: CommanderRunContext[] = [];
  gate: Promise<void> | null = null;
  atGate = 0;
  private readonly gateWaiters: { n: number; resolve: () => void }[] = [];

  /** Resolves when at least `n` calls (over all runs of this strategy) have reached `gate`. */
  reachedGate(n = 1): Promise<void> {
    if (this.atGate >= n) return Promise.resolve();
    return new Promise((resolve) => this.gateWaiters.push({ n, resolve }));
  }

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
        if (this.gate) {
          this.atGate += 1;
          for (const w of this.gateWaiters.filter((x) => x.n <= this.atGate)) {
            this.gateWaiters.splice(this.gateWaiters.indexOf(w), 1);
            w.resolve();
          }
          await this.gate;
        }
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
