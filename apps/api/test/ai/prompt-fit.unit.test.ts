/**
 * SWR-008 W6a — `fitCommanderPrompt` (plan-backend §4.2, C-9; AC-10): degradation full → reduced → dropped →
 * `AI_PROMPT_TOO_LARGE` at the limit boundaries (TC-BUD-04..08 unit part), determinism, rules accounting (TC-COST-02
 * unit part) and "the worst SWR-006 prompt + 6000 chars of rules fits the default limit 16000" (C-7).
 * Pure: the selector is an in-test fake with the provider's semantics (pinned line first, whole lines, `maxChars`).
 */
import { AUTOMATION_LIMITS, RULES_CONTEXT_LIMITS, type RulesContextResult } from '@bga/platform';
import { describe, expect, it } from 'vitest';
import type { AIDecisionContext } from '../../src/ai/ai.types';
import { buildPrompt, upperBoundInputTokens } from '../../src/ai/prompt';
import {
  fitCommanderPrompt,
  promptUpperBound,
  type PromptFit,
  type PromptFitRules,
} from '../../src/ai/prompt-fit';

const VERSION = 'fake@1:0123456789ab';
const PINNED =
  '[fake:impl.engine-scope] Engine scope: only moves and passing are implemented. (RR p.1)';
const LINES = [
  PINNED,
  '[fake:turn.activate] Activating a system: place a leader in a system to act there. (RR p.5)',
  '[fake:turn.move] Moving units: units move from adjacent systems into the activated one. (RR p.6)',
  '[fake:turn.pass] Passing: a side that passes takes no more turns this round. (RR p.4)',
  '[fake:victory.time] Time track: the hidden side wins when the time marker meets reputation. (RR p.9)',
];

/** Fake selector with the provider's semantics: pinned line always, then whole lines in order while ≤ maxChars. */
function select(lines: readonly string[], maxChars: number): RulesContextResult {
  const pinned = lines[0]!;
  if (maxChars < pinned.length) throw new RangeError('maxChars < requiredChars');
  const kept = [pinned];
  let length = pinned.length;
  for (const line of lines.slice(1)) {
    if (length + 1 + line.length > maxChars) break;
    kept.push(line);
    length += 1 + line.length;
  }
  return {
    text: kept.join('\n'),
    ruleIds: kept.map((l) => l.slice(1, l.indexOf(']'))),
    truncated: kept.length < lines.length,
    rulesVersion: VERSION,
  };
}

function rulesOf(
  lines: readonly string[] = LINES,
  maxChars = 6000,
): PromptFitRules & { calls: number[] } {
  const calls: number[] = [];
  return {
    result: select(lines, maxChars),
    requiredChars: lines[0]!.length,
    calls,
    reselect(m: number) {
      calls.push(m);
      return select(lines, m);
    },
  };
}

const BASE: AIDecisionContext = {
  budgetKey: 'session-SECRET',
  role: 'tactical',
  side: 'side-a',
  phase: 'command',
  objective: 'Find the hidden base.',
  purpose: 'commander',
  situation: 'Round 2. Your leaders: 2 in pool.',
  availableActions: [
    { id: 'c-1', type: 'ACTIVATE', target: 'sys-1', summary: 'Activate sys-1 with leader-1.' },
    { id: 'c-2', type: 'PASS', summary: 'Pass for the rest of this round.' },
  ],
};

const withRulesBound = (lines: readonly string[]) =>
  promptUpperBound({
    ...BASE,
    rules: {
      text: lines.join('\n'),
      ruleIds: lines.map((l) => l.slice(1, l.indexOf(']'))),
      rulesVersion: VERSION,
      truncated: false,
    },
  });

const BASE_BOUND = promptUpperBound(BASE);
const FULL_BOUND = withRulesBound(LINES);
const MIN_BOUND = withRulesBound([PINNED]);

function okFit(fit: PromptFit) {
  if (!fit.ok) throw new Error(`expected ok, got ${JSON.stringify(fit)}`);
  return fit;
}

