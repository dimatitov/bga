/**
 * SWR-010 W4 — CONFIRM_TABLE_TASK (plan-backend §5.4, §5.5; AC-12, C-5, C-6; TC-CF-01..06, 10, 11 rules part, TC-CF-12).
 */
import { describe, expect, it } from 'vitest';
import { CoreGameStateV3Schema, type CoreGameState } from '../../../src/schema';
import { applyConfirmTask, validateConfirmTask } from '../../../src/rules/core/table';
import { PASS, activate, clone, deepFreeze, rejected, tryApply } from './helpers';
import {
  aiOk,
  confirm,
  confirmAll,
  digitalSettings,
  humanOk,
  physicalGame,
  realGame,
  realGameIdWithBase,
  registeredRebels,
} from './table-fixtures';

/** Everything of the state except the fields a confirmation may change. */
function rest(state: CoreGameState): unknown {
  const { version: _v, log: _l, table: _t, ...others } = state;
  return others;
}

describe('confirming the head task', () => {
  it('TC-CF-01/12: version +1, one TABLE_TASK_CONFIRMED, the head leaves the queue — nothing else changes', () => {
    const game = physicalGame('empire'); // queue: [t-1-1 initialSetup]
    const before = clone(game);
    const { state, events } = humanOk(game, confirm('t-1-1'));
    expect(game).toEqual(before); // input untouched (also deep-frozen by `ok`)
    expect(state.version).toBe(game.version + 1);
    expect(events).toEqual([
      {
        seq: game.log.length + 1,
        type: 'TABLE_TASK_CONFIRMED',
        actor: 'empire',
        payload: { taskId: 't-1-1', kind: 'initialSetup' },
        at: '2026-11-08T10:05:00.000Z',
      },
    ]);
    expect(state.log).toEqual([...game.log, ...events]);
    expect(state.table).toEqual({ tasks: [], baseRegistration: null });
    expect(rest(state)).toEqual(rest(game));
  });

  it('a queue of 2+ tasks: only the head goes, the order of the rest is kept', () => {
    const game = physicalGame('rebels'); // [t-1-1 initialSetup, t-1-2 registerBase]
    const { state } = humanOk(game, confirm('t-1-1'));
    expect(state.table?.tasks.map((t) => t.id)).toEqual(['t-1-2']);
    expect(state.table?.baseRegistration).toEqual(game.table?.baseRegistration);
    expect(rest(state)).toEqual(rest(game));
  });

  it('applyConfirmTask is pure (deep-frozen input) and validateConfirmTask accepts the head', () => {
    const game = deepFreeze(physicalGame('empire'));
    expect(validateConfirmTask(game, { type: 'CONFIRM_TABLE_TASK', taskId: 't-1-1' })).toBeNull();
    const t = applyConfirmTask(game, 'empire', { type: 'CONFIRM_TABLE_TASK', taskId: 't-1-1' });
    expect(t.state.table?.tasks).toEqual([]);
    expect(t.state.version).toBe(game.version);
  });
});

describe('rejections (each leaves the state unchanged)', () => {
  it('TC-CF-02/C-6: the exact repeat (stale expectedVersion) → 409', () => {
    const game = physicalGame('empire');
    const after = humanOk(game, confirm('t-1-1')).state;
    const error = rejected(after, 'empire', confirm('t-1-1'), 'errors.versionConflict', {
      expectedVersion: game.version,
    });
    expect(error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: after.version },
    });
  });

  it('TC-CF-03/C-6: the repeat with the fresh version → 422 tableTaskNotFound (the effect is not repeated)', () => {
    const after = humanOk(physicalGame('empire'), confirm('t-1-1')).state;
    const error = rejected(after, 'empire', confirm('t-1-1'), 'errors.tableTaskNotFound');
    expect(error).toEqual({
      code: 'ILLEGAL_COMMAND',
      messageKey: 'errors.tableTaskNotFound',
      details: { taskId: 't-1-1' },
    });
  });

  it('TC-CF-04: not the head → tableTaskNotHead', () => {
    let s = confirmAll(physicalGame('empire'));
    s = aiOk(s, activate('leia', 'tatooine')).state; // one task
    // Build a 2-task queue: the head stays, a second task follows (any valid task shape).
    const head = s.table?.tasks[0];
    if (!head) throw new Error('expected a task');
    const second = { ...head, id: `t-${s.version}-2` };
    const two = CoreGameStateV3Schema.parse({
      ...s,
      table: { tasks: [head, second], baseRegistration: null },
    });
    rejected(two, 'empire', confirm(second.id), 'errors.tableTaskNotHead');
  });

  it('TC-CF-05: unknown ids → tableTaskNotFound', () => {
    const game = physicalGame('empire');
    for (const id of ['nope', 't-9-9', 't-1-2']) {
      rejected(game, 'empire', confirm(id), 'errors.tableTaskNotFound');
    }
  });

  it('a registerBase head is completed by REGISTER_CARD only → tableTaskNeedsRegistration', () => {
    const s = humanOk(physicalGame('rebels'), confirm('t-1-1')).state;
    rejected(s, 'rebels', confirm('t-1-2'), 'errors.tableTaskNeedsRegistration');
  });

  it('TC-CF-06: an older version → 409 (checked first)', () => {
    const game = humanOk(physicalGame('rebels'), confirm('t-1-1')).state; // version 2
    rejected(game, 'rebels', confirm('nope'), 'errors.versionConflict', {
      expectedVersion: game.version - 1,
    });
  });

  it("TC-CF-11: the AI side or the server's auto origin → notYourSide", () => {
    const game = physicalGame('empire');
    rejected(game, 'rebels', confirm('t-1-1'), 'errors.notYourSide');
    rejected(game, 'rebels', confirm('t-1-1'), 'errors.notYourSide', { origin: 'auto' });
    rejected(game, 'empire', confirm('t-1-1'), 'errors.notYourSide', { origin: 'auto' });
  });

  it('TC-CF-10: digital games (no table) → commandUnavailable, both sides', () => {
    const game = realGame(digitalSettings('rebels'), realGameIdWithBase('rodia', 'dig'));
    rejected(game, 'rebels', confirm('t-1-1'), 'errors.commandUnavailable');
    rejected(game, 'empire', confirm('t-1-1'), 'errors.commandUnavailable');
  });
});

describe('after the end of the game (C-5, AQ-3)', () => {
  it('the remaining tasks stay confirmable; other commands are still gameOver', () => {
    // Human Rebels vs AI Empire: time reaches reputation after enough passes → the Rebels win in a Refresh,
    // whose task is left in the queue.
    let s = registeredRebels('rodia');
    for (let i = 0; i < 40 && s.outcome === null; i += 1) {
      s = humanOk(s, PASS).state;
      if (s.outcome !== null) break;
      const head = s.table?.tasks[0];
      if (head) s = humanOk(s, confirm(head.id)).state;
      s = aiOk(s, PASS).state;
      if (s.outcome !== null) break;
      const refresh = s.table?.tasks[0];
      if (refresh) s = humanOk(s, confirm(refresh.id)).state;
    }
    expect(s.outcome).toEqual({ winner: 'rebels', reason: 'timeReachedReputation' });
    const last = s.table?.tasks[0];
    expect(last?.kind).toBe('refresh');
    rejected(s, 'rebels', PASS, 'errors.gameOver');
    const { state } = humanOk(s, confirm(last?.id ?? ''));
    expect(state.table?.tasks).toEqual([]);
    expect(state.outcome).toEqual(s.outcome);
    expect(tryApply(state, 'rebels', confirm(last?.id ?? '')).ok).toBe(false);
  });
});
