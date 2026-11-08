import {
  GameSetupSchema,
  ScenarioSchema,
  type GameSetupInput,
  type GameState,
  type Scenario,
} from '@swr/contracts';
import type { CreateContext } from './context';

/**
 * New game (A-8): version 1, round 1, phase 'assignment', log = [GAME_CREATED seq 1].
 * Invalid setup/scenario is a programming error (the API validates input first) → throws.
 */
export function createGame(
  setup: GameSetupInput,
  scenario: Scenario,
  ctx: CreateContext,
): GameState {
  const parsedSetup = GameSetupSchema.parse(setup);
  // Zod returns fresh objects: this is also the deep copy of the scenario (input never shared/mutated).
  const data = ScenarioSchema.parse(scenario);

  const systemIds = new Set(data.systems.map((s) => s.id));
  const brokenRef =
    data.systems.flatMap((s) => s.adjacentSystemIds).find((id) => !systemIds.has(id)) ??
    data.pieces.map((p) => p.systemId).find((id) => !systemIds.has(id)) ??
    (systemIds.has(data.rebelBaseSystemId) ? undefined : data.rebelBaseSystemId);
  if (brokenRef !== undefined) {
    throw new Error(`createGame: scenario ${data.id} references unknown system ${brokenRef}`);
  }

  return {
    id: ctx.gameId,
    version: 1,
    round: 1,
    phase: 'assignment',
    setup: parsedSetup,
    systems: data.systems,
    pieces: data.pieces,
    rebelBase: { systemId: data.rebelBaseSystemId, revealed: false },
    log: [
      {
        seq: 1,
        type: 'GAME_CREATED',
        actor: 'system',
        payload: { scenarioId: data.id },
        at: ctx.now,
      },
    ],
  };
}
