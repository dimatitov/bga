import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'ILLEGAL_COMMAND',
  'VERSION_CONFLICT',
  'NOT_FOUND',
  'VALIDATION',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Catalogue of server `messageKey`s; the web app translates every one of them (ru/en). */
export const ERROR_MESSAGE_KEYS = {
  validation: 'errors.validation',
  notFound: 'errors.notFound',
  versionConflict: 'errors.versionConflict',
  notYourSide: 'errors.notYourSide',
  unknownPiece: 'errors.unknownPiece',
  unknownSystem: 'errors.unknownSystem',
  notOwner: 'errors.notOwner',
  notInFromSystem: 'errors.notInFromSystem',
  sameSystem: 'errors.sameSystem',
  notAdjacent: 'errors.notAdjacent',
  internal: 'errors.internal',
} as const;
export type ErrorMessageKey = (typeof ERROR_MESSAGE_KEYS)[keyof typeof ERROR_MESSAGE_KEYS];

const messageKeys = Object.values(ERROR_MESSAGE_KEYS) as [ErrorMessageKey, ...ErrorMessageKey[]];
export const ErrorMessageKeySchema = z.enum(messageKeys);

export const ApiErrorSchema = z.strictObject({
  code: ErrorCodeSchema,
  messageKey: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
