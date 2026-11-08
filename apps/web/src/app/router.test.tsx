import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameRegistry } from '@/games/registry';
import {
  makeFakeGameEntry,
  makeSessionEnvelope,
  makeSessionSummary,
} from '@/platform/test/fakeGame';
import { mockFetch, renderWithProviders } from '@/shared/test';

describe('app routes (SWR-003 plan-frontend §2)', () => {
  it('/ → catalogue from the registry without network requests (Q-1); header, skip-link, <main id="main">', () => {
    const { fetch } = mockFetch({});
    renderWithProviders({ path: '/' });
    expect(screen.getByTestId('game-catalog')).toBeInTheDocument();
    expect(screen.getByTestId('game-card-star-wars-rebellion')).toHaveAttribute(
      'data-status',
      'available',
    );
    expect(screen.getByTestId('game-card-forbidden-stars')).toHaveAttribute(
      'data-status',
      'coming_soon',
    );
    expect(screen.getByTestId('app-header')).toBeInTheDocument();
    expect(screen.getByTestId('nav-catalog')).toHaveAttribute('href', '/');
    expect(screen.getByTestId('nav-settings')).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('link', { name: 'Перейти к содержимому' })).toHaveAttribute(
      'href',
      '#main',
    );
    expect(document.getElementById('main')?.tagName).toBe('MAIN');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('catalogue card → /games/star-wars-rebellion: lists its sessions with the game line; Continue → latest', async () => {
    const summary = makeSessionSummary({
      sessionId: 'r1',
      gameId: 'star-wars-rebellion',
      updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      // SWR-004 `RebellionSessionDetails` (flat public settings + progress, Q-20).
      details: {
        playerFaction: 'empire',
        opponentFaction: 'rebels',
        opponentType: 'ai',
        aiDifficulty: 'normal',
        ruleset: 'base',
        gameMode: 'digital',
        round: 2,
        phase: 'command',
        rulesEngine: 'mock-v1',
        winner: null,
        reputation: null,
      },
    });
    const { requests } = mockFetch({ 'GET /api/sessions': { status: 200, body: [summary] } });
    const { user, router } = renderWithProviders({ path: '/' });
    await user.click(screen.getByTestId('game-card-star-wars-rebellion'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/games/star-wars-rebellion'));
    const page = screen.getByTestId('game-page');
    expect(page).toHaveAttribute('data-game-id', 'star-wars-rebellion');
    expect(within(page).getByTestId('game-page-name')).toHaveTextContent('Star Wars: Rebellion');
    expect(screen.getByTestId('game-new-session')).toHaveAttribute(
      'href',
      '/games/star-wars-rebellion/new',
    );
    const row = await screen.findByTestId('recent-session-r1');
    // Rebellion's describeSession (not the generic platform line) + relative time.
    expect(row).toHaveTextContent(/Империя/);
    expect(row).not.toHaveTextContent(/^Партия · обновлена/);
    expect(screen.getByTestId('game-continue')).toHaveAttribute('href', '/sessions/r1');
    expect(requests.map((r) => r.url)).toEqual(['/api/sessions?gameId=star-wars-rebellion']);
  });

  it('coming_soon game page: actions disabled, no /api/sessions request (Q-16)', () => {
    const { fetch } = mockFetch({});
    renderWithProviders({ path: '/games/forbidden-stars' });
    expect(screen.getByTestId('game-page')).toHaveAttribute('data-status', 'coming_soon');
    expect(screen.getByTestId('game-coming-soon')).toBeInTheDocument();
    expect(screen.getByTestId('game-new-session')).toBeDisabled();
    expect(screen.getByTestId('game-continue')).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    '/games/unknown',
    '/games/new',
    '/games/2f1c6d1e-0000-4000-8000-000000000000',
    '/games/unknown/new',
  ])('%s → game-not-found with a link to the catalogue, no requests', async (path) => {
    const { fetch } = mockFetch({});
    const { user, router } = renderWithProviders({ path });
    expect(screen.getByTestId('game-not-found')).toBeInTheDocument();
    await user.click(
      within(screen.getByTestId('game-not-found')).getByRole('link', { name: 'В каталог' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('/games/forbidden-stars/new → coming soon in place (no form, no redirect, Q-17) + back to game (Q-19)', async () => {
    mockFetch({});
    const { user, router } = renderWithProviders({ path: '/games/forbidden-stars/new' });
    expect(screen.getByTestId('new-session-page')).toHaveAttribute(
      'data-game-id',
      'forbidden-stars',
    );
    expect(screen.getByTestId('game-coming-soon')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/games/forbidden-stars/new');
    await user.click(screen.getByTestId('new-session-back-to-game'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/games/forbidden-stars'));
  });

  it('/sessions/:id: 404 → session-not-found (no platform header); unknown gameId → session-unsupported', async () => {
    mockFetch({
      'GET /api/sessions/missing': {
        status: 404,
        body: { ok: false, error: { code: 'NOT_FOUND', messageKey: 'errors.sessionNotFound' } },
      },
      'GET /api/sessions/alien': {
        status: 200,
        body: makeSessionEnvelope({ sessionId: 'alien', gameId: 'no-such-game' }),
      },
    });
    const { router } = renderWithProviders({ path: '/sessions/missing' });
    expect(await screen.findByTestId('session-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('app-header')).not.toBeInTheDocument();
    await act(() => router.navigate('/sessions/alien'));
    expect(await screen.findByTestId('session-unsupported')).toBeInTheDocument();
  });

  it('/sessions/:id of Rebellion → SessionHost dispatches to the lazy Rebellion table (view passed unparsed)', async () => {
    // An incompatible view is enough to prove the dispatch without Konva: Rebellion's TableScreen parses `view`
    // itself and shows its own `table-invalid-view` (full table behaviour — games/rebellion/table/TableScreen.test).
    mockFetch({
      'GET /api/sessions/r1': {
        status: 200,
        body: makeSessionEnvelope({
          sessionId: 'r1',
          gameId: 'star-wars-rebellion',
          view: { nope: 1 },
        }),
      },
    });
    renderWithProviders({ path: '/sessions/r1' });
    expect(await screen.findByTestId('table-invalid-view')).toBeInTheDocument();
    const host = screen.getByTestId('session-host');
    expect(host).toHaveAttribute('data-session-id', 'r1');
    expect(host).toHaveAttribute('data-game-id', 'star-wars-rebellion');
    expect(screen.queryByTestId('session-unsupported')).not.toBeInTheDocument();
  });

  it('injected registry (TR-5): a fake game is reachable through the real routes', async () => {
    mockFetch({ 'GET /api/sessions': { status: 200, body: [] } });
    renderWithProviders({ path: '/', registry: [...gameRegistry, makeFakeGameEntry()] });
    expect(screen.getByTestId('game-card-test-game')).toHaveAttribute('href', '/games/test-game');
  });

  it('unknown path → NotFoundPage with link to the catalogue; /settings renders settings', async () => {
    mockFetch({});
    const { user, router } = renderWithProviders({ path: '/nope/here' });
    expect(screen.getByTestId('not-found')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'В каталог' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.getByTestId('game-catalog')).toBeInTheDocument();
    await act(() => router.navigate('/settings'));
    expect(screen.getByTestId('settings-language')).toBeInTheDocument();
  });

  it('D-A-8: focus moves to the page h1 after navigation', async () => {
    mockFetch({});
    const { user } = renderWithProviders({ path: '/' });
    await user.click(screen.getByTestId('nav-settings'));
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Настройки' });
    await waitFor(() => expect(h1).toHaveFocus());
  });
});
