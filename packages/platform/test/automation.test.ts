import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_LIMITS,
  AutomationCandidateSchema,
  AutomationDecisionPointSchema,
  AutomationFallbackCodeSchema,
  AutomationRunSummarySchema,
  AutomationStopReasonSchema,
  AutomationStrategyIdSchema,
  RunAutomationRequestSchema,
  SessionAutomationSchema,
  SessionCommandOkSchema,
  SessionResponseSchema,
  defineServerGameModule,
  type AutomationDecisionPoint,
  type GameAutomation,
  type GameDefinition,
  type ServerGameModule,
  type SessionEventRecord,
} from '../src';

const s = (n: number, ch = 'x') => ch.repeat(n);

const candidates = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    type: 'MOVE',
    target: 'zone-1',
    summary: `Option ${i + 1}`,
  }));

const POINT: AutomationDecisionPoint = {
  actor: 'p2',
  phase: 'main',
  objective: 'Win the game.',
  situation: 'Round 1.\nYou hold zone-1.',
  candidates: candidates(3),
  fallbackCandidateId: 'c2',
  policyId: 'test-bot-v1:normal',
};

const ok = (value: unknown) => AutomationDecisionPointSchema.safeParse(value).success;

describe('AutomationDecisionPoint (Q-9, TC-PL-05)', () => {
  it('accepts a valid point, `target` optional, newlines allowed in texts', () => {
    expect(AutomationDecisionPointSchema.parse(POINT)).toEqual(POINT);
    const noTarget = { ...POINT, candidates: [{ id: 'c1', type: 'PASS', summary: 'Pass.' }] };
    expect(ok({ ...noTarget, fallbackCandidateId: 'c1' })).toBe(true);
  });

  it('candidates: 1..10 (boundaries accepted), 0 and 11 rejected', () => {
    expect(ok({ ...POINT, candidates: candidates(1), fallbackCandidateId: 'c1' })).toBe(true);
    expect(ok({ ...POINT, candidates: candidates(10), fallbackCandidateId: 'c10' })).toBe(true);
    expect(ok({ ...POINT, candidates: [], fallbackCandidateId: 'c1' })).toBe(false);
    expect(ok({ ...POINT, candidates: candidates(11), fallbackCandidateId: 'c1' })).toBe(false);
    expect(AUTOMATION_LIMITS.maxCandidates).toBe(10);
  });

  it('candidate ids: unique, /^[a-z0-9-]{1,32}$/', () => {
    const dup = [...candidates(2), { id: 'c1', type: 'X', summary: 'Dup.' }];
    expect(ok({ ...POINT, candidates: dup, fallbackCandidateId: 'c1' })).toBe(false);
    for (const bad of ['A1', 'a_1', s(33, 'a'), '', 'a 1', 'a:1']) {
      const c = [{ id: bad, type: 'X', summary: 'Bad.' }];
      expect(ok({ ...POINT, candidates: c, fallbackCandidateId: bad })).toBe(false);
    }
    const c32 = [{ id: s(32, 'a'), type: 'X', summary: 'Ok.' }];
    expect(ok({ ...POINT, candidates: c32, fallbackCandidateId: s(32, 'a') })).toBe(true);
  });

  it('fallbackCandidateId must be one of the candidates', () => {
    expect(ok({ ...POINT, fallbackCandidateId: 'c9' })).toBe(false);
    expect(ok({ ...POINT, fallbackCandidateId: 'C1' })).toBe(false);
  });

  it('length limits: summary 160 / target 64 / type 64 / objective 300 / situation 4000 / actor, phase 64', () => {
    const withCandidate = (patch: Record<string, unknown>) => ({
      ...POINT,
      candidates: [{ ...candidates(1)[0], ...patch }],
      fallbackCandidateId: 'c1',
    });
    expect(ok(withCandidate({ summary: s(160) }))).toBe(true);
    expect(ok(withCandidate({ summary: s(161) }))).toBe(false);
    expect(ok(withCandidate({ target: s(64) }))).toBe(true);
    expect(ok(withCandidate({ target: s(65) }))).toBe(false);
    expect(ok(withCandidate({ type: s(64) }))).toBe(true);
    expect(ok(withCandidate({ type: s(65) }))).toBe(false);
    expect(ok({ ...POINT, objective: s(300) })).toBe(true);
    expect(ok({ ...POINT, objective: s(301) })).toBe(false);
    expect(ok({ ...POINT, situation: s(4000) })).toBe(true);
    expect(ok({ ...POINT, situation: s(4001) })).toBe(false);
    expect(ok({ ...POINT, actor: s(64) })).toBe(true);
    expect(ok({ ...POINT, actor: s(65) })).toBe(false);
    expect(ok({ ...POINT, phase: s(64) })).toBe(true);
    expect(ok({ ...POINT, phase: s(65) })).toBe(false);
  });

  it('texts: non-empty, no control characters except \\n', () => {
    for (const field of ['actor', 'phase', 'objective', 'situation'] as const) {
      expect(ok({ ...POINT, [field]: '' })).toBe(false);
      expect(ok({ ...POINT, [field]: 'a\u0000b' })).toBe(false);
      expect(ok({ ...POINT, [field]: 'a\tb' })).toBe(false);
      expect(ok({ ...POINT, [field]: 'a\rb' })).toBe(false);
      expect(ok({ ...POINT, [field]: 'a\u009bb' })).toBe(false);
    }
    expect(ok({ ...POINT, situation: 'line 1\nline 2' })).toBe(true);
    expect(
      AutomationCandidateSchema.safeParse({ id: 'c1', type: 'X', summary: 'a\u0007' }).success,
    ).toBe(false);
    expect(AutomationCandidateSchema.safeParse({ id: 'c1', type: '', summary: 'a' }).success).toBe(
      false,
    );
  });

  it('policyId: /^[a-z0-9][a-z0-9:._-]{0,63}$/', () => {
    for (const good of ['bot', 'some-bot-v1:hard', 'a.b_c-1', s(64, 'a')]) {
      expect(ok({ ...POINT, policyId: good })).toBe(true);
    }
    for (const bad of ['', '-bot', 'Bot', 'bot v1', s(65, 'a')]) {
      expect(ok({ ...POINT, policyId: bad })).toBe(false);
    }
  });

  it('strict: unknown keys rejected on the point and on candidates', () => {
    expect(ok({ ...POINT, state: {} })).toBe(false);
    const extra = [{ ...candidates(1)[0], command: { t: 1 } }];
    expect(ok({ ...POINT, candidates: extra, fallbackCandidateId: 'c1' })).toBe(false);
  });
});

