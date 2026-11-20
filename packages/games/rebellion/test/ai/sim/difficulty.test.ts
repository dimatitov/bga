/**
 * AC-06 (difficulty = behaviour) and AC-08 (reachable outcomes) on the frozen `DIFF_SEEDS` (test-cases.md §7,
 * §10: TC-DIF-01..07, TC-DIF-09, TC-OUT-04/05/07 + the engine half of TC-OUT-01). Games run through the server
 * module's automation exactly like the runner with the `bot` strategy (`./harness`). Thresholds are FROZEN
 * (Q-3) — never tune them here; calibrate `src/ai/profiles.ts` instead or escalate.
 *
 * The per-seed table (TR-9) is printed to stdout (`[w8-metrics]` lines) and kept in
 * `docs/tasks/SWR-006/artifacts/logs/w8-calibration.log`.
 */
import { describe, expect, it } from 'vitest';
import type { Difficulty, Faction } from '../../../src/schema';
import {
  activeRebels,
  gameMetrics,
  huntingEmpire,
  mean,
  passiveHuman,
  simulate,
  type GameMetrics,
  type HumanScript,
  type SimResult,
} from './harness';
import { DIFF_SEEDS } from './seeds';
import { EMPIRE_WIN_SEEDS } from './fixtures/empire-win-seeds';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const TIMEOUT = 60_000;

type ScriptName = 'E-PASSIVE' | 'E-HUNT' | 'R-PASSIVE' | 'R-ACTIVE';
const SCRIPTS: Record<ScriptName, { aiSide: Faction; human: HumanScript }> = {
  'E-PASSIVE': { aiSide: 'rebels', human: passiveHuman },
  'E-HUNT': { aiSide: 'rebels', human: huntingEmpire },
  'R-PASSIVE': { aiSide: 'empire', human: passiveHuman },
  'R-ACTIVE': { aiSide: 'empire', human: activeRebels },
};

const cache = new Map<string, { results: SimResult[]; metrics: GameMetrics[] }>();

