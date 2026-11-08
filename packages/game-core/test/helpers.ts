import type { CommandEnvelope, Faction, GameSetupInput, GameState, Piece } from '@swr/contracts';
import { mockScenario } from '@swr/game-data';
import { createGame, type ApplyContext, type CreateContext } from '../src';

export const SCENARIO = mockScenario;
export const CREATE_CTX: CreateContext = { gameId: 'game-test-1', now: '2026-11-08T10:00:00.000Z' };
export const APPLY_CTX: ApplyContext = { now: '2026-11-08T10:05:00.000Z' };

export const EMPIRE_VS_AI: GameSetupInput = {
  humanFaction: 'empire',
  opponent: { kind: 'ai', difficulty: 'normal' },
};
export const REBELLION_VS_AI: GameSetupInput = {
  humanFaction: 'rebellion',
  opponent: { kind: 'ai', difficulty: 'hard' },
};

export function newGame(setup: GameSetupInput = EMPIRE_VS_AI): GameState {
  return createGame(setup, SCENARIO, CREATE_CTX);
}

/** Recursively freeze an object graph: any mutation attempt throws in strict mode (ESM tests). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

/** Deterministic PRNG (tests only; game-core itself never uses randomness). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function env(
  state: GameState,
  command: CommandEnvelope['command'],
  overrides: Partial<Pick<CommandEnvelope, 'actor' | 'expectedVersion'>> = {},
): CommandEnvelope {
  return {
    actor: overrides.actor ?? state.setup.humanFaction,
    expectedVersion: overrides.expectedVersion ?? state.version,
    command,
  };
}

export function move(pieceIds: string[], fromSystemId: string, toSystemId: string) {
  return { type: 'MOVE_PIECES' as const, pieceIds, fromSystemId, toSystemId };
}

export const ADVANCE = { type: 'ADVANCE_PHASE' as const };

export function piece(state: GameState, id: string): Piece {
  const found = state.pieces.find((p) => p.id === id);
  if (!found) throw new Error(`fixture: no piece ${id}`);
  return found;
}

export function adjacent(state: GameState, systemId: string): string[] {
  const sys = state.systems.find((s) => s.id === systemId);
  if (!sys) throw new Error(`fixture: no system ${systemId}`);
  return sys.adjacentSystemIds;
}

/** A system that is neither `systemId` nor adjacent to it. */
export function pickNonAdjacent(state: GameState, systemId: string): string {
  const adj = adjacent(state, systemId);
  const found = state.systems.find((s) => s.id !== systemId && !adj.includes(s.id));
  if (!found) throw new Error(`fixture: every system is adjacent to ${systemId}`);
  return found.id;
}

/** First system with ≥ 2 pieces of `owner` (R-3), with those piece ids. */
export function stackOf(
  state: GameState,
  owner: Faction,
): { systemId: string; pieceIds: string[] } {
  for (const sys of state.systems) {
    const ids = state.pieces
      .filter((p) => p.owner === owner && p.systemId === sys.id)
      .map((p) => p.id);
    if (ids.length >= 2) return { systemId: sys.id, pieceIds: ids };
  }
  throw new Error(`fixture: no stack of ${owner}`);
}

/** First hidden piece of `owner`. */
export function hiddenPieceOf(state: GameState, owner: Faction): Piece {
  const found = state.pieces.find((p) => p.owner === owner && p.hidden === true);
  if (!found) throw new Error(`fixture: no hidden ${owner} piece`);
  return found;
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
