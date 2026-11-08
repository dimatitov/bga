/**
 * Property test (plan-backend §7 W3 `invariants.test.ts`, TC-U-04, TC-U-20): seeded random LEGAL command
 * sequences (PRNG only in the test) keep every stored state valid (`CoreGameStateV3Schema` incl. the core
 * invariants), `version + 1` per command, consecutive `seq`, constant reputation and unit counts, time
 * advancing only in the refresh; inputs are never mutated. AI games run a stand-in of the server's
 * auto-pass loop (W5) so that only states the server would store are parsed.
 */
import { describe, expect, it } from 'vitest';
import {
  CoreGameStateV3Schema,
  CorePlayerViewSchema,
  CoreViewEventSchema,
  type CoreGameState,
} from '../../../src/schema';
import { getLegalActions, toPlayerView, toSideView } from '../../../src/rules';
import {
  EMPIRE_VS_AI,
  FINISH,
  HOT_SEAT,
  PASS,
  REBELS_VS_AI,
  clone,
  deepFreeze,
  mulberry32,
  newCore,
  randomStep,
  tryApply,
} from './helpers';

/** Stand-in of the server's auto-pass (W5): PASS if legal, else FINISH_ACTIVATION. */
function autoPlay(state: CoreGameState): CoreGameState {
  let current = state;
  const ai = state.settings.opponentType === 'ai' ? state.settings.opponentFaction : null;
  for (let i = 0; ai !== null && current.outcome === null && current.activeSide === ai; i += 1) {
    if (i > 16) throw new Error('auto-play did not terminate');
    const types = getLegalActions(current, ai).map((a) => a.type);
    const command = types.includes('PASS') ? PASS : FINISH;
    const result = tryApply(current, ai, command, { origin: 'auto' });
    if (!result.ok) throw new Error(`auto move rejected: ${result.error.messageKey}`);
    expect(result.state.version).toBe(current.version + 1);
    current = result.state;
  }
  return current;
}

function counts(state: CoreGameState) {
  return {
    rebels: state.units.filter((u) => u.owner === 'rebels').length,
    empire: state.units.filter((u) => u.owner === 'empire').length,
  };
}

function checkStored(state: CoreGameState): void {
  expect(() => CoreGameStateV3Schema.parse(state)).not.toThrow();
  expect(state.log.map((e) => e.seq)).toEqual(state.log.map((_, i) => i + 1));
  const view = toPlayerView(state, state.outcome ? 'completed' : 'prototype');
  if (view.kind === 'player') CorePlayerViewSchema.parse(view);
  for (const viewer of ['rebels', 'empire'] as const) {
    const side = toSideView(state, viewer);
    CorePlayerViewSchema.parse(side);
    for (const e of side.log) CoreViewEventSchema.parse(e);
  }
}

describe('invariants on seeded random legal play', () => {
  for (const [name, settings] of [
    ['hot-seat', HOT_SEAT],
    ['Rebels vs AI', REBELS_VS_AI],
    ['Empire vs AI', EMPIRE_VS_AI],
  ] as const) {
    it(`${name}: 10 games × up to 250 commands`, () => {
      let rounds = 0;
      let commands = 0;
      let finished = 0;
      for (let seed = 1; seed <= 10; seed += 1) {
        const rng = mulberry32(seed * 2_654_435_761);
        let state = autoPlay(newCore(settings, `inv-${name}-${seed}`));
        checkStored(state);
        const initial = counts(state);
        const reputation = state.reputation;
        for (let step = 0; step < 250 && state.outcome === null; step += 1) {
          const before = deepFreeze(state);
          const snapshot = clone(before);
          // Higher pass bias later in the game to reach the Rebel victory by time.
          const next = randomStep(before, rng, seed % 2 === 0 ? 0.6 : 0.2);
          commands += 1;
          expect(before).toEqual(snapshot);
          expect(next.state.version).toBe(before.version + 1);
          expect(next.events.map((e) => e.seq)).toEqual(
            next.events.map((_, i) => before.log.length + i + 1),
          );
          const advanced = next.events.filter((e) => e.type === 'TIME_ADVANCED').length;
          expect(next.state.round).toBe(before.round + advanced);
          if (advanced > 0) rounds += 1;
          state = autoPlay(next.state);
          expect(state.reputation).toBe(reputation);
          expect(counts(state)).toEqual(initial);
          checkStored(state);
        }
        if (state.outcome !== null) {
          finished += 1;
          expect(getLegalActions(state, 'rebels')).toEqual([]);
          expect(getLegalActions(state, 'empire')).toEqual([]);
          expect(state.handoffPending).toBe(false);
        }
      }
      expect(commands).toBeGreaterThan(150);
      expect(rounds).toBeGreaterThan(10);
      expect(finished).toBeGreaterThan(0);
    });
  }
});
