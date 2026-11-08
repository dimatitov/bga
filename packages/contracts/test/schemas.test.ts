import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  ApiErrorSchema,
  CommandEnvelopeSchema,
  CommandResultSchema,
  CreateGameResponseSchema,
  ERROR_MESSAGE_KEYS,
  ErrorMessageKeySchema,
  ErrorResponseSchema,
  GameEventSchema,
  GameSetupSchema,
  GameStateSchema,
  GameSummarySchema,
  HealthResponseSchema,
  LegalActionSchema,
  PlayerViewSchema,
  ScenarioSchema,
  type GameState,
} from '../src';

const AT = '2026-11-08T10:00:00.000Z';

function sampleState(): GameState {
  return {
    id: 'g-1',
    version: 1,
    round: 1,
    phase: 'assignment',
    setup: { humanFaction: 'empire', opponent: { kind: 'ai', difficulty: 'normal' } },
    systems: [
      { id: 'sys-a', nameKey: 'systems.sys-a', regionId: 'reg-1', adjacentSystemIds: ['sys-b'] },
      { id: 'sys-b', nameKey: 'systems.sys-b', regionId: 'reg-1', adjacentSystemIds: ['sys-a'] },
    ],
    pieces: [
      { id: 'pc-01', kind: 'unit', owner: 'empire', typeKey: 'unit.empire.x', systemId: 'sys-a' },
      {
        id: 'pc-02',
        kind: 'token',
        owner: 'rebellion',
        typeKey: 'token.rebellion.y',
        systemId: 'sys-b',
        hidden: true,
      },
    ],
    rebelBase: { systemId: 'sys-b', revealed: false },
    log: [{ seq: 1, type: 'GAME_CREATED', actor: 'system', payload: { scenarioId: 's' }, at: AT }],
  };
}

const move = {
  type: 'MOVE_PIECES',
  pieceIds: ['pc-01'],
  fromSystemId: 'sys-a',
  toSystemId: 'sys-b',
};

describe('GameSetupSchema (A-7)', () => {
  it('defaults AI difficulty to normal', () => {
    const parsed = GameSetupSchema.parse({ humanFaction: 'empire', opponent: { kind: 'ai' } });
    expect(parsed.opponent).toEqual({ kind: 'ai', difficulty: 'normal' });
  });

  it('keeps an explicit AI difficulty', () => {
    const parsed = GameSetupSchema.parse({
      humanFaction: 'rebellion',
      opponent: { kind: 'ai', difficulty: 'hard' },
    });
    expect(parsed.opponent).toEqual({ kind: 'ai', difficulty: 'hard' });
  });

  it('accepts a human opponent without difficulty', () => {
    expect(
      GameSetupSchema.safeParse({ humanFaction: 'empire', opponent: { kind: 'human' } }).success,
    ).toBe(true);
  });

  it('rejects a human opponent with difficulty', () => {
    expect(
      GameSetupSchema.safeParse({
        humanFaction: 'empire',
        opponent: { kind: 'human', difficulty: 'easy' },
      }).success,
    ).toBe(false);
  });

  it.each([
    { humanFaction: 'sith', opponent: { kind: 'ai' } },
    { humanFaction: 'empire', opponent: { kind: 'robot' } },
    { humanFaction: 'empire', opponent: { kind: 'ai', difficulty: 'insane' } },
    { humanFaction: 'empire' },
    { humanFaction: 'empire', opponent: { kind: 'ai' }, extra: 1 },
  ])('rejects invalid setup %j', (input) => {
    expect(GameSetupSchema.safeParse(input).success).toBe(false);
  });
});

