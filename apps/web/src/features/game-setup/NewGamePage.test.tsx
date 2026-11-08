import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameKeys } from '@/shared/api';
import { makeView, mockFetch, renderWithProviders } from '@/shared/test';
import { NewGamePage } from './NewGamePage';

const routes = [
  { path: '/', element: <div data-testid="menu-stub" /> },
  { path: '/games/new', element: <NewGamePage /> },
  { path: '/games/:id', element: <div data-testid="table-stub" /> },
];

function renderPage() {
  return renderWithProviders({ routes, path: '/games/new' });
}

describe('NewGamePage', () => {
  it('D-N-2: no side preselected → Start disabled; AI + normal by default', () => {
    mockFetch({});
    renderPage();
    expect(screen.getByTestId('setup-start')).toBeDisabled();
    expect(screen.getByTestId('setup-faction-empire')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('setup-faction-rebellion')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('setup-opponent-ai')).toBeChecked();
    expect(screen.getByTestId('setup-difficulty-normal')).toBeChecked();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Новая партия');
  });

  it('TC-WEB-04: human hides difficulty and POST has no difficulty', async () => {
    const { requests } = mockFetch({
      'POST /api/games': {
        status: 201,
        body: {
          gameId: 'g-h',
          view: makeView({
            id: 'g-h',
            setup: { humanFaction: 'rebellion', opponent: { kind: 'human' } },
          }),
        },
      },
    });
    const { user, router } = renderPage();

    await user.click(screen.getByTestId('setup-faction-rebellion'));
    await user.click(screen.getByTestId('setup-opponent-human'));
    await waitFor(() => expect(screen.queryByTestId('setup-difficulty')).not.toBeInTheDocument());

    await user.click(screen.getByTestId('setup-opponent-ai'));
    expect(await screen.findByTestId('setup-difficulty')).toBeInTheDocument();
    expect(screen.getByTestId('setup-difficulty-normal')).toBeChecked();
    await user.click(screen.getByTestId('setup-opponent-human'));
    await waitFor(() => expect(screen.queryByTestId('setup-difficulty')).not.toBeInTheDocument());

    await user.click(screen.getByTestId('setup-start'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/games/g-h'));
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    expect(requests[0]?.body).toEqual({ humanFaction: 'rebellion', opponent: { kind: 'human' } });
  });

  it('Scenario 1: AI + hard → POST body, view cached, navigate to /games/:id', async () => {
    const view = makeView({
      id: 'g-1',
      setup: { humanFaction: 'empire', opponent: { kind: 'ai', difficulty: 'hard' } },
    });
    const { requests } = mockFetch({
      'POST /api/games': { status: 201, body: { gameId: 'g-1', view } },
    });
    const { user, router, queryClient } = renderPage();

    await user.click(screen.getByTestId('setup-faction-empire'));
    expect(screen.getByTestId('setup-faction-empire')).toBeChecked();
    await user.click(screen.getByTestId('setup-difficulty-hard'));
    await user.click(screen.getByTestId('setup-start'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/games/g-1'));
    expect(requests[0]?.body).toEqual({
      humanFaction: 'empire',
      opponent: { kind: 'ai', difficulty: 'hard' },
    });
    expect(queryClient.getQueryData(gameKeys.view('g-1'))).toEqual(view);
  });

  it('keyboard: arrow keys move the faction choice (radiogroup pattern)', async () => {
    mockFetch({});
    const { user } = renderPage();
    screen.getByTestId('setup-faction-empire').focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('setup-faction-rebellion')).toBeChecked();
    expect(screen.getByTestId('setup-faction-rebellion')).toHaveFocus();
  });

  it.each([
    [
      '400 VALIDATION',
      {
        status: 400,
        body: { ok: false, error: { code: 'VALIDATION', messageKey: 'errors.validation' } },
      },
      'Некорректный запрос.',
    ],
    [
      '500 INTERNAL',
      {
        status: 500,
        body: { ok: false, error: { code: 'INTERNAL', messageKey: 'errors.internal' } },
      },
      'Внутренняя ошибка сервера',
    ],
    ['500 without body', { status: 500 }, 'Внутренняя ошибка сервера'],
    ['502 non-JSON proxy error', { status: 502, body: undefined }, 'Внутренняя ошибка сервера'],
    ['network failure', 'network' as const, 'Сервер недоступен'],
  ])(
    'TC-WEB-05: %s → setup-error, stays on page, button re-enabled',
    async (_name, reply, text) => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      mockFetch({
        'POST /api/games': async () => {
          await gate;
          return reply;
        },
      });
      const { user, router } = renderPage();

      await user.click(screen.getByTestId('setup-faction-empire'));
      await user.click(screen.getByTestId('setup-start'));
      // Loading state while the request is in flight (D-N-5).
      await waitFor(() => expect(screen.getByTestId('setup-start')).toBeDisabled());
      expect(document.querySelector('form')).toHaveAttribute('aria-busy', 'true');
      release();

      const error = await screen.findByTestId('setup-error');
      expect(error).toHaveTextContent(text);
      expect(router.state.location.pathname).toBe('/games/new');
      await waitFor(() => expect(screen.getByTestId('setup-start')).toBeEnabled());
      // The form is not reset.
      expect(screen.getByTestId('setup-faction-empire')).toBeChecked();
    },
  );
});
