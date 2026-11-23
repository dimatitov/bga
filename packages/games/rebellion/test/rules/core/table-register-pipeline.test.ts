/**
 * SWR-010 W4 — REGISTER_CARD through the pipeline (plan-backend §5.5, §5.6; AC-10, AQ-7, C-3;
 * TC-PH-01..07 rules part). The card mechanics are W3's `applyRegisterLocation`; here: the error order, the table
 * bookkeeping (`completeRegistration`) and "nothing else changes / details echo the request only".
 */
import { describe, expect, it } from 'vitest';
import {
  CoreGameStateV3Schema,
  probeDefinitionId,
  probeInstanceId,
  type CoreGameState,
} from '../../../src/schema';
import { completeRegistration } from '../../../src/rules/core/table';
import { PASS, clone, deepFreeze, rejected, tryApply } from './helpers';
import {
  ELIGIBLE,
  confirm,
  digitalSettings,
  humanOk,
  physicalGame,
  realGame,
  realGameIdWithBase,
  register,
} from './table-fixtures';

function zone(state: CoreGameState, id: string): string[] {
  return state.cards?.pile.zones.find((z) => z.id === id)?.cards ?? [];
}

describe('accepted registration', () => {
  it('TC-PH-01 + AQ-7: registered while initialSetup is still the head; base = card system; queue keeps initialSetup', () => {
    const game = physicalGame('rebels', 'rodia');
    const { state, events } = humanOk(game, register('tatooine'));
    expect(state.version).toBe(game.version + 1);
    expect(events.map((e) => e.type)).toEqual(['CARD_REGISTERED']);
    expect(events[0]).toMatchObject({
      actor: 'rebels',
      payload: { zoneId: 'rebels-location', definitionId: 'probe-tatooine' },
    });
    expect(state.rebelBase).toEqual({ systemId: 'tatooine', revealed: false });
    expect(zone(state, 'rebels-location')).toEqual([probeInstanceId('tatooine')]);
    expect(zone(state, 'probe-deck')).toHaveLength(25);
    expect(zone(state, 'probe-deck')).not.toContain(probeInstanceId('tatooine'));
    expect(state.table).toEqual({ tasks: [game.table?.tasks[0]], baseRegistration: null });
    // The registration is the human's own action: it creates no task (C-3).
    expect(state.table?.tasks.map((t) => t.id)).toEqual(['t-1-1']);
  });

  it('registering the provisional base itself keeps the units and the base', () => {
    const game = humanOk(physicalGame('rebels', 'rodia'), confirm('t-1-1')).state;
    const { state } = humanOk(game, register('rodia'));
    expect(state.rebelBase.systemId).toBe('rodia');
    expect(state.units).toEqual(game.units);
    expect(state.table).toEqual({ tasks: [], baseRegistration: null });
  });

  it('every eligible system can be registered (TC-PH-09: the eligible list = eligibleRebelBaseSystemIds)', () => {
    const game = physicalGame('rebels', 'rodia');
    expect(game.table?.baseRegistration?.eligibleSystemIds).toEqual(ELIGIBLE);
    for (const systemId of ELIGIBLE) {
      const result = tryApply(deepFreeze(game), 'rebels', register(systemId));
      expect(result.ok, systemId).toBe(true);
      if (result.ok) CoreGameStateV3Schema.parse(result.state);
    }
  });

  it('completeRegistration only touches the table', () => {
    const game = deepFreeze(physicalGame('rebels'));
    const t = completeRegistration({ state: game, drafts: [] });
    expect(t.state.table?.tasks.map((x) => x.kind)).toEqual(['initialSetup']);
    expect(t.state.table?.baseRegistration).toBeNull();
    const { table: _a, ...restAfter } = t.state;
    const { table: _b, ...restBefore } = game;
    expect(restAfter).toEqual(restBefore);
  });
});

