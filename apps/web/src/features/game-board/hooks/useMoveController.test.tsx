import { act, renderHook } from '@testing-library/react';
import type Konva from 'konva';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFeedbackStore, useFeedbackStore } from '@/shared/feedback';
import { i18n } from '@/shared/i18n';
import { useSettingsStore } from '@/shared/settings';
import { BoardContext, type BoardContextValue, type CommandOutcome } from '../model/boardContext';
import { computeBoardLayout } from '../model/boardLayout';
import { useDragStore } from '../model/dragStore';
import { GAME_ID, makeMovedView, makeView, P_E1, S_A, S_B, S_C } from '../test/fixtures';
import { useMoveController } from './useMoveController';

function setup(outcome: CommandOutcome) {
  const view = makeView();
  const send = vi.fn(async () => outcome);
  const value: BoardContextValue = { gameId: GAME_ID, view, send, isPending: false };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
  );
  const { result } = renderHook(() => useMoveController(), { wrapper });
  const node = { position: vi.fn(), to: vi.fn() } as unknown as Konva.Node & {
    position: ReturnType<typeof vi.fn>;
  };
  return { result, send, node, view };
}

beforeEach(() => {
  useDragStore.getState().clear();
  resetFeedbackStore();
  useSettingsStore.setState({ reduceMotion: true });
});

describe('useMoveController.drop', () => {
  it('A-16: drop on a system that is not a listed target sends nothing, rolls back and explains', async () => {
    const { result, send, node, view } = setup({ ok: true, view: makeMovedView(), events: [] });
    useDragStore.getState().start(P_E1, S_A);
    useDragStore.getState().over(S_C, 'illegal');
    await act(() => result.current.drop(node, P_E1));
    expect(send).not.toHaveBeenCalled();
    expect(node.position).toHaveBeenLastCalledWith(computeBoardLayout(view).slots.get(P_E1));
    expect(useFeedbackStore.getState().live?.text).toBe(
      i18n.t('board:move.illegalTarget', { system: i18n.t('gameData:systems.sys-dovmaren') }),
    );
    expect(useDragStore.getState().drag).toBeNull();
  });

  it('drop on empty space cancels silently (announce only)', async () => {
    const { result, send, node } = setup({ ok: true, view: makeMovedView(), events: [] });
    useDragStore.getState().start(P_E1, S_A);
    await act(() => result.current.drop(node, P_E1));
    expect(send).not.toHaveBeenCalled();
    expect(useFeedbackStore.getState().queue).toHaveLength(0);
    expect(useFeedbackStore.getState().live?.text).toBe(i18n.t('board:move.cancelled'));
  });

  it('drop on a legal target sends MOVE_PIECES and puts the node at the slot of the new view', async () => {
    const moved = makeMovedView();
    const { result, send, node } = setup({ ok: true, view: moved, events: [] });
    useDragStore.getState().start(P_E1, S_A);
    useDragStore.getState().over(S_B, 'legal');
    await act(() => result.current.drop(node, P_E1));
    expect(send).toHaveBeenCalledWith({
      type: 'MOVE_PIECES',
      pieceIds: [P_E1],
      fromSystemId: S_A,
      toSystemId: S_B,
    });
    expect(node.position).toHaveBeenLastCalledWith(computeBoardLayout(moved).slots.get(P_E1));
    expect(useDragStore.getState().pendingMove).toBeNull();
  });

  it('server rejection rolls the node back to its original slot', async () => {
    const { result, node, view } = setup({
      ok: false,
      code: 'ILLEGAL_COMMAND',
      messageKey: 'errors.notAdjacent',
    });
    useDragStore.getState().start(P_E1, S_A);
    useDragStore.getState().over(S_B, 'legal');
    await act(() => result.current.drop(node, P_E1));
    expect(node.position).toHaveBeenLastCalledWith(computeBoardLayout(view).slots.get(P_E1));
    expect(useFeedbackStore.getState().live?.text).toBe(i18n.t('errors:notAdjacent'));
  });
});