describe('CommandEnvelopeSchema (A-5/A-6)', () => {
  it('accepts a valid MOVE_PIECES envelope', () => {
    expect(
      CommandEnvelopeSchema.safeParse({ actor: 'empire', expectedVersion: 1, command: move })
        .success,
    ).toBe(true);
  });

  it('accepts ADVANCE_PHASE', () => {
    expect(
      CommandEnvelopeSchema.safeParse({
        actor: 'rebellion',
        expectedVersion: 3,
        command: { type: 'ADVANCE_PHASE' },
      }).success,
    ).toBe(true);
  });

  it.each([
    ['empty pieceIds', { actor: 'empire', expectedVersion: 1, command: { ...move, pieceIds: [] } }],
    [
      'duplicate pieceIds',
      { actor: 'empire', expectedVersion: 1, command: { ...move, pieceIds: ['pc-01', 'pc-01'] } },
    ],
    [
      'empty piece id',
      { actor: 'empire', expectedVersion: 1, command: { ...move, pieceIds: [''] } },
    ],
    ['unknown command type', { actor: 'empire', expectedVersion: 1, command: { type: 'ATTACK' } }],
    ['string expectedVersion', { actor: 'empire', expectedVersion: '1', command: move }],
    ['zero expectedVersion', { actor: 'empire', expectedVersion: 0, command: move }],
    ['fractional expectedVersion', { actor: 'empire', expectedVersion: 1.5, command: move }],
    ['unknown actor', { actor: 'system', expectedVersion: 1, command: move }],
    ['extra envelope key', { actor: 'empire', expectedVersion: 1, command: move, x: 1 }],
    [
      'extra command key',
      { actor: 'empire', expectedVersion: 1, command: { type: 'ADVANCE_PHASE', round: 2 } },
    ],
    ['missing command', { actor: 'empire', expectedVersion: 1 }],
  ])('rejects %s', (_name, input) => {
    expect(CommandEnvelopeSchema.safeParse(input).success).toBe(false);
  });
});

describe('GameStateSchema / PlayerViewSchema', () => {
  it('accepts a valid state', () => {
    expect(GameStateSchema.parse(sampleState())).toEqual(sampleState());
  });

  it('rejects unknown keys (strict) in state', () => {
    expect(GameStateSchema.safeParse({ ...sampleState(), secret: 1 }).success).toBe(false);
  });

  it('PlayerView = state + legalActions, strict, nullable base', () => {
    const view = {
      ...sampleState(),
      rebelBase: { systemId: null, revealed: false },
      legalActions: [
        { type: 'MOVE_PIECES', pieceId: 'pc-01', toSystemIds: ['sys-b'] },
        { type: 'ADVANCE_PHASE' },
      ],
    };
    expect(PlayerViewSchema.safeParse(view).success).toBe(true);
    expect(PlayerViewSchema.safeParse({ ...view, extra: true }).success).toBe(false);
    const { legalActions: _ignored, ...withoutActions } = view;
    expect(PlayerViewSchema.safeParse(withoutActions).success).toBe(false);
  });

  it('validates typed event payloads', () => {
    expect(
      GameEventSchema.safeParse({
        seq: 2,
        type: 'PIECES_MOVED',
        actor: 'empire',
        payload: { pieceIds: ['pc-01'], fromSystemId: 'sys-a', toSystemId: 'sys-b' },
        at: AT,
      }).success,
    ).toBe(true);
    expect(
      GameEventSchema.safeParse({
        seq: 3,
        type: 'PHASE_ADVANCED',
        actor: 'rebellion',
        payload: { fromRound: 1, fromPhase: 'refresh', toRound: 2, toPhase: 'assignment' },
        at: AT,
      }).success,
    ).toBe(true);
    // GAME_CREATED must come from 'system'
    expect(
      GameEventSchema.safeParse({
        seq: 1,
        type: 'GAME_CREATED',
        actor: 'empire',
        payload: { scenarioId: 's' },
        at: AT,
      }).success,
    ).toBe(false);
    // non-ISO timestamp
    expect(
      GameEventSchema.safeParse({
        seq: 1,
        type: 'GAME_CREATED',
        actor: 'system',
        payload: { scenarioId: 's' },
        at: 'yesterday',
      }).success,
    ).toBe(false);
  });

  it('LegalActionSchema is a discriminated union', () => {
    expect(LegalActionSchema.safeParse({ type: 'ADVANCE_PHASE' }).success).toBe(true);
    expect(LegalActionSchema.safeParse({ type: 'MOVE_PIECES', pieceId: 'p' }).success).toBe(false);
  });
});

