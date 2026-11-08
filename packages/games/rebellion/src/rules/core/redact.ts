/**
 * THE single redaction point of `core-v1` (plan-backend §5.1, BD-4; Q-14, Q-15, Q-16).
 * `hiddenBaseFor(state, viewer) = viewer === 'empire' && !revealed && outcome === null`. While hidden:
 * - Rebel units / leaders / the Rebel activation in the base system are shown in the base zone
 *   (`location: {kind: 'rebelBase'}`); `rebelBase.systemId` is `null`;
 * - in `SYSTEM_ACTIVATED` / `PIECES_MOVED` of the Rebels the base system becomes `null` ("from / into the
 *   hidden zone", Q-15); every other event is copied as is (no other event carries a base system:
 *   `BASE_REVEALED` exists only after the reveal, `LEADERS_RETURNED` has ids only);
 * - `contestedSystemIds` is computed AFTER the redaction (units in the zone count for no system).
 * After the reveal or the end of the game nothing is hidden, past events included (Q-16, Q-14).
 * Static data (`map`, `unitTypes`) and the pools of both sides are public.
 */
import type {
  CoreEvent,
  CoreGameState,
  CorePlayerView,
  CoreViewEvent,
  Faction,
  GameEvent,
  LeaderViewLocation,
  ViewLocation,
} from '../../schema';
import { coreLegalActions } from './legal';

export function hiddenBaseFor(state: CoreGameState, viewer: Faction): boolean {
  return viewer === 'empire' && !state.rebelBase.revealed && state.outcome === null;
}

function locate(
  state: CoreGameState,
  hidden: boolean,
  owner: Faction,
  systemId: string,
): ViewLocation {
  return hidden && owner === 'rebels' && systemId === state.rebelBase.systemId
    ? { kind: 'rebelBase' }
    : { kind: 'system', systemId };
}

function redactSystem(
  state: CoreGameState,
  hidden: boolean,
  actor: string,
  systemId: string,
): string | null {
  return hidden && actor === 'rebels' && systemId === state.rebelBase.systemId ? null : systemId;
}

/** One stored event as `viewer` may see it (a fresh object; the input is never shared). */
export function redactCoreEvent(
  event: GameEvent,
  state: CoreGameState,
  viewer: Faction,
): CoreViewEvent {
  const hidden = hiddenBaseFor(state, viewer);
  switch (event.type) {
    case 'SYSTEM_ACTIVATED':
      return {
        ...event,
        payload: {
          leaderId: event.payload.leaderId,
          systemId: redactSystem(state, hidden, event.actor, event.payload.systemId),
        },
      };
    case 'PIECES_MOVED':
      return {
        ...event,
        payload: {
          pieceIds: [...event.payload.pieceIds],
          fromSystemId: redactSystem(state, hidden, event.actor, event.payload.fromSystemId),
          toSystemId: redactSystem(state, hidden, event.actor, event.payload.toSystemId),
        },
      };
    case 'LEADERS_RETURNED':
      return { ...event, payload: { leaderIds: [...event.payload.leaderIds] } };
    case 'GAME_CREATED':
    case 'HANDOFF_ACCEPTED':
    case 'PHASE_STARTED':
    case 'ACTIVATION_FINISHED':
    case 'PASSED':
    case 'TIME_ADVANCED':
    case 'BASE_REVEALED':
    case 'GAME_OVER':
      return { ...event, payload: { ...event.payload } } as CoreViewEvent;
    case 'PHASE_ADVANCED':
    case 'TURN_ENDED':
      throw new Error(`event type ${event.type} does not belong to the core-v1 engine`);
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

/** Events (of a command or the log) for `viewer`, redacted against the CURRENT state. */
export function corePlayerEvents(
  events: readonly GameEvent[],
  state: CoreGameState,
  viewer: Faction,
): CoreViewEvent[] {
  return events.map((event) => redactCoreEvent(event, state, viewer));
}

/** Board projection of a `core-v1` state for `viewer` (hidden info removed, own legal actions added). */
export function coreSideView(state: CoreGameState, viewer: Faction): CorePlayerView {
  const hidden = hiddenBaseFor(state, viewer);
  const units = state.units.map((u) => ({
    id: u.id,
    owner: u.owner,
    typeKey: u.typeKey,
    location: locate(state, hidden, u.owner, u.systemId),
  }));
  const leaders = state.leaders.map((l) => ({
    id: l.id,
    owner: l.owner,
    canActivate: l.canActivate,
    location:
      l.systemId === null
        ? ({ kind: 'pool' } satisfies LeaderViewLocation)
        : locate(state, hidden, l.owner, l.systemId),
  }));
  const present = { rebels: new Set<string>(), empire: new Set<string>() };
  for (const u of units) {
    if (u.location.kind === 'system') present[u.owner].add(u.location.systemId);
  }
  const contestedSystemIds = state.map.systems
    .map((s) => s.id)
    .filter((id) => present.rebels.has(id) && present.empire.has(id));

  return {
    kind: 'player',
    rulesEngine: 'core-v1',
    viewer,
    activeSide: state.activeSide,
    settings: { ...state.settings },
    id: state.id,
    version: state.version,
    round: state.round,
    phase: state.phase,
    markers: { time: state.round, reputation: state.reputation },
    map: {
      regions: state.map.regions.map((r) => ({ id: r.id, nameKey: `regions.${r.id}` })),
      systems: state.map.systems.map((s) => ({
        id: s.id,
        nameKey: `systems.${s.id}`,
        regionId: s.regionId,
        adjacentSystemIds: [...s.adjacentSystemIds],
        remote: s.remote,
      })),
    },
    unitTypes: state.unitTypes.map((t) => ({ ...t })),
    units,
    leaders,
    activation:
      state.activation === null
        ? null
        : {
            side: state.activation.side,
            leaderId: state.activation.leaderId,
            location: locate(state, hidden, state.activation.side, state.activation.systemId),
          },
    passed: { ...state.passed },
    rebelBase: {
      systemId: hidden ? null : state.rebelBase.systemId,
      revealed: state.rebelBase.revealed,
    },
    contestedSystemIds,
    outcome: state.outcome === null ? null : { ...state.outcome },
    log: corePlayerEvents(state.log satisfies readonly CoreEvent[], state, viewer),
    legalActions: coreLegalActions(state, viewer),
  };
}
