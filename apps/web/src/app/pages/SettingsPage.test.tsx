import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CatalogPage } from '@/platform/catalog/CatalogPage';
import { SETTINGS_STORAGE_KEY, useSettingsStore } from '@/shared/settings';
import { mockFetch, renderWithProviders } from '@/shared/test';
import { SettingsPage } from './SettingsPage';

const routes = [
  { path: '/', element: <CatalogPage /> },
  { path: '/settings', element: <SettingsPage /> },
];

function stored(): { state: { language: string; reduceMotion: boolean }; version: number } {
  return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null') as never;
}

describe('SettingsPage', () => {
  it('defaults: ru selected, <html lang="ru">', () => {
    mockFetch({});
    renderWithProviders({ routes, path: '/settings' });
    expect(screen.getByTestId('settings-language-ru')).toBeChecked();
    expect(screen.getByTestId('settings-language-en')).not.toBeChecked();
    expect(document.documentElement.lang).toBe('ru');
    expect(document.documentElement.dataset.reducedMotion).toBe('false');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Настройки');
  });

  it('TC-WEB-10: settings-language-en switches texts without reload, html lang and localStorage', async () => {
    mockFetch({});
    const { user, router } = renderWithProviders({ routes, path: '/settings' });

    await user.click(screen.getByTestId('settings-language-en'));

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings'),
    );
    expect(screen.getByTestId('settings-language-en')).toBeChecked();
    expect(document.documentElement.lang).toBe('en');
    expect(stored().state.language).toBe('en');
    expect(stored().version).toBe(1);
    await waitFor(() =>
      expect(screen.getByTestId('live-region')).toHaveTextContent('Interface language: English'),
    );

    // Other screens follow without reload.
    await act(() => router.navigate('/'));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Games');
    expect(screen.getAllByTestId('game-card-status')[0]).toHaveTextContent('Available');

    await act(() => router.navigate('/settings'));
    await user.click(screen.getByTestId('settings-language-ru'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Настройки'),
    );
    expect(document.documentElement.lang).toBe('ru');
    expect(stored().state.language).toBe('ru');
  });

  it('A-13: reduce motion toggles data-reduced-motion and persists', async () => {
    mockFetch({});
    const { user } = renderWithProviders({ routes, path: '/settings' });
    const toggle = screen.getByTestId('settings-reduce-motion');
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(document.documentElement.dataset.reducedMotion).toBe('true');
    expect(stored().state.reduceMotion).toBe(true);
    expect(screen.getByTestId('live-region')).toHaveTextContent('Уменьшение анимации включено');

    await user.click(toggle);
    expect(document.documentElement.dataset.reducedMotion).toBe('false');
    expect(stored().state.reduceMotion).toBe(false);
  });

  it('restores persisted settings (reload)', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ state: { language: 'en', reduceMotion: true }, version: 1 }),
    );
    await act(() => useSettingsStore.persist.rehydrate());
    mockFetch({});
    renderWithProviders({ routes, path: '/settings' });
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings'),
    );
    expect(screen.getByTestId('settings-language-en')).toBeChecked();
    expect(screen.getByTestId('settings-reduce-motion')).toBeChecked();
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dataset.reducedMotion).toBe('true');
  });

  it('D-ST-2: Back without history goes to the catalogue', async () => {
    mockFetch({});
    const { user, router } = renderWithProviders({ routes, path: '/settings' });
    await user.click(screen.getByTestId('settings-back'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});
