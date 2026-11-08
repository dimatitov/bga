import type { INestApplication } from '@nestjs/common';
import {
  CommandErrSchema,
  CreateGameResponseSchema,
  type CommandEnvelope,
  type Faction,
  type GameSetupInput,
  type PlayerView,
} from '@swr/contracts';
import { mockScenario } from '@swr/game-data';
import { expect } from 'vitest';
import type { Clock, IdGenerator } from '../../src/common/runtime.tokens';
import { PrismaService } from '../../src/persistence/prisma.service';
import { api } from './test-app';

export const EMPIRE_AI: GameSetupInput = {
  humanFaction: 'empire',
  opponent: { kind: 'ai', difficulty: 'hard' },
};
export const REBELLION_HUMAN: GameSetupInput = {
  humanFaction: 'rebellion',
  opponent: { kind: 'human' },
};

const systemsById = new Map(mockScenario.systems.map((s) => [s.id, s]));

/** A visible piece of `owner` with an adjacent and a non-adjacent target (taken from the scenario). */
export function movable(owner: Faction) {
  const piece = mockScenario.pieces.find((p) => p.owner === owner && !p.hidden);
  if (!piece) throw new Error(`no ${owner} piece in scenario`);
  const from = systemsById.get(piece.systemId);
  if (!from) throw new Error('bad scenario');
  const adjacent = from.adjacentSystemIds[0];
  const nonAdjacent = mockScenario.systems.find(
    (s) => s.id !== from.id && !from.adjacentSystemIds.includes(s.id),
  )?.id;
  if (!adjacent || !nonAdjacent) throw new Error('bad scenario');
  return { pieceId: piece.id, from: from.id, adjacent, nonAdjacent };
}

/** The hidden Rebel piece (its real typeKey must never reach an Empire player). */
export const HIDDEN_REBEL = (() => {
  const piece = mockScenario.pieces.find((p) => p.owner === 'rebellion' && p.hidden);
  if (!piece) throw new Error('scenario has no hidden rebel piece');
  return piece;
})();
export const REBEL_BASE_SYSTEM = mockScenario.rebelBaseSystemId;

/** Deterministic clock: each call advances by one second. */
export function tickingClock(start = Date.UTC(2026, 0, 1)): Clock {
  let t = start;
  return {
    now: () => {
      const iso = new Date(t).toISOString();
      t += 1000;
      return iso;
    },
  };
}

export function sequentialIds(prefix = 'game'): IdGenerator {
  let n = 0;
  return { gameId: () => `${prefix}-${String(++n).padStart(3, '0')}` };
}

export async function createGame(
  app: INestApplication,
  setup: GameSetupInput = EMPIRE_AI,
): Promise<{ gameId: string; view: PlayerView }> {
  const res = await api(app).post('/api/games').send(setup);
  expect(res.status).toBe(201);
  return CreateGameResponseSchema.parse(res.body);
}

export function moveEnv(
  actor: Faction,
  expectedVersion: number,
  pieceIds: string[],
  fromSystemId: string,
  toSystemId: string,
): CommandEnvelope {
  return {
    actor,
    expectedVersion,
    command: { type: 'MOVE_PIECES', pieceIds, fromSystemId, toSystemId },
  };
}

export function advanceEnv(actor: Faction, expectedVersion: number): CommandEnvelope {
  return { actor, expectedVersion, command: { type: 'ADVANCE_PHASE' } };
}

export function postCommand(app: INestApplication, gameId: string, body: unknown) {
  return api(app)
    .post(`/api/games/${gameId}/commands`)
    .send(body as object);
}

/** Asserts the unified error body (R-8) and returns it. */
export function expectError(
  res: { status: number; body: unknown },
  status: number,
  code: string,
  messageKey?: string,
) {
  expect(res.status).toBe(status);
  const body = CommandErrSchema.parse(res.body);
  expect(body.error.code).toBe(code);
  if (messageKey) expect(body.error.messageKey).toBe(messageKey);
  return body;
}

export function prismaOf(app: INestApplication): PrismaService {
  return app.get(PrismaService);
}

/** Snapshot of the persisted row + event rows, for "nothing changed" assertions. */
export async function dbSnapshot(app: INestApplication, gameId: string) {
  const prisma = prismaOf(app);
  const game = await prisma.game.findUnique({ where: { id: gameId } });
  const events = await prisma.gameEvent.findMany({ where: { gameId }, orderBy: { seq: 'asc' } });
  return { game, events };
}

export function pieceIn(view: PlayerView, pieceId: string) {
  return view.pieces.find((p) => p.id === pieceId);
}
