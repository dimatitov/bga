/** `core-v1` board projection shape (plan-backend §8.2 / `CorePlayerViewSchema`) and the session view choice. */
import { describe, expect, it } from 'vitest';
import { CorePlayerViewSchema } from '../../../src/schema';
import { toPlayerEvents, toPlayerView, toSideView } from '../../../src/rules';
import { miniData } from './fixtures/mini-data';
import { PASS, REBELS_VS_AI, activate, newCore, ok, scenario } from './helpers';

describe('core-v1 player view', () => {
  it('public data, markers, pools, passed, legal actions; strict schema', () => {
    const state = ok(
      scenario({ base: 'zeta', leadersAt: { vader: 'alpha' } }),
      'rebels',
      activate('leia', 'delta'),
    ).state;
    const view = CorePlayerViewSchema.parse(toSideView(state, 'rebels'));
    const data = miniData();
    expect(view).toMatchObject({
      kind: 'player',
      rulesEngine: 'core-v1',
      viewer: 'rebels',
      activeSide: 'rebels',
      id: state.id,
      version: 2,
      round: 1,
      phase: 'command',
      markers: { time: 1, reputation: 14 },
      passed: { rebels: false, empire: false },
      rebelBase: { systemId: 'zeta', revealed: false },
      outcome: null,
      activation: {
        side: 'rebels',
        leaderId: 'leia',
        location: { kind: 'system', systemId: 'delta' },
      },
    });
    expect(view.map.regions).toEqual(
      data.regions.map((r) => ({ id: r.id, nameKey: `regions.${r.id}` })),
    );
    expect(view.map.systems[0]).toEqual({
      id: 'alpha',
      nameKey: 'systems.alpha',
      regionId: 'r1',
      adjacentSystemIds: ['beta', 'gamma'],
      remote: false,
    });
    expect(view.unitTypes).toEqual(data.unitTypes);
    expect(view.leaders.find((l) => l.id === 'vader')?.location).toEqual({
      kind: 'system',
      systemId: 'alpha',
    });
    expect(view.leaders.find((l) => l.id === 'mothma')).toEqual({
      id: 'mothma',
      owner: 'rebels',
      canActivate: false,
      location: { kind: 'pool' },
    });
    expect(view.legalActions.at(-1)).toEqual({ type: 'FINISH_ACTIVATION' });
    expect(toSideView(state, 'empire').legalActions).toEqual([]);
  });

  it('the view never shares objects with the state', () => {
    const state = newCore();
    const view = toSideView(state, 'rebels');
    view.map.systems[0]?.adjacentSystemIds.push('x');
    view.settings.playerFaction = 'empire';
    expect(state.map.systems[0]?.adjacentSystemIds).not.toContain('x');
    expect(state.settings.playerFaction).toBe('rebels');
  });

  it('session view: the active side, handoff screen while pending; AI game always the player', () => {
    const passed = ok(scenario(), 'rebels', PASS);
    expect(toPlayerView(passed.state, 'prototype').kind).toBe('handoff');
    expect(toPlayerEvents(passed.events, passed.state)).toEqual([]);
    const ai = scenario({ settings: REBELS_VS_AI });
    const view = toPlayerView(ai, 'prototype');
    expect(view.kind === 'player' ? view.viewer : null).toBe('rebels');
  });
});
