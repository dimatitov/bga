/**
 * SWR-010 W3 — base reveal moves the Location card onto the public "Rebel Base" space (plan-backend §3.6;
 * TC-VIS-03) and the time victory leaves it in the Location (visible to everybody after the end, Q-14).
 */
import { describe, expect, it } from 'vitest';
import {
  CoreGameStateV3Schema,
  probeDefinitionId,
  probeInstanceId,
  unitTypeRevealsRebelBase,
  type CoreGameState,
} from '../../../src/schema';
import { coreCardsView, runStateChecks } from '../../../src/rules/core';
import { revealLocationCard } from '../../../src/rules/core/cards';
import { DIG_EMP, DIG_REB, newGame, rounds, zone } from './cards-helpers';

/** An Imperial ground unit placed in the base system, no activation running → the next check reveals. */
function withImperialGroundInBase(state: CoreGameState): CoreGameState {
  const types = new Map(state.unitTypes.map((t) => [t.typeKey, t]));
  const ground = state.units.find((u) => {
    const type = types.get(u.typeKey);
    return u.owner === 'empire' && !!type && unitTypeRevealsRebelBase(type);
  });
  if (!ground) throw new Error('no Imperial ground unit');
  return {
    ...state,
    units: state.units.map((u) =>
      u.id === ground.id ? { ...u, systemId: state.rebelBase.systemId } : u,
    ),
  };
}

function locationOf(view: ReturnType<typeof coreCardsView>, id: string) {
  return view?.zones.find((z) => z.id === id);
}

describe('base reveal and the Location card (§3.6)', () => {
  it('BASE_REVEALED moves the Location card to rebels-base-revealed; the state stays valid', () => {
    const state = withImperialGroundInBase(newGame(DIG_EMP, 'rev-1'));
    const base = state.rebelBase.systemId;
    const before = coreCardsView(state, 'empire');
    expect(locationOf(before, 'rebels-location')).toMatchObject({ count: 1, cards: null });

    const checked = runStateChecks({ state, drafts: [] });
    expect(checked.drafts.map((d) => d.type)).toContain('BASE_REVEALED');
    expect(checked.drafts.filter((d) => d.type.startsWith('CARD'))).toEqual([]);
    expect(zone(checked.state, 'rebels-location')).toEqual([]);
    expect(zone(checked.state, 'rebels-base-revealed')).toEqual([probeInstanceId(base)]);
    expect(CoreGameStateV3Schema.safeParse(checked.state).success).toBe(true);

    // TC-VIS-03: the Empire (and everybody) now sees the card on the public space.
    for (const viewer of ['empire', 'rebels'] as const) {
      const view = coreCardsView(checked.state, viewer);
      expect(locationOf(view, 'rebels-base-revealed')?.cards).toEqual([
        { instanceId: probeInstanceId(base), definitionId: probeDefinitionId(base) },
      ]);
      expect(locationOf(view, 'rebels-location')).toMatchObject({ count: 0, cards: [] });
    }
  });

  it('revealLocationCard is a no-op without cards (legacy reveal unchanged)', () => {
    const { cards: _cards, ...legacy } = newGame(DIG_REB, 'rev-2');
    const t = {
      state: { ...legacy, rebelBase: { ...legacy.rebelBase, revealed: true } },
      drafts: [],
    };
    expect(revealLocationCard(t)).toBe(t);
    const checked = runStateChecks({ state: withImperialGroundInBase(legacy), drafts: [] });
    expect(checked.drafts.map((d) => d.type)).toContain('BASE_REVEALED');
    expect('cards' in checked.state).toBe(false);
  });

  it('time victory without a reveal: the card stays in the Location, visible to the Empire after the end', () => {
    const final = rounds(newGame(DIG_REB, 'rev-3'), 13);
    expect(final.outcome?.reason).toBe('timeReachedReputation');
    expect(final.rebelBase.revealed).toBe(false);
    const base = final.rebelBase.systemId;
    expect(zone(final, 'rebels-location')).toEqual([probeInstanceId(base)]);
    expect(locationOf(coreCardsView(final, 'empire'), 'rebels-location')?.cards).toEqual([
      { instanceId: probeInstanceId(base), definitionId: probeDefinitionId(base) },
    ]);
    // …but not before the end
    const running = rounds(newGame(DIG_REB, 'rev-3'), 12);
    expect(locationOf(coreCardsView(running, 'empire'), 'rebels-location')?.cards).toBeNull();
  });
});
