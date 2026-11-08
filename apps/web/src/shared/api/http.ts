import { ErrorResponseSchema } from '@bga/platform';
import { type z } from 'zod';
import { ApiError, CLIENT_ERROR_CODES, INTERNAL_MESSAGE_KEY, NETWORK_MESSAGE_KEY } from './errors';

/** All requests go to the relative `/api/*` (Vite proxy in dev/e2e). */
export const API_BASE = '/api';

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  /** Extra request headers (e.g. `Idempotency-Key`), added to `Accept`/`Content-Type`. */
  headers?: Record<string, string>;
}

export interface RawResponse {
  status: number;
  ok: boolean;
  /** Parsed JSON body; `undefined` when the body is empty or not JSON. */
  body: unknown;
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/** Low-level fetch: never throws for HTTP statuses; throws `ApiError{status:null}` for network failures. */
export async function requestRaw(path: string, options: RequestOptions = {}): Promise<RawResponse> {
  const { method = 'GET', body, signal, headers: extraHeaders = {} } = options;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiError({
      status: null,
      code: CLIENT_ERROR_CODES.network,
      messageKey: NETWORK_MESSAGE_KEY,
      message: e instanceof Error ? e.message : 'Network error',
    });
  }
  let parsed: unknown;
  try {
    const text = await res.text();
    parsed = text ? (JSON.parse(text) as unknown) : undefined;
  } catch (e) {
    if (isAbort(e)) throw e;
    parsed = undefined; // non-JSON body (e.g. proxy error page)
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

/** Converts a non-2xx response into an `ApiError` (uses the unified error body when it parses, R-8). */
export function toApiError(raw: RawResponse): ApiError {
  const err = ErrorResponseSchema.safeParse(raw.body);
  if (err.success) {
    return new ApiError({
      status: raw.status,
      code: err.data.error.code,
      messageKey: err.data.error.messageKey,
      details: err.data.error.details,
    });
  }
  return new ApiError({
    status: raw.status,
    code: CLIENT_ERROR_CODES.http,
    // 5xx without the unified body → generic "internal"; other statuses → text by code.
    messageKey: raw.status >= 500 ? INTERNAL_MESSAGE_KEY : undefined,
  });
}

/** Parses a 2xx body with a Zod schema; a mismatch is reported as `ApiError{code:'INVALID_RESPONSE'}`. */
export function parseBody<S extends z.ZodType>(raw: RawResponse, schema: S): z.output<S> {
  const result = schema.safeParse(raw.body);
  if (!result.success) {
    throw new ApiError({
      status: raw.status,
      code: CLIENT_ERROR_CODES.invalidResponse,
      details: result.error.issues,
    });
  }
  return result.data;
}

/** JSON request validated by `schema`; non-2xx → throws `ApiError`. */
export async function requestJson<S extends z.ZodType>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.output<S>> {
  const raw = await requestRaw(path, options);
  if (!raw.ok) throw toApiError(raw);
  return parseBody(raw, schema);
}
