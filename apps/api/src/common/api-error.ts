import {
  ERROR_HTTP_STATUS,
  ERROR_MESSAGE_KEYS,
  toValidationIssues,
  type ApiError as ApiErrorBody,
  type ErrorCode,
  type GameModuleError,
  type ValidationIssue,
} from '@bga/platform';
import type { ZodError } from 'zod';

/** HTTP status per code — the platform table (`SETUP_UNSUPPORTED` 422, `IDEMPOTENCY_KEY_REUSED` 409, …). */
const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = ERROR_HTTP_STATUS;

export type { ValidationIssue };

/**
 * Domain-level API error. The global ApiExceptionFilter turns it into
 * `{ ok: false, error: { code, messageKey, details? } }` with the matching HTTP status (R-8).
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    readonly messageKey: string,
    readonly details?: unknown,
    status?: number,
  ) {
    super(code);
    this.name = 'ApiError';
    this.status = status ?? STATUS_BY_CODE[code];
  }

  toBody(): ApiErrorBody {
    return this.details === undefined
      ? { code: this.code, messageKey: this.messageKey }
      : { code: this.code, messageKey: this.messageKey, details: this.details };
  }

  /** Unknown route or method. */
  static notFound(): ApiError {
    return new ApiError('NOT_FOUND', ERROR_MESSAGE_KEYS.notFound);
  }

  /** `gameId` is not in the catalogue. */
  static gameNotFound(): ApiError {
    return new ApiError('NOT_FOUND', ERROR_MESSAGE_KEYS.gameNotFound);
  }

  /** No such session (malformed ids included). */
  static sessionNotFound(): ApiError {
    return new ApiError('NOT_FOUND', ERROR_MESSAGE_KEYS.sessionNotFound);
  }

  /** The game is in the catalogue but has no server module (coming_soon / removed) → 422. */
  static gameUnavailable(): ApiError {
    return new ApiError('GAME_UNAVAILABLE', ERROR_MESSAGE_KEYS.gameUnavailable);
  }

  static validation(issues: ValidationIssue[]): ApiError {
    return new ApiError('VALIDATION', ERROR_MESSAGE_KEYS.validation, { issues });
  }

  static fromZod(error: ZodError, prefix: (string | number)[] = []): ApiError {
    return ApiError.validation(toValidationIssues(error, prefix));
  }

  static versionConflict(currentVersion: number): ApiError {
    return new ApiError('VERSION_CONFLICT', ERROR_MESSAGE_KEYS.versionConflict, {
      currentVersion,
    });
  }

  /** 422: the game understood the setup but cannot play it yet; key/details come from the game module. */
  static setupUnsupported(messageKey: string, details?: unknown): ApiError {
    return new ApiError('SETUP_UNSUPPORTED', messageKey, details);
  }

  /** 409: the `Idempotency-Key` was used with a different body. No details (nothing of the other session). */
  static idempotencyKeyReused(): ApiError {
    return new ApiError('IDEMPOTENCY_KEY_REUSED', ERROR_MESSAGE_KEYS.idempotencyKeyReused);
  }

  static internal(): ApiError {
    return new ApiError('INTERNAL', ERROR_MESSAGE_KEYS.internal);
  }

  /** Maps a game-module rejection: VALIDATION → 400, VERSION_CONFLICT → 409, ILLEGAL_COMMAND → 422. */
  static fromModule(error: GameModuleError): ApiError {
    return new ApiError(error.code, error.messageKey, error.details);
  }
}
