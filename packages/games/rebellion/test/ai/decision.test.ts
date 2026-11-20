/**
 * Decision point of the bot (SWR-006 Contract §5, D-PO-1, D-PO-2, plan-backend §4.1; TC-BOT-02, TC-BOT-07,
 * TC-BOT-08, TC-BOT-09, TC-H-01, TC-H-03): top-10, opaque ids, terminating action, fallback, policy id;
 * every command engine-legal with origin 'auto'; invariant to the hidden base for the Empire.
 */
import { describe, expect, it } from 'vitest';
import {
  BOT_POLICY_ID,
  DESCRIBE_LIMITS,
  MAX_DECISION_CANDIDATES,
  basePolicy,
  buildDecision,
  chooseAutoCommand,
  policyContext,
  rankCandidates,
  rankWith,
  selectTop,
  type BotCandidate,
  type BotDecision,
} from '../../src/ai';
import { applyCommand, toSideView } from '../../src/rules';
import {
  CORE_LEADER_IDS,
  CORE_SYSTEM_IDS,
  type CoreGameState,
  type Difficulty,
  type Faction,
} from '../../src/schema';
import { relocateBase } from './fixtures/relocate-base';
import { aiGameSettings, newGame, NOW, step, walk } from './fixtures/walk';

const ID = /^[a-z0-9-]{1,32}$/;
const ASCII = /^[\x20-\x7e\n]*$/;

const cand = (key: string, kind: BotCandidate['kind']): BotCandidate => ({
  key,
  kind,
  command: kind === 'pass' ? { type: 'PASS' } : { type: 'FINISH_ACTIVATION' },
  systemId: null,
});

/** The AI side's decision on `state` (null when it is not its turn). */
function aiDecision(state: CoreGameState): BotDecision | null {
  const aiSide = state.settings.opponentFaction;
  return buildDecision(toSideView(state, aiSide));
}

/** TC-BOT-02/07/08: shape of a decision point + every command accepted by the engine (origin auto). */
function checkDecision(state: CoreGameState, decision: BotDecision): void {
  const { point, commands } = decision;
  const view = toSideView(state, point.actor);
  const ids = point.candidates.map((c) => c.id);
  expect(ids.length).toBeGreaterThanOrEqual(1);
  expect(ids.length).toBeLessThanOrEqual(MAX_DECISION_CANDIDATES);
  expect(ids).toEqual(ids.map((_, i) => `c${i + 1}`));
  for (const id of ids) {
    expect(id).toMatch(ID);
    for (const word of [...CORE_SYSTEM_IDS, ...CORE_LEADER_IDS])
      expect(id.includes(word)).toBe(false);
    expect(id).not.toMatch(/u-\d+/);
  }
  expect(ids).toContain(point.fallbackCandidateId);
  expect(point.fallbackCandidateId).toBe('c1');
  expect(point.policyId).toBe(`${BOT_POLICY_ID}:${state.settings.aiDifficulty}`);
  expect(point.actor).toBe(state.activeSide);
  expect(point.phase).toBe(view.phase);
  expect([...commands.keys()]).toEqual(ids);
  const legalTypes = new Set(view.legalActions.map((a) => a.type));
  const terminating = legalTypes.has('PASS') ? 'PASS' : 'FINISH_ACTIVATION';
  expect(point.candidates.map((c) => c.type)).toContain(terminating);
  expect(point.objective.length).toBeLessThanOrEqual(DESCRIBE_LIMITS.objective);
  expect(point.situation.length).toBeLessThanOrEqual(DESCRIBE_LIMITS.situation);
  for (const text of [point.objective, point.situation]) {
    expect(text).toMatch(ASCII);
    expect(text).not.toContain(state.id);
  }
  for (const candidate of point.candidates) {
    expect(candidate.summary.length).toBeLessThanOrEqual(DESCRIBE_LIMITS.summary);
    expect(candidate.summary).toMatch(ASCII);
    expect(candidate.summary).not.toContain(state.id);
    expect(candidate.target === undefined || candidate.target.length <= 64).toBe(true);
    const command = commands.get(candidate.id);
    if (!command) throw new Error(`no command for ${candidate.id}`);
    expect(command.type).toBe(candidate.type);
    const result = applyCommand(
      state,
      { actor: point.actor, expectedVersion: state.version, command },
      { now: NOW, origin: 'auto' },
    );
    if (!result.ok) throw new Error(`${candidate.id} rejected: ${result.error.messageKey}`);
  }
}

