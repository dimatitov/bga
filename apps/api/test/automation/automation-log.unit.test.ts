/** SWR-006 W7 — allow-listed runner log lines (Contract §2, Q-BE-1; TC-LOOP-16). */
import { describe, expect, it } from 'vitest';
import {
  errorName,
  formatErrorLine,
  formatRunLine,
  formatStepLine,
} from '../../src/sessions/automation/automation-log';

describe('automation log lines (SWR-006 W7)', () => {
  it('step / run / error lines carry only ids, counters, fixed codes', () => {
    expect(
      formatStepLine({
        sessionId: 's-1',
        gameId: 'g',
        step: 3,
        strategy: 'openai',
        source: 'bot',
        fallbackCode: 'AI_TIMEOUT',
        durationMs: 12.6,
        code: 'OK',
      }),
    ).toBe(
      'automation.step sessionId=s-1 gameId=g step=3 strategy=openai source=bot fallbackCode=AI_TIMEOUT durationMs=13 code=OK',
    );
    expect(
      formatStepLine({
        sessionId: 's-1',
        gameId: 'g',
        step: 1,
        strategy: 'bot',
        source: 'bot',
        durationMs: -1,
        code: 'ENGINE_REJECTED_RETRY',
      }),
    ).toBe(
      'automation.step sessionId=s-1 gameId=g step=1 strategy=bot source=bot fallbackCode=- durationMs=0 code=ENGINE_REJECTED_RETRY',
    );
    expect(
      formatRunLine({
        sessionId: 's-1',
        gameId: 'g',
        steps: 4,
        fallbacks: 1,
        stopReason: 'humanTurn',
        durationMs: 5,
      }),
    ).toBe(
      'automation.run sessionId=s-1 gameId=g steps=4 fallbacks=1 stopReason=humanTurn durationMs=5',
    );
    expect(formatErrorLine({ sessionId: 's-1', gameId: 'g', step: 2, code: 'CONFLICT' })).toBe(
      'automation.error sessionId=s-1 gameId=g step=2 code=CONFLICT',
    );
  });

  it('unexpected ids and error names are masked; messages never appear', () => {
    const line = formatErrorLine({
      sessionId: 'a b\nINJECTED',
      gameId: 'g',
      step: 1,
      code: 'AUTOMATION_ERROR',
      error: errorName(new Error('secret message')),
    });
    expect(line).toBe(
      'automation.error sessionId=? gameId=g step=1 code=AUTOMATION_ERROR error=Error',
    );
    expect(line).not.toContain('secret');
    const odd = new Error('x');
    odd.name = 'Bad name with spaces';
    expect(errorName(odd)).toBe('UnknownError');
    expect(errorName('a string')).toBe('string');
  });
});
