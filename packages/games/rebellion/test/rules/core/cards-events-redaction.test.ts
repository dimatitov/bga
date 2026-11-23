/**
 * SWR-010 W3 — redaction of the card events (plan-backend §4.1, §6, §10.1 "log" row; AC-7, AC-15):
 * `CARDS_DRAWN.definitionIds` only for the drawing side (count public), `CARD_REGISTERED.definitionId` `null`
 * while the base is hidden from the viewer, `TABLE_TASK_CONFIRMED` public. Metamorphic: the Rebels' log does
 * not depend on the Empire's probes; the Empire's log does not depend on the registered Location.
 */
import { describe, expect, it } from 'vitest';
import {
  CoreViewEventSchema,
  eligibleRebelBaseSystemIds,
  probeDefinitionId,
  type CoreGameState,
  type GameEvent,
  type RegisterCardCommand,
} from '../../../src/schema';
import { corePlayerEvents } from '../../../src/rules/core';
import { applyRegisterLocation } from '../../../src/rules/core/cards';
import { coreDataBaseV1 } from '../../../src/scenario';
import {
  DIG_REB,
  LATER,
  PHY_REB,
  containsToken,
  newGame,
  passRound,
  rounds,
} from './cards-helpers';

const ELIGIBLE = eligibleRebelBaseSystemIds(coreDataBaseV1);

function drawEvents(state: CoreGameState) {
  return state.log.filter((e) => e.type === 'CARDS_DRAWN');
}

/** A Location registration appended to the log as `finalize` would (seq + at). */
function registered(gameId: string, systemId: string): { state: CoreGameState; event: GameEvent } {
  const state = newGame(PHY_REB, gameId);
  const cmd: RegisterCardCommand = {
    type: 'REGISTER_CARD',
    zoneId: 'rebels-location',
    definitionId: probeDefinitionId(systemId),
  };
  const t = applyRegisterLocation(state, 'rebels', cmd);
  const last = state.log[state.log.length - 1]!;
  const event = { ...t.drafts[0]!, seq: last.seq + 1, at: LATER } as GameEvent;
  return {
    state: {
      ...t.state,
      version: state.version + 1,
      log: [...state.log, event] as CoreGameState['log'],
    },
    event,
  };
}

