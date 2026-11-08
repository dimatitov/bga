/**
 * R-4 `ACTIVATE_SYSTEM {leaderId, systemId}`: the active side places an own leader from its pool in ANY
 * system of the map (also one with a leader of either side, Q-BE-3); a leader without tactic values
 * (`canActivate: false`) cannot activate; one activation per turn.
 * Check order (Data clarifications "BE-корректировка"): activationInProgress → unknownLeader →
 * leaderNotInPool → leaderCannotActivate → unknownSystem. Activating the base never reveals it (Q-11).
 */
import {
  REBELLION_ERROR_MESSAGE_KEYS as K,
  type ActivateSystemCommand,
  type CoreGameState,
  type Faction,
} from '../../schema';
import type { CoreError } from '../result';
import { illegal, leaderById, systemById, type Transition } from './helpers';

export function validateActivate(
  state: CoreGameState,
  actor: Faction,
  command: ActivateSystemCommand,
): CoreError | null {
  const { leaderId, systemId } = command;
  if (state.activation !== null) return illegal(K.activationInProgress, { actor });
  const leader = leaderById(state, leaderId);
  if (!leader) return illegal(K.unknownLeader, { leaderId });
  if (leader.owner !== actor || leader.systemId !== null) {
    return illegal(K.leaderNotInPool, { leaderId });
  }
  if (!leader.canActivate) return illegal(K.leaderCannotActivate, { leaderId });
  if (!systemById(state, systemId)) return illegal(K.unknownSystem, { systemId });
  return null;
}

/** Apply a validated activation: leader → system, `activation` set, `SYSTEM_ACTIVATED`. */
export function applyActivate(
  state: CoreGameState,
  actor: Faction,
  command: ActivateSystemCommand,
): Transition {
  const { leaderId, systemId } = command;
  return {
    state: {
      ...state,
      leaders: state.leaders.map((l) => (l.id === leaderId ? { ...l, systemId } : l)),
      activation: { side: actor, leaderId, systemId },
    },
    drafts: [{ type: 'SYSTEM_ACTIVATED', actor, payload: { leaderId, systemId } }],
  };
}
