import type { ReactNode } from 'react';
import { gameRegistry, type WebGameEntry } from '@/games/registry';
import { GameRegistryContext } from './useGameRegistry';

export interface GameRegistryProviderProps {
  /** Entries to expose; default — the real `gameRegistry`. Tests inject fake entries here (TR-5). */
  registry?: readonly WebGameEntry[];
  children: ReactNode;
}

/** The only way the platform reads the web registry (plan-frontend §4 "Инъекция для тестов"). */
export function GameRegistryProvider({ registry, children }: GameRegistryProviderProps) {
  return (
    <GameRegistryContext.Provider value={registry ?? gameRegistry}>
      {children}
    </GameRegistryContext.Provider>
  );
}
