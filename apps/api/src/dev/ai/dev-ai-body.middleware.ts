/**
 * Request gate of `/api/dev/ai/*` (SWR-005B, plan-backend §10.2, AM-BE-11; Clarification Q-23). Registered by
 * `createApp` with `app.use()` BEFORE Nest's global body parsers (non-production only), so for this path:
 *   1. the loopback guard runs first (403 before any body is read — an invalid body from a remote peer is a 403);
 *   2. `Content-Length` > 8192 → 413 without reading; a chunked body is cut off at 8192 bytes → 413;
 *   3. the body is read here: `application/json` (or `+json`) is parsed (malformed → 400 `invalid_json`); any other
 *      content type leaves `req.body` undefined (→ 400 from the strict Zod schema). The stream is consumed, so the
 *      global parsers skip the request.
 * Errors go through `next(err)` to the global `ApiExceptionFilter` (unified `{ ok: false, error }` body).
 */
import { AI_DEV_LIMITS, ERROR_MESSAGE_KEYS } from '@bga/platform';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../common/api-error';
import { devForbidden, isAllowedDevRequest } from './loopback.guard';

export const DEV_AI_PATH = '/api/dev/ai';

export function payloadTooLarge(limitBytes: number): ApiError {
  return new ApiError(
    'VALIDATION',
    ERROR_MESSAGE_KEYS.validation,
    {
      issues: [
        {
          path: [],
          code: 'payload_too_large',
          message: `Request body exceeds ${limitBytes} bytes`,
        },
      ],
    },
    413,
  );
}

function malformedJson(): ApiError {
  return ApiError.validation([{ path: [], code: 'invalid_json', message: 'Malformed JSON body' }]);
}

function isJsonType(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return type === 'application/json' || /^application\/[a-z0-9.+-]+\+json$/.test(type);
}

function hasBody(req: Request): boolean {
  return (
    req.headers['transfer-encoding'] !== undefined || req.headers['content-length'] !== undefined
  );
}

export function devAiBodyGate(limitBytes: number = AI_DEV_LIMITS.bodyMaxBytes) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!isAllowedDevRequest(req)) {
      next(devForbidden());
      return;
    }
    const declared = req.headers['content-length'];
    if (declared !== undefined) {
      const n = Number(declared);
      if (!Number.isFinite(n) || n > limitBytes) {
        req.resume();
        next(payloadTooLarge(limitBytes));
        return;
      }
    }
    if (!hasBody(req)) {
      next();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (err?: unknown) => {
      if (done) return;
      done = true;
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      if (err !== undefined) {
        req.resume(); // drain the rest, the response is the error
        next(err);
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!isJsonType(req.headers['content-type']) || raw.length === 0) {
        req.body = undefined;
        next();
        return;
      }
      try {
        req.body = JSON.parse(raw) as unknown;
      } catch {
        next(malformedJson());
        return;
      }
      next();
    };
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        finish(payloadTooLarge(limitBytes));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => finish();
    const onError = () => finish(malformedJson());
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  };
}
