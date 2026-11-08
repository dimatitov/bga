/**
 * Client-side API error (plan-frontend §3.1, frozen signature).
 * `status === null` means the server could not be reached (network failure).
 */
export class ApiError extends Error {
  status: number | null;
  code?: 'ILLEGAL_COMMAND' | 'VERSION_CONFLICT' | 'NOT_FOUND' | 'VALIDATION' | string;
  messageKey?: string;
  details?: unknown;

  constructor(init: {
    status: number | null;
    code?: string;
    messageKey?: string;
    details?: unknown;
    message?: string;
  }) {
    super(
      init.message ?? `API error ${init.status ?? 'network'}${init.code ? ` ${init.code}` : ''}`,
    );
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.messageKey = init.messageKey;
    this.details = init.details;
  }
}

/** Codes produced by the client itself (not by the server). */
export const CLIENT_ERROR_CODES = {
  network: 'NETWORK',
  invalidResponse: 'INVALID_RESPONSE',
  http: 'HTTP_ERROR',
} as const;

export const NETWORK_MESSAGE_KEY = 'errors.network';
export const UNKNOWN_MESSAGE_KEY = 'errors.unknown';
export const INTERNAL_MESSAGE_KEY = 'errors.internal';

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export function isNotFound(e: unknown): boolean {
  return isApiError(e) && e.status === 404;
}

/** 4xx — retrying will not help. */
export function isClientError(e: unknown): boolean {
  return isApiError(e) && e.status !== null && e.status >= 400 && e.status < 500;
}

export function isNetworkError(e: unknown): boolean {
  return isApiError(e) && e.status === null;
}
