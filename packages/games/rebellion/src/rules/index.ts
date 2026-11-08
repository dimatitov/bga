/**
 * Public API of game-core — the single source of truth for rules and state.
 * Pure TypeScript: imports only `../schema` and `@bga/platform`; no React/NestJS/Prisma/OpenAI, no Date/Math.random.
 * Temporary (mock) game logic lives only in `./mock-rules` (plan-backend.md §5); hot-seat turn passing
 * (`./turn`) and setup parsing (`./setup`) are real platform behaviour, not mock rules.
 */
export { createGame } from './create-game';
export { applyCommand } from './apply-command';
export { getLegalActions } from './legal-actions';
export { toHandoffView, toPlayerEvents, toPlayerView, toSideView } from './player-view';
export { parseRebellionSetup } from './setup';

export type { ApplyContext, CreateContext } from './context';
export type { ApplyResult, CoreError, CoreErrorCode } from './result';
