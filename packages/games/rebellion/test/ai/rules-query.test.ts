/**
 * SWR-008 W4 — the public rules query of a decision point (plan-backend §2 C-4, §3.1, §3.4, §9; spec QD-7;
 * test-cases.md TC-H-02, TC-H-06 (unit part)).
 * - C-4 table: activation null / own activation × base hidden / revealed × opponent passed, both viewers.
 * - Only the three public fields are read (property-access tracking) and changing anything else in the view
 *   never changes the query (metamorphic).
 * - TC-H-02: on the bot-vs-bot games of `SEEDS_P` (`swr008-p01..p30`, all 9 difficulty pairs) the query and the
 *   whole rules-selection input `{actor, phase, commandTypes, tags}` are equal for every state of the AI Empire
 *   before the reveal and every relocation of the hidden base (`relocateBase`, all eligible bases); the same holds
 *   for the AI Rebels (their own view does show the base, the query does not), and the query of either AI side
 *   is computable from the OPPONENT's view (public to both sides).
 * - AI Rebels: the query does not depend on the Rebel units on the hidden base (an activation next to the base
 *   with / without movable units in it — `MOVE_PIECES` from the base exists only in the first case).
 */
import { RULES_CONTEXT_LIMITS, rulesSelectionInputOf } from '@bga/platform';
import { describe, expect, it } from 'vitest';
import {
  REBELLION_RULE_TAGS,
  buildDecision,
  enumerateCandidates,
  rulesQueryFor,
  type BotRulesQuery,
} from '../../src/ai';
import { applyCommand, toSideView } from '../../src/rules';
import { coreDataBaseV1 } from '../../src/scenario';
import {
  eligibleRebelBaseSystemIds,
  opponentOf,
  type CoreGameState,
  type CorePlayerView,
  type Faction,
} from '../../src/schema';
import { relocateBase } from './fixtures/relocate-base';
import { aiGameSettings, newGame, NOW, step, walk } from './fixtures/walk';
import { PAIRS, aiSideFor, botVsBot, type Pair } from './sim/bot-games';

const IDLE = ['ACTIVATE_SYSTEM', 'PASS'];
const ACTIVE = ['FINISH_ACTIVATION', 'MOVE_PIECES'];
const ELIGIBLE = eligibleRebelBaseSystemIds(coreDataBaseV1);

/** `SEEDS_P` of SWR-008 test-cases.md (Conventions): `swr008-p01 … swr008-p30`. */
const SEEDS_P = Array.from({ length: 30 }, (_, i) => `swr008-p${String(i + 1).padStart(2, '0')}`);

/** The rules-selection input of plan-backend §3.1 (`rulesSelectionInputOf` minus `maxChars`). */
function selectionInput(view: CorePlayerView) {
  const query = rulesQueryFor(view);
  return {
    actor: view.viewer,
    phase: view.phase,
    commandTypes: query.commandTypes,
    tags: query.tags,
  };
}

/** The query the OTHER side can compute from its own view for the AI side `aiSide` (C-4 table, public fields). */
function expectedFromOpponentView(other: CorePlayerView, aiSide: Faction): BotRulesQuery {
  const tags = [other.rebelBase.revealed ? 'base-revealed' : 'base-hidden'];
  if (other.passed[opponentOf(aiSide)]) tags.push('opponent-passed');
  return { commandTypes: other.activation === null ? IDLE : ACTIVE, tags: tags.sort() };
}

/** A real view of `viewer` with the three public inputs overridden (pure function → synthetic views are fine). */
function viewWith(
  viewer: Faction,
  active: boolean,
  revealed: boolean,
  opponentPassed: boolean,
): CorePlayerView {
  const base = toSideView(newGame(aiGameSettings('rebels', 'normal'), 'rq-table'), viewer);
  return {
    ...base,
    activation: active
      ? { side: viewer, leaderId: 'any', location: { kind: 'system', systemId: 'kessel' } }
      : null,
    rebelBase: { ...base.rebelBase, revealed },
    passed: { ...base.passed, [opponentOf(viewer)]: opponentPassed, [viewer]: false },
  } as CorePlayerView;
}

