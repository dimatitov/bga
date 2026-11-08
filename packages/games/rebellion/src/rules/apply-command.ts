import { ERROR_MESSAGE_KEYS } from '@bga/platform';
import {
  CommandEnvelopeSchema,
  type CoreGameState,
  type GameState,
  type MockGameState,
} from '../schema';
import type { ApplyContext } from './context';
import { applyCoreCommand } from './core';
import { applyMockCommand } from './mock-apply-command';
import type { ApplyResult } from './result';

/**
 * Single entry point for commands of both engines (SWR-005 BD-1): the envelope schema (400 VALIDATION)
 * is shared — `CommandSchema` holds the commands of both engines (AM-BE-3) — then the state's
 * `rulesEngine` picks the pipeline: `mock-v1` → `./mock-apply-command`, `core-v1` → `./core`.
 * Rejections are results, never exceptions (AM-4); `state` is never mutated; the engine never changes
 * (the overloads keep the state type).
 */
export function applyCommand(
  state: MockGameState,
  envelope: unknown,
  ctx: ApplyContext,
): ApplyResult<MockGameState>;
export function applyCommand(
  state: CoreGameState,
  envelope: unknown,
  ctx: ApplyContext,
): ApplyResult<CoreGameState>;
export function applyCommand(state: GameState, envelope: unknown, ctx: ApplyContext): ApplyResult;
export function applyCommand(state: GameState, envelope: unknown, ctx: ApplyContext): ApplyResult {
  const parsed = CommandEnvelopeSchema.safeParse(envelope);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION',
        messageKey: ERROR_MESSAGE_KEYS.validation,
        details: {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.map((key) => (typeof key === 'symbol' ? String(key) : key)),
            code: issue.code,
            message: issue.message,
          })),
        },
      },
    };
  }
  switch (state.rulesEngine) {
    case 'mock-v1':
      return applyMockCommand(state, parsed.data, ctx);
    case 'core-v1':
      return applyCoreCommand(state, parsed.data, ctx);
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
}
