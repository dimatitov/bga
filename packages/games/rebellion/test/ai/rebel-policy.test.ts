/**
 * Rebel policy (SWR-006 plan-backend §4.5, PO-1, Q-2, Q-BE-3, Q-13): consolidation of the fleet towards the
 * base, evacuation per difficulty (easy proactive, normal only under threat + game coin, hard never — filter),
 * termination. Informative for AC-06 (thresholds are calibrated by W8).
 */
import { describe, expect, it } from 'vitest';
import {
  botSeed,
  buildViewModel,
  enumerateCandidates,
  gameCoin,
  rankCandidates,
  type BotCandidate,
} from '../../src/ai';
import { REBEL_PROFILES } from '../../src/ai/profiles';
import { allowRebels, emptiesBase, rebelSituation } from '../../src/ai/rebel-policy';
import { policyContext } from '../../src/ai/rank';
import { toSideView } from '../../src/rules';
import type { CoreGameState, Difficulty } from '../../src/schema';
import { aiGameSettings, newGame, step, walk } from './fixtures/walk';

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

const baseEmpty = (s: CoreGameState) =>
  !s.units.some((u) => u.owner === 'rebels' && u.systemId === s.rebelBase.systemId);

/** Imperial ground in the base or adjacent (Q-13), from the true state (= the Rebels' view of it). */
function threat(s: CoreGameState): boolean {
  const base = s.rebelBase.systemId;
  const around = new Set([
    base,
    ...(s.map.systems.find((x) => x.id === base)?.adjacentSystemIds ?? []),
  ]);
  return s.units.some(
    (u) =>
      u.owner === 'empire' && around.has(u.systemId) && /stormtrooper|at-st|at-at/.test(u.typeKey),
  );
}

/** Rebels (AI, `difficulty`) vs an Empire chooser; every state of the game. */
function play(difficulty: Difficulty, empire: Chooser, sessionId: string): CoreGameState[] {
  let state = newGame(aiGameSettings('rebels', difficulty), sessionId);
  const states = [state];
  for (let i = 0; i < 1500 && state.outcome === null; i += 1) {
    state = step(state, state.activeSide === 'rebels' ? bot(difficulty)(state) : empire(state));
    states.push(state);
  }
  if (state.outcome === null) throw new Error(`game ${sessionId} did not end`);
  return states;
}

/** A start state of an AI-Rebels game with the Bothawui fleet already in the base (+ optional threat). */
function fleetInBase(difficulty: Difficulty, sessionId: string, withThreat: boolean) {
  const state = newGame(aiGameSettings('rebels', difficulty), sessionId);
  const base = state.rebelBase.systemId;
  const neighbour = state.map.systems.find((s) => s.id === base)?.adjacentSystemIds[0];
  if (!neighbour) throw new Error('base without neighbours');
  let trooperMoved = false;
  const units = state.units.map((u) => {
    if (u.owner === 'rebels' && /corellian-corvette|rebel-transport/.test(u.typeKey)) {
      return { ...u, systemId: base };
    }
    if (withThreat && !trooperMoved && u.typeKey === 'unit.empire.stormtrooper') {
      trooperMoved = true;
      return { ...u, systemId: neighbour };
    }
    return u;
  });
  return { ...state, units };
}

/** Session ids whose game coin for `salt` is below / not below `limit`. */
function sessionsByCoin(salt: string, limit: number): { below: string; above: string } {
  let below: string | null = null;
  let above: string | null = null;
  for (let i = 0; i < 200 && (below === null || above === null); i += 1) {
    const id = `coin-${i}`;
    if (gameCoin({ id }, salt) < limit) below ??= id;
    else above ??= id;
  }
  if (below === null || above === null) throw new Error('no coin split');
  return { below, above };
}

