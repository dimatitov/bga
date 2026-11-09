/** Number formatting of the diagnostics page by the current UI language (plan-frontend §5.2). */

/** USD with 2..6 fraction digits (`$0.000113`). */
export function formatUsd(value: number, lng: string): string {
  return new Intl.NumberFormat(lng, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

/** Milliseconds as an integer with group separators (unit is added by i18n). */
export function formatDurationMs(ms: number, lng: string): string {
  return new Intl.NumberFormat(lng, { maximumFractionDigits: 0 }).format(ms);
}

/** Token count; `null` (no data from the provider) → `null`, the caller shows «—». */
export function formatTokens(value: number | null, lng: string): string | null {
  if (value === null) return null;
  return new Intl.NumberFormat(lng, { maximumFractionDigits: 0 }).format(value);
}
