/**
 * SWR-006 W7 — `AiDecisionService` accepts commander contexts (plan-backend §8.1/§8.2): `situation` 1..4000 and
 * `summary` ≤ 160 are enforced before any provider call or `AiUsage` row; the dev context is unchanged.
 *
 * SWR-008 W6b — `buildCommanderContext` (C-10, plan-backend §3.1 / §4.2) on the tiny knowledge base of the fake game
 * through the generic platform provider: selection only from the public `rulesQuery`, deterministic bytes, the
 * degradation levels at their boundaries (TC-BUD-04..08 through the shared builder), selection failures → no rules,
 * and the commander context the AI service accepts (rules block validated, accounting written).
 */
import {
  rulesSelectionInputOf,
  type AutomationDecisionPoint,
  type RulesContextProvider,
} from '@bga/platform';
import { describe, expect, it } from 'vitest';
import {
  AiDecisionService,
  COMMANDER_SITUATION_MAX,
  COMMANDER_SUMMARY_MAX,
} from '../../src/ai/ai-decision.service';
import type { NewAiUsageRow } from '../../src/ai/ai-usage.repository';
import { aiRuntime, type AIDecisionContext } from '../../src/ai/ai.types';
import { BudgetService } from '../../src/ai/budget.service';
import { MockAIProvider } from '../../src/ai/providers/mock.provider';
import { ApiError } from '../../src/common/api-error';
import {
  COMMANDER_INSTRUCTIONS,
  COMMANDER_RULES_INSTRUCTIONS,
  RULES_BLOCK_HEADER,
  buildPrompt,
} from '../../src/ai/prompt';
import { promptUpperBound } from '../../src/ai/prompt-fit';
import { readKnowledgeBaseDir } from '../../src/rules-context/knowledge-base.loader';
import {
  buildCommanderContext,
  commanderBaseContext,
  type CommanderRulesConfig,
} from '../../src/sessions/automation/commander-context';
import { TINY_KB_DIR, TINY_KB_ENGINE_SCOPE, tinyKbRules } from '../support/fake-automation';
import { OPENAI_DISABLED } from '../support/test-config';

const SESSION = '0f0f0f0f-1111-4222-8333-444455556666';

function buildService() {
  const rows: NewAiUsageRow[] = [];
  const runtime = aiRuntime({ logSink: () => undefined, sleep: () => Promise.resolve() });
  const service = new AiDecisionService({
    openai: OPENAI_DISABLED,
    mock: new MockAIProvider({ runtime, maxRetries: 0 }),
    openaiProvider: null,
    availability: null,
    budget: new BudgetService({ sumCostMicroUsd: () => Promise.resolve(0) }),
    usage: {
      insert: (row) => {
        rows.push(row);
        return Promise.resolve({} as never);
      },
    },
    runtime,
  });
  return { service, rows };
}

const commander: AIDecisionContext = {
  purpose: 'commander',
  budgetKey: SESSION,
  role: 'tactical',
  side: 'p2',
  phase: 'orders',
  objective: 'Win.',
  situation: 'Round 1.',
  availableActions: [
    { id: 'c1', type: 'MOVE', summary: 'Move.' },
    { id: 'c2', type: 'PASS', summary: 'Pass.' },
  ],
};

