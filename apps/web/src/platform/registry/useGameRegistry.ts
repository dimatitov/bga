import { createContext, useContext } from 'react';
import { gameRegistry, type WebGameEntry } from '@/games/registry';
import { findGameEntry } from './selectors';

/** Registry context; `null` outside `GameRegistryProvider` (→ the real registry). */
export const GameRegistryContext = createContext<readonly WebGameEntry[] | null>(null);

/** Entries in registry order; outside a provider — the real registry. */
export function useGameRegistry(): readonly WebGameEntry[] {
  return useContext(GameRegistryContext) ?? gameRegistry;
}

/** Entry of `gameId`, or `undefined` for an unknown/missing id. */
export function useGameEntry(gameId: string | undefined): WebGameEntry | undefined {
  return findGameEntry(useGameRegistry(), gameId);
}
