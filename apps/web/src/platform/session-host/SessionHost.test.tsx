import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockFetch, renderWithProviders } from '@/shared/test';
import { sessionKeys } from '../sessions/queries';
import { makeFakeGameEntry, makeSessionEnvelope } from '../test/fakeGame';

const gameA = makeFakeGameEntry({ id: 'game-a' });
const gameB = makeFakeGameEntry({ id: 'game-b' });
const registry = [gameA, gameB];

describe('SessionHost (plan-frontend §2.1, TR-5)', () => {
  it('dispatches by the server gameId and passes { sessionId, gameId, status, view: unknown, backHref }', async () => {
    mockFetch({
      'GET /api/sessions/s1': {
        status: 200,
        body: makeSessionEnvelope({
          sessionId: 's1',
          gameId: 'game-b',
          status: 'active',
          view: { raw: [1, 2] },
        }),
      },
    });
    renderWithProviders({ path: '/sessions/s1', registry });
    const table = await screen.findByTestId('fake-table');
    expect(table).toHaveAttribute('data-session-id', 's1');
    expect(table).toHaveAttribute('data-game-id', 'game-b');
    expect(table).toHaveAttribute('data-session-status', 'active');
    expect(screen.getByTestId('fake-table-view')).toHaveTextContent('{"raw":[1,2]}');
    expect(screen.getByTestId('session-back-to-game')).toHaveAttribute('href', '/games/game-b');
    expect(screen.getByTestId('session-host')).toHaveAttribute('data-game-id', 'game-b');
  });

  it('pending → session-loading; setQueryData on detail re-renders the table with the new view', async () => {
    let release: () => void = () => undefined;
    mockFetch({
      'GET /api/sessions/s1': () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              status: 200,
              body: makeSessionEnvelope({ gameId: 'game-a', view: { v: 1 } }),
            });
        }),
    });
    const { queryClient } = renderWithProviders({ path: '/sessions/s1', registry });
    expect(screen.getByTestId('session-loading')).toHaveAttribute('aria-busy', 'true');
    act(() => release());
    expect(await screen.findByTestId('fake-table-view')).toHaveTextContent('{"v":1}');
    act(() => {
      queryClient.setQueryData(
        sessionKeys.detail('s1'),
        makeSessionEnvelope({ gameId: 'game-a', view: { v: 2 } }),
      );
    });
    await waitFor(() => expect(screen.getByTestId('fake-table-view')).toHaveTextContent('{"v":2}'));
  });

  it('422 GAME_UNAVAILABLE (Q-7) and a game without TableScreen → session-unsupported', async () => {
    mockFetch({
      'GET /api/sessions/old': {
        status: 422,
        body: {
          ok: false,
          error: { code: 'GAME_UNAVAILABLE', messageKey: 'errors.gameUnavailable' },
        },
      },
      'GET /api/sessions/s2': {
        status: 200,
        body: makeSessionEnvelope({ sessionId: 's2', gameId: 'soon' }),
      },
    });
    const soon = makeFakeGameEntry({ id: 'soon', status: 'coming_soon' });
    const { router } = renderWithProviders({
      path: '/sessions/old',
      registry: [...registry, soon],
    });
    expect(await screen.findByTestId('session-unsupported')).toBeInTheDocument();
    await act(() => router.navigate('/sessions/s2'));
    expect(await screen.findByTestId('session-unsupported')).toBeInTheDocument();
  });

  it('network error → session-error with Retry that refetches', async () => {
    let calls = 0;
    mockFetch({
      'GET /api/sessions/s1': () =>
        ++calls === 1
          ? 'network'
          : { status: 200, body: makeSessionEnvelope({ gameId: 'game-a' }) },
    });
    const { user } = renderWithProviders({ path: '/sessions/s1', registry });
    expect(await screen.findByTestId('session-error')).toHaveTextContent(/Сервер недоступен/);
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByTestId('fake-table')).toBeInTheDocument();
  });
});

describe('SessionHost: failed refetch with cached data (Analyst decision, SWR-002 behaviour)', () => {
  it('keeps the table, shows a non-blocking warning with Retry; Retry success removes it', async () => {
    let fail = false;
    mockFetch({
      'GET /api/sessions/s1': () =>
        fail
          ? 'network'
          : { status: 200, body: makeSessionEnvelope({ gameId: 'game-a', view: { v: 1 } }) },
    });
    const { queryClient, user } = renderWithProviders({ path: '/sessions/s1', registry });
    expect(await screen.findByTestId('fake-table-view')).toHaveTextContent('{"v":1}');

    fail = true;
    await act(() => queryClient.invalidateQueries({ queryKey: sessionKeys.detail('s1') }));
    const warning = await screen.findByTestId('session-refetch-warning');
    expect(warning).toHaveTextContent(/Сервер недоступен/);
    expect(screen.getByTestId('fake-table-view')).toHaveTextContent('{"v":1}');
    expect(screen.queryByTestId('session-error')).not.toBeInTheDocument();

    fail = false;
    await user.click(within(warning).getByRole('button', { name: 'Повторить' }));
    await waitFor(() =>
      expect(screen.queryByTestId('session-refetch-warning')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('fake-table')).toBeInTheDocument();
  });

  it('404 on refetch still wins over cached data → session-not-found', async () => {
    let gone = false;
    mockFetch({
      'GET /api/sessions/s1': () =>
        gone
          ? {
              status: 404,
              body: {
                ok: false,
                error: { code: 'NOT_FOUND', messageKey: 'errors.sessionNotFound' },
              },
            }
          : { status: 200, body: makeSessionEnvelope({ gameId: 'game-a' }) },
    });
    const { queryClient } = renderWithProviders({ path: '/sessions/s1', registry });
    await screen.findByTestId('fake-table');
    gone = true;
    await act(() => queryClient.invalidateQueries({ queryKey: sessionKeys.detail('s1') }));
    expect(await screen.findByTestId('session-not-found')).toBeInTheDocument();
  });
});
