import { REBELLION_GAME_ID, rebellionDefinition } from '@bga/game-rebellion/definition';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paths, sessionKeys, useCreateSession } from '@/platform';
import { i18n } from '@/shared/i18n';
import { mockFetch, type MockReply, renderWithProviders } from '@/shared/test';
import { makeRebellionSession, makeView } from '../test/fixtures';
import * as model from './model/toSetupInput';
import SetupScreen from './SetupScreen';

// Real implementation by default; single cases override `validateSetup` (client second line of defence, AC-05).
vi.mock('./model/toSetupInput', async (importOriginal) => {
  const actual = await importOriginal<typeof model>();
  return { ...actual, validateSetup: vi.fn(actual.validateSetup) };
});

const NEW_PATH = paths.newSession(REBELLION_GAME_ID);

/** What NewSessionPage does for a game: `useCreateSession(gameId)` → `SetupScreen` props. */
function Harness() {
  const start = useCreateSession(REBELLION_GAME_ID);
  return (
    <SetupScreen
      gameId={REBELLION_GAME_ID}
      definition={rebellionDefinition}
      start={start}
      backHref={paths.game(REBELLION_GAME_ID)}
    />
  );
}

const routes = [
  { path: '/games/:gameId', element: <div data-testid="game-page-stub" /> },
  { path: '/games/:gameId/new', element: <Harness /> },
  { path: '/sessions/:sessionId', element: <div data-testid="table-stub" /> },
];

function renderPage() {
  return renderWithProviders({ routes, path: NEW_PATH });
}

/** 201 of `POST /api/sessions`: envelope with `status`/`settings` (SWR-004), settings = the view's settings. */
const created = (sessionId: string, view = makeView({ id: sessionId })) => ({
  status: 201,
  body: makeRebellionSession(view, { settings: view.settings }),
});

const checked = (testId: string) =>
  expect(screen.getByTestId(testId)).toHaveAttribute('aria-checked', 'true');
const unchecked = (testId: string) =>
  expect(screen.getByTestId(testId)).toHaveAttribute('aria-checked', 'false');

/** Gate to hold a mocked response while the UI is pending. */
function deferred() {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  return { gate, release };
}

afterEach(() => {
  vi.mocked(model.validateSetup).mockClear();
});

