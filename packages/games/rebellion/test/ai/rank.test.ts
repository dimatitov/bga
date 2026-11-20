/**
 * Ranking frame with the W6 policies (SWR-006 plan-backend §4.1, §4.5): side → policy, filters keep the
 * terminating action, one activation per system, determinism, difficulties choose differently (informative for
 * TC-DIF-08), bot-vs-bot games always end and activations respect `maxMoves`.
 */
import { describe, expect, it } from 'vitest';
import { botSeed, enumerateCandidates, rankCandidates, type BotCandidate } from '../../src/ai';
import { scoreEmpire } from '../../src/ai/empire-policy';
import { EMPIRE_PROFILES, REBEL_PROFILES } from '../../src/ai/profiles';
import { allowedCandidates, onePerSystem, policyContext, policyFor } from '../../src/ai/rank';
import { scoreRebels } from '../../src/ai/rebel-policy';
import { toSideView } from '../../src/rules';
import type { CoreGameState, Difficulty, Faction } from '../../src/schema';
import { aiGameSettings, newGame, step, walk } from './fixtures/walk';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

function first(state: CoreGameState, difficulty: Difficulty): BotCandidate {
  const view = toSideView(state, state.activeSide);
  const c = rankCandidates(view, difficulty, botSeed(view))[0];
  if (!c) throw new Error('no candidate');
  return c;
}

describe('rank — frame', () => {
  it('policyFor: Empire → scoreEmpire, Rebels → scoreRebels', () => {
    const rebels = toSideView(newGame(aiGameSettings('rebels', 'normal'), 'rk-1'), 'rebels');
    const empire = toSideView(newGame(aiGameSettings('rebels', 'normal'), 'rk-1'), 'empire');
    for (const d of DIFFICULTIES) {
      expect(policyFor(rebels, d)).toBe(scoreRebels);
      expect(policyFor(empire, d)).toBe(scoreEmpire);
    }
  });

  it('onePerSystem keeps one activation per system (the picked leader, clamped) and every other candidate', () => {
    const view = toSideView(newGame(aiGameSettings('rebels', 'normal'), 'rk-2'), 'rebels');
    const all = enumerateCandidates(view);
    const systems = new Set(all.filter((c) => c.kind === 'activate').map((c) => c.systemId));
    for (const pick of [0, 1, 99]) {
      const kept = onePerSystem(all, pick);
      const activations = kept.filter((c) => c.kind === 'activate');
      expect(activations).toHaveLength(systems.size);
      expect(new Set(activations.map((c) => c.systemId)).size).toBe(systems.size);
      expect(kept.filter((c) => c.kind !== 'activate')).toEqual(
        all.filter((c) => c.kind !== 'activate'),
      );
      const leaders = new Set(activations.map((c) => c.key.split('|')[1]));
      expect(leaders.size).toBe(1);
    }
    const leaderAt = (pick: number) => onePerSystem(all, pick)[0]?.key.split('|')[1];
    expect(leaderAt(0)).not.toBe(leaderAt(1));
  });

  it('allowedCandidates never drops the terminating action', () => {
    for (const aiSide of ['empire', 'rebels'] as Faction[]) {
      for (const state of walk(aiGameSettings(aiSide, 'hard'), `rk-allow-${aiSide}`, {
        maxCommands: 200,
      })) {
        if (state.outcome !== null) continue;
        const view = toSideView(state, state.activeSide);
        const all = enumerateCandidates(view);
        const kept = allowedCandidates(all, policyContext(view, 'hard', 's'));
        expect(kept.filter((c) => c.kind === 'pass' || c.kind === 'finish')).toEqual(
          all.filter((c) => c.kind === 'pass' || c.kind === 'finish'),
        );
      }
    }
  });

  it('deterministic for a seed; scores are finite and sorted', () => {
    const state = newGame(aiGameSettings('rebels', 'easy'), 'rk-3');
    const view = toSideView(state, 'rebels');
    for (const d of DIFFICULTIES) {
      const a = rankCandidates(view, d, 'seed-a');
      expect(rankCandidates(view, d, 'seed-a')).toEqual(a);
      for (const c of a) expect(Number.isFinite(c.score)).toBe(true);
      for (let i = 1; i < a.length; i += 1) {
        expect((a[i - 1]?.score ?? 0) >= (a[i]?.score ?? 0)).toBe(true);
      }
    }
    // easy noise depends on the seed (TC-DET-03 in spirit): some seed changes the ranking.
    const base = rankCandidates(view, 'easy', 'seed-0').map((c) => c.key);
    const differs = Array.from({ length: 10 }, (_, i) => `seed-${i + 1}`).some(
      (seed) =>
        JSON.stringify(rankCandidates(view, 'easy', seed).map((c) => c.key)) !==
        JSON.stringify(base),
    );
    expect(differs).toBe(true);
  });
});

describe('rank — difficulties choose differently (TC-DIF-08, informative)', () => {
  it('on AI-turn states of bot-vs-bot normal games, easy ≠ hard and easy ≠ normal in a real share of states', () => {
    let states = 0;
    let easyVsHard = 0;
    let easyVsNormal = 0;
    for (const aiSide of ['empire', 'rebels'] as Faction[]) {
      for (const seed of ['rk-d1', 'rk-d2', 'rk-d3']) {
        const game = walk(aiGameSettings(aiSide, 'normal'), `${seed}-${aiSide}`, {
          choose: (state) => first(state, 'normal'),
        });
        for (const state of game) {
          if (state.outcome !== null) continue;
          const [e, n, h] = DIFFICULTIES.map((d) => first(state, d).key);
          states += 1;
          if (e !== h) easyVsHard += 1;
          if (e !== n) easyVsNormal += 1;
        }
      }
    }
    console.info(
      `[rank-difficulty] states=${states} easy≠hard=${(easyVsHard / states).toFixed(2)} easy≠normal=${(easyVsNormal / states).toFixed(2)}`,
    );
    expect(states).toBeGreaterThan(100);
    expect(easyVsHard / states).toBeGreaterThanOrEqual(0.2);
    expect(easyVsNormal / states).toBeGreaterThanOrEqual(0.1);
  }, 120_000);
});

describe('rank — termination (never loops)', () => {
  it('bot vs bot: every side × difficulty pair ends the game; activations respect maxMoves', () => {
    const results: string[] = [];
    for (const empire of DIFFICULTIES) {
      for (const rebels of DIFFICULTIES) {
        for (const seed of ['rk-t1', 'rk-t2']) {
          let state = newGame(aiGameSettings('rebels', rebels), `${seed}-${empire}-${rebels}`);
          let commands = 0;
          let moves = 0;
          while (state.outcome === null) {
            const side = state.activeSide;
            const d = side === 'empire' ? empire : rebels;
            const c = first(state, d);
            if (c.kind === 'activate') moves = 0;
            if (c.kind === 'move') {
              moves += 1;
              const max = (side === 'empire' ? EMPIRE_PROFILES : REBEL_PROFILES)[d].maxMoves;
              expect(moves).toBeLessThanOrEqual(max);
            }
            state = step(state, c);
            commands += 1;
            if (commands > 1000)
              throw new Error(`no end: ${seed} empire=${empire} rebels=${rebels}`);
          }
          results.push(
            `${empire}/${rebels}:${state.outcome.winner[0]}@${state.round}(${commands})`,
          );
        }
      }
    }
    console.info(`[rank-termination] empire/rebels:winner@round(commands) ${results.join(' ')}`);
  }, 120_000);
});
