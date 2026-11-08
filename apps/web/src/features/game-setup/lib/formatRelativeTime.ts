const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "5 мин назад" / "yesterday" in the current language (D-i18n-3). */
export function formatRelativeTime(
  iso: string,
  language: string,
  now: number = Date.now(),
): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const diffSeconds = Math.round((time - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' });
  for (const [unit, seconds] of UNITS) {
    if (Math.abs(diffSeconds) >= seconds)
      return rtf.format(Math.round(diffSeconds / seconds), unit);
  }
  return rtf.format(0, 'minute');
}
