import { type TFunction } from 'i18next';
import { isApiError } from '@/shared/api/errors';

export interface TranslatableError {
  code?: string;
  messageKey?: string;
  details?: unknown;
}

export interface TranslateErrorOptions {
  /** Game error namespace tried first, e.g. `'rebellion.errors'` (SWR-003 plan-frontend §5.4). */
  gameNs?: string;
}

/**
 * `messageKey` `errors.<name>` → `<gameNs>:<name>` (when given) → `errors:<name>`; no translation →
 * `errors:code.<CODE>`; none → `errors:unknown` (plan-frontend §7.3, D-i18n-4; SWR-003 §5.4).
 */
export function translateError(
  t: TFunction,
  error: TranslatableError,
  options: TranslateErrorOptions = {},
): string {
  const keys: string[] = [];
  if (error.messageKey) {
    const name = error.messageKey.startsWith('errors.')
      ? error.messageKey.slice('errors.'.length)
      : error.messageKey;
    if (name && options.gameNs) keys.push(`${options.gameNs}:${name}`);
    if (name) keys.push(`errors:${name}`);
  }
  if (error.code) keys.push(`errors:code.${error.code}`);
  keys.push('errors:unknown');
  const details =
    error.details && typeof error.details === 'object' && !Array.isArray(error.details)
      ? (error.details as Record<string, unknown>)
      : {};
  return t(keys, { ...details }) as string;
}

/** Any thrown value (ApiError, Error, …) → localized text. */
export function translateUnknownError(
  t: TFunction,
  error: unknown,
  options: TranslateErrorOptions = {},
): string {
  if (isApiError(error)) {
    return translateError(t, { code: error.code, messageKey: error.messageKey }, options);
  }
  return translateError(t, {}, options);
}
