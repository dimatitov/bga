/**
 * SWR-005 Worker M — map drag of a unit (plan-frontend §12; AC-05, AC-12): a drop on the activated system sends one
 * `MOVE_PIECES` (through P1's `useTurnCommands().move`); a drop elsewhere sends nothing and rolls back; compact LOD
 * disables the drag. Also the map click / leader-drop activation path (`useActivateSystem`).
 */
import { coreMapLayout } from '@bga/game-rebellion/board';
import { act, renderHook } from '@testing-library/react';
import type Konva from 'konva';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFeedbackStore, useFeedbackStore } from '@/shared/feedback';
import { i18n } from '@/shared/i18n';
import { useSettingsStore } from '@/shared/settings';
import type { CommandOutcome } from '../../board/model/boardContext';
import { useDragStore } from '../../board/model/dragStore';
import {
  CORE_SESSION_ID,
  CS_CORELLIA,
  CS_HOTH,
  CS_SULLUST,
  CS_YAVIN,
  L_LEIA,
  U_SD,
  U_SHIELD,
  U_XWING,
  makeCoreActivationView,
  makeCoreView,
} from '../../test/coreFixtures';
import { CoreBoardContext, type CoreBoardContextValue } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import { useTurnErrorStore } from '../panels/turnErrorStore';
import { useActivateSystem } from './useActivateSystem';
import { useCoreMoveDrag } from './useCoreMoveDrag';

const CENTERS = new Map(
  [CS_CORELLIA, CS_SULLUST, CS_YAVIN, CS_HOTH].map((id) => [id, coreMapLayout[id]!]),
);
const HOME = { x: 1, y: 2 };

function wrap(view: CoreBoardContextValue['view'], outcome: CommandOutcome, isPending = false) {
  const send = vi.fn(async () => outcome);
  const value: CoreBoardContextValue = { sessionId: CORE_SESSION_ID, view, send, isPending };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CoreBoardContext.Provider value={value}>{children}</CoreBoardContext.Provider>
  );
  return { send, wrapper };
}

function setup(outcome: CommandOutcome = { ok: true, view: makeCoreActivationView(), events: [] }) {
  const view = makeCoreActivationView();
  const { send, wrapper } = wrap(view, outcome);
  const { result } = renderHook(() => useCoreMoveDrag(CENTERS), { wrapper });
  const node = { position: vi.fn(), to: vi.fn() } as unknown as Konva.Node & {
    position: ReturnType<typeof vi.fn>;
  };
  return { result, send, node };
}

beforeEach(() => {
  useDragStore.getState().clear();
  useCoreUiStore.getState().reset();
  useTurnErrorStore.getState().clear();
  resetFeedbackStore();
  useSettingsStore.setState({ reduceMotion: true });
});

