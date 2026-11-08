/**
 * SWR-004 R0: upcaster v1 → v2 (TC-U-26..31) on the frozen SWR-003 snapshots in `test/fixtures/v1`.
 * The v1 fixtures keep `'rebellion'` on purpose — they are the input of the upgrade (TC-R-03).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mockScenario } from '../../src/scenario';
import { GameStateSchema, type GameState, type MockGameState } from '../../src/schema';
import {
  rebellionServerModule,
  upcastEvent,
  upcastSettings,
  upcastState,
  upcastStoredSetup,
} from '../../src/server';
import { GameStateV1Schema } from '../../src/server/legacy-v1';

const LEGACY = 'rebellion';

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../fixtures/v1/${name}`, import.meta.url), 'utf8')) as T;
}

interface SetupsFixture {
  stored: unknown[];
  inputs: { aiWithoutDifficulty: unknown; aiWithoutDifficultyParsed: unknown };
}
const setups = fixture<SetupsFixture>('setups.v1.json');
const rebelHuman = fixture<{ state: unknown }>('state.v1.rebellion-human.json').state;
const empireAi = fixture<{ state: unknown }>('state.v1.empire-ai.json').state;

/** Every string value equal to the legacy faction id, with its JSON path (keys like `rebelBase` are fine). */
function legacyFactionValues(value: unknown, path = '$'): string[] {
  if (value === LEGACY) return [path];
  if (typeof value === 'string' && /^(unit|leader|token)\.rebellion\./.test(value)) return [path];
  if (Array.isArray(value)) return value.flatMap((v, i) => legacyFactionValues(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => legacyFactionValues(v, `${path}.${k}`));
  }
  return [];
}

