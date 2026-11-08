import { defineServerGameModule } from '@bga/platform';
import { rebellionDefinition } from '../definition';
import {
  applyCommand,
  createGame,
  parseRebellionSetup,
  toPlayerEvents,
  toPlayerView,
} from '../rules';
import { mockScenario } from '../scenario';
import {
  PlayerViewSchema,
  RebellionSessionDetailsSchema,
  settingsOfStoredSetup,
  toStoredSetup,
  type GameEvent,
  type GameState,
  type StoredRebellionSetup,
} from '../schema';
import { upcastState, upcastStoredSetup } from './upcast';

/**
 * Rebellion as seen by the game-independent session service (SWR-004 plan-backend §4.3).
 * The view is chosen by the rules, never by a request: the active side's board, or the handoff screen
 * while a hot-seat handoff is pending. Stored data is `schemaVersion: 2`; older snapshots are upcast
 * lazily on read (Q-16). `GameState.id` holds the session id (field name kept from SWR-002).
 */
export const rebellionServerModule = defineServerGameModule<
  GameState,
  StoredRebellionSetup,
  GameEvent
>({
  definition: rebellionDefinition,

  /**
   * `RebellionSetupInput` → stored v2 setup (`opponentFaction` derived, AI difficulty default 'normal').
   * `invalid` (400) before `unsupported` (422 SETUP_UNSUPPORTED, `details.unsupported`); issue paths are
   * relative to `setup` (the session service prefixes `['setup']`).
   */
  parseSetup(input) {
    const parsed = parseRebellionSetup(input);
    return parsed.ok ? { ok: true, value: toStoredSetup(parsed.value) } : parsed;
  },

  /** `Session.setup` of any stored version (v1 is upcast); corrupt → throw (500). */
  parseStoredSetup(raw) {
    return upcastStoredSetup(raw);
  },

  /** Every Rebellion session runs on the mock scenario for now (AC-13). */
  initialStatus() {
    return 'prototype';
  },

  /** Exactly the six public settings (Q-24, TC-U-13) — no `schemaVersion`. */
  publicSettings(setup) {
    return { ...settingsOfStoredSetup(setup) };
  },

  /** Deterministic: same setup + ctx → same state. Initial events = `[GAME_CREATED seq 1]`. */
  createInitialState(setup, ctx) {
    const state = createGame(settingsOfStoredSetup(setup), mockScenario, {
      gameId: ctx.sessionId,
      now: ctx.now,
    });
    return { state, events: [...state.log] };
  },

  /** `Session.setup` is rewritten from the state's settings on every write (review #1) — always v2. */
  setupOf(state) {
    return toStoredSetup(state.settings);
  },

  /** Any stored version (v1 is upcast; `version` is unchanged, so optimistic concurrency is unaffected). */
  parseState(raw, expected) {
    const state = upcastState(raw);
    if (state.id !== expected.sessionId || state.version !== expected.version) {
      throw new Error('stored snapshot does not match its row');
    }
    return state;
  },

  version(state) {
    return state.version;
  },

  /** Order inside the rules: 400 (envelope schema) → 409 (expectedVersion) → 422 (rules, hot-seat). */
  applyCommand(state, envelope, ctx) {
    return applyCommand(state, envelope, ctx);
  },

  /** `kind: 'player'` (active side) or strict `kind: 'handoff'` while a handoff is pending. */
  toPlayerView(state, ctx) {
    return PlayerViewSchema.parse(toPlayerView(state, ctx.status));
  },

  /** Same viewer as `toPlayerView`; `[]` while a handoff is pending. */
  toPlayerEvents(events, state) {
    return toPlayerEvents(events, state);
  },

  /** Public settings + progress (Q-20: `aiDifficulty` null for a human opponent); no hidden data. */
  summarize(state) {
    return RebellionSessionDetailsSchema.parse({
      ...state.settings,
      round: state.round,
      phase: state.phase,
    });
  },
});
