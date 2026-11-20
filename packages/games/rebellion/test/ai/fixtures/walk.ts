/**
 * Seeded random-walk games on the REAL base-game data for the bot tests (SWR-006 W2). Both sides play
 * engine-legal commands picked from `enumerateCandidates` of their own view (the AI side with origin 'auto',
 * the human side with origin 'player'); every state of the walk is yielded. Tests only — the engine is called
 * directly (no server module), so the results do not depend on the server automation (W5).
 */
import { enumerateCandidates, seededRandom, type BotCandidate } from '../../../src/ai';
import { applyCommand, createCoreGame, toSideView } from '../../../src/rules';
import { coreDataBaseV1 } from '../../../src/scenario';
import {
  opponentOf,
  settingsFromSetupInput,
  type CoreGameState,
  type Difficulty,
  type Faction,
  type RebellionSettings,
} from '../../../src/schema';

export const NOW = '2026-11-19T10:00:00.000Z';

/** Settings of an AI game where `aiSide` is played by the AI. */
export function aiGameSettings(aiSide: Faction, difficulty: Difficulty): RebellionSettings {
  return settingsFromSetupInput({
    playerFaction: opponentOf(aiSide),
    opponentType: 'ai',
    aiDifficulty: difficulty,
    ruleset: 'base',
    gameMode: 'digital',
  });
}

export function newGame(settings: RebellionSettings, sessionId: string): CoreGameState {
  return createCoreGame(settings, coreDataBaseV1, { gameId: sessionId, now: NOW });
}

/** The origin the engine requires for a command of `side` in this game. */
export function originOf(state: CoreGameState, side: Faction): 'auto' | 'player' {
  return state.settings.opponentType === 'ai' && state.settings.opponentFaction === side
    ? 'auto'
    : 'player';
}

/** Apply a command for the active side; throws on rejection (a walk only plays legal commands). */
export function step(state: CoreGameState, candidate: BotCandidate): CoreGameState {
  const side = state.activeSide;
  const result = applyCommand(
    state,
    { actor: side, expectedVersion: state.version, command: candidate.command },
    { now: NOW, origin: originOf(state, side) },
  );
  if (!result.ok) {
    throw new Error(`walk: ${candidate.key} rejected: ${result.error.messageKey}`);
  }
  return result.state;
}

export interface WalkOptions {
  /** Probability of PASS outside an activation (default 0.2). */
  passRate?: number;
  /** Probability of FINISH inside an activation when moves exist (default 0.35). */
  finishRate?: number;
  /** Safety cap on commands (default 600). */
  maxCommands?: number;
  /** Optional chooser for one side (e.g. a scripted human); `null` → random. */
  choose?: (state: CoreGameState, candidates: BotCandidate[]) => BotCandidate | null;
}

/** Random pick among the active side's candidates (seeded; biased so games advance). */
function randomPick(
  candidates: BotCandidate[],
  rng: () => number,
  passRate: number,
  finishRate: number,
): BotCandidate {
  const terminating = candidates.find((c) => c.kind === 'pass' || c.kind === 'finish');
  const others = candidates.filter((c) => c !== terminating);
  const rate = terminating?.kind === 'pass' ? passRate : finishRate;
  if (terminating && (others.length === 0 || rng() < rate)) return terminating;
  const pick = others[Math.floor(rng() * others.length)];
  if (!pick) throw new Error('walk: no candidate');
  return pick;
}

/** Every state of one seeded game from creation to the end (or the command cap), the first included. */
export function walk(
  settings: RebellionSettings,
  sessionId: string,
  options: WalkOptions = {},
): CoreGameState[] {
  const rng = seededRandom(`walk#${sessionId}`);
  const passRate = options.passRate ?? 0.2;
  const finishRate = options.finishRate ?? 0.35;
  const maxCommands = options.maxCommands ?? 600;
  let state = newGame(settings, sessionId);
  const states = [state];
  for (let i = 0; i < maxCommands && state.outcome === null; i += 1) {
    const candidates = enumerateCandidates(toSideView(state, state.activeSide));
    const chosen =
      options.choose?.(state, candidates) ?? randomPick(candidates, rng, passRate, finishRate);
    state = step(state, chosen);
    states.push(state);
  }
  return states;
}