describe('AiDecisionService — commander contexts (SWR-006 W7)', () => {
  it('a commander context with a session budget key is decided and recorded under that key', async () => {
    const { service, rows } = buildService();
    const out = await service.decide(commander, 'auto');
    expect(out.decision.selectedActionId).toBe('c1');
    expect(rows.map((r) => [r.budgetKey, r.status, r.role])).toEqual([[SESSION, 'ok', 'tactical']]);
  });

  it.each([
    ['missing situation', { situation: undefined }],
    ['empty situation', { situation: '' }],
    ['situation over the limit', { situation: 'x'.repeat(COMMANDER_SITUATION_MAX + 1) }],
    [
      'summary over the limit',
      {
        availableActions: [
          { id: 'c1', type: 'MOVE', summary: 'x'.repeat(COMMANDER_SUMMARY_MAX + 1) },
          { id: 'c2', type: 'PASS' },
        ],
      },
    ],
    ['one action only', { availableActions: [{ id: 'c1', type: 'MOVE' }] }],
  ] as const)('%s → VALIDATION before any call or row', async (_name, patch) => {
    const { service, rows } = buildService();
    const err = await service.decide({ ...commander, ...patch }, 'auto').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('VALIDATION');
    expect(rows).toEqual([]);
  });

  it('boundary values are accepted (situation 4000, summary 160)', async () => {
    const { service } = buildService();
    const out = await service.decide(
      {
        ...commander,
        situation: 's'.repeat(COMMANDER_SITUATION_MAX),
        availableActions: [
          { id: 'c1', type: 'MOVE', summary: 'm'.repeat(COMMANDER_SUMMARY_MAX) },
          { id: 'c2', type: 'PASS' },
        ],
      },
      'auto',
    );
    expect(out.decision.selectedActionId).toBe('c1');
  });

  it('the dev context (no purpose) ignores situation / summary as before', async () => {
    const { service } = buildService();
    const out = await service.decide(
      {
        budgetKey: 'dev-diagnostics',
        role: 'tactical',
        side: 'empire',
        phase: 'command',
        objective: 'test',
        availableActions: [
          { id: 'action-1', type: 'MOVE_FLEET' },
          { id: 'action-2', type: 'PASS' },
        ],
      },
      'auto',
    );
    expect(out.decision.selectedActionId).toBe('action-1');
  });
});

// ---------------------------------------------------------------------------------------------------------
// SWR-008 W6b: buildCommanderContext
// ---------------------------------------------------------------------------------------------------------

/** The decision point of the fake automated game (same shape as `fake-automation.ts`). */
const FAKE_POINT: AutomationDecisionPoint = {
  actor: 'p2',
  phase: 'bot-turn',
  objective: 'Make the configured number of moves.',
  situation: 'Moves left this turn: 2. Moves made so far: 1.',
  candidates: [
    { id: 'c1', type: 'MOVE', target: 'north', summary: 'Move one step north.' },
    { id: 'c2', type: 'MOVE', target: 'south', summary: 'Move one step south.' },
    { id: 'c3', type: 'WAIT', summary: 'Wait and end this move.' },
  ],
  fallbackCandidateId: 'c1',
  policyId: 'fake-bot-v1',
  rulesQuery: { commandTypes: ['MOVE', 'WAIT'], tags: [] },
};

const ON: CommanderRulesConfig = { enabled: true, maxChars: 6000, maxPromptTokens: 16_000 };

function tinyProvider() {
  const { rules, spy } = tinyKbRules();
  const provider = rules.createRulesContextProvider(readKnowledgeBaseDir(TINY_KB_DIR));
  return { provider, spy };
}

function build(
  point: AutomationDecisionPoint,
  rules: RulesContextProvider | null,
  config: Partial<CommanderRulesConfig> = {},
  onSelectionError?: (name: string) => void,
) {
  return buildCommanderContext(point, {
    budgetKey: SESSION,
    modelRole: 'tactical',
    rules,
    config: { ...ON, ...config },
    ...(onSelectionError ? { onSelectionError } : {}),
  });
}

function okFit(fit: ReturnType<typeof build>) {
  if (!fit.ok) throw new Error('expected a fitted prompt');
  return fit;
}

