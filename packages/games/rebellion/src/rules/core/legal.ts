/**
 * `core-v1` legal actions (plan-backend §3.5 with the revisions Q-BE-3, Q-40): only for the active side,
 * without a pending handoff, without `outcome`, in the command phase — otherwise `[]`.
 * - No activation: `ACTIVATE_SYSTEM{leaderIds, systemIds}` (own pool leaders with `canActivate` × all
 *   systems of the map, omitted when no such leader) + `PASS`.
 * - During an own activation: one `MOVE_PIECES` per system adjacent to the activated one without an own
 *   leader that has movable own units (`requiresTransport` units are listed only when an own mobile unit
 *   with capacity > 0 stands in the same system) + `FINISH_ACTIVATION`.
 * Order follows `map.systems`, `units`, `leaders` (deterministic). Built only from the viewer's own pieces
 * and public data: for the Empire it never depends on the hidden base.
 */
import type { CoreGameState, CoreLegalAction, Faction } from '../../schema';
import { hasOwnLeaderIn, systemById, typeOf } from './helpers';

export function coreLegalActions(state: CoreGameState, viewer: Faction): CoreLegalAction[] {
  if (
    state.outcome !== null ||
    state.handoffPending ||
    state.phase !== 'command' ||
    viewer !== state.activeSide ||
    state.passed[viewer]
  ) {
    return [];
  }
  const activation = state.activation;
  if (activation === null) {
    const leaderIds = state.leaders
      .filter((l) => l.owner === viewer && l.systemId === null && l.canActivate)
      .map((l) => l.id);
    const actions: CoreLegalAction[] = [];
    if (leaderIds.length > 0) {
      actions.push({
        type: 'ACTIVATE_SYSTEM',
        leaderIds,
        systemIds: state.map.systems.map((s) => s.id),
      });
    }
    actions.push({ type: 'PASS' });
    return actions;
  }

  const target = systemById(state, activation.systemId);
  const actions: CoreLegalAction[] = [];
  for (const source of state.map.systems) {
    if (!target?.adjacentSystemIds.includes(source.id)) continue;
    if (hasOwnLeaderIn(state, viewer, source.id)) continue;
    const mobile = state.units
      .filter((u) => u.owner === viewer && u.systemId === source.id)
      .map((u) => ({ unit: u, type: typeOf(state, u.typeKey) }))
      .filter(({ type }) => type.mobility === 'mobile');
    const hasCarrier = mobile.some(
      ({ type }) => !type.requiresTransport && type.transportCapacity > 0,
    );
    const pieces = mobile
      .filter(({ type }) => !type.requiresTransport || hasCarrier)
      .map(({ unit, type }) => ({
        pieceId: unit.id,
        transportCapacity: type.transportCapacity,
        requiresTransport: type.requiresTransport,
      }));
    if (pieces.length > 0) {
      actions.push({
        type: 'MOVE_PIECES',
        fromSystemId: source.id,
        toSystemId: activation.systemId,
        pieces,
      });
    }
  }
  actions.push({ type: 'FINISH_ACTIVATION' });
  return actions;
}
