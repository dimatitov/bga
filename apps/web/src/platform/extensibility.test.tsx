import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameRegistry } from '@/games/registry';
import { mockFetch, renderWithProviders } from '@/shared/test';
import { makeFakeGameEntry, makeSessionEnvelope } from './test/fakeGame';

/**
 * AC-5(б): a new game is added by a registry entry only. This test uses the real routes (`app/router.tsx`) and the
 * real platform screens; the fake game is injected through `renderWithProviders({ registry })` (TR-5). Nothing in
 * `app/` or `platform/` mentions it — that is the proof.
 */
const FAKE = makeFakeGameEntry({ id: 'fake-game', name: 'Fake Game' });
const FAKE_SOON = makeFakeGameEntry({ id: 'fake-soon', name: 'Fake Soon', status: 'coming_soon' });
const registry = [...gameRegistry, FAKE, FAKE_SOON];

describe('extensibility (AC-5(б), TC-EXT-07, TC-EXT-08)', () => {
  it('TC-EXT-07: card with placeholder cover → game page → /new → create → /sessions/:id → fake table', async () => {
    const { requests } = mockFetch({
      'GET /api/sessions': { status: 200, body: [] },
      'POST /api/sessions': {
        status: 201,
        body: makeSessionEnvelope({
          sessionId: 'f1',
          gameId: 'fake-game',
          view: { board: 'fake' },
        }),
      },
    });
    const { user, router } = renderWithProviders({ path: '/', registry });

    const cards = within(screen.getByTestId('game-catalog')).getAllByRole('link');
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual([
      'game-card-star-wars-rebellion',
      'game-card-fake-game',
      'game-card-forbidden-stars',
      'game-card-fake-soon',
    ]);
    const card = screen.getByTestId('game-card-fake-game');
    const cover = within(card).getByTestId('game-card-cover');
    expect(cover.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(cover).toHaveAttribute('alt', 'Обложка игры: абстрактная заглушка');
    expect(within(card).getByTestId('game-card-name')).toHaveTextContent('Fake Game');

    await user.click(card);
    await waitFor(() => expect(router.state.location.pathname).toBe('/games/fake-game'));
    expect(await screen.findByTestId('game-recent-empty')).toBeInTheDocument();
    await user.click(screen.getByTestId('game-new-session'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/games/fake-game/new'));
    await user.click(await screen.findByTestId('fake-setup-submit'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/f1'));
    const table = await screen.findByTestId('fake-table');
    expect(table).toHaveAttribute('data-session-id', 'f1');
    expect(screen.getByTestId('fake-table-view')).toHaveTextContent('{"board":"fake"}');
    expect(screen.getByTestId('session-host')).toHaveAttribute('data-game-id', 'fake-game');
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /api/sessions?gameId=fake-game',
      'POST /api/sessions',
    ]);
    // AC-12: the platform sends Idempotency-Key for any game (the game knows nothing about it).
    expect(requests[1]?.headers['idempotency-key']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(table).toHaveAttribute('data-session-status', 'prototype');
  });

  it('TC-EXT-07: a reload of /sessions/:id dispatches to the fake game by the server gameId', async () => {
    mockFetch({
      'GET /api/sessions/f1': {
        status: 200,
        body: makeSessionEnvelope({ sessionId: 'f1', gameId: 'fake-game', view: { v: 3 } }),
      },
    });
    renderWithProviders({ path: '/sessions/f1', registry });
    expect(await screen.findByTestId('fake-table')).toHaveAttribute('data-game-id', 'fake-game');
  });

  it('TC-EXT-08: coming_soon fake — card "Скоро", actions disabled, no form on /new, no requests', async () => {
    const { fetch } = mockFetch({});
    const { router } = renderWithProviders({ path: '/', registry });
    expect(
      within(screen.getByTestId('game-card-fake-soon')).getByTestId('game-card-status'),
    ).toHaveTextContent('Скоро');
    await act(() => router.navigate('/games/fake-soon'));
    expect(screen.getByTestId('game-page')).toHaveAttribute('data-game-id', 'fake-soon');
    expect(screen.getByTestId('game-new-session')).toBeDisabled();
    expect(screen.getByTestId('game-continue')).toBeDisabled();
    await act(() => router.navigate('/games/fake-soon/new'));
    expect(screen.getByTestId('game-coming-soon')).toBeInTheDocument();
    expect(screen.queryByTestId('fake-setup')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
