/**
 * Structured-output schema of the model answer (SWR-005B, plan-backend §4.3).
 * The JSON schema uses only `type / enum / required / additionalProperties / description` (no `maxLength`: support in
 * strict mode is not guaranteed and a 400 on the paid path is worse; AM-BE-5). `enum` = the legal ids in context order.
 */
import { z } from 'zod';

export const DECISION_FORMAT_NAME = 'ai_decision';

export interface DecisionJsonSchema {
  type: 'object';
  additionalProperties: false;
  required: ['selectedActionId', 'reason'];
  properties: {
    selectedActionId: { type: 'string'; enum: string[]; description: string };
    reason: { type: 'string'; description: string };
  };
}

export function buildDecisionJsonSchema(actionIds: readonly string[]): DecisionJsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['selectedActionId', 'reason'],
    properties: {
      selectedActionId: {
        type: 'string',
        enum: [...actionIds],
        description: 'id of the chosen action',
      },
      reason: { type: 'string', description: 'Short explanation, at most 300 characters' },
    },
  };
}

/** `text.format` of the Responses API request. */
export function buildDecisionTextFormat(actionIds: readonly string[]) {
  return {
    type: 'json_schema' as const,
    name: DECISION_FORMAT_NAME,
    strict: true,
    schema: buildDecisionJsonSchema(actionIds) as unknown as Record<string, unknown>,
  };
}

/** Shape of a parsed answer (strict: extra fields are a schema violation). Membership is checked separately. */
export const DecisionOutputSchema = z.strictObject({
  selectedActionId: z.string().min(1).max(64),
  reason: z.string(),
});
export type DecisionOutput = z.infer<typeof DecisionOutputSchema>;
