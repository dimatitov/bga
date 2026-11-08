import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { formatPlayers, playersRange } from './formatPlayers';

describe('formatPlayers (D-CAT-6, Q-12)', () => {
  const t = i18n.t.bind(i18n);

  it('range for a continuous set, list otherwise', () => {
    expect(playersRange([2])).toBe('2');
    expect(playersRange([2, 3, 4])).toBe('2–4');
    expect(playersRange([2, 4])).toBe('2, 4');
  });

  it('ru plural by the maximum', () => {
    expect(formatPlayers(t, [1])).toBe('1 игрок');
    expect(formatPlayers(t, [2])).toBe('2 игрока');
    expect(formatPlayers(t, [2, 3, 4])).toBe('2–4 игрока');
    expect(formatPlayers(t, [3, 4, 5])).toBe('3–5 игроков');
  });

  it('en', async () => {
    await i18n.changeLanguage('en');
    expect(formatPlayers(t, [1])).toBe('1 player');
    expect(formatPlayers(t, [2])).toBe('2 players');
    expect(formatPlayers(t, [2, 3, 4])).toBe('2–4 players');
  });
});
