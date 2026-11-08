import { readFileSync } from 'node:fs';
import { SessionDetailsSchema, type ServerGameModule } from '@bga/platform';
import { describe, expect, it } from 'vitest';
import { rebellionDefinition } from '../../src/definition';
import { CORE_DATA_BASE_V1_ID, mockScenario } from '../../src/scenario';
import {
  GameStateSchema,
  HandoffViewSchema,
  PlayerViewSchema,
  RebellionSessionDetailsSchema,
  UNKNOWN_TYPE_KEY,
  type CoreGameState,
  type CorePlayerView,
  type GameState,
  type PlayerView,
  type MockPlayerView,
  type RebellionSetupInput,
} from '../../src/schema';
import { rebellionServerModule, upcastStoredSetup } from '../../src/server';
import { playEmpireWin, playRebelsTimeWin } from './core-scenarios';

const v1Setups = JSON.parse(
  readFileSync(new URL('../fixtures/v1/setups.v1.json', import.meta.url), 'utf8'),
) as { stored: unknown[] };
const v2EmpireAi = JSON.parse(
  readFileSync(new URL('../fixtures/v2/state.v2.empire-ai.json', import.meta.url), 'utf8'),
) as { state: unknown };

const module: ServerGameModule = rebellionServerModule;
const ctx = { sessionId: 'session-1', now: '2026-11-08T10:00:00.000Z' };
const hiddenRebel = mockScenario.pieces.find((p) => p.owner === 'rebels' && p.hidden)!;
const VIEW_CTX = { status: 'prototype' } as const;

const BASE = { ruleset: 'base', gameMode: 'digital' } as const;
const EMPIRE_AI: RebellionSetupInput = { playerFaction: 'empire', opponentType: 'ai', ...BASE };
const REBELS_HUMAN: RebellionSetupInput = {
  playerFaction: 'rebels',
  opponentType: 'human',
  ...BASE,
};

function create(setup: RebellionSetupInput) {
  const parsed = module.parseSetup(setup);
  if (!parsed.ok) throw new Error('setup rejected');
  return {
    setup: parsed.value,
    ...(module.createInitialState(parsed.value, ctx) as { state: GameState; events: unknown[] }),
  };
}

function mockBoard(view: unknown): MockPlayerView {
  const parsed: PlayerView = PlayerViewSchema.parse(view);
  if (parsed.kind !== 'player' || parsed.rulesEngine !== 'mock-v1') {
    throw new Error('expected the mock-v1 board view');
  }
  return parsed;
}

function coreBoard(view: unknown): CorePlayerView {
  const parsed: PlayerView = PlayerViewSchema.parse(view);
  if (parsed.kind !== 'player' || parsed.rulesEngine !== 'core-v1') {
    throw new Error('expected the core-v1 board view');
  }
  return parsed;
}

function core(state: GameState): CoreGameState {
  if (state.rulesEngine !== 'core-v1') throw new Error('expected a core-v1 state');
  return state;
}

function command(state: GameState, actor: string, type: string) {
  return module.applyCommand(
    state,
    { actor, expectedVersion: state.version, command: { type } },
    { now: ctx.now },
  ) as { ok: true; state: GameState; events: unknown[] } | { ok: false; error: unknown };
}

