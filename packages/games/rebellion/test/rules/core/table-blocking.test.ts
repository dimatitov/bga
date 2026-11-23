/**
 * SWR-010 W4 — blocking while physical-table tasks are pending (plan-backend §5.5, §5.7; AC-13, C-3;
 * TC-BL-01 rules part, TC-BL-04, TC-PH-05/06): every other command → 422 `tableSyncPending` (after `notYourSide`,
 * before `notYourTurn`), legal actions `[]` for every viewer; `digital` and empty queues behave as before.
 */
import { describe, expect, it } from 'vitest';
import type { Command, CoreGameState } from '../../../src/schema';
import { getLegalActions } from '../../../src/rules';
import { tableBlocks } from '../../../src/rules/core/table';
import { ACCEPT, ADVANCE, FINISH, PASS, activate, errorKey, mv, rejected } from './helpers';
import {
  aiOk,
  confirm,
  confirmAll,
  digitalSettings,
  humanOk,
  physicalGame,
  realGame,
  realGameIdWithBase,
  register,
  registeredRebels,
} from './table-fixtures';

const GAME_COMMANDS: Command[] = [
  PASS,
  FINISH,
  activate('leia', 'tatooine'),
  activate('vader', 'malastare'),
  mv(['u-40'], 'sullust', 'malastare'),
];

describe('a non-empty queue blocks the game', () => {
  it('TC-BL-04: human commands → tableSyncPending (own turn or not); legal actions [] for both viewers', () => {
    const game = physicalGame('empire'); // initialSetup pending, AI Rebels to move
    expect(tableBlocks(game)).toBe(true);
    for (const command of GAME_COMMANDS) {
      rejected(game, 'empire', command, 'errors.tableSyncPending');
    }
    expect(getLegalActions(game, 'empire')).toEqual([]);
    expect(getLegalActions(game, 'rebels')).toEqual([]);
  });

  it('the AI side (origin auto) is blocked too — the runner never gets a legal step', () => {
    const game = physicalGame('empire');
    for (const command of GAME_COMMANDS) {
      rejected(game, 'rebels', command, 'errors.tableSyncPending', { origin: 'auto' });
    }
  });

  it('order: gameOver → 409 → commandUnavailable → notYourSide come before tableSyncPending; it comes before notYourTurn', () => {
    const game = physicalGame('rebels'); // Rebels (human) to move, queue non-empty
    // notYourSide: the AI side without the auto origin.
    rejected(game, 'empire', PASS, 'errors.notYourSide');
    rejected(game, 'rebels', ADVANCE, 'errors.commandUnavailable');
    rejected(game, 'rebels', PASS, 'errors.versionConflict', { expectedVersion: 9 });
    rejected(
      { ...game, outcome: { winner: 'rebels', reason: 'timeReachedReputation' } },
      'rebels',
      PASS,
      'errors.gameOver',
    );
    // Human Empire, AI Rebels to move: the human's off-turn command reports the table first.
    rejected(physicalGame('empire'), 'empire', PASS, 'errors.tableSyncPending');
    // ACCEPT_HANDOFF in an AI game: the table first as well.
    rejected(physicalGame('empire'), 'empire', ACCEPT, 'errors.tableSyncPending');
  });

  it('TC-PH-06/C-3: REGISTER_CARD is allowed while initialSetup is pending; CONFIRM is the other exception', () => {
    const game = physicalGame('rebels');
    expect(errorKey(game, 'rebels', register('tatooine'))).toBeNull();
    expect(errorKey(game, 'rebels', confirm('t-1-1'))).toBeNull();
  });

  it('TC-BL-01 (rules part): after the last confirmation the AI side has legal actions again', () => {
    let s: CoreGameState = physicalGame('empire');
    s = confirmAll(s);
    expect(tableBlocks(s)).toBe(false);
    expect(getLegalActions(s, 'rebels').length).toBeGreaterThan(0);
    // The AI moves → a task → blocked again until it is confirmed.
    s = aiOk(s, activate('leia', 'tatooine')).state;
    expect(tableBlocks(s)).toBe(true);
    expect(getLegalActions(s, 'rebels')).toEqual([]);
    s = humanOk(s, confirm(s.table?.tasks[0]?.id ?? '')).state;
    expect(getLegalActions(s, 'rebels').map((a) => a.type)).toContain('FINISH_ACTIVATION');
  });

  it('human Rebels: registration + confirmation unblock the game in either order', () => {
    const a = humanOk(
      humanOk(physicalGame('rebels'), confirm('t-1-1')).state,
      register('rodia'),
    ).state;
    const b = humanOk(
      humanOk(physicalGame('rebels'), register('rodia')).state,
      confirm('t-1-1'),
    ).state;
    for (const s of [a, b]) {
      expect(tableBlocks(s)).toBe(false);
      expect(getLegalActions(s, 'rebels').length).toBeGreaterThan(0);
    }
    expect(registeredRebels('rodia').table).toEqual({ tasks: [], baseRegistration: null });
  });
});

describe('digital games are never blocked', () => {
  it('no table → the same checks and legal actions as before SWR-010', () => {
    const game = realGame(digitalSettings('rebels'), realGameIdWithBase('rodia', 'dig'));
    expect(tableBlocks(game)).toBe(false);
    expect(getLegalActions(game, 'rebels').map((a) => a.type)).toEqual(['ACTIVATE_SYSTEM', 'PASS']);
    expect(errorKey(game, 'rebels', PASS)).toBeNull();
    expect(errorKey(game, 'empire', PASS)).toBe('errors.notYourSide');
    const after = humanOk(game, PASS).state;
    expect(after.table).toBeUndefined();
  });
});
