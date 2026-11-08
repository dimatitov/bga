/**
 * Test helpers of the `core-v1` rules (SWR-005 W3): settings, a state constructor (TR-2: states are built
 * directly, not only by scripts from the start), command shorthands, and "rejected + unchanged" checks.
 */
import { expect } from 'vitest';
import {
  CoreGameStateV3Schema,
  settingsFromSetupInput,
  type Command,
  type CommandOrigin,
  type CoreGameState,
  type CoreUnit,
  type ErrorMessageKey,
  type Faction,
  type GameEvent,
  type RebellionSettings,
} from '../../../src/schema';
import { applyCommand, chooseRebelBase, createCoreGame, getLegalActions } from '../../../src/rules';
import type { CoreError } from '../../../src/rules';
import { ELIGIBLE_BASES, miniData, type TypeKey } from './fixtures/mini-data';
import { clone, deepFreeze } from '../helpers';

export { clone, deepFreeze, mulberry32 } from '../helpers';

export const NOW = '2026-11-08T10:00:00.000Z';
export const LATER = '2026-11-08T10:05:00.000Z';

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
/** Player Empire, AI Rebels (the Rebels act first: a transient state until the server's auto-play). */
export const EMPIRE_VS_AI: RebellionSettings = settingsFromSetupInput({
  playerFaction: 'empire',
  opponentType: 'ai',
  aiDifficulty: 'hard',
  ...BASE,
});

export function newCore(
  settings: RebellionSettings = HOT_SEAT,
  gameId = 'core-game-1',
): CoreGameState {
  return createCoreGame(settings, miniData(), { gameId, now: NOW });
}

/** A deterministic game id whose base (by `chooseRebelBase`) is `base`. */
export function gameIdWithBase(base: string): string {
  for (let i = 0; i < 10_000; i += 1) {
    const id = `game-${i}`;
    if (chooseRebelBase(id, ELIGIBLE_BASES) === base) return id;
  }
  throw new Error(`fixture: no game id for base ${base}`);
}

export interface Scenario {
  base?: string;
  revealed?: boolean;
  /** `[typeKey, systemId]` — ids `u-01…` in this order. */
  units?: [TypeKey, string][];
  /** Leaders on the map (others stay in their pools). */
  leadersAt?: Record<string, string>;
  activeSide?: Faction;
  passed?: { rebels?: boolean; empire?: boolean };
  /** Running activation of `activeSide` (the leader is placed in the system). */
  activation?: { leaderId: string; systemId: string };
  round?: number;
  reputation?: number;
  handoffPending?: boolean;
  settings?: RebellionSettings;
  /** Default true: the result must be a valid STORED state. */
  parse?: boolean;
}

/** Build a `core-v1` state directly (from a fresh mini-data game, then overridden). */
export function scenario(s: Scenario = {}): CoreGameState {
  const settings = s.settings ?? HOT_SEAT;
  const base = s.base ?? 'zeta';
  const fresh = newCore(settings, gameIdWithBase(base));
  const units: CoreUnit[] = s.units
    ? s.units.map(([typeKey, systemId], i) => ({
        id: `u-${String(i + 1).padStart(2, '0')}`,
        owner: typeKey.startsWith('unit.empire.') ? 'empire' : 'rebels',
        typeKey,
        systemId,
      }))
    : fresh.units;
  const leadersAt: Record<string, string> = { ...s.leadersAt };
  if (s.activation) leadersAt[s.activation.leaderId] = s.activation.systemId;
  const activeSide = s.activeSide ?? 'rebels';
  const state: CoreGameState = {
    ...fresh,
    settings,
    activeSide,
    handoffPending: s.handoffPending ?? false,
    round: s.round ?? fresh.round,
    reputation: s.reputation ?? fresh.reputation,
    passed: { rebels: false, empire: false, ...s.passed },
    activation: s.activation ? { side: activeSide, ...s.activation } : null,
    units,
    leaders: fresh.leaders.map((l) => ({ ...l, systemId: leadersAt[l.id] ?? null })),
    rebelBase: { systemId: base, revealed: s.revealed ?? false },
  };
  return s.parse === false ? state : CoreGameStateV3Schema.parse(state);
}

// --- commands -----------------------------------------------------------------------------------------

export const activate = (leaderId: string, systemId: string): Command => ({
  type: 'ACTIVATE_SYSTEM',
  leaderId,
  systemId,
});
export const mv = (pieceIds: string[], fromSystemId: string, toSystemId: string): Command => ({
  type: 'MOVE_PIECES',
  pieceIds,
  fromSystemId,
  toSystemId,
});
export const FINISH: Command = { type: 'FINISH_ACTIVATION' };
export const PASS: Command = { type: 'PASS' };
export const ACCEPT: Command = { type: 'ACCEPT_HANDOFF' };
export const ADVANCE: Command = { type: 'ADVANCE_PHASE' };
export const END_TURN: Command = { type: 'END_TURN' };

export interface ApplyOptions {
  origin?: CommandOrigin;
  expectedVersion?: number;
}

export function tryApply(
  state: CoreGameState,
  actor: Faction,
  command: Command | Record<string, unknown>,
  opts: ApplyOptions = {},
) {
  return applyCommand(
    state,
    { actor, expectedVersion: opts.expectedVersion ?? state.version, command },
    { now: LATER, ...(opts.origin ? { origin: opts.origin } : {}) },
  );
}

