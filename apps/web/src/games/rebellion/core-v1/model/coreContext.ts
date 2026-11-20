import type { Command, PlayerViewCore } from '@bga/game-rebellion/schema';
import { createContext, useContext } from 'react';
import type { CommandSender } from '../../board/model/boardContext';
import type { SendOutcome } from '../../table/hooks/useSendCommand';

/**
 * Context of the `core-v1` table (SWR-005 plan-frontend §3.1, §3.4): the current server view (from the session
 * cache, never copied into Zustand) + the command sender (`useSendCommand`). Provided by `CoreTable`.
 * SWR-006: `isPending` is also `true` while the AI moves (an automation run in flight), so every action is
 * disabled by the existing code; `aiThinking` drives «ИИ думает…» (plan-frontend §6.2; absent = `false`).
 */
export interface CoreBoardContextValue extends CommandSender {
  sessionId: string;
  view: PlayerViewCore;
  send(command: Command): Promise<SendOutcome>;
  aiThinking?: boolean;
}

export const CoreBoardContext = createContext<CoreBoardContextValue | null>(null);

export function useCoreBoard(): CoreBoardContextValue {
  const ctx = useContext(CoreBoardContext);
  if (!ctx) throw new Error('useCoreBoard() must be used inside <CoreBoardContext.Provider>');
  return ctx;
}
