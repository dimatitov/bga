/**
 * SDK error → `AiFailure` (SWR-005B, plan-backend §6.1 + specification «Clarifications» Q-7/Q-9/Q-14).
 * Only the class, HTTP status, request id and a parsed Retry-After are kept — never `err.message`, the error body or
 * headers (they may echo request data).
 */
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  OpenAIError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from 'openai';
import { AiFailure, type AiFailureInit } from '../ai.errors';
import type { AIModelRole } from '../ai.types';
import { parseRetryAfterMs } from '../retry';

export interface ClassifyContext {
  nowMs?: number;
  role?: AIModelRole;
  model?: string;
}

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;

function sdkName(err: unknown): string {
  const name = (err as { constructor?: { name?: unknown } } | null)?.constructor?.name;
  return typeof name === 'string' && SAFE_NAME.test(name) ? name : 'UnknownError';
}

function errorCode(err: APIError): string | undefined {
  if (typeof err.code === 'string') return err.code;
  const body = err.error as { code?: unknown } | undefined;
  return typeof body?.code === 'string' ? body.code : undefined;
}

function meta(err: unknown): Partial<AiFailureInit> {
  const m: Partial<AiFailureInit> = { sdkErrorName: sdkName(err) };
  if (err instanceof APIError) {
    if (typeof err.status === 'number') m.httpStatus = err.status;
    if (typeof err.requestID === 'string' && SAFE_REQUEST_ID.test(err.requestID)) {
      m.requestId = err.requestID;
    }
  }
  return m;
}

/** Classifies any error thrown by an SDK call. An `AiFailure` passes through unchanged. */
export function classifySdkError(err: unknown, ctx: ClassifyContext = {}): AiFailure {
  if (err instanceof AiFailure) return err;
  const base = meta(err);
  const who = { role: ctx.role, model: ctx.model };

  // Order matters: the timeout class extends the connection class; abort is ours (treated as a timeout).
  if (err instanceof APIConnectionTimeoutError || err instanceof APIUserAbortError) {
    return AiFailure.timeout(base);
  }
  if (err instanceof APIConnectionError) {
    return AiFailure.providerError('network', base, true);
  }
  if (err instanceof RateLimitError) {
    if (errorCode(err) === 'insufficient_quota') {
      return AiFailure.providerError('quota', base, false);
    }
    const retryAfterMs = parseRetryAfterMs(
      (name) => err.headers?.get(name),
      ctx.nowMs ?? Date.now(),
    );
    return AiFailure.rateLimited(retryAfterMs === undefined ? base : { ...base, retryAfterMs });
  }
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
    return AiFailure.keyRejected(who.role, who.model).with(base);
  }
  if (err instanceof NotFoundError) {
    return AiFailure.modelUnavailable(who.role, who.model).with(base);
  }
  if (
    err instanceof BadRequestError ||
    err instanceof UnprocessableEntityError ||
    err instanceof ConflictError
  ) {
    return AiFailure.providerError('bad_request', base, false);
  }
  if (err instanceof InternalServerError) {
    return AiFailure.providerError('upstream', base, true);
  }
  if (err instanceof APIError) {
    if (err.status === 408) return AiFailure.timeout(base);
    return AiFailure.providerError('unknown', base, false);
  }
  if (err instanceof OpenAIError) {
    return AiFailure.providerError('unknown', base, false);
  }
  return AiFailure.providerError('unknown', base, false);
}

/** True for a 404 from the SDK (used to invalidate the model availability cache). */
export function isNotFound(err: unknown): boolean {
  return err instanceof NotFoundError;
}