describe('buildCommanderContext (SWR-008 W6b, C-10)', () => {
  it('TC-CT-06 (unit): the tiny KB block — engine scope first, only `fake:` ids, never needs-review / ai:none', () => {
    const { provider } = tinyProvider();
    const fit = okFit(build(FAKE_POINT, provider));
    expect(fit.level).toBe('full');
    const expected = provider.selectRules(rulesSelectionInputOf(FAKE_POINT, ON.maxChars));
    expect(fit.ctx.rules).toEqual({
      text: expected.text,
      ruleIds: expected.ruleIds,
      rulesVersion: expected.rulesVersion,
      truncated: false,
    });
    expect(expected.ruleIds).toEqual([
      TINY_KB_ENGINE_SCOPE,
      'fake:turn.order',
      'fake:move.one-step',
      'fake:move.wait',
    ]);
    expect(expected.rulesVersion).toMatch(/^fake@1:[0-9a-f]{12}$/);
    const lines = expected.text.split('\n');
    expect(lines.every((l) => l.startsWith('[fake:'))).toBe(true);
    expect(expected.text).not.toContain('fake:turn.review');
    expect(expected.text).not.toContain('fake:general.table');
    const prompt = buildPrompt(fit.ctx);
    expect(prompt.instructions).toBe(`${COMMANDER_INSTRUCTIONS} ${COMMANDER_RULES_INSTRUCTIONS}`);
    expect(prompt.input).toBe(
      `${RULES_BLOCK_HEADER}${expected.text}\n\n${buildPrompt(commanderBaseContext(FAKE_POINT, SESSION, 'tactical')).input}`,
    );
    expect(fit.upperBoundTokens).toBe(promptUpperBound(fit.ctx));
  });

  it('TC-BUD-08 (unit): deterministic — the same point gives the same level and the same prompt bytes', () => {
    const a = okFit(build(FAKE_POINT, tinyProvider().provider));
    const b = okFit(build(structuredClone(FAKE_POINT), tinyProvider().provider));
    expect(b.level).toBe(a.level);
    expect(buildPrompt(b.ctx)).toEqual(buildPrompt(a.ctx));
    expect(b.ctx).toEqual(a.ctx);
  });

  it('QD-7: the selection input comes from actor / phase / rulesQuery only — candidates, situation, objective never matter', () => {
    const { provider, spy } = tinyProvider();
    const a = okFit(build(FAKE_POINT, provider));
    const b = okFit(
      build(
        {
          ...FAKE_POINT,
          objective: 'Another objective.',
          situation: 'Another situation.',
          candidates: [
            { id: 'c1', type: 'WAIT', summary: 'Wait.' },
            { id: 'c2', type: 'JUMP', summary: 'Jump.' },
          ],
          fallbackCandidateId: 'c2',
          policyId: 'other-policy',
        },
        provider,
      ),
    );
    expect(b.ctx.rules).toEqual(a.ctx.rules);
    expect(spy.selections).toBe(2);
    // The query decides: WAIT only → no MOVE rule; the `quiet` tag adds the waiting rule.
    const waitOnly = okFit(
      build({ ...FAKE_POINT, rulesQuery: { commandTypes: ['WAIT'], tags: [] } }, provider),
    );
    expect(waitOnly.ctx.rules?.ruleIds).toEqual([
      TINY_KB_ENGINE_SCOPE,
      'fake:turn.order',
      'fake:move.wait',
    ]);
    const tagged = okFit(
      build({ ...FAKE_POINT, rulesQuery: { commandTypes: [], tags: ['quiet'] } }, provider),
    );
    expect(tagged.ctx.rules?.ruleIds).toEqual([
      TINY_KB_ENGINE_SCOPE,
      'fake:turn.order',
      'fake:move.wait',
    ]);
    // No rulesQuery → phase + side only.
    const { rulesQuery: _omitted, ...withoutQuery } = FAKE_POINT;
    const bare = okFit(build(withoutQuery, provider));
    expect(bare.ctx.rules?.ruleIds).toEqual([TINY_KB_ENGINE_SCOPE, 'fake:turn.order']);
  });

  it('TC-FB-04 / TC-FB-05 (unit): rules off → no selection; no provider → no rules block (form = off), accounting enabled', () => {
    const { provider, spy } = tinyProvider();
    const base = commanderBaseContext(FAKE_POINT, SESSION, 'tactical');
    const off = okFit(build(FAKE_POINT, provider, { enabled: false }));
    expect(off.level).toBe('none');
    expect(spy.selections).toBe(0);
    expect(off.ctx).toEqual({
      ...base,
      rulesAccounting: {
        enabled: false,
        rulesVersion: null,
        ruleIds: [],
        chars: 0,
        truncated: false,
        dropped: false,
      },
    });
    const none = okFit(build(FAKE_POINT, null));
    expect(none.level).toBe('none');
    expect(none.ctx.rules).toBeUndefined();
    expect(none.ctx.rulesAccounting).toEqual({
      enabled: true,
      rulesVersion: null,
      ruleIds: [],
      chars: 0,
      truncated: false,
      dropped: false,
    });
    expect(buildPrompt(none.ctx)).toEqual(buildPrompt(base));
    expect(buildPrompt(off.ctx)).toEqual(buildPrompt(base));
  });

  it('TC-FB-09 (unit): a throwing / contract-breaking selection → no rules, only the error class name is reported', () => {
    const { provider, spy } = tinyProvider();
    const reported: string[] = [];
    spy.throwOnSelect = new TypeError('secret');
    const thrown = okFit(build(FAKE_POINT, provider, {}, (n) => reported.push(n)));
    expect(thrown.ctx.rules).toBeUndefined();
    expect(thrown.level).toBe('none');
    spy.throwOnSelect = null;
    spy.rewrite = (r) => ({ ...r, rulesVersion: 'not a version' });
    const broken = okFit(build(FAKE_POINT, provider, {}, (n) => reported.push(n)));
    expect(broken.ctx.rules).toBeUndefined();
    // A rulesQuery the selection contract refuses (invalid tag) — the input itself fails.
    spy.rewrite = null;
    const badInput = okFit(
      build(
        { ...FAKE_POINT, rulesQuery: { commandTypes: [], tags: ['Not A Tag'] } },
        provider,
        {},
        (n) => reported.push(n),
      ),
    );
    expect(badInput.ctx.rules).toBeUndefined();
    expect(reported).toEqual(['TypeError', 'ZodError', 'ZodError']);
  });

  it('TC-BUD-04..07 (unit, shared builder): full at L = UB, reduced at UB − 1, dropped between UB(base) and the pinned-only block, too large below UB(base)', () => {
    const { provider } = tinyProvider();
    const full = okFit(build(FAKE_POINT, provider));
    const fullBound = full.upperBoundTokens;
    const baseBound = promptUpperBound(commanderBaseContext(FAKE_POINT, SESSION, 'tactical'));

    const atLimit = okFit(build(FAKE_POINT, provider, { maxPromptTokens: fullBound }));
    expect(atLimit.level).toBe('full');
    expect(atLimit.ctx.rulesAccounting?.truncated).toBe(false);

    const reduced = okFit(build(FAKE_POINT, provider, { maxPromptTokens: fullBound - 1 }));
    expect(reduced.level).toBe('reduced');
    expect(reduced.ctx.rules?.ruleIds[0]).toBe(TINY_KB_ENGINE_SCOPE);
    expect(full.ctx.rules?.text.startsWith(reduced.ctx.rules?.text ?? '-')).toBe(true);
    expect(reduced.ctx.rules?.truncated).toBe(true);
    expect(reduced.upperBoundTokens).toBeLessThanOrEqual(fullBound - 1);

    // Pinned-only block: the prompt with just the engine-scope line.
    const pinnedOnly = provider.selectRules({
      ...rulesSelectionInputOf(FAKE_POINT, ON.maxChars),
      maxChars: provider.requiredChars,
    });
    expect(pinnedOnly.ruleIds).toEqual([TINY_KB_ENGINE_SCOPE]);
    const pinnedBound = promptUpperBound({
      ...commanderBaseContext(FAKE_POINT, SESSION, 'tactical'),
      rules: { ...pinnedOnly, truncated: true },
    });
    expect(pinnedBound).toBeGreaterThan(baseBound);
    for (const limit of [baseBound, pinnedBound - 1]) {
      const dropped = okFit(build(FAKE_POINT, provider, { maxPromptTokens: limit }));
      expect(dropped.level).toBe('dropped');
      expect(dropped.ctx.rules).toBeUndefined();
      expect(dropped.ctx.rulesAccounting).toMatchObject({
        enabled: true,
        dropped: true,
        ruleIds: [],
        chars: 0,
        rulesVersion: full.ctx.rules?.rulesVersion,
      });
      expect(buildPrompt(dropped.ctx)).toEqual(
        buildPrompt(commanderBaseContext(FAKE_POINT, SESSION, 'tactical')),
      );
    }

    const tooLarge = build(FAKE_POINT, provider, { maxPromptTokens: baseBound - 1 });
    expect(tooLarge).toEqual({ ok: false, upperBoundTokens: baseBound });
  });

  it('the fitted commander context is accepted by AiDecisionService and its row carries the rules accounting', async () => {
    const { service, rows } = buildService();
    const fit = okFit(build(FAKE_POINT, tinyProvider().provider));
    const out = await service.decide(fit.ctx, 'auto');
    expect(out.decision.selectedActionId).toBe('c1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      budgetKey: SESSION,
      rulesEnabled: true,
      rulesIds: fit.ctx.rules?.ruleIds,
      rulesChars: fit.ctx.rules?.text.length,
      rulesDropped: false,
    });
    expect(JSON.stringify(rows[0])).not.toContain('What the fake engine plays');
  });
});