describe('buildDecision — fixed states', () => {
  it('AI Rebels at creation: the fleet moves first (W6 policy), PASS kept, c1..c10, targets for activations', () => {
    const state = newGame(aiGameSettings('rebels', 'normal'), 'dec-1');
    const decision = aiDecision(state);
    if (!decision) throw new Error('the AI Rebels move first');
    checkDecision(state, decision);
    const { point, commands } = decision;
    expect(point.candidates).toHaveLength(10);
    // W6: the Rebel fleet starts walking to the base (consolidation), PASS stays offered (terminating action).
    expect(point.candidates[0]?.type).toBe('ACTIVATE_SYSTEM');
    expect(commands.get('c1')?.type).toBe('ACTIVATE_SYSTEM');
    expect(point.candidates).toContainEqual({
      id: expect.stringMatching(/^c\d+$/) as unknown as string,
      type: 'PASS',
      summary: 'Pass for the rest of this round.',
    });
    for (const c of point.candidates.filter((x) => x.type !== 'PASS')) {
      expect(c.type).toBe('ACTIVATE_SYSTEM');
      expect(c.target).toMatch(/^[a-z-]+$/);
    }
    // One activation per system (leaders are rules-equivalent, plan-backend §4.2).
    const targets = point.candidates.filter((x) => x.type !== 'PASS').map((x) => x.target);
    expect(new Set(targets).size).toBe(targets.length);
    expect(point.policyId).toBe('rebellion-bot-v1:normal');
    expect(point.actor).toBe('rebels');
    // Deterministic.
    expect(aiDecision(state)).toEqual(decision);
  });

  it('null when the view has no legal actions (not the side to move)', () => {
    const state = newGame(aiGameSettings('empire', 'hard'), 'dec-2');
    expect(buildDecision(toSideView(state, 'empire'))).toBeNull();
  });

  it('inside an activation FINISH is always offered (TC-BOT-09)', () => {
    let state = newGame(aiGameSettings('rebels', 'hard'), 'dec-3');
    state = step(state, {
      key: 'A|leia|kessel',
      kind: 'activate',
      command: { type: 'ACTIVATE_SYSTEM', leaderId: 'leia', systemId: 'kessel' },
      systemId: 'kessel',
    });
    const decision = aiDecision(state);
    if (!decision) throw new Error('still the Rebels');
    checkDecision(state, decision);
    expect(decision.point.candidates[0]?.type).toBe('FINISH_ACTIVATION');
    expect(decision.point.candidates[0]?.summary).toBe('Finish the activation of kessel.');
  });

  it('legacy AutoPolicy (auto-pass-v1): one candidate c1 with its command', () => {
    const state = newGame(aiGameSettings('rebels', 'easy'), 'dec-4');
    const decision = buildDecision(toSideView(state, 'rebels'), { policy: chooseAutoCommand });
    expect(decision?.point.candidates).toEqual([
      { id: 'c1', type: 'PASS', summary: 'Pass for the rest of this round.' },
    ]);
    expect(decision?.point.policyId).toBe('auto-pass-v1');
    expect(decision?.point.fallbackCandidateId).toBe('c1');
    expect(buildDecision(toSideView(state, 'rebels'), { policy: () => null })).toBeNull();
  });

  it('selectTop keeps the terminating action: replaces the 10th, or appends when there is room', () => {
    const others = Array.from({ length: 12 }, (_, i) => cand(`A|x|${i}`, 'finish')).map(
      (c): BotCandidate => ({ ...c, kind: 'activate' }),
    );
    const finish = cand('F', 'finish');
    const top = selectTop([...others, finish]);
    expect(top).toHaveLength(10);
    expect(top[9]).toBe(finish);
    expect(top.slice(0, 9)).toEqual(others.slice(0, 9));
    expect(selectTop([...others.slice(0, 3), finish])).toEqual([...others.slice(0, 3), finish]);
    const short = selectTop([...others.slice(0, 3), finish], 3);
    expect(short).toEqual([...others.slice(0, 2), finish]);
    expect(selectTop(others.slice(0, 4))).toEqual(others.slice(0, 4));
  });

  it('rankCandidates: score desc then key asc; basePolicy (legacy) puts the terminating action first; accepts only a view', () => {
    const state = newGame(aiGameSettings('rebels', 'normal'), 'dec-5');
    const view = toSideView(state, 'rebels');
    const ranked = rankCandidates(view, 'normal', 'seed');
    for (let i = 1; i < ranked.length; i += 1) {
      const a = ranked[i - 1];
      const b = ranked[i];
      if (!a || !b) throw new Error('ranked');
      expect(a.score > b.score || (a.score === b.score && a.key < b.key)).toBe(true);
    }
    const byBase = rankWith(basePolicy, ranked, policyContext(view, 'normal', 'seed'));
    expect(byBase[0]?.key).toBe('P');
    const rest = byBase.slice(1).map((c) => c.key);
    expect(rest).toEqual([...rest].sort());
    expect(basePolicy(ranked, {} as never)).toEqual(ranked.map((c) => (c.key === 'P' ? 1 : 0)));
    // @ts-expect-error TC-BOT-05: a full game state is not a CorePlayerView
    expect(() => rankCandidates(state, 'normal', 'seed')).toThrow();
  });
});

