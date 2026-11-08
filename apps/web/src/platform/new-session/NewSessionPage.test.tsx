import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockFetch, renderWithProviders } from '@/shared/test';
import { makeFakeGameEntry, makeSessionEnvelope } from '../test/fakeGame';

const registry = [makeFakeGameEntry()];

describe('NewSessionPage (plan-frontend §2.2)', () => {
  it('submit → POST { gameId, setup } → /sessions/:id with replace → table without a GET (cache seeded)', async () => {
    const { requests } = mockFetch({
      'POST /api/sessions': {
        status: 201,
        body: makeSessionEnvelope({ sessionId: 's1', view: { fresh: true } }),
      },
    });
    const { user, router } = renderWithProviders({ path: '/games/test-game/new', registry });
    expect(screen.getByTestId('new-session-back-to-game')).toHaveAttribute(
      'href',
      '/games/test-game',
    );
    const setup = await screen.findByTestId('fake-setup');
    expect(setup).toHaveAttribute('data-back-href', '/games/test-game');
    await user.click(screen.getByTestId('fake-setup-submit'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/s1'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(await screen.findByTestId('fake-table')).toHaveAttribute('data-session-id', 's1');
    expect(screen.getByTestId('fake-table-view')).toHaveTextContent('{"fresh":true}');
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /api/sessions']);
    expect(requests[0]?.body).toEqual({ gameId: 'test-game', setup: { answer: 42 } });
  });

  it('error → start.error reaches the setup screen, form stays; double click → one POST', async () => {
    let release: () => void = () => undefined;
    const { requests } = mockFetch({
      'POST /api/sessions': () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              status: 422,
              body: {
                ok: false,
                error: { code: 'GAME_UNAVAILABLE', messageKey: 'errors.gameUnavailable' },
              },
            });
        }),
    });
    const { user, router } = renderWithProviders({ path: '/games/test-game/new', registry });
    const submit = await screen.findByTestId('fake-setup-submit');
    await user.dblClick(submit);
    expect(requests).toHaveLength(1);
    act(() => release());
    expect(await screen.findByTestId('fake-setup-error')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/games/test-game/new');
    expect(requests).toHaveLength(1);
  });
});
