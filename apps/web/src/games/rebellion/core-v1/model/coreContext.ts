import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { createContext, useContext } from 'react';
import type { CommandSender } from '../../board/model/boardContext';

/**
 * Context of the `core-v1` table (SWR-005 plan-frontend §3.1, §3.4): the current server view (from the session
 * cache, never copied into Zustand) + the command sender (`useSendCommand`). Provided by `CoreTable`.
 */
export interface CoreBoardContextValue extends CommandSender {
  sessionId: string;
  view: PlayerViewCore;
}

export const CoreBoardContext = createContext<CoreBoardContextValue | null>(null);

export function useCoreBoard(): CoreBoardContextValue {
  const ctx = useContext(CoreBoardContext);
  if (!ctx) throw new Error('useCoreBoard() must be used inside <CoreBoardContext.Provider>');
  return ctx;
}
