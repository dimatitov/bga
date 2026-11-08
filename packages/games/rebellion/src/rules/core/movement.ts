/**
 * R-5 `MOVE_PIECES {pieceIds, fromSystemId, toSystemId}` during the actor's own activation: own units move
 * only INTO the activated system, only FROM a system adjacent to it; units in a system with an own leader
 * stay (an enemy leader does not pin); immobile units never move; units that `requiresTransport` (ground
 * units, TIE fighters) move only together with ships of enough capacity leaving the same system in the
 * same command. All or nothing; enemy units never block (no combat, D-1).
 *
 * Check order (plan-backend §3.3, test-cases Conventions): noActivation → unknownSystem (from, then to) →
 * notActivatedSystem → sameSystem → notAdjacent → pinnedByLeader → per piece in request order
 * unknownPiece → notOwner → notInFromSystem → immobileUnit → insufficientCapacity.
 * The owner is checked BEFORE the location: otherwise the Empire could learn from the error key where a
 * Rebel unit stands (hidden base).
 */
import {
  REBELLION_ERROR_MESSAGE_KEYS as K,
  type CoreGameState,
  type CoreUnit,
  type Faction,
  type MovePiecesCommand,
} from '../../schema';
import type { CoreError } from '../result';
import { hasOwnLeaderIn, illegal, systemById, typeOf, unitById, type Transition } from './helpers';
import { checkEmpireVictory } from './victory';

/**
 * Transport capacity of one command (plan-backend §3.3): `available` = Σ capacity of the moving units that
 * do not require transport; `required` = number of moving units that do (1 place each, one shared limit).
 * Ships staying behind or already in the activated system give no capacity.
 */
export function transportNeeds(
  state: CoreGameState,
  units: readonly CoreUnit[],
): { required: number; available: number } {
  let required = 0;
  let available = 0;
  for (const unit of units) {
    const type = typeOf(state, unit.typeKey);
    if (type.requiresTransport) required += 1;
    else available += type.transportCapacity;
  }
  return { required, available };
}

export function validateMove(
  state: CoreGameState,
  actor: Faction,
  command: MovePiecesCommand,
): CoreError | null {
  const { pieceIds, fromSystemId, toSystemId } = command;
  const activation = state.activation;
  if (activation === null) return illegal(K.noActivation, { actor });
  const from = systemById(state, fromSystemId);
  if (!from) return illegal(K.unknownSystem, { systemId: fromSystemId });
  if (!systemById(state, toSystemId)) return illegal(K.unknownSystem, { systemId: toSystemId });
  if (toSystemId !== activation.systemId) return illegal(K.notActivatedSystem, { toSystemId });
  if (fromSystemId === toSystemId) return illegal(K.sameSystem, { fromSystemId, toSystemId });
  if (!from.adjacentSystemIds.includes(toSystemId)) {
    return illegal(K.notAdjacent, { fromSystemId, toSystemId });
  }
  if (hasOwnLeaderIn(state, actor, fromSystemId))
    return illegal(K.pinnedByLeader, { fromSystemId });

  const moving: CoreUnit[] = [];
  for (const pieceId of pieceIds) {
    const unit = unitById(state, pieceId);
    if (!unit) return illegal(K.unknownPiece, { pieceId });
    if (unit.owner !== actor) return illegal(K.notOwner, { pieceId });
    if (unit.systemId !== fromSystemId)
      return illegal(K.notInFromSystem, { pieceId, fromSystemId });
    if (typeOf(state, unit.typeKey).mobility === 'immobile')
      return illegal(K.immobileUnit, { pieceId });
    moving.push(unit);
  }
  const { required, available } = transportNeeds(state, moving);
  if (required > available) {
    return illegal(K.insufficientCapacity, { fromSystemId, required, available });
  }
  return null;
}

/** Apply a validated move: all listed units at once, `PIECES_MOVED`, then the Empire victory check (R-9). */
export function applyMove(
  state: CoreGameState,
  actor: Faction,
  command: MovePiecesCommand,
): Transition {
  const { pieceIds, fromSystemId, toSystemId } = command;
  const moving = new Set(pieceIds);
  return checkEmpireVictory({
    state: {
      ...state,
      units: state.units.map((u) => (moving.has(u.id) ? { ...u, systemId: toSystemId } : u)),
    },
    drafts: [
      {
        type: 'PIECES_MOVED',
        actor,
        payload: { pieceIds: [...pieceIds], fromSystemId, toSystemId },
      },
    ],
  });
}
