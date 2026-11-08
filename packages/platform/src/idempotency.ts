import { z } from 'zod';
import type { ValidationIssue } from './validation';
import { toValidationIssues } from './validation';

/**
 * Idempotent session creation (SWR-004, Q-1..Q-5): the client sends one `Idempotency-Key` (UUID) per
 * form-submit attempt on `POST /api/sessions`. The key is optional; a replay is answered 200 with
 * `Idempotent-Replay: true`.
 */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENT_REPLAY_HEADER = 'Idempotent-Replay';

/** Node/Express lower-case header names. */
export const IDEMPOTENCY_KEY_HEADER_LC = 'idempotency-key';

/** `error.details.issues[].path` of a malformed header (400 VALIDATION). */
export const IDEMPOTENCY_KEY_ISSUE_PATH: readonly ['headers', 'idempotency-key'] = [
  'headers',
  IDEMPOTENCY_KEY_HEADER_LC,
];

/** A UUID (RFC 9562, any version; at most 36 characters). */
export const IdempotencyKeySchema = z.uuid();
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

export type IdempotencyKeyParseResult =
  { ok: true; key: IdempotencyKey | null } | { ok: false; issues: ValidationIssue[] };

/**
 * Validates the raw `Idempotency-Key` header value (`req.headers['idempotency-key']`).
 * `undefined` → no idempotency (`key: null`). Empty, non-UUID, repeated (array, or values joined with `, `)
 * → issues under `IDEMPOTENCY_KEY_ISSUE_PATH`. The key is returned as sent (no case folding).
 */
export function parseIdempotencyKeyHeader(raw: unknown): IdempotencyKeyParseResult {
  if (raw === undefined) return { ok: true, key: null };
  const parsed = IdempotencyKeySchema.safeParse(raw);
  return parsed.success
    ? { ok: true, key: parsed.data }
    : { ok: false, issues: toValidationIssues(parsed.error, [...IDEMPOTENCY_KEY_ISSUE_PATH]) };
}

/**
 * Canonical JSON for comparing `POST /api/sessions` bodies (Q-2, AM-BE-7) — one implementation for the web
 * client (key reuse on retry) and the API (stored body hash): object keys are sorted recursively (by UTF-16
 * code units), array order is kept, nothing else is normalised (an omitted field ≠ `null` ≠ a default).
 * Like `JSON.stringify`: `undefined` object members are dropped and `undefined` array items become `null`.
 * Pure; no hashing here (the API hashes the result).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}