describe('fitCommanderPrompt — levels at the limit boundaries (TC-BUD-04..08)', () => {
  it('sanity: base < base + pinned line < full', () => {
    expect(BASE_BOUND).toBeLessThan(MIN_BOUND);
    expect(MIN_BOUND).toBeLessThan(FULL_BOUND);
    expect(promptUpperBound(BASE)).toBe(
      upperBoundInputTokens(
        buildPrompt(BASE),
        BASE.availableActions.map((a) => a.id),
      ),
    );
  });

  it('TC-BUD-04: L = upper bound of the full prompt → full block, truncated=false', () => {
    const rules = rulesOf();
    const fit = okFit(
      fitCommanderPrompt({ base: BASE, enabled: true, rules, maxPromptTokens: FULL_BOUND }),
    );
    expect(fit.level).toBe('full');
    expect(fit.upperBoundTokens).toBe(FULL_BOUND);
    expect(fit.ctx.rules).toEqual({
      text: LINES.join('\n'),
      ruleIds: LINES.map((l) => l.slice(1, l.indexOf(']'))),
      rulesVersion: VERSION,
      truncated: false,
    });
    expect(fit.ctx.rulesAccounting).toEqual({
      enabled: true,
      rulesVersion: VERSION,
      ruleIds: fit.ctx.rules?.ruleIds,
      chars: LINES.join('\n').length,
      truncated: false,
      dropped: false,
    });
    expect(rules.calls).toEqual([]); // no re-selection
  });

  it('full keeps the selector flag: a selection cut by maxChars is accounted truncated', () => {
    const rules = rulesOf(LINES, LINES[0]!.length + 1 + LINES[1]!.length);
    expect(rules.result.truncated).toBe(true);
    const fit = okFit(
      fitCommanderPrompt({ base: BASE, enabled: true, rules, maxPromptTokens: 16_000 }),
    );
    expect(fit.level).toBe('full');
    expect(fit.ctx.rules?.truncated).toBe(true);
    expect(fit.ctx.rulesAccounting).toMatchObject({ truncated: true, dropped: false });
  });

  it('TC-BUD-05: L = full − 1 → whole lines dropped by the selector, pinned line kept, truncated=true, ≤ L', () => {
    const rules = rulesOf();
    const limit = FULL_BOUND - 1;
    const fit = okFit(
      fitCommanderPrompt({ base: BASE, enabled: true, rules, maxPromptTokens: limit }),
    );
    expect(fit.level).toBe('reduced');
    expect(fit.upperBoundTokens).toBeLessThanOrEqual(limit);
    expect(fit.upperBoundTokens).toBe(promptUpperBound(fit.ctx));
    // excess = 1 → the selector is asked for (full length − 1) chars: exactly the last line goes
    expect(rules.calls).toEqual([LINES.join('\n').length - 1]);
    expect(fit.ctx.rules?.text).toBe(LINES.slice(0, -1).join('\n'));
    expect(fit.ctx.rules?.ruleIds[0]).toBe('fake:impl.engine-scope');
    expect(fit.ctx.rules?.truncated).toBe(true);
    expect(fit.ctx.rulesAccounting).toEqual({
      enabled: true,
      rulesVersion: VERSION,
      ruleIds: ['fake:impl.engine-scope', 'fake:turn.activate', 'fake:turn.move', 'fake:turn.pass'],
      chars: LINES.slice(0, -1).join('\n').length,
      truncated: true,
      dropped: false,
    });
  });

  it('reduced down to the pinned line alone: L = base + pinned line', () => {
    const fit = okFit(
      fitCommanderPrompt({
        base: BASE,
        enabled: true,
        rules: rulesOf(),
        maxPromptTokens: MIN_BOUND,
      }),
    );
    expect(fit.level).toBe('reduced');
    expect(fit.ctx.rules?.text).toBe(PINNED);
    expect(fit.upperBoundTokens).toBe(MIN_BOUND);
  });

  it('TC-BUD-06: base ≤ L < base + minimal block → block dropped; prompt = rules-off prompt; dropped accounted', () => {
    for (const limit of [MIN_BOUND - 1, BASE_BOUND + 1, BASE_BOUND]) {
      const rules = rulesOf();
      const fit = okFit(
        fitCommanderPrompt({ base: BASE, enabled: true, rules, maxPromptTokens: limit }),
      );
      expect(fit.level, `L=${limit}`).toBe('dropped');
      expect(fit.ctx.rules).toBeUndefined();
      expect(buildPrompt(fit.ctx)).toEqual(buildPrompt(BASE));
      expect(fit.upperBoundTokens).toBe(BASE_BOUND);
      expect(fit.ctx.rulesAccounting).toEqual({
        enabled: true,
        rulesVersion: VERSION,
        ruleIds: [],
        chars: 0,
        truncated: false,
        dropped: true,
      });
      // the selector was never asked for less than the pinned line
      for (const m of rules.calls) expect(m).toBeGreaterThanOrEqual(PINNED.length);
    }
  });

  it('TC-BUD-07: L < base prompt → not ok (AI_PROMPT_TOO_LARGE), with rules on, off and without a provider', () => {
    const limit = BASE_BOUND - 1;
    for (const fit of [
      fitCommanderPrompt({ base: BASE, enabled: true, rules: rulesOf(), maxPromptTokens: limit }),
      fitCommanderPrompt({ base: BASE, enabled: false, rules: rulesOf(), maxPromptTokens: limit }),
      fitCommanderPrompt({ base: BASE, enabled: true, rules: null, maxPromptTokens: limit }),
    ]) {
      expect(fit).toEqual({ ok: false, upperBoundTokens: BASE_BOUND });
    }
  });

  it('TC-BUD-07 shape: situation 4000 chars + 10 candidates above a 4000-token limit → not ok', () => {
    const big: AIDecisionContext = {
      ...BASE,
      situation: 'x'.repeat(AUTOMATION_LIMITS.situationMax),
      availableActions: Array.from({ length: AUTOMATION_LIMITS.maxCandidates }, (_, i) => ({
        id: `c-${i}`,
        type: 'MOVE',
        target: `sys-${i}`,
        summary: 's'.repeat(AUTOMATION_LIMITS.summaryMax),
      })),
    };
    const fit = fitCommanderPrompt({
      base: big,
      enabled: true,
      rules: rulesOf(),
      maxPromptTokens: 4000,
    });
    expect(fit.ok).toBe(false);
  });

  it('TC-BUD-08: deterministic; levels only degrade as the limit shrinks (full → reduced → dropped → too large)', () => {
    const order = ['full', 'reduced', 'dropped', 'too-large'];
    let last = 0;
    const seen = new Set<string>();
    for (let limit = FULL_BOUND + 5; limit >= BASE_BOUND - 5; limit -= 1) {
      const a = fitCommanderPrompt({
        base: BASE,
        enabled: true,
        rules: rulesOf(),
        maxPromptTokens: limit,
      });
      const b = fitCommanderPrompt({
        base: BASE,
        enabled: true,
        rules: rulesOf(),
        maxPromptTokens: limit,
      });
      expect(b).toEqual(a);
      if (a.ok) expect(buildPrompt(b.ok ? b.ctx : BASE)).toEqual(buildPrompt(a.ctx));
      const level = a.ok ? a.level : 'too-large';
      const rank = order.indexOf(level);
      expect(rank, `L=${limit}`).toBeGreaterThanOrEqual(last);
      last = rank;
      seen.add(level);
      if (a.ok) expect(a.upperBoundTokens).toBeLessThanOrEqual(limit);
    }
    expect([...seen]).toEqual(order);
  });
});

