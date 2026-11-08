/**
 * Scripted `core-v1` games on the REAL base-game data through the server module (SWR-005 W5): the golden
 * games (TC-G-01..04), the reference views for FE/QA and the seedable e2e states (Q-35) are all produced
 * from these scripts, so every exported JSON is a state the server really reaches.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import {
  CoreGameStateV3Schema,
  PlayerViewSchema,
  settingsFromSetupInput,
  toStoredSetup,
  type Command,
  type CoreGameState,
  type Faction,
  type GameEvent,
  type PlayerView,
  type RebellionSettings,
} from '../../src/schema';
import { rebellionServerModule } from '../../src/server';
import { createCoreInitialState } from '../../src/server/rebellion-server-module';

export const NOW = '2026-11-08T10:00:00.000Z';

const BASE = { ruleset: 'base', gameMode: 'digital' } as const;
export const HOT_SEAT: RebellionSettings = settingsFromSetupInput({
  playerFaction: 'rebels',
  opponentType: 'human',
  ...BASE,
});
/** Player Rebels, AI Empire. */
export const REBELS_VS_AI: RebellionSettings = settingsFromSetupInput({
  playerFaction: 'rebels',
  opponentType: 'ai',
  aiDifficulty: 'normal',
  ...BASE,
});
/** Player Empire, AI Rebels. */
export const EMPIRE_VS_AI: RebellionSettings = settingsFromSetupInput({
  playerFaction: 'empire',
  opponentType: 'ai',
  aiDifficulty: 'hard',
  ...BASE,
});

/** One scripted command; `expectedVersion` is always the current version. */
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

export type CommandResult =
  | { ok: true; state: CoreGameState; events: GameEvent[] }
  | { ok: false; error: { code: string; messageKey: string; details?: unknown } };

/** `module.applyCommand` with the current version (or an explicit one). */
export function send(state: CoreGameState, step: Step, expectedVersion = state.version) {
  return rebellionServerModule.applyCommand(
    state,
    { actor: step.actor, expectedVersion, command: step.command },
    { now: NOW },
  ) as CommandResult;
}

export interface Played {
  state: CoreGameState;
  /** Every event of the game (initial + all commands), in order. */
  events: GameEvent[];
}

/** New `core-v1` session (AI moves at creation applied) — what the server stores on `POST /sessions`. */
export function start(settings: RebellionSettings, sessionId: string): Played {
  const created = createCoreInitialState(toStoredSetup(settings), { sessionId, now: NOW });
  return { state: created.state, events: created.events };
}

/** Apply steps in order; a rejected step fails the test with its message key and index. */
export function play(from: Played, steps: readonly Step[]): Played {
  let { state } = from;
  const events = [...from.events];
  steps.forEach((step, i) => {
    const result = send(state, step);
    if (!result.ok) {
      throw new Error(
        `step ${i} (${step.actor} ${step.command.type}) rejected: ${result.error.messageKey}`,
      );
    }
    // Every stored state must pass the full schema (incl. the AI / core invariants).
    state = CoreGameStateV3Schema.parse(JSON.parse(JSON.stringify(result.state)));
    events.push(...result.events);
  });
  return { state, events };
}

/** The session view the server would send (`module.toPlayerView`, status from `statusOf`). */
export function sessionView(state: CoreGameState): PlayerView {
  const status = rebellionServerModule.statusOf(state);
  return PlayerViewSchema.parse(rebellionServerModule.toPlayerView(state, { status }));
}

export function eventLine(event: GameEvent): string {
  return `${event.seq} ${event.type} ${event.actor}`;
}

// ---------------------------------------------------------------------------------------------------------
// Golden files: compared by default, rewritten only with UPDATE_GOLDEN=1 (TC-G-07)
// ---------------------------------------------------------------------------------------------------------

const FIXTURES = new URL('../fixtures/core/', import.meta.url);
export const UPDATE_GOLDEN = process.env['UPDATE_GOLDEN'] === '1';

export function fixturePath(name: string): string {
  return fileURLToPath(new URL(name, FIXTURES));
}

/**
 * `UPDATE_GOLDEN=1` → write; otherwise the file must exist and deep-equal `actual` (JSON round trip, so the
 * formatting does not matter). After an update run `pnpm format` (root `pnpm lint` runs `prettier --check`).
 */
export function expectGolden(name: string, actual: unknown): void {
  const path = fixturePath(name);
  const json = `${JSON.stringify(actual, null, 2)}\n`;
  if (UPDATE_GOLDEN) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, json);
    return;
  }
  let stored: string;
  try {
    stored = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`golden file ${name} is missing — run with UPDATE_GOLDEN=1 to create it`);
  }
  expect(JSON.parse(json), name).toEqual(JSON.parse(stored));
}

export function readFixture<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(fixturePath(name), 'utf8')) as T;
}
