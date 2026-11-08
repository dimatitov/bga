// API helpers for e2e specs (SWR-002 → SWR-003 sessions API → SWR-004 wire). Only public endpoints are used — no
// test-only backend routes (R-7). Types are a local, minimal mirror of `@bga/platform` (sessions DTO) and
// `@bga/game-rebellion/schema` (the root workspace does not depend on them).
// SWR-004 wire (specification.md Contract, plan-backend §3–§4): `POST /api/sessions { gameId, setup: RebellionSetupInput }`
// + optional `Idempotency-Key` header; responses `{ sessionId, gameId, status, settings, view }`, where `view` is the
// union `{ kind: 'player', viewer, … } | { kind: 'handoff', id, version, activeSide, round, phase, sessionStatus }`.
import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

/** `GameDefinition.id` of the only playable game (spec Assumptions). */
export const REBELLION = 'star-wars-rebellion';
/** `coming_soon` game: definition + cover only; sessions cannot be created (AC-6). */
export const FORBIDDEN_STARS = 'forbidden-stars';
/** Mirror of `RECENT_SESSIONS_LIMIT` (plan-frontend §3) — the game page shows at most this many recent sessions. */
export const RECENT_SESSIONS_LIMIT = 5;
/** Mirrors of `IDEMPOTENCY_KEY_HEADER` / `IDEMPOTENT_REPLAY_HEADER` (`@bga/platform`, plan-backend §3.1). */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENT_REPLAY_HEADER = 'Idempotent-Replay';
/** RFC 4122 UUID (any version) — the server accepts `z.uuid()` (Q-2). */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Faction = 'rebels' | 'empire';
export type OpponentType = 'ai' | 'human';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Ruleset = 'base' | 'rise-of-the-empire';
export type GameMode = 'digital' | 'physical_companion';
export type Phase = 'assignment' | 'command' | 'refresh';
export type SessionStatus = 'setup' | 'prototype' | 'active' | 'completed';

export const opponentOf = (f: Faction): Faction => (f === 'rebels' ? 'empire' : 'rebels');

/** Client input of `POST /api/sessions` (`RebellionSetupInput`, strict on the server). */
export interface SetupInput {
  playerFaction: Faction;
  opponentType: OpponentType;
  aiDifficulty?: Difficulty | null;
  ruleset: Ruleset;
  gameMode: GameMode;
}

/** Stored/public settings computed by the server (`RebellionSettings`, exactly these 6 keys). */
export interface Settings {
  playerFaction: Faction;
  opponentFaction: Faction;
  opponentType: OpponentType;
  aiDifficulty: Difficulty | null;
  ruleset: Ruleset;
  gameMode: GameMode;
}

/** Public settings keys (TC-U-13) — no `aiFaction`, no `schemaVersion`. */
export const SETTINGS_KEYS = [
  'aiDifficulty',
  'gameMode',
  'opponentFaction',
  'opponentType',
  'playerFaction',
  'ruleset',
] as const;
/** Rebellion `SessionSummary.details` keys (TC-U-14, Q-20). */
export const DETAILS_KEYS = [...SETTINGS_KEYS, 'phase', 'round'].sort();
/** Handoff view keys (spec + AM-BE-1/Q-12): nothing else is allowed. */
export const HANDOFF_VIEW_KEYS = [
  'activeSide',
  'id',
  'kind',
  'phase',
  'round',
  'sessionStatus',
  'version',
] as const;
/** Keys that must never appear in a handoff response (AC-14). */
export const BOARD_DATA_KEYS = ['systems', 'pieces', 'log', 'legalActions', 'rebelBase', 'setup'];

/** PO defaults (AC-02): Rebels, AI, Normal, Base, Digital. */
export const DEFAULT_INPUT: SetupInput = {
  playerFaction: 'rebels',
  opponentType: 'ai',
  aiDifficulty: 'normal',
  ruleset: 'base',
  gameMode: 'digital',
};
export const REBELS_VS_AI: SetupInput = DEFAULT_INPUT;
export const EMPIRE_VS_AI: SetupInput = { ...DEFAULT_INPUT, playerFaction: 'empire' };
export const EMPIRE_VS_AI_HARD: SetupInput = { ...EMPIRE_VS_AI, aiDifficulty: 'hard' };
/** Hot-seat: `aiDifficulty` is omitted for a human opponent (plan-frontend §2.4). */
export const REBELS_VS_HUMAN: SetupInput = {
  playerFaction: 'rebels',
  opponentType: 'human',
  ruleset: 'base',
  gameMode: 'digital',
};

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
  type: 'GAME_CREATED' | 'PIECES_MOVED' | 'PHASE_ADVANCED' | 'TURN_ENDED' | 'HANDOFF_ACCEPTED';
  actor: Faction | 'system';
  payload: unknown;
  at: string;
}

