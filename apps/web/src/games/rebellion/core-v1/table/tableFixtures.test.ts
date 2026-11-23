/**
 * SWR-010 FE-B (plan-frontend §10): every Physical Execution fixture is a valid server view (`PlayerViewSchema`) and
 * its task ids have the server format `t-<version>-<n>`.
 */
import { PlayerViewSchema } from '@bga/game-rebellion/schema';
import { describe, expect, it } from 'vitest';
import {
  aiActivationTask,
  aiMoveIntoBaseTask,
  aiMoveTask,
  makePhysicalEmpireView,
  makePhysicalRebelsView,
  refreshTaskEmpire,
  refreshTaskRebels,
} from '../../test/tableFixtures';

const VIEWS = {
  rebelsInitial: makePhysicalRebelsView(),
  rebelsRegistered: makePhysicalRebelsView({ unregistered: false }),
  rebelsAiTasks: makePhysicalRebelsView({
    unregistered: false,
    aiWaiting: true,
    tasks: [aiActivationTask(), aiMoveTask(), refreshTaskRebels(2)],
  }),
  rebelsEmptyQueue: makePhysicalRebelsView({ unregistered: false, tasks: [] }),
  empireInitial: makePhysicalEmpireView(),
  empireTasks: makePhysicalEmpireView({
    empireProbes: ['hoth', 'endor'],
    tasks: [aiMoveIntoBaseTask(['u-r-xwing'], 'corellia'), refreshTaskEmpire(['hoth', 'endor'])],
  }),
};

describe('tableFixtures', () => {
  it.each(Object.entries(VIEWS))('%s parses with PlayerViewSchema', (_, view) => {
    const parsed = PlayerViewSchema.safeParse(view);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
  });

  it.each(Object.entries(VIEWS))('%s: task ids are t-<version>-<n>', (_, view) => {
    for (const task of view.kind === 'player' ? (view.table?.tasks ?? []) : [])
      expect(task.id).toMatch(/^t-[1-9][0-9]*-[1-9][0-9]*$/);
  });
});
