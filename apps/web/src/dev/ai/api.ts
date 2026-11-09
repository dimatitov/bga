import {
  AiDevStatusSchema,
  AiTestDecisionResponseSchema,
  createAiTestDecisionRequestSchema,
  type AiDevStatus,
  type AiTestDecisionResponse,
} from '@bga/platform';
import { z } from 'zod';
import { requestJson } from '@/shared/api/http';

/**
 * Dev-only AI diagnostics API client (SWR-005B plan-frontend §2, spec «Decisions during IMPLEMENTATION»). The only
 * adapter between the page and the wire: components read data through `queries.ts`. Lives in the lazy dev chunk —
 * the endpoint paths below never reach the production bundle (checked by `check:bundle`).
 */

/** Wire side field of the dev scenario: test data of the diagnostics, not Rebellion rules (A-1). */
export const DevAiFactionSchema = z.enum(['rebels', 'empire']);
export type DevAiFaction = z.infer<typeof DevAiFactionSchema>;

/** Strict `POST /api/dev/ai/test-decision` body, built by the platform factory with the web's side field (W2). */
export const DevAiTestDecisionRequestSchema = createAiTestDecisionRequestSchema({
  faction: DevAiFactionSchema,
});
/** Request as sent by the page (defaults optional; `budgetKey` is never sent — the server uses its own, A-3). */
export type DevAiTestDecisionInput = Omit<
  z.input<typeof DevAiTestDecisionRequestSchema>,
  'budgetKey'
>;
export type DevAiScenario = DevAiTestDecisionInput['scenario'];

export const DEV_AI_STATUS_PATH = '/dev/ai/status';
export const DEV_AI_TEST_DECISION_PATH = '/dev/ai/test-decision';

/** `GET /api/dev/ai/status` — free; never carries the key, only `keyConfigured`. */
export function fetchDevAiStatus(signal?: AbortSignal): Promise<AiDevStatus> {
  return requestJson(DEV_AI_STATUS_PATH, AiDevStatusSchema, { signal });
}

/**
 * `POST /api/dev/ai/test-decision`. The body is validated locally by the same strict schema the server uses; the
 * parsed defaults are not sent back except `role`/`provider` (explicit), so `budgetKey` stays a server decision.
 */
export function postDevAiTestDecision(
  input: DevAiTestDecisionInput,
): Promise<AiTestDecisionResponse> {
  const parsed = DevAiTestDecisionRequestSchema.parse(input);
  return requestJson(DEV_AI_TEST_DECISION_PATH, AiTestDecisionResponseSchema, {
    method: 'POST',
    body: { scenario: parsed.scenario, role: parsed.role, provider: parsed.provider },
  });
}
