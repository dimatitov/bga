import { IDEMPOTENT_REPLAY_HEADER } from '@bga/platform';
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdempotencyKey } from '@/shared/api/idempotency';
import { mockFetch, renderWithProviders, type MockReply } from '@/shared/test';
import { makeSessionEnvelope } from '../test/fakeGame';
import { sessionKeys } from './queries';
import { useCreateSession } from './useCreateSession';

vi.mock('@/shared/api/idempotency', () => ({ createIdempotencyKey: vi.fn() }));

const keyMock = vi.mocked(createIdempotencyKey);

function Harness() {
  const start = useCreateSession('test-game');
  return (
    <div>
      <button type="button" data-testid="submit-a" onClick={() => start.submit({ a: 1, b: 2 })}>
        {'a'}
      </button>
      <button
        type="button"
        data-testid="submit-a-reordered"
        onClick={() => start.submit({ b: 2, a: 1 })}
      >
        {'a2'}
      </button>
      <button type="button" data-testid="submit-b" onClick={() => start.submit({ a: 9 })}>
        {'b'}
      </button>
      <span data-testid="state">
        {start.isPending ? 'pending' : start.error ? 'error' : 'idle'}
      </span>
    </div>
  );
}

const created = (status: 200 | 201 = 201): MockReply => ({
  status,
  body: makeSessionEnvelope({ sessionId: 'new-1', view: { v: 1 } }),
  ...(status === 200 ? { headers: { [IDEMPOTENT_REPLAY_HEADER]: 'true' } } : {}),
});
const serverError: MockReply = {
  status: 500,
  body: { ok: false, error: { code: 'INTERNAL', messageKey: 'errors.internal' } },
};

function setup(replies: MockReply[]) {
  let i = 0;
  const { requests } = mockFetch({
    'POST /api/sessions': () => replies[Math.min(i++, replies.length - 1)] ?? 'network',
  });
  const view = renderWithProviders({ path: '/games/test-game/new', element: <Harness /> });
  const keys = () => requests.map((r) => r.headers['idempotency-key']);
  return { ...view, requests, keys };
}

async function settle() {
  await waitFor(() => expect(screen.getByTestId('state')).not.toHaveTextContent('pending'));
}

describe('useCreateSession: Idempotency-Key (TC-C-09, Q-5 refined)', () => {
  beforeEach(() => {
    let n = 0;
    keyMock.mockReset();
    keyMock.mockImplementation(() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`);
  });

  it('sends the generated key; one generator call per attempt; double submit → one POST', async () => {
    let release: () => void = () => undefined;
    const { requests } = mockFetch({
      'POST /api/sessions': () =>
        new Promise<MockReply>((resolve) => {
          release = () => resolve(created());
        }),
    });
    const { user, router } = renderWithProviders({
      path: '/games/test-game/new',
      element: <Harness />,
    });
    await user.dblClick(screen.getByTestId('submit-a'));
    expect(requests).toHaveLength(1);
    expect(keyMock).toHaveBeenCalledTimes(1);
    expect(requests[0]?.headers['idempotency-key']).toBe('00000000-0000-4000-8000-000000000001');
    act(() => release());
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/new-1'));
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('200 replay is handled like 201: cache seeded with the envelope, replace navigation', async () => {
    const { user, router, queryClient } = setup([created(200)]);
    await user.click(screen.getByTestId('submit-a'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/new-1'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(queryClient.getQueryData(sessionKeys.detail('new-1'))).toEqual(
      makeSessionEnvelope({ sessionId: 'new-1', view: { v: 1 } }),
    );
  });

  it('retry after a server response (5xx/4xx) → a new key', async () => {
    const { user, keys } = setup([serverError, serverError, created()]);
    await user.click(screen.getByTestId('submit-a'));
    await settle();
    await user.click(screen.getByTestId('submit-a'));
    await settle();
    await user.click(screen.getByTestId('submit-a'));
    await waitFor(() => expect(keys()).toHaveLength(3));
    expect(new Set(keys()).size).toBe(3);
    expect(keyMock).toHaveBeenCalledTimes(3);
  });

  it('retry after a network failure without a response, same setup (any key order) → the same key', async () => {
    const { user, keys, router } = setup(['network', 'network', created()]);
    await user.click(screen.getByTestId('submit-a'));
    await settle();
    await user.click(screen.getByTestId('submit-a-reordered'));
    await settle();
    await user.click(screen.getByTestId('submit-a'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/new-1'));
    expect(keys()).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
    ]);
    expect(keyMock).toHaveBeenCalledTimes(1);
  });

  it('network failure, then a changed setup → a new key; then a server error → a new key again', async () => {
    const { user, keys } = setup(['network', serverError, serverError]);
    await user.click(screen.getByTestId('submit-a'));
    await settle();
    await user.click(screen.getByTestId('submit-b'));
    await settle();
    await user.click(screen.getByTestId('submit-b'));
    await settle();
    expect(keys()).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ]);
  });

  it('2xx with an unparseable body (INVALID_RESPONSE) → the retry of the same setup keeps the key (review #2)', async () => {
    const broken: MockReply = { status: 201, body: { sessionId: 'new-1' } };
    const { user, keys, router } = setup([broken, created(200)]);
    await user.click(screen.getByTestId('submit-a'));
    await settle();
    expect(screen.getByTestId('state')).toHaveTextContent('error');
    await user.click(screen.getByTestId('submit-a-reordered'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/new-1'));
    expect(keys()).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
    ]);
    expect(keyMock).toHaveBeenCalledTimes(1);
  });

  it('2xx with an unparseable body, then a changed setup → a new key', async () => {
    const broken: MockReply = { status: 201, body: { sessionId: 'new-1' } };
    const { user, keys } = setup([broken, serverError]);
    await user.click(screen.getByTestId('submit-a'));
    await settle();
    await user.click(screen.getByTestId('submit-b'));
    await settle();
    expect(keys()).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ]);
  });
});
