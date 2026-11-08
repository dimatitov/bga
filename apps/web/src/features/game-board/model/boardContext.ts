import type { Command, GameEvent, PlayerView } from '@swr/contracts';
import { createContext, useContext } from 'react';

/**
 * Result of a command as seen by the UI (plan-frontend §3.1). Never a rejected promise:
 * network → `{ ok:false, code:'NETWORK', messageKey:'errors.network' }`; a send while another one is in flight →
 * `{ ok:false, code:'IGNORED' }` (D-P-7).
 */
export type CommandOutcome =
  | { ok: true; view: PlayerView; events: GameEvent[] }
  | { ok: false; code: string; messageKey: string; details?: unknown };

export interface CommandSender {
  send(command: Command): Promise<CommandOutcome>;
  isPending: boolean;
}

export interface BoardContextValue extends CommandSender {
  gameId: string;
  view: PlayerView;
}

/** Provided by the game session page (`<BoardContext.Provider>`): the current server view + the command sender. */
export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoard() must be used inside <BoardProvider>');
  return ctx;
}
