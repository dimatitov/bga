/**
 * SWR-005 CODE_REVIEW #1 (Analyst decision, R-10 / D-6 / AC-10): the Empire's view at creation must not depend
 * on where the rebel base is. For EVERY eligible base system of the real base-game data the initial Empire view
 * (rules level `toSideView(createCoreGame(...), 'empire')` for every opponent setting, and the server module
 * create path for Empire vs AI Rebels: view + initial events) is byte-identical once the only field that
 * legitimately differs — the session id (`id`) — is removed. The base is forced by choosing, per candidate, a
 * session id that `chooseRebelBase` maps to it. A system with public starting Rebel units as a candidate (the
 * former Bothawui case: its units "vanish" into the hidden zone) breaks this test.
 */
import { describe, expect, it } from 'vitest';
import { chooseRebelBase, createCoreGame, toSideView } from '../../src/rules';
import { coreDataBaseV1 } from '../../src/scenario';
import {
  CoreGameStateV3Schema,
  PlayerViewSchema,
  eligibleRebelBaseSystemIds,
  toStoredSetup,
  type RebellionSettings,
} from '../../src/schema';
import { rebellionServerModule } from '../../src/server';
import { EMPIRE_VS_AI, HOT_SEAT, NOW, REBELS_VS_AI } from './core-script';

const ELIGIBLE = eligibleRebelBaseSystemIds(coreDataBaseV1);

/** A deterministic session id whose base is `base` (searched over `inv-0…`). */
function sessionIdWithBase(base: string): string {
  for (let i = 0; i < 10_000; i += 1) {
    const id = `inv-${i}`;
    if (chooseRebelBase(id, ELIGIBLE) === base) return id;
  }
  throw new Error(`no session id for base ${base}`);
}

const IDS = ELIGIBLE.map((base) => [base, sessionIdWithBase(base)] as const);

/** JSON of a view without its session id (the only field allowed to differ). */
function withoutId(view: { id: string }): string {
  const { id, ...rest } = view;
  expect(id).toEqual(expect.any(String));
  return JSON.stringify(rest);
}

/** No event of the creation log may carry the session id; JSON for comparison. */
function eventsJson(events: readonly unknown[]): string {
  return JSON.stringify(events);
}

describe('Empire view at creation is invariant to the base choice (CODE_REVIEW #1)', () => {
  it('9 candidates on the first-game setup; none holds a starting Rebel unit placed in a system', () => {
    expect(ELIGIBLE).toHaveLength(9);
    expect(ELIGIBLE).not.toContain('bothawui');
    const rebelSystems = new Set(
      coreDataBaseV1.startSetup.units.flatMap((u) =>
        u.at.kind === 'system' && u.typeKey.startsWith('unit.rebels.') ? [u.at.systemId] : [],
      ),
    );
    expect(rebelSystems.size).toBeGreaterThan(0);
    for (const base of ELIGIBLE) expect(rebelSystems.has(base), base).toBe(false);
  });

  it.each<[string, RebellionSettings]>([
    ['hot-seat', HOT_SEAT],
    ['Rebels vs AI Empire', REBELS_VS_AI],
    ['Empire vs AI Rebels', EMPIRE_VS_AI],
  ])(
    'rules level (%s): toSideView(createCoreGame(...), "empire") is identical for every base',
    (_, settings) => {
      const views = IDS.map(([base, gameId]) => {
        const state = createCoreGame(settings, coreDataBaseV1, { gameId, now: NOW });
        expect(state.rebelBase.systemId).toBe(base);
        const view = toSideView(state, 'empire');
        expect(view.id).toBe(gameId);
        return withoutId(view);
      });
      for (const [i, json] of views.entries()) expect(json, IDS[i]?.[0]).toBe(views[0]);
    },
  );

  it('server module create path (Empire vs AI Rebels): player view and initial events identical for every base', () => {
    const setup = toStoredSetup(EMPIRE_VS_AI);
    const results = IDS.map(([base, sessionId]) => {
      // The module is typed as the game-independent `ServerGameModule` (unknown state): parse like the API.
      const created = rebellionServerModule.createInitialState(setup, { sessionId, now: NOW });
      const state = CoreGameStateV3Schema.parse(created.state);
      expect(state.rebelBase.systemId).toBe(base);
      const status = rebellionServerModule.statusOf(created.state);
      const view = PlayerViewSchema.parse(
        rebellionServerModule.toPlayerView(created.state, { status }),
      );
      if (view.kind !== 'player') throw new Error('expected the Empire board at creation');
      expect(view.viewer).toBe('empire');
      const events = rebellionServerModule.toPlayerEvents(created.events, created.state);
      const eventJson = eventsJson(events);
      expect(eventJson).not.toContain(sessionId);
      expect(eventJson).not.toContain(base);
      return { view: withoutId(view), events: eventJson };
    });
    for (const [i, r] of results.entries()) {
      expect(r.view, IDS[i]?.[0]).toBe(results[0]?.view);
      expect(r.events, IDS[i]?.[0]).toBe(results[0]?.events);
    }
  });
});
