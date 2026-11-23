/**
 * SWR-010 W4 — which transitions create physical-table tasks (plan-backend §5.3, AC-11, AC-15, C-4, A-5, AQ-1, AQ-8;
 * TC-TT-02/03/05/07/08/09 rules part, matrix §10.1 row "задачи стола" for S1 / S2 / S4).
 * Real base-game map; the AI side's commands are applied with `origin: 'auto'` as the server runner does.
 */
import { describe, expect, it } from 'vitest';
import {
  CoreGameStateV3Schema,
  PROBE_SYSTEM_IDS,
  TableTaskSchema,
  probeDefinitionId,
  type CoreEvent,
  type CoreGameState,
} from '../../../src/schema';
import { tasksFromEvents } from '../../../src/rules/core/table';
import { FINISH, PASS, activate, mv } from './helpers';
import {
  aiOk,
  confirm,
  confirmAll,
  humanOk,
  physicalGame,
  registeredRebels,
  tableJson,
} from './table-fixtures';

function tasks(state: CoreGameState) {
  return state.table?.tasks ?? [];
}

function head(state: CoreGameState) {
  const task = state.table?.tasks[0];
  if (!task) throw new Error('expected a head task');
  return task;
}

/** Confirm the single head task and expect the queue to be empty afterwards. */
function confirmHead(state: CoreGameState): CoreGameState {
  const next = humanOk(state, confirm(head(state).id)).state;
  return next;
}

function cardIdsIn(state: CoreGameState, zoneId: string): string[] {
  const cards = state.cards;
  if (!cards) throw new Error('expected cards');
  const ids = cards.pile.zones.find((z) => z.id === zoneId)?.cards ?? [];
  return ids.map((id) => cards.pile.instances.find((i) => i.id === id)?.definitionId ?? id);
}

// The AI Rebels' base is Rodia (adjacent to Bothawui, where the Rebel transport starts).
const BASE = 'rodia';

