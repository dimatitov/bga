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
/** Rebellion `SessionSummary.details` keys (TC-U-14, Q-20; SWR-005: + rulesEngine, winner, reputation). */
export const DETAILS_KEYS = [
  ...SETTINGS_KEYS,
  'phase',
  'round',
  'rulesEngine',
  'winner',
  'reputation',
].sort();
/** Handoff view keys (spec + AM-BE-1/Q-12): nothing else is allowed. */
export const HANDOFF_VIEW_KEYS = [
  'activeSide',
  'id',
  'kind',
  'phase',
  'round',
  'rulesEngine',
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
  /** SWR-005: the mock rules (old sessions / until the switch to core-v1). */
  rulesEngine: 'mock-v1';
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
  rulesEngine: 'mock-v1' | 'core-v1';
  id: string;
  version: number;
  activeSide: Faction;
  round: number;
  phase: Phase;
  sessionStatus: SessionStatus;
}

export type AnyView = PlayerView | CorePlayerView | HandoffView;

export const isHandoff = (view: AnyView): view is HandoffView => view.kind === 'handoff';

/** Narrows a view to a `mock-v1` player view (legacy sessions; fails the test otherwise). */
export function asPlayer(view: AnyView): PlayerView {
  expect(view.kind, 'expected a player view').toBe('player');
  expect((view as PlayerView).rulesEngine, 'expected a mock-v1 (legacy) player view').toBe(
    'mock-v1',
  );
  return view as PlayerView;
}

