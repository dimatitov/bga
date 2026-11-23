/**
 * AC-05 (bot determinism) at engine level (test-cases.md TC-DET-03, TC-DET-05 and the engine half of
 * TC-DET-01): the same `sessionId` + the same human script → byte-identical states and logs; another
 * `sessionId` → another game; the bot's seed really depends on `id + version`; a golden hash of one fixed
 * bot-vs-bot game (a change of the bot's behaviour = a deliberate golden update, recorded in the W8 log).
 */
import { describe, expect, it } from 'vitest';
import { buildDecision, hash32 } from '../../../src/ai';
import { toSideView } from '../../../src/rules';
import type { CoreGameState } from '../../../src/schema';
import { activeRebels, botHuman, huntingEmpire, simulate } from './harness';
import { DIFF_SEEDS } from './seeds';

const TIMEOUT = 60_000;

/** TC-DET-05: hash of the final state (incl. the full log) of bot-vs-bot `swr006-p01`, normal / normal. */
/**
 * SWR-010 (W5): updated from `2669f596` — new games now carry `cards` (probe deck, Location) and every Refresh logs
 * `CARDS_DRAWN`. The bot's choices are unchanged: the same game without the card state and those events (`seq`
 * renumbered) still hashes to the previous golden (`GOLDEN_P01_NORMAL_WITHOUT_CARDS`).
 */
const GOLDEN_P01_NORMAL = 'c0dcc415';
const GOLDEN_P01_NORMAL_WITHOUT_CARDS = '2669f596';

const fingerprint = (s: CoreGameState) => JSON.stringify(s);

describe('AC-05 — determinism of simulated games', () => {
  it(
    'same sessionId + same human script → byte-identical final state, log and every intermediate state',
    { timeout: TIMEOUT },
    () => {
      const cases = [
        { sessionId: 'swr006-d03', aiSide: 'rebels', difficulty: 'normal', human: huntingEmpire },
        { sessionId: 'swr006-d07', aiSide: 'rebels', difficulty: 'easy', human: huntingEmpire },
        { sessionId: 'swr006-d11', aiSide: 'empire', difficulty: 'easy', human: activeRebels },
        { sessionId: 'swr006-d12', aiSide: 'empire', difficulty: 'hard', human: activeRebels },
      ] as const;
      for (const c of cases) {
        const a = simulate(c);
        const b = simulate(c);
        expect(fingerprint(b.final)).toBe(fingerprint(a.final));
        expect(b.records.map((r) => fingerprint(r.after))).toEqual(
          a.records.map((r) => fingerprint(r.after)),
        );
      }
    },
  );

  it(
    'another sessionId gives another game (seed and base depend on the session)',
    { timeout: TIMEOUT },
    () => {
      const a = simulate({
        sessionId: 'swr006-d01',
        aiSide: 'empire',
        difficulty: 'easy',
        human: activeRebels,
      });
      const b = simulate({
        sessionId: 'swr006-d02',
        aiSide: 'empire',
        difficulty: 'easy',
        human: activeRebels,
      });
      expect(fingerprint(b.final)).not.toBe(fingerprint(a.final));
    },
  );

  it(
    'TC-DET-03: the seed depends on the version — easy chooses differently in ≥ 1 of 20 DIFF_SEEDS states',
    { timeout: TIMEOUT },
    () => {
      let differs = 0;
      for (const sessionId of DIFF_SEEDS) {
        const r = simulate({
          sessionId,
          aiSide: 'empire',
          difficulty: 'easy',
          human: activeRebels,
        });
        const state = r.records.find(
          (rec) => rec.by === 'ai' && rec.before.activation === null,
        )?.before;
        if (!state) throw new Error(`no AI state in ${sessionId}`);
        const pick = (s: CoreGameState) =>
          JSON.stringify(buildDecision(toSideView(s, 'empire'))?.commands.get('c1'));
        if (pick({ ...state, version: state.version + 1 }) !== pick(state)) differs += 1;
      }
      console.log(`[w8-determinism] TC-DET-03 easy picks differing after version+1: ${differs}/20`);
      expect(differs).toBeGreaterThanOrEqual(1);
    },
  );

  it(
    'TC-DET-05: golden hash of bot-vs-bot swr006-p01 (normal / normal)',
    { timeout: TIMEOUT },
    () => {
      const r = simulate({
        sessionId: 'swr006-p01',
        aiSide: 'rebels',
        difficulty: 'normal',
        human: botHuman('normal'),
      });
      const hash = hash32(fingerprint(r.final)).toString(16).padStart(8, '0');
      console.log(
        `[w8-determinism] TC-DET-05 swr006-p01 normal/normal hash=${hash} version=${r.final.version} ` +
          `outcome=${JSON.stringify(r.final.outcome)}`,
      );
      expect(hash).toBe(GOLDEN_P01_NORMAL);
      // SWR-010: the bot's behaviour is unchanged — without the card state and the CARDS_DRAWN events the same
      // game hashes to the SWR-006..009 golden (event `seq` renumbered).
      const { cards: _cards, ...withoutCards } = r.final;
      const legacy = {
        ...withoutCards,
        log: r.final.log
          .filter((e) => e.type !== 'CARDS_DRAWN')
          .map((e, i) => ({ ...e, seq: i + 1 })),
      };
      const legacyHash = hash32(fingerprint(legacy)).toString(16).padStart(8, '0');
      expect(legacyHash).toBe(GOLDEN_P01_NORMAL_WITHOUT_CARDS);
    },
  );
});