export type LegalAction =
  | { type: 'MOVE_PIECES'; pieceId: string; toSystemIds: string[] }
  | { type: 'ADVANCE_PHASE' }
  | { type: 'END_TURN' };

/** `kind: 'player'` — the view of the active side (`viewer`); no `setup`, settings live in `settings` (Q-11). */
export interface PlayerView {
  kind: 'player';
  viewer: Faction;
  activeSide: Faction;
  settings: Settings;
  id: string;
  version: number;
  round: number;
  phase: Phase;
  systems: SystemView[];
  pieces: PieceView[];
  rebelBase: { systemId: string | null; revealed: boolean };
  log: GameEventView[];
  legalActions: LegalAction[];
}

/** `kind: 'handoff'` — public metadata only (spec Hot-seat, Q-12). */
export interface HandoffView {
  kind: 'handoff';
  id: string;
  version: number;
  activeSide: Faction;
  round: number;
  phase: Phase;
  sessionStatus: SessionStatus;
}

export type AnyView = PlayerView | HandoffView;

export const isHandoff = (view: AnyView): view is HandoffView => view.kind === 'handoff';

/** Narrows a view to `kind: 'player'` (fails the test otherwise). */
export function asPlayer(view: AnyView): PlayerView {
  expect(view.kind, 'expected a player view').toBe('player');
  return view as PlayerView;
}

/** Narrows a view to `kind: 'handoff'` (fails the test otherwise). */
export function asHandoff(view: AnyView): HandoffView {
  expect(view.kind, 'expected a handoff view').toBe('handoff');
  return view as HandoffView;
}

/** Mirror of `SessionSummary` (`@bga/platform/sessions.ts`) + `status` (SWR-004). */
export interface SessionSummary {
  sessionId: string;
  gameId: string;
  status: SessionStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  details: Record<string, string | number | boolean | null>;
}

/** `POST /api/sessions` (201 / 200 replay) and `GET /api/sessions/:id`. */
export interface SessionResponse<V = AnyView> {
  sessionId: string;
  gameId: string;
  status: SessionStatus;
  settings: Settings;
  view: V;
}

/** Error body of the unified error format (SWR-002 errors, SWR-003/004 codes). */
export interface ErrorBody {
  ok: false;
  error: { code: string; messageKey: string; details?: unknown };
}

export type Command =
  | { type: 'MOVE_PIECES'; pieceIds: string[]; fromSystemId: string; toSystemId: string }
  | { type: 'ADVANCE_PHASE' }
  | { type: 'END_TURN' }
  | { type: 'ACCEPT_HANDOFF' };

export const newIdempotencyKey = (): string => randomUUID();

/** Raw `POST /api/sessions` (no assertions) — for negative and idempotency checks. */
export function postSession(
  request: APIRequestContext,
  setup: unknown,
  options: { gameId?: string; idempotencyKey?: string } = {},
): Promise<APIResponse> {
  return request.post('/api/sessions', {
    data: { gameId: options.gameId ?? REBELLION, setup },
    headers: options.idempotencyKey
      ? { [IDEMPOTENCY_KEY_HEADER]: options.idempotencyKey }
      : undefined,
  });
}

/**
 * `POST /api/sessions { gameId, setup }` → 201 `{ sessionId, gameId, status, settings, view }`.
 * Default: Empire vs AI (as in SWR-003 specs). A freshly created session always has a player view.
 */
export async function createSession(
  request: APIRequestContext,
  setup: SetupInput = EMPIRE_VS_AI,
  options: { gameId?: string; idempotencyKey?: string } = {},
): Promise<SessionResponse<PlayerView>> {
  const gameId = options.gameId ?? REBELLION;
  const res = await postSession(request, setup, { ...options, gameId });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as SessionResponse;
  expect(body.gameId).toBe(gameId);
  return { ...body, view: asPlayer(body.view) };
}

