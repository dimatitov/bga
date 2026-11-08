/** R-1, R-2, R-10, D-6, D-7 — `createCoreGame` (TC-U-01, TC-U-02, TC-D-12, TC-D-15 on synthetic data). */
import { describe, expect, it } from 'vitest';
import { CoreGameStateV3Schema, eligibleRebelBaseSystemIds } from '../../../src/schema';
import { chooseRebelBase, createCoreGame } from '../../../src/rules';
import { ELIGIBLE_BASES, miniData } from './fixtures/mini-data';
import { EMPIRE_VS_AI, HOT_SEAT, NOW, REBELS_VS_AI, deepFreeze, newCore } from './helpers';

describe('createCoreGame', () => {
  it('starts in the command phase of round 1 with the Rebels to act (TC-U-01)', () => {
    const state = newCore();
    expect(state).toMatchObject({
      schemaVersion: 3,
      rulesEngine: 'core-v1',
      id: 'core-game-1',
      version: 1,
      scenarioId: 'mini-core-v1',
      round: 1,
      reputation: 14,
      phase: 'command',
      activeSide: 'rebels',
      handoffPending: false,
      passed: { rebels: false, empire: false },
      activation: null,
      outcome: null,
    });
    expect(state.leaders.map((l) => [l.id, l.owner, l.canActivate, l.systemId])).toEqual([
      ['palpatine', 'empire', true, null],
      ['vader', 'empire', true, null],
      ['tarkin', 'empire', true, null],
      ['tagge', 'empire', true, null],
      ['mothma', 'rebels', false, null],
      ['leia', 'rebels', true, null],
      ['dodonna', 'rebels', true, null],
      ['rieekan', 'rebels', true, null],
    ]);
    expect(CoreGameStateV3Schema.parse(state)).toEqual(state);
  });

  it('the assignment phase passes automatically: GAME_CREATED → PHASE_STARTED ×2 (TC-U-02)', () => {
    expect(newCore().log).toEqual([
      {
        seq: 1,
        type: 'GAME_CREATED',
        actor: 'system',
        payload: { scenarioId: 'mini-core-v1' },
        at: NOW,
      },
      {
        seq: 2,
        type: 'PHASE_STARTED',
        actor: 'system',
        payload: { round: 1, phase: 'assignment' },
        at: NOW,
      },
      {
        seq: 3,
        type: 'PHASE_STARTED',
        actor: 'system',
        payload: { round: 1, phase: 'command' },
        at: NOW,
      },
    ]);
  });

  it('copies the static data and only the starting leaders (BD-2, D-7)', () => {
    const data = miniData();
    const state = newCore();
    expect(state.map).toEqual({ regions: data.regions, systems: data.systems });
    expect(state.unitTypes).toEqual(data.unitTypes);
    expect(state.leaders.map((l) => l.id)).not.toContain('ackbar');
  });

  it('unit ids follow the data order and never depend on the base; base units stand in the base (D-6)', () => {
    const data = miniData();
    const games = ['g-a', 'g-b', 'g-c', 'g-d', 'g-e', 'g-f'].map((id) => newCore(HOT_SEAT, id));
    const bases = new Set(games.map((g) => g.rebelBase.systemId));
    expect(bases.size).toBeGreaterThan(1);
    for (const game of games) {
      const base = game.rebelBase.systemId;
      expect(game.units.map((u) => [u.id, u.typeKey])).toEqual(
        data.startSetup.units.map((u, i) => [`u-${String(i + 1).padStart(2, '0')}`, u.typeKey]),
      );
      data.startSetup.units.forEach((u, i) => {
        expect(game.units[i]?.systemId).toBe(u.at.kind === 'system' ? u.at.systemId : base);
      });
    }
  });

  it('base = chooseRebelBase(gameId, eligible) among eligible systems; no Imperial unit in or next to it', () => {
    const data = miniData();
    expect(eligibleRebelBaseSystemIds(data)).toEqual([...ELIGIBLE_BASES]);
    for (let i = 0; i < 50; i += 1) {
      const id = `session-${i}`;
      const state = newCore(HOT_SEAT, id);
      const base = state.rebelBase.systemId;
      expect(base).toBe(chooseRebelBase(id, ELIGIBLE_BASES));
      expect(state.rebelBase.revealed).toBe(false);
      const near = new Set([
        base,
        ...(data.systems.find((s) => s.id === base)?.adjacentSystemIds ?? []),
      ]);
      expect(state.units.filter((u) => u.owner === 'empire' && near.has(u.systemId))).toEqual([]);
    }
  });

  it('is deterministic: same gameId and now → identical state and JSON (Q-24)', () => {
    const a = newCore(HOT_SEAT, 'same-id');
    const b = newCore(HOT_SEAT, 'same-id');
    expect(a).toStrictEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('never mutates or shares its inputs', () => {
    const data = deepFreeze(miniData());
    const settings = deepFreeze({ ...REBELS_VS_AI });
    const state = createCoreGame(settings, data, { gameId: 'x', now: NOW });
    expect(state.map.systems).not.toBe(data.systems);
    expect(state.settings).not.toBe(settings);
    state.map.systems[0]?.adjacentSystemIds.push('nowhere');
    expect(data.systems[0]?.adjacentSystemIds).not.toContain('nowhere');
  });

  it('Rebels act first also when the AI plays the Rebels (transient, the server auto-plays them)', () => {
    const state = newCore(EMPIRE_VS_AI);
    expect(state.activeSide).toBe('rebels');
    expect(state.settings.playerFaction).toBe('empire');
  });

  it('invalid data or settings throw (programming error)', () => {
    const broken = miniData();
    broken.systems[0]!.adjacentSystemIds = ['nowhere'];
    expect(() => createCoreGame(HOT_SEAT, broken, { gameId: 'x', now: NOW })).toThrow();
    expect(() =>
      createCoreGame({ ...HOT_SEAT, playerFaction: 'jedi' as never }, miniData(), {
        gameId: 'x',
        now: NOW,
      }),
    ).toThrow();
  });
});
