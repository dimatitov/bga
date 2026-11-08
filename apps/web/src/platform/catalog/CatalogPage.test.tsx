import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameRegistry } from '@/games/registry';
import { i18n } from '@/shared/i18n';
import { mockFetch, renderWithProviders } from '@/shared/test';

const CYRILLIC = /[А-Яа-яЁё]/;

describe('CatalogPage (AC-1, ux §12.3)', () => {
  it('TC-CAT-01/05: one card per registry entry, registry order, no requests even when the API is down (Q-1)', () => {
    const { fetch } = mockFetch({ 'GET /api/sessions': 'network' });
    renderWithProviders({ path: '/' });
    const catalog = screen.getByTestId('game-catalog');
    const cards = within(catalog).getAllByRole('link');
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual([
      'game-card-star-wars-rebellion',
      'game-card-forbidden-stars',
    ]);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Игры');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('TC-CAT-02: Rebellion card anatomy', () => {
    mockFetch({});
    renderWithProviders({ path: '/' });
    const card = screen.getByTestId('game-card-star-wars-rebellion');
    expect(card).toHaveAttribute('data-status', 'available');
    expect(within(card).getByTestId('game-card-name')).toHaveTextContent('Star Wars: Rebellion');
    const cover = within(card).getByTestId('game-card-cover');
    expect(cover.tagName).toBe('IMG');
    const rebellionCover = gameRegistry.find(
      (e) => e.definition.id === 'star-wars-rebellion',
    )?.cover;
    expect(rebellionCover?.src).toMatch(/^data:image\/svg\+xml/);
    expect(cover).toHaveAttribute('src', rebellionCover?.src);
    expect(cover.getAttribute('alt')).toMatch(/^Абстрактная обложка/);
    expect(within(card).getByTestId('game-card-description')).toHaveTextContent(/AI-противника/);
    const status = within(card).getByTestId('game-card-status');
    expect(status).toHaveAttribute('data-status', 'available');
    expect(status).toHaveTextContent('Доступна');
    expect(within(card).getByTestId('game-card-players')).toHaveTextContent('2 игрока');
    expect(within(card).getByTestId('game-card-ai')).toHaveTextContent('AI-противник ✓');
  });

  it('TC-CAT-03: Forbidden Stars card — coming soon, 2–4 players, AI, cover with alt', () => {
    mockFetch({});
    renderWithProviders({ path: '/' });
    const card = screen.getByTestId('game-card-forbidden-stars');
    expect(card).toHaveAttribute('data-status', 'coming_soon');
    expect(within(card).getByTestId('game-card-status')).toHaveTextContent('Скоро');
    expect(within(card).getByTestId('game-card-players')).toHaveTextContent('2–4 игрока');
    expect(within(card).getByTestId('game-card-ai')).toHaveTextContent('AI-противник ✓');
    expect(within(card).getByTestId('game-card-cover').getAttribute('alt')).toMatch(/\S/);
  });

  it('TC-CAT-04: each card is a link named by the game; click opens the game page', async () => {
    mockFetch({ 'GET /api/sessions': { status: 200, body: [] } });
    const { user, router } = renderWithProviders({ path: '/' });
    const fs = screen.getByRole('link', { name: 'Forbidden Stars' });
    expect(fs).toHaveAttribute('href', '/games/forbidden-stars');
    expect(screen.getByRole('link', { name: 'Star Wars: Rebellion' })).toHaveAttribute(
      'href',
      '/games/star-wars-rebellion',
    );
    await user.click(fs);
    await waitFor(() => expect(router.state.location.pathname).toBe('/games/forbidden-stars'));
    expect(screen.getByTestId('game-page')).toHaveAttribute('data-game-id', 'forbidden-stars');
  });

  it('TC-CAT-06: header links; no SWR-002 menu testids', () => {
    mockFetch({});
    renderWithProviders({ path: '/' });
    expect(screen.getByTestId('nav-settings')).toHaveAttribute('href', '/settings');
    expect(screen.getByTestId('nav-catalog')).toHaveAttribute('href', '/');
    for (const id of ['menu-new-game', 'menu-continue', 'recent-games']) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
  });

  it('TC-CAT-08: English — statuses, players, AI and alt in English, no Cyrillic', async () => {
    mockFetch({});
    renderWithProviders({ path: '/' });
    await act(() => i18n.changeLanguage('en'));
    const catalog = screen.getByTestId('game-catalog');
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Games'),
    );
    expect(
      within(screen.getByTestId('game-card-star-wars-rebellion')).getByTestId('game-card-status'),
    ).toHaveTextContent('Available');
    expect(
      within(screen.getByTestId('game-card-forbidden-stars')).getByTestId('game-card-status'),
    ).toHaveTextContent('Coming soon');
    expect(
      within(screen.getByTestId('game-card-forbidden-stars')).getByTestId('game-card-players'),
    ).toHaveTextContent('2–4 players');
    expect(catalog.textContent).not.toMatch(CYRILLIC);
    for (const img of within(catalog).getAllByRole('img')) {
      expect(img.getAttribute('alt')).toMatch(/\S/);
      expect(img.getAttribute('alt')).not.toMatch(CYRILLIC);
    }
  });

  it('D-CAT-8: empty registry → catalog-empty', () => {
    mockFetch({});
    renderWithProviders({ path: '/', registry: [] });
    expect(screen.getByTestId('catalog-empty')).toHaveTextContent('Игры пока не добавлены.');
  });
});
