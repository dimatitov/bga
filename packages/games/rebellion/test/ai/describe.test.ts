/**
 * Texts for the model (SWR-006 D-PO-1, plan-backend §4.6; TC-BOT-08): English, ASCII, within limits,
 * deterministic, from the actor's own view only (no `view.id`, no version); invariant to the hidden base.
 */
import { describe, expect, it } from 'vitest';
import {
  DESCRIBE_LIMITS,
  buildViewModel,
  clip,
  deriveBaseIntel,
  enumerateCandidates,
  objectiveFor,
  situationFor,
  summaryFor,
} from '../../src/ai';
import { toSideView } from '../../src/rules';
import type { CoreGameState, CorePlayerView } from '../../src/schema';
import { relocateBase } from './fixtures/relocate-base';
import { aiGameSettings, newGame, walk } from './fixtures/walk';

const ASCII = /^[\x20-\x7e\n]*$/;

function situation(view: CorePlayerView): string {
  return situationFor(view, view.viewer === 'empire' ? deriveBaseIntel(view) : null);
}

describe('objectiveFor', () => {
  it('per side, ASCII, ≤ 300', () => {
    const state = newGame(aiGameSettings('empire', 'normal'), 'desc-1');
    const empire = objectiveFor(toSideView(state, 'empire'));
    const rebels = objectiveFor(toSideView(state, 'rebels'));
    expect(empire).toMatch(/^Find the hidden Rebel base/);
    expect(rebels).toMatch(/^Survive until the time marker reaches reputation/);
    for (const text of [empire, rebels]) {
      expect(text.length).toBeLessThanOrEqual(DESCRIBE_LIMITS.objective);
      expect(text).toMatch(ASCII);
      expect(text.endsWith('...')).toBe(false);
    }
  });
});

describe('situationFor', () => {
  it('Empire at creation: round, markers, own forces, unknown base, hidden zone; no id / version', () => {
    const state = newGame(aiGameSettings('empire', 'normal'), 'desc-session-2');
    const view = toSideView(state, 'empire');
    const text = situation(view);
    expect(text).toContain('You play the Empire (game difficulty setting: normal).');
    // Review F-8: never phrased as the bot's strength (would read as "play weakly" to the model).
    expect(text).not.toContain('bot difficulty');
    expect(text).toContain('Round 1, phase command. Time 1, reputation 14');
    expect(text).toContain('Rebel base: unknown.');
    expect(text).toContain('Searched systems (not the base): none.');
    expect(text).toMatch(/Possible base locations \(\d+\): /);
    expect(text).toContain('coruscant: 5 ground, 4 ships, capacity 10');
    expect(text).toContain('Visible Rebel forces: bothawui:');
    expect(text).toContain('Rebel units in the hidden zone: 6.');
    expect(text).toContain('Current activation: none.');
    expect(text).not.toContain('desc-session-2');
    expect(text).not.toMatch(/version/i);
    expect(text).toMatch(ASCII);
    expect(text.length).toBeLessThanOrEqual(DESCRIBE_LIMITS.situation);
    expect(situation(view)).toBe(text);
  });

  it('easy Empire does not list possible base locations; Rebels see their own base', () => {
    const easy = newGame(aiGameSettings('empire', 'easy'), 'desc-3');
    expect(situation(toSideView(easy, 'empire'))).not.toContain('Possible base locations');
    const rebels = newGame(aiGameSettings('rebels', 'hard'), 'desc-4');
    const text = situation(toSideView(rebels, 'rebels'));
    expect(text).toContain(`Your base: ${rebels.rebelBase.systemId} (hidden from the Empire).`);
    expect(text).not.toContain('hidden zone');
  });

  it('heaviest state (units spread over every system) stays ≤ 4000 and ASCII', () => {
    const state = newGame(aiGameSettings('empire', 'hard'), 'desc-5');
    const ids = state.map.systems.map((s) => s.id);
    const spread: CoreGameState = {
      ...state,
      units: state.units.map((u, i) => ({ ...u, systemId: ids[i % ids.length] ?? u.systemId })),
    };
    for (const side of ['empire', 'rebels'] as const) {
      const text = situation(toSideView(spread, side));
      expect(text.length).toBeLessThanOrEqual(DESCRIBE_LIMITS.situation);
      expect(text).toMatch(ASCII);
    }
  });

  it('clip cuts deterministically with a marker', () => {
    expect(clip('abcdef', 10)).toBe('abcdef');
    expect(clip('abcdefghijkl', 8)).toBe('abcde...');
    expect(clip('abcdefghijkl', 8)).toHaveLength(8);
  });
});

describe('summaryFor', () => {
  it('one line per kind, ≤ 160, ASCII', () => {
    const state = newGame(aiGameSettings('empire', 'normal'), 'desc-6');
    const view = toSideView(state, 'rebels');
    const model = buildViewModel(view);
    const candidates = enumerateCandidates(view);
    const activate = candidates.find((c) => c.key === `A|leia|${state.rebelBase.systemId}`);
    const pass = candidates.find((c) => c.kind === 'pass');
    if (!activate || !pass) throw new Error('fixture');
    expect(summaryFor(view, activate, model)).toMatch(
      new RegExp(
        `^Activate ${state.rebelBase.systemId} with leia; your base; your ground units there: 4;`,
      ),
    );
    expect(summaryFor(view, pass, model)).toBe('Pass for the rest of this round.');
    for (const candidate of candidates) {
      const text = summaryFor(view, candidate, model);
      expect(text.length).toBeLessThanOrEqual(DESCRIBE_LIMITS.summary);
      expect(text).toMatch(ASCII);
    }
  });
});

describe('situation of the Empire is invariant to the hidden base (D-PO-1, TC-H-01)', () => {
  it('relocating the base before the reveal changes no text', () => {
    let compared = 0;
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const states = walk(aiGameSettings('empire', difficulty), `desc-inv-${difficulty}`);
      for (const state of states.filter((_, i) => i % 7 === 0)) {
        if (state.rebelBase.revealed || state.outcome !== null) continue;
        const expected = situation(toSideView(state, 'empire'));
        for (const system of state.map.systems) {
          const moved = relocateBase(state, system.id);
          if (!moved) continue;
          expect(situation(toSideView(moved, 'empire'))).toBe(expected);
          compared += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(100);
  }, 60_000);
});
