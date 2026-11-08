/**
 * SWR-005 W6b: helpers for HTTP-level tests of `core-v1` sessions (real Nest app, real base-game data).
 * The scripted unit ids follow the start setup of the base game (W5 `core-scenarios.ts`): u-02 Rebel transport,
 * u-03 X-wing, u-05 trooper (Bothawui); u-09…u-14 the units on the base; u-29 Star Destroyer, u-33 stormtrooper
 * (Coruscant); u-40 Star Destroyer, u-41 TIE, u-42 TIE, u-43 stormtrooper, u-45 AT-ST (Sullust).
 * Fixed session ids make `chooseRebelBase` deterministic; tests still read the base from the DB row.
 */
import type { INestApplication } from '@nestjs/common';
import { CommandErrSchema, SessionResponseSchema } from '@bga/platform';
import {
  CoreGameStateV3Schema,
  CorePlayerViewSchema,
  HandoffViewSchema,
  PlayerViewSchema,
  type Command,
  type CoreGameState,
  type CorePlayerView,
  type Faction,
  type HandoffView,
  type PlayerView,
  type RebellionSetupInput,
} from '@bga/game-rebellion/schema';
import { expect } from 'vitest';
import type { IdGenerator } from '../../src/common/runtime.tokens';
import { R, dbSnapshot, postCommand, prismaOf } from './fixtures';
import { api } from './test-app';

/** The base of every fixed session id below (asserted against the DB row by the tests). */
export const BASE_SYSTEM = 'rodia';
/** Rebel units on the base at the start. */
export const BASE_UNITS = ['u-09', 'u-10', 'u-11', 'u-12', 'u-13', 'u-14'];

/** Hot-seat session id whose base is Rodia (W5 `golden-empire-win-3`). */
export const HS_SESSION = 'golden-empire-win-3';
/** Hot-seat session id whose base is Rodia (W5 `seed-win-1`). */
export const HS_SESSION_2 = 'seed-win-1';
/** Empire-vs-AI session id whose base is Rodia (W5 `seed-reveal-7`). */
export const AI_EMP_SESSION = 'seed-reveal-7';
/** Rebels-vs-AI session id (W5 `golden-rebels-time`). */
export const AI_REB_SESSION = 'golden-rebels-time';

export const HS_SETUP: RebellionSetupInput = {
  playerFaction: 'rebels',
  opponentType: 'human',
  ruleset: 'base',
  gameMode: 'digital',
};
export const AI_REB_SETUP: RebellionSetupInput = {
  playerFaction: 'rebels',
  opponentType: 'ai',
  aiDifficulty: 'normal',
  ruleset: 'base',
  gameMode: 'digital',
};
export const AI_EMP_SETUP: RebellionSetupInput = {
  playerFaction: 'empire',
  opponentType: 'ai',
  aiDifficulty: 'hard',
  ruleset: 'base',
  gameMode: 'digital',
};

/** Session ids handed out in order (then `extra-001…`), so a test can pin the base by the id. */
export function fixedIds(...ids: string[]): IdGenerator {
  const queue = [...ids];
  let n = 0;
  return { sessionId: () => queue.shift() ?? `extra-${String(++n).padStart(3, '0')}` };
}

// ---------------------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------------------

export interface Step {
  actor: Faction;
  command: Command;
}

export const activate = (actor: Faction, leaderId: string, systemId: string): Step => ({
  actor,
  command: { type: 'ACTIVATE_SYSTEM', leaderId, systemId },
});
export const move = (
  actor: Faction,
  pieceIds: string[],
  fromSystemId: string,
  toSystemId: string,
): Step => ({ actor, command: { type: 'MOVE_PIECES', pieceIds, fromSystemId, toSystemId } });
export const finish = (actor: Faction): Step => ({ actor, command: { type: 'FINISH_ACTIVATION' } });
export const pass = (actor: Faction): Step => ({ actor, command: { type: 'PASS' } });
export const accept = (actor: Faction): Step => ({ actor, command: { type: 'ACCEPT_HANDOFF' } });
export const advancePhase = (actor: Faction): Step => ({
  actor,
  command: { type: 'ADVANCE_PHASE' },
});
export const endTurn = (actor: Faction): Step => ({ actor, command: { type: 'END_TURN' } });

export function envelope(step: Step, expectedVersion: number) {
  return { actor: step.actor, expectedVersion, command: step.command };
}

// ---------------------------------------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------------------------------------

export interface WireEvent {
  seq: number;
  type: string;
  actor: string;
  at?: string;
  payload: Record<string, unknown>;
}

export interface CommandOk {
  ok: true;
  view: PlayerView;
  events: WireEvent[];
}

export function asCore(view: unknown): CorePlayerView {
  return CorePlayerViewSchema.parse(view);
}

