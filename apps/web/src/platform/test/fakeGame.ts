import type {
  AutomationRunSummary,
  GameDefinition,
  GameStatus,
  SessionSummary,
} from '@bga/platform';
import { lazy } from 'react';
import type { WebGameEntry } from '@/games/registry';
import type { SessionCommandOk, SessionEnvelope } from '../sessions/api';
import { FakeSetupScreen, FakeTableScreen } from './fakeScreens';

export { FakeSetupScreen, FakeTableScreen } from './fakeScreens';

export interface FakeGameOptions {
  id?: string;
  name?: string;
  status?: GameStatus;
  /** Lazy Setup/Table screens (default: `status === 'available'`). */
  withScreens?: boolean;
  describeSession?: WebGameEntry['describeSession'];
}

/** Definition that passes `GameDefinitionSchema`. Texts fall back to `description` (no i18n namespace). */
export function makeFakeDefinition(options: FakeGameOptions = {}): GameDefinition {
  const id = options.id ?? 'test-game';
  return {
    id,
    name: options.name ?? 'Test Game',
    descriptionKey: `${id}.meta:description`,
    description: 'Фиктивная игра для тестов',
    status: options.status ?? 'available',
    supportedPlayers: [2],
    supportsAI: false,
  };
}

/** Fake web registry entry — without `cover` (placeholder check, TC-EXT-07), screens via `lazy` (Suspense path). */
export function makeFakeGameEntry(options: FakeGameOptions = {}): WebGameEntry {
  const definition = makeFakeDefinition(options);
  const withScreens = options.withScreens ?? definition.status === 'available';
  return {
    definition,
    i18nPrefix: definition.id,
    ...(options.describeSession ? { describeSession: options.describeSession } : {}),
    ...(withScreens
      ? {
          SetupScreen: lazy(() => Promise.resolve({ default: FakeSetupScreen })),
          TableScreen: lazy(() => Promise.resolve({ default: FakeTableScreen })),
        }
      : {}),
  };
}

export function makeSessionEnvelope(overrides: Partial<SessionEnvelope> = {}): SessionEnvelope {
  return {
    sessionId: 's1',
    gameId: 'test-game',
    status: 'prototype',
    settings: { mode: 'test' },
    view: { turn: 1 },
    automation: { pending: false, strategy: null },
    ...overrides,
  };
}

/** `automation` of a command / run response; default = no automated participant (`steps: 0`, `stopReason: 'none'`). */
export function makeAutomationSummary(
  overrides: Partial<AutomationRunSummary> = {},
): AutomationRunSummary {
  return {
    steps: 0,
    pending: false,
    strategy: null,
    fallbacks: 0,
    fallbackReasons: [],
    stopReason: 'none',
    ...overrides,
  };
}

/** `SessionCommandOk` (`POST …/commands` / `POST …/automation/run` 200). */
export function makeCommandOk(overrides: Partial<SessionCommandOk> = {}): SessionCommandOk {
  return {
    ok: true,
    view: { turn: 2 },
    events: [],
    automation: makeAutomationSummary(),
    ...overrides,
  };
}

export function makeSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: 's1',
    gameId: 'test-game',
    status: 'prototype',
    version: 1,
    createdAt: '2026-11-08T10:00:00.000Z',
    updatedAt: '2026-11-08T10:00:00.000Z',
    details: {},
    ...overrides,
  };
}
