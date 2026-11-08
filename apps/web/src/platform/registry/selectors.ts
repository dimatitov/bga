import type { WebGameEntry } from '@/games/registry';

export function findGameEntry(
  registry: readonly WebGameEntry[],
  gameId: string | undefined,
): WebGameEntry | undefined {
  if (gameId === undefined) return undefined;
  return registry.find((e) => e.definition.id === gameId);
}

/** Catalogue order (Q-2): registry order, available games first (stable). Never mutates the input. */
export function catalogOrder(registry: readonly WebGameEntry[]): WebGameEntry[] {
  return [
    ...registry.filter((e) => e.definition.status === 'available'),
    ...registry.filter((e) => e.definition.status !== 'available'),
  ];
}

/** i18n namespace of the game's catalogue texts: `<i18nPrefix>.meta`. */
export function gameMetaNs(entry: WebGameEntry): string {
  return `${entry.i18nPrefix}.meta`;
}

/** The game can start sessions in this app: `available` and has a setup screen. */
export function canStartSession(entry: WebGameEntry): boolean {
  return entry.definition.status === 'available' && entry.SetupScreen !== undefined;
}
