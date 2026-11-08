/**
 * Public API of the platform for game folders (`src/games/<id>/**`), plan-frontend §0.2.
 * Must NOT re-export the registry context (`./registry/*`): games are imported by the registry, so that
 * would create an import cycle. Screen prop types are re-exported for convenience (type-only).
 */
export { paths, routePatterns } from './paths';
export {
  createSession,
  getSession,
  listSessions,
  postSessionCommand,
  type CallOptions,
  type CreateSessionInput,
  type CreateSessionOptions,
  type ListSessionsParams,
  type SessionCommandResult,
  type SessionEnvelope,
} from './sessions/api';
export {
  SESSION_DETAIL_STALE_TIME,
  sessionKeys,
  sessionQuery,
  sessionsListQuery,
} from './sessions/queries';
export { useCreateSession } from './sessions/useCreateSession';
export {
  RECENT_SESSIONS_LIMIT,
  useGameSessions,
  type GameSessionsResult,
} from './sessions/useGameSessions';
export { svgDataUrl } from './ui/svgDataUrl';
export type {
  GameCover,
  SessionDescription,
  SessionLinePart,
  SetupScreenProps,
  StartSession,
  TableScreenProps,
  WebGameEntry,
} from '@/games/registry';
