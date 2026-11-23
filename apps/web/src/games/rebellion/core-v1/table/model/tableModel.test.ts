/**
 * SWR-010 FE-B (plan-frontend §11.1): Physical Execution selectors — console mode, head task, step values for every
 * step key in both languages, the «Rebel Base» space for a `null` system, «—» for a missing parameter.
 */
import { TABLE_STEP_KEYS, type TableStep, type TableStepKey } from '@bga/game-rebellion/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { makeCoreOutcomeView, makeCoreView, U_ST1, U_ST2, U_TIE } from '../../../test/coreFixtures';
import {
  aiActivationTask,
  aiMoveIntoBaseTask,
  aiMoveTask,
  makePhysicalEmpireView,
  makePhysicalRebelsView,
  refreshTaskEmpire,
  refreshTaskRebels,
} from '../../../test/tableFixtures';
import {
  affectedItems,
  consoleMode,
  headTask,
  isAiWaiting,
  registrationOf,
  stepText,
  stepValues,
  tableTasks,
} from './tableModel';

afterEach(() => i18n.changeLanguage('ru'));

/** One realistic step per key (params as the server builds them, plan-backend §11.3). */
const SAMPLE: Record<TableStepKey, TableStep['params']> = {
  'table.steps.setupFirstGame': {},
  'table.steps.removeProbeCards': { definitionIds: ['probe-corellia', 'probe-sullust'] },
  'table.steps.setAsideReferenceStack': {},
  'table.steps.placeLocationPlaceholder': {},
  'table.steps.registerBaseCard': {},
  'table.steps.placeLeader': { leaderId: 'vader', systemId: 'corellia' },
  'table.steps.moveUnits': {
    unitIds: [U_ST1, U_ST2, U_TIE],
    fromSystemId: 'sullust',
    toSystemId: 'corellia',
  },
  'table.steps.returnLeaders': { leaderIds: ['vader', 'leia'] },
  'table.steps.takeProbeCards': { definitionIds: ['probe-hoth', 'probe-endor'] },
  'table.steps.opponentDrewProbeCards': { count: 2 },
  'table.steps.advanceTime': { from: 3, to: 4 },
  'table.steps.revealBase': { systemId: 'yavin' },
  'table.steps.revealOwnBase': { systemId: 'yavin' },
  'table.steps.moveBaseUnits': { systemId: 'yavin' },
};

describe('consoleMode / queue selectors (plan-frontend §2.1)', () => {
  it('turn without a table (digital / legacy) and with an empty queue; physical while tasks exist', () => {
    expect(consoleMode(makeCoreView())).toBe('turn');
    expect(consoleMode(makePhysicalRebelsView({ tasks: [] }))).toBe('turn');
    expect(consoleMode(makePhysicalRebelsView())).toBe('physical');
    expect(consoleMode(makePhysicalEmpireView())).toBe('physical');
  });

  it('stays physical after the game is over while tasks remain (C-5)', () => {
    const over = makeCoreOutcomeView('empire', 'rebelBaseCaptured', {
      table: { tasks: [aiMoveTask()], aiWaiting: false, registration: null },
    });
    expect(consoleMode(over)).toBe('physical');
  });

  it('head = first task; aiWaiting and registration straight from the view', () => {
    const view = makePhysicalRebelsView({ aiWaiting: true });
    expect(tableTasks(view).map((t) => t.id)).toEqual(['t-1-1', 't-1-2']);
    expect(headTask(view)?.kind).toBe('initialSetup');
    expect(isAiWaiting(view)).toBe(true);
    expect(registrationOf(view)?.eligibleDefinitionIds).toEqual([
      'probe-yavin',
      'probe-hoth',
      'probe-dagobah',
    ]);
    expect(headTask(makeCoreView())).toBeNull();
    expect(isAiWaiting(makeCoreView())).toBe(false);
  });
});

