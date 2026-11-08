import { ERROR_MESSAGE_KEYS, type ApiError as ApiErrorBody, type ErrorCode } from '@swr/contracts';
import type { CoreError } from '@swr/game-core';
import type { ZodError } from 'zod';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  ILLEGAL_COMMAND: 422,
  INTERNAL: 500,
};

export interface ValidationIssue {
  path: (string | number)[];
  code: string;
  message: string;
}

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

  static notFound(): ApiError {
    return new ApiError('NOT_FOUND', ERROR_MESSAGE_KEYS.notFound);
  }

  static validation(issues: ValidationIssue[]): ApiError {
    return new ApiError('VALIDATION', ERROR_MESSAGE_KEYS.validation, { issues });
  }

  static fromZod(error: ZodError): ApiError {
    return ApiError.validation(
      error.issues.map((issue) => ({
        path: issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
        code: issue.code,
        message: issue.message,
      })),
    );
  }

  static versionConflict(currentVersion: number): ApiError {
    return new ApiError('VERSION_CONFLICT', ERROR_MESSAGE_KEYS.versionConflict, {
      currentVersion,
    });
  }

  static internal(): ApiError {
    return new ApiError('INTERNAL', ERROR_MESSAGE_KEYS.internal);
  }

  /** Maps a game-core rejection: VALIDATION → 400, VERSION_CONFLICT → 409, ILLEGAL_COMMAND → 422. */
  static fromCore(error: CoreError): ApiError {
    return new ApiError(error.code, error.messageKey, error.details);
  }
}
