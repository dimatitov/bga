/**
 * AC-06 TC-DIF-08 — the difficulty changes the CHOICE, not only the text: for every AI-turn state of the normal
 * games on `DIFF_SEEDS` (AI Rebels vs E-PASSIVE / E-HUNT and AI Empire vs R-PASSIVE / R-ACTIVE), the bot's
 * choice `FB` (= the command of `c1`) is recomputed with `aiDifficulty` overridden in a copy of the state.
 * Thresholds (frozen): `FB_easy ≠ FB_hard` in ≥ 20 % of the states, `FB_easy ≠ FB_normal` in ≥ 10 %.
 */
import { describe, expect, it } from 'vitest';
import { buildDecision } from '../../../src/ai';
import { toSideView } from '../../../src/rules';
import type { CoreGameState, Difficulty, Faction } from '../../../src/schema';
import { activeRebels, huntingEmpire, passiveHuman, simulate, type HumanScript } from './harness';
import { DIFF_SEEDS } from './seeds';

const SCRIPTS: readonly (readonly [Faction, HumanScript])[] = [
  ['rebels', passiveHuman],
  ['rebels', huntingEmpire],
  ['empire', passiveHuman],
  ['empire', activeRebels],
];

/** FB of `state` with the AI difficulty overridden (a copy — the input is never mutated). */
function fallbackCommand(state: CoreGameState, difficulty: Difficulty): string {
  const copy: CoreGameState = {
    ...state,
    settings: { ...state.settings, aiDifficulty: difficulty },
  };
  const decision = buildDecision(toSideView(copy, copy.activeSide));
  if (!decision) throw new Error('no decision on an AI turn');
  return JSON.stringify(decision.commands.get(decision.point.fallbackCandidateId));
}

describe('AC-06 TC-DIF-08 — the difficulty changes the bot’s choice', () => {
  it(
    'on the AI-turn states of the normal DIFF_SEEDS games: easy≠hard ≥ 20 %, easy≠normal ≥ 10 %',
    { timeout: 90_000 },
    () => {
      let states = 0;
      let easyHard = 0;
      let easyNormal = 0;
      const bySide = {
        empire: { states: 0, easyHard: 0, easyNormal: 0 },
        rebels: { states: 0, easyHard: 0, easyNormal: 0 },
      };
      for (const [aiSide, human] of SCRIPTS) {
        for (const sessionId of DIFF_SEEDS) {
          const r = simulate({ sessionId, aiSide, difficulty: 'normal', human });
          for (const rec of r.records) {
            if (rec.by !== 'ai') continue;
            const s = rec.before;
            const easy = fallbackCommand(s, 'easy');
            const normal = fallbackCommand(s, 'normal');
            const hard = fallbackCommand(s, 'hard');
            states += 1;
            bySide[aiSide].states += 1;
            if (easy !== hard) {
              easyHard += 1;
              bySide[aiSide].easyHard += 1;
            }
            if (easy !== normal) {
              easyNormal += 1;
              bySide[aiSide].easyNormal += 1;
            }
          }
        }
      }
      console.log(
        `[w8-metrics] TC-DIF-08 states=${states} easy≠hard=${(easyHard / states).toFixed(3)} ` +
          `easy≠normal=${(easyNormal / states).toFixed(3)} bySide=${JSON.stringify(bySide)}`,
      );
      expect(easyHard / states).toBeGreaterThanOrEqual(0.2);
      expect(easyNormal / states).toBeGreaterThanOrEqual(0.1);
    },
  );
});
