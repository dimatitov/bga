/**
 * Empire's knowledge of the hidden base (SWR-006 BD-2, plan-backend §4.4; Clarifications Q-BE-4, Q-BE-5):
 * only from the Empire's own view; sound (the true base is never excluded) and invariant to the base location.
 */
import { describe, expect, it } from 'vitest';
import { deriveBaseIntel, possibleBaseSystems, type BotCandidate } from '../../src/ai';
import { toSideView } from '../../src/rules';
import type { CoreGameState, Difficulty } from '../../src/schema';
import { relocateBase } from './fixtures/relocate-base';
import { aiGameSettings, newGame, step, walk } from './fixtures/walk';

const act = (leaderId: string, systemId: string): BotCandidate => ({
  key: `A|${leaderId}|${systemId}`,
  kind: 'activate',
  command: { type: 'ACTIVATE_SYSTEM', leaderId, systemId },
  systemId,
});
const mv = (pieceIds: string[], fromSystemId: string, toSystemId: string): BotCandidate => ({
  key: `M|${fromSystemId}>${toSystemId}|${pieceIds.join(',')}`,
  kind: 'move',
  command: { type: 'MOVE_PIECES', pieceIds, fromSystemId, toSystemId },
  systemId: toSystemId,
});
const FINISH: BotCandidate = {
  key: 'F',
  kind: 'finish',
  command: { type: 'FINISH_ACTIVATION' },
  systemId: null,
};
const PASS: BotCandidate = { key: 'P', kind: 'pass', command: { type: 'PASS' }, systemId: null };

const adjacent = (state: CoreGameState, id: string) =>
  state.map.systems.find((s) => s.id === id)?.adjacentSystemIds ?? [];

describe('deriveBaseIntel — fixed states', () => {
  it('at creation: visible Rebel systems excluded, nothing searched, the hidden zone counted', () => {
    const state = newGame(aiGameSettings('empire', 'hard'), 'intel-1');
    const intel = deriveBaseIntel(toSideView(state, 'empire'));
    expect(intel.knownBaseId).toBeNull();
    expect([...intel.excluded]).toEqual(['bothawui']);
    expect(intel.searched.size).toBe(0);
    expect(intel.hintWeight.size).toBe(0);
    expect(intel.hiddenRebelUnits).toBe(6);
    // R-10 (public first-game rule): starting Imperial systems and their neighbours.
    for (const id of ['coruscant', 'mandalore', 'saleucami', 'sullust', 'corellia', 'mustafar']) {
      expect(intel.startRuleExcluded.has(id), id).toBe(true);
      for (const n of adjacent(state, id)) expect(intel.startRuleExcluded.has(n), n).toBe(true);
    }
    expect(intel.startRuleExcluded.has(state.rebelBase.systemId)).toBe(false);
  });

  it('throws for the Rebels (they know their base)', () => {
    const state = newGame(aiGameSettings('rebels', 'normal'), 'intel-2');
    expect(() => deriveBaseIntel(toSideView(state, 'rebels'))).toThrow(/only the Empire/);
  });

  it('searched: an Imperial activation that ends with an Imperial ground unit in it and no reveal', () => {
    // Human Rebels pass; AI Empire activates a Coruscant neighbour that is not the base and brings troops.
    let state = newGame(aiGameSettings('empire', 'normal'), 'intel-3');
    const base = state.rebelBase.systemId;
    const target = adjacent(state, 'coruscant').find((id) => id !== base);
    const empty = state.map.systems.find(
      (s) => s.id !== base && s.id !== target && !state.units.some((u) => u.systemId === s.id),
    )?.id;
    if (!target || !empty) throw new Error('fixture systems');
    state = step(state, PASS);
    state = step(state, act('vader', target));
    const groundAndCarrier = state.units
      .filter((u) => u.systemId === 'coruscant' && /star-destroyer|stormtrooper/.test(u.typeKey))
      .map((u) => u.id);
    state = step(state, mv(groundAndCarrier, 'coruscant', target));
    state = step(state, FINISH);
    // An activation without a ground unit searches nothing.
    state = step(state, act('tarkin', empty));
    state = step(state, FINISH);
    const intel = deriveBaseIntel(toSideView(state, 'empire'));
    expect([...intel.searched]).toEqual([target]);
    expect(intel.searched.has(empty)).toBe(false);
    expect(intel.searched.has(base)).toBe(false);
  });

  it('hints (Q-BE-5): Rebel moves out of / into the hidden zone point at the neighbours of the visible end', () => {
    // Human Empire passes; AI Rebels move an x-wing out of the base and back.
    let state = newGame(aiGameSettings('rebels', 'easy'), 'intel-4');
    const base = state.rebelBase.systemId;
    const out = adjacent(state, base).find(
      (id) => !state.units.some((u) => u.systemId === id && u.owner === 'empire'),
    );
    const xwing = state.units.find(
      (u) => u.systemId === base && u.typeKey === 'unit.rebels.x-wing',
    )?.id;
    if (!out || !xwing) throw new Error('fixture');
    state = step(state, act('leia', out));
    state = step(state, mv([xwing], base, out));
    state = step(state, FINISH);
    let intel = deriveBaseIntel(toSideView(state, 'empire'));
    expect(intel.excluded.has(out)).toBe(true);
    for (const n of adjacent(state, out)) expect(intel.hintWeight.get(n), n).toBe(2);
    expect(intel.hintWeight.get(base)).toBe(2);
    // ... and back into the base (from `out`, a visible system) → +2 again around `out`.
    state = step(state, PASS); // Empire
    state = step(state, PASS); // Rebels → round 2, leaders back (no pin on `out`)
    expect(state.round).toBe(2);
    state = step(state, act('dodonna', base));
    state = step(state, mv([xwing], out, base));
    state = step(state, FINISH);
    intel = deriveBaseIntel(toSideView(state, 'empire'));
    expect(intel.hintWeight.get(base)).toBe(4);
    expect(intel.excluded.has(base)).toBe(false);
    const weights = possibleBaseSystems(toSideView(state, 'empire'), intel, {
      useHints: true,
      useStartRule: true,
    });
    expect(weights.get(base)).toBe(5);
    expect(
      possibleBaseSystems(toSideView(state, 'empire'), intel, {
        useHints: false,
        useStartRule: false,
      }).get(base),
    ).toBe(1);
  });

  it('after the reveal the base is known and every other system is excluded', () => {
    const state = newGame(aiGameSettings('empire', 'normal'), 'intel-5');
    const revealed: CoreGameState = { ...state, rebelBase: { ...state.rebelBase, revealed: true } };
    const view = toSideView(revealed, 'empire');
    const intel = deriveBaseIntel(view);
    expect(intel.knownBaseId).toBe(state.rebelBase.systemId);
    expect(intel.excluded.size).toBe(31);
    expect(intel.excluded.has(state.rebelBase.systemId)).toBe(false);
    expect([...possibleBaseSystems(view, intel, { useHints: true, useStartRule: true })]).toEqual([
      [state.rebelBase.systemId, 1],
    ]);
  });
});

