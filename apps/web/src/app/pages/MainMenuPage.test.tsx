import { screen, waitFor, within } from '@testing-library/react';
import { useParams } from 'react-router';
import { describe, expect, it } from 'vitest';
import { makeSummary, mockFetch, renderWithProviders } from '@/shared/test';
import { MainMenuPage } from './MainMenuPage';

function TableStub() {
  const { id } = useParams();
  return <div data-testid="table-stub">{id}</div>;
}

const routes = [
  { path: '/', element: <MainMenuPage /> },
  { path: '/games/:id', element: <TableStub /> },
];

describe('MainMenuPage', () => {
  it('TC-WEB-01: no games → Continue disabled, New game & Settings enabled, no recent list', async () => {
    mockFetch({ 'GET /api/games': { status: 200, body: [] } });
    renderWithProviders({ routes });

    const cont = screen.getByTestId('menu-continue');
    await waitFor(() => expect(screen.getByText('Нет сохранённых партий')).toBeInTheDocument());
    expect(cont).toBeDisabled();
    expect(screen.getByTestId('menu-new-game')).toBeEnabled();
    expect(screen.getByTestId('menu-new-game')).toHaveAttribute('href', '/games/new');
    expect(screen.getByTestId('menu-settings')).toHaveAttribute('href', '/settings');
    expect(screen.queryByTestId('recent-games')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Rebellion');
  });

  it('TC-WEB-02: one game → Continue navigates to /games/<id>', async () => {
    mockFetch({
      'GET /api/games': { status: 200, body: [makeSummary('g-1', '2026-11-08T10:00:00.000Z')] },
    });
    const { user, router } = renderWithProviders({ routes });

    const cont = screen.getByTestId('menu-continue');
    await waitFor(() => expect(cont).toBeEnabled());
    // Recent list is shown only with ≥ 2 games (D-M-3).
    expect(screen.queryByTestId('recent-games')).not.toBeInTheDocument();
    await user.click(cont);
    await waitFor(() => expect(router.state.location.pathname).toBe('/games/g-1'));
    expect(screen.getByTestId('table-stub')).toHaveTextContent('g-1');
  });

  it('TC-WEB-03: 7 games → Continue opens the newest; recent ≤ 5 by updatedAt desc; item click opens it', async () => {
    // Deliberately unsorted input; g7 is the newest.
    const games = [3, 1, 7, 5, 2, 6, 4].map((n) =>
      makeSummary(`g${n}`, `2026-11-0${n}T10:00:00.000Z`, { round: n }),
    );
    mockFetch({ 'GET /api/games': { status: 200, body: games } });
    const { user, router } = renderWithProviders({ routes });

    const list = await screen.findByTestId('recent-games');
    const items = within(list).getAllByRole('link');
    expect(items).toHaveLength(5);
    expect(items.map((el) => el.getAttribute('data-testid'))).toEqual([
      'recent-game-g7',
      'recent-game-g6',
      'recent-game-g5',
      'recent-game-g4',
      'recent-game-g3',
    ]);
    expect(screen.queryByTestId('recent-game-g2')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('recent-game-g3'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/games/g3'));

    await router.navigate('/');
    const cont = await screen.findByTestId('menu-continue');
    await waitFor(() => expect(cont).toBeEnabled());
    await user.click(cont);
    await waitFor(() => expect(router.state.location.pathname).toBe('/games/g7'));
  });

  it('D-M-4: list load failure → error with Retry (not "no games")', async () => {
    let calls = 0;
    mockFetch({
      'GET /api/games': () =>
        ++calls === 1
          ? 'network'
          : { status: 200, body: [makeSummary('g-1', '2026-11-08T10:00:00.000Z')] },
    });
    const { user } = renderWithProviders({ routes });

    const alert = await screen.findByTestId('menu-error');
    expect(alert).toHaveTextContent('Сервер недоступен');
    expect(screen.queryByText('Нет сохранённых партий')).not.toBeInTheDocument();
    expect(screen.getByTestId('menu-continue')).toBeDisabled();

    await user.click(within(alert).getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(screen.getByTestId('menu-continue')).toBeEnabled());
    expect(screen.queryByTestId('menu-error')).not.toBeInTheDocument();
  });
});
