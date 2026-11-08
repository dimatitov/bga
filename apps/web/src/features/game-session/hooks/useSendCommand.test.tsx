import type { Command } from '@swr/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameKeys } from '@/shared/api';
import { createTestQueryClient, makeView, mockFetch, type MockReply } from '@/shared/test';
import { useSendCommand } from './useSendCommand';

const MOVE: Command = {
  type: 'MOVE_PIECES',
  pieceIds: ['P_E1'],
  fromSystemId: 'S_A',
  toSystemId: 'S_B',
};
const PATH = 'POST /api/games/g1/commands';

function setup(replies: MockReply[]) {
  const queue = [...replies];
  mockFetch({ [PATH]: () => queue.shift() ?? 'network' });
  const qc = createTestQueryClient();
  qc.setQueryData(gameKeys.view('g1'), makeView());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSendCommand('g1'), { wrapper });
}

const ok = (): MockReply => ({
  status: 200,
  body: { ok: true, view: makeView({ version: 2 }), events: [] },
});
const illegal: MockReply = {
  status: 422,
  body: { ok: false, error: { code: 'ILLEGAL_COMMAND', messageKey: 'errors.notAdjacent' } },
};

describe('useSendCommand — save indicator (review nit #6)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('stays idle after a rejected (4xx) command when nothing was ever saved', async () => {
    const { result } = setup([illegal]);
    let outcome: Awaited<ReturnType<typeof result.current.send>> | undefined;
    await act(async () => {
      outcome = await result.current.send(MOVE);
    });
    expect(outcome?.ok).toBe(false);
    expect(result.current.saveStatus).toBe('idle');
  });

  it('keeps "saved" from the previous accepted command after a 4xx', async () => {
    const { result } = setup([ok(), illegal]);
    await act(async () => {
      await result.current.send(MOVE);
    });
    expect(result.current.saveStatus).toBe('saved');
    await act(async () => {
      await result.current.send(MOVE);
    });
    expect(result.current.saveStatus).toBe('saved');
  });

  it('keeps "error" from a previous network failure after a 4xx', async () => {
    const { result } = setup(['network', illegal]);
    await act(async () => {
      await result.current.send(MOVE);
    });
    expect(result.current.saveStatus).toBe('error');
    await act(async () => {
      await result.current.send(MOVE);
    });
    expect(result.current.saveStatus).toBe('error');
  });

  it('switches to "saved" only on an accepted command', async () => {
    const { result } = setup([ok()]);
    await act(async () => {
      await result.current.send(MOVE);
    });
    expect(result.current.saveStatus).toBe('saved');
  });
});