describe('human Rebels vs AI Empire', () => {
  it('own commands create no task; AI activation and AI move create one task each (AQ-8); FINISH/PASS none', () => {
    let s = registeredRebels(BASE);
    expect(tasks(s)).toEqual([]);

    // Human: activation + finish → no tasks (A-5).
    s = humanOk(s, activate('leia', 'tatooine')).state;
    s = humanOk(s, FINISH).state;
    expect(tasks(s)).toEqual([]);

    // AI Empire: Vader activates Malastare → one aiActivation task, the AI waits.
    const activated = aiOk(s, activate('vader', 'malastare'));
    s = activated.state;
    expect(tasks(s)).toHaveLength(1);
    expect(head(s)).toEqual({
      id: `t-${s.version}-1`,
      kind: 'aiActivation',
      actor: 'empire',
      titleKey: 'table.tasks.aiActivation',
      createdAtVersion: s.version,
      affected: {
        cardDefinitionIds: [],
        leaderIds: ['vader'],
        unitIds: [],
        systemIds: ['malastare'],
      },
      steps: [
        { key: 'table.steps.placeLeader', params: { leaderId: 'vader', systemId: 'malastare' } },
      ],
      completion: 'confirm',
    });
    s = confirmHead(s);

    const moved = aiOk(s, mv(['u-40', 'u-41', 'u-43', 'u-45'], 'sullust', 'malastare'));
    s = moved.state;
    expect(head(s)).toMatchObject({
      kind: 'aiMove',
      actor: 'empire',
      affected: { unitIds: ['u-40', 'u-41', 'u-43', 'u-45'], systemIds: ['sullust', 'malastare'] },
      steps: [
        {
          key: 'table.steps.moveUnits',
          params: {
            unitIds: ['u-40', 'u-41', 'u-43', 'u-45'],
            fromSystemId: 'sullust',
            toSystemId: 'malastare',
          },
        },
      ],
    });
    s = confirmHead(s);

    // AI FINISH: no physical consequence → no task (C-4).
    s = aiOk(s, FINISH).state;
    expect(tasks(s)).toEqual([]);
  });

  it('Refresh after the human pass: ONE refresh task — return leaders, opponent drew N (no card ids, S2), advance time', () => {
    let s = registeredRebels(BASE);
    s = humanOk(s, PASS).state;
    s = confirmHead(aiOk(s, activate('vader', 'malastare')).state);
    s = aiOk(s, FINISH).state;
    expect(tasks(s)).toEqual([]);
    // The AI's pass ends the round: Refresh (system events) → one task.
    const passed = aiOk(s, PASS);
    s = passed.state;
    expect(tasks(s)).toHaveLength(1);
    const refresh = head(s);
    const drawn = passed.events.find((e) => e.type === 'CARDS_DRAWN');
    expect(refresh).toMatchObject({ kind: 'refresh', actor: 'system' });
    expect(refresh.steps).toEqual([
      { key: 'table.steps.returnLeaders', params: { leaderIds: ['vader'] } },
      ...(drawn && drawn.type === 'CARDS_DRAWN'
        ? [{ key: 'table.steps.opponentDrewProbeCards', params: { count: drawn.payload.count } }]
        : []),
      { key: 'table.steps.advanceTime', params: { from: 1, to: 2 } },
    ]);
    expect(refresh.affected).toEqual({
      cardDefinitionIds: [],
      leaderIds: ['vader'],
      unitIds: [],
      systemIds: [],
    });
    // S2: no probe card of the AI Empire (nor any deck card, S4) is named anywhere in the queue.
    for (const systemId of PROBE_SYSTEM_IDS) {
      expect(tableJson(s)).not.toContain(`"${probeDefinitionId(systemId)}"`);
    }
  });

  it('W3 draws 2 probes in Refresh: the human Rebels are told only the count (A-9)', () => {
    let s = registeredRebels(BASE);
    s = humanOk(s, PASS).state;
    const passed = aiOk(s, PASS);
    const drawn = passed.events.find((e) => e.type === 'CARDS_DRAWN');
    expect(drawn?.type).toBe('CARDS_DRAWN');
    expect(head(passed.state).steps).toContainEqual({
      key: 'table.steps.opponentDrewProbeCards',
      params: { count: 2 },
    });
  });

  it("the reveal of the human Rebels' base by the AI Empire: baseRevealed → revealOwnBase + moveBaseUnits", () => {
    let s = registeredRebels(BASE);
    // Round 1: the Empire comes to Malastare; the Rebels pass.
    s = humanOk(s, PASS).state;
    s = confirmHead(aiOk(s, activate('vader', 'malastare')).state);
    s = confirmHead(aiOk(s, mv(['u-40', 'u-41', 'u-43', 'u-45'], 'sullust', 'malastare')).state);
    s = aiOk(s, FINISH).state;
    s = confirmHead(aiOk(s, PASS).state); // refresh
    // Round 2: the Rebels pass; the Empire lands ground units in Rodia.
    s = humanOk(s, PASS).state;
    s = confirmHead(aiOk(s, activate('vader', BASE)).state);
    s = confirmHead(aiOk(s, mv(['u-40', 'u-43', 'u-45'], 'malastare', BASE)).state);
    const finished = aiOk(s, FINISH);
    s = finished.state;
    expect(finished.events.map((e) => e.type)).toContain('BASE_REVEALED');
    expect(tasks(s)).toHaveLength(1);
    expect(head(s)).toMatchObject({
      kind: 'baseRevealed',
      actor: 'system',
      affected: { cardDefinitionIds: [probeDefinitionId(BASE)], systemIds: [BASE] },
      steps: [
        { key: 'table.steps.revealOwnBase', params: { systemId: BASE } },
        { key: 'table.steps.moveBaseUnits', params: { systemId: BASE } },
      ],
    });
  });
});

