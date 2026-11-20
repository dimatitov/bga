/**
 * AC-03 property (test-cases.md TC-BOT-01; plan-backend §9.2 W8: every candidate on ≥ 3 seeds × side, the
 * decision point's top-10 on ≥ 20 seeds). Bot-vs-bot games on `PROP_SEEDS` (`./bot-games`):
 * - FULL: in every state of the game where a side must move, EVERY candidate of
 *   `enumerateCandidates(toSideView(s, side))` is accepted by the engine (origin 'auto' for the AI seat,
 *   'player' for the other) — 3 distinct seeds per difficulty pair (27 games, both sides as the AI seat);
 * - TOP-10: in every AI-turn state of 30 more games (all 30 seeds, cycling through the pairs) every command of
 *   the decision point (`buildDecision`, what the runner may apply) is accepted.
 */
import { describe, expect, it } from 'vitest';
import { buildDecision, enumerateCandidates } from '../../../src/ai';
import { applyCommand, toSideView } from '../../../src/rules';
import type { CoreCommand, CoreGameState, Faction } from '../../../src/schema';
import { SIM_NOW } from './harness';
import { PAIRS, PROP_SEEDS, botVsBot, type Pair } from './bot-games';

function origin(state: CoreGameState, side: Faction): 'auto' | 'player' {
  return state.settings.opponentType === 'ai' && state.settings.opponentFaction === side
    ? 'auto'
    : 'player';
}

function accepted(state: CoreGameState, command: CoreCommand): boolean {
  const side = state.activeSide;
  const result = applyCommand(
    state,
    { actor: side, expectedVersion: state.version, command },
    { now: SIM_NOW, origin: origin(state, side) },
  );
  return result.ok;
}

describe('TC-BOT-01 — every candidate is engine-legal (bot-vs-bot, PROP_SEEDS)', () => {
  it(
    'FULL enumeration: 3 seeds per difficulty pair (27 games), every state, both sides',
    { timeout: 90_000 },
    () => {
      let states = 0;
      let candidates = 0;
      const rejected: string[] = [];
      PAIRS.forEach((pair: Pair, p) => {
        for (let k = 0; k < 3; k += 1) {
          const index = p * 3 + k;
          const sessionId = PROP_SEEDS[index] as string;
          const r = botVsBot(sessionId, index, pair);
          expect(r.final.outcome).not.toBeNull();
          for (const rec of r.records) {
            const s = rec.before;
            states += 1;
            for (const c of enumerateCandidates(toSideView(s, s.activeSide))) {
              candidates += 1;
              if (!accepted(s, c.command)) rejected.push(`${sessionId}@v${s.version} ${c.key}`);
            }
          }
        }
      });
      console.log(
        `[w8-property] FULL games=27 states=${states} candidates=${candidates} rejected=${rejected.length}`,
      );
      expect(rejected).toEqual([]);
      expect(candidates).toBeGreaterThan(states);
    },
  );

  it(
    'TOP-10: every decision-point command of every AI turn in 30 games (all PROP_SEEDS)',
    { timeout: 90_000 },
    () => {
      let points = 0;
      let commands = 0;
      const rejected: string[] = [];
      PROP_SEEDS.forEach((sessionId, i) => {
        const pair = PAIRS[i % PAIRS.length] as Pair;
        const r = botVsBot(sessionId, i, pair);
        for (const rec of r.records) {
          if (rec.by !== 'ai') continue;
          const s = rec.before;
          const decision = buildDecision(toSideView(s, s.activeSide));
          expect(decision).not.toBeNull();
          points += 1;
          for (const [id, command] of decision?.commands ?? []) {
            commands += 1;
            if (!accepted(s, command)) rejected.push(`${sessionId}@v${s.version} ${id}`);
          }
        }
      });
      console.log(
        `[w8-property] TOP-10 games=30 decisionPoints=${points} commands=${commands} rejected=${rejected.length}`,
      );
      expect(rejected).toEqual([]);
    },
  );
});