/** v1/v2 rows always upcast to the `mock-v1` engine (SWR-005). */
function asMock(state: GameState): MockGameState {
  if (state.rulesEngine !== 'mock-v1') throw new Error('expected a mock-v1 state');
  return state;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('fixtures v1 (TR-4b)', () => {
  it('are real SWR-003 data: v1 schema, legacy faction present, < 50 KB', () => {
    for (const name of [
      'setups.v1.json',
      'state.v1.rebellion-human.json',
      'state.v1.empire-ai.json',
    ]) {
      const text = readFileSync(new URL(`../fixtures/v1/${name}`, import.meta.url), 'utf8');
      expect(text.length).toBeLessThan(50 * 1024);
    }
    const rh = GameStateV1Schema.parse(rebelHuman);
    expect(rh.setup).toEqual({ humanFaction: LEGACY, opponent: { kind: 'human' } });
    expect([rh.version, rh.round]).toEqual([5, 2]);
    expect(legacyFactionValues(rebelHuman).length).toBeGreaterThan(0);
    expect(GameStateV1Schema.parse(empireAi).version).toBe(2);
  });
});

describe('upcastStoredSetup / upcastSettings', () => {
  it('TC-U-26: {rebellion, ai/hard} → rebels vs empire, hard, base, digital', () => {
    expect(upcastSettings(setups.stored[0])).toEqual({
      playerFaction: 'rebels',
      opponentFaction: 'empire',
      opponentType: 'ai',
      aiDifficulty: 'hard',
      ruleset: 'base',
      gameMode: 'digital',
    });
    expect(upcastStoredSetup(setups.stored[0])).toMatchObject({
      schemaVersion: 2,
      playerFaction: 'rebels',
    });
  });

  it('TC-U-27: human → aiDifficulty null, opponent rebels; AI without difficulty → normal', () => {
    expect(upcastSettings(setups.stored[1])).toEqual({
      playerFaction: 'empire',
      opponentFaction: 'rebels',
      opponentType: 'human',
      aiDifficulty: null,
      ruleset: 'base',
      gameMode: 'digital',
    });
    expect(upcastSettings(setups.stored[2])).toMatchObject({ aiDifficulty: 'normal' });
    expect(upcastSettings(setups.inputs.aiWithoutDifficulty)).toMatchObject({
      opponentType: 'ai',
      aiDifficulty: 'normal',
    });
    expect(upcastSettings(setups.inputs.aiWithoutDifficultyParsed)).toEqual(
      upcastSettings(setups.inputs.aiWithoutDifficulty),
    );
  });

  it('TC-U-30: idempotent on v2', () => {
    for (const raw of setups.stored) {
      const once = upcastStoredSetup(raw);
      expect(upcastStoredSetup(once)).toEqual(once);
    }
  });

  it('TC-U-31: garbage and unknown versions throw', () => {
    expect(() => upcastStoredSetup({ humanFaction: 'sith', opponent: { kind: 'ai' } })).toThrow();
    expect(() =>
      upcastStoredSetup({ ...upcastStoredSetup(setups.stored[0]), schemaVersion: 99 }),
    ).toThrow();
    expect(() =>
      upcastStoredSetup({ schemaVersion: 1, humanFaction: 'empire', opponent: { kind: 'human' } }),
    ).toThrow();
    expect(() => upcastStoredSetup(null)).toThrow();
    // v2 with an inconsistent opponent is rejected too.
    expect(() =>
      upcastStoredSetup({ ...upcastStoredSetup(setups.stored[0]), opponentFaction: 'rebels' }),
    ).toThrow();
  });
});

describe('upcastState', () => {
  it('TC-U-28: no legacy faction left; counts, positions, version/round/phase kept; hot-seat fields added', () => {
    const v1 = GameStateV1Schema.parse(rebelHuman);
    const before = JSON.stringify(rebelHuman);
    const v2 = asMock(upcastState(rebelHuman));
    expect(JSON.stringify(rebelHuman)).toBe(before); // input not mutated
    expect(legacyFactionValues(v2)).toEqual([]);
    expect(v2.schemaVersion).toBe(3);
    expect(v2.rulesEngine).toBe('mock-v1');
    expect(v2.settings).toEqual({
      playerFaction: 'rebels',
      opponentFaction: 'empire',
      opponentType: 'human',
      aiDifficulty: null,
      ruleset: 'base',
      gameMode: 'digital',
    });
    expect([v2.activeSide, v2.handoffPending]).toEqual(['rebels', false]);
    expect([v2.id, v2.version, v2.round, v2.phase]).toEqual([
      v1.id,
      v1.version,
      v1.round,
      v1.phase,
    ]);
    expect(v2.systems).toEqual(v1.systems);
    expect(v2.rebelBase).toEqual(v1.rebelBase);
    expect(v2.pieces).toHaveLength(v1.pieces.length);
    expect(v2.log).toHaveLength(v1.log.length);
    for (const [i, p] of v1.pieces.entries()) {
      const q = v2.pieces[i]!;
      expect([q.id, q.kind, q.systemId, q.hidden]).toEqual([p.id, p.kind, p.systemId, p.hidden]);
      expect(q.owner).toBe(p.owner === LEGACY ? 'rebels' : 'empire');
      expect(q.typeKey).toBe(p.typeKey.replace('.rebellion.', '.rebels.'));
    }
    // The upgraded pieces are exactly the current scenario's pieces (moved one excepted by position).
    expect(v2.pieces.map((p) => [p.id, p.owner, p.typeKey])).toEqual(
      mockScenario.pieces.map((p) => [p.id, p.owner, p.typeKey]),
    );
    expect(GameStateSchema.parse(v2)).toEqual(v2);
  });

  it('TC-U-28: AI game of the Empire → activeSide empire, no handoff, difficulty kept', () => {
    const v2 = upcastState(empireAi);
    expect(v2.settings).toMatchObject({
      playerFaction: 'empire',
      opponentType: 'ai',
      aiDifficulty: 'hard',
    });
    expect([v2.activeSide, v2.handoffPending]).toEqual(['empire', false]);
    expect(legacyFactionValues(v2)).toEqual([]);
  });

  it('TC-U-30: idempotent (v2 → v2 unchanged), works on frozen input', () => {
    const once = upcastState(deepFreeze(structuredClone(rebelHuman)));
    expect(upcastState(once)).toEqual(once);
    expect(upcastState(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it('TC-U-31: garbage and unknown versions throw', () => {
    const v2 = asMock(upcastState(rebelHuman));
    expect(() => upcastState({ ...v2, schemaVersion: 99 })).toThrow();
    const bad = structuredClone(rebelHuman) as { setup: { humanFaction: string } };
    bad.setup.humanFaction = 'sith';
    expect(() => upcastState(bad)).toThrow();
    expect(() => upcastState({ ...(rebelHuman as object), extra: 1 })).toThrow();
    expect(() => upcastState('nope')).toThrow();
    // A v2 AI game with a handoff violates the invariant.
    const ai = upcastState(empireAi);
    expect(() => upcastState({ ...ai, handoffPending: true } satisfies GameState)).toThrow();
  });
});

describe('upcastEvent', () => {
  it('TC-U-29: actor rebellion → rebels; empire/system unchanged; seq, at, payload unchanged', () => {
    const v1 = GameStateV1Schema.parse(rebelHuman);
    expect(new Set(v1.log.map((e) => e.type))).toEqual(
      new Set(['GAME_CREATED', 'PIECES_MOVED', 'PHASE_ADVANCED']),
    );
    for (const e of v1.log) {
      const up = upcastEvent(e);
      expect(up.actor).toBe(e.actor === LEGACY ? 'rebels' : e.actor);
      expect([up.seq, up.at, up.type, up.payload]).toEqual([e.seq, e.at, e.type, e.payload]);
      expect(upcastEvent(up)).toEqual(up);
    }
    for (const e of GameStateV1Schema.parse(empireAi).log) expect(upcastEvent(e)).toEqual(e);
    expect(() => upcastEvent({ ...v1.log[1]!, actor: 'sith' })).toThrow();
  });
});

describe('rebellionServerModule on v1 rows (lazy upcast, Q-16)', () => {
  it('parseState reads v1 and keeps the row version; the next command writes v3 mock-v1', () => {
    const v1 = GameStateV1Schema.parse(rebelHuman);
    const state = rebellionServerModule.parseState(rebelHuman, {
      sessionId: v1.id,
      version: v1.version,
    }) as GameState;
    expect(state.schemaVersion).toBe(3);
    expect(state.rulesEngine).toBe('mock-v1');
    expect(() =>
      rebellionServerModule.parseState(rebelHuman, { sessionId: v1.id, version: v1.version + 1 }),
    ).toThrow();
    const view = rebellionServerModule.toPlayerView(state, { status: 'prototype' });
    expect(legacyFactionValues(view)).toEqual([]);
    expect(view).toMatchObject({
      kind: 'player',
      viewer: 'rebels',
      activeSide: 'rebels',
      settings: { playerFaction: 'rebels', opponentType: 'human', aiDifficulty: null },
    });
    const res = rebellionServerModule.applyCommand(
      state,
      { actor: 'rebels', expectedVersion: v1.version, command: { type: 'ADVANCE_PHASE' } },
      { now: '2026-11-08T12:00:00.000Z' },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const written = JSON.parse(JSON.stringify(res.state)) as GameState;
      expect(written.schemaVersion).toBe(3);
      expect(written.rulesEngine).toBe('mock-v1');
      expect(legacyFactionValues(written)).toEqual([]);
      expect(res.events.map((e) => e.actor)).toEqual(['rebels']);
    }
    expect(rebellionServerModule.summarize(state)).toMatchObject({
      playerFaction: 'rebels',
      opponentFaction: 'empire',
      opponentType: 'human',
      aiDifficulty: null,
      ruleset: 'base',
      gameMode: 'digital',
    });
  });

  it('TC-M-04 (unit): a migrated human game (Q-17) can pass the turn and accept the handoff', () => {
    const v1 = GameStateV1Schema.parse(rebelHuman);
    const state = rebellionServerModule.parseState(rebelHuman, {
      sessionId: v1.id,
      version: v1.version,
    }) as GameState;
    expect([state.activeSide, state.handoffPending]).toEqual(['rebels', false]);
    const now = { now: '2026-11-08T12:00:00.000Z' };
    const ended = rebellionServerModule.applyCommand(
      state,
      { actor: 'rebels', expectedVersion: v1.version, command: { type: 'END_TURN' } },
      now,
    );
    if (!ended.ok) throw new Error('END_TURN rejected');
    expect(rebellionServerModule.toPlayerView(ended.state, { status: 'prototype' })).toMatchObject({
      kind: 'handoff',
      activeSide: 'empire',
      version: v1.version + 1,
    });
    const accepted = rebellionServerModule.applyCommand(
      ended.state,
      { actor: 'empire', expectedVersion: v1.version + 1, command: { type: 'ACCEPT_HANDOFF' } },
      now,
    );
    if (!accepted.ok) throw new Error('ACCEPT_HANDOFF rejected');
    const view = rebellionServerModule.toPlayerView(accepted.state, { status: 'prototype' });
    expect(view).toMatchObject({ kind: 'player', viewer: 'empire', rebelBase: { systemId: null } });
    expect(legacyFactionValues(view)).toEqual([]);
  });

  it('a legacy setup / faction on the wire is rejected (400), not upcast', () => {
    expect(
      rebellionServerModule.parseSetup({ humanFaction: LEGACY, opponent: { kind: 'human' } }),
    ).toMatchObject({ ok: false, kind: 'invalid' });
    expect(
      rebellionServerModule.parseSetup({
        playerFaction: LEGACY,
        opponentType: 'human',
        ruleset: 'base',
        gameMode: 'digital',
      }),
    ).toMatchObject({ ok: false, kind: 'invalid' });
  });
});
