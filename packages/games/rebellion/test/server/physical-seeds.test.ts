/**
 * SWR-010 W4 — seedable e2e states with cards / the physical table (plan-backend §13 W4, plan-frontend §11.3, FQ-3).
 * Same file shape as the SWR-005 seeds (`seeds/*.json`, read by `e2e/support/seed.ts`): the row columns, the next
 * commands of the scenario and the full stored state. Compared by default; `UPDATE_GOLDEN=1` rewrites them.
 *
 * Built with the real rules on the base-game data: the human's commands with `origin: 'player'`, the AI side's with
 * `origin: 'auto'` (what the server runner's `applyCandidate` does). Every state is parsed with the stored-state
 * schema.
 */
import { describe, expect, it } from 'vitest';
import {
  CoreGameStateV3Schema,
  eligibleRebelBaseSystemIds,
  probeDefinitionId,
  settingsFromSetupInput,
  toStoredSetup,
  type Command,
  type CoreGameState,
  type Faction,
  type RebellionSettings,
} from '../../src/schema';
import { applyCommand, chooseRebelBase } from '../../src/rules';
import { coreDataBaseV1 } from '../../src/scenario';
import { createCoreInitialState, rebellionServerModule } from '../../src/server';
import { NOW, expectGolden } from './core-script';

const ELIGIBLE = eligibleRebelBaseSystemIds(coreDataBaseV1);
const BASE = 'rodia';

function settings(human: Faction, gameMode: 'digital' | 'physical_companion'): RebellionSettings {
  return settingsFromSetupInput({
    playerFaction: human,
    opponentType: 'ai',
    aiDifficulty: 'normal',
    ruleset: 'base',
    gameMode,
  });
}

interface Step {
  actor: Faction;
  command: Command;
}

function create(s: RebellionSettings, sessionId: string): CoreGameState {
  const { state } = createCoreInitialState(toStoredSetup(s), { sessionId, now: NOW });
  return CoreGameStateV3Schema.parse(state);
}

function run(state: CoreGameState, steps: readonly Step[]): CoreGameState {
  return steps.reduce((current, step, i) => {
    const origin = step.actor === current.settings.playerFaction ? 'player' : 'auto';
    const result = applyCommand(
      current,
      { actor: step.actor, expectedVersion: current.version, command: step.command },
      { now: NOW, origin },
    );
    if (!result.ok) {
      throw new Error(
        `seed step ${i} (${step.actor} ${step.command.type}): ${result.error.messageKey}`,
      );
    }
    return CoreGameStateV3Schema.parse(JSON.parse(JSON.stringify(result.state)));
  }, state) as CoreGameState;
}

const pass = (actor: Faction): Step => ({ actor, command: { type: 'PASS' } });
const confirm = (actor: Faction, taskId: string): Step => ({
  actor,
  command: { type: 'CONFIRM_TABLE_TASK', taskId },
});

function seedFile(
  state: CoreGameState,
  description: string,
  nextCommands: Step[],
  expectAfter: { revealed: boolean; outcome: null },
) {
  return {
    description,
    sessionId: state.id,
    rebelBaseSystemId: state.rebelBase.systemId,
    row: {
      id: state.id,
      gameId: 'star-wars-rebellion',
      status: rebellionServerModule.statusOf(state),
      version: state.version,
      setup: toStoredSetup(state.settings),
    },
    nextCommands,
    expectAfter,
    state,
  };
}

function head(state: CoreGameState) {
  const task = state.table?.tasks[0];
  if (!task) throw new Error('expected a head task');
  return task;
}

function zone(state: CoreGameState, id: string): string[] {
  return state.cards?.pile.zones.find((z) => z.id === id)?.cards ?? [];
}

const SESSIONS = {
  registration: 'seed-phys-reb-4',
  aiTask: 'seed-phys-emp-2',
  refresh: 'seed-phys-emp-9',
  digitalRefresh: 'seed-dig-emp-1',
} as const;

