import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockFetch, renderWithProviders } from '@/shared/test';

describe('app routes', () => {
  it('unknown path → NotFoundPage with link to menu', async () => {
    mockFetch({ 'GET /api/games': { status: 200, body: [] } });
    const { user, router } = renderWithProviders({ path: '/nope/here' });
    expect(screen.getByTestId('not-found')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'В меню' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.getByTestId('menu-new-game')).toBeInTheDocument();
  });

  it('/, /games/new, /settings render their pages; skip-link and <main id="main"> exist', async () => {
    mockFetch({ 'GET /api/games': { status: 200, body: [] } });
    const { router } = renderWithProviders({ path: '/' });
    expect(screen.getByTestId('menu-new-game')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Перейти к содержимому' })).toHaveAttribute(
      'href',
      '#main',
    );
    expect(document.getElementById('main')?.tagName).toBe('MAIN');

    await act(() => router.navigate('/games/new'));
    expect(screen.getByTestId('setup-start')).toBeInTheDocument();
    await act(() => router.navigate('/settings'));
    expect(screen.getByTestId('settings-language')).toBeInTheDocument();
  });

  it('D-A-8: focus moves to the page h1 after navigation', async () => {
    mockFetch({ 'GET /api/games': { status: 200, body: [] } });
    const { user } = renderWithProviders({ path: '/' });
    await user.click(screen.getByTestId('menu-settings'));
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Настройки' });
    await waitFor(() => expect(h1).toHaveFocus());
  });
});
