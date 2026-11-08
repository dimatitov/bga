import { type TFunction } from 'i18next';
import { isApiError } from '@/shared/api/errors';

export interface TranslatableError {
  code?: string;
  messageKey?: string;
  details?: unknown;
}

/**
 * `messageKey` `errors.<name>` → `errors:<name>`; no translation → `errors:code.<CODE>`; none → `errors:unknown`
 * (plan-frontend §7.3, D-i18n-4).
 */
export function translateError(t: TFunction, error: TranslatableError): string {
  const keys: string[] = [];
  if (error.messageKey) {
    const name = error.messageKey.startsWith('errors.')
      ? error.messageKey.slice('errors.'.length)
      : error.messageKey;
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
export function translateUnknownError(t: TFunction, error: unknown): string {
  if (isApiError(error)) {
    return translateError(t, { code: error.code, messageKey: error.messageKey });
  }
  return translateError(t, {});
}
