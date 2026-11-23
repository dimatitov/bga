/**
 * SWR-010 W3 — Physical Hand: registration of the human Rebels' Location card (plan-backend §5.6; AC-10, A-7).
 * The table branch of the pipeline (409, no table, notYourSide, removal of the `registerBase` task) is W4's;
 * here: `validateRegisterLocation` (rules checks, in order) and `applyRegisterLocation` (cards, base, units,
 * reshuffle, event).
 */
import { describe, expect, it } from 'vitest';
import { checkCardInvariants, seededShuffle } from '@bga/platform/cards';
import {
  eligibleRebelBaseSystemIds,
  probeDefinitionId,
  probeInstanceId,
  rebellionCardEngineContext,
  type CoreGameState,
  type RegisterCardCommand,
} from '../../../src/schema';
import { applyRegisterLocation, validateRegisterLocation } from '../../../src/rules/core/cards';
import { coreDataBaseV1 } from '../../../src/scenario';
import { DIG_REB, PHY_EMP, PHY_REB, newGame, zone } from './cards-helpers';

const ELIGIBLE = eligibleRebelBaseSystemIds(coreDataBaseV1);

const reg = (definitionId: string, zoneId = 'rebels-location'): RegisterCardCommand => ({
  type: 'REGISTER_CARD',
  zoneId,
  definitionId,
});

function pending(gameId = 'reg-1'): CoreGameState {
  const state = newGame(PHY_REB, gameId);
  expect(state.table?.baseRegistration).not.toBeNull();
  return state;
}

describe('validateRegisterLocation (§5.5 REGISTER branch, rules part)', () => {
  it('accepts every eligible system card while the registration is pending', () => {
    const state = pending();
    for (const systemId of ELIGIBLE) {
      expect(
        validateRegisterLocation(state, 'rebels', reg(probeDefinitionId(systemId))),
      ).toBeNull();
    }
  });

  it('order: gameOver → registrationUnavailable → unknownCard → cardNotEligible; details echo the request', () => {
    const state = pending();
    const over: CoreGameState = {
      ...state,
      outcome: { winner: 'rebels', reason: 'timeReachedReputation' },
    };
    expect(validateRegisterLocation(over, 'rebels', reg('nope'))).toMatchObject({
      messageKey: 'errors.gameOver',
    });
    expect(validateRegisterLocation(state, 'rebels', reg('nope', 'probe-deck'))).toEqual({
      code: 'ILLEGAL_COMMAND',
      messageKey: 'errors.registrationUnavailable',
      details: { zoneId: 'probe-deck', definitionId: 'nope' },
    });
    expect(validateRegisterLocation(state, 'rebels', reg('nope'))).toEqual({
      code: 'ILLEGAL_COMMAND',
      messageKey: 'errors.unknownCard',
      details: { zoneId: 'rebels-location', definitionId: 'nope' },
    });
    // coruscant has no card; corellia is a probe card of a non-eligible system (first-game box)
    expect(validateRegisterLocation(state, 'rebels', reg('probe-coruscant'))).toMatchObject({
      messageKey: 'errors.unknownCard',
    });
    expect(validateRegisterLocation(state, 'rebels', reg('probe-corellia'))).toEqual({
      code: 'ILLEGAL_COMMAND',
      messageKey: 'errors.cardNotEligible',
      details: { zoneId: 'rebels-location', definitionId: 'probe-corellia' },
    });
  });

  it('digital, human Empire, the Empire as actor → registrationUnavailable', () => {
    const def = probeDefinitionId(ELIGIBLE[0]!);
    for (const state of [newGame(DIG_REB, 'reg-d'), newGame(PHY_EMP, 'reg-e')]) {
      expect(validateRegisterLocation(state, 'rebels', reg(def))).toMatchObject({
        messageKey: 'errors.registrationUnavailable',
      });
    }
    expect(validateRegisterLocation(pending(), 'empire', reg(def))).toMatchObject({
      messageKey: 'errors.registrationUnavailable',
    });
  });
});