/** `GET /api/sessions/:id` → `{ sessionId, gameId, status, settings, view }` (view may be a handoff view). */
export async function getSession(
  request: APIRequestContext,
  sessionId: string,
): Promise<SessionResponse> {
  const res = await request.get(`/api/sessions/${encodeURIComponent(sessionId)}`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as SessionResponse;
}

/** Shortcut: the player view of a session (fails if the session is in handoff). */
export async function getView(request: APIRequestContext, sessionId: string): Promise<PlayerView> {
  return asPlayer((await getSession(request, sessionId)).view);
}

/** `GET /api/sessions[?gameId=]` → `SessionSummary[]`, `updatedAt` desc, at most 20. */
export async function listSessions(
  request: APIRequestContext,
  gameId?: string,
): Promise<SessionSummary[]> {
  const url = gameId ? `/api/sessions?gameId=${encodeURIComponent(gameId)}` : '/api/sessions';
  const res = await request.get(url);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as SessionSummary[];
}

/**
 * Sends a command (`POST /api/sessions/:id/commands`) with the view's current version.
 * Actor (Q-11): `viewer` of a player view, `activeSide` of a handoff view, or an explicit `actor`.
 */
export function postCommand(
  request: APIRequestContext,
  sessionId: string,
  view: Pick<PlayerView, 'version' | 'viewer'> | Pick<HandoffView, 'version' | 'activeSide'>,
  command: Command,
  actor?: Faction,
): Promise<APIResponse> {
  const side = actor ?? ('viewer' in view ? view.viewer : view.activeSide);
  return request.post(`/api/sessions/${encodeURIComponent(sessionId)}/commands`, {
    data: { actor: side, expectedVersion: view.version, command },
  });
}

/** Success body of `POST /api/sessions/:id/commands` (`SessionCommandOk`). */
export interface CommandResponse {
  ok: true;
  view: AnyView;
  events: unknown[];
}

/** Hot-seat: `END_TURN` by the active side → handoff view (TR-5). */
export async function endTurn(
  request: APIRequestContext,
  sessionId: string,
  view: PlayerView,
): Promise<HandoffView> {
  const res = await postCommand(request, sessionId, view, { type: 'END_TURN' });
  expect(res.status(), await res.text()).toBe(200);
  return asHandoff(((await res.json()) as CommandResponse).view);
}

/** Hot-seat: `ACCEPT_HANDOFF` by the new active side → its player view (TR-5). */
export async function acceptHandoff(
  request: APIRequestContext,
  sessionId: string,
  view: HandoffView,
): Promise<PlayerView> {
  const res = await postCommand(request, sessionId, view, { type: 'ACCEPT_HANDOFF' });
  expect(res.status(), await res.text()).toBe(200);
  return asPlayer(((await res.json()) as CommandResponse).view);
}

/** Pathname matchers of the sessions API (used by network filters in specs). */
export const API = {
  sessions: /^\/api\/sessions$/,
  session: /^\/api\/sessions\/[^/]+$/,
  commands: /^\/api\/sessions\/[^/]+\/commands$/,
} as const;

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

/** Pieces of the side that is not the viewer. */
export function enemyPieces(view: PlayerView): PieceView[] {
  return view.pieces.filter((p) => p.owner !== view.viewer);
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

/**
 * AC-14 leak check of a handoff response: exactly the allowed keys, no board data anywhere, and none of the
 * given system/piece ids in the serialized body.
 */
export function expectHandoffOnly(body: unknown, boardIds: string[], where: string): void {
  const view = (body as { view?: unknown }).view;
  expect(view, `${where}: has a view`).toBeTruthy();
  expect(Object.keys(view as object).sort(), `${where}: handoff view keys`).toEqual([
    ...HANDOFF_VIEW_KEYS,
  ]);
  for (const k of BOARD_DATA_KEYS) {
    expect(findKeyPaths(body, k), `${where}: "${k}" must not be in a handoff response`).toEqual([]);
  }
  const raw = JSON.stringify(body);
  for (const id of boardIds) {
    expect(raw.includes(`"${id}"`), `${where}: board id "${id}" leaked`).toBe(false);
  }
}

/** Ids of all systems and pieces of a player view (for leak checks of handoff responses). */
export const boardIdsOf = (view: PlayerView): string[] => [
  ...view.systems.map((s) => s.id),
  ...view.pieces.map((p) => p.id),
];
