/**
 * SWR-006 W7 — `OpenAiCommanderStrategy` on a fake `AiDecisionService` (plan-backend §8.2; AC-09, D-PO-3; Q-7, Q-20,
 * Q-BE-1, Q-BE-2, Q-BE-7; TC-OA-02). Every failure → the bot's pick with a fallback code; run-stopping codes end
 * model calls for the rest of the run; the deadline wins a `Promise.race`; the model never sees the session id.
 */
import type { AutomationDecisionPoint } from '@bga/platform';
import { describe, expect, it } from 'vitest';
import type { AiDecisionOutcome, AiDecisionService } from '../../src/ai/ai-decision.service';
import { AiFailure } from '../../src/ai/ai.errors';
import type { AIDecisionContext } from '../../src/ai/ai.types';
import { buildPrompt } from '../../src/ai/prompt';
import { DEFAULT_AI_RUNTIME } from '../../src/ai/ai.types';
import { createCommanderStrategy } from '../../src/sessions/automation/automation.providers';
import { BotCommanderStrategy } from '../../src/sessions/automation/commander-strategy';
import {
  OpenAiCommanderStrategy,
  fallbackCodeOf,
  type DeadlineTimer,
} from '../../src/sessions/automation/openai-commander.strategy';
import { testConfig } from '../support/test-config';

const SESSION = 'f00d0000-1111-4222-8333-444455556666';

const POINT: AutomationDecisionPoint = {
  actor: 'p2',
  phase: 'orders',
  objective: 'Win the game.',
  situation: 'Round 2. Nothing else is known.',
  candidates: [
    { id: 'c1', type: 'MOVE', target: 'a', summary: 'Move to a.' },
    { id: 'c2', type: 'MOVE', summary: 'Move somewhere else.' },
    { id: 'c3', type: 'PASS', summary: 'Pass.' },
  ],
  fallbackCandidateId: 'c1',
  policyId: 'fake-bot-v1:normal',
};

type Script = (ctx: AIDecisionContext, call: number) => Promise<AiDecisionOutcome>;

function decided(id: string): Promise<AiDecisionOutcome> {
  return Promise.resolve({
    decision: { selectedActionId: id, reason: 'secret reason' } as AiDecisionOutcome['decision'],
    budget: {} as AiDecisionOutcome['budget'],
  });
}

function fakeDecisions(script: Script) {
  const calls: AIDecisionContext[] = [];
  return {
    calls,
    decisions: {
      decide: (ctx: AIDecisionContext, requested: 'auto' | 'mock') => {
        expect(requested).toBe('auto');
        calls.push(ctx);
        return script(ctx, calls.length);
      },
    },
  };
}

/** A manual timer: `fire()` elapses every pending deadline. */
function manualTimer(): { timer: DeadlineTimer; fire: () => void; started: number[] } {
  const pending = new Set<() => void>();
  const started: number[] = [];
  return {
    started,
    timer: (ms, onElapsed) => {
      started.push(ms);
      pending.add(onElapsed);
      return () => pending.delete(onElapsed);
    },
    fire: () => {
      for (const f of [...pending]) f();
      pending.clear();
    },
  };
}

function strategy(script: Script, opts: { now?: () => number; timer?: DeadlineTimer } = {}) {
  const fake = fakeDecisions(script);
  const errors: string[] = [];
  const errorSessions: string[] = [];
  const s = new OpenAiCommanderStrategy({
    decisions: fake.decisions,
    modelRole: 'tactical',
    monotonicNow: opts.now ?? (() => 0),
    timer: opts.timer ?? manualTimer().timer,
    onUnexpectedError: (name, sessionId) => {
      errors.push(name);
      errorSessions.push(sessionId);
    },
  });
  return { s, calls: fake.calls, errors, errorSessions };
}