/** Narrows a view to a `core-v1` player view (fails the test otherwise). */
export function asCore(view: AnyView): CorePlayerView {
  expect(view.kind, 'expected a player view').toBe('player');
  expect((view as CorePlayerView).rulesEngine, 'expected a core-v1 player view').toBe('core-v1');
  return view as CorePlayerView;
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
  | { type: 'ACCEPT_HANDOFF' }
  // SWR-005 core-v1
  | { type: 'ACTIVATE_SYSTEM'; leaderId: string; systemId: string }
  | { type: 'FINISH_ACTIVATION' }
  | { type: 'PASS' };

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
 * Default: Empire vs AI (as in SWR-003 specs). A freshly created session always has a player view and, since
 * SWR-005, always runs on `core-v1` (old mock sessions only come from seeded rows — `support/seed.ts`).
 */
export async function createSession(
  request: APIRequestContext,
  setup: SetupInput = EMPIRE_VS_AI,
  options: { gameId?: string; idempotencyKey?: string } = {},
): Promise<SessionResponse<CorePlayerView>> {
  const gameId = options.gameId ?? REBELLION;
  const res = await postSession(request, setup, { ...options, gameId });
  expect(res.status(), await res.text()).toBe(201);
  const body = (await res.json()) as SessionResponse;
  expect(body.gameId).toBe(gameId);
  return { ...body, view: asCore(body.view) };
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

/** Shortcut: the `mock-v1` player view of a (legacy) session (fails if in handoff or on core-v1). */
export async function getView(request: APIRequestContext, sessionId: string): Promise<PlayerView> {
  return asPlayer((await getSession(request, sessionId)).view);
}

/** Shortcut: the `core-v1` player view of a session (fails if in handoff or on mock-v1). */
export async function getCoreView(
  request: APIRequestContext,
  sessionId: string,
): Promise<CorePlayerView> {
  return asCore((await getSession(request, sessionId)).view);
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
  view:
    | Pick<PlayerView, 'version' | 'viewer'>
    | Pick<CorePlayerView, 'version' | 'viewer'>
    | Pick<HandoffView, 'version' | 'activeSide'>,
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
  view: Pick<PlayerView, 'version' | 'viewer'>,
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

/** Hot-seat (core-v1): `ACCEPT_HANDOFF` by the new active side → its core player view. */
export async function acceptHandoffCore(
  request: APIRequestContext,
  sessionId: string,
  view: HandoffView,
): Promise<CorePlayerView> {
  const res = await postCommand(request, sessionId, view, { type: 'ACCEPT_HANDOFF' });
  expect(res.status(), await res.text()).toBe(200);
  return asCore(((await res.json()) as CommandResponse).view);
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

// ---------------------------------------------------------------------------------------------------------------
// SWR-005 core-v1 wire (plan-backend §8, spec Contract; local mirror of `CorePlayerViewSchema`)
// ---------------------------------------------------------------------------------------------------------------

export type RulesEngine = 'mock-v1' | 'core-v1';
export type ViewLocation = { kind: 'system'; systemId: string } | { kind: 'rebelBase' };
export type LeaderLocation = { kind: 'pool' } | ViewLocation;

export interface CoreSystemView {
  id: string;
  nameKey: string;
  regionId: string;
  adjacentSystemIds: string[];
  remote: boolean;
}

export interface CoreUnitType {
  typeKey: string;
  owner: Faction;
  arena: 'space' | 'ground';
  mobility: 'mobile' | 'immobile';
  transportCapacity: number;
  requiresTransport: boolean;
}

export interface CoreUnitView {
  id: string;
  owner: Faction;
  typeKey: string;
  location: ViewLocation;
}

export interface CoreLeaderView {
  id: string;
  owner: Faction;
  canActivate: boolean;
  location: LeaderLocation;
}

export interface CoreEventView {
  seq: number;
  at: string;
  type:
    | 'GAME_CREATED'
    | 'PIECES_MOVED'
    | 'HANDOFF_ACCEPTED'
    | 'PHASE_STARTED'
    | 'SYSTEM_ACTIVATED'
    | 'ACTIVATION_FINISHED'
    | 'PASSED'
    | 'LEADERS_RETURNED'
    | 'TIME_ADVANCED'
    | 'BASE_REVEALED'
    | 'GAME_OVER';
  actor: Faction | 'system';
  payload: Record<string, unknown>;
}

export type CoreLegalAction =
  | { type: 'ACTIVATE_SYSTEM'; leaderIds: string[]; systemIds: string[] }
  | {
      type: 'MOVE_PIECES';
      fromSystemId: string;
      toSystemId: string;
      pieces: { pieceId: string; transportCapacity: number; requiresTransport: boolean }[];
    }
  | { type: 'FINISH_ACTIVATION' }
  | { type: 'PASS' };

export type OutcomeReason = 'timeReachedReputation' | 'rebelBaseCaptured';

export interface CorePlayerView {
  kind: 'player';
  rulesEngine: 'core-v1';
  viewer: Faction;
  activeSide: Faction;
  settings: Settings;
  id: string;
  version: number;
  round: number;
  phase: Phase;
  markers: { time: number; reputation: number };
  map: { regions: { id: string; nameKey: string }[]; systems: CoreSystemView[] };
  unitTypes: CoreUnitType[];
  units: CoreUnitView[];
  leaders: CoreLeaderView[];
  activation: { side: Faction; leaderId: string; location: ViewLocation } | null;
  passed: { rebels: boolean; empire: boolean };
  rebelBase: { systemId: string | null; revealed: boolean };
  contestedSystemIds: string[];
  outcome: { winner: Faction; reason: OutcomeReason } | null;
  log: CoreEventView[];
  legalActions: CoreLegalAction[];
}

/** Base-game data facts used by the specs (spec Data clarifications). */
export const CORE_SYSTEM_COUNT = 32;
export const CORE_REGION_IDS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'] as const;
export const START_REPUTATION = 14;
export const LEADERS = {
  empire: ['palpatine', 'vader', 'tarkin', 'tagge'],
  rebels: ['mon-mothma', 'leia', 'dodonna', 'rieekan'],
} as const;
/** The only starting leader without tactic values (`canActivate: false`). */
export const MON_MOTHMA = 'mon-mothma';

/** Success body of a command with the events of that response (core-v1: several events per command). */
export interface CoreCommandResponse {
  ok: true;
  view: AnyView;
  events: CoreEventView[];
}

export function actionOf<T extends CoreLegalAction['type']>(
  view: CorePlayerView,
  type: T,
): Extract<CoreLegalAction, { type: T }> | undefined {
  return view.legalActions.find((a) => a.type === type) as
    Extract<CoreLegalAction, { type: T }> | undefined;
}

export function coreMoveActions(view: CorePlayerView) {
  return view.legalActions.filter(
    (a): a is Extract<CoreLegalAction, { type: 'MOVE_PIECES' }> => a.type === 'MOVE_PIECES',
  );
}

export const unitTypeOf = (view: CorePlayerView, typeKey: string): CoreUnitType => {
  const t = view.unitTypes.find((u) => u.typeKey === typeKey);
  if (!t) throw new Error(`unit type ${typeKey} not in view.unitTypes`);
  return t;
};

export const coreSystem = (view: CorePlayerView, id: string): CoreSystemView => {
  const s = view.map.systems.find((x) => x.id === id);
  if (!s) throw new Error(`system ${id} not in view.map.systems`);
  return s;
};

export const unitsIn = (view: CorePlayerView, systemId: string): CoreUnitView[] =>
  view.units.filter((u) => u.location.kind === 'system' && u.location.systemId === systemId);

export const poolOf = (view: CorePlayerView, side: Faction): CoreLeaderView[] =>
  view.leaders.filter((l) => l.owner === side && l.location.kind === 'pool');

export interface ActivationPlan {
  leaderId: string;
  /** system to activate */
  systemId: string;
  /** an adjacent system with an own unit that can move alone (mobile, no transport needed, no own leader there) */
  fromSystemId: string;
  /** that unit */
  pieceId: string;
}

/**
 * Picks an activation with at least one simple move (derived from the server view, never hard-coded): an own
 * mobile unit that needs no transport, in a system without an own leader, and an adjacent target system that is
 * not the hidden zone. `avoid` excludes target systems (e.g. the Rebels' own base, to keep the scenario plain).
 */
export function planActivation(view: CorePlayerView, avoid: string[] = []): ActivationPlan {
  const activate = actionOf(view, 'ACTIVATE_SYSTEM');
  if (!activate) throw new Error('ACTIVATE_SYSTEM is not legal in this view');
  const leaderId = activate.leaderIds[0]!;
  const ownLeaderAt = new Set(
    view.leaders
      .filter((l) => l.owner === view.viewer && l.location.kind === 'system')
      .map((l) => (l.location as { systemId: string }).systemId),
  );
  for (const u of view.units) {
    if (u.owner !== view.viewer || u.location.kind !== 'system') continue;
    const t = unitTypeOf(view, u.typeKey);
    if (t.mobility !== 'mobile' || t.requiresTransport) continue;
    const from = u.location.systemId;
    if (ownLeaderAt.has(from)) continue;
    for (const to of coreSystem(view, from).adjacentSystemIds) {
      if (avoid.includes(to) || !activate.systemIds.includes(to)) continue;
      return { leaderId, systemId: to, fromSystemId: from, pieceId: u.id };
    }
  }
  throw new Error('no own unit can move alone into an adjacent system');
}

/** Sends a command and expects 200; returns the parsed body (view of either kind + events). */
export async function commandOk(
  request: APIRequestContext,
  sessionId: string,
  view: Pick<CorePlayerView, 'version' | 'viewer'> | Pick<HandoffView, 'version' | 'activeSide'>,
  command: Command,
  actor?: Faction,
): Promise<CoreCommandResponse> {
  const res = await postCommand(request, sessionId, view, command, actor);
  expect(res.status(), `${command.type}: ${await res.text()}`).toBe(200);
  return (await res.json()) as CoreCommandResponse;
}

/** Sends a command and expects 422 with `errors.<key>`. */
export async function expectRejected(
  request: APIRequestContext,
  sessionId: string,
  view: Pick<CorePlayerView, 'version' | 'viewer'> | Pick<HandoffView, 'version' | 'activeSide'>,
  command: Command,
  key: string,
  actor?: Faction,
): Promise<void> {
  const res = await postCommand(request, sessionId, view, command, actor);
  expect(res.status(), `${command.type} → 422 ${key}`).toBe(422);
  expect(((await res.json()) as ErrorBody).error).toMatchObject({
    code: 'ILLEGAL_COMMAND',
    messageKey: `errors.${key}`,
  });
}

/**
 * TR-3 scanner: paths in `json` where the hidden base system id (or its i18n key `systems.<id>`) appears.
 * Allowed only in the static catalogue (`…map.systems[i]…`) and in `ACTIVATE_SYSTEM.systemIds` (all 32 systems).
 * Not applicable after `BASE_REVEALED` or an outcome.
 */
export function scanForBase(json: unknown, baseId: string, root = '$'): string[] {
  const hits: string[] = [];
  const allowed = (p: string) =>
    /\.map\.systems\[\d+\]/.test(p) || /\.legalActions\[\d+\]\.systemIds\[\d+\]$/.test(p);
  const walk = (v: unknown, p: string) => {
    if (typeof v === 'string') {
      if ((v === baseId || v === `systems.${baseId}` || v.includes(`"${baseId}"`)) && !allowed(p))
        hits.push(p);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${p}[${i}]`));
    if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === baseId && !allowed(p)) hits.push(`${p}.<key ${k}>`);
        walk(x, `${p}.${k}`);
      }
    }
  };
  walk(json, root);
  return hits;
}
