/**
 * SWR-005 W1 (plan-backend §1.3, AC-11): state v2 → v3 `mock-v1` and the chain v1 → v2 → v3, on the frozen
 * fixtures (`test/fixtures/v2` — written by the SWR-004 code at ddfa4db; `test/fixtures/v1` — SWR-003).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GameStateSchema,
  MockGameStateV3Schema,
  type GameState,
  type MockGameState,
} from '../../src/schema';
import { rebellionServerModule, upcastEvent, upcastState } from '../../src/server';
import { GameStateV1Schema } from '../../src/server/legacy-v1';
import { GameStateV2Schema } from '../../src/server/legacy-v2';
import { coreState } from '../schema/core-sample';

function fixture(dir: 'v1' | 'v2', name: string): { _provenance: string; state: unknown } {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${dir}/${name}`, import.meta.url), 'utf8'),
  ) as { _provenance: string; state: unknown };
}

const v2Hotseat = fixture('v2', 'state.v2.rebels-human-handoff.json');
const v2EmpireAi = fixture('v2', 'state.v2.empire-ai.json');
const v1Human = fixture('v1', 'state.v1.rebellion-human.json').state;
const v1EmpireAi = fixture('v1', 'state.v1.empire-ai.json').state;

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

describe('fixtures v2 (SWR-005 step 0)', () => {
  it('are real SWR-004 data: frozen v2 schema, provenance, hot-seat in handoff / AI game, < 50 KB', () => {
    for (const f of [v2Hotseat, v2EmpireAi]) {
      expect(f._provenance).toMatch(/SWR-004 code on ddfa4db/);
      expect(GameStateV2Schema.safeParse(f.state).success).toBe(true);
      expect(JSON.stringify(f).length).toBeLessThan(50 * 1024);
    }
    const hotseat = GameStateV2Schema.parse(v2Hotseat.state);
    expect([hotseat.settings.opponentType, hotseat.handoffPending]).toEqual(['human', true]);
    expect(hotseat.log.map((e) => e.type)).toEqual(['GAME_CREATED', 'PIECES_MOVED', 'TURN_ENDED']);
    const ai = GameStateV2Schema.parse(v2EmpireAi.state);
    expect([ai.settings.playerFaction, ai.settings.aiDifficulty]).toEqual(['empire', 'hard']);
    expect(ai.log.map((e) => e.type)).toEqual(['GAME_CREATED', 'PIECES_MOVED', 'PHASE_ADVANCED']);
  });
});

describe('upcastState v2 → v3', () => {
  it('adds schemaVersion 3 + rulesEngine mock-v1; everything else is byte-equal; input not mutated', () => {
    for (const raw of [v2Hotseat.state, v2EmpireAi.state]) {
      const before = JSON.stringify(raw);
      const v3 = asMock(upcastState(deepFreeze(structuredClone(raw))));
      expect(JSON.stringify(raw)).toBe(before);
      expect(v3.schemaVersion).toBe(3);
      expect(v3.rulesEngine).toBe('mock-v1');
      const { schemaVersion: _a, rulesEngine: _b, ...rest3 } = v3;
      const { schemaVersion: _c, ...rest2 } = raw as Record<string, unknown>;
      expect(rest3).toEqual(rest2);
      expect(MockGameStateV3Schema.parse(v3)).toEqual(v3);
    }
  });

  it('keeps id and version (optimistic concurrency unaffected) and the hot-seat handoff', () => {
    const raw = GameStateV2Schema.parse(v2Hotseat.state);
    const v3 = asMock(upcastState(raw));
    expect([v3.id, v3.version, v3.activeSide, v3.handoffPending]).toEqual([
      raw.id,
      raw.version,
      raw.activeSide,
      true,
    ]);
    expect(
      rebellionServerModule.parseState(v2Hotseat.state, {
        sessionId: raw.id,
        version: raw.version,
      }),
    ).toEqual(v3);
  });

  it('is idempotent: upcast(upcast(x)) ≡ upcast(x), also through JSON (a written row)', () => {
    for (const raw of [v2Hotseat.state, v2EmpireAi.state, v1Human, v1EmpireAi]) {
      const once = upcastState(raw);
      expect(upcastState(once)).toEqual(once);
      expect(upcastState(JSON.parse(JSON.stringify(once)))).toEqual(once);
    }
  });

  it('a v3 core-v1 state passes unchanged', () => {
    const state = coreState();
    expect(upcastState(state)).toEqual(state);
  });

  it('unknown / invalid versions and corrupt v2 throw', () => {
    expect(() => upcastState({ ...(v2Hotseat.state as object), schemaVersion: 99 })).toThrow(
      /schemaVersion 99/,
    );
    expect(() => upcastState({ ...(v2Hotseat.state as object), schemaVersion: '3' })).toThrow();
    expect(() => upcastState({ ...(v2Hotseat.state as object), rulesEngine: 'mock-v1' })).toThrow();
    expect(() => upcastState({ ...(v2EmpireAi.state as object), handoffPending: true })).toThrow();
    const v3 = upcastState(v2Hotseat.state);
    expect(() => upcastState({ ...v3, rulesEngine: undefined })).toThrow();
  });
});

describe('upcastState v1 → v2 → v3', () => {
  it('v1 rows become mock-v1 v3 with the same id/version/round/phase and the SWR-004 v2 mapping', () => {
    for (const raw of [v1Human, v1EmpireAi]) {
      const v1 = GameStateV1Schema.parse(raw);
      const v3 = asMock(upcastState(raw));
      expect([v3.schemaVersion, v3.rulesEngine]).toEqual([3, 'mock-v1']);
      expect([v3.id, v3.version, v3.round, v3.phase]).toEqual([
        v1.id,
        v1.version,
        v1.round,
        v1.phase,
      ]);
      expect(v3.systems).toEqual(v1.systems);
      expect(JSON.stringify(v3)).not.toContain('"rebellion"');
      expect(GameStateSchema.parse(v3)).toEqual(v3);
    }
  });
});

describe('mock-v1 keeps working after the upcast (AC-11)', () => {
  it('v2 hot-seat row: ACCEPT_HANDOFF, then a move; the written state stays mock-v1 v3', () => {
    const raw = GameStateV2Schema.parse(v2Hotseat.state);
    const state = rebellionServerModule.parseState(raw, {
      sessionId: raw.id,
      version: raw.version,
    });
    const accepted = rebellionServerModule.applyCommand(
      state,
      { actor: 'empire', expectedVersion: raw.version, command: { type: 'ACCEPT_HANDOFF' } },
      { now: '2026-11-09T10:00:00.000Z' },
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const written = JSON.parse(JSON.stringify(accepted.state)) as GameState;
    expect([written.schemaVersion, written.rulesEngine, written.version]).toEqual([
      3,
      'mock-v1',
      raw.version + 1,
    ]);
    expect(
      rebellionServerModule.toPlayerView(accepted.state, { status: 'prototype' }),
    ).toMatchObject({
      kind: 'player',
      rulesEngine: 'mock-v1',
      viewer: 'empire',
    });
  });

  it('stored events of v1/v2 are still read by upcastEvent', () => {
    const v2 = GameStateV2Schema.parse(v2Hotseat.state);
    for (const e of v2.log) expect(upcastEvent(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });
});
