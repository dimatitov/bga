/**
 * SWR-005B W4 (plan-backend §5.7; AC-10): AI log lines are built from an allow-list and sanitised values only.
 */
import { describe, expect, it } from 'vitest';
import { emitAiLog, formatAiAttemptLine, formatAiSummaryLine } from '../../src/ai/ai-log';

const SENTINEL = 'sk-test-SENTINEL-log';

describe('ai-log', () => {
  it('attempt line: fixed field order, numbers and ids only', () => {
    const line = formatAiAttemptLine({
      provider: 'openai',
      model: 'gpt-6-luna',
      role: 'tactical',
      attempt: 1,
      maxAttempts: 3,
      result: 'ok',
      durationMs: 812.7,
      usage: {
        inputTokens: 420,
        cachedInputTokens: 0,
        outputTokens: 37,
        reasoningTokens: 0,
        totalTokens: 457,
      },
      costMicroUsd: 61,
      budgetKey: 'dev-diagnostics',
      requestId: 'req_abc',
    });
    expect(line).toBe(
      'ai.attempt provider=openai model=gpt-6-luna role=tactical attempt=1/3 outcome=ok code=- httpStatus=- ' +
        'sdkError=- durationMs=812 in=420 cached=0 out=37 reasoning=0 costUsd=0.000061 budgetKey=dev-diagnostics ' +
        'requestId=req_abc',
    );
  });

  it('unsafe values (spaces, key-like text, newlines) are replaced by ?', () => {
    const line = formatAiAttemptLine({
      provider: 'openai',
      model: `gpt ${SENTINEL}`,
      role: 'tactical',
      attempt: 2,
      maxAttempts: 3,
      result: 'fail',
      code: `AI_TIMEOUT\n${SENTINEL}`,
      sdkError: 'Bad Name!',
      durationMs: Number.NaN,
      budgetKey: 'k\nfake=1',
      requestId: `req ${SENTINEL}`,
    });
    expect(line).not.toContain(SENTINEL);
    expect(line).not.toContain('\n');
    expect(line).toContain('model=? ');
    expect(line).toContain('code=? ');
    expect(line).toContain('sdkError=? ');
    expect(line).toContain('durationMs=- ');
    expect(line).toContain('budgetKey=? ');
    expect(line).toMatch(/requestId=\?$/);
  });

  it('summary line', () => {
    expect(
      formatAiSummaryLine({
        provider: 'mock',
        model: 'mock-deterministic-v1',
        role: 'strategy',
        attempts: 2,
        result: 'fail',
        code: 'AI_TIMEOUT',
        durationMs: 5,
        costMicroUsd: 0,
      }),
    ).toBe(
      'ai.decision provider=mock model=mock-deterministic-v1 role=strategy attempts=2 outcome=fail code=AI_TIMEOUT ' +
        'durationMs=5 in=- cached=- out=- reasoning=- costUsd=0.000000 budgetKey=-',
    );
  });

  it('the formatter has no field for prompt, objective, reason or key', () => {
    const line = formatAiSummaryLine({
      provider: 'openai',
      model: 'gpt-6-luna',
      role: 'tactical',
      attempts: 1,
      result: 'ok',
      durationMs: 1,
      // extra properties are ignored by construction
      ...({ objective: 'OBJ-SENTINEL', reason: 'REASON-SENTINEL', apiKey: SENTINEL } as object),
    });
    expect(line).not.toMatch(/OBJ-SENTINEL|REASON-SENTINEL|SENTINEL-log/);
  });

  it('a throwing sink never breaks the caller', () => {
    expect(() =>
      emitAiLog(() => {
        throw new Error('sink down');
      }, 'x'),
    ).not.toThrow();
  });
});