describe('rebellionServerModule', () => {
  it('uses the Rebellion definition (available)', () => {
    expect(module.definition).toBe(rebellionDefinition);
    expect(module.definition.status).toBe('available');
  });

  it('parseSetup: new input → stored v2 setup (opponentFaction derived, default difficulty normal)', () => {
    expect(module.parseSetup(EMPIRE_AI)).toEqual({
      ok: true,
      value: {
        schemaVersion: 2,
        playerFaction: 'empire',
        opponentFaction: 'rebels',
        opponentType: 'ai',
        aiDifficulty: 'normal',
        ruleset: 'base',
        gameMode: 'digital',
      },
    });
    expect(module.parseSetup({ ...REBELS_HUMAN, aiDifficulty: null })).toMatchObject({
      ok: true,
      value: { opponentFaction: 'empire', opponentType: 'human', aiDifficulty: null },
    });
  });

  it('parseSetup: invalid (400) with paths relative to setup; legacy SWR-003 input is rejected', () => {
    const bad = module.parseSetup({ ...REBELS_HUMAN, aiDifficulty: 'easy' });
    expect(bad).toMatchObject({ ok: false, kind: 'invalid' });
    if (!bad.ok && bad.kind === 'invalid') expect(bad.issues[0]?.path).toEqual(['aiDifficulty']);
    expect(module.parseSetup({ humanFaction: 'empire', opponent: { kind: 'ai' } })).toMatchObject({
      ok: false,
      kind: 'invalid',
    });
    expect(module.parseSetup(undefined)).toMatchObject({ ok: false, kind: 'invalid' });
  });

  it('parseSetup: unsupported ruleset / mode → kind unsupported (422) with details.unsupported (Q-8)', () => {
    expect(module.parseSetup({ ...EMPIRE_AI, ruleset: 'rise-of-the-empire' })).toEqual({
      ok: false,
      kind: 'unsupported',
      messageKey: 'errors.rulesetUnavailable',
      details: { unsupported: ['ruleset'] },
    });
    expect(module.parseSetup({ ...EMPIRE_AI, gameMode: 'physical_companion' })).toEqual({
      ok: false,
      kind: 'unsupported',
      messageKey: 'errors.modeUnavailable',
      details: { unsupported: ['gameMode'] },
    });
    // Schema (400) is checked before support (422).
    expect(
      module.parseSetup({ ...EMPIRE_AI, ruleset: 'rise-of-the-empire', extra: 1 }),
    ).toMatchObject({ ok: false, kind: 'invalid' });
  });

  it('TC-U-15: initialStatus → prototype; TC-U-13: publicSettings = exactly the six settings', () => {
    for (const input of [EMPIRE_AI, REBELS_HUMAN]) {
      const { setup, state } = create(input);
      expect(module.initialStatus(setup)).toBe('prototype');
      const settings = module.publicSettings(setup);
      expect(Object.keys(settings).sort()).toEqual([
        'aiDifficulty',
        'gameMode',
        'opponentFaction',
        'opponentType',
        'playerFaction',
        'ruleset',
      ]);
      expect(settings).toEqual(state.settings);
    }
  });

  it('invariant: publicSettings(parseStoredSetup(row.setup)) ≡ state.settings for new and v1 rows', () => {
    for (const input of [EMPIRE_AI, REBELS_HUMAN]) {
      const { setup, state } = create(input);
      const stored: unknown = JSON.parse(JSON.stringify(setup));
      expect(module.publicSettings(module.parseStoredSetup(stored))).toEqual(state.settings);
    }
    for (const raw of v1Setups.stored) {
      const setup = upcastStoredSetup(raw);
      const { state } = module.createInitialState(setup, ctx) as { state: GameState };
      expect(module.publicSettings(module.parseStoredSetup(raw))).toEqual(state.settings);
    }
    expect(() => module.parseStoredSetup({ aiFaction: 'empire' })).toThrow();
  });

  it('review #1: setupOf(state) is the v2 stored setup of the state; round-trips through parseStoredSetup', () => {
    for (const input of [EMPIRE_AI, REBELS_HUMAN]) {
      const { setup, state } = create(input);
      expect(module.setupOf(state)).toEqual(setup);
      const stored: unknown = JSON.parse(JSON.stringify(module.setupOf(state)));
      expect(module.parseStoredSetup(stored)).toEqual(setup);
    }
    for (const raw of v1Setups.stored) {
      const { state } = module.createInitialState(upcastStoredSetup(raw), ctx) as {
        state: GameState;
      };
      const v2 = module.setupOf(state) as { schemaVersion: number };
      expect(v2.schemaVersion).toBe(2);
      expect(module.publicSettings(module.setupOf(state))).toEqual(state.settings);
    }
  });

  it('createInitialState: core-v1 on the base-game data; same sessionId + now → byte-identical (Q-24)', () => {
    const a = create(REBELS_HUMAN);
    const b = create(REBELS_HUMAN);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const state = core(a.state);
    expect(state).toMatchObject({
      id: ctx.sessionId,
      rulesEngine: 'core-v1',
      scenarioId: CORE_DATA_BASE_V1_ID,
      version: 1,
      round: 1,
      reputation: 14,
      phase: 'command',
      activeSide: 'rebels',
    });
    expect(state.map.systems).toHaveLength(32);
    expect(a.events).toEqual(state.log);
    expect(a.events.map((e) => (e as { type: string }).type)).toEqual([
      'GAME_CREATED',
      'PHASE_STARTED',
      'PHASE_STARTED',
    ]);
    expect(a.events[0]).toEqual({
      seq: 1,
      type: 'GAME_CREATED',
      actor: 'system',
      at: ctx.now,
      payload: { scenarioId: CORE_DATA_BASE_V1_ID },
    });
    GameStateSchema.parse(state);
  });

  it('createInitialState (AI Rebels): their automatic pass is applied — version 2, Empire to move (AC-08, TC-AI-06)', () => {
    const { state, events } = create(EMPIRE_AI);
    const s = core(state);
    expect(s).toMatchObject({ version: 2, activeSide: 'empire', handoffPending: false });
    expect(events).toEqual(s.log);
    expect(events.at(-1)).toMatchObject({
      seq: 4,
      type: 'PASSED',
      actor: 'rebels',
      payload: { auto: true },
    });
    expect(module.version(state)).toBe(2);
    GameStateSchema.parse(state);
    expect(JSON.stringify(create(EMPIRE_AI).state)).toBe(JSON.stringify(state));
  });

  it('parseState: JSON roundtrip; mismatching id or version → throw; schema-invalid → throw', () => {
    for (const input of [REBELS_HUMAN, EMPIRE_AI]) {
      const { state } = create(input);
      const raw: unknown = JSON.parse(JSON.stringify(state));
      const version = module.version(state);
      expect(module.parseState(raw, { sessionId: ctx.sessionId, version })).toEqual(
        GameStateSchema.parse(state),
      );
      expect(() => module.parseState(raw, { sessionId: 'other', version })).toThrow();
      expect(() =>
        module.parseState(raw, { sessionId: ctx.sessionId, version: version + 1 }),
      ).toThrow();
    }
    expect(() =>
      module.parseState({ id: ctx.sessionId }, { sessionId: ctx.sessionId, version: 1 }),
    ).toThrow();
  });

  it('applyCommand (core-v1): 400 → 409 → 422 order, player command + AI auto-pass in one result, input not mutated', () => {
    const { state } = create(EMPIRE_AI);
    const snapshot = JSON.stringify(state);
    const r400 = module.applyCommand(
      state,
      { actor: 'empire', expectedVersion: 2 },
      { now: ctx.now },
    );
    const r409 = module.applyCommand(
      state,
      { actor: 'empire', expectedVersion: 9, command: { type: 'PASS' } },
      { now: ctx.now },
    );
    const r422 = module.applyCommand(
      state,
      { actor: 'rebels', expectedVersion: 2, command: { type: 'PASS' } },
      { now: ctx.now },
    );
    const unavailable = module.applyCommand(
      state,
      { actor: 'empire', expectedVersion: 2, command: { type: 'ADVANCE_PHASE' } },
      { now: ctx.now },
    );
    expect([r400, r409, r422, unavailable].map((r) => (r.ok ? 'ok' : r.error.code))).toEqual([
      'VALIDATION',
      'VERSION_CONFLICT',
      'ILLEGAL_COMMAND',
      'ILLEGAL_COMMAND',
    ]);
    expect(r422).toMatchObject({ ok: false, error: { messageKey: 'errors.notYourSide' } });
    expect(unavailable).toMatchObject({
      ok: false,
      error: { messageKey: 'errors.commandUnavailable' },
    });

    const ok = module.applyCommand(
      state,
      { actor: 'empire', expectedVersion: 2, command: { type: 'PASS' } },
      { now: ctx.now },
    );
    if (!ok.ok) throw new Error('PASS rejected');
    const next = core(ok.state as GameState);
    // Empire pass → refresh → round 2 → AI Rebels pass again (auto) → Empire to move; +1 per engine command.
    expect(next).toMatchObject({ version: 4, round: 2, activeSide: 'empire' });
    const events = module.toPlayerEvents(ok.events, ok.state) as { type: string; actor: string }[];
    expect(events).toHaveLength(ok.events.length);
    expect(events[0]).toMatchObject({ type: 'PASSED', actor: 'empire' });
    expect(events.at(-1)).toMatchObject({
      type: 'PASSED',
      actor: 'rebels',
      payload: { auto: true },
    });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('toPlayerView (AI game): the player board; the Empire does not see the base (zone without a system)', () => {
    const { state } = create(EMPIRE_AI);
    const base = core(state).rebelBase.systemId;
    const view = coreBoard(module.toPlayerView(state, VIEW_CTX));
    expect(view).toMatchObject({ kind: 'player', viewer: 'empire', activeSide: 'empire' });
    expect(view.settings).toEqual(state.settings);
    expect(view.rebelBase).toEqual({ systemId: null, revealed: false });
    expect(view.units.filter((u) => u.location.kind === 'rebelBase')).toHaveLength(6);
    const { map: _map, legalActions: _la, ...rest } = view;
    expect(JSON.stringify(rest)).not.toContain(`"${base}"`);

    const rebel = create(REBELS_HUMAN);
    const rebelView = coreBoard(module.toPlayerView(rebel.state, VIEW_CTX));
    expect(rebelView.viewer).toBe('rebels');
    expect(rebelView.rebelBase.systemId).toBe(core(rebel.state).rebelBase.systemId);
  });

  it('hot-seat (core-v1): PASS → handoff view (8 keys) and no events; ACCEPT_HANDOFF → Empire board', () => {
    const { state } = create(REBELS_HUMAN);
    const passed = command(state, 'rebels', 'PASS');
    if (!passed.ok) throw new Error('PASS rejected');
    expect(module.toPlayerEvents(passed.events as never[], passed.state)).toEqual([]);
    const handoff = HandoffViewSchema.parse(module.toPlayerView(passed.state, VIEW_CTX));
    expect(handoff).toEqual({
      kind: 'handoff',
      rulesEngine: 'core-v1',
      id: ctx.sessionId,
      version: 2,
      activeSide: 'empire',
      round: 1,
      phase: 'command',
      sessionStatus: 'prototype',
    });

    const accepted = command(passed.state, 'empire', 'ACCEPT_HANDOFF');
    if (!accepted.ok) throw new Error('ACCEPT_HANDOFF rejected');
    const view = coreBoard(module.toPlayerView(accepted.state, VIEW_CTX));
    expect(view).toMatchObject({ viewer: 'empire', activeSide: 'empire', version: 3 });
    expect(view.rebelBase.systemId).toBeNull();
    expect(view.legalActions.map((a) => a.type)).toEqual(['ACTIVATE_SYSTEM', 'PASS']);
    expect(module.toPlayerEvents(accepted.events as never[], accepted.state)).toHaveLength(1);
  });

  it('mock-v1 (stored v2 rows): commands keep working on mock rules, no auto-play; mock board view', () => {
    const state = module.parseState(v2EmpireAi.state, {
      sessionId: (v2EmpireAi.state as { id: string }).id,
      version: (v2EmpireAi.state as { version: number }).version,
    }) as GameState;
    expect(state.rulesEngine).toBe('mock-v1');
    const view = mockBoard(module.toPlayerView(state, VIEW_CTX));
    expect(view).toMatchObject({ viewer: 'empire', rulesEngine: 'mock-v1' });
    expect(view.rebelBase.systemId).toBeNull();
    expect(view.pieces.find((p) => p.id === hiddenRebel.id)?.typeKey).toBe(UNKNOWN_TYPE_KEY);

    const advanced = command(state, 'empire', 'ADVANCE_PHASE');
    if (!advanced.ok) throw new Error('ADVANCE_PHASE rejected');
    expect(advanced.state.rulesEngine).toBe('mock-v1');
    expect(module.version(advanced.state)).toBe(module.version(state) + 1);
    expect(advanced.events).toHaveLength(1);
    expect(module.statusOf(advanced.state)).toBe('prototype');
    expect(command(state, 'empire', 'PASS')).toMatchObject({
      ok: false,
      error: { messageKey: 'errors.commandUnavailable' },
    });
    expect(module.summarize(state)).toMatchObject({
      rulesEngine: 'mock-v1',
      winner: null,
      reputation: null,
    });
  });

  it('statusOf: running core-v1 → prototype; a real core-v1 victory → completed (AC-13)', () => {
    expect(module.statusOf(create(REBELS_HUMAN).state)).toBe('prototype');
    const { final } = playRebelsTimeWin();
    expect(final.state.outcome).toEqual({ winner: 'rebels', reason: 'timeReachedReputation' });
    expect(module.statusOf(final.state)).toBe('completed');
    const empireWin = playEmpireWin().final.state;
    expect(module.statusOf(empireWin)).toBe('completed');
    expect(module.summarize(empireWin)).toMatchObject({ winner: 'empire', rulesEngine: 'core-v1' });
  });

  it('TC-U-14 summarize: settings + round/phase + rulesEngine/winner/reputation, flat, null difficulty for a human opponent, no secrets', () => {
    const ai = create({ ...EMPIRE_AI, aiDifficulty: 'hard' });
    const details = module.summarize(ai.state);
    expect(details).toEqual({
      playerFaction: 'empire',
      opponentFaction: 'rebels',
      opponentType: 'ai',
      aiDifficulty: 'hard',
      ruleset: 'base',
      gameMode: 'digital',
      round: 1,
      phase: 'command',
      rulesEngine: 'core-v1',
      winner: null,
      reputation: 14,
    });
    SessionDetailsSchema.parse(details);
    RebellionSessionDetailsSchema.parse(details);
    const text = JSON.stringify(details);
    expect(text).not.toContain(core(ai.state).rebelBase.systemId);
    expect(text).not.toContain('systemId');

    const human = create(REBELS_HUMAN);
    const humanDetails = module.summarize(human.state);
    expect(humanDetails).toEqual({
      playerFaction: 'rebels',
      opponentFaction: 'empire',
      opponentType: 'human',
      aiDifficulty: null,
      ruleset: 'base',
      gameMode: 'digital',
      round: 1,
      phase: 'command',
      rulesEngine: 'core-v1',
      winner: null,
      reputation: 14,
    });
    SessionDetailsSchema.parse(humanDetails);
  });

  it('no AI profile fields in any public output (§4.4)', () => {
    for (const input of [EMPIRE_AI, REBELS_HUMAN]) {
      const { setup, state } = create(input);
      const text = JSON.stringify([
        module.publicSettings(setup),
        module.toPlayerView(state, VIEW_CTX),
        module.summarize(state),
      ]);
      for (const key of ['candidateActionLimit', 'goalWeights', 'exploration', 'schemaVersion']) {
        expect(text).not.toContain(key);
      }
    }
  });
});