describe('CARDS_DRAWN', () => {
  const s = rounds(newGame(DIG_REB, 'red-1'), 3);

  it('the Empire sees its definition ids; the Rebels see side + count only', () => {
    const [stored] = drawEvents(s);
    expect(stored?.type === 'CARDS_DRAWN' && stored.payload.definitionIds).toHaveLength(2);
    const empire = corePlayerEvents(s.log, s, 'empire').filter((e) => e.type === 'CARDS_DRAWN');
    const rebels = corePlayerEvents(s.log, s, 'rebels').filter((e) => e.type === 'CARDS_DRAWN');
    expect(empire).toHaveLength(3);
    expect(rebels).toHaveLength(3);
    for (const [i, e] of empire.entries()) {
      const original = drawEvents(s)[i]!;
      expect(e).toEqual(original);
      expect(CoreViewEventSchema.parse(e)).toEqual(e);
    }
    for (const e of rebels) {
      expect(e).toMatchObject({
        type: 'CARDS_DRAWN',
        actor: 'system',
        payload: {
          side: 'empire',
          fromZoneId: 'probe-deck',
          toZoneId: 'empire-probes',
          count: 2,
          definitionIds: null,
        },
      });
      expect(CoreViewEventSchema.parse(e)).toEqual(e);
    }
  });

  it('the redaction does not alias the stored event (fresh payload arrays)', () => {
    const [view] = corePlayerEvents(drawEvents(s), s, 'empire');
    const [stored] = drawEvents(s);
    expect(view).not.toBe(stored);
    if (view?.type === 'CARDS_DRAWN' && stored?.type === 'CARDS_DRAWN') {
      expect(view.payload.definitionIds).not.toBe(stored.payload.definitionIds);
    }
  });

  it('metamorphic: the Rebels log is identical whatever probes the Empire drew', () => {
    const forged: CoreGameState = {
      ...s,
      log: s.log.map((e) =>
        e.type === 'CARDS_DRAWN'
          ? {
              ...e,
              payload: {
                ...e.payload,
                definitionIds: e.payload.definitionIds.map(() => 'probe-yavin'),
              },
            }
          : e,
      ) as CoreGameState['log'],
    };
    expect(JSON.stringify(corePlayerEvents(forged.log, forged, 'rebels'))).toBe(
      JSON.stringify(corePlayerEvents(s.log, s, 'rebels')),
    );
    const json = JSON.stringify(corePlayerEvents(s.log, s, 'rebels'));
    for (const e of drawEvents(s)) {
      if (e.type === 'CARDS_DRAWN')
        for (const id of e.payload.definitionIds) expect(containsToken(json, id)).toBe(false);
    }
  });

  it('the count stays public after the end of the game; ids stay hidden from the Rebels (forever in v0)', () => {
    const final = rounds(newGame(DIG_REB, 'red-2'), 13);
    expect(final.outcome).not.toBeNull();
    for (const e of corePlayerEvents(final.log, final, 'rebels')) {
      if (e.type === 'CARDS_DRAWN') expect(e.payload.definitionIds).toBeNull();
    }
  });

  it('command events (the response channel) are redacted the same way', () => {
    const { state, events } = passRound(newGame(DIG_REB, 'red-3'));
    const view = corePlayerEvents(events, state, 'rebels').find((e) => e.type === 'CARDS_DRAWN');
    expect(view).toMatchObject({ payload: { count: 2, definitionIds: null } });
  });
});

describe('CARD_REGISTERED', () => {
  it('the Rebels (owner) see the card; the Empire gets null while the base is hidden', () => {
    const target = ELIGIBLE[2]!;
    const { state, event } = registered('red-4', target);
    const [rebels] = corePlayerEvents([event], state, 'rebels');
    const [empire] = corePlayerEvents([event], state, 'empire');
    expect(rebels).toEqual(event);
    expect(empire).toEqual({
      ...event,
      payload: { zoneId: 'rebels-location', definitionId: null },
    });
    expect(CoreViewEventSchema.parse(empire)).toEqual(empire);
  });

  it('metamorphic (S5): the Empire log is identical whichever system the Rebels registered', () => {
    const logs = ELIGIBLE.map((systemId) => {
      const { state } = registered('red-5', systemId);
      return JSON.stringify(corePlayerEvents(state.log, state, 'empire'));
    });
    for (const [i, json] of logs.entries()) {
      expect(json, ELIGIBLE[i]).toBe(logs[0]);
      expect(containsToken(json, probeDefinitionId(ELIGIBLE[i]!))).toBe(false);
    }
  });

  it('after the reveal / the end of the game the Empire sees the registered card', () => {
    const { state, event } = registered('red-6', ELIGIBLE[0]!);
    const ended: CoreGameState = {
      ...state,
      outcome: { winner: 'rebels', reason: 'timeReachedReputation' },
    };
    expect(corePlayerEvents([event], ended, 'empire')[0]).toEqual(event);
  });
});

describe('TABLE_TASK_CONFIRMED', () => {
  it('is public (copied as is for both sides)', () => {
    const state = newGame(PHY_REB, 'red-7');
    const event = {
      seq: 4,
      type: 'TABLE_TASK_CONFIRMED',
      actor: 'rebels',
      payload: { taskId: 't-1-1', kind: 'initialSetup' },
      at: LATER,
    } as GameEvent;
    for (const viewer of ['rebels', 'empire'] as const) {
      const [view] = corePlayerEvents([event], state, viewer);
      expect(view).toEqual(event);
      expect(view).not.toBe(event);
    }
  });
});
