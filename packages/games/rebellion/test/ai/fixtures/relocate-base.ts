/**
 * Move the hidden base of a `core-v1` state to another system (test helper; same transformation as the SWR-005
 * metamorphic test in `test/rules/core/hidden-info.test.ts`, extracted for the bot's invariance tests, TC-H-01).
 * Every Rebel unit / leader / activation standing in the base and every Rebel event naming it moves along.
 * `null` when `to` already carries Rebel traces (then the Empire could legitimately see a difference).
 * SWR-010 (plan-backend §10.3): in a game with cards the Location card moves too — it is exchanged with `to`'s
 * probe card at the same deck position (`null` when `to`'s card is not in the deck: drawn or removed cards are
 * visible to the Empire, so such a relocation is not indistinguishable).
 */
import { probeInstanceId, type CoreGameState } from '../../../src/schema';

/**
 * The card part of a base relocation: `from`'s Location card and `to`'s deck card swap places (same deck
 * position, same counts). Unchanged state without `cards`; `null` when `to`'s card is not in the deck.
 */
export function swapLocationCard(
  state: CoreGameState,
  from: string,
  to: string,
): CoreGameState | null {
  const cards = state.cards;
  if (cards === undefined) return state;
  const fromCard = probeInstanceId(from);
  const toCard = probeInstanceId(to);
  const deck = cards.pile.zones.find((z) => z.id === 'probe-deck');
  if (deck === undefined || !deck.cards.includes(toCard)) return null;
  const replace = (ids: readonly string[]) =>
    ids.map((id) => (id === toCard ? fromCard : id === fromCard ? toCard : id));
  return {
    ...state,
    cards: {
      ...cards,
      pile: {
        ...cards.pile,
        zones: cards.pile.zones.map((z) =>
          z.id === 'probe-deck' || z.id === 'rebels-location'
            ? { ...z, cards: replace(z.cards) }
            : z,
        ),
      },
    },
  };
}

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
  const withCards = swapLocationCard(state, from, to);
  if (withCards === null) return null;
  const swap = (id: string) => (id === from ? to : id);
  return {
    ...withCards,
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
