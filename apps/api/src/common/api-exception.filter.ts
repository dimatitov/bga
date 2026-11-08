import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ERROR_MESSAGE_KEYS, type CommandErr } from '@swr/contracts';
import type { Request, Response } from 'express';
import { ApiError } from './api-error';

/** body-parser marks malformed JSON with `type: 'entity.parse.failed'` and status 400. */
function isBodyParseError(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    (exception as { type?: unknown }).type === 'entity.parse.failed'
  );
}

/** Converts anything thrown under `/api` into an ApiError (never leaks stack, Prisma messages or state). */
export function toApiError(exception: unknown): ApiError {
  if (exception instanceof ApiError) return exception;
  if (isBodyParseError(exception)) {
    return ApiError.validation([
      { path: [], code: 'invalid_json', message: 'Malformed JSON body' },
    ]);
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === HttpStatus.NOT_FOUND || status === HttpStatus.METHOD_NOT_ALLOWED) {
      return ApiError.notFound();
    }
    if (status >= 400 && status < 500) {
      const cause = exception.cause;
      if (isBodyParseError(cause)) return toApiError(cause);
      return new ApiError(
        'VALIDATION',
        ERROR_MESSAGE_KEYS.validation,
        { issues: [{ path: [], code: `http_${status}`, message: 'Invalid request' }] },
        status,
      );
    }
  }
  return ApiError.internal();
}

/**
 * Global filter (R-8): every non-2xx response under `/api` has the body
 * `{ ok: false, error: { code, messageKey, details? } }`.
 * Logs only gameId, code, status (+ error class name for 500) — never state/view/payload (TC-ARCH-11).
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const error = toApiError(exception);

    const gameId = typeof req.params?.id === 'string' ? req.params.id : '-';
    if (error.status >= 500) {
      const name = exception instanceof Error ? exception.constructor.name : typeof exception;
      this.logger.error(`gameId=${gameId} code=${error.code} status=${error.status} error=${name}`);
    }

    const body: CommandErr = { ok: false, error: error.toBody() };
    if (res.headersSent) return;
    res.status(error.status).json(body);
  }
}
