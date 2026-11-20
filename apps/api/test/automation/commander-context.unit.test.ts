/**
 * SWR-006 W7 — `AiDecisionService` accepts commander contexts (plan-backend §8.1/§8.2): `situation` 1..4000 and
 * `summary` ≤ 160 are enforced before any provider call or `AiUsage` row; the dev context is unchanged.
 */
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
import { OPENAI_DISABLED } from '../support/test-config';

const SESSION = '0f0f0f0f-1111-4222-8333-444455556666';

function build() {
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
    const { service, rows } = build();
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
    const { service, rows } = build();
    const err = await service.decide({ ...commander, ...patch }, 'auto').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('VALIDATION');
    expect(rows).toEqual([]);
  });

  it('boundary values are accepted (situation 4000, summary 160)', async () => {
    const { service } = build();
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
    const { service } = build();
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
