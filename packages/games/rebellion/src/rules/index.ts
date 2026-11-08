/**
 * Public API of game-core — the single source of truth for rules and state.
 * Pure TypeScript: imports only `../schema` and `@bga/platform`; no React/NestJS/Prisma/OpenAI, no Date/Math.random.
 * Two rules engines (SWR-005 BD-1), dispatched by `state.rulesEngine` in `applyCommand` / `getLegalActions` /
 * `toSideView` / `toPlayerView` / `toPlayerEvents`:
 * - `mock-v1` (old sessions): temporary game logic only in `./mock-rules`, pipeline `./mock-apply-command`,
 *   view `./mock-player-view`, hot-seat turn passing `./turn`;
 * - `core-v1` (the real slice, SWR-005 W3): `./core` — `createCoreGame`, `chooseRebelBase` and the engine.
 * Setup parsing (`./setup`) is real platform behaviour, not mock rules.
 */
export { createGame } from './create-game';
export { chooseRebelBase, createCoreGame } from './core';
export { applyCommand } from './apply-command';
export { getLegalActions } from './legal-actions';
export { toHandoffView, toPlayerEvents, toPlayerView, toSideView } from './player-view';
export { parseRebellionSetup } from './setup';

export type { ApplyContext, CreateContext } from './context';
export type { ApplyResult, CoreError, CoreErrorCode } from './result';