describe('deriveBaseIntel — random-walk games', () => {
  const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

  it('sound: the true base is never excluded, searched or start-rule-excluded before the reveal', () => {
    let checked = 0;
    for (const difficulty of DIFFICULTIES) {
      for (const seed of ['swr006-d01', 'swr006-d02', 'swr006-d03', 'swr006-d04']) {
        for (const state of walk(aiGameSettings('empire', difficulty), `${seed}-${difficulty}`)) {
          if (state.rebelBase.revealed || state.outcome !== null) continue;
          const intel = deriveBaseIntel(toSideView(state, 'empire'));
          const base = state.rebelBase.systemId;
          expect(intel.excluded.has(base)).toBe(false);
          expect(intel.searched.has(base)).toBe(false);
          expect(intel.startRuleExcluded.has(base)).toBe(false);
          for (const options of [
            { useHints: false, useStartRule: false },
            { useHints: true, useStartRule: true },
          ]) {
            expect(possibleBaseSystems(toSideView(state, 'empire'), intel, options).has(base)).toBe(
              true,
            );
          }
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  }, 60_000);

  it('invariant: states differing only in the hidden base give the same intel', () => {
    let compared = 0;
    for (const seed of ['swr006-d05', 'swr006-d06']) {
      const states = walk(aiGameSettings('rebels', 'easy'), seed);
      for (const state of states.filter((_, i) => i % 5 === 0)) {
        if (state.rebelBase.revealed || state.outcome !== null) continue;
        const expected = deriveBaseIntel(toSideView(state, 'empire'));
        for (const system of state.map.systems) {
          const moved = relocateBase(state, system.id);
          if (!moved) continue;
          expect(deriveBaseIntel(toSideView(moved, 'empire'))).toEqual(expected);
          compared += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(100);
  }, 60_000);
});