describe('fitCommanderPrompt — no rules (rules off / no provider / nothing selected)', () => {
  it('off: no block, "off" accounting, prompt byte-identical to the base (SWR-006)', () => {
    const fit = okFit(
      fitCommanderPrompt({ base: BASE, enabled: false, rules: rulesOf(), maxPromptTokens: 16_000 }),
    );
    expect(fit.level).toBe('none');
    expect(fit.ctx.rules).toBeUndefined();
    expect(buildPrompt(fit.ctx)).toEqual(buildPrompt(BASE));
    expect(fit.ctx.rulesAccounting).toEqual({
      enabled: false,
      rulesVersion: null,
      ruleIds: [],
      chars: 0,
      truncated: false,
      dropped: false,
    });
  });

  it('no provider (rules null): enabled, version null, nothing sent', () => {
    const fit = okFit(
      fitCommanderPrompt({ base: BASE, enabled: true, rules: null, maxPromptTokens: 16_000 }),
    );
    expect(fit.level).toBe('none');
    expect(fit.ctx.rules).toBeUndefined();
    expect(fit.ctx.rulesAccounting).toEqual({
      enabled: true,
      rulesVersion: null,
      ruleIds: [],
      chars: 0,
      truncated: false,
      dropped: false,
    });
  });

  it('empty selection: enabled, version kept, nothing sent', () => {
    const empty: PromptFitRules = {
      result: { text: '', ruleIds: [], truncated: false, rulesVersion: VERSION },
      requiredChars: 0,
      reselect: () => {
        throw new Error('must not be called');
      },
    };
    const fit = okFit(
      fitCommanderPrompt({ base: BASE, enabled: true, rules: empty, maxPromptTokens: 16_000 }),
    );
    expect(fit.level).toBe('none');
    expect(buildPrompt(fit.ctx)).toEqual(buildPrompt(BASE));
    expect(fit.ctx.rulesAccounting).toMatchObject({
      enabled: true,
      rulesVersion: VERSION,
      ruleIds: [],
    });
  });

  it('ignores rules / accounting already present on the base context', () => {
    const dirty: AIDecisionContext = {
      ...BASE,
      rules: { text: '[x:y] injected', ruleIds: ['x:y'], rulesVersion: VERSION, truncated: false },
      rulesAccounting: {
        enabled: true,
        rulesVersion: VERSION,
        ruleIds: ['x:y'],
        chars: 14,
        truncated: false,
        dropped: false,
      },
    };
    const fit = okFit(
      fitCommanderPrompt({ base: dirty, enabled: false, rules: null, maxPromptTokens: 16_000 }),
    );
    expect(fit.ctx.rules).toBeUndefined();
    expect(buildPrompt(fit.ctx)).toEqual(buildPrompt(BASE));
  });

  it('a non-commander context is a programming error', () => {
    expect(() =>
      fitCommanderPrompt({
        base: { ...BASE, purpose: 'dev-test' },
        enabled: true,
        rules: rulesOf(),
        maxPromptTokens: 16_000,
      }),
    ).toThrow(TypeError);
  });
});

