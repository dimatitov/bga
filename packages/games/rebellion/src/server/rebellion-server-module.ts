import { defineServerGameModule, type ServerGameModule } from '@bga/platform';
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
import { createRebellionAutomation, type RebellionAutomationOptions } from './automation';
import { upcastState, upcastStoredSetup } from './upcast';

/**
 * A new `core-v1` game on the base-game data (R-10), version 1. SWR-006: no automatic moves here — with AI
 * Rebels the stored state has the AI side to move and the server's automation runner plays it right after
 * the insert. Initial events = the whole log (seq 1…n).
 */
export function createCoreInitialState(
  setup: StoredRebellionSetup,
  ctx: { sessionId: string; now: string },
): { state: CoreGameState; events: GameEvent[] } {
  const created = createCoreGame(settingsOfStoredSetup(setup), coreDataBaseV1, {
    gameId: ctx.sessionId,
    now: ctx.now,
  });
  return { state: created, events: [...created.log] };
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
 * New sessions run on `core-v1` (base-game data). SWR-006: the module never moves for the AI side itself — the
 * AI side of a `core-v1` AI game is played step by step by the server runner through `automation`
 * (`./automation`; one commit per step).
 * `GameState.id` holds the session id (field name kept from SWR-002).
 *
 * AM-BE-6: `options.automation.policy` — `'bot'` (default, production) or an `AutoPolicy` (tests only).
 */
export function createRebellionServerModule(
  options: { automation?: RebellionAutomationOptions } = {},
): ServerGameModule {
  return defineServerGameModule<GameState, StoredRebellionSetup, GameEvent>({
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
     * same setup + `sessionId` + `now` → byte-identical state (Q-24). Always version 1 (SWR-006: with AI Rebels
     * the AI side is to move; the runner plays it); initial events = the whole log.
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
     * → 409 → 422). Only the human's command (`origin: 'player'`, so a command for the AI side → 422
     * `notYourSide`); SWR-006: the AI's moves are the runner's (`automation`), never part of this call.
     */
    applyCommand(state, envelope, ctx) {
      return applyCommand(state, envelope, { now: ctx.now, origin: 'player' });
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

    /** SWR-006: the AI side of `core-v1` AI games (`strategy: null` for hot-seat and `mock-v1`). */
    automation: createRebellionAutomation(options.automation),
  });
}

/** The registered module (production: the bot). */
export const rebellionServerModule = createRebellionServerModule();