describe('results, errors and API DTOs', () => {
  it('CommandResultSchema accepts ok and error shapes', () => {
    const view = { ...sampleState(), legalActions: [] };
    expect(CommandResultSchema.safeParse({ ok: true, view, events: [] }).success).toBe(true);
    expect(
      CommandResultSchema.safeParse({
        ok: false,
        error: { code: 'VERSION_CONFLICT', messageKey: 'errors.versionConflict', details: {} },
      }).success,
    ).toBe(true);
    expect(
      CommandResultSchema.safeParse({ ok: false, error: { code: 'NOPE', messageKey: 'x' } })
        .success,
    ).toBe(false);
  });

  it('error codes include INTERNAL (AM-2)', () => {
    expect(
      ApiErrorSchema.safeParse({ code: 'INTERNAL', messageKey: 'errors.internal' }).success,
    ).toBe(true);
    expect(
      ErrorResponseSchema.safeParse({
        ok: false,
        error: { code: 'NOT_FOUND', messageKey: ERROR_MESSAGE_KEYS.notFound },
      }).success,
    ).toBe(true);
  });

  it('message keys are unique and prefixed with errors.', () => {
    const keys = Object.values(ERROR_MESSAGE_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^errors\.[a-zA-Z]+$/);
      expect(ErrorMessageKeySchema.parse(key)).toBe(key);
    }
  });

  it('health / create / summary DTOs', () => {
    expect(HealthResponseSchema.safeParse({ status: 'ok' }).success).toBe(true);
    expect(HealthResponseSchema.safeParse({ status: 'down' }).success).toBe(false);
    expect(
      CreateGameResponseSchema.safeParse({
        gameId: 'g-1',
        view: { ...sampleState(), legalActions: [] },
      }).success,
    ).toBe(true);
    expect(
      GameSummarySchema.safeParse({
        gameId: 'g-1',
        setup: sampleState().setup,
        round: 1,
        phase: 'command',
        updatedAt: AT,
      }).success,
    ).toBe(true);
  });

  it('ScenarioSchema requires a rebel base system', () => {
    expect(
      ScenarioSchema.safeParse({ id: 's', regions: [], systems: [], pieces: [] }).success,
    ).toBe(false);
  });
});

/** Collect every object key reachable in a Zod 4 schema tree. */
function collectKeys(schema: z.ZodType, keys = new Set<string>(), seen = new Set<unknown>()) {
  if (seen.has(schema)) return keys;
  seen.add(schema);
  const def = (schema as unknown as { _zod: { def: Record<string, unknown> } })._zod.def;
  const visit = (child: unknown) => {
    if (child && typeof child === 'object' && '_zod' in child) {
      collectKeys(child as z.ZodType, keys, seen);
    }
  };
  switch (def.type) {
    case 'object': {
      const shape = def.shape as Record<string, unknown>;
      for (const [key, child] of Object.entries(shape)) {
        keys.add(key);
        visit(child);
      }
      break;
    }
    case 'array':
      visit(def.element);
      break;
    case 'union':
      for (const option of def.options as unknown[]) visit(option);
      break;
    case 'optional':
    case 'nullable':
    case 'default':
    case 'prefault':
    case 'readonly':
    case 'nonoptional':
    case 'catch':
      visit(def.innerType);
      break;
    case 'pipe':
      visit(def.in);
      visit(def.out);
      break;
    default:
      break;
  }
  return keys;
}

describe('TC-ARCH-03: no visual coordinates in GameState', () => {
  it('walks the schema tree (sanity: finds nested keys)', () => {
    const keys = collectKeys(GameStateSchema);
    for (const key of [
      'systems',
      'adjacentSystemIds',
      'typeKey',
      'revealed',
      'scenarioId',
      'toPhase',
    ]) {
      expect(keys).toContain(key);
    }
  });

  it('has no x / y / position / coords keys at any level', () => {
    const keys = collectKeys(PlayerViewSchema);
    for (const forbidden of ['x', 'y', 'position', 'coords']) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
