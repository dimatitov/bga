/**
 * SWR-010 W5 (plan-backend §10.3): the card part of a hidden-base relocation. In a game with cards the Location
 * card names the base, so moving the base also exchanges `from`'s Location card with `to`'s probe card at the
 * same deck position (all counts and the deck order of the other cards stay). The same transformation as
 * `packages/games/rebellion/test/ai/fixtures/relocate-base.ts` (`swapLocationCard`).
 * Unchanged state without `cards` (legacy); `null` when `to`'s card is not in the deck (a drawn or removed card is
 * visible to the Empire, so such a relocation would not be indistinguishable).
 */
import { probeInstanceId, type CoreGameState } from '@bga/game-rebellion/schema';

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