describe('Rebel policy — consolidation (Q-2)', () => {
  it('the first decision activates the next hop of the Bothawui fleet towards the base (normal / hard)', () => {
    for (const difficulty of ['normal', 'hard'] as Difficulty[]) {
      for (const id of ['reb-c1', 'reb-c2', 'reb-c3', 'reb-c4']) {
        const state = newGame(aiGameSettings('rebels', difficulty), id);
        const view = toSideView(state, 'rebels');
        const model = buildViewModel(view);
        const base = state.rebelBase.systemId;
        const first = rankCandidates(view, difficulty, botSeed(view))[0];
        expect(first?.kind).toBe('activate');
        const target = first?.systemId ?? '';
        expect(model.adjacency.get('bothawui')).toContain(target);
        expect(model.distance(target, base)).toBe(model.distance('bothawui', base) - 1);
      }
    }
  });

  it('inside the consolidation activation the fleet moves with the cargo of the difficulty', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
      let state = newGame(aiGameSettings('rebels', difficulty), 'reb-cargo');
      const base = state.rebelBase.systemId;
      const model0 = buildViewModel(toSideView(state, 'rebels'));
      const hop = model0.adjacency
        .get('bothawui')
        ?.find((n) => model0.distance(n, base) === model0.distance('bothawui', base) - 1);
      if (!hop) throw new Error('no hop');
      state = step(state, {
        key: `A|leia|${hop}`,
        kind: 'activate',
        command: { type: 'ACTIVATE_SYSTEM', leaderId: 'leia', systemId: hop },
        systemId: hop,
      });
      const view = toSideView(state, 'rebels');
      const ranked = rankCandidates(view, difficulty, botSeed(view));
      const move = ranked.find((c) => c.kind === 'move');
      expect(move?.variants).toContain(REBEL_PROFILES[difficulty].cargo);
      if (difficulty !== 'easy') expect(ranked[0]).toBe(move);
    }
  });
});

describe('Rebel policy — hard never leaves the base empty (PO-1)', () => {
  it('crafted: fleet in the base under threat → no emptying MOVE among the ranked candidates', () => {
    let state = fleetInBase('hard', 'reb-h1', true);
    const base = state.rebelBase.systemId;
    const neighbour = state.map.systems.find((s) => s.id === base)?.adjacentSystemIds[1] ?? '';
    state = step(state, {
      key: `A|leia|${neighbour}`,
      kind: 'activate',
      command: { type: 'ACTIVATE_SYSTEM', leaderId: 'leia', systemId: neighbour },
      systemId: neighbour,
    });
    const view = toSideView(state, 'rebels');
    const model = buildViewModel(view);
    const all = enumerateCandidates(view);
    expect(all.some((c) => emptiesBase(c, model, base))).toBe(true); // the engine allows it…
    const ranked = rankCandidates(view, 'hard', botSeed(view));
    expect(ranked.some((c) => emptiesBase(c, model, base))).toBe(false); // …the hard bot never offers it
    const ctx = policyContext(view, 'hard', 'x');
    for (const c of all) expect(allowRebels(c, ctx)).toBe(!emptiesBase(c, model, base));
    expect(ranked[0]?.kind).toBe('finish');
  });

  it('property: hard Rebels keep ≥ 1 unit in the base after every command (bot Empires + random walks)', () => {
    let games = 0;
    let decisions = 0;
    for (const [name, empire] of [
      ['passive', passive],
      ['normal', bot('normal')],
      ['hard', bot('hard')],
    ] as const) {
      for (let g = 0; g < 6; g += 1) {
        const states = play('hard', empire, `reb-hard-${name}-${g}`);
        games += 1;
        for (const s of states) expect(baseEmpty(s)).toBe(false);
      }
    }
    for (const s of walk(aiGameSettings('rebels', 'hard'), 'reb-hard-walk', {
      choose: (state) => (state.activeSide === 'rebels' ? bot('hard')(state) : null),
    })) {
      expect(baseEmpty(s)).toBe(false);
      if (s.activeSide !== 'rebels' || s.outcome !== null) continue;
      const view = toSideView(s, 'rebels');
      const model = buildViewModel(view);
      const ranked = rankCandidates(view, 'hard', botSeed(view));
      expect(ranked.some((c) => emptiesBase(c, model, s.rebelBase.systemId))).toBe(false);
      decisions += 1;
    }
    console.info(`[rebel-hard] games=${games} walk decisions=${decisions}`);
    expect(decisions).toBeGreaterThan(5);
  }, 120_000);
});

