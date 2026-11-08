import {
  type Difficulty,
  type Faction,
  type GameSetupInput,
  type PlayerKind,
} from '@swr/contracts';

/** Body of `POST /api/games`: difficulty only for AI (A-7, D-N-4). */
export function buildSetup(
  faction: Faction,
  opponent: PlayerKind,
  difficulty: Difficulty,
): GameSetupInput {
  return {
    humanFaction: faction,
    opponent: opponent === 'ai' ? { kind: 'ai', difficulty } : { kind: 'human' },
  };
}
