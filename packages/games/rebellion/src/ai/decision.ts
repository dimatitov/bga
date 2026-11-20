/**
 * The bot's decision point (SWR-006 plan-backend §4.1, Contract §5, D-PO-1, D-PO-2): a pure function of the
 * actor's own `CorePlayerView` (the server builds it with `toSideView(state, aiSide)`; the bot never sees a
 * state). Top-10 ranked candidates with opaque ids `c1..cN` in rank order (no system / unit names in ids), the
 * terminating action (`FINISH_ACTIVATION` / `PASS`) always included when legal, `fallbackCandidateId = 'c1'`
 * (the bot's own choice), `policyId = 'rebellion-bot-v1:<difficulty>'`. Difficulty comes from the public
 * `view.settings.aiDifficulty`. Deterministic: the same view gives the same point.
 */
import type { CorePlayerView } from '../schema';
import { AUTO_POLICY_ID, type AutoPolicy } from './auto-pass';
import { isTerminating } from './candidates';
import { objectiveFor, situationFor, summaryFor } from './describe';
import { deriveBaseIntel } from './intel';
import { botSeed } from './random';
import { rankCandidates } from './rank';
import type {
  BotCandidate,
  BotCommand,
  BotDecision,
  BotDecisionCandidate,
  ScoredCandidate,
} from './types';
import { buildViewModel } from './view-model';

export const BOT_POLICY_ID = 'rebellion-bot-v1';
export const MAX_DECISION_CANDIDATES = 10;

export interface BuildDecisionOptions {
  /** `'bot'` (default) — the ranked bot; an `AutoPolicy` (legacy `auto-pass-v1`, tests) — its single command. */
  policy?: 'bot' | AutoPolicy;
}

/**
 * Top `limit` of `ranked`, guaranteeing the terminating action when it exists: it replaces the last entry
 * (or is appended when there is room). Order otherwise unchanged.
 */
export function selectTop<T extends BotCandidate>(
  ranked: readonly T[],
  limit = MAX_DECISION_CANDIDATES,
): T[] {
  const top = ranked.slice(0, limit);
  if (top.some(isTerminating)) return top;
  const terminating = ranked.find(isTerminating);
  if (!terminating) return top;
  if (top.length < limit) top.push(terminating);
  else top[limit - 1] = terminating;
  return top;
}

function candidateFromCommand(command: BotCommand): BotCandidate {
  switch (command.type) {
    case 'ACTIVATE_SYSTEM':
      return {
        key: `A|${command.leaderId}|${command.systemId}`,
        kind: 'activate',
        command,
        systemId: command.systemId,
      };
    case 'MOVE_PIECES':
      return {
        key: `M|${command.fromSystemId}>${command.toSystemId}|${[...command.pieceIds].sort().join(',')}`,
        kind: 'move',
        command,
        systemId: command.toSystemId,
      };
    case 'FINISH_ACTIVATION':
      return { key: 'F', kind: 'finish', command, systemId: null };
    case 'PASS':
      return { key: 'P', kind: 'pass', command, systemId: null };
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}

function isBotCommand(command: { type: string }): command is BotCommand {
  return ['ACTIVATE_SYSTEM', 'MOVE_PIECES', 'FINISH_ACTIVATION', 'PASS'].includes(command.type);
}

/**
 * The decision of the side whose view this is; `null` when the view has no legal actions (not this side's
 * turn, game over) or a legacy policy answers `null`.
 */
export function buildDecision(
  view: CorePlayerView,
  options: BuildDecisionOptions = {},
): BotDecision | null {
  if (view.legalActions.length === 0) return null;
  const policy = options.policy ?? 'bot';
  const difficulty = view.settings.aiDifficulty ?? 'normal';
  const model = buildViewModel(view);
  const intel = view.viewer === 'empire' ? deriveBaseIntel(view) : null;

  let chosen: BotCandidate[];
  let policyId: string;
  if (policy === 'bot') {
    const ranked: ScoredCandidate[] = rankCandidates(view, difficulty, botSeed(view));
    chosen = selectTop(ranked);
    policyId = `${BOT_POLICY_ID}:${difficulty}`;
  } else {
    const command = policy(view);
    if (command === null) return null;
    if (!isBotCommand(command)) {
      throw new Error(`buildDecision: the policy answered ${command.type}`);
    }
    chosen = [candidateFromCommand(command)];
    policyId = AUTO_POLICY_ID;
  }
  if (chosen.length === 0) return null;

  const commands = new Map<string, BotCommand>();
  const candidates: BotDecisionCandidate[] = chosen.map((candidate, i) => {
    const id = `c${i + 1}`;
    commands.set(id, candidate.command);
    const entry: BotDecisionCandidate = {
      id,
      type: candidate.command.type,
      summary: summaryFor(view, candidate, model, intel),
    };
    if (candidate.systemId !== null) entry.target = candidate.systemId;
    return entry;
  });

  return {
    point: {
      actor: view.viewer,
      phase: view.phase,
      objective: objectiveFor(view),
      situation: situationFor(view, intel, model),
      candidates,
      fallbackCandidateId: 'c1',
      policyId,
    },
    commands,
  };
}
