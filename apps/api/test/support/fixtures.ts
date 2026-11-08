import type { INestApplication } from '@nestjs/common';
import { CommandErrSchema, SessionResponseSchema } from '@bga/platform';
import { REBELLION_GAME_ID } from '@bga/game-rebellion/definition';
import {
  PlayerViewPlayerSchema,
  PlayerViewSchema,
  type CommandEnvelope,
  type Faction,
  type PlayerViewPlayer,
  type RebellionSetupInput,
} from '@bga/game-rebellion/schema';
import { mockScenario } from '@bga/game-rebellion/scenario';
import { expect } from 'vitest';
import type { Clock, IdGenerator } from '../../src/common/runtime.tokens';
import { PrismaService } from '../../src/persistence/prisma.service';
import { api } from './test-app';

export const R = REBELLION_GAME_ID;
export const FS = 'forbidden-stars';

/** AC-02 defaults (SWR-004 contract): Rebels vs AI, normal, base, digital. */
export const DEF: RebellionSetupInput = {
  playerFaction: 'rebels',
  opponentType: 'ai',
  aiDifficulty: 'normal',
  ruleset: 'base',
  gameMode: 'digital',
};
export const EMPIRE_AI: RebellionSetupInput = {
  playerFaction: 'empire',
  opponentType: 'ai',
  aiDifficulty: 'hard',
  ruleset: 'base',
  gameMode: 'digital',
};
/** Hot-seat: Rebels vs a second human on the same device (`aiDifficulty` omitted → stored null). */
export const REBELS_HUMAN: RebellionSetupInput = {
  playerFaction: 'rebels',
  opponentType: 'human',
  ruleset: 'base',
  gameMode: 'digital',
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
  const piece = mockScenario.pieces.find((p) => p.owner === 'rebels' && p.hidden);
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

export function sequentialIds(prefix = 'session'): IdGenerator {
  let n = 0;
  return { sessionId: () => `${prefix}-${String(++n).padStart(3, '0')}` };
}

/** `POST /api/sessions { gameId, setup }` → 201 (any game). */
export async function createSession(
  app: INestApplication,
  gameId: string,
  setup: unknown,
): Promise<{
  sessionId: string;
  gameId: string;
  status: string;
  settings: unknown;
  view: unknown;
}> {
  const res = await api(app).post('/api/sessions').send({ gameId, setup });
  expect(res.status).toBe(201);
  return SessionResponseSchema.parse(res.body);
}

/** A Rebellion session (the only real playable game); a new session always shows the board (`kind: 'player'`). */
export async function createRebellionSession(
  app: INestApplication,
  setup: RebellionSetupInput = EMPIRE_AI,
): Promise<{ sessionId: string; view: PlayerViewPlayer; settings: Record<string, unknown> }> {
  const { sessionId, gameId, view, settings } = await createSession(app, R, setup);
  expect(gameId).toBe(R);
  return {
    sessionId,
    view: PlayerViewPlayerSchema.parse(view),
    settings: settings as Record<string, unknown>,
  };
}

/** Narrows a Rebellion view to the board projection (fails on a handoff view). */
export function playerView(view: unknown): PlayerViewPlayer {
  const parsed = PlayerViewSchema.parse(view);
  if (parsed.kind !== 'player') throw new Error(`expected a player view, got ${parsed.kind}`);
  return parsed;
}

export function endTurnEnv(actor: Faction, expectedVersion: number): CommandEnvelope {
  return { actor, expectedVersion, command: { type: 'END_TURN' } };
}

export function acceptHandoffEnv(actor: Faction, expectedVersion: number): CommandEnvelope {
  return { actor, expectedVersion, command: { type: 'ACCEPT_HANDOFF' } };
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

export function postCommand(app: INestApplication, sessionId: string, body: unknown) {
  return api(app)
    .post(`/api/sessions/${sessionId}/commands`)
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
export async function dbSnapshot(app: INestApplication, sessionId: string) {
  const prisma = prismaOf(app);
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  const events = await prisma.sessionEvent.findMany({
    where: { sessionId },
    orderBy: { seq: 'asc' },
  });
  return { session, events };
}

export function pieceIn(view: Pick<PlayerViewPlayer, 'pieces'>, pieceId: string) {
  return view.pieces.find((p) => p.id === pieceId);
}