describe('human Empire vs AI Rebels (S1: the AI base is never named before the reveal)', () => {
  function started(base = BASE): CoreGameState {
    return confirmAll(physicalGame('empire', base));
  }

  it('AI activation of its base and AI move into it: the system is null ("Rebel Base" space)', () => {
    let s = started();
    const activated = aiOk(s, activate('leia', BASE));
    s = activated.state;
    expect(head(s)).toMatchObject({
      kind: 'aiActivation',
      actor: 'rebels',
      affected: { leaderIds: ['leia'], systemIds: [null] },
      steps: [{ key: 'table.steps.placeLeader', params: { leaderId: 'leia', systemId: null } }],
    });
    s = confirmHead(s);
    s = aiOk(s, mv(['u-02'], 'bothawui', BASE)).state;
    expect(head(s)).toMatchObject({
      kind: 'aiMove',
      affected: { unitIds: ['u-02'], systemIds: ['bothawui', null] },
      steps: [
        {
          key: 'table.steps.moveUnits',
          params: { unitIds: ['u-02'], fromSystemId: 'bothawui', toSystemId: null },
        },
      ],
    });
    expect(tableJson(s)).not.toContain(BASE);
    expect(tableJson(s)).not.toContain(probeDefinitionId(BASE));
  });

  it('TC-TT-09: two games that differ only in the base give byte-equal tasks (metamorphic)', () => {
    // Rodia and Tatooine are both adjacent to Bothawui.
    const run = (base: string) => {
      let s = started(base);
      s = aiOk(s, activate('leia', base)).state;
      const first = head(s);
      s = confirmHead(s);
      s = aiOk(s, mv(['u-02', 'u-03'], 'bothawui', base)).state;
      return JSON.stringify([first, head(s)]);
    };
    expect(run('rodia')).toBe(run('tatooine'));
  });

  it("public AI activation names the system; the human Empire's own Refresh draw names exactly its cards", () => {
    let s = started();
    s = aiOk(s, activate('leia', 'tatooine')).state;
    expect(head(s).steps[0]?.params).toEqual({ leaderId: 'leia', systemId: 'tatooine' });
    s = confirmHead(s);
    s = aiOk(s, FINISH).state;
    // Empire (human) passes, AI Rebels pass → Refresh with the human Empire's draw.
    s = humanOk(s, PASS).state;
    const passed = aiOk(s, PASS);
    s = passed.state;
    const refresh = head(s);
    expect(refresh.kind).toBe('refresh');
    const drawn = cardIdsIn(s, 'empire-probes');
    expect(drawn).toHaveLength(2);
    expect(refresh.steps).toEqual([
      { key: 'table.steps.returnLeaders', params: { leaderIds: ['leia'] } },
      { key: 'table.steps.takeProbeCards', params: { definitionIds: drawn } },
      { key: 'table.steps.advanceTime', params: { from: 1, to: 2 } },
    ]);
    expect(refresh.affected.cardDefinitionIds).toEqual(drawn);
    // S4: no card still in the deck is named.
    for (const id of cardIdsIn(s, 'probe-deck')) expect(tableJson(s)).not.toContain(`"${id}"`);
  });

  it('the human Empire reveals the base: the task names it (allowed now); none before (TC-TT-07)', () => {
    let s = started();
    // AI Rebels pass for the whole game; Empire: Malastare in round 1, Rodia in round 2.
    s = aiOk(s, PASS).state;
    s = humanOk(s, activate('vader', 'malastare')).state;
    s = humanOk(s, mv(['u-40', 'u-41', 'u-43', 'u-45'], 'sullust', 'malastare')).state;
    s = humanOk(s, FINISH).state;
    expect(tasks(s)).toEqual([]);
    s = humanOk(s, PASS).state; // both passed → Refresh task
    expect(head(s).kind).toBe('refresh');
    expect(tableJson(s)).not.toContain(BASE);
    s = confirmHead(s);
    s = aiOk(s, PASS).state;
    s = humanOk(s, activate('vader', BASE)).state;
    s = humanOk(s, mv(['u-40', 'u-43', 'u-45'], 'malastare', BASE)).state;
    expect(tasks(s)).toEqual([]);
    s = humanOk(s, FINISH).state;
    expect(tasks(s)).toHaveLength(1);
    expect(head(s)).toMatchObject({
      kind: 'baseRevealed',
      affected: { cardDefinitionIds: [probeDefinitionId(BASE)], systemIds: [BASE] },
      steps: [
        { key: 'table.steps.revealBase', params: { systemId: BASE } },
        { key: 'table.steps.moveBaseUnits', params: { systemId: BASE } },
      ],
    });
  });
});

