/**
 * Lazy upcaster of stored Rebellion data (Q-16/Q-17 of SWR-004, plan-backend §1.3 of SWR-005):
 * state v1 (SWR-002/003, no `schemaVersion`) → v2 (SWR-004) → v3 `mock-v1` (SWR-005); setup v1 → v2 (current).
 * Pure and deterministic, never mutates its input; idempotent (`upcast(upcast(x)) ≡ upcast(x)`); `version`
 * is never changed (optimistic concurrency unaffected). Unknown versions or invalid data throw (→ 500
 * INTERNAL at the API), never a silent substitution.
 * v1 → v2: faction `rebellion → rebels` (`empire` unchanged) in setup, piece owners, piece `typeKey`
 * prefixes (`unit|leader|token.rebellion.*`) and event actors; settings get `ruleset: 'base'`,
 * `gameMode: 'digital'`; `activeSide = playerFaction`, `handoffPending = false`; everything else byte-equal.
 * Validated by the FROZEN v2 schema (`./legacy-v2`).
 * v2 → v3: `schemaVersion: 3`, `rulesEngine: 'mock-v1'`; everything else unchanged.
 */
import {
  GameEventSchema,
  GameStateSchema,
  MockGameStateV3Schema,
  REBELLION_SETUP_SCHEMA_VERSION,
  REBELLION_STATE_SCHEMA_VERSION,
  StoredRebellionSetupSchema,
  opponentOf,
  settingsOfStoredSetup,
  type FactionId,
  type GameEvent,
  type GameState,
  type MockGameStateV3,
  type RebellionSettings,
  type StoredRebellionSetup,
} from '../schema';
import {
  FactionV1Schema,
  GameEventV1Schema,
  GameSetupV1Schema,
  GameStateV1Schema,
  type FactionV1,
  type GameEventV1,
  type GameSetupV1,
} from './legacy-v1';
import { GameStateV2Schema, type GameStateV2 } from './legacy-v2';

const FACTION_V1_TO_V2: Record<FactionV1, FactionId> = { rebellion: 'rebels', empire: 'empire' };

function faction(f: FactionV1): FactionId {
  return FACTION_V1_TO_V2[FactionV1Schema.parse(f)];
}

const TYPE_KEY_V1 = /^(unit|leader|token)\.rebellion\./;

function typeKey(key: string): string {
  return key.replace(TYPE_KEY_V1, '$1.rebels.');
}

function settingsFromV1(setup: GameSetupV1): RebellionSettings {
  const playerFaction = faction(setup.humanFaction);
  return {
    playerFaction,
    opponentFaction: opponentOf(playerFaction),
    opponentType: setup.opponent.kind,
    aiDifficulty: setup.opponent.kind === 'ai' ? setup.opponent.difficulty : null,
    ruleset: 'base',
    gameMode: 'digital',
  };
}

function hasOwn(raw: unknown, key: string): boolean {
  return typeof raw === 'object' && raw !== null && Object.hasOwn(raw, key);
}

function versionOf(raw: unknown): unknown {
  return hasOwn(raw, 'schemaVersion')
    ? (raw as { schemaVersion: unknown }).schemaVersion
    : undefined;
}

/** `Session.setup` of any stored version → current stored setup (v2). */
export function upcastStoredSetup(raw: unknown): StoredRebellionSetup {
  const version = versionOf(raw);
  if (version === REBELLION_SETUP_SCHEMA_VERSION) return StoredRebellionSetupSchema.parse(raw);
  if (version !== undefined)
    throw new Error(`unsupported Rebellion setup schemaVersion ${String(version)}`);
  const v1 = GameSetupV1Schema.parse(raw);
  return StoredRebellionSetupSchema.parse({
    schemaVersion: REBELLION_SETUP_SCHEMA_VERSION,
    ...settingsFromV1(v1),
  });
}

/** Settings view of `upcastStoredSetup`. */
export function upcastSettings(raw: unknown): RebellionSettings {
  return settingsOfStoredSetup(upcastStoredSetup(raw));
}

function eventFromV1(event: GameEventV1): GameEvent {
  return GameEventSchema.parse(
    event.actor === 'system' ? event : { ...event, actor: faction(event.actor) },
  );
}

/**
 * A stored event (state log or `SessionEvent` mirror row, already JSON-parsed) → current event.
 * v1 events are recognised by their actor; payloads of v1 events carry no faction.
 */
export function upcastEvent(raw: unknown): GameEvent {
  const current = GameEventSchema.safeParse(raw);
  if (current.success) return current.data;
  return eventFromV1(GameEventV1Schema.parse(raw));
}

/** v1 snapshot (already parsed by the frozen v1 schema) → v2, validated by the FROZEN v2 schema. */
function upcastV1toV2(raw: unknown): GameStateV2 {
  const v1 = GameStateV1Schema.parse(raw);
  const settings = settingsFromV1(v1.setup);
  return GameStateV2Schema.parse({
    schemaVersion: 2,
    id: v1.id,
    version: v1.version,
    round: v1.round,
    phase: v1.phase,
    settings,
    activeSide: settings.playerFaction,
    handoffPending: false,
    systems: v1.systems,
    pieces: v1.pieces.map((p) => ({ ...p, owner: faction(p.owner), typeKey: typeKey(p.typeKey) })),
    rebelBase: v1.rebelBase,
    log: v1.log.map(eventFromV1),
  });
}

/** v2 snapshot → v3 `mock-v1` (old sessions keep the mock rules, AC-11). */
function upcastV2toV3(v2: GameStateV2): MockGameStateV3 {
  const { schemaVersion: _v2, ...rest } = v2;
  return MockGameStateV3Schema.parse({
    schemaVersion: REBELLION_STATE_SCHEMA_VERSION,
    rulesEngine: 'mock-v1',
    ...rest,
  });
}

/** Snapshot of any stored version → current `GameState` (v3; v1/v2 become `mock-v1`). */
export function upcastState(raw: unknown): GameState {
  const version = versionOf(raw);
  if (version === REBELLION_STATE_SCHEMA_VERSION) return GameStateSchema.parse(raw);
  if (version === 2) return upcastV2toV3(GameStateV2Schema.parse(raw));
  if (version !== undefined)
    throw new Error(`unsupported Rebellion state schemaVersion ${String(version)}`);
  return upcastV2toV3(upcastV1toV2(raw));
}
