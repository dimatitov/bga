import type { FactionId } from './enums';

/** The other side (pure; the opponent faction is always derived, never sent by a client). */
export function opponentOf(faction: FactionId): FactionId {
  return faction === 'rebels' ? 'empire' : 'rebels';
}
