/**
 * Empire policy (SWR-006 plan-backend §4.5, Q-BE-4, Q-BE-5; informative for TC-DIF-05/06/07 — thresholds are
 * calibrated by W8): searchable activations with ground, hard never re-activates a searched system and almost
 * always delivers ground, easy passes early, after the reveal the Empire converges on the base.
 */
import { describe, expect, it } from 'vitest';
import {
  botSeed,
  buildViewModel,
  deriveBaseIntel,
  enumerateCandidates,
  rankCandidates,
  type BotCandidate,
} from '../../src/ai';
import { allowEmpire, empireCandidateSystems, movedGround } from '../../src/ai/empire-policy';
import { policyContext } from '../../src/ai/rank';
import { toSideView } from '../../src/rules';
import type { CoreGameState, Difficulty } from '../../src/schema';
import { aiGameSettings, newGame, step } from './fixtures/walk';

type Chooser = (state: CoreGameState) => BotCandidate;

const bot =
  (difficulty: Difficulty): Chooser =>
  (state) => {
    const view = toSideView(state, state.activeSide);
    const first = rankCandidates(view, difficulty, botSeed(view))[0];
    if (!first) throw new Error('no candidate');
    return first;
  };

const passive: Chooser = (state) => {
  const c = enumerateCandidates(toSideView(state, state.activeSide)).find(
    (x) => x.kind === 'pass' || x.kind === 'finish',
  );
  if (!c) throw new Error('no terminating action');
  return c;
};

interface Played {
  states: CoreGameState[];
  /** Index of the state BEFORE each Empire command and the command. */
  empire: { before: CoreGameState; command: BotCandidate }[];
}

function play(state0: CoreGameState, difficulty: Difficulty, rebels: Chooser, cap = 1500): Played {
  let state = state0;
  const states = [state];
  const empire: Played['empire'] = [];
  for (let i = 0; i < cap && state.outcome === null; i += 1) {
    const command = state.activeSide === 'empire' ? bot(difficulty)(state) : rebels(state);
    if (state.activeSide === 'empire') empire.push({ before: state, command });
    state = step(state, command);
    states.push(state);
  }
  return { states, empire };
}

const empireGame = (difficulty: Difficulty, id: string) =>
  newGame(aiGameSettings('empire', difficulty), id);

const revealRound = (states: CoreGameState[]) =>
  states.find((s) => s.rebelBase.revealed)?.round ?? 14;

describe('Empire policy — hard search discipline (TC-DIF-06, informative)', () => {
  it('never activates a searched system before the reveal; ≥ 90% of activations move ground in', () => {
    let activations = 0;
    let withGround = 0;
    for (const [name, rebels] of [
      ['passive', passive],
      ['normal', bot('normal')],
    ] as const) {
      for (let g = 0; g < 8; g += 1) {
        const { states, empire } = play(empireGame('hard', `emp-h-${name}-${g}`), 'hard', rebels);
        expect(states.at(-1)?.outcome).not.toBeNull();
        empire.forEach(({ before, command }, i) => {
          if (before.rebelBase.revealed || command.kind !== 'activate') return;
          const view = toSideView(before, 'empire');
          const searched = deriveBaseIntel(view).searched;
          expect(searched.has(command.systemId ?? '')).toBe(false);
          // The filter: no searched system among the ranked candidates at all.
          const ranked = rankCandidates(view, 'hard', botSeed(view));
          expect(ranked.some((c) => c.kind === 'activate' && searched.has(c.systemId ?? ''))).toBe(
            false,
          );
          activations += 1;
          const model = buildViewModel(view);
          for (const next of empire.slice(i + 1)) {
            if (next.command.kind !== 'move') break;
            if (movedGround(model, next.command) > 0) {
              withGround += 1;
              break;
            }
          }
        });
      }
    }
    console.info(
      `[empire-hard] activations before reveal=${activations} with ground=${withGround}`,
    );
    expect(activations).toBeGreaterThan(20);
    expect(withGround / activations).toBeGreaterThanOrEqual(0.9);
  }, 120_000);

  it('allowEmpire: only hard filters, and only searched systems before the reveal', () => {
    const { empire } = play(empireGame('hard', 'emp-filter'), 'hard', passive, 120);
    const later = empire
      .map((e) => e.before)
      .find((s) => {
        if (s.rebelBase.revealed || s.activation !== null) return false;
        return deriveBaseIntel(toSideView(s, 'empire')).searched.size > 0;
      });
    if (!later) throw new Error('no searched system yet');
    const view = toSideView(later, 'empire');
    const searched = [...deriveBaseIntel(view).searched];
    const activation = enumerateCandidates(view).find(
      (c) => c.kind === 'activate' && c.systemId === searched[0],
    );
    if (!activation) throw new Error('no activation candidate');
    expect(allowEmpire(activation, policyContext(view, 'hard', 's'))).toBe(false);
    expect(allowEmpire(activation, policyContext(view, 'normal', 's'))).toBe(true);
    expect(allowEmpire(activation, policyContext(view, 'easy', 's'))).toBe(true);
  });
});

