import { type AiSessionDecisionsResponse, AiSessionDecisionsResponseSchema } from '@bga/platform';
import { requestJson } from '@/shared/api/http';

/**
 * Dev-only client of `GET /api/dev/ai/sessions/:sessionId/decisions` (SWR-008 plan-backend §6, plan-frontend §2.3).
 * The strict platform schema rejects any field outside the wire (reason, prompt, budget key …) → `INVALID_RESPONSE`.
 * Lives in the lazy dev chunk: the path never reaches the production bundle (`check:bundle` rule `dev-ai-path`).
 */
export function devAiSessionDecisionsPath(sessionId: string): string {
  return `/dev/ai/sessions/${encodeURIComponent(sessionId)}/decisions`;
}

export function fetchSessionDecisions(
  sessionId: string,
  signal?: AbortSignal,
): Promise<AiSessionDecisionsResponse> {
  return requestJson(devAiSessionDecisionsPath(sessionId), AiSessionDecisionsResponseSchema, {
    signal,
  });
}
