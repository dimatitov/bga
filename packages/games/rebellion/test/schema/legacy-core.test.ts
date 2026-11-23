/**
 * SWR-010 W2 (plan-backend §3.1, §10.3 R1/R5; AC-16, TC-OLD-05 unit part): states stored before SWR-010 (no `cards`,
 * no `table`) still parse, and parse → stringify is byte-identical to the stored JSON (the optional fields are never
 * added, rows are never rewritten on read). `mock-v1` and v1/v2 upcasts are unchanged.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CoreGameStateV3Schema, GameStateSchema, MockGameStateV3Schema } from '../../src/schema';
import { upcastState } from '../../src/server';

function json(path: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/${path}`, import.meta.url), 'utf8'));
}

/** Every stored `core-v1` state among the fixtures written before SWR-010 (golden final states, e2e seeds). */
const CORE_STATES: [string, unknown][] = [
  [
    'golden-empire-win finalState',
    (json('core/golden-empire-win.json') as { finalState: unknown }).finalState,
  ],
  [
    'golden-rebels-time finalState',
    (json('core/golden-rebels-time.json') as { finalState: unknown }).finalState,
  ],
  [
    'seed ai-empire-before-reveal',
    (json('core/seeds/ai-empire-before-reveal.json') as { state: unknown }).state,
  ],
  [
    'seed hotseat-empire-before-win',
    (json('core/seeds/hotseat-empire-before-win.json') as { state: unknown }).state,
  ],
];

describe('R1: legacy core-v1 states parse byte-identically', () => {
  it.each(CORE_STATES)('%s', (_name, raw) => {
    expect(raw).toMatchObject({ rulesEngine: 'core-v1' });
    expect(raw).not.toHaveProperty('cards');
    expect(raw).not.toHaveProperty('table');
    const stored = JSON.stringify(raw);
    for (const parsed of [
      CoreGameStateV3Schema.parse(raw),
      GameStateSchema.parse(raw),
      upcastState(raw),
    ]) {
      expect(parsed).not.toHaveProperty('cards');
      expect(parsed).not.toHaveProperty('table');
      expect(JSON.stringify(parsed)).toBe(stored);
    }
  });
});

describe('R5: mock-v1 and v1/v2 upcasts unchanged', () => {
  it.each([
    ['v1/state.v1.empire-ai.json', 'state'],
    ['v1/state.v1.rebellion-human.json', 'state'],
    ['v2/state.v2.empire-ai.json', 'state'],
    ['v2/state.v2.rebels-human-handoff.json', 'state'],
  ])('%s → mock-v1 v3, stable on re-parse, no card fields', (path, key) => {
    const raw = (json(path) as Record<string, unknown>)[key];
    const upcast = upcastState(raw);
    expect(upcast.rulesEngine).toBe('mock-v1');
    expect(upcast).not.toHaveProperty('cards');
    expect(upcast).not.toHaveProperty('table');
    const stored = JSON.stringify(upcast);
    expect(JSON.stringify(MockGameStateV3Schema.parse(JSON.parse(stored)))).toBe(stored);
  });

  it('mock-v1 states reject the card fields (strict)', () => {
    const upcast = upcastState((json('v2/state.v2.empire-ai.json') as { state: unknown }).state);
    expect(
      MockGameStateV3Schema.safeParse({ ...upcast, table: { tasks: [], baseRegistration: null } })
        .success,
    ).toBe(false);
  });
});
