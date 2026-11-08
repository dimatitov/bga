// API helpers for e2e specs (SWR-002). Only public endpoints are used — no test-only backend routes (R-7).
// Types are a local, minimal mirror of `@swr/contracts` (the root workspace does not depend on contracts).
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

export type Faction = 'empire' | 'rebellion';
export type Phase = 'assignment' | 'command' | 'refresh';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface GameSetup {
  humanFaction: Faction;
  opponent: { kind: 'ai'; difficulty?: Difficulty } | { kind: 'human' };
}

export interface SystemView {
  id: string;
  nameKey: string;
  regionId: string;
  adjacentSystemIds: string[];
}

export interface PieceView {
  id: string;
  kind: 'unit' | 'leader' | 'token';
  owner: Faction;
  typeKey: string;
  systemId: string;
  hidden?: boolean;
}

export interface GameEventView {
  seq: number;
  type: 'GAME_CREATED' | 'PIECES_MOVED' | 'PHASE_ADVANCED';
  actor: Faction | 'system';
  payload: unknown;
  at: string;
}

export type LegalAction =
  { type: 'MOVE_PIECES'; pieceId: string; toSystemIds: string[] } | { type: 'ADVANCE_PHASE' };

export interface PlayerView {
  id: string;
  version: number;
  round: number;
  phase: Phase;
  setup: GameSetup;
  systems: SystemView[];
  pieces: PieceView[];
  rebelBase: { systemId: string | null; revealed: boolean };
  log: GameEventView[];
  legalActions: LegalAction[];
}

export interface GameSummary {
  gameId: string;
  setup: GameSetup;
  round: number;
  phase: Phase;
  updatedAt: string;
}

export type Command =
  | { type: 'MOVE_PIECES'; pieceIds: string[]; fromSystemId: string; toSystemId: string }
  | { type: 'ADVANCE_PHASE' };

export const EMPIRE_VS_AI: GameSetup = {
  humanFaction: 'empire',
  opponent: { kind: 'ai', difficulty: 'normal' },
};
export const REBELLION_VS_AI: GameSetup = {
  humanFaction: 'rebellion',
  opponent: { kind: 'ai', difficulty: 'normal' },
};

export async function createGame(
  request: APIRequestContext,
  setup: GameSetup = EMPIRE_VS_AI,
): Promise<{ gameId: string; view: PlayerView }> {
  const res = await request.post('/api/games', { data: setup });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { gameId: string; view: PlayerView };
}

export async function getView(request: APIRequestContext, gameId: string): Promise<PlayerView> {
  const res = await request.get(`/api/games/${gameId}`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as PlayerView;
}

export async function listGames(request: APIRequestContext): Promise<GameSummary[]> {
  const res = await request.get('/api/games');
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as GameSummary[];
}

/** Sends a command as the human side with the view's current version. */
export function postCommand(
  request: APIRequestContext,
  view: Pick<PlayerView, 'id' | 'version' | 'setup'>,
  command: Command,
): Promise<APIResponse> {
  return request.post(`/api/games/${view.id}/commands`, {
    data: { actor: view.setup.humanFaction, expectedVersion: view.version, command },
  });
}

export function moveActions(view: PlayerView) {
  return view.legalActions.filter(
    (a): a is Extract<LegalAction, { type: 'MOVE_PIECES' }> => a.type === 'MOVE_PIECES',
  );
}

export function piece(view: PlayerView, pieceId: string): PieceView {
  const p = view.pieces.find((x) => x.id === pieceId);
  if (!p) throw new Error(`piece ${pieceId} not in view`);
  return p;
}

export function system(view: PlayerView, systemId: string): SystemView {
  const s = view.systems.find((x) => x.id === systemId);
  if (!s) throw new Error(`system ${systemId} not in view`);
  return s;
}

export interface MoveFixture {
  pieceId: string;
  fromSystemId: string;
  /** a legal target from `legalActions` */
  toSystemId: string;
  /** all legal targets for this piece */
  legalTargets: string[];
  /** a system that is neither the origin nor adjacent to it */
  illegalSystemId: string;
}

/**
 * Picks an own piece that has a legal move and whose origin has a non-adjacent system (fixtures are derived from
 * the server view, never hard-coded — test-cases.md "Нотация фикстур").
 */
export function pickMove(view: PlayerView, exclude: string[] = []): MoveFixture {
  for (const action of moveActions(view)) {
    if (exclude.includes(action.pieceId) || action.toSystemIds.length === 0) continue;
    const from = piece(view, action.pieceId).systemId;
    const adjacent = system(view, from).adjacentSystemIds;
    const illegal = view.systems.find((s) => s.id !== from && !adjacent.includes(s.id));
    const to = action.toSystemIds[0];
    if (!illegal || !to) continue;
    return {
      pieceId: action.pieceId,
      fromSystemId: from,
      toSystemId: to,
      legalTargets: [...action.toSystemIds],
      illegalSystemId: illegal.id,
    };
  }
  throw new Error(
    'mock scenario has no own piece with a legal move and a non-adjacent system (R-3)',
  );
}

export function enemyPieces(view: PlayerView): PieceView[] {
  return view.pieces.filter((p) => p.owner !== view.setup.humanFaction);
}

/** Deep-scans a JSON value; returns paths of keys named `key`. */
export function findKeyPaths(value: unknown, key: string, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => findKeyPaths(v, key, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(k === key ? [`${path}.${k}`] : []),
      ...findKeyPaths(v, key, `${path}.${k}`),
    ]);
  }
  return [];
}

/** Collects every `rebelBase` object found anywhere in a JSON value. */
export function findRebelBases(value: unknown): { systemId: string | null; revealed: boolean }[] {
  if (Array.isArray(value)) return value.flatMap(findRebelBases);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) =>
      k === 'rebelBase' && v && typeof v === 'object'
        ? [v as { systemId: string | null; revealed: boolean }, ...findRebelBases(v)]
        : findRebelBases(v),
    );
  }
  return [];
}