const NO_RUN = {
  steps: 0,
  pending: false,
  strategy: null,
  fallbacks: 0,
  fallbackReasons: [],
  stopReason: 'none',
};
const runOk = (patch: Record<string, unknown>) =>
  AutomationRunSummarySchema.safeParse({ ...NO_RUN, ...patch }).success;

describe('wire schemas (TC-PL-04, D-PO-3, Q-10, Q-BE-6)', () => {
  it('enums are exactly as specified', () => {
    expect(AutomationStrategyIdSchema.options).toEqual(['bot', 'openai']);
    expect(AutomationStopReasonSchema.options).toEqual([
      'humanTurn',
      'gameOver',
      'none',
      'stepLimit',
      'conflict',
      'error',
    ]);
    expect(AutomationFallbackCodeSchema.options).toEqual([
      'AI_TIMEOUT',
      'AI_RATE_LIMITED',
      'AI_PROVIDER_ERROR',
      'AI_INVALID_DECISION',
      'AI_NOT_CONFIGURED',
      'AI_BUDGET_EXCEEDED',
      'AI_DEADLINE',
    ]);
  });

  it('SessionAutomation: { pending, strategy ∈ bot|openai|null }, strict', () => {
    for (const strategy of ['bot', 'openai', null]) {
      expect(SessionAutomationSchema.safeParse({ pending: true, strategy }).success).toBe(true);
    }
    expect(SessionAutomationSchema.safeParse({ pending: false, strategy: 'mock' }).success).toBe(
      false,
    );
    expect(SessionAutomationSchema.safeParse({ pending: false }).success).toBe(false);
    expect(SessionAutomationSchema.safeParse({ pending: 'no', strategy: null }).success).toBe(
      false,
    );
    for (const leak of ['candidates', 'reason', 'prompt', 'policyId', 'spentUsd']) {
      expect(
        SessionAutomationSchema.safeParse({ pending: false, strategy: null, [leak]: 1 }).success,
      ).toBe(false);
    }
  });

  it('AutomationRunSummary: valid examples of the plan', () => {
    expect(AutomationRunSummarySchema.parse(NO_RUN)).toEqual(NO_RUN);
    expect(
      runOk({
        steps: 4,
        strategy: 'openai',
        fallbacks: 2,
        fallbackReasons: ['AI_TIMEOUT'],
        stopReason: 'humanTurn',
      }),
    ).toBe(true);
    expect(runOk({ steps: 1, strategy: 'bot', pending: true, stopReason: 'stepLimit' })).toBe(true);
    expect(
      runOk({
        steps: 3,
        strategy: 'openai',
        fallbacks: 3,
        fallbackReasons: ['AI_DEADLINE', 'AI_BUDGET_EXCEEDED', 'AI_NOT_CONFIGURED'],
        stopReason: 'gameOver',
      }),
    ).toBe(true);
  });

  it('AutomationRunSummary: strict, no secrets (candidates/reason/prompt/costs/policyId rejected)', () => {
    for (const leak of [
      'candidates',
      'reason',
      'prompt',
      'estimatedCostUsd',
      'spentUsd',
      'policyId',
    ]) {
      expect(runOk({ [leak]: 'x' })).toBe(false);
    }
    const { stopReason: _stopReason, ...withoutStopReason } = NO_RUN;
    expect(AutomationRunSummarySchema.safeParse(withoutStopReason).success).toBe(false);
    const { fallbackReasons: _fr, ...withoutReasons } = NO_RUN;
    expect(AutomationRunSummarySchema.safeParse(withoutReasons).success).toBe(false);
  });

  it('AutomationRunSummary: field types and enums', () => {
    expect(runOk({ steps: -1 })).toBe(false);
    expect(runOk({ steps: 1.5, strategy: 'bot' })).toBe(false);
    expect(runOk({ fallbacks: -1 })).toBe(false);
    expect(runOk({ strategy: 'mock' })).toBe(false);
    expect(runOk({ stopReason: 'done' })).toBe(false);
    // Q-23: unknown fallback code → rejected (the server maps it to AI_PROVIDER_ERROR)
    expect(
      runOk({ steps: 1, strategy: 'openai', fallbacks: 1, fallbackReasons: ['AI_UNKNOWN'] }),
    ).toBe(false);
  });

  it('AutomationRunSummary invariants: unique reasons, reasons ≤ fallbacks ≤ steps, strategy null ⇒ 0 steps', () => {
    const base = { steps: 3, strategy: 'openai', stopReason: 'humanTurn' };
    expect(runOk({ ...base, fallbacks: 2, fallbackReasons: ['AI_TIMEOUT', 'AI_TIMEOUT'] })).toBe(
      false,
    );
    expect(
      runOk({ ...base, fallbacks: 1, fallbackReasons: ['AI_TIMEOUT', 'AI_RATE_LIMITED'] }),
    ).toBe(false);
    expect(runOk({ ...base, fallbacks: 4, fallbackReasons: ['AI_TIMEOUT'] })).toBe(false);
    expect(runOk({ ...base, fallbacks: 3, fallbackReasons: ['AI_TIMEOUT'] })).toBe(true);
    expect(runOk({ steps: 1, strategy: null, stopReason: 'humanTurn' })).toBe(false);
    expect(runOk({ steps: 0, strategy: null, pending: false, stopReason: 'none' })).toBe(true);
  });

  it('RunAutomationRequest: only {} (Q-10)', () => {
    expect(RunAutomationRequestSchema.safeParse({}).success).toBe(true);
    for (const bad of [{ steps: 1 }, { maxSteps: 5 }, null, [], 'x', 1]) {
      expect(RunAutomationRequestSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('SessionResponse / SessionCommandOk carry the automation shapes (required)', () => {
    const response = {
      sessionId: 's-1',
      gameId: 'g',
      status: 'active',
      settings: {},
      view: {},
      automation: { pending: true, strategy: 'bot' },
    };
    expect(SessionResponseSchema.safeParse(response).success).toBe(true);
    expect(
      SessionResponseSchema.safeParse({ ...response, automation: { ...NO_RUN } }).success,
    ).toBe(false);
    const commandOk = { ok: true, view: {}, events: [], automation: NO_RUN };
    expect(SessionCommandOkSchema.safeParse(commandOk).success).toBe(true);
    expect(
      SessionCommandOkSchema.safeParse({
        ...commandOk,
        automation: { pending: false, strategy: null },
      }).success,
    ).toBe(false);
  });
});

describe('GameAutomation / ServerGameModule (TC-PL-03)', () => {
  interface S {
    id: string;
    version: number;
    turn: 'p1' | 'p2';
    auto: boolean;
  }
  interface E extends SessionEventRecord {
    type: 'MOVED';
  }
  const definition: GameDefinition = {
    id: 'toy',
    name: 'Toy',
    descriptionKey: 'toy.meta:description',
    status: 'available',
    supportedPlayers: [1],
    supportsAI: true,
  };
  const base = {
    definition,
    parseSetup: () => ({ ok: true as const, value: {} }),
    parseStoredSetup: () => ({}),
    initialStatus: () => 'active' as const,
    statusOf: () => 'active' as const,
    publicSettings: () => ({}),
    createInitialState: (_setup: object, ctx: { sessionId: string }) => ({
      state: { id: ctx.sessionId, version: 1, turn: 'p1' as const, auto: true },
      events: [],
    }),
    setupOf: () => ({}),
    parseState: (raw: unknown) => raw as S,
    version: (state: S) => state.version,
    applyCommand: (state: S) => ({ ok: true as const, state, events: [] as E[] }),
    toPlayerView: () => ({}),
    toPlayerEvents: (events: readonly E[]) => [...events],
    summarize: () => ({}),
  };

  it('a module WITHOUT automation compiles (the field is optional)', () => {
    const m: ServerGameModule = defineServerGameModule<S, object, E>(base);
    expect(m.automation).toBeUndefined();
    type Optional = undefined extends ServerGameModule['automation'] ? true : false;
    const optional: Optional = true;
    expect(optional).toBe(true);
  });

  it('a module WITH automation is assignable to the registry type and runs generically', () => {
    const automation: GameAutomation<S, E> = {
      isAutomated: (state) => state.auto,
      pendingActor: (state) => (state.auto && state.turn === 'p2' ? 'p2' : null),
      decisionPoint: (state) => {
        if (!(state.auto && state.turn === 'p2')) throw new Error('not pending');
        return { ...POINT, candidates: candidates(2), fallbackCandidateId: 'c1' };
      },
      applyCandidate: (state, candidateId, ctx) =>
        candidateId === 'c1' || candidateId === 'c2'
          ? {
              ok: true,
              state: { ...state, version: state.version + 1, turn: 'p1' },
              events: [
                { seq: state.version, type: 'MOVED', actor: 'p2', at: ctx.now, payload: null },
              ],
            }
          : { ok: false, error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.illegalCommand' } },
    };
    const registry: readonly ServerGameModule[] = [
      defineServerGameModule<S, object, E>({ ...base, automation }),
    ];
    const auto = registry[0]!.automation!;
    const waiting: S = { id: 's', version: 2, turn: 'p2', auto: true };
    expect(auto.isAutomated(waiting)).toBe(true);
    expect(auto.pendingActor(waiting)).toBe('p2');
    const point = AutomationDecisionPointSchema.parse(auto.decisionPoint(waiting));
    const res = auto.applyCandidate(waiting, point.fallbackCandidateId, { now: 'now' });
    expect(res.ok).toBe(true);
    expect(res.ok && auto.pendingActor(res.state)).toBe(null);
    expect(auto.applyCandidate(waiting, 'c9', { now: 'now' }).ok).toBe(false);
  });
});

describe('game-agnostic (TC-PL-01 subset)', () => {
  it('automation.ts contains no game words', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/automation.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(
      /rebel|empire|faction|ruleset|gameMode|leader|base system|activat|rebellion/i,
    );
  });
});
