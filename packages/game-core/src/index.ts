/**
 * Public API of game-core — the single source of truth for rules and state.
 * Pure TypeScript: imports only `@swr/contracts`; no React/NestJS/Prisma/OpenAI, no Date/Math.random.
 * Temporary (mock) game logic lives only in `./mock-rules` (plan-backend.md §5).
 */
export { createGame } from './create-game';
export { applyCommand } from './apply-command';
export { getLegalActions } from './legal-actions';
export { toPlayerView, toPlayerEvents } from './player-view';

export type { ApplyContext, CreateContext } from './context';
export type { ApplyResult, CoreError, CoreErrorCode } from './result';
