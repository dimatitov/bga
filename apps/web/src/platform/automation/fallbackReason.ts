import type { TFunction } from 'i18next';

/**
 * Short ru/en reason of an automation fallback code (D-PO-3, e.g. `AI_TIMEOUT`); an unknown code → the generic
 * `automation.reason.unknown` text. Codes are not secret; nothing else from the model reaches the UI.
 */
export function automationFallbackReasonText(t: TFunction, code: string): string {
  return t(`sessionHost:automation.reason.${code}`, {
    defaultValue: t('sessionHost:automation.reason.unknown'),
  });
}