describe('tasksFromEvents (unit)', () => {
  const s = CoreGameStateV3Schema.parse(confirmAll(physicalGame('empire')));
  const ev = (e: Omit<CoreEvent, 'seq' | 'at'>, seq: number): CoreEvent =>
    ({ ...e, seq, at: '2026-11-08T10:05:00.000Z' }) as CoreEvent;

  it('events of the human side and pure markers create nothing', () => {
    const events: CoreEvent[] = [
      ev(
        {
          type: 'SYSTEM_ACTIVATED',
          actor: 'empire',
          payload: { leaderId: 'vader', systemId: 'malastare' },
        },
        10,
      ),
      ev(
        {
          type: 'PIECES_MOVED',
          actor: 'empire',
          payload: { pieceIds: ['u-40'], fromSystemId: 'sullust', toSystemId: 'malastare' },
        },
        11,
      ),
      ev({ type: 'ACTIVATION_FINISHED', actor: 'rebels', payload: { auto: true } }, 12),
      ev({ type: 'PASSED', actor: 'rebels', payload: { auto: true } }, 13),
      ev({ type: 'PHASE_STARTED', actor: 'system', payload: { round: 2, phase: 'command' } }, 14),
      ev(
        {
          type: 'TABLE_TASK_CONFIRMED',
          actor: 'empire',
          payload: { taskId: 't-1-1', kind: 'initialSetup' },
        },
        15,
      ),
    ];
    expect(tasksFromEvents(events, s, 'empire', 9)).toEqual([]);
  });

  it('ids are t-<version>-<n> in event order; a Refresh without returned leaders / draw has only advanceTime', () => {
    const events: CoreEvent[] = [
      ev(
        {
          type: 'SYSTEM_ACTIVATED',
          actor: 'rebels',
          payload: { leaderId: 'leia', systemId: 'tatooine' },
        },
        10,
      ),
      ev({ type: 'PHASE_STARTED', actor: 'system', payload: { round: 1, phase: 'refresh' } }, 11),
      ev({ type: 'LEADERS_RETURNED', actor: 'system', payload: { leaderIds: [] } }, 12),
      ev({ type: 'TIME_ADVANCED', actor: 'system', payload: { from: 1, to: 2 } }, 13),
    ];
    const built = tasksFromEvents(events, s, 'empire', 7);
    expect(built.map((t) => [t.id, t.kind, t.createdAtVersion])).toEqual([
      ['t-7-1', 'aiActivation', 7],
      ['t-7-2', 'refresh', 7],
    ]);
    expect(built[1]?.steps).toEqual([
      { key: 'table.steps.advanceTime', params: { from: 1, to: 2 } },
    ]);
    for (const t of built) TableTaskSchema.parse(t);
  });

  it('the input events and state are not mutated', () => {
    const events: CoreEvent[] = [
      ev(
        {
          type: 'PIECES_MOVED',
          actor: 'rebels',
          payload: { pieceIds: ['u-02'], fromSystemId: 'bothawui', toSystemId: BASE },
        },
        10,
      ),
    ];
    const before = JSON.stringify([events, s]);
    const built = tasksFromEvents(events, s, 'empire', 3);
    expect(built[0]?.steps[0]?.params).toEqual({
      unitIds: ['u-02'],
      fromSystemId: 'bothawui',
      toSystemId: null,
    });
    expect(JSON.stringify([events, s])).toBe(before);
  });
});
