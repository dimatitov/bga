import { ScenarioSchema } from '../../src/schema';
import { describe, expect, it } from 'vitest';
import { MOCK_SCENARIO_ID, mockScenario } from '../../src/scenario';

const systemIds = mockScenario.systems.map((s) => s.id);
const adjacency = new Map(mockScenario.systems.map((s) => [s.id, s.adjacentSystemIds]));

describe('mockScenario', () => {
  it('matches ScenarioSchema and has the expected id', () => {
    expect(ScenarioSchema.parse(mockScenario)).toEqual(mockScenario);
    expect(mockScenario.id).toBe(MOCK_SCENARIO_ID);
  });

  it('has >= 8 systems with unique ids and i18n name keys', () => {
    expect(systemIds.length).toBeGreaterThanOrEqual(8);
    expect(new Set(systemIds).size).toBe(systemIds.length);
    for (const s of mockScenario.systems) {
      expect(s.nameKey).toBe(`systems.${s.id}`);
    }
  });

  it('every system references an existing region', () => {
    const regionIds = new Set(mockScenario.regions.map((r) => r.id));
    for (const r of mockScenario.regions) expect(r.nameKey).toBe(`regions.${r.id}`);
    for (const s of mockScenario.systems) expect(regionIds).toContain(s.regionId);
  });

  it('adjacency is symmetric, irreflexive, duplicate-free and references existing systems', () => {
    for (const [id, neighbours] of adjacency) {
      expect(new Set(neighbours).size).toBe(neighbours.length);
      expect(neighbours).not.toContain(id);
      for (const n of neighbours) {
        expect(systemIds).toContain(n);
        expect(adjacency.get(n)).toContain(id);
      }
    }
  });

  it('graph is connected and has non-adjacent pairs', () => {
    const start = systemIds[0]!;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const n of adjacency.get(current) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(seen.size).toBe(systemIds.length);
    expect(adjacency.get('sys-aurelis')).not.toContain('sys-dovmaren');
  });

  it('pieces: unique opaque ids, existing systems', () => {
    const ids = mockScenario.pieces.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of mockScenario.pieces) {
      expect(p.id).toMatch(/^pc-\d{2}$/);
      expect(systemIds).toContain(p.systemId);
    }
  });

  it('R-3 / spec checklist: units, leaders, tokens for both sides; stacks of >= 2 per side', () => {
    for (const owner of ['empire', 'rebels'] as const) {
      const own = mockScenario.pieces.filter((p) => p.owner === owner);
      for (const kind of ['unit', 'leader', 'token'] as const) {
        expect(own.some((p) => p.kind === kind)).toBe(true);
      }
      const perSystem = new Map<string, number>();
      for (const p of own) perSystem.set(p.systemId, (perSystem.get(p.systemId) ?? 0) + 1);
      expect(Math.max(...perSystem.values())).toBeGreaterThanOrEqual(2);
    }
  });

  it('has a hidden Rebel piece with a typeKey unique in the scenario', () => {
    const hidden = mockScenario.pieces.filter((p) => p.hidden === true);
    expect(hidden.length).toBeGreaterThanOrEqual(1);
    for (const h of hidden) {
      expect(h.owner).toBe('rebels');
      expect(mockScenario.pieces.filter((p) => p.typeKey === h.typeKey)).toHaveLength(1);
    }
  });

  it('rebel base is in an existing system', () => {
    expect(systemIds).toContain(mockScenario.rebelBaseSystemId);
  });

  it('contains no visual coordinates', () => {
    const json = JSON.stringify(mockScenario);
    for (const key of ['"x"', '"y"', '"position"', '"coords"']) expect(json).not.toContain(key);
  });
});
