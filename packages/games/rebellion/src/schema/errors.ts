import { z } from 'zod';
import type { ERROR_MESSAGE_KEYS as PLATFORM_KEYS } from '@bga/platform';

/**
 * Rebellion-specific rejections (`messageKey`s, wire `errors.<name>`; web shows `rebellion.errors:<name>`,
 * AM-FE-5); platform keys live in `@bga/platform`.
 */
export const REBELLION_ERROR_MESSAGE_KEYS = {
  /** The actor does not take part in this game (e.g. the AI side of an AI game), Q-11. */
  notYourSide: 'errors.notYourSide',
  /** The actor takes part but it is not their turn (hot-seat), Q-11. */
  notYourTurn: 'errors.notYourTurn',
  /** A turn was passed: only ACCEPT_HANDOFF by the new active side is accepted (AM-BE-6). */
  handoffPending: 'errors.handoffPending',
  /** END_TURN / ACCEPT_HANDOFF in an AI game, or ACCEPT_HANDOFF with no pending handoff (Q-10). */
  handoffNotAvailable: 'errors.handoffNotAvailable',
  /** 422 SETUP_UNSUPPORTED: ruleset not available yet (Q-8: reported first). */
  rulesetUnavailable: 'errors.rulesetUnavailable',
  /** 422 SETUP_UNSUPPORTED: game mode not available yet. */
  modeUnavailable: 'errors.modeUnavailable',
  unknownPiece: 'errors.unknownPiece',
  unknownSystem: 'errors.unknownSystem',
  notOwner: 'errors.notOwner',
  notInFromSystem: 'errors.notInFromSystem',
  sameSystem: 'errors.sameSystem',
  notAdjacent: 'errors.notAdjacent',
  // --- SWR-005 (plan-backend §3.6 + Clarifications; no `systemHasOwnLeader`, Q-BE-3) ---
  /** The game is over (`outcome` set): any command, checked right after the schema (AM-BE-3, Q-13). */
  gameOver: 'errors.gameOver',
  /** The command belongs to the other rules engine (core-v1: ADVANCE_PHASE/END_TURN; mock-v1: the core commands). */
  commandUnavailable: 'errors.commandUnavailable',
  /** Not the command phase (unreachable in a stored state; Q-6). */
  wrongPhase: 'errors.wrongPhase',
  /** ACTIVATE_SYSTEM: no such leader (Q-4). */
  unknownLeader: 'errors.unknownLeader',
  /** ACTIVATE_SYSTEM: the leader is the other side's or not in the pool (Q-4). */
  leaderNotInPool: 'errors.leaderNotInPool',
  /** ACTIVATE_SYSTEM: the leader has no tactic values and cannot activate (R-4, Q-BE-1(c)). */
  leaderCannotActivate: 'errors.leaderCannotActivate',
  /** ACTIVATE_SYSTEM / PASS during the own activation. */
  activationInProgress: 'errors.activationInProgress',
  /** MOVE_PIECES / FINISH_ACTIVATION without an activation. */
  noActivation: 'errors.noActivation',
  /** MOVE_PIECES: the destination is not the activated system (R-5). */
  notActivatedSystem: 'errors.notActivatedSystem',
  /** MOVE_PIECES: an own leader stands in the source system (R-5). */
  pinnedByLeader: 'errors.pinnedByLeader',
  /** MOVE_PIECES: a structure / unit that never moves (R-5). */
  immobileUnit: 'errors.immobileUnit',
  /** MOVE_PIECES: not enough transport capacity moving with the units that need it (R-5). */
  insufficientCapacity: 'errors.insufficientCapacity',
} as const;
export type RebellionErrorMessageKey =
  (typeof REBELLION_ERROR_MESSAGE_KEYS)[keyof typeof REBELLION_ERROR_MESSAGE_KEYS];

const rebellionKeys = Object.values(REBELLION_ERROR_MESSAGE_KEYS) as [
  RebellionErrorMessageKey,
  ...RebellionErrorMessageKey[],
];
export const RebellionErrorMessageKeySchema = z.enum(rebellionKeys);

/** Every `messageKey` Rebellion's rules may return: platform keys + game keys. */
export type ErrorMessageKey =
  (typeof PLATFORM_KEYS)[keyof typeof PLATFORM_KEYS] | RebellionErrorMessageKey;