describe('useCoreMoveDrag', () => {
  it('only server-listed units are draggable, only in the detail LOD', () => {
    const { result } = setup();
    expect(result.current.canDrag(U_XWING, 'detail')).toBe(true);
    expect(result.current.canDrag(U_XWING, 'compact')).toBe(false);
    expect(result.current.canDrag(U_SHIELD, 'detail')).toBe(false); // immobile, not a candidate
    expect(result.current.canDrag(U_SD, 'detail')).toBe(false); // enemy
  });

  it('nothing is draggable while a command is in flight', () => {
    const { wrapper } = wrap(
      makeCoreActivationView(),
      { ok: true, view: makeCoreView(), events: [] },
      true,
    );
    const { result } = renderHook(() => useCoreMoveDrag(CENTERS), { wrapper });
    expect(result.current.canDrag(U_XWING, 'detail')).toBe(false);
  });

  it('over(): the activated system is legal, another system illegal, the source / empty space neutral', () => {
    const { result } = setup();
    result.current.start(U_XWING, {} as Konva.Node);
    expect(useDragStore.getState().drag).toMatchObject({
      pieceId: U_XWING,
      fromSystemId: CS_YAVIN,
    });
    result.current.over(U_XWING, coreMapLayout[CS_CORELLIA]!);
    expect(useDragStore.getState().drag).toMatchObject({
      overSystemId: CS_CORELLIA,
      overState: 'legal',
    });
    result.current.over(U_XWING, coreMapLayout[CS_HOTH]!);
    expect(useDragStore.getState().drag).toMatchObject({
      overSystemId: CS_HOTH,
      overState: 'illegal',
    });
    result.current.over(U_XWING, coreMapLayout[CS_YAVIN]!);
    expect(useDragStore.getState().drag?.overState).toBe('none');
    result.current.over(U_XWING, { x: -5000, y: -5000 });
    expect(useDragStore.getState().drag).toMatchObject({ overSystemId: null, overState: 'none' });
  });

  it('drop on the activated system sends exactly one MOVE_PIECES for that unit', async () => {
    const { result, send, node } = setup();
    result.current.start(U_XWING, node);
    result.current.over(U_XWING, coreMapLayout[CS_CORELLIA]!);
    await act(() => result.current.drop(node, U_XWING, HOME));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      type: 'MOVE_PIECES',
      pieceIds: [U_XWING],
      fromSystemId: CS_YAVIN,
      toSystemId: CS_CORELLIA,
    });
    expect(node.position).not.toHaveBeenCalled(); // the new view moves the glyph
    expect(useDragStore.getState().drag).toBeNull();
    expect(useDragStore.getState().pendingMove).toBeNull();
  });

  it('drop on another system: no request, roll back, explain', async () => {
    const { result, send, node } = setup();
    result.current.start(U_XWING, node);
    result.current.over(U_XWING, coreMapLayout[CS_HOTH]!);
    await act(() => result.current.drop(node, U_XWING, HOME));
    expect(send).not.toHaveBeenCalled();
    expect(node.position).toHaveBeenLastCalledWith(HOME);
    expect(useFeedbackStore.getState().live?.text).toBe(
      i18n.t('rebellion.board:move.illegalTarget', {
        system: i18n.t('rebellion.data:systems.hoth'),
      }),
    );
  });

  it('drop on empty space: no request, roll back, «cancelled» announced', async () => {
    const { result, send, node } = setup();
    result.current.start(U_XWING, node);
    await act(() => result.current.drop(node, U_XWING, HOME));
    expect(send).not.toHaveBeenCalled();
    expect(node.position).toHaveBeenLastCalledWith(HOME);
    expect(useFeedbackStore.getState().live?.text).toBe(i18n.t('rebellion.board:move.cancelled'));
  });

  it('a 422 rolls the unit back and shows the reason inline at the source (move-error-<from>)', async () => {
    const { result, node } = setup({
      ok: false,
      code: 'INSUFFICIENT_CAPACITY',
      messageKey: 'errors.insufficientCapacity',
    });
    result.current.start(U_XWING, node);
    result.current.over(U_XWING, coreMapLayout[CS_CORELLIA]!);
    await act(() => result.current.drop(node, U_XWING, HOME));
    expect(node.position).toHaveBeenLastCalledWith(HOME);
    expect(useTurnErrorStore.getState().move[CS_YAVIN]).toBeTruthy();
  });
});

describe('useActivateSystem (map click / leader drop)', () => {
  it('sends ACTIVATE_SYSTEM only for a listed leader/system pair and disarms on success', async () => {
    const view = makeCoreView({
      legalActions: [
        { type: 'ACTIVATE_SYSTEM', leaderIds: [L_LEIA], systemIds: [CS_SULLUST] },
        { type: 'PASS' },
      ],
    });
    const { send, wrapper } = wrap(view, { ok: true, view: makeCoreActivationView(), events: [] });
    useCoreUiStore.getState().arm(L_LEIA);
    const { result } = renderHook(() => useActivateSystem(), { wrapper });
    await act(async () => {
      await result.current(L_LEIA, CS_HOTH);
    });
    expect(send).not.toHaveBeenCalled();
    await act(async () => {
      await result.current(L_LEIA, CS_SULLUST);
    });
    expect(send).toHaveBeenCalledWith({
      type: 'ACTIVATE_SYSTEM',
      leaderId: L_LEIA,
      systemId: CS_SULLUST,
    });
    expect(useCoreUiStore.getState().armedLeaderId).toBeNull();
  });
});
