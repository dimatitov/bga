import { type TFunction } from 'i18next';
import { isApiError } from '@/shared/api/errors';
import { translateError } from '@/shared/i18n';
import { formatUsd } from './format';

export const AI_ERROR_CODES = [
  'AI_NOT_CONFIGURED',
  'AI_BUDGET_EXCEEDED',
  'AI_RATE_LIMITED',
  'AI_TIMEOUT',
  'AI_PROVIDER_ERROR',
  'AI_INVALID_DECISION',
  'AI_DEV_FORBIDDEN',
] as const;
type AiCode = (typeof AI_ERROR_CODES)[number];

function isAiCode(code: string | undefined): code is AiCode {
  return (AI_ERROR_CODES as readonly string[]).includes(code ?? '');
}

export interface AiErrorView {
  code: string;
  title: string;
  text: string;
  /** Safe facts from `details` (remaining budget, retry delay, attempts), already localized. */
  facts: string[];
  hint: string | null;
}

function num(details: Record<string, unknown>, key: string): number | null {
  const v = details[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Error → texts by code (plan-frontend §6). Never shows `error.message` or a raw body — only translatable keys and
 * whitelisted numeric `details`.
 */
export function aiErrorText(t: TFunction, error: unknown, lng: string): AiErrorView {
  const api = isApiError(error) ? error : null;
  const code = api?.code ?? 'UNKNOWN';
  const text = translateError(t, { code: api?.code, messageKey: api?.messageKey });
  const details =
    api?.details && typeof api.details === 'object' && !Array.isArray(api.details)
      ? (api.details as Record<string, unknown>)
      : {};
  const facts: string[] = [];
  if (isAiCode(code)) {
    const remaining = num(details, 'remainingUsd');
    const limit = num(details, 'limitUsd');
    if (code === 'AI_BUDGET_EXCEEDED' && remaining !== null && limit !== null) {
      facts.push(
        t('devAi:error.details.budget', {
          remaining: formatUsd(remaining, lng),
          limit: formatUsd(limit, lng),
        }),
      );
    }
    const retryAfter = num(details, 'retryAfterSeconds');
    if (retryAfter !== null)
      facts.push(t('devAi:error.details.retryAfter', { seconds: retryAfter }));
    const attempts = num(details, 'attempts');
    if (attempts !== null) facts.push(t('devAi:error.details.attempts', { attempts }));
  }
  const hint = isAiCode(code) ? t(`devAi:error.${code}.hint`) : null;
  return {
    code,
    title: isAiCode(code) ? t(`devAi:error.${code}.title`) : t('devAi:error.generic.title'),
    text,
    facts,
    // D-2: a hint that the shared error text already says (e.g. `errors.aiNotConfigured`) is not repeated.
    hint: hint && !text.includes(hint) ? hint : null,
  };
}
