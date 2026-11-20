/**
 * SWR-006 W7 — `OpenAiCommanderStrategy` on a fake `AiDecisionService` (plan-backend §8.2; AC-09, D-PO-3; Q-7, Q-20,
 * Q-BE-1, Q-BE-2, Q-BE-7; TC-OA-02). Every failure → the bot's pick with a fallback code; run-stopping codes end
 * model calls for the rest of the run; the deadline wins a `Promise.race`; the model never sees the session id.
 *
 * SWR-008 W6b (C-10, plan-backend §3.1 / §4.2): the rules of the run's provider reach the context only through
 * `rulesSelectionInputOf(point)`; no selection without a call (< 2 candidates, stop code, deadline — TC-INT-03,
 * TC-FB-03); a failing selection → no rules + an error class name (TC-FB-09); a prompt that does not fit even
 * without rules → `AI_PROMPT_TOO_LARGE` without a call, the run goes on (TC-BUD-07); reduced / dropped levels.
 */
import {
  RULES_CONTEXT_LIMITS,
  rulesSelectionInputOf,
  type AutomationDecisionPoint,
  type RulesContextProvider,
  type RulesContextResult,
  type RulesSelectionInput,
} from '@bga/platform';
import { describe, expect, it } from 'vitest';
import type { AiDecisionOutcome, AiDecisionService } from '../../src/ai/ai-decision.service';
import { AiFailure } from '../../src/ai/ai.errors';
import type { AIDecisionContext } from '../../src/ai/ai.types';
import {
  COMMANDER_INSTRUCTIONS,
  COMMANDER_RULES_INSTRUCTIONS,
  RULES_BLOCK_HEADER,
  buildPrompt,
} from '../../src/ai/prompt';
import { promptUpperBound } from '../../src/ai/prompt-fit';
import { DEFAULT_AI_RUNTIME } from '../../src/ai/ai.types';
import { createCommanderStrategy } from '../../src/sessions/automation/automation.providers';
import { BotCommanderStrategy } from '../../src/sessions/automation/commander-strategy';
import {
  commanderBaseContext,
  type CommanderRulesConfig,
} from '../../src/sessions/automation/commander-context';
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

/** SWR-008: rules on with the default limits (a run without a provider sends no rules block). */
const RULES_ON: CommanderRulesConfig = { enabled: true, maxChars: 6000, maxPromptTokens: 16_000 };

