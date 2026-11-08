import type { TFunction } from 'i18next';

/**
 * Player counts → "2 игрока" / "2–4 игрока" / "2, 4 игрока" (D-CAT-6): a continuous set is a range, otherwise a
 * list; plural form by the maximum. `players` is ascending and unique (`GameDefinitionSchema`).
 */
export function playersRange(players: readonly number[]): string {
  if (players.length === 0) return '';
  const first = players[0]!;
  const last = players[players.length - 1]!;
  if (players.length === 1) return String(first);
  const continuous = players.every((n, i) => i === 0 || n === players[i - 1]! + 1);
  return continuous ? `${first}–${last}` : players.join(', ');
}

export function formatPlayers(t: TFunction, players: readonly number[]): string {
  const max = players.length > 0 ? players[players.length - 1]! : 0;
  return t('common:players', { count: max, range: playersRange(players) });
}