describe('rulesQueryFor — C-4 table', () => {
  const sides: Faction[] = ['empire', 'rebels'];
  for (const viewer of sides) {
    for (const active of [false, true]) {
      for (const revealed of [false, true]) {
        for (const opponentPassed of [false, true]) {
          it(`${viewer}: activation=${active} revealed=${revealed} opponentPassed=${opponentPassed}`, () => {
            const query = rulesQueryFor(viewWith(viewer, active, revealed, opponentPassed));
            const tags = [revealed ? 'base-revealed' : 'base-hidden'];
            if (opponentPassed) tags.push('opponent-passed');
            expect(query).toEqual({ commandTypes: active ? ACTIVE : IDLE, tags });
            // Sorted, unique, only known tags; the schema regex of C-3.
            expect(query.tags).toEqual([...new Set(query.tags)].sort());
            expect(query.commandTypes).toEqual([...new Set(query.commandTypes)].sort());
            for (const tag of query.tags) {
              expect(REBELLION_RULE_TAGS).toContain(tag);
              expect(tag).toMatch(/^[a-z0-9][a-z0-9-]{0,31}$/);
            }
          });
        }
      }
    }
  }

  it('the own pass does not add a tag; fresh arrays on every call', () => {
    const view = viewWith('empire', false, false, false);
    const ownPassed = { ...view, passed: { ...view.passed, empire: true } };
    expect(rulesQueryFor(ownPassed)).toEqual({ commandTypes: IDLE, tags: ['base-hidden'] });
    const a = rulesQueryFor(view);
    const b = rulesQueryFor(view);
    expect(a).toEqual(b);
    a.commandTypes.push('X');
    a.tags.push('x');
    expect(rulesQueryFor(view)).toEqual(b);
    expect(b.commandTypes).toEqual(IDLE);
  });

  it('inside an activation MOVE_PIECES is listed even when no move is legal now (QD-7)', () => {
    let state = newGame(aiGameSettings('rebels', 'normal'), 'rq-active');
    const activate = enumerateCandidates(toSideView(state, 'rebels')).find(
      (c) => c.kind === 'activate',
    );
    if (!activate) throw new Error('the Rebels can activate');
    state = step(state, activate);
    const view = toSideView(state, 'rebels');
    const noMoves = {
      ...view,
      legalActions: view.legalActions.filter((a) => a.type !== 'MOVE_PIECES'),
    };
    expect(noMoves.legalActions.map((a) => a.type)).toEqual(['FINISH_ACTIVATION']);
    expect(rulesQueryFor(noMoves)).toEqual({ commandTypes: ACTIVE, tags: ['base-hidden'] });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Only the public fields are read
// ---------------------------------------------------------------------------------------------------------

/** Deep proxy recording every property path read (and `<path>.*` for enumeration). */
function tracked<T extends object>(value: T, path: string, reads: Set<string>): T {
  return new Proxy(value, {
    get(target, key, receiver) {
      const v: unknown = Reflect.get(target, key, receiver);
      if (typeof key === 'symbol') return v;
      const p = path === '' ? key : `${path}.${key}`;
      reads.add(p);
      return v !== null && typeof v === 'object' ? tracked(v, p, reads) : v;
    },
    has(target, key) {
      if (typeof key === 'string') reads.add(path === '' ? key : `${path}.${key}`);
      return Reflect.has(target, key);
    },
    ownKeys(target) {
      reads.add(path === '' ? '*' : `${path}.*`);
      return Reflect.ownKeys(target);
    },
  });
}

/** Views of both sides along random-walk AI games (both AI sides, several seeds). */
function sampleViews(): CorePlayerView[] {
  const views: CorePlayerView[] = [];
  for (const aiSide of ['empire', 'rebels'] as Faction[]) {
    for (const seed of ['rq-w1', 'rq-w2', 'rq-w3']) {
      for (const state of walk(aiGameSettings(aiSide, 'normal'), `${seed}-${aiSide}`)) {
        views.push(toSideView(state, 'empire'), toSideView(state, 'rebels'));
      }
    }
  }
  return views;
}

/** Changes of the view that keep the three public inputs (activation null-ness, revealed, opponent's pass). */
const JUNK: Record<string, unknown> = {};
function mutations(view: CorePlayerView): [string, CorePlayerView][] {
  const out: [string, CorePlayerView][] = [];
  const keep = new Set(['activation', 'rebelBase', 'passed', 'viewer']);
  for (const key of Object.keys(view)) {
    if (keep.has(key)) continue;
    const old = (view as Record<string, unknown>)[key];
    const junk = Array.isArray(old)
      ? []
      : typeof old === 'number'
        ? 987
        : typeof old === 'string'
          ? 'junk'
          : old === null
            ? { winner: 'empire', reason: 'junk' }
            : JUNK;
    out.push([key, { ...view, [key]: junk } as CorePlayerView]);
  }
  out.push(['rebelBase.systemId', { ...view, rebelBase: { ...view.rebelBase, systemId: 'junk' } }]);
  out.push([
    'rebelBase.systemId=null',
    { ...view, rebelBase: { ...view.rebelBase, systemId: null } },
  ]);
  out.push([
    'passed[viewer]',
    { ...view, passed: { ...view.passed, [view.viewer]: !view.passed[view.viewer] } },
  ]);
  if (view.activation !== null) {
    out.push([
      'activation contents',
      {
        ...view,
        activation: {
          side: opponentOf(view.activation.side),
          leaderId: 'junk',
          location: { kind: 'rebelBase' },
        },
      } as CorePlayerView,
    ]);
  }
  // Everything at once.
  const all = out.reduce<CorePlayerView>(
    (acc, [, m]) => ({
      ...acc,
      ...Object.fromEntries(
        Object.entries(m).filter(
          ([k]) => (m as Record<string, unknown>)[k] !== (view as Record<string, unknown>)[k],
        ),
      ),
    }),
    view,
  );
  out.push(['all', all]);
  return out;
}

describe('rulesQueryFor reads only public fields (§3.4 metamorphic, QD-7)', () => {
  const views = sampleViews();

  it('the sample covers every combination of the three inputs for both viewers', () => {
    const combos = new Set(
      views.map(
        (v) =>
          `${v.viewer}|${v.activation !== null}|${v.rebelBase.revealed}|${v.passed[opponentOf(v.viewer)]}`,
      ),
    );
    console.info(`[rules-query] sample views=${views.length} combos=${combos.size}`);
    expect(views.length).toBeGreaterThan(200);
    // Both viewers × activation × revealed × opponent passed = 16; the random walks reach at least 8 of them,
    // the C-4 table above covers all 16 synthetically.
    expect(combos.size).toBeGreaterThanOrEqual(8);
  });

  it('property-access tracking: only viewer, activation (null-ness), rebelBase.revealed, passed[opponent]', () => {
    for (const view of views) {
      const reads = new Set<string>();
      const query = rulesQueryFor(tracked(view, '', reads));
      expect(query).toEqual(rulesQueryFor(view));
      const allowed = new Set([
        'viewer',
        'activation',
        'rebelBase',
        'rebelBase.revealed',
        'passed',
        `passed.${opponentOf(view.viewer)}`,
      ]);
      expect([...reads].filter((p) => !allowed.has(p))).toEqual([]);
    }
  });

  it('changing any other field of the view (or all of them) never changes the query', () => {
    let compared = 0;
    for (const view of views) {
      const expected = rulesQueryFor(view);
      for (const [name, mutated] of mutations(view)) {
        expect(rulesQueryFor(mutated), name).toEqual(expected);
        compared += 1;
      }
    }
    console.info(`[rules-query] metamorphic mutations compared=${compared}`);
    expect(compared).toBeGreaterThan(views.length * 20);
  });
});

// ---------------------------------------------------------------------------------------------------------
// TC-H-02: invariance to the hidden base on SEEDS_P (both AI sides)
// ---------------------------------------------------------------------------------------------------------

describe('TC-H-02 — the rules query is invariant to the hidden base (SEEDS_P bot-vs-bot)', () => {
  it(
    'AI Empire before the reveal: query and selection input equal for every relocation; AI Rebels likewise; ' +
      'either AI side’s query is computable from the opponent’s view',
    { timeout: 180_000 },
    () => {
      const stats = { empireStates: 0, empireRelocations: 0, rebelStates: 0, rebelRelocations: 0 };
      const pairsSeenByEmpire = new Set<string>();
      SEEDS_P.forEach((sessionId, index) => {
        const pair = PAIRS[index % PAIRS.length] as Pair;
        const aiSide = aiSideFor(index);
        const game = botVsBot(sessionId, index, pair);
        for (const rec of game.records) {
          if (rec.by !== 'ai') continue;
          const s: CoreGameState = rec.before;
          const view = toSideView(s, aiSide);
          const input = selectionInput(view);
          // The local mirror equals the server's `rulesSelectionInputOf` on the real decision point.
          const point = buildDecision(view)?.point;
          if (!point) throw new Error('the AI side has a move');
          expect(rulesSelectionInputOf(point, RULES_CONTEXT_LIMITS.maxCharsDefault)).toEqual({
            ...input,
            maxChars: RULES_CONTEXT_LIMITS.maxCharsDefault,
          });
          // Public to both sides: the opponent's view gives the same query.
          expect(rulesQueryFor(view)).toEqual(
            expectedFromOpponentView(toSideView(s, opponentOf(aiSide)), aiSide),
          );
          if (s.rebelBase.revealed) continue;
          if (aiSide === 'empire') {
            stats.empireStates += 1;
            pairsSeenByEmpire.add(`${pair.empire}/${pair.rebels}`);
          } else stats.rebelStates += 1;
          for (const to of ELIGIBLE) {
            const moved = relocateBase(s, to);
            if (!moved) continue;
            const movedView = toSideView(moved, aiSide);
            expect(selectionInput(movedView), `${sessionId}@v${s.version}→${to}`).toEqual(input);
            if (aiSide === 'empire') stats.empireRelocations += 1;
            else stats.rebelRelocations += 1;
          }
        }
      });
      console.info(
        `[rules-query] TC-H-02 SEEDS_P games=${SEEDS_P.length} ` +
          `empire states=${stats.empireStates} relocations=${stats.empireRelocations} ` +
          `rebels states=${stats.rebelStates} relocations=${stats.rebelRelocations} ` +
          `empire pairs=${pairsSeenByEmpire.size}`,
      );
      expect(pairsSeenByEmpire.size).toBe(9);
      expect(stats.empireStates).toBeGreaterThan(100);
      expect(stats.empireRelocations).toBeGreaterThan(stats.empireStates);
      expect(stats.rebelRelocations).toBeGreaterThan(stats.rebelStates);
    },
  );
});

// ---------------------------------------------------------------------------------------------------------
// AI Rebels: independent of the units on the hidden base
// ---------------------------------------------------------------------------------------------------------

describe('AI Rebels: the query does not depend on the units on the hidden base (QD-7, TC-H-06 unit part)', () => {
  function adjacentToBase(state: CoreGameState): string[] {
    const base = state.map.systems.find((s) => s.id === state.rebelBase.systemId);
    return base?.adjacentSystemIds ?? [];
  }

  it('activation next to the base with / without movable Rebel units in it → equal query', () => {
    let checked = 0;
    for (const seed of ['rq-near-1', 'rq-near-2', 'rq-near-3', 'rq-near-4']) {
      const withUnits = newGame(aiGameSettings('rebels', 'normal'), seed);
      const base = withUnits.rebelBase.systemId;
      expect(withUnits.units.some((u) => u.owner === 'rebels' && u.systemId === base)).toBe(true);
      // The same game with the base emptied (artificial; the query must not care).
      const withoutUnits: CoreGameState = {
        ...withUnits,
        units: withUnits.units.filter((u) => !(u.owner === 'rebels' && u.systemId === base)),
      };
      const near = new Set(adjacentToBase(withUnits));
      const activations = enumerateCandidates(toSideView(withUnits, 'rebels')).filter(
        (c) => c.kind === 'activate' && c.systemId !== null && near.has(c.systemId),
      );
      expect(activations.length).toBeGreaterThan(0);
      for (const activation of activations) {
        const a = applyCommand(
          withUnits,
          { actor: 'rebels', expectedVersion: withUnits.version, command: activation.command },
          { now: NOW, origin: 'auto' },
        );
        const b = applyCommand(
          withoutUnits,
          { actor: 'rebels', expectedVersion: withoutUnits.version, command: activation.command },
          { now: NOW, origin: 'auto' },
        );
        if (!a.ok || !b.ok) throw new Error('activation rejected');
        const viewA = toSideView(a.state as CoreGameState, 'rebels');
        const viewB = toSideView(b.state as CoreGameState, 'rebels');
        const fromBase = (v: CorePlayerView) =>
          v.legalActions.filter((x) => x.type === 'MOVE_PIECES' && x.fromSystemId === base).length;
        // Premise: the candidate types differ (a move from the base exists only with units in it).
        expect(fromBase(viewA)).toBeGreaterThan(0);
        expect(fromBase(viewB)).toBe(0);
        expect(rulesQueryFor(viewA)).toEqual({ commandTypes: ACTIVE, tags: ['base-hidden'] });
        expect(rulesQueryFor(viewB)).toEqual(rulesQueryFor(viewA));
        expect(selectionInput(viewB)).toEqual(selectionInput(viewA));
        checked += 1;
      }
    }
    console.info(`[rules-query] rebels near-base activations checked=${checked}`);
    expect(checked).toBeGreaterThanOrEqual(4);
  });
});
