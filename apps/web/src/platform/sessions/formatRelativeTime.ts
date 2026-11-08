const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export interface RelativeTimeOptions {
  /** Text for |Δ| < 60 s — Intl's "в эту минуту" / "this minute" reads oddly (`common:time.justNow`). */
  justNow: string;
  now?: number;
}

/** "5 мин назад" / "yesterday" in the current language (D-i18n-3); under a minute → `justNow`. */
export function formatRelativeTime(
  iso: string,
  language: string,
  { justNow, now = Date.now() }: RelativeTimeOptions,
): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const diffSeconds = Math.round((time - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' });
  for (const [unit, seconds] of UNITS) {
    if (Math.abs(diffSeconds) >= seconds)
      return rtf.format(Math.round(diffSeconds / seconds), unit);
  }
  return justNow;
}

/**
 * Absolute date-time for the `<time title>` of a session row («8 нояб. 2026 г., 10:05», plan-frontend §3).
 * `timeZone` is for tests (TR-11); invalid date → `''`.
 */
export function formatAbsoluteDate(iso: string, language: string, timeZone?: string): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(time);
}
