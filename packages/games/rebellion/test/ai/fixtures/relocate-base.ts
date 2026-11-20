/**
 * Move the hidden base of a `core-v1` state to another system (test helper; same transformation as the SWR-005
 * metamorphic test in `test/rules/core/hidden-info.test.ts`, extracted for the bot's invariance tests, TC-H-01).
 * Every Rebel unit / leader / activation standing in the base and every Rebel event naming it moves along.
 * `null` when `to` already carries Rebel traces (then the Empire could legitimately see a difference).
 */
import type { CoreGameState } from '../../../src/schema';

export function relocateBase(state: CoreGameState, to: string): CoreGameState | null {
  const from = state.rebelBase.systemId;
  if (to === from) return null;
  if (state.units.some((u) => u.owner === 'rebels' && u.systemId === to)) return null;
  if (state.leaders.some((l) => l.owner === 'rebels' && l.systemId === to)) return null;
  if (state.activation?.side === 'rebels' && state.activation.systemId === to) return null;
  const mentions = state.log.some(
    (e) =>
      e.actor === 'rebels' &&
      ((e.type === 'SYSTEM_ACTIVATED' && e.payload.systemId === to) ||
        (e.type === 'PIECES_MOVED' &&
          (e.payload.fromSystemId === to || e.payload.toSystemId === to))),
  );
  if (mentions) return null;
  const swap = (id: string) => (id === from ? to : id);
  return {
    ...state,
    rebelBase: { ...state.rebelBase, systemId: to },
    units: state.units.map((u) =>
      u.owner === 'rebels' ? { ...u, systemId: swap(u.systemId) } : u,
    ),
    leaders: state.leaders.map((l) =>
      l.owner === 'rebels' && l.systemId !== null ? { ...l, systemId: swap(l.systemId) } : l,
    ),
    activation:
      state.activation?.side === 'rebels'
        ? { ...state.activation, systemId: swap(state.activation.systemId) }
        : state.activation,
    log: state.log.map((e) => {
      if (e.actor !== 'rebels') return e;
      if (e.type === 'SYSTEM_ACTIVATED')
        return { ...e, payload: { ...e.payload, systemId: swap(e.payload.systemId) } };
      if (e.type === 'PIECES_MOVED') {
        return {
          ...e,
          payload: {
            ...e.payload,
            fromSystemId: swap(e.payload.fromSystemId),
            toSystemId: swap(e.payload.toSystemId),
          },
        };
      }
      return e;
    }),
  };
}