describe('applyRegisterLocation (§5.6)', () => {
  it('another system: card → Location, deck reshuffled (seed `<id>|probe-deck|registered`), base and units move, event', () => {
    const state = pending('reg-2');
    const provisional = state.rebelBase.systemId;
    const target = ELIGIBLE.find((id) => id !== provisional)!;
    const onBase = state.units.filter((u) => u.systemId === provisional).map((u) => u.id);
    expect(onBase.length).toBeGreaterThan(0);
    const frozen = JSON.stringify(state);

    const t = applyRegisterLocation(state, 'rebels', reg(probeDefinitionId(target)));
    expect(JSON.stringify(state)).toBe(frozen); // input untouched

    const next = t.state;
    expect(next.rebelBase).toEqual({ systemId: target, revealed: false });
    expect(zone(next, 'rebels-location')).toEqual([probeInstanceId(target)]);
    const deckWithout = zone(state, 'probe-deck').filter((id) => id !== probeInstanceId(target));
    expect(zone(next, 'probe-deck')).toEqual(
      seededShuffle(deckWithout, 'reg-2|probe-deck|registered'),
    );
    expect(zone(next, 'probe-deck')).toHaveLength(25);
    expect(zone(next, 'probe-deck')).toContain(probeInstanceId(provisional));
    for (const id of onBase) expect(next.units.find((u) => u.id === id)?.systemId).toBe(target);
    expect(next.units.filter((u) => u.systemId === provisional)).toEqual([]);
    // other units untouched
    expect(next.units.filter((u) => !onBase.includes(u.id))).toEqual(
      state.units.filter((u) => !onBase.includes(u.id)),
    );
    expect(t.drafts).toEqual([
      {
        type: 'CARD_REGISTERED',
        actor: 'rebels',
        payload: { zoneId: 'rebels-location', definitionId: probeDefinitionId(target) },
      },
    ]);
    expect(checkCardInvariants(next.cards!.pile, rebellionCardEngineContext)).toEqual([]);
  });

  it('the provisional system itself: units stay, card registered', () => {
    const state = pending('reg-3');
    const base = state.rebelBase.systemId;
    const t = applyRegisterLocation(state, 'rebels', reg(probeDefinitionId(base)));
    expect(t.state.units).toEqual(state.units);
    expect(t.state.rebelBase.systemId).toBe(base);
    expect(zone(t.state, 'rebels-location')).toEqual([probeInstanceId(base)]);
  });

  it('deterministic: same state + command → identical result', () => {
    const def = probeDefinitionId(ELIGIBLE[3]!);
    expect(JSON.stringify(applyRegisterLocation(pending('reg-4'), 'rebels', reg(def)))).toBe(
      JSON.stringify(applyRegisterLocation(pending('reg-4'), 'rebels', reg(def))),
    );
  });

  it('a second registration (Location already filled / digital game) is a programming error → throws', () => {
    const state = pending('reg-5');
    const once = applyRegisterLocation(state, 'rebels', reg(probeDefinitionId(ELIGIBLE[1]!))).state;
    expect(() =>
      applyRegisterLocation(once, 'rebels', reg(probeDefinitionId(ELIGIBLE[2]!))),
    ).toThrow();
    expect(() =>
      applyRegisterLocation(
        newGame(DIG_REB, 'reg-6'),
        'rebels',
        reg(probeDefinitionId(ELIGIBLE[2]!)),
      ),
    ).toThrow();
  });

  it('a board changed before the registration is a corrupt state → throws', () => {
    const state = pending('reg-7');
    const target = ELIGIBLE.find((id) => id !== state.rebelBase.systemId)!;
    const corrupt: CoreGameState = {
      ...state,
      units: state.units.map((u, i) => (i === 0 ? { ...u, systemId: target } : u)),
    };
    expect(() =>
      applyRegisterLocation(corrupt, 'rebels', reg(probeDefinitionId(target))),
    ).toThrow();
  });
});
