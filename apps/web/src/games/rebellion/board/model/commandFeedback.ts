import type { TFunction } from 'i18next';
import { notify } from '@/shared/feedback';
import { translateError } from '@/shared/i18n';
import { REBELLION_ERRORS_NS } from '../../i18n';
import type { CommandOutcome } from './boardContext';

export const IGNORED_CODE = 'IGNORED';
const RETRYABLE = new Set(['NETWORK', 'INTERNAL', 'HTTP_ERROR', 'INVALID_RESPONSE']);

/**
 * User feedback for a rejected command (D-F-4, D-F-5): localized reason from `messageKey`;
 * 409 → warning (view is refetched by the sender); network/5xx → error + "Retry".
 */
export function reportCommandFailure(
  t: TFunction,
  outcome: Extract<CommandOutcome, { ok: false }>,
  retry?: () => void,
): void {
  if (outcome.code === IGNORED_CODE) return;
  const message = translateError(t, outcome, { gameNs: REBELLION_ERRORS_NS });
  if (outcome.code === 'VERSION_CONFLICT') {
    notify({ severity: 'warning', message });
    return;
  }
  notify({
    severity: 'error',
    message,
    action:
      retry && RETRYABLE.has(outcome.code)
        ? { label: t('common:actions.retry'), onClick: retry }
        : undefined,
  });
}
