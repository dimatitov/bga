import { GameStateSchema } from '@swr/contracts';
import { describe, expect, it } from 'vitest';
import { createGame } from '../src';
import { CREATE_CTX, EMPIRE_VS_AI, SCENARIO, clone, deepFreeze, newGame } from './helpers';

describe('createGame', () => {
  it('TC-GC-01: initial state from the mock scenario (A-8)', () => {
    const state = newGame();

    expect(state.id).toBe(CREATE_CTX.gameId);
    expect(state.version).toBe(1);
    expect(state.round).toBe(1);
    expect(state.phase).toBe('assignment');
    expect(state.log).toEqual([
      {
        seq: 1,
        type: 'GAME_CREATED',
        actor: 'system',
        payload: { scenarioId: SCENARIO.id },
        at: CREATE_CTX.now,
      },
    ]);

    // Map: ≥ 8 systems, each with ≥ 1 neighbour, symmetric adjacency to existing systems.
    expect(state.systems.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(state.systems.map((s) => s.id));
    expect(ids.size).toBe(state.systems.length);
    for (const sys of state.systems) {
      expect(sys.adjacentSystemIds.length).toBeGreaterThanOrEqual(1);
      for (const adj of sys.adjacentSystemIds) {
        expect(ids.has(adj)).toBe(true);
        expect(state.systems.find((s) => s.id === adj)?.adjacentSystemIds).toContain(sys.id);
      }
    }

    // Pieces: unique ids, existing systems, unit and token of both sides.
    expect(new Set(state.pieces.map((p) => p.id)).size).toBe(state.pieces.length);
    for (const p of state.pieces) expect(ids.has(p.systemId)).toBe(true);
    for (const owner of ['empire', 'rebellion'] as const) {
      for (const kind of ['unit', 'token'] as const) {
        expect(state.pieces.some((p) => p.owner === owner && p.kind === kind)).toBe(true);
      }
    }

    expect(state.rebelBase).toEqual({ systemId: SCENARIO.rebelBaseSystemId, revealed: false });
    expect(ids.has(SCENARIO.rebelBaseSystemId)).toBe(true);
    expect(GameStateSchema.safeParse(state).success).toBe(true);
    expect(state.setup).toEqual(EMPIRE_VS_AI);
  });

  it('TC-GC-01 (A-7): AI opponent without difficulty defaults to normal', () => {
    const state = createGame(
      { humanFaction: 'rebellion', opponent: { kind: 'ai' } },
      SCENARIO,
      CREATE_CTX,
    );
    expect(state.setup).toEqual({
      humanFaction: 'rebellion',
      opponent: { kind: 'ai', difficulty: 'normal' },
    });
  });

  it('TC-GC-01 (A-7): invalid setup (human opponent with difficulty) is a programming error → throws', () => {
    expect(() =>
      createGame(
        // @ts-expect-error — deliberately invalid input
        { humanFaction: 'empire', opponent: { kind: 'human', difficulty: 'easy' } },
        SCENARIO,
        CREATE_CTX,
      ),
    ).toThrow();
  });

  it('TC-GC-01: state does not share objects with the scenario (deep copy)', () => {
    const before = clone(SCENARIO);
    const state = newGame();
    state.pieces[0]!.systemId = 'mutated';
    state.systems[0]!.adjacentSystemIds.push('mutated');
    expect(SCENARIO).toEqual(before);
  });

  it('TC-GC-29: createGame works on a deep-frozen setup and scenario (no input mutation)', () => {
    const setup = deepFreeze(clone(EMPIRE_VS_AI));
    const scenario = deepFreeze(clone(SCENARIO));
    const state = createGame(setup, scenario, deepFreeze({ ...CREATE_CTX }));
    expect(state.version).toBe(1);
    expect(scenario).toEqual(SCENARIO);
  });

  it('TC-GC-32: createGame is deterministic for equal setup, scenario and ctx (AM-1)', () => {
    const a = createGame(EMPIRE_VS_AI, SCENARIO, CREATE_CTX);
    const b = createGame(clone(EMPIRE_VS_AI), clone(SCENARIO), { ...CREATE_CTX });
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
