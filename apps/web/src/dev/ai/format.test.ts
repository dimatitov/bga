import { describe, expect, it } from 'vitest';
import { formatDurationMs, formatTokens, formatUsd } from './format';

const norm = (s: string) => s.replace(/\s/g, ' ');

describe('format (T-15)', () => {
  it('formatUsd: 2..6 fraction digits in ru and en', () => {
    expect(formatUsd(0.000113, 'en')).toBe('$0.000113');
    expect(norm(formatUsd(0.000113, 'ru'))).toBe('0,000113 $');
    expect(formatUsd(0, 'en')).toBe('$0.00');
    expect(formatUsd(0.25, 'en')).toBe('$0.25');
    expect(formatUsd(0.1234567, 'en')).toBe('$0.123457');
  });

  it('formatDurationMs: integer with group separators', () => {
    expect(formatDurationMs(1234, 'en')).toBe('1,234');
    expect(norm(formatDurationMs(1234, 'ru'))).toBe('1 234');
    expect(formatDurationMs(12.6, 'en')).toBe('13');
  });

  it('formatTokens: integers, null stays null', () => {
    expect(formatTokens(876, 'en')).toBe('876');
    expect(formatTokens(0, 'ru')).toBe('0');
    expect(formatTokens(null, 'en')).toBeNull();
  });
});