describe('Empire policy — first decisions', () => {
  it('normal searches a reachable possible-base system; hard (no reachable candidate at the start) pulls ground closer', () => {
    for (const difficulty of ['normal', 'hard'] as Difficulty[]) {
      let state = empireGame(difficulty, `emp-first-${difficulty}`);
      // The human Rebels move first in an AI-Empire game: let them pass.
      while (state.activeSide !== 'empire') state = step(state, passive(state));
      const view = toSideView(state, 'empire');
      const model = buildViewModel(view);
      const targets = empireCandidateSystems(view, difficulty);
      const first = bot(difficulty)(state);
      const x = first.systemId ?? '';
      expect(first.kind).toBe('activate');
      expect(model.deliverableGround(x)).toBeGreaterThan(0);
      if (difficulty === 'normal') {
        expect(targets.has(x)).toBe(true);
      } else {
        // Hard with the setup rule: no candidate is adjacent to Imperial ground at the start → staging.
        expect([...targets.keys()].some((id) => model.deliverableGround(id) > 0)).toBe(false);
        expect(targets.has(x)).toBe(false);
        const toTargets = (id: string) =>
          Math.min(...[...targets.keys()].map((t) => model.distance(id, t)));
        const sources = (model.adjacency.get(x) ?? []).filter(
          (s) => model.forcesOf('own', s).mobileGround > 0,
        );
        expect(toTargets(x)).toBeLessThan(Math.min(...sources.map(toTargets)));
      }
      state = step(state, first);
      const move = bot(difficulty)(state);
      expect(move.kind).toBe('move');
      expect(movedGround(buildViewModel(toSideView(state, 'empire')), move)).toBeGreaterThan(0);
      if (difficulty === 'normal') expect(move.variants).toContain('ground-strike');
    }
  });

  it('hard uses the setup rule (Q-BE-4): no starting Imperial system or neighbour among its targets', () => {
    const state = empireGame('hard', 'emp-start');
    const view = toSideView(state, 'empire');
    const intel = deriveBaseIntel(view);
    const hard = empireCandidateSystems(view, 'hard');
    const normal = empireCandidateSystems(view, 'normal');
    for (const id of intel.startRuleExcluded) expect(hard.has(id)).toBe(false);
    expect(normal.size).toBeGreaterThan(hard.size);
  });
});

describe('Empire policy — difficulty gradient (TC-DIF-05/07, informative)', () => {
  it('vs passive Rebels: hard reveals no later than easy on average; easy activates less per round', () => {
    const stats: Record<Difficulty, { reveal: number; acts: number; rounds: number }> = {
      easy: { reveal: 0, acts: 0, rounds: 0 },
      normal: { reveal: 0, acts: 0, rounds: 0 },
      hard: { reveal: 0, acts: 0, rounds: 0 },
    };
    const games = 8;
    for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
      for (let g = 0; g < games; g += 1) {
        const { states, empire } = play(
          empireGame(difficulty, `emp-grad-${g}`),
          difficulty,
          passive,
        );
        const last = states.at(-1) as CoreGameState;
        stats[difficulty].reveal += revealRound(states) / games;
        stats[difficulty].acts += empire.filter((e) => e.command.kind === 'activate').length;
        stats[difficulty].rounds += last.round;
      }
    }
    const perRound = (d: Difficulty) => stats[d].acts / stats[d].rounds;
    console.info(
      `[empire-gradient] mean reveal round easy=${stats.easy.reveal.toFixed(1)} normal=${stats.normal.reveal.toFixed(1)} hard=${stats.hard.reveal.toFixed(1)}; activations/round easy=${perRound('easy').toFixed(2)} normal=${perRound('normal').toFixed(2)} hard=${perRound('hard').toFixed(2)}`,
    );
    expect(stats.hard.reveal).toBeLessThanOrEqual(stats.easy.reveal);
    expect(perRound('easy')).toBeLessThan(perRound('hard'));
  }, 120_000);
});

describe('Empire policy — after the reveal (converge on the base)', () => {
  it('with no Imperial unit left in the revealed base the Empire moves back in hop by hop', () => {
    let checked = 0;
    for (const difficulty of ['normal', 'hard'] as Difficulty[]) {
      const { states } = play(empireGame(difficulty, `emp-rev-${difficulty}`), difficulty, passive);
      const revealed = states.find(
        (s) =>
          s.rebelBase.revealed &&
          s.outcome === null &&
          s.activeSide === 'empire' &&
          s.activation === null,
      );
      if (!revealed) continue;
      const base = revealed.rebelBase.systemId;
      // Take every Imperial unit out of the base and its neighbours: drop them 2+ jumps away.
      const view0 = toSideView(revealed, 'empire');
      const model0 = buildViewModel(view0);
      const far = model0.systemIds.find(
        (id) => model0.distance(id, base) === 2 && model0.distance(id, base) !== Infinity,
      );
      if (!far) throw new Error('no system 2 jumps away');
      const near = new Set([base, ...(model0.adjacency.get(base) ?? [])]);
      const state: CoreGameState = {
        ...revealed,
        units: revealed.units.map((u) =>
          u.owner === 'empire' && near.has(u.systemId) ? { ...u, systemId: far } : u,
        ),
      };
      const distOfNearest = (s: CoreGameState) => {
        const m = buildViewModel(toSideView(s, 'empire'));
        return Math.min(
          ...s.units.filter((u) => u.owner === 'empire').map((u) => m.distance(u.systemId, base)),
        );
      };
      expect(distOfNearest(state)).toBe(2);
      const { states: after } = play(state, difficulty, passive, 400);
      const reached = after.findIndex((s) => distOfNearest(s) === 0);
      expect(reached).toBeGreaterThan(0);
      // Monotone: the nearest Imperial group never moves away from the base before reaching it.
      for (let i = 1; i <= reached; i += 1) {
        expect(distOfNearest(after[i] as CoreGameState)).toBeLessThanOrEqual(
          distOfNearest(after[i - 1] as CoreGameState),
        );
      }
      checked += 1;
    }
    expect(checked).toBe(2);
  }, 120_000);
});
