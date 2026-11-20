/**
 * View model of the bot (SWR-006 plan-backend §4.3): everything derived from one CorePlayerView.
 */
import { describe, expect, it } from 'vitest';
import { buildViewModel, enumerateCandidates } from '../../src/ai';
import { toSideView } from '../../src/rules';
import type { BotCandidate } from '../../src/ai';
import { aiGameSettings, newGame, step } from './fixtures/walk';

const act = (leaderId: string, systemId: string): BotCandidate => ({
  key: `A|${leaderId}|${systemId}`,
  kind: 'activate',
  command: { type: 'ACTIVATE_SYSTEM', leaderId, systemId },
  systemId,
});

describe('buildViewModel', () => {
  it('Empire at creation: own forces per system, hidden Rebel units only counted', () => {
    const state = newGame(aiGameSettings('empire', 'normal'), 'vm-1');
    const model = buildViewModel(toSideView(state, 'empire'));
    expect(model.viewer).toBe('empire');
    expect(model.opponent).toBe('rebels');
    expect(model.systemIds).toHaveLength(32);
    // Coruscant (start setup): SD + AC + 2 TIE + 3 stormtroopers + AT-AT + AT-ST
    expect(model.forcesOf('own', 'coruscant')).toEqual({
      units: 9,
      ground: 5,
      ships: 4,
      capacity: 10,
      mobileGround: 5,
    });
    // Bothawui: visible Rebel fleet (corvette 2 + transport 4)
    expect(model.forcesOf('enemy', 'bothawui')).toMatchObject({ capacity: 6, mobileGround: 4 });
    expect(model.hiddenEnemyUnits).toBe(6);
    expect(model.enemyUnitsBySystem.has(state.rebelBase.systemId)).toBe(false);
    expect(model.forcesOf('own', 'hoth')).toEqual({
      units: 0,
      ground: 0,
      ships: 0,
      capacity: 0,
      mobileGround: 0,
    });
    expect(model.ownPoolLeaders.map((l) => l.id)).toEqual([
      'palpatine',
      'vader',
      'tarkin',
      'tagge',
    ]);
    expect(model.ownMapLeaders).toEqual([]);
    expect(model.activation).toBeNull();
    expect(model.activationsThisRound).toBe(0);
  });

  it('distances are symmetric BFS jumps; unknown systems are unreachable', () => {
    const model = buildViewModel(
      toSideView(newGame(aiGameSettings('empire', 'easy'), 'vm-2'), 'empire'),
    );
    for (const a of model.systemIds) {
      expect(model.distance(a, a)).toBe(0);
      for (const b of model.adjacency.get(a) ?? []) expect(model.distance(a, b)).toBe(1);
    }
    for (const a of model.systemIds.slice(0, 8)) {
      for (const b of model.systemIds) expect(model.distance(a, b)).toBe(model.distance(b, a));
    }
    expect(model.distance('coruscant', 'nowhere')).toBe(Infinity);
  });

  it('deliverableGround: Σ min(ground, capacity) over unpinned adjacent sources', () => {
    const state = newGame(aiGameSettings('empire', 'normal'), 'vm-3');
    const model = buildViewModel(toSideView(state, 'empire'));
    const target = model.adjacency.get('coruscant')?.[0];
    if (!target) throw new Error('coruscant has neighbours');
    let expected = 0;
    for (const source of model.adjacency.get(target) ?? []) {
      const f = model.forcesOf('own', source);
      expected += Math.min(f.mobileGround, f.capacity);
    }
    expect(expected).toBeGreaterThan(0);
    expect(model.deliverableGround(target)).toBe(expected);
  });

  it('own activation, pinned systems and moves made in it come from the view and its log', () => {
    // AI Rebels move first; activate a system next to Bothawui and move into it.
    let state = newGame(aiGameSettings('rebels', 'normal'), 'vm-4');
    const target = buildViewModel(toSideView(state, 'rebels')).adjacency.get('bothawui')?.[0];
    if (!target) throw new Error('bothawui has neighbours');
    state = step(state, act('leia', target));
    let model = buildViewModel(toSideView(state, 'rebels'));
    expect(model.activation).toEqual({ leaderId: 'leia', systemId: target, moves: 0 });
    expect(model.pinnedSystems).toEqual(new Set([target]));
    expect(model.activationsThisRound).toBe(1);
    const move = enumerateCandidates(toSideView(state, 'rebels')).find((c) => c.kind === 'move');
    if (!move) throw new Error('a move from Bothawui exists');
    state = step(state, move);
    model = buildViewModel(toSideView(state, 'rebels'));
    expect(model.activation?.moves).toBe(1);
    // The Empire sees the Rebel activation but it is not its own.
    expect(buildViewModel(toSideView(state, 'empire')).activation).toBeNull();
  });
});
