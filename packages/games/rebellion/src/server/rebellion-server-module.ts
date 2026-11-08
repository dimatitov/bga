import { defineServerGameModule } from '@bga/platform';
import { rebellionDefinition } from '../definition';
import {
  applyCommand,
  createCoreGame,
  parseRebellionSetup,
  toPlayerEvents,
  toPlayerView,
  toSideView,
} from '../rules';
import { coreDataBaseV1 } from '../scenario';
import {
  PlayerViewSchema,
  RebellionSessionDetailsSchema,
  settingsOfStoredSetup,
  toStoredSetup,
  type CoreGameState,
  type GameEvent,
  type GameState,
  type StoredRebellionSetup,
} from '../schema';
import { runAutoPlay } from './auto-play';
import { upcastState, upcastStoredSetup } from './upcast';

/**
 * A new `core-v1` game on the base-game data (R-10) with the AI's automatic moves already applied: with AI
 * Rebels their first pass happens at creation (version 2, AC-08). Initial events = the whole log (seq 1…n).
 */
export function createCoreInitialState(
  setup: StoredRebellionSetup,
  ctx: { sessionId: string; now: string },
): { state: CoreGameState; events: GameEvent[] } {
  const created = createCoreGame(settingsOfStoredSetup(setup), coreDataBaseV1, {
    gameId: ctx.sessionId,
    now: ctx.now,
  });
  const { state } = runAutoPlay(created, { now: ctx.now });
  return { state, events: [...state.log] };
}

/**
 * The state as its viewer sees it for events: in an AI game always the player's side (SWR-004 invariant;
 * after a game that ended on the AI's move `activeSide` may be the AI side), otherwise the active side.
 */
function asSeenByPlayer(state: GameState): GameState {
  return state.settings.opponentType === 'ai'
    ? { ...state, activeSide: state.settings.playerFaction }
    : state;
}

/**
 * Rebellion as seen by the game-independent session service (SWR-004 plan-backend §4.3).
 * The view is chosen by the rules, never by a request: the active side's board, or the handoff screen
 * while a hot-seat handoff is pending. Stored setup is `schemaVersion: 2`, the state `schemaVersion: 3`
 * (`rulesEngine` union, SWR-005); older snapshots are upcast lazily on read (Q-16; v1/v2 → `mock-v1`).
 * New sessions run on `core-v1` (base-game data); in an AI game the server's auto-play moves for the AI side
 * inside the same call (`./auto-play`, BD-5).
 * `GameState.id` holds the session id (field name kept from SWR-002).
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

  /** Every new Rebellion session starts as a prototype (AC-13). */
  initialStatus() {
    return 'prototype';
  },

  /** SWR-005 (AM-BE-1): `core-v1` with an outcome → 'completed'; otherwise (incl. `mock-v1`) 'prototype'. */
  statusOf(state) {
    return state.rulesEngine === 'core-v1' && state.outcome !== null ? 'completed' : 'prototype';
  },

  /** Exactly the six public settings (Q-24, TC-U-13) — no `schemaVersion`. */
  publicSettings(setup) {
    return { ...settingsOfStoredSetup(setup) };
  },

  /**
   * SWR-005: every new session is `core-v1` on the base-game data (`createCoreInitialState`). Deterministic:
   * same setup + `sessionId` + `now` → byte-identical state (Q-24). Version 1, or 2 when the AI Rebels'
   * automatic pass is applied at creation (AM-BE-2); initial events = the whole log.
   */
  createInitialState(setup, ctx) {
    return createCoreInitialState(setup, ctx);
  },

  /** `Session.setup` is rewritten from the state's settings on every write (review #1) — always v2. */
  setupOf(state) {
    return toStoredSetup(state.settings);
  },

  /** Any stored version (v1/v2 are upcast to v3 `mock-v1`; `version` is unchanged, so optimistic concurrency is unaffected). */
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

  /**
   * Order inside the rules: 400 (envelope schema) → engine pipeline (mock-v1: 409 → 422; core-v1: 422 gameOver
   * → 409 → 422). The player's command has `origin: 'player'`; after an accepted `core-v1` command the AI's
   * automatic moves follow in the same call (one commit, the version after the last move, Q-19); events =
   * player's + AI's. An auto-play fault throws (→ 500, nothing written, Q-27).
   */
  applyCommand(state, envelope, ctx) {
    const result = applyCommand(state, envelope, { now: ctx.now, origin: 'player' });
    if (!result.ok || result.state.rulesEngine !== 'core-v1') return result;
    const auto = runAutoPlay(result.state, { now: ctx.now });
    return { ok: true, state: auto.state, events: [...result.events, ...auto.events] };
  },

  /**
   * `kind: 'player'` or strict `kind: 'handoff'` while a hot-seat handoff is pending. AI game: always the
   * player's board (also when the game ended on the AI's move); hot-seat: the active side's board.
   */
  toPlayerView(state, ctx) {
    return PlayerViewSchema.parse(
      state.settings.opponentType === 'ai'
        ? toSideView(state, state.settings.playerFaction)
        : toPlayerView(state, ctx.status),
    );
  },

  /** Same viewer as `toPlayerView` (redacted for it); `[]` while a handoff is pending. */
  toPlayerEvents(events, state) {
    return toPlayerEvents(events, asSeenByPlayer(state));
  },

  /**
   * Public settings + progress (Q-20: `aiDifficulty` null for a human opponent); no hidden data, no systems.
   * SWR-005 (AM-BE-8, AM-FE-7): + `rulesEngine`, `winner` and `reputation` (both `null` for mock-v1).
   */
  summarize(state) {
    return RebellionSessionDetailsSchema.parse({
      ...state.settings,
      round: state.round,
      phase: state.phase,
      rulesEngine: state.rulesEngine,
      winner: state.rulesEngine === 'core-v1' ? (state.outcome?.winner ?? null) : null,
      reputation: state.rulesEngine === 'core-v1' ? state.reputation : null,
    });
  },
});