describe('Rebel policy — normal evacuates only under threat and when the game coin allows (Q-BE-3, Q-13)', () => {
  const { below, above } = sessionsByCoin('normal-evac', 0.5);

  function firstChoice(state: CoreGameState): BotCandidate | undefined {
    const view = toSideView(state, 'rebels');
    return rankCandidates(view, 'normal', botSeed(view))[0];
  }

  it('fleet in the base, threat, coin < 0.5 → activates a neighbour of the base to evacuate', () => {
    const state = fleetInBase('normal', below, true);
    const s = rebelSituation(policyContext(toSideView(state, 'rebels'), 'normal', 'x'));
    expect(s).toMatchObject({ threat: true, evacuable: true, evacuationAllowed: true });
    const first = firstChoice(state);
    expect(first?.kind).toBe('activate');
    const neighbours = state.map.systems.find(
      (x) => x.id === state.rebelBase.systemId,
    )?.adjacentSystemIds;
    expect(neighbours).toContain(first?.systemId);
    // …and then moves everything out (the base is empty afterwards).
    if (!first) throw new Error('no choice');
    let next = step(state, first);
    next = step(next, firstChoice(next) as BotCandidate);
    expect(baseEmpty(next)).toBe(true);
  });

  it('no threat, or coin ≥ 0.5 → stays (PASS)', () => {
    expect(firstChoice(fleetInBase('normal', below, false))?.kind).toBe('pass');
    expect(firstChoice(fleetInBase('normal', above, true))?.kind).toBe('pass');
  });

  it('property: every emptying of the base by normal Rebels happens under threat; never vs a passive Empire', () => {
    let empties = 0;
    for (let g = 0; g < 8; g += 1) {
      for (const s of play('normal', passive, `reb-np-${g}`)) expect(baseEmpty(s)).toBe(false);
      const states = play('normal', bot('normal'), `reb-nh-${g}`);
      states.forEach((s, i) => {
        if (i === 0 || !baseEmpty(s) || baseEmpty(states[i - 1] as CoreGameState)) return;
        empties += 1;
        expect(threat(states[i - 1] as CoreGameState)).toBe(true);
      });
    }
    console.info(`[rebel-normal] emptyings under a hunting Empire=${empties} (8 games)`);
  }, 120_000);
});

describe('Rebel policy — easy leaves the base proactively (PO-1)', () => {
  it('fleet in the base, no threat, coin < 0.8 → evacuation ranked first', () => {
    const { below, above } = sessionsByCoin('easy-expand', 0.8);
    const state = fleetInBase('easy', below, false);
    const view = toSideView(state, 'rebels');
    expect(rebelSituation(policyContext(view, 'easy', 'x'))?.evacuationAllowed).toBe(true);
    const first = rankCandidates(view, 'easy', botSeed(view))[0];
    expect(first?.kind).toBe('activate');
    expect(
      state.map.systems.find((x) => x.id === state.rebelBase.systemId)?.adjacentSystemIds,
    ).toContain(first?.systemId);
    expect(
      rebelSituation(
        policyContext(toSideView(fleetInBase('easy', above, false), 'rebels'), 'easy', 'x'),
      )?.evacuationAllowed,
    ).toBe(false);
  });

  it('vs a passive Empire the easy base is emptied in a noticeable share of games; normal/hard never', () => {
    const emptied = { easy: 0, normal: 0, hard: 0 };
    for (const difficulty of ['easy', 'normal', 'hard'] as Difficulty[]) {
      for (let g = 0; g < 10; g += 1) {
        if (play(difficulty, passive, `reb-share-${g}`).some(baseEmpty)) emptied[difficulty] += 1;
      }
    }
    console.info(`[rebel-share] emptied vs passive Empire (10 games) ${JSON.stringify(emptied)}`);
    expect(emptied.easy).toBeGreaterThanOrEqual(3);
    expect(emptied.normal).toBe(0);
    expect(emptied.hard).toBe(0);
  }, 120_000);
});
