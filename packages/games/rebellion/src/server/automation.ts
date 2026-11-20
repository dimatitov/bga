/**
 * Rebellion automation for the game-independent server runner (SWR-006 plan-backend §5, Contract §1, D-PO-1/2).
 * Only `core-v1` AI games are automated. Every automated step:
 * `pendingActor` → `decisionPoint` (built ONLY from `toSideView(state, aiSide)` by the bot's `buildDecision`)
 * → the runner's strategy picks a candidate id → `applyCandidate` re-builds the same decision (deterministic),
 * maps the id to its command and runs it through the full engine pipeline with `origin: 'auto'` and
 * `expectedVersion = state.version` (one engine command = `version + 1`, `actor` = the AI side).
 *
 * Pure and deterministic (time only from `ctx.now`); the input state is never mutated; never reads the clock
 * or a random source. Error results never carry state data (only the request's candidate id).
 */
import type { ApplyCommandContext, ApplyCommandResult, GameAutomation } from '@bga/platform';
import { buildDecision, type AutoPolicy, type BotDecision } from '../ai';
import { applyCommand, toSideView } from '../rules';
import {
  REBELLION_ERROR_MESSAGE_KEYS as K,
  type CoreGameState,
  type Faction,
  type GameEvent,
  type GameState,
} from '../schema';

export interface RebellionAutomationOptions {
  /**
   * `'bot'` (default, production) — the ranked SWR-006 bot; an `AutoPolicy` (e.g. `chooseAutoCommand`,
   * auto-pass-v1) — tests only (AM-BE-6: SWR-005 golden games stay byte-identical).
   */
  policy?: 'bot' | AutoPolicy;
}

/** The AI side of an AI game; `null` in a hot-seat game. */
export function aiSideOf(state: GameState): Faction | null {
  return state.settings.opponentType === 'ai' ? state.settings.opponentFaction : null;
}

function isAutomatedCore(state: GameState): state is CoreGameState {
  return state.rulesEngine === 'core-v1' && state.settings.opponentType === 'ai';
}

/** The AI side when it is its turn in a running `core-v1` AI game, otherwise `null`. */
function pendingAiSide(state: GameState): Faction | null {
  if (!isAutomatedCore(state)) return null;
  if (state.outcome !== null || state.handoffPending) return null;
  const aiSide = state.settings.opponentFaction;
  return state.activeSide === aiSide ? aiSide : null;
}

export function createRebellionAutomation(
  options: RebellionAutomationOptions = {},
): GameAutomation<GameState, GameEvent> {
  const policy = options.policy ?? 'bot';

  /** The bot's decision for the pending AI side (input = its own view only); `null` without a move. */
  function decide(state: CoreGameState, aiSide: Faction): BotDecision | null {
    return buildDecision(toSideView(state, aiSide), { policy });
  }

  return {
    isAutomated(state) {
      return isAutomatedCore(state);
    },

    pendingActor(state) {
      return pendingAiSide(state);
    },

    decisionPoint(state) {
      const aiSide = pendingAiSide(state);
      if (aiSide === null || state.rulesEngine !== 'core-v1') {
        throw new Error('automation: no automated move is pending');
      }
      const decision = decide(state, aiSide);
      if (decision === null) throw new Error('automation: the AI policy returned no move');
      return decision.point;
    },

    applyCandidate(state, candidateId, ctx: ApplyCommandContext) {
      const aiSide = pendingAiSide(state);
      if (aiSide === null || state.rulesEngine !== 'core-v1') {
        return { ok: false, error: { code: 'ILLEGAL_COMMAND', messageKey: K.notYourTurn } };
      }
      const command = decide(state, aiSide)?.commands.get(candidateId);
      if (command === undefined) {
        return {
          ok: false,
          error: {
            code: 'ILLEGAL_COMMAND',
            messageKey: K.commandUnavailable,
            details: { candidateId },
          },
        };
      }
      const result: ApplyCommandResult<GameState, GameEvent> = applyCommand(
        state,
        { actor: aiSide, expectedVersion: state.version, command },
        { now: ctx.now, origin: 'auto' },
      );
      return result;
    },
  };
}
