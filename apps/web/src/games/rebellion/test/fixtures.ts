/**
 * Rebellion test fixtures for session-level tests (SWR-003 plan-frontend §1 `test/fixtures.ts`). Test-only.
 * The board fixture view (`../board/test/fixtures`) uses mock-scenario ids, so translations and the map layout exist.
 */
import { REBELLION_GAME_ID } from '@bga/game-rebellion/definition';
import type { PlayerView, RebellionSessionDetails } from '@bga/game-rebellion/schema';
import type { AutomationRunSummary, SessionSummary } from '@bga/platform';
import type { SessionEnvelope } from '@/platform';
import { GAME_ID, makeView } from '../board/test/fixtures';

export {
  GAME_ID,
  makeHandoffView,
  makeMovedView,
  makeView,
  P_E1,
  P_E2,
  P_E3,
  P_R1,
  P_RH,
  S_A,
  S_B,
  S_C,
  S_D,
} from '../board/test/fixtures';

/** Session id of the fixture view (`PlayerView.id === sessionId`, PA-7). */
export const SESSION_ID = GAME_ID;

/** Public settings of the fixture session (`publicSettings`, SWR-004): Empire vs AI (normal), Base / Digital. */
export const FIXTURE_SETTINGS = {
  playerFaction: 'empire',
  opponentFaction: 'rebels',
  opponentType: 'ai',
  aiDifficulty: 'normal',
  ruleset: 'base',
  gameMode: 'digital',
} as const;

/**
 * `automation` of a command response without automated steps (SWR-006: required in `SessionCommandOk`;
 * hot-seat / mock-v1 / a human's turn).
 */
export const NO_AUTOMATION_RUN = {
  steps: 0,
  pending: false,
  strategy: null,
  fallbacks: 0,
  fallbackReasons: [],
  stopReason: 'none',
} as const satisfies AutomationRunSummary;

/**
 * `{ sessionId, gameId, status, settings, view }` as returned by `POST /api/sessions` and `GET /api/sessions/:id`.
 * `status: 'prototype'` — Rebellion on the mock scenario (spec Platform).
 */
export function makeRebellionSession(
  view: PlayerView = makeView(),
  overrides: Partial<Omit<SessionEnvelope, 'view'>> = {},
): SessionEnvelope {
  return {
    sessionId: view.id,
    gameId: REBELLION_GAME_ID,
    status: 'prototype',
    settings: { ...FIXTURE_SETTINGS },
    view,
    // SWR-006 (required): mock-v1 sessions have no automated participant.
    automation: { pending: false, strategy: null },
    ...overrides,
  };
}

export function makeRebellionSummary(
  details: Partial<RebellionSessionDetails> | Record<string, string | number | boolean | null> = {},
  overrides: Partial<SessionSummary> = {},
): SessionSummary {
  return {
    sessionId: SESSION_ID,
    gameId: REBELLION_GAME_ID,
    status: 'prototype',
    version: 3,
    createdAt: '2026-11-08T10:00:00.000Z',
    updatedAt: '2026-11-08T10:05:00.000Z',
    details: {
      ...FIXTURE_SETTINGS,
      round: 2,
      phase: 'command',
      rulesEngine: 'mock-v1',
      winner: null,
      reputation: null,
      ...details,
    } as SessionSummary['details'],
    ...overrides,
  };
}