describe('OpenAiCommanderStrategy (SWR-006 W7)', () => {
  it('a valid model pick → source openai; the context is the commander context with budgetKey = sessionId', async () => {
    const { s, calls } = strategy(() => decided('c2'));
    const run = s.startRun({ sessionId: SESSION, deadline: 45_000 });
    expect(await run.choose(POINT)).toEqual({ candidateId: 'c2', source: 'openai' });
    expect(calls).toHaveLength(1);
    const ctx = calls[0]!;
    expect(ctx).toEqual({
      purpose: 'commander',
      budgetKey: SESSION,
      role: 'tactical',
      side: 'p2',
      phase: 'orders',
      objective: 'Win the game.',
      situation: 'Round 2. Nothing else is known.',
      availableActions: [
        { id: 'c1', type: 'MOVE', target: 'a', summary: 'Move to a.' },
        { id: 'c2', type: 'MOVE', summary: 'Move somewhere else.' },
        { id: 'c3', type: 'PASS', summary: 'Pass.' },
      ],
    });
    // Q-BE-1: the prompt never carries the session id (budget key) or the bot's policy id.
    const prompt = buildPrompt(ctx);
    expect(`${prompt.instructions}\n${prompt.input}`).not.toContain(SESSION);
    expect(prompt.input).not.toContain('fake-bot-v1');
  });

  it('TC-OA-02: fewer than 2 candidates → the bot without a call and without a fallback code', async () => {
    const { s, calls } = strategy(() => decided('c1'));
    const run = s.startRun({ sessionId: SESSION, deadline: 45_000 });
    const single = { ...POINT, candidates: [POINT.candidates[0]!] };
    expect(await run.choose(single)).toEqual({ candidateId: 'c1', source: 'bot' });
    expect(calls).toHaveLength(0);
  });

  it('an id outside the candidates (defence in depth) → the bot, AI_INVALID_DECISION', async () => {
    const { s } = strategy(() => decided('x-evil'));
    const run = s.startRun({ sessionId: SESSION, deadline: 45_000 });
    expect(await run.choose(POINT)).toEqual({
      candidateId: 'c1',
      source: 'bot',
      fallbackCode: 'AI_INVALID_DECISION',
    });
  });

  it.each([
    ['timeout', AiFailure.timeout(), 'AI_TIMEOUT'],
    ['rate limit', AiFailure.rateLimited(), 'AI_RATE_LIMITED'],
    ['5xx', AiFailure.providerError('upstream'), 'AI_PROVIDER_ERROR'],
    ['invalid answer', AiFailure.invalidDecision('malformed'), 'AI_INVALID_DECISION'],
  ] as const)(
    'Q-7: %s → the bot with its code; the NEXT step calls the model again',
    async (_name, failure, code) => {
      const { s, calls } = strategy((_ctx, call) =>
        call === 1 ? Promise.reject(failure) : decided('c3'),
      );
      const run = s.startRun({ sessionId: SESSION, deadline: 45_000 });
      expect(await run.choose(POINT)).toEqual({
        candidateId: 'c1',
        source: 'bot',
        fallbackCode: code,
      });
      expect(await run.choose(POINT)).toEqual({ candidateId: 'c3', source: 'openai' });
      expect(calls).toHaveLength(2);
    },
  );

  it.each([
    ['not configured', AiFailure.notConfigured('tactical'), 'AI_NOT_CONFIGURED'],
    ['key rejected', AiFailure.keyRejected('tactical', 'm'), 'AI_NOT_CONFIGURED'],
    ['pricing unknown', AiFailure.pricingUnknown('tactical', 'm'), 'AI_NOT_CONFIGURED'],
    [
      'budget exceeded',
      AiFailure.budgetExceeded({
        budgetKey: SESSION,
        spentMicroUsd: 1,
        limitMicroUsd: 1,
        remainingMicroUsd: 0,
        requiredMicroUsd: 5,
      }),
      'AI_BUDGET_EXCEEDED',
    ],
    ['insufficient quota', AiFailure.providerError('quota'), 'AI_PROVIDER_ERROR'],
  ] as const)(
    'Q-7 / Q-BE-7: %s → the bot; the rest of the run is the bot without calls (same code)',
    async (_name, failure, code) => {
      const { s, calls } = strategy(() => Promise.reject(failure));
      const run = s.startRun({ sessionId: SESSION, deadline: 45_000 });
      for (let i = 0; i < 3; i += 1) {
        expect(await run.choose(POINT)).toEqual({
          candidateId: 'c1',
          source: 'bot',
          fallbackCode: code,
        });
      }
      expect(calls).toHaveLength(1);
      // A new run tries again (the budget / configuration may have changed).
      const next = s.startRun({ sessionId: SESSION, deadline: 45_000 });
      await next.choose(POINT);
      expect(calls).toHaveLength(2);
    },
  );

  it('Q-20: an unexpected error → the bot, AI_PROVIDER_ERROR; only the class name is reported', async () => {
    const { s, errors, errorSessions } = strategy(() =>
      Promise.reject(new RangeError('secret details')),
    );
    const run = s.startRun({ sessionId: SESSION, deadline: 45_000 });
    expect(await run.choose(POINT)).toEqual({
      candidateId: 'c1',
      source: 'bot',
      fallbackCode: 'AI_PROVIDER_ERROR',
    });
    expect(errors).toEqual(['RangeError']);
    // Review F-5: the report carries the run's session id (the budget key), never sent to a model.
    expect(errorSessions).toEqual([SESSION]);

    const sync = strategy(() => {
      throw new TypeError('sync');
    });
    const run2 = sync.s.startRun({ sessionId: SESSION, deadline: 45_000 });
    expect((await run2.choose(POINT)).fallbackCode).toBe('AI_PROVIDER_ERROR');
  });

  it('review F-5: the STRATEGY_ERROR line of the configured OpenAI strategy carries the sessionId', async () => {
    const lines: string[] = [];
    const fake = fakeDecisions(() => Promise.reject(new RangeError('secret details')));
    const configured = createCommanderStrategy(
      testConfig({ aiCommander: { provider: 'openai' } }),
      { logSink: (_level, line) => lines.push(line) },
      fake.decisions as unknown as AiDecisionService,
      { ...DEFAULT_AI_RUNTIME, monotonicNow: () => 0 },
    );
    const run = configured.startRun({ sessionId: SESSION, deadline: 45_000 });
    expect((await run.choose(POINT)).fallbackCode).toBe('AI_PROVIDER_ERROR');
    expect(lines).toEqual([
      `automation.error sessionId=${SESSION} gameId=? step=0 code=STRATEGY_ERROR error=RangeError`,
    ]);
    expect(lines.join('\n')).not.toContain('secret details');
  });

  it('Q-BE-2 / AM-BE-5: the deadline wins the race → AI_DEADLINE, the rest of the run is the bot without calls', async () => {
    const manual = manualTimer();
    let now = 1_000;
    let settle: (() => void) | undefined;
    const { s, calls } = strategy(
      () =>
        new Promise<AiDecisionOutcome>((resolve) => {
          settle = () => void decided('c2').then(resolve);
        }),
      { now: () => now, timer: manual.timer },
    );
    const run = s.startRun({ sessionId: SESSION, deadline: 1_000 + 45_000 });
    const pending = run.choose(POINT);
    await Promise.resolve();
    expect(manual.started).toEqual([45_000]);
    manual.fire();
    expect(await pending).toEqual({
      candidateId: 'c1',
      source: 'bot',
      fallbackCode: 'AI_DEADLINE',
    });
    // The losing call finishes in the background without effect on the run.
    settle?.();
    expect(await run.choose(POINT)).toEqual({
      candidateId: 'c1',
      source: 'bot',
      fallbackCode: 'AI_DEADLINE',
    });
    expect(calls).toHaveLength(1);

    // Deadline already over before a call → no call at all.
    now = 100_000;
    const late = s.startRun({ sessionId: SESSION, deadline: 99_000 });
    expect(await late.choose(POINT)).toEqual({
      candidateId: 'c1',
      source: 'bot',
      fallbackCode: 'AI_DEADLINE',
    });
    expect(calls).toHaveLength(1);
  });

  it('a decision before the deadline cancels the timer', async () => {
    const cancelled: number[] = [];
    const timer: DeadlineTimer = (ms) => () => cancelled.push(ms);
    const { s } = strategy(() => decided('c2'), { now: () => 10, timer });
    const run = s.startRun({ sessionId: SESSION, deadline: 1_010 });
    expect(await run.choose(POINT)).toEqual({ candidateId: 'c2', source: 'openai' });
    expect(cancelled).toEqual([1_000]);
  });

  it('fallbackCodeOf keeps the D-PO-3 codes and maps anything else to AI_PROVIDER_ERROR', () => {
    expect(fallbackCodeOf(AiFailure.timeout())).toBe('AI_TIMEOUT');
    const devForbidden = new AiFailure({ code: 'AI_DEV_FORBIDDEN', messageKey: 'errors.x' });
    expect(fallbackCodeOf(devForbidden)).toBe('AI_PROVIDER_ERROR');
  });

  it('BotCommanderStrategy returns the bot pick without a code', async () => {
    const bot = new BotCommanderStrategy();
    expect(bot.id).toBe('bot');
    const run = bot.startRun();
    expect(await run.choose({ ...POINT, fallbackCandidateId: 'c3' })).toEqual({
      candidateId: 'c3',
      source: 'bot',
    });
  });
});