/** Apply and expect success (the input is deep-frozen: any mutation throws). */
export function ok(
  state: CoreGameState,
  actor: Faction,
  command: Command,
  opts: ApplyOptions = {},
): { state: CoreGameState; events: GameEvent[] } {
  const result = tryApply(deepFreeze(state), actor, command, opts);
  if (!result.ok) {
    throw new Error(`expected ${command.type} by ${actor} to succeed: ${result.error.messageKey}`);
  }
  return { state: result.state, events: result.events };
}

/** Apply a sequence of `[actor, command]`, each must succeed. */
export function play(state: CoreGameState, steps: [Faction, Command][]): CoreGameState {
  return steps.reduce((s, [actor, command]) => ok(s, actor, command).state, state);
}

/** Expect a rejection with `messageKey` and that state/version/log are unchanged (TC-U-30/TC-U-55). */
export function rejected(
  state: CoreGameState,
  actor: Faction,
  command: Command | Record<string, unknown>,
  messageKey: ErrorMessageKey,
  opts: ApplyOptions = {},
): CoreError {
  const frozen = deepFreeze(state);
  const snapshot = clone(frozen);
  const result = tryApply(frozen, actor, command, opts);
  if (result.ok) throw new Error(`expected a rejection (${messageKey}), got success`);
  expect(result.error.messageKey).toBe(messageKey);
  expect(frozen).toEqual(snapshot);
  return result.error;
}

export function errorKey(
  state: CoreGameState,
  actor: Faction,
  command: Command | Record<string, unknown>,
  opts: ApplyOptions = {},
): string | null {
  const result = tryApply(state, actor, command, opts);
  return result.ok ? null : result.error.messageKey;
}

export function idsAt(state: CoreGameState, systemId: string, typeKey?: string): string[] {
  return state.units
    .filter((u) => u.systemId === systemId && (typeKey === undefined || u.typeKey === typeKey))
    .map((u) => u.id);
}

export function eventTypes(events: readonly GameEvent[]): string[] {
  return events.map((e) => e.type);
}

/** All JSON paths whose string value (or object key) EQUALS one of `needles` (TR-3 style scanner). */
export function pathsOf(value: unknown, needles: readonly string[], path = '$'): string[] {
  if (typeof value === 'string') return needles.includes(value) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => pathsOf(v, needles, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [
      ...(needles.includes(k) ? [`${path}.${k}(key)`] : []),
      ...pathsOf(v, needles, `${path}.${k}`),
    ]);
  }
  return [];
}

// --- seeded random play (tests only) ------------------------------------------------------------------

/** Who issues commands for `side`: the server's auto move for the AI side, the player otherwise. */
export function originFor(state: CoreGameState, side: Faction): CommandOrigin {
  return state.settings.opponentType === 'ai' && side === state.settings.opponentFaction
    ? 'auto'
    : 'player';
}

function pick<V>(rng: () => number, values: readonly V[]): V {
  const value = values[Math.floor(rng() * values.length)];
  if (value === undefined) throw new Error('pick from an empty list');
  return value;
}

/**
 * A random LEGAL command for the active side, chosen only from `getLegalActions` (+ ACCEPT_HANDOFF while a
 * handoff is pending). MOVE_PIECES takes a random subset that fits the transport capacity.
 * `passBias` makes passing more or less likely (to reach refreshes and long phases).
 */
export function randomLegalCommand(
  state: CoreGameState,
  rng: () => number,
  passBias = 0.15,
): { actor: Faction; command: Command } {
  const actor = state.activeSide;
  if (state.handoffPending) return { actor, command: ACCEPT };
  const actions = getLegalActions(state, actor);
  if (actions.length === 0) throw new Error('no legal action for the active side');
  const pass = actions.find((a) => a.type === 'PASS');
  if (pass && rng() < passBias) return { actor, command: PASS };
  const finish = actions.find((a) => a.type === 'FINISH_ACTIVATION');
  if (finish && rng() < 0.3) return { actor, command: FINISH };
  const action = pick(rng, actions);
  switch (action.type) {
    case 'ACTIVATE_SYSTEM':
      return { actor, command: activate(pick(rng, action.leaderIds), pick(rng, action.systemIds)) };
    case 'MOVE_PIECES': {
      const chosen = action.pieces.filter(() => rng() < 0.6);
      let capacity = chosen
        .filter((p) => !p.requiresTransport)
        .reduce((sum, p) => sum + p.transportCapacity, 0);
      const fitting = chosen.filter((p) => {
        if (!p.requiresTransport) return true;
        if (capacity === 0) return false;
        capacity -= 1;
        return true;
      });
      const ids = fitting.length > 0 ? fitting.map((p) => p.pieceId) : [];
      const first = action.pieces.find((p) => !p.requiresTransport);
      if (ids.length === 0 && first) ids.push(first.pieceId);
      if (ids.length === 0) return { actor, command: FINISH };
      return { actor, command: mv(ids, action.fromSystemId, action.toSystemId) };
    }
    case 'FINISH_ACTIVATION':
      return { actor, command: FINISH };
    case 'PASS':
      return { actor, command: PASS };
    default: {
      const unreachable: never = action;
      return unreachable;
    }
  }
}

/** Apply a random legal command (must be accepted). */
export function randomStep(
  state: CoreGameState,
  rng: () => number,
  passBias?: number,
): { state: CoreGameState; events: GameEvent[]; actor: Faction; command: Command } {
  const { actor, command } = randomLegalCommand(state, rng, passBias);
  const result = tryApply(state, actor, command, { origin: originFor(state, actor) });
  if (!result.ok) {
    throw new Error(
      `legal command rejected: ${JSON.stringify(command)} → ${result.error.messageKey}`,
    );
  }
  return { state: result.state, events: result.events, actor, command };
}