describe('stepValues / stepText (plan-frontend §8.3)', () => {
  const view = makePhysicalEmpireView({ tasks: [aiActivationTask()] });

  it('the sample covers every TABLE_STEP_KEYS entry', () => {
    expect(Object.keys(SAMPLE).sort()).toEqual([...TABLE_STEP_KEYS].sort());
  });

  it.each(['ru', 'en'] as const)(
    '%s: every step key has a text, no raw key, no «{{», no «—»',
    async (lng) => {
      await i18n.changeLanguage(lng);
      for (const key of TABLE_STEP_KEYS) {
        const text = stepText(i18n.t, { key, params: SAMPLE[key] }, view, lng);
        expect(text, key).not.toContain('table.steps');
        expect(text, key).not.toContain('{{');
        expect(text, key).not.toContain('—');
        expect(text.length, key).toBeGreaterThan(5);
        if (lng === 'en') expect(text, key).not.toMatch(/[А-Яа-яЁё]/);
      }
    },
  );

  it('names: cards, leaders, grouped units, systems; numbers as is', async () => {
    await i18n.changeLanguage('en');
    const t = i18n.t;
    expect(
      stepValues(
        t,
        { key: 'table.steps.takeProbeCards', params: SAMPLE['table.steps.takeProbeCards'] },
        view,
        'en',
      ),
    ).toEqual({ cards: 'Hoth and Endor', count: 2 });
    expect(
      stepValues(
        t,
        { key: 'table.steps.moveUnits', params: SAMPLE['table.steps.moveUnits'] },
        view,
        'en',
      ),
    ).toMatchObject({ count: 3, from: 'Sullust', to: 'Corellia' });
    const units = stepValues(
      t,
      { key: 'table.steps.moveUnits', params: SAMPLE['table.steps.moveUnits'] },
      view,
      'en',
    ).units as string;
    expect(units).toMatch(/^2× .+ and 1× .+$/);
    expect(
      stepValues(t, { key: 'table.steps.advanceTime', params: { from: 3, to: 4 } }, view, 'en'),
    ).toEqual({ from: 3, to: 4 });
    expect(
      stepText(
        t,
        { key: 'table.steps.placeLeader', params: SAMPLE['table.steps.placeLeader'] },
        view,
        'en',
      ),
    ).toBe('Place Darth Vader in Corellia.');
  });

  it('a null system is the «Rebel Base» space (ru and en)', async () => {
    const step: TableStep = {
      key: 'table.steps.moveUnits',
      params: { unitIds: [U_ST1], fromSystemId: 'sullust', toSystemId: null },
    };
    expect(stepValues(i18n.t, step, view, 'ru').to).toBe('клетка «База Повстанцев»');
    await i18n.changeLanguage('en');
    expect(stepValues(i18n.t, step, view, 'en').to).toBe('the "Rebel Base" space');
  });

  it('a missing or malformed parameter becomes «—», without throwing', () => {
    expect(stepValues(i18n.t, { key: 'table.steps.placeLeader', params: {} }, view, 'ru')).toEqual({
      leader: '—',
      system: '—',
    });
    expect(
      stepValues(
        i18n.t,
        { key: 'table.steps.takeProbeCards', params: { definitionIds: 'x' } },
        view,
        'ru',
      ),
    ).toEqual({ cards: '—', count: '—' });
    expect(() =>
      stepText(i18n.t, { key: 'table.steps.moveUnits', params: { unitIds: [] } }, view, 'ru'),
    ).not.toThrow();
  });

  it('opponentDrewProbeCards: a count only, RU plural', () => {
    const text = (count: number) =>
      stepText(
        i18n.t,
        { key: 'table.steps.opponentDrewProbeCards', params: { count } },
        view,
        'ru',
      );
    expect(text(1)).toContain('1 карту зонда');
    expect(text(2)).toContain('2 карты зондов');
    expect(text(5)).toContain('5 карт зондов');
  });
});

describe('affectedItems', () => {
  it('lists names; a null system is the «Rebel Base» space; the hidden base is never named', () => {
    const view = makePhysicalEmpireView({ tasks: [aiMoveIntoBaseTask(['u-r-xwing'], 'corellia')] });
    const items = affectedItems(i18n.t, headTask(view)!, view);
    expect(items.systems).toEqual(['Кореллия', 'клетка «База Повстанцев»']);
    expect(JSON.stringify(items)).not.toContain('Явин');
  });

  it('refresh of the human Empire names its drawn probe cards; of the human Rebels — nothing but the count', () => {
    const emp = makePhysicalEmpireView({ tasks: [refreshTaskEmpire(['hoth', 'endor'])] });
    expect(affectedItems(i18n.t, headTask(emp)!, emp).cards).toEqual(['Хот', 'Эндор']);
    const reb = makePhysicalRebelsView({ tasks: [refreshTaskRebels(2)], unregistered: false });
    expect(affectedItems(i18n.t, headTask(reb)!, reb)).toEqual({
      cards: [],
      leaders: [],
      units: [],
      systems: [],
    });
  });
});