describe('Rebellion SetupScreen (SWR-004 §2)', () => {
  it('AC-02 (TC-C-01/02): PO defaults — Rebels, AI, Normal, Base, Digital; caption; prototype note; Start enabled', () => {
    mockFetch({});
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Новая партия');
    const group = screen.getByTestId('setup-faction-group');
    expect(group).toHaveAttribute('role', 'radiogroup');
    expect(group).toHaveAccessibleName('1. Ваша сторона');

    const rebels = screen.getByTestId('setup-faction-rebels');
    expect(rebels).toHaveAttribute('role', 'radio');
    checked('setup-faction-rebels');
    expect(rebels).toHaveAttribute('data-selected', 'true');
    expect(rebels).toHaveTextContent('Повстанцы');
    expect(rebels).toHaveTextContent('Прячут базу, тянут время');
    expect(rebels).toHaveTextContent('Выбрано');
    unchecked('setup-faction-empire');
    expect(screen.getByTestId('setup-faction-empire')).not.toHaveAttribute('data-selected');
    expect(screen.getByTestId('setup-faction-empire')).not.toHaveTextContent('Выбрано');
    // cards: Rebels first (D-SW4-3), each with a local emblem image
    const cards = within(group).getAllByRole('radio');
    expect(cards.map((c) => c.getAttribute('data-value'))).toEqual(['rebels', 'empire']);
    for (const card of cards) {
      expect(card.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    }

    checked('setup-opponent-ai');
    checked('setup-difficulty-normal');
    checked('setup-ruleset-base');
    checked('setup-mode-digital');
    const caption = screen.getByTestId('setup-opponent-caption');
    expect(caption).toHaveTextContent('AI играет за Империю');
    expect(caption).toHaveAttribute('data-opponent-faction', 'empire');
    expect(caption).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByTestId('setup-prototype-note')).toHaveTextContent(
      'Прототип: тестовая расстановка, не правила оригинальной игры',
    );
    expect(screen.queryByTestId('setup-mock-badge')).not.toBeInTheDocument();
    expect(screen.getByTestId('setup-start')).toBeEnabled();
    expect(screen.getByTestId('setup-start')).toHaveTextContent('Начать игру');
    expect(screen.getByTestId('setup-form')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByTestId('setup-error')).not.toBeInTheDocument();
    for (const id of ['setup-opponent', 'setup-difficulty', 'setup-ruleset', 'setup-mode']) {
      expect(screen.getByTestId(id)).toHaveRole('radiogroup');
      expect(screen.getByTestId(id)).toHaveAccessibleName();
    }
  });

  it('AC-02 / Q-19: defaults again on every mount (change → leave → come back)', async () => {
    mockFetch({});
    const { user, router } = renderPage();
    await user.click(screen.getByTestId('setup-faction-empire'));
    await user.click(screen.getByTestId('setup-difficulty-hard'));
    await user.click(screen.getByTestId('setup-opponent-human'));
    await user.click(screen.getByTestId('setup-cancel'));
    await waitFor(() => expect(screen.getByTestId('game-page-stub')).toBeInTheDocument());

    await router.navigate(NEW_PATH);
    await screen.findByTestId('setup-faction-rebels');
    checked('setup-faction-rebels');
    checked('setup-opponent-ai');
    checked('setup-difficulty-normal');
    expect(screen.getByTestId('setup-opponent-caption')).toHaveTextContent('AI играет за Империю');
  });

  it('AC-03 (TC-C-03/04): Empire ↔ Rebels flips the caption for AI and for a second player; one card checked', async () => {
    mockFetch({});
    const { user } = renderPage();
    const caption = () => screen.getByTestId('setup-opponent-caption');

    await user.click(screen.getByTestId('setup-faction-empire'));
    checked('setup-faction-empire');
    unchecked('setup-faction-rebels');
    expect(screen.getByTestId('setup-faction-empire')).toHaveTextContent('Выбрано');
    expect(caption()).toHaveTextContent('AI играет за Повстанцев');
    expect(caption()).toHaveAttribute('data-opponent-faction', 'rebels');

    await user.click(screen.getByTestId('setup-faction-rebels'));
    expect(caption()).toHaveTextContent('AI играет за Империю');

    await user.click(screen.getByTestId('setup-opponent-human'));
    expect(caption()).toHaveTextContent('Второй игрок играет за Империю');
    await user.click(screen.getByTestId('setup-faction-empire'));
    expect(caption()).toHaveTextContent('Второй игрок играет за Повстанцев');
    expect(caption()).toHaveAttribute('data-opponent-faction', 'rebels');
    expect(
      within(screen.getByTestId('setup-faction-group')).getAllByRole('radio', { checked: true }),
    ).toHaveLength(1);
  });

  it('AC-04 (TC-C-05): human hides difficulty, back to AI restores the last one (Q-19); POST without difficulty', async () => {
    const { requests } = mockFetch({
      'POST /api/sessions': created(
        'g-h',
        makeView({
          id: 'g-h',
          viewer: 'rebels',
          activeSide: 'rebels',
          settings: {
            playerFaction: 'rebels',
            opponentFaction: 'empire',
            opponentType: 'human',
            aiDifficulty: null,
            ruleset: 'base',
            gameMode: 'digital',
          },
        }),
      ),
    });
    const { user, router } = renderPage();

    await user.click(screen.getByTestId('setup-difficulty-hard'));
    await user.click(screen.getByTestId('setup-opponent-human'));
    await waitFor(() => expect(screen.queryByTestId('setup-difficulty')).not.toBeInTheDocument());
    expect(screen.queryByRole('radiogroup', { name: '3. Сложность AI' })).toBeNull();

    await user.click(screen.getByTestId('setup-opponent-ai'));
    expect(await screen.findByTestId('setup-difficulty')).toBeInTheDocument();
    checked('setup-difficulty-hard');
    await user.click(screen.getByTestId('setup-opponent-human'));
    await waitFor(() => expect(screen.queryByTestId('setup-difficulty')).not.toBeInTheDocument());

    await user.click(screen.getByTestId('setup-start'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/g-h'));
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    expect(requests[0]?.body).toEqual({
      gameId: REBELLION_GAME_ID,
      setup: {
        playerFaction: 'rebels',
        opponentType: 'human',
        ruleset: 'base',
        gameMode: 'digital',
      },
    });
  });

  it('AC-07 (TC-C-11): Empire + AI hard → POST { gameId, setup } with Idempotency-Key, cached, replace to /sessions/:id', async () => {
    const settings = { ...makeView().settings, aiDifficulty: 'hard' as const };
    const view = makeView({ id: 'g-1', settings });
    const { requests } = mockFetch({ 'POST /api/sessions': created('g-1', view) });
    const { user, router, queryClient } = renderPage();

    await user.click(screen.getByTestId('setup-faction-empire'));
    await user.click(screen.getByTestId('setup-difficulty-hard'));
    await user.click(screen.getByTestId('setup-start'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/g-1'));
    expect(router.state.historyAction).toBe('REPLACE');
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(requests[0]?.body).toEqual({
      gameId: REBELLION_GAME_ID,
      setup: {
        playerFaction: 'empire',
        opponentType: 'ai',
        aiDifficulty: 'hard',
        ruleset: 'base',
        gameMode: 'digital',
      },
    });
    expect(queryClient.getQueryData(sessionKeys.detail('g-1'))).toEqual({
      sessionId: 'g-1',
      gameId: REBELLION_GAME_ID,
      status: 'prototype',
      settings,
      view,
      automation: { pending: false, strategy: null },
    });
  });

  it('AC-05 client (TC-C-06, TC-SET-05): RotE is shown «скоро», aria-disabled, described, not selectable by click or arrows', async () => {
    mockFetch({});
    const { user } = renderPage();
    const id = 'setup-ruleset-rise-of-the-empire';
    const opt = screen.getByTestId(id);
    expect(opt).toHaveAttribute('aria-disabled', 'true');
    expect(opt).toHaveTextContent('скоро');
    expect(opt).toHaveAccessibleDescription('Дополнение пока не поддерживается.');
    expect(opt.tabIndex).toBe(-1);
    expect(opt).toHaveTextContent('Rise of the Empire');
    await user.click(opt);
    unchecked(id);
    checked('setup-ruleset-base');

    screen.getByTestId('setup-ruleset-base').focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('setup-ruleset-base')).toHaveFocus();
    checked('setup-ruleset-base');
    // Digital stays the default mode (SWR-010 TC-SET-05).
    checked('setup-mode-digital');
  });

  it.each([
    ['rebels', 'setup-faction-rebels'],
    ['empire', 'setup-faction-empire'],
  ] as const)(
    'AC-22 (TC-SET-01 client): %s vs AI — physical_companion available, hint shown, POST with gameMode physical_companion',
    async (playerFaction, factionId) => {
      const { requests } = mockFetch({ 'POST /api/sessions': created('g-p') });
      const { user, router } = renderPage();
      await user.click(screen.getByTestId(factionId));

      const physical = screen.getByTestId('setup-mode-physical_companion');
      expect(physical).not.toHaveAttribute('aria-disabled', 'true');
      expect(physical).not.toHaveTextContent('скоро');
      expect(physical).not.toHaveTextContent('только против AI');
      expect(physical).toHaveTextContent('С физическими компонентами');
      expect(physical).toHaveTextContent(
        'Приложение ведёт колоды и подсказывает, что повторить на столе.',
      );
      await user.click(physical);
      checked('setup-mode-physical_companion');
      unchecked('setup-mode-digital');
      // Arrow keys move between the two available modes.
      await user.keyboard('{ArrowLeft}');
      checked('setup-mode-digital');
      await user.keyboard('{ArrowRight}');
      checked('setup-mode-physical_companion');

      await user.click(screen.getByTestId('setup-start'));
      await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/g-p'));
      expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
      expect(requests[0]?.body).toEqual({
        gameId: REBELLION_GAME_ID,
        setup: {
          playerFaction,
          opponentType: 'ai',
          aiDifficulty: 'normal',
          ruleset: 'base',
          gameMode: 'physical_companion',
        },
      });
    },
  );

  it('AC-22 (TC-SET-02 client): second player — physical «только против AI», aria-disabled, described; a chosen physical resets to digital with an announcement', async () => {
    const { requests } = mockFetch({});
    const { user } = renderPage();
    const id = 'setup-mode-physical_companion';
    const announce = screen.getByTestId('setup-mode-announce');
    expect(announce).toHaveAttribute('role', 'status');
    expect(announce).toHaveAttribute('aria-live', 'polite');
    expect(announce).toHaveTextContent('');

    await user.click(screen.getByTestId(id));
    checked(id);
    await user.click(screen.getByTestId('setup-opponent-human'));

    const opt = screen.getByTestId(id);
    expect(opt).toHaveAttribute('aria-disabled', 'true');
    expect(opt).toHaveTextContent('только против AI');
    expect(opt).not.toHaveTextContent('скоро');
    expect(opt).not.toHaveTextContent('Приложение ведёт колоды');
    expect(opt).toHaveAccessibleDescription(
      'Режим с физическими компонентами доступен только против AI.',
    );
    expect(opt.tabIndex).toBe(-1);
    unchecked(id);
    checked('setup-mode-digital');
    expect(announce).toHaveTextContent(
      'Режим с физическими компонентами доступен только против AI — выбран цифровой режим.',
    );
    // No form error for the reset.
    expect(screen.queryByTestId('setup-error')).not.toBeInTheDocument();

    await user.click(opt);
    unchecked(id);
    screen.getByTestId('setup-mode-digital').focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('setup-mode-digital')).toHaveFocus();
    checked('setup-mode-digital');

    // Any next change clears the announcement; back to AI → available again (digital stays chosen).
    await user.click(screen.getByTestId('setup-opponent-ai'));
    expect(announce).toHaveTextContent('');
    expect(screen.getByTestId(id)).not.toHaveAttribute('aria-disabled', 'true');
    checked('setup-mode-digital');
    expect(requests).toHaveLength(0);
  });

  it('AC-22: EN texts of the physical mode (hint, «AI only» badge and description)', async () => {
    mockFetch({});
    const { user } = renderPage();
    await act(() => i18n.changeLanguage('en'));
    const id = 'setup-mode-physical_companion';
    expect(await screen.findByText('With physical components')).toBeInTheDocument();
    expect(screen.getByTestId(id)).toHaveTextContent(
      'The app tracks the decks and tells you what to repeat on the table.',
    );
    await user.click(screen.getByTestId(id));
    await user.click(screen.getByTestId('setup-opponent-human'));
    expect(screen.getByTestId(id)).toHaveTextContent('AI only');
    expect(screen.getByTestId(id)).toHaveAccessibleDescription(
      'The physical-components mode is available only against AI.',
    );
    expect(screen.getByTestId('setup-mode-announce')).toHaveTextContent(
      'The physical-components mode is available only against AI — digital mode selected.',
    );
  });

  it('AC-05 client (TC-C-06): validateSetup rejects → alert with the game text, no POST, focus stays on Start', async () => {
    const { requests } = mockFetch({});
    const { user } = renderPage();
    vi.mocked(model.validateSetup).mockReturnValueOnce({
      ok: false,
      reason: 'rulesetUnavailable',
    });
    await user.click(screen.getByTestId('setup-start'));
    const alert = await screen.findByTestId('setup-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent('Набор правил Rise of the Empire пока недоступен');
    expect(requests).toHaveLength(0);
    expect(screen.getByTestId('setup-start')).toHaveFocus();

    vi.mocked(model.validateSetup).mockReturnValueOnce({ ok: false, reason: 'invalid' });
    await user.click(screen.getByTestId('setup-start'));
    expect(screen.getByTestId('setup-error')).toHaveTextContent('Проверьте настройки партии.');

    // D-SW4-12: any change hides the previous error
    await user.click(screen.getByTestId('setup-faction-empire'));
    expect(screen.queryByTestId('setup-error')).not.toBeInTheDocument();
  });

  it('AC-10 (TC-C-08): pending — busy form and button, «Создание партии…», groups/cancel disabled; double click + Enter → 1 POST', async () => {
    const { gate, release } = deferred();
    const { requests } = mockFetch({
      'POST /api/sessions': async () => {
        await gate;
        return created('g-p');
      },
    });
    const { user, router } = renderPage();

    const start = screen.getByTestId('setup-start');
    await user.dblClick(start);
    await waitFor(() => expect(start).toBeDisabled());
    fireEvent.click(start); // disabled button: pointer-events none for user-event
    fireEvent.submit(screen.getByTestId('setup-form'));
    await user.keyboard('{Enter}');
    expect(start).toHaveAttribute('aria-busy', 'true');
    expect(start).toHaveTextContent('Создание партии…');
    expect(screen.getByTestId('setup-form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('setup-faction-empire')).toBeDisabled();
    expect(screen.getByTestId('setup-ruleset-base')).toBeDisabled();
    expect(screen.getByTestId('setup-cancel')).toHaveAttribute('aria-disabled', 'true');

    release();
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/g-p'));
    expect(requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });

  it.each<[string, MockReply, string]>([
    [
      '400 VALIDATION',
      {
        status: 400,
        body: { ok: false, error: { code: 'VALIDATION', messageKey: 'errors.validation' } },
      },
      'Некорректный запрос.',
    ],
    [
      '422 SETUP_UNSUPPORTED',
      {
        status: 422,
        body: {
          ok: false,
          error: {
            code: 'SETUP_UNSUPPORTED',
            messageKey: 'errors.rulesetUnavailable',
            details: { unsupported: ['ruleset'] },
          },
        },
      },
      'Набор правил Rise of the Empire пока недоступен. Выберите «Базовая игра».',
    ],
    [
      '409 IDEMPOTENCY_KEY_REUSED',
      {
        status: 409,
        body: {
          ok: false,
          error: { code: 'IDEMPOTENCY_KEY_REUSED', messageKey: 'errors.idempotencyKeyReused' },
        },
      },
      'Не удалось создать партию. Нажмите «Начать игру» ещё раз.',
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
    ['network failure', 'network', 'Сервер недоступен'],
  ])(
    'AC-07 (TC-C-12/13): %s → alert, values kept, not busy, focus on Start; retry → 201 → table',
    async (_name, reply, text) => {
      const { gate, release } = deferred();
      let failNext = true;
      const { requests } = mockFetch({
        'POST /api/sessions': async () => {
          await gate;
          if (failNext) {
            failNext = false;
            return reply;
          }
          return created('g-r');
        },
      });
      const { user, router } = renderPage();

      await user.click(screen.getByTestId('setup-faction-empire'));
      await user.click(screen.getByTestId('setup-opponent-human'));
      await user.click(screen.getByTestId('setup-start'));
      await waitFor(() => expect(screen.getByTestId('setup-start')).toBeDisabled());
      release();

      const error = await screen.findByTestId('setup-error');
      expect(error).toHaveAttribute('role', 'alert');
      expect(error).toHaveTextContent(text);
      expect(error.textContent).not.toMatch(/errors\.|rebellion\.|\b(400|409|422|500|502)\b/);
      expect(router.state.location.pathname).toBe(NEW_PATH);
      const start = screen.getByTestId('setup-start');
      await waitFor(() => expect(start).toBeEnabled());
      expect(start).toHaveAttribute('aria-busy', 'false');
      expect(screen.getByTestId('setup-form')).toHaveAttribute('aria-busy', 'false');
      await waitFor(() => expect(start).toHaveFocus());
      checked('setup-faction-empire');
      checked('setup-opponent-human');

      await user.click(start);
      await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/g-r'));
      expect(requests.filter((r) => r.method === 'POST')).toHaveLength(2);
      expect(requests[1]?.body).toEqual(requests[0]?.body);
    },
  );

  it('«Отмена» (setup-cancel) leads to backHref (the game page)', async () => {
    mockFetch({});
    const { user, router } = renderPage();
    const cancel = screen.getByTestId('setup-cancel');
    expect(cancel).toHaveTextContent('Отмена');
    await user.click(cancel);
    await waitFor(() => expect(router.state.location.pathname).toBe(paths.game(REBELLION_GAME_ID)));
    expect(screen.getByTestId('game-page-stub')).toBeInTheDocument();
  });

  it('real routes: lazy form under «← К игре»; Tab order back link → faction group → … → Start → Cancel', async () => {
    mockFetch({});
    const { user } = renderWithProviders({ path: NEW_PATH });
    expect(await screen.findByTestId('setup-start')).toBeEnabled();
    expect(screen.getByTestId('new-session-page')).toHaveAttribute(
      'data-game-id',
      REBELLION_GAME_ID,
    );
    const back = screen.getByTestId('new-session-back-to-game');
    expect(back).toHaveAttribute('href', paths.game(REBELLION_GAME_ID));

    back.focus();
    const order: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      await user.tab();
      order.push(document.activeElement?.getAttribute('data-testid') ?? null);
    }
    expect(order).toEqual([
      'setup-faction-rebels',
      'setup-opponent-ai',
      'setup-difficulty-normal',
      'setup-ruleset-base',
      'setup-mode-digital',
      'setup-start',
      'setup-cancel',
    ]);
  });
});