function strategy(
  script: Script,
  opts: {
    now?: () => number;
    timer?: DeadlineTimer;
    rules?: CommanderRulesConfig;
    onRulesSelectionError?: (name: string, sessionId: string, gameId: string) => void;
  } = {},
) {
  const fake = fakeDecisions(script);
  const errors: string[] = [];
  const errorSessions: string[] = [];
  const s = new OpenAiCommanderStrategy({
    decisions: fake.decisions,
    modelRole: 'tactical',
    rules: opts.rules ?? RULES_ON,
    ...(opts.onRulesSelectionError ? { onRulesSelectionError: opts.onRulesSelectionError } : {}),
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
    const run = s.startRun({ sessionId: SESSION, deadline: 45_000, rules: null });
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
      // SWR-008: no provider for this run → no rules block, only the accounting (never sent).
      rulesAccounting: {
        enabled: true,
        rulesVersion: null,
        ruleIds: [],
        chars: 0,
        truncated: false,
        dropped: false,
      },
    });
    // Q-BE-1: the prompt never carries the session id (budget key) or the bot's policy id.
    const prompt = buildPrompt(ctx);
    expect(`${prompt.instructions}\n${prompt.input}`).not.toContain(SESSION);
    expect(prompt.input).not.toContain('fake-bot-v1');
  });

  it('TC-OA-02: fewer than 2 candidates → the bot without a call and without a fallback code', async () => {
    const { s, calls } = strategy(() => decided('c1'));
    const run = s.startRun({ sessionId: SESSION, deadline: 45_000, rules: null });
    const single = { ...POINT, candidates: [POINT.candidates[0]!] };
    expect(await run.choose(single)).toEqual({ candidateId: 'c1', source: 'bot' });
    expect(calls).toHaveLength(0);
  });

  it('an id outside the candidates (defence in depth) → the bot, AI_INVALID_DECISION', async () => {
    const { s } = strategy(() => decided('x-evil'));
    const run = s.startRun({ sessionId: SESSION, deadline: 45_000, rules: null });
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
      const run = s.startRun({ sessionId: SESSION, deadline: 45_000, rules: null });
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
      const run = s.startRun({ sessionId: SESSION, deadline: 45_000, rules: null });
      for (let i = 0; i < 3; i += 1) {
        expect(await run.choose(POINT)).toEqual({
          candidateId: 'c1',
          source: 'bot',
          fallbackCode: code,
        });
      }
      expect(calls).toHaveLength(1);
      // A new run tries again (the budget / configuration may have changed).
      const next = s.startRun({ sessionId: SESSION, deadline: 45_000, rules: null });
      await next.choose(POINT);
      expect(calls).toHaveLength(2);
    },
  );

  it('Q-20: an unexpected error → the bot, AI_PROVIDER_ERROR; only the class name is reported', async () => {
    const { s, errors, errorSessions } = strategy(() =>
      Promise.reject(new RangeError('secret details')),
    );
    const run = s.startRun({ sessionId: SESSION, deadline: 45_000, rules: null });
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
    const run2 = sync.s.startRun({ sessionId: SESSION, deadline: 45_000, rules: null });
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
    const run = configured.startRun({ sessionId: SESSION, deadline: 45_000, rules: null });
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
    const run = s.startRun({ sessionId: SESSION, deadline: 1_000 + 45_000, rules: null });
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
    const late = s.startRun({ sessionId: SESSION, deadline: 99_000, rules: null });
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
    const run = s.startRun({ sessionId: SESSION, deadline: 1_010, rules: null });
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

// ---------------------------------------------------------------------------------------------------------
// SWR-008 W6b: rules context of the commander
// ---------------------------------------------------------------------------------------------------------

/** A point with a public rules query (the selection input must come from it, never from the candidates). */
const RQ_POINT: AutomationDecisionPoint = {
  ...POINT,
  rulesQuery: { commandTypes: ['PASS', 'MOVE'], tags: ['quiet'] },
};

const LINES = [
  ['g:engine', '[g:engine] Engine scope: only moving and passing exist (FR p.1)'],
  ['g:core.win', '[g:core.win] Winning: the side with more points wins (FR p.2)'],
  ['g:move.step', '[g:move.step] Moving: a move goes one step (FR p.3)'],
  ['g:pass.end', '[g:pass.end] Passing: a pass ends the round for the side (FR p.3)'],
] as const;

/**
 * A provider stub with the R-2 shape: the pinned line first, whole lines while they fit `maxChars`, `RangeError`
 * below `requiredChars`. Records every input.
 */
function stubProvider(opts: { fail?: Error; broken?: boolean } = {}) {
  const inputs: RulesSelectionInput[] = [];
  const requiredChars = LINES[0][1].length;
  const provider: RulesContextProvider = {
    rulesVersion: 'g@1:0123456789ab',
    requiredChars,
    selectRules(input) {
      inputs.push(input);
      if (opts.fail) throw opts.fail;
      if (input.maxChars < requiredChars) throw new RangeError('maxChars below the pinned lines');
      const ids: string[] = [];
      const lines: string[] = [];
      let truncated = false;
      for (const [id, line] of LINES) {
        const next = [...lines, line].join('\n');
        if (next.length > input.maxChars) {
          truncated = true;
          break;
        }
        ids.push(id);
        lines.push(line);
      }
      const result: RulesContextResult = {
        text: lines.join('\n'),
        ruleIds: ids,
        truncated,
        rulesVersion: 'g@1:0123456789ab',
      };
      // A provider breaking its contract: one id more than lines.
      return opts.broken ? { ...result, ruleIds: [...ids, 'g:ghost'] } : result;
    },
  };
  return { provider, inputs };
}

const FULL_TEXT = LINES.map(([, line]) => line).join('\n');

describe('OpenAiCommanderStrategy — SWR-008 rules context (W6b, C-10)', () => {
  it('TC-INT-02 (unit): the rules block of the run provider is selected from rulesSelectionInputOf(point) only and sent before the Game block', async () => {
    const { s, calls } = strategy(() => decided('c2'));
    const stub = stubProvider();
    const run = s.startRun({ sessionId: SESSION, deadline: 45_000, rules: stub.provider });
    expect(await run.choose(RQ_POINT)).toEqual({ candidateId: 'c2', source: 'openai' });

    expect(stub.inputs).toEqual([rulesSelectionInputOf(RQ_POINT, RULES_ON.maxChars)]);
    expect(stub.inputs[0]).toEqual({
      actor: 'p2',
      phase: 'orders',
      commandTypes: ['MOVE', 'PASS'],
      tags: ['quiet'],
      maxChars: 6000,
    });
    // Nothing of the candidates / situation reaches the selector (QD-7).
    const serialized = JSON.stringify(stub.inputs);
    for (const leak of ['c1', 'Move to a.', 'Round 2', 'fake-bot-v1', SESSION]) {
      expect(serialized).not.toContain(leak);
    }

    const ctx = calls[0]!;
    expect(ctx.rules).toEqual({
      text: FULL_TEXT,
      ruleIds: LINES.map(([id]) => id),
      rulesVersion: 'g@1:0123456789ab',
      truncated: false,
    });
    expect(ctx.rulesAccounting).toEqual({
      enabled: true,
      rulesVersion: 'g@1:0123456789ab',
      ruleIds: LINES.map(([id]) => id),
      chars: FULL_TEXT.length,
      truncated: false,
      dropped: false,
    });
    const prompt = buildPrompt(ctx);
    expect(prompt.instructions).toBe(`${COMMANDER_INSTRUCTIONS} ${COMMANDER_RULES_INSTRUCTIONS}`);
    expect(prompt.input.startsWith(`${RULES_BLOCK_HEADER}${FULL_TEXT}\n\nGame (data):\n`)).toBe(
      true,
    );
    expect(`${prompt.instructions}\n${prompt.input}`).not.toContain(SESSION);
  });

  it('AM-BE-1: other candidates / situation with the same actor, phase and rulesQuery → the same input and the same block', async () => {
    const { s, calls } = strategy(() => decided('c1'));
    const stub = stubProvider();
    const run = s.startRun({ sessionId: SESSION, deadline: 45_000, rules: stub.provider });
    await run.choose(RQ_POINT);
    await run.choose({
      ...RQ_POINT,
      situation: 'Another position entirely.',
      candidates: [
        { id: 'c1', type: 'WAIT', summary: 'Wait.' },
        { id: 'c2', type: 'MOVE', target: 'z', summary: 'Move to z.' },
      ],
    });
    expect(stub.inputs).toHaveLength(2);
    expect(stub.inputs[1]).toEqual(stub.inputs[0]);
    expect(calls[1]!.rules).toEqual(calls[0]!.rules);
    // An absent rulesQuery → phase + side only.
    await run.choose(POINT);
    expect(stub.inputs[2]).toEqual({ ...stub.inputs[0], commandTypes: [], tags: [] });
  });

  it('TC-FB-04 (unit): rules off → no selection at all, the SWR-006 prompt, accounting "off"', async () => {
    const { s, calls } = strategy(() => decided('c2'), { rules: { ...RULES_ON, enabled: false } });
    const stub = stubProvider();
    const run = s.startRun({ sessionId: SESSION, deadline: 45_000, rules: stub.provider });
    expect(await run.choose(RQ_POINT)).toEqual({ candidateId: 'c2', source: 'openai' });
    expect(stub.inputs).toEqual([]);
    const ctx = calls[0]!;
    expect(ctx.rules).toBeUndefined();
    expect(ctx.rulesAccounting).toMatchObject({ enabled: false, rulesVersion: null, ruleIds: [] });
    expect(buildPrompt(ctx)).toEqual(
      buildPrompt(commanderBaseContext(RQ_POINT, SESSION, 'tactical')),
    );
  });

  it('TC-INT-03 / TC-FB-03 / QD-8: no selection without a call (< 2 candidates, after a run-stopping code, past the deadline)', async () => {
    const single = { ...RQ_POINT, candidates: [RQ_POINT.candidates[0]!] };
    const one = strategy(() => decided('c1'));
    const stub1 = stubProvider();
    const run1 = one.s.startRun({ sessionId: SESSION, deadline: 45_000, rules: stub1.provider });
    expect(await run1.choose(single)).toEqual({ candidateId: 'c1', source: 'bot' });
    expect(stub1.inputs).toEqual([]);
    expect(one.calls).toHaveLength(0);

    const stopped = strategy(() => Promise.reject(AiFailure.notConfigured('tactical')));
    const stub2 = stubProvider();
    const run2 = stopped.s.startRun({
      sessionId: SESSION,
      deadline: 45_000,
      rules: stub2.provider,
    });
    for (let i = 0; i < 3; i += 1) {
      expect((await run2.choose(RQ_POINT)).fallbackCode).toBe('AI_NOT_CONFIGURED');
    }
    expect(stopped.calls).toHaveLength(1);
    expect(stub2.inputs).toHaveLength(1);

    const late = strategy(() => decided('c2'), { now: () => 100_000 });
    const stub3 = stubProvider();
    const run3 = late.s.startRun({ sessionId: SESSION, deadline: 99_000, rules: stub3.provider });
    expect((await run3.choose(RQ_POINT)).fallbackCode).toBe('AI_DEADLINE');
    expect(stub3.inputs).toEqual([]);
  });

  it.each([
    ['the selection throws', { fail: new RangeError('secret selection details') }, 'RangeError'],
    ['the result breaks the contract', { broken: true }, 'ZodError'],
  ] as const)(
    'TC-FB-09 (unit): %s → the decision WITHOUT rules, the error class name reported, the next step selects again',
    async (_name, stubOpts, errorName) => {
      const reported: string[] = [];
      const { s, calls } = strategy(() => decided('c2'), {
        onRulesSelectionError: (name, sessionId, gameId) =>
          reported.push(`${name}/${sessionId}/${gameId}`),
      });
      const stub = stubProvider(stubOpts);
      const run = s.startRun({
        sessionId: SESSION,
        deadline: 45_000,
        rules: stub.provider,
        gameId: 'g-1',
      });
      expect(await run.choose(RQ_POINT)).toEqual({ candidateId: 'c2', source: 'openai' });
      expect(calls[0]!.rules).toBeUndefined();
      expect(calls[0]!.rulesAccounting).toEqual({
        enabled: true,
        rulesVersion: null,
        ruleIds: [],
        chars: 0,
        truncated: false,
        dropped: false,
      });
      expect(buildPrompt(calls[0]!)).toEqual(
        buildPrompt(commanderBaseContext(RQ_POINT, SESSION, 'tactical')),
      );
      const line = `${errorName}/${SESSION}/g-1`;
      expect(reported).toEqual([line]);
      await run.choose(RQ_POINT);
      expect(stub.inputs).toHaveLength(2);
      expect(reported).toEqual([line, line]);
    },
  );

  it('TC-BUD-07 (unit): even the prompt without rules is above the limit → the bot with AI_PROMPT_TOO_LARGE, no call; the run goes on', async () => {
    const big: AutomationDecisionPoint = { ...RQ_POINT, situation: 'x'.repeat(4000) };
    const smallBound = promptUpperBound(commanderBaseContext(RQ_POINT, SESSION, 'tactical'));
    const bigBound = promptUpperBound(commanderBaseContext(big, SESSION, 'tactical'));
    expect(bigBound).toBeGreaterThan(smallBound + 1000);
    // The limit lets the small point through without rules and keeps the big one out even without rules.
    const limit = smallBound + 10;
    const { s, calls } = strategy(() => decided('c2'), {
      rules: { ...RULES_ON, maxPromptTokens: limit },
    });
    const stub = stubProvider();
    const run = s.startRun({ sessionId: SESSION, deadline: 45_000, rules: stub.provider });
    expect(await run.choose(big)).toEqual({
      candidateId: 'c1',
      source: 'bot',
      fallbackCode: 'AI_PROMPT_TOO_LARGE',
    });
    expect(calls).toHaveLength(0);
    // Not run-stopping: the next (smaller) point is decided by the model, without rules (dropped).
    expect(await run.choose(RQ_POINT)).toEqual({ candidateId: 'c2', source: 'openai' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.rules).toBeUndefined();
    expect(calls[0]!.rulesAccounting).toMatchObject({
      enabled: true,
      dropped: true,
      ruleIds: [],
      chars: 0,
      rulesVersion: 'g@1:0123456789ab',
    });
    expect(promptUpperBound(calls[0]!)).toBeLessThanOrEqual(limit);
  });

  it('TC-BUD-04 / 05 (unit): L = UB(full) → full; L = UB(full) − 1 → reduced (whole lines, pinned kept, truncated)', async () => {
    const stub = stubProvider();
    const probe = strategy(() => decided('c2'), {
      rules: { ...RULES_ON, maxPromptTokens: 64_000 },
    });
    await probe.s
      .startRun({ sessionId: SESSION, deadline: 45_000, rules: stub.provider })
      .choose(RQ_POINT);
    const fullBound = promptUpperBound(probe.calls[0]!);

    const atLimit = strategy(() => decided('c2'), {
      rules: { ...RULES_ON, maxPromptTokens: fullBound },
    });
    await atLimit.s
      .startRun({ sessionId: SESSION, deadline: 45_000, rules: stub.provider })
      .choose(RQ_POINT);
    expect(atLimit.calls[0]!.rules?.text).toBe(FULL_TEXT);
    expect(atLimit.calls[0]!.rulesAccounting?.truncated).toBe(false);

    const below = strategy(() => decided('c2'), {
      rules: { ...RULES_ON, maxPromptTokens: fullBound - 1 },
    });
    await below.s
      .startRun({ sessionId: SESSION, deadline: 45_000, rules: stub.provider })
      .choose(RQ_POINT);
    const reduced = below.calls[0]!;
    expect(reduced.rules?.ruleIds).toEqual(LINES.slice(0, 3).map(([id]) => id));
    expect(reduced.rules?.truncated).toBe(true);
    expect(reduced.rulesAccounting).toMatchObject({ truncated: true, dropped: false });
    expect(promptUpperBound(reduced)).toBeLessThanOrEqual(fullBound - 1);
  });

  it('createCommanderStrategy maps aiCommander.rulesContext / limits; a selection error is one warn line with session / game ids and the class name only (QD-27)', async () => {
    const lines: string[] = [];
    const fake = fakeDecisions(() => decided('c2'));
    const configured = createCommanderStrategy(
      testConfig({
        aiCommander: { provider: 'openai', rulesMaxChars: 1000, maxPromptTokens: 9000 },
      }),
      { logSink: (_level, line) => lines.push(line) },
      fake.decisions as unknown as AiDecisionService,
      { ...DEFAULT_AI_RUNTIME, monotonicNow: () => 0 },
    );
    const stub = stubProvider();
    await configured
      .startRun({ sessionId: SESSION, deadline: 45_000, rules: stub.provider })
      .choose(RQ_POINT);
    expect(stub.inputs[0]?.maxChars).toBe(1000);
    expect(RULES_CONTEXT_LIMITS.maxCharsMin).toBe(1000);

    const failing = stubProvider({ fail: new RangeError('secret selection details') });
    await configured
      .startRun({ sessionId: SESSION, deadline: 45_000, rules: failing.provider, gameId: 'g-1' })
      .choose(RQ_POINT);
    // Without a gameId in the run context the field is masked.
    await configured
      .startRun({ sessionId: SESSION, deadline: 45_000, rules: failing.provider })
      .choose(RQ_POINT);
    expect(lines).toEqual([
      `automation.error sessionId=${SESSION} gameId=g-1 step=0 code=STRATEGY_ERROR error=RangeError`,
      `automation.error sessionId=${SESSION} gameId=? step=0 code=STRATEGY_ERROR error=RangeError`,
    ]);
    expect(lines.join('\n')).not.toContain('secret');
    expect(fake.calls[1]!.rules).toBeUndefined();

    const off = createCommanderStrategy(
      testConfig({ aiCommander: { provider: 'openai', rulesContext: 'off' } }),
      {},
      fake.decisions as unknown as AiDecisionService,
      { ...DEFAULT_AI_RUNTIME, monotonicNow: () => 0 },
    );
    const unused = stubProvider();
    await off
      .startRun({ sessionId: SESSION, deadline: 45_000, rules: unused.provider })
      .choose(RQ_POINT);
    expect(unused.inputs).toEqual([]);
    expect(fake.calls[3]!.rulesAccounting?.enabled).toBe(false);
  });
});