describe('fitCommanderPrompt — robustness of the reduced step', () => {
  it('multi-byte rule text: fewer chars but not enough bytes → the re-selection repeats until it fits', () => {
    const ascii = `[fake:a] ${'a'.repeat(100)}`;
    const cyrillic = `[fake:c] ${'ж'.repeat(80)}`; // fewer chars than `ascii`, ~1.6× its bytes
    const first: RulesContextResult = {
      text: `${PINNED}\n${ascii}`,
      ruleIds: ['fake:impl.engine-scope', 'fake:a'],
      truncated: false,
      rulesVersion: VERSION,
    };
    const calls: number[] = [];
    const rules: PromptFitRules = {
      result: first,
      requiredChars: PINNED.length,
      reselect: (m) => {
        calls.push(m);
        return calls.length === 1
          ? {
              ...first,
              text: `${PINNED}\n${cyrillic}`,
              ruleIds: ['fake:impl.engine-scope', 'fake:c'],
              truncated: true,
            }
          : select([PINNED], m);
      },
    };
    const full = withRulesBound([PINNED, ascii]);
    const limit = full - 10;
    const fit = okFit(
      fitCommanderPrompt({ base: BASE, enabled: true, rules, maxPromptTokens: limit }),
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe(first.text.length - 10);
    expect(fit.level).toBe('reduced');
    expect(fit.ctx.rules?.text).toBe(PINNED);
    expect(fit.upperBoundTokens).toBeLessThanOrEqual(limit);
  });

  it('a throwing re-selection falls back to the prompt without rules (dropped), never throws', () => {
    const rules: PromptFitRules = {
      result: select(LINES, 6000),
      requiredChars: PINNED.length,
      reselect: () => {
        throw new RangeError('boom');
      },
    };
    const fit = okFit(
      fitCommanderPrompt({ base: BASE, enabled: true, rules, maxPromptTokens: FULL_BOUND - 1 }),
    );
    expect(fit.level).toBe('dropped');
    expect(fit.ctx.rulesAccounting?.dropped).toBe(true);
  });
});

describe('default limit (C-7): the worst SWR-006 prompt + 6000 chars of rules fits 16000', () => {
  it('situation 4000, 10 candidates with 160-char summaries, objective 300, rules block 6000 chars → full', () => {
    const worst: AIDecisionContext = {
      ...BASE,
      side: 's'.repeat(AUTOMATION_LIMITS.actorMax),
      phase: 'p'.repeat(AUTOMATION_LIMITS.phaseMax),
      objective: 'o'.repeat(AUTOMATION_LIMITS.objectiveMax),
      situation: 'x'.repeat(AUTOMATION_LIMITS.situationMax),
      availableActions: Array.from({ length: AUTOMATION_LIMITS.maxCandidates }, (_, i) => ({
        id: `cand-${i}`,
        type: 'MOVE_PIECES',
        target: `system-${i}`,
        summary: 's'.repeat(AUTOMATION_LIMITS.summaryMax),
      })),
    };
    const lines = [`[fake:impl.engine-scope] ${'e'.repeat(400)}`];
    while (lines.join('\n').length < RULES_CONTEXT_LIMITS.maxCharsDefault - 200) {
      lines.push(`[fake:rule-${lines.length}] ${'r'.repeat(150)}`);
    }
    const last = RULES_CONTEXT_LIMITS.maxCharsDefault - lines.join('\n').length - 1;
    lines.push(`[fake:last] ${'z'.repeat(last - '[fake:last] '.length)}`);
    const text = lines.join('\n');
    expect(text.length).toBe(RULES_CONTEXT_LIMITS.maxCharsDefault);
    const rules = rulesOf(lines, RULES_CONTEXT_LIMITS.maxCharsDefault);
    expect(rules.result.text).toBe(text);
    const fit = okFit(
      fitCommanderPrompt({ base: worst, enabled: true, rules, maxPromptTokens: 16_000 }),
    );
    console.log(
      `[swr008-prompt-fit] worst SWR-006 base=${promptUpperBound(worst)} with 6000 rule chars=${fit.upperBoundTokens} limit=16000`,
    );
    expect(fit.level).toBe('full');
    expect(fit.upperBoundTokens).toBeLessThanOrEqual(16_000);
  });
});