describe('SWR-010 e2e seeds (physical table / cards)', () => {
  it('every seed session puts the (provisional) base in Rodia', () => {
    for (const id of Object.values(SESSIONS)) expect(chooseRebelBase(id, ELIGIBLE), id).toBe(BASE);
  });

  it('physical-rebels-registration: human Rebels, initial setup confirmed, registerBase at the head', () => {
    let s = create(settings('rebels', 'physical_companion'), SESSIONS.registration);
    s = run(s, [confirm('rebels', 't-1-1')]);
    expect(s.table).toMatchObject({
      tasks: [{ id: 't-1-2', kind: 'registerBase', completion: 'register' }],
      baseRegistration: { eligibleSystemIds: ELIGIBLE },
    });
    expect(zone(s, 'rebels-location')).toEqual([]);
    expect(zone(s, 'probe-deck')).toHaveLength(26);
    const next: Step[] = [
      {
        actor: 'rebels',
        command: {
          type: 'REGISTER_CARD',
          zoneId: 'rebels-location',
          definitionId: probeDefinitionId('tatooine'),
        },
      },
    ];
    const after = run(s, next);
    expect(after.rebelBase.systemId).toBe('tatooine');
    expect(after.table?.tasks).toEqual([]);
    expectGolden(
      'seeds/physical-rebels-registration.json',
      seedFile(
        s,
        'Physical companion, human Rebels vs AI Empire, round 1. Initial setup confirmed; the Location is NOT registered (provisional base Rodia, its card still in the 26-card deck); head task t-1-2 registerBase. Next: REGISTER_CARD probe-tatooine → base Tatooine, queue empty, AI Empire may move.',
        next,
        { revealed: false, outcome: null },
      ),
    );
  });

  it('physical-empire-ai-task-pending: human Empire, the AI Rebels activated their hidden base — AI waits', () => {
    let s = create(settings('empire', 'physical_companion'), SESSIONS.aiTask);
    s = run(s, [
      confirm('empire', 't-1-1'),
      { actor: 'rebels', command: { type: 'ACTIVATE_SYSTEM', leaderId: 'leia', systemId: BASE } },
    ]);
    expect(s.table?.tasks).toHaveLength(1);
    expect(head(s)).toMatchObject({
      kind: 'aiActivation',
      steps: [{ key: 'table.steps.placeLeader', params: { leaderId: 'leia', systemId: null } }],
    });
    expect(JSON.stringify(s.table)).not.toContain(BASE);
    const next = [confirm('empire', head(s).id)];
    expect(run(s, next).table?.tasks).toEqual([]);
    expectGolden(
      'seeds/physical-empire-ai-task-pending.json',
      seedFile(
        s,
        `Physical companion, human Empire vs AI Rebels, round 1. Initial setup confirmed; the AI Rebels activated their hidden base (Rodia) with Leia — head task ${head(s).id} aiActivation (placeLeader leia → Rebel Base space, systemId null); the AI waits for the confirmation. Next: CONFIRM_TABLE_TASK → queue empty, the AI may continue.`,
        next,
        { revealed: false, outcome: null },
      ),
    );
  });

  it('physical-empire-refresh-pending: human Empire, head = refresh with takeProbeCards (the drawn cards)', () => {
    let s = create(settings('empire', 'physical_companion'), SESSIONS.refresh);
    s = run(s, [confirm('empire', 't-1-1'), pass('rebels'), pass('empire')]);
    const drawn = zone(s, 'empire-probes').map((id) => id.replace(/#1$/, ''));
    expect(drawn).toHaveLength(2);
    expect(head(s)).toMatchObject({ kind: 'refresh' });
    expect(head(s).steps).toContainEqual({
      key: 'table.steps.takeProbeCards',
      params: { definitionIds: drawn },
    });
    const next = [confirm('empire', head(s).id)];
    expect(run(s, next).table?.tasks).toEqual([]);
    expectGolden(
      'seeds/physical-empire-refresh-pending.json',
      seedFile(
        s,
        `Physical companion, human Empire vs AI Rebels, round 2 (time 2). Both sides passed in round 1 → Refresh: head task ${head(s).id} refresh (advanceTime 1→2, takeProbeCards ${drawn.join(', ')}); the Empire holds these 2 probe cards. Next: CONFIRM_TABLE_TASK → queue empty, the AI Rebels move.`,
        next,
        { revealed: false, outcome: null },
      ),
    );
  });

  it('digital-empire-after-refresh: digital, human Empire to move in round 2 with 2 probe cards', () => {
    let s = create(settings('empire', 'digital'), SESSIONS.digitalRefresh);
    s = run(s, [pass('rebels'), pass('empire'), pass('rebels')]);
    expect(s.table).toBeUndefined();
    expect(s).toMatchObject({ round: 2, activeSide: 'empire', outcome: null });
    expect(zone(s, 'empire-probes')).toHaveLength(2);
    expect(zone(s, 'probe-deck')).toHaveLength(23);
    const next = [pass('empire')];
    expectGolden(
      'seeds/digital-empire-after-refresh.json',
      seedFile(
        s,
        'Digital, human Empire vs AI Rebels, round 2, Empire to move (the AI Rebels already passed). After the round-1 Refresh the Empire holds 2 probe cards (deck 23). Next: PASS.',
        next,
        { revealed: false, outcome: null },
      ),
    );
  });
});