/** The 20 DIFF_SEEDS games of one script × AI difficulty (memoized within this file). */
function games(script: ScriptName, difficulty: Difficulty) {
  const key = `${script}/${difficulty}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { aiSide, human } = SCRIPTS[script];
  const results = DIFF_SEEDS.map((sessionId) => simulate({ sessionId, aiSide, difficulty, human }));
  const metrics = results.map(gameMetrics);
  for (const m of metrics) {
    console.log(
      `[w8-metrics] ${script.padEnd(9)} ai=${aiSide.padEnd(6)} ${difficulty.padEnd(6)} ${m.sessionId} ` +
        `base=${m.base.padEnd(10)} winner=${m.winner ?? '-'}@${m.finalRound} reason=${m.reason ?? '-'} ` +
        `reveal=${m.revealed ? m.revealRound : '-'} emptyStates=${m.emptyBaseStates} ` +
        `outOfBase=${m.movesOutOfBase} empAct=${m.empireActivationsBeforeReveal}/${m.roundsBeforeReveal}r ` +
        `maxRun=${m.maxRun} commands=${m.commands}`,
    );
  }
  const entry = { results, metrics };
  cache.set(key, entry);
  return entry;
}

const count = (ms: readonly GameMetrics[], p: (m: GameMetrics) => boolean) => ms.filter(p).length;
/** TC-DIF-07: AI-Empire activations per round, counted only BEFORE the reveal (Analyst decision). */
const activationsPerRound = (ms: readonly GameMetrics[]) =>
  mean(ms.map((m) => m.empireActivationsBeforeReveal / m.roundsBeforeReveal));

describe('TC-DIF-09 precondition — DIFF_SEEDS bases', () => {
  it('the bases of DIFF_SEEDS cover ≥ 6 different systems', { timeout: TIMEOUT }, () => {
    const bases = new Set(games('E-PASSIVE', 'normal').metrics.map((m) => m.base));
    console.log(`[w8-metrics] TC-DIF-09 bases=${[...bases].sort().join(',')} (${bases.size})`);
    expect(bases.size).toBeGreaterThanOrEqual(6);
  });
});

describe('AC-06 — AI Rebels (TC-DIF-01..04)', () => {
  it(
    'TC-DIF-01: hard never leaves the base empty — 0 empty-base states in 40 games',
    { timeout: TIMEOUT },
    () => {
      const ms = [...games('E-PASSIVE', 'hard').metrics, ...games('E-HUNT', 'hard').metrics];
      expect(ms).toHaveLength(40);
      const empty = ms.reduce((sum, m) => sum + m.emptyBaseStates, 0);
      console.log(`[w8-metrics] TC-DIF-01 hard emptyBaseStates=${empty} (40 games)`);
      expect(empty).toBe(0);
    },
  );

  it(
    'TC-DIF-02: easy empties the base in ≥ 8/20 games vs E-HUNT and ≥ 4/20 vs E-PASSIVE',
    { timeout: TIMEOUT },
    () => {
      const hunt = count(games('E-HUNT', 'easy').metrics, (m) => m.emptiedBase);
      const passive = count(games('E-PASSIVE', 'easy').metrics, (m) => m.emptiedBase);
      console.log(
        `[w8-metrics] TC-DIF-02 easy emptyBaseGames E-HUNT=${hunt}/20 E-PASSIVE=${passive}/20`,
      );
      expect(hunt).toBeGreaterThanOrEqual(8);
      expect(passive).toBeGreaterThanOrEqual(4);
    },
  );

  it(
    'TC-DIF-03: normal — 0/20 vs E-PASSIVE; ≥ 1/20 and < easy vs E-HUNT; every emptying under threat',
    { timeout: TIMEOUT },
    () => {
      const passive = games('E-PASSIVE', 'normal').metrics;
      const hunt = games('E-HUNT', 'normal').metrics;
      const easyHunt = count(games('E-HUNT', 'easy').metrics, (m) => m.emptiedBase);
      const normalHunt = count(hunt, (m) => m.emptiedBase);
      const withoutThreat = [...passive, ...hunt].reduce((s, m) => s + m.emptyingsWithoutThreat, 0);
      console.log(
        `[w8-metrics] TC-DIF-03 normal emptyBaseGames E-PASSIVE=${count(passive, (m) => m.emptiedBase)}/20 ` +
          `E-HUNT=${normalHunt}/20 (easy ${easyHunt}) emptyingsWithoutThreat=${withoutThreat}`,
      );
      expect(count(passive, (m) => m.emptiedBase)).toBe(0);
      expect(normalHunt).toBeGreaterThanOrEqual(1);
      expect(normalHunt).toBeLessThan(easyHunt);
      expect(withoutThreat).toBe(0);
    },
  );

  it(
    'TC-DIF-04: mean Rebel moves out of the base per game — easy > hard, easy ≥ normal',
    { timeout: TIMEOUT },
    () => {
      const out = (d: Difficulty) =>
        mean(
          [...games('E-PASSIVE', d).metrics, ...games('E-HUNT', d).metrics].map(
            (m) => m.movesOutOfBase,
          ),
        );
      const [easy, normal, hard] = [out('easy'), out('normal'), out('hard')];
      console.log(
        `[w8-metrics] TC-DIF-04 movesOutOfBase/game easy=${easy.toFixed(2)} normal=${normal.toFixed(2)} hard=${hard.toFixed(2)}`,
      );
      expect(easy).toBeGreaterThan(hard);
      expect(easy).toBeGreaterThanOrEqual(normal);
    },
  );
});

describe('AC-06 — AI Empire vs R-PASSIVE (TC-DIF-05..07)', () => {
  it(
    'TC-DIF-05: hard reveals at least as often and no later than easy (one strictly); hard ≥ 4/20',
    { timeout: TIMEOUT },
    () => {
      const stat = (d: Difficulty) => {
        const ms = games('R-PASSIVE', d).metrics;
        return {
          revealed: count(ms, (m) => m.revealed),
          meanRound: mean(ms.map((m) => m.revealRound)),
        };
      };
      const easy = stat('easy');
      const normal = stat('normal');
      const hard = stat('hard');
      console.log(
        `[w8-metrics] TC-DIF-05 revealed easy=${easy.revealed} normal=${normal.revealed} hard=${hard.revealed}; ` +
          `mean revealRound easy=${easy.meanRound.toFixed(2)} normal=${normal.meanRound.toFixed(2)} hard=${hard.meanRound.toFixed(2)}`,
      );
      expect(hard.revealed).toBeGreaterThanOrEqual(easy.revealed);
      expect(hard.meanRound).toBeLessThanOrEqual(easy.meanRound);
      expect(hard.revealed > easy.revealed || hard.meanRound < easy.meanRound).toBe(true);
      expect(hard.revealed).toBeGreaterThanOrEqual(4);
    },
  );

  it(
    'TC-DIF-06: hard — ≥ 90% of pre-reveal activations move ground in, 0 activations of searched systems',
    { timeout: TIMEOUT },
    () => {
      const ms = games('R-PASSIVE', 'hard').metrics;
      const activations = ms.reduce((s, m) => s + m.empireActivationsBeforeReveal, 0);
      const withGround = ms.reduce((s, m) => s + m.activationsWithGround, 0);
      const searched = ms.reduce((s, m) => s + m.activationsOfSearched, 0);
      console.log(
        `[w8-metrics] TC-DIF-06 hard activations=${activations} withGround=${withGround} ofSearched=${searched}`,
      );
      expect(activations).toBeGreaterThan(0);
      expect(withGround / activations).toBeGreaterThanOrEqual(0.9);
      expect(searched).toBe(0);
    },
  );

  it('TC-DIF-07: pre-reveal activations per round — easy < hard', { timeout: TIMEOUT }, () => {
    const easy = activationsPerRound(games('R-PASSIVE', 'easy').metrics);
    const normal = activationsPerRound(games('R-PASSIVE', 'normal').metrics);
    const hard = activationsPerRound(games('R-PASSIVE', 'hard').metrics);
    console.log(
      `[w8-metrics] TC-DIF-07 activations/round before reveal easy=${easy.toFixed(2)} normal=${normal.toFixed(2)} hard=${hard.toFixed(2)}`,
    );
    expect(easy).toBeLessThan(hard);
  });
});

describe('AC-08 — reachable outcomes on DIFF_SEEDS (TC-OUT-01 engine half, TC-OUT-04/05/07)', () => {
  it.each(DIFFICULTIES)(
    'R-PASSIVE vs AI Empire %s: every game ends with a Rebel win on time; AI activations in ≥ 10 of 13 rounds',
    { timeout: TIMEOUT },
    (d) => {
      const { results } = games('R-PASSIVE', d);
      for (const r of results) {
        expect(r.final.outcome, r.sessionId).toEqual({
          winner: 'rebels',
          reason: 'timeReachedReputation',
        });
      }
      // The AI Empire really plays (PO 3.1): it activates in most rounds, not only passes.
      const roundsWithActivation = results.map((r) => {
        const rounds = new Set<number>();
        for (const rec of r.records) {
          if (rec.by === 'ai' && rec.events.some((e) => e.type === 'SYSTEM_ACTIVATED')) {
            rounds.add(rec.before.round);
          }
        }
        return rounds.size;
      });
      console.log(
        `[w8-metrics] TC-OUT-01(engine) ${d} rounds with an AI activation per game: ${roundsWithActivation.join(',')}`,
      );
      // TC-OUT-01 (frozen): ≥ 1 AI activation in at least 10 of the 13 rounds — checked here on all 20 seeds.
      for (const n of roundsWithActivation) expect(n).toBeGreaterThanOrEqual(10);
    },
  );

  it.each(['easy', 'normal'] as const)(
    'TC-OUT-04/05: E-HUNT vs AI Rebels %s → ≥ 1/20 Empire wins; the fixture seeds are exactly the winners',
    { timeout: TIMEOUT },
    (d) => {
      const ms = games('E-HUNT', d).metrics;
      const winners = ms.filter((m) => m.winner === 'empire');
      console.log(
        `[w8-metrics] TC-OUT-0${d === 'easy' ? 4 : 5} ${d} Empire wins ${winners.length}/20: ${winners.map((m) => m.sessionId).join(',')}`,
      );
      expect(winners.length).toBeGreaterThanOrEqual(1);
      for (const m of winners) expect(m.reason).toBe('rebelBaseCaptured');
      expect(EMPIRE_WIN_SEEDS[d].map((s) => s.sessionId)).toEqual(winners.map((m) => m.sessionId));
    },
  );

  it(
    'TC-OUT-07: E-HUNT vs AI Rebels hard → 0 Empire wins, base guarded all game, all 20 Rebel wins on time',
    { timeout: TIMEOUT },
    () => {
      const { metrics } = games('E-HUNT', 'hard');
      for (const m of metrics) {
        expect(m.winner, m.sessionId).toBe('rebels');
        expect(m.reason).toBe('timeReachedReputation');
        expect(m.emptyBaseStates).toBe(0);
      }
    },
  );

  it(
    'every DIFF_SEEDS game ends within 13 rounds and 64 steps per automated run',
    { timeout: TIMEOUT },
    () => {
      for (const script of Object.keys(SCRIPTS) as ScriptName[]) {
        for (const d of DIFFICULTIES) {
          for (const r of games(script, d).results) {
            expect(r.final.outcome, r.sessionId).not.toBeNull();
            expect(r.final.round).toBeLessThanOrEqual(14);
            expect(Math.max(...r.runs)).toBeLessThanOrEqual(64);
          }
        }
      }
    },
  );
});