describe('buildDecision — property on random-walk games (TC-BOT-02)', () => {
  it('every decision point of the AI side is valid and every command is engine-legal (origin auto)', () => {
    let points = 0;
    for (const aiSide of ['empire', 'rebels'] as Faction[]) {
      for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
        for (const seed of ['swr006-p04']) {
          for (const state of walk(aiGameSettings(aiSide, difficulty), `${seed}-${aiSide}`)) {
            if (state.outcome !== null || state.activeSide !== aiSide) continue;
            const decision = aiDecision(state);
            if (!decision) throw new Error('the AI side has legal actions');
            checkDecision(state, decision);
            points += 1;
          }
        }
      }
    }
    console.info(`[bot-decision] decision points checked=${points}`);
    expect(points).toBeGreaterThan(150);
  }, 120_000);
});

describe('Empire decisions are invariant to the hidden base (AC-04, TC-H-01)', () => {
  it('states differing only in the base before the reveal → identical decision points (incl. situation)', () => {
    let compared = 0;
    let states = 0;
    for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
      for (const seed of ['swr006-d07']) {
        const game = walk(aiGameSettings('empire', difficulty), `${seed}-${difficulty}`);
        // Every second Empire decision (the whole game is still walked); all relocations of each.
        const empireTurns = game.filter(
          (s) => !s.rebelBase.revealed && s.outcome === null && s.activeSide === 'empire',
        );
        for (const state of empireTurns.filter((_, i) => i % 2 === 0)) {
          const view = toSideView(state, 'empire');
          const expected = buildDecision(view);
          if (!expected) throw new Error('Empire to move');
          states += 1;
          for (const system of state.map.systems) {
            const moved = relocateBase(state, system.id);
            if (!moved) continue;
            const movedView = toSideView(moved, 'empire');
            // Precondition (SWR-005 redaction): the Empire cannot tell the two states apart.
            expect(movedView).toEqual(view);
            expect(buildDecision(movedView)).toEqual(expected);
            compared += 1;
          }
        }
      }
    }
    console.info(`[bot-invariance] empire states=${states} relocations compared=${compared}`);
    expect(states).toBeGreaterThan(25);
    expect(compared).toBeGreaterThan(250);
  }, 120_000);
});
