import { copyFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { CommandErrSchema, SessionResponseSchema } from '@bga/platform';
import { REBELLION_GAME_ID } from '@bga/game-rebellion/definition';
import {
  PlayerViewPlayerSchema,
  PlayerViewSchema,
  type CommandEnvelope,
  type Faction,
  type MockPlayerView,
  type PlayerViewPlayer,
  type RebellionSetupInput,
} from '@bga/game-rebellion/schema';
import { mockScenario } from '@bga/game-rebellion/scenario';
import { expect } from 'vitest';
import type { Clock, IdGenerator } from '../../src/common/runtime.tokens';
import { PrismaService } from '../../src/persistence/prisma.service';
import { TMP_DIR } from '../global-setup';
import { createSwr004Db, v2Sessions, type Swr004Db, type V2SessionFixture } from './swr004-db';
import { api, type TestDb } from './test-app';

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

/**
 * A Rebellion session (the only real playable game); a new session always shows the board (`kind: 'player'`).
 * SWR-005 W6a: the view is the board of EITHER engine — creation tests assert only engine-independent fields;
 * mock-v1 behaviour is checked on seeded v2 rows (`createSeededDb`), so W5 can switch new sessions to core-v1.
 */
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

/** Narrows a Rebellion view to the mock-v1 board projection (fails on a handoff view or a core-v1 board). */
export function playerView(view: unknown): MockPlayerView {
  const parsed = PlayerViewSchema.parse(view);
  if (parsed.kind !== 'player') throw new Error(`expected a player view, got ${parsed.kind}`);
  if (parsed.rulesEngine !== 'mock-v1') throw new Error('expected a mock-v1 board');
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

export function pieceIn(view: Pick<MockPlayerView, 'pieces'>, pieceId: string) {
  return view.pieces.find((p) => p.id === pieceId);
}

// ---------------------------------------------------------------------------------------------------------
// SWR-005 W6a: seeded mock-v1 rows (frozen v2 snapshot written by the SWR-004 code, Q-1)
// ---------------------------------------------------------------------------------------------------------

/** The three rows of `test/fixtures/v2/sessions.v2.json`, by their setup. */
export type SeededKind = 'rebelsAi' | 'empireAi' | 'hotseat';

interface SeededSettings {
  playerFaction: Faction;
  opponentFaction: Faction;
  opponentType: 'ai' | 'human';
}

/** `settings` of a stored v2 state (the snapshot is typed loosely in `swr004-db.ts`). */
export function seededSettings(row: V2SessionFixture): SeededSettings {
  return row.state.settings as SeededSettings;
}

function kindOf(row: V2SessionFixture): SeededKind {
  const settings = seededSettings(row);
  if (settings.opponentType === 'human') return 'hotseat';
  return settings.playerFaction === 'rebels' ? 'rebelsAi' : 'empireAi';
}

/**
 * Seeded rows by kind (read synchronously from the snapshot, so `it.each` tables can use their versions):
 * `rebelsAi` — Rebels vs AI, v3, round 1 `command`, Rebels active (move + ADVANCE_PHASE);
 * `empireAi` — Empire vs AI/hard, v2, round 1 `assignment`, Empire active (one move);
 * `hotseat` — Rebels vs human, v3, in a handoff to the Empire (move + END_TURN).
 */
export const SEEDED: Record<SeededKind, V2SessionFixture> = (() => {
  const rows = Object.fromEntries(v2Sessions().map((row) => [kindOf(row), row]));
  for (const kind of ['rebelsAi', 'empireAi', 'hotseat'] as const) {
    if (!rows[kind]) throw new Error(`v2 snapshot has no ${kind} row`);
  }
  return rows as Record<SeededKind, V2SessionFixture>;
})();

let seededTemplate: Swr004Db | undefined;

/**
 * A fresh per-test copy of an SWR-004-shaped DB with all v2 rows (`createSwr004Db`, built once per test file:
 * `migrate deploy` is slow). Remove it with `removeTestDb` / `stopApp(app, db)` like any `TestDb`.
 */
export async function createSeededDb(): Promise<TestDb> {
  if (!seededTemplate) {
    const template = await createSwr004Db();
    seededTemplate = template;
    process.once('exit', () => template.remove());
  }
  const file = join(TMP_DIR, `test-seeded-${randomUUID()}.db`);
  copyFileSync(seededTemplate.file, file);
  return { file, url: `file:${file}` };
}

/** Stored piece of a seeded mock state (minimal shape for picking moves). */
interface SeededPiece {
  id: string;
  owner: Faction;
  systemId: string;
  hidden?: boolean;
}

export function seededPieces(row: V2SessionFixture): SeededPiece[] {
  return row.state.pieces as SeededPiece[];
}

/** Like `movable`, but from the CURRENT positions of a seeded row (its pieces may have moved already). */
export function movableIn(row: V2SessionFixture, owner: Faction) {
  const piece = seededPieces(row).find((p) => p.owner === owner && !p.hidden);
  if (!piece) throw new Error(`no ${owner} piece in seeded row`);
  const from = systemsById.get(piece.systemId);
  if (!from) throw new Error('bad seeded row');
  const adjacent = from.adjacentSystemIds[0];
  const nonAdjacent = mockScenario.systems.find(
    (s) => s.id !== from.id && !from.adjacentSystemIds.includes(s.id),
  )?.id;
  if (!adjacent || !nonAdjacent) throw new Error('bad seeded row');
  return { pieceId: piece.id, from: from.id, adjacent, nonAdjacent };
}
