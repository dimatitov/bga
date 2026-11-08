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