export function asHandoff(view: unknown): HandoffView {
  return HandoffViewSchema.parse(view);
}

/** `POST /api/sessions` for Rebellion → 201; returns the raw body too (for scans). */
export async function createCore(app: INestApplication, setup: RebellionSetupInput) {
  const res = await api(app).post('/api/sessions').send({ gameId: R, setup });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const body = SessionResponseSchema.parse(res.body);
  const view = PlayerViewSchema.parse(body.view);
  return { sessionId: body.sessionId, status: body.status, view, body: res.body as unknown };
}

/** `GET /api/sessions/:id` → 200. */
export async function getSession(app: INestApplication, sessionId: string) {
  const res = await api(app).get(`/api/sessions/${sessionId}`);
  expect(res.status).toBe(200);
  const body = SessionResponseSchema.parse(res.body);
  return {
    status: body.status,
    view: PlayerViewSchema.parse(body.view),
    body: res.body as unknown,
  };
}

/** Version of any Rebellion view (board or handoff). */
export function versionOf(view: PlayerView): number {
  return view.version;
}

/**
 * A session driven through HTTP: `send` posts a step with the current version and expects 200;
 * `reject` posts it and returns the error response (the version is kept).
 */
export class CoreSession {
  version: number;

  constructor(
    private readonly app: INestApplication,
    readonly id: string,
    version: number,
  ) {
    this.version = version;
  }

  async post(step: Step, expectedVersion = this.version) {
    return postCommand(this.app, this.id, envelope(step, expectedVersion));
  }

  async send(step: Step): Promise<CommandOk & { raw: unknown }> {
    const res = await this.post(step);
    expect(
      res.status,
      `${step.actor} ${step.command.type} → ${res.status} ${JSON.stringify(res.body)}`,
    ).toBe(200);
    const body = res.body as { ok: true; view: unknown; events: WireEvent[] };
    const view = PlayerViewSchema.parse(body.view);
    this.version = view.version;
    return { ok: true, view, events: body.events, raw: res.body as unknown };
  }

  async play(steps: readonly Step[]): Promise<CommandOk & { raw: unknown }> {
    let last: (CommandOk & { raw: unknown }) | undefined;
    for (const step of steps) last = await this.send(step);
    if (!last) throw new Error('no steps');
    return last;
  }
}

/**
 * Posts a step that must be rejected with `status` / `code` / `messageKey`, and asserts that NOTHING changed:
 * the stored row (state, version, status, timestamps) and the event rows are identical before and after.
 */
export async function expectRejected(
  app: INestApplication,
  session: CoreSession,
  step: Step,
  expected: { status: number; code: string; messageKey?: string; details?: unknown },
  expectedVersion = session.version,
) {
  const before = await dbSnapshot(app, session.id);
  const res = await session.post(step, expectedVersion);
  expect(res.status, `${step.command.type}: ${JSON.stringify(res.body)}`).toBe(expected.status);
  const body = CommandErrSchema.parse(res.body);
  expect(body.error.code).toBe(expected.code);
  if (expected.messageKey) expect(body.error.messageKey).toBe(expected.messageKey);
  if (expected.details !== undefined) expect(body.error.details).toEqual(expected.details);
  const after = await dbSnapshot(app, session.id);
  expect(after).toEqual(before);
  return { body, raw: res.body as unknown };
}

/** The stored (authoritative) state of a session — the tests read the base from here. */
export async function storedState(
  app: INestApplication,
  sessionId: string,
): Promise<CoreGameState> {
  const row = await prismaOf(app).session.findUniqueOrThrow({ where: { id: sessionId } });
  return CoreGameStateV3Schema.parse(JSON.parse(row.state));
}

export async function storedRow(app: INestApplication, sessionId: string) {
  return prismaOf(app).session.findUniqueOrThrow({ where: { id: sessionId } });
}

export async function storedEvents(app: INestApplication, sessionId: string) {
  const rows = await prismaOf(app).sessionEvent.findMany({
    where: { sessionId },
    orderBy: { seq: 'asc' },
  });
  return rows.map((r) => ({
    seq: r.seq,
    type: r.type,
    actor: r.actor,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
  }));
}

/** Event rows are consecutive `1..n` and mirror the stored log (no gaps, no duplicates). */
export async function expectConsecutiveEvents(app: INestApplication, sessionId: string) {
  const events = await storedEvents(app, sessionId);
  expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
  const state = await storedState(app, sessionId);
  expect(state.log.map((e) => [e.seq, e.type, e.actor])).toEqual(
    events.map((e) => [e.seq, e.type, e.actor]),
  );
  return events;
}

/** `type actor` short lines of events (for readable equality assertions). */
export function lines(events: readonly { type: string; actor: string }[]): string[] {
  return events.map((e) => `${e.type} ${e.actor}`);
}

export const ERR = (key: string) => `errors.${key}`;
