/**
 * SWR-010 W4 — initial physical-table state (plan-backend §5.3 "Начальные", AC-11; TC-TT-01 rules part, TC-PH-09).
 */
import { describe, expect, it } from 'vitest';
import {
  CoreTableStateSchema,
  FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS,
  TableViewSchema,
  probeDefinitionId,
} from '../../../src/schema';
import { initialTableState, tableViewFor } from '../../../src/rules/core/table';
import { coreSideView } from '../../../src/rules/core';
import {
  ELIGIBLE,
  digitalSettings,
  physicalGame,
  physicalSettings,
  realGame,
  realGameIdWithBase,
} from './table-fixtures';

const REMOVED = FIRST_GAME_REMOVED_PROBE_SYSTEM_IDS.map(probeDefinitionId);

describe('initialTableState (§5.3)', () => {
  it('human Rebels: t-1-1 initialSetup → t-1-2 registerBase, registration expected over the eligible systems', () => {
    const table = CoreTableStateSchema.parse(
      initialTableState(physicalSettings('rebels'), ELIGIBLE),
    );
    expect(table.tasks.map((t) => [t.id, t.kind, t.completion])).toEqual([
      ['t-1-1', 'initialSetup', 'confirm'],
      ['t-1-2', 'registerBase', 'register'],
    ]);
    const [setup, registration] = table.tasks;
    expect(setup).toMatchObject({
      actor: 'system',
      titleKey: 'table.tasks.initialSetup',
      createdAtVersion: 1,
      affected: { cardDefinitionIds: REMOVED, leaderIds: [], unitIds: [], systemIds: [] },
    });
    expect(setup?.steps).toEqual([
      { key: 'table.steps.setupFirstGame', params: {} },
      { key: 'table.steps.removeProbeCards', params: { definitionIds: REMOVED } },
      { key: 'table.steps.setAsideReferenceStack', params: {} },
    ]);
    expect(registration).toMatchObject({
      actor: 'rebels',
      titleKey: 'table.tasks.registerBase',
      createdAtVersion: 1,
      steps: [{ key: 'table.steps.registerBaseCard', params: {} }],
    });
    expect(table.baseRegistration).toEqual({ eligibleSystemIds: ELIGIBLE });
  });

  it('human Empire: one initialSetup with the Location placeholder (never a system), no registration', () => {
    const table = CoreTableStateSchema.parse(
      initialTableState(physicalSettings('empire'), ELIGIBLE),
    );
    expect(table.tasks).toHaveLength(1);
    expect(table.tasks[0]?.steps.map((s) => s.key)).toEqual([
      'table.steps.setupFirstGame',
      'table.steps.removeProbeCards',
      'table.steps.placeLocationPlaceholder',
      'table.steps.setAsideReferenceStack',
    ]);
    expect(table.tasks[0]?.affected.systemIds).toEqual([]);
    expect(table.baseRegistration).toBeNull();
  });

  it('the initial tasks never depend on the base (the same for every eligible base)', () => {
    for (const human of ['rebels', 'empire'] as const) {
      const tables = ELIGIBLE.map((base) => JSON.stringify(physicalGame(human, base).table));
      expect(new Set(tables).size, human).toBe(1);
    }
  });

  it('a created physical game is a valid stored state with the table; the input settings are not mutated', () => {
    const settings = physicalSettings('rebels');
    const snapshot = JSON.stringify(settings);
    const game = physicalGame('rebels');
    expect(game.table?.tasks).toHaveLength(2);
    expect(JSON.stringify(settings)).toBe(snapshot);
  });

  it('digital games have no table (AC-11: no tasks in digital)', () => {
    for (const human of ['rebels', 'empire'] as const) {
      const game = realGame(digitalSettings(human), realGameIdWithBase('rodia', 'dig'));
      expect(game.table).toBeUndefined();
      expect(tableViewFor(game, human)).toBeNull();
    }
  });
});

describe('tableViewFor (§4.2, §11.3)', () => {
  it('human Rebels before the registration: tasks, registration with the eligible probe cards (TC-PH-09)', () => {
    const game = physicalGame('rebels');
    const view = TableViewSchema.parse(tableViewFor(game, 'rebels'));
    expect(view.tasks).toEqual(game.table?.tasks);
    expect(view.registration).toEqual({
      zoneId: 'rebels-location',
      eligibleDefinitionIds: ELIGIBLE.map(probeDefinitionId),
    });
    // The Rebels (human) are the active side: the AI is not the one waiting.
    expect(view.aiWaiting).toBe(false);
  });

  it('human Empire at creation: the AI Rebels are to move and wait for the initial setup', () => {
    const game = physicalGame('empire');
    const view = TableViewSchema.parse(tableViewFor(game, 'empire'));
    expect(view).toMatchObject({ aiWaiting: true, registration: null });
    expect(view.tasks).toHaveLength(1);
  });

  it('the AI side never gets a table; the view is a copy (mutating it leaves the state intact)', () => {
    const game = physicalGame('empire');
    expect(tableViewFor(game, 'rebels')).toBeNull();
    const view = tableViewFor(game, 'empire');
    view?.tasks.splice(0);
    expect(game.table?.tasks).toHaveLength(1);
  });

  it('coreSideView carries the projection for the human and null for the AI side', () => {
    const game = physicalGame('empire');
    expect(coreSideView(game, 'rebels').table).toBeNull();
    expect(coreSideView(game, 'empire').table).toEqual(tableViewFor(game, 'empire'));
  });
});