describe('rejections in §5.5 order (state unchanged, details echo the request only)', () => {
  const echo = (systemId: string, zoneId = 'rebels-location') => ({
    zoneId,
    definitionId: probeDefinitionId(systemId),
  });

  it('409 comes first (even for a wrong actor / no table)', () => {
    const game = physicalGame('rebels');
    rejected(game, 'empire', register('nowhere'), 'errors.versionConflict', { expectedVersion: 7 });
    const digital = realGame(digitalSettings('rebels'), realGameIdWithBase('rodia', 'dig'));
    rejected(digital, 'rebels', register('tatooine'), 'errors.versionConflict', {
      expectedVersion: 7,
    });
  });

  it('TC-PH-04: no table (digital, either human side) → registrationUnavailable', () => {
    for (const human of ['rebels', 'empire'] as const) {
      const digital = realGame(digitalSettings(human), realGameIdWithBase('rodia', 'dig'));
      const error = rejected(
        digital,
        human,
        register('tatooine'),
        'errors.registrationUnavailable',
      );
      expect(error.details).toEqual(echo('tatooine'));
    }
  });

  it('TC-PH-07: the AI side or the auto origin → notYourSide', () => {
    const game = physicalGame('rebels');
    rejected(game, 'empire', register('tatooine'), 'errors.notYourSide');
    rejected(game, 'rebels', register('tatooine'), 'errors.notYourSide', { origin: 'auto' });
  });

  it('after the end of the game → gameOver (before any card check)', () => {
    const game = physicalGame('rebels');
    const over: CoreGameState = {
      ...clone(game),
      outcome: { winner: 'rebels', reason: 'timeReachedReputation' },
    };
    rejected(over, 'rebels', register('nowhere', 'empire-probes'), 'errors.gameOver');
  });

  it('TC-PH-04: human Empire (no registration expected) → registrationUnavailable; same answer for every AI base', () => {
    const answers = ['rodia', 'tatooine', 'endor'].map((base) => {
      const game = physicalGame('empire', base);
      return [
        // The same requests in every game: one of them names the base of the first game.
        rejected(game, 'empire', register('rodia'), 'errors.registrationUnavailable'),
        rejected(game, 'empire', register('ilum'), 'errors.registrationUnavailable'),
      ];
    });
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
  });

  it('wrong zone → registrationUnavailable (before the card checks)', () => {
    const game = physicalGame('rebels');
    for (const zoneId of ['empire-probes', 'probe-deck', 'rebels-base-revealed']) {
      const error = rejected(
        game,
        'rebels',
        register('nowhere', zoneId),
        'errors.registrationUnavailable',
      );
      expect(error.details).toEqual(echo('nowhere', zoneId));
    }
  });

  it('TC-PH-02: not a probe card of the catalog → unknownCard', () => {
    const game = physicalGame('rebels');
    for (const definitionId of ['probe-coruscant', 'probe-nowhere', 'rodia', 'mission-x']) {
      const error = rejected(
        game,
        'rebels',
        { type: 'REGISTER_CARD', zoneId: 'rebels-location', definitionId },
        'errors.unknownCard',
      );
      expect(error.details).toEqual({ zoneId: 'rebels-location', definitionId });
    }
  });

  it('TC-PH-02: a probe card whose system cannot hold the base → cardNotEligible', () => {
    const game = physicalGame('rebels');
    // A first-game box card, an Imperial start system, a neighbour of one, the Rebels' start system.
    for (const systemId of ['corellia', 'sullust', 'malastare', 'bothawui', 'mustafar']) {
      const error = rejected(game, 'rebels', register(systemId), 'errors.cardNotEligible');
      expect(error.details).toEqual(echo(systemId));
    }
  });

  it('TC-PH-03: a second registration → registrationUnavailable (same or other system)', () => {
    const once = humanOk(physicalGame('rebels', 'rodia'), register('tatooine')).state;
    rejected(once, 'rebels', register('tatooine'), 'errors.registrationUnavailable');
    rejected(once, 'rebels', register('rodia'), 'errors.registrationUnavailable');
  });

  it('TC-PH-05: before the registration every other Rebel command is blocked (tableSyncPending)', () => {
    const game = humanOk(physicalGame('rebels'), confirm('t-1-1')).state; // only registerBase left
    rejected(game, 'rebels', PASS, 'errors.tableSyncPending');
    rejected(
      game,
      'rebels',
      { type: 'ACTIVATE_SYSTEM', leaderId: 'leia', systemId: 'tatooine' },
      'errors.tableSyncPending',
    );
  });
});
