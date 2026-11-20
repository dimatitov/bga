/**
 * Termination (plan-backend §6.4; test-cases.md TC-BOT-10; brief: every `PROP_SEEDS` game ends within the step
 * limit and 13 rounds). Bot-vs-bot on `PROP_SEEDS` × 9 difficulty pairs, and bot-vs-scripted-human on
 * `PROP_SEEDS` × 3 difficulties × {E-PASSIVE, E-HUNT, R-PASSIVE, R-ACTIVE}.
 */
import { describe, expect, it } from 'vitest';
import type { Faction } from '../../../src/schema';
import {
  MAX_ROUNDS,
  MAX_STEPS_PER_RUN,
  activeRebels,
  huntingEmpire,
  passiveHuman,
  simulate,
  type HumanScript,
  type SimResult,
} from './harness';
import { DIFFICULTIES, PAIRS, PROP_SEEDS, botVsBot, pairName } from './bot-games';

const TIMEOUT = 90_000;

/** TC-BOT-10 bounds for one game. */
function checkTermination(r: SimResult): { maxRun: number; maxHumanStreak: number } {
  const label = `${r.sessionId} ai=${r.aiSide}:${r.difficulty}`;
  expect(r.final.outcome, label).not.toBeNull();
  // Time 1 → reputation 14: at most 13 rounds are played (the round counter ends ≤ 14).
  expect(r.final.round - r.initial.round, label).toBeLessThanOrEqual(MAX_ROUNDS);
  const maxRun = Math.max(...r.runs);
  expect(maxRun, label).toBeLessThanOrEqual(Math.min(MAX_STEPS_PER_RUN, 40));
  expect(r.records.length, label).toBeLessThanOrEqual(13 * 120);
  // No repeated state: the version grows by exactly 1 per command.
  let version = r.initial.version;
  let streak = 0;
  let maxHumanStreak = 0;
  for (const rec of r.records) {
    expect(rec.before.version).toBe(version);
    expect(rec.after.version).toBe(version + 1);
    version += 1;
    streak = rec.by === 'human' ? streak + 1 : 0;
    maxHumanStreak = Math.max(maxHumanStreak, streak);
  }
  expect(maxHumanStreak, label).toBeLessThanOrEqual(40);
  return { maxRun, maxHumanStreak };
}

describe('TC-BOT-10 — bot vs bot on PROP_SEEDS × 9 difficulty pairs', () => {
  it.each(PAIRS.map((p) => [pairName(p), p] as const))(
    '%s: all 30 games end within 13 rounds, ≤ 64 (and ≤ 40) steps per AI run',
    { timeout: TIMEOUT },
    (name, pair) => {
      const outcomes: string[] = [];
      let maxRun = 0;
      PROP_SEEDS.forEach((sessionId, i) => {
        const r = botVsBot(sessionId, i, pair);
        maxRun = Math.max(maxRun, checkTermination(r).maxRun);
        outcomes.push(`${r.final.outcome?.winner[0] ?? '-'}${r.final.round}`);
      });
      console.log(
        `[w8-termination] bot-vs-bot ${name} maxRun=${maxRun} outcomes=${outcomes.join(' ')}`,
      );
    },
  );
});

const HUMANS: readonly (readonly [string, Faction, HumanScript])[] = [
  ['E-PASSIVE', 'rebels', passiveHuman],
  ['E-HUNT', 'rebels', huntingEmpire],
  ['R-PASSIVE', 'empire', passiveHuman],
  ['R-ACTIVE', 'empire', activeRebels],
];

describe('termination — AI vs scripted human on PROP_SEEDS', () => {
  it.each(HUMANS.map(([name, aiSide, human]) => [name, aiSide, human] as const))(
    'human %s (AI = %s), every difficulty: all 30 games end within 13 rounds and the step limit',
    { timeout: TIMEOUT },
    (name, aiSide, human) => {
      for (const difficulty of DIFFICULTIES) {
        let maxRun = 0;
        const wins = { empire: 0, rebels: 0 };
        for (const sessionId of PROP_SEEDS) {
          const r = simulate({ sessionId, aiSide, difficulty, human });
          maxRun = Math.max(maxRun, checkTermination(r).maxRun);
          const winner = r.final.outcome?.winner;
          if (winner) wins[winner] += 1;
        }
        console.log(
          `[w8-termination] human ${name} vs AI ${aiSide}:${difficulty} maxRun=${maxRun} wins=${JSON.stringify(wins)}`,
        );
      }
    },
  );
});
