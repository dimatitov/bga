/**
 * SWR-008 C-4 (plan-backend §2 C-4, §3.1, §3.4, §9; spec QD-7): the public rules query of a Rebellion decision
 * point — what the rules-context selection may use for the AI side's move.
 *
 * QD-7: the input of the rules selection must be a function of information public to BOTH sides, so the
 * selected rule ids can be shown to any viewer and never depend on where the hidden base is. Therefore
 * `rulesQueryFor` reads ONLY three fields that are identical in the views of both sides:
 * - `view.activation` — only whether it is `null` (never its leader / location);
 * - `view.rebelBase.revealed` (never `systemId`);
 * - `view.passed[opponentOf(view.viewer)]`.
 * It never reads `legalActions`, units, leaders, the log or any candidate: e.g. whether the AI Rebels can
 * `MOVE_PIECES` depends on their units on the hidden base, so the command types are the PUBLIC set of the
 * activation state (both `FINISH_ACTIVATION` and `MOVE_PIECES` inside an activation, even with no move
 * available now). Pure and deterministic; returns fresh arrays.
 */
import { opponentOf, type CorePlayerView } from '../schema';

/** Structurally `AutomationRulesQuery` of `@bga/platform` (C-3); `src/ai` never imports the platform. */
export interface BotRulesQuery {
  commandTypes: string[];
  tags: string[];
}

/** Every decision tag Rebellion can produce (§3.4); each one is derived from public fields only. */
export const REBELLION_RULE_TAGS = ['base-hidden', 'base-revealed', 'opponent-passed'] as const;
export type RebellionRuleTag = (typeof REBELLION_RULE_TAGS)[number];

/** Public command types outside an activation (C-4). */
const IDLE_COMMAND_TYPES = ['ACTIVATE_SYSTEM', 'PASS'] as const;
/** Public command types inside the actor's own activation (C-4; the AI moves only on its own turn). */
const ACTIVE_COMMAND_TYPES = ['FINISH_ACTIVATION', 'MOVE_PIECES'] as const;

/** Pure; reads ONLY `view.activation` (null or not), `view.rebelBase.revealed`, `view.passed[opponent]`. */
export function rulesQueryFor(view: CorePlayerView): BotRulesQuery {
  const commandTypes = view.activation === null ? IDLE_COMMAND_TYPES : ACTIVE_COMMAND_TYPES;
  const tags: RebellionRuleTag[] = [view.rebelBase.revealed ? 'base-revealed' : 'base-hidden'];
  if (view.passed[opponentOf(view.viewer)]) tags.push('opponent-passed');
  return { commandTypes: [...commandTypes].sort(), tags: tags.sort() };
}
