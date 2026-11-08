import { describe, expect, it } from 'vitest';
import { formatAbsoluteDate, formatRelativeTime } from './formatRelativeTime';

const NOW = Date.parse('2026-11-08T12:00:00.000Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe('formatRelativeTime', () => {
  it.each([0, 1, 30, 59])('%i s ago → justNow text (not Intl "this minute")', (s) => {
    expect(formatRelativeTime(ago(s), 'ru', { justNow: 'только что', now: NOW })).toBe(
      'только что',
    );
    expect(formatRelativeTime(ago(s), 'en', { justNow: 'just now', now: NOW })).toBe('just now');
  });

  it('slightly in the future (clock skew) → justNow too', () => {
    expect(formatRelativeTime(ago(-20), 'en', { justNow: 'just now', now: NOW })).toBe('just now');
  });

  it('≥ 60 s → Intl relative time in the given language', () => {
    expect(formatRelativeTime(ago(60), 'en', { justNow: 'just now', now: NOW })).toMatch(/1 min/);
    expect(formatRelativeTime(ago(5 * 60), 'ru', { justNow: 'только что', now: NOW })).toMatch(
      /5 мин/,
    );
    expect(formatRelativeTime(ago(24 * 3600), 'en', { justNow: 'just now', now: NOW })).toBe(
      'yesterday',
    );
  });

  it('invalid date → empty string', () => {
    expect(formatRelativeTime('nope', 'en', { justNow: 'just now', now: NOW })).toBe('');
  });
});

describe('formatAbsoluteDate (plan-frontend §3, `<time title>`)', () => {
  const ISO = '2026-11-08T10:05:00.000Z';

  it('medium date + short time in the given language and time zone', () => {
    const ru = formatAbsoluteDate(ISO, 'ru', 'UTC');
    expect(ru).toMatch(/8 нояб\. 2026/);
    expect(ru).toMatch(/10:05/);
    const en = formatAbsoluteDate(ISO, 'en', 'UTC');
    expect(en).toMatch(/Nov 8, 2026/);
    expect(en).toMatch(/10:05\sAM/);
  });

  it('invalid date → empty string', () => {
    expect(formatAbsoluteDate('nope', 'en')).toBe('');
  });
});
