import type { SessionSummary } from '@bga/platform';
import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameRegistry } from '@/games/registry';
import { mockFetch, renderWithProviders, type MockRequest } from '@/shared/test';
import { makeFakeGameEntry, makeSessionSummary } from '../test/fakeGame';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const describing = makeFakeGameEntry({
  id: 'test-game',
  describeSession: (s) => {
    if (typeof s.details.side !== 'string') return '';
    return `${s.details.side} · R${String(s.details.round)}`;
  },
});
const plain = makeFakeGameEntry({ id: 'plain-game' });
const parted = makeFakeGameEntry({
  id: 'parts-game',
  describeSession: (s) =>
    s.details.empty === true
      ? []
      : [
          { key: 'side', text: String(s.details.side) },
          { key: 'round', text: `R${String(s.details.round)}` },
        ],
});
const registry = [...gameRegistry, describing, plain, parted];

function sessions(n: number, gameId = 'test-game'): SessionSummary[] {
  return Array.from({ length: n }, (_, i) =>
    makeSessionSummary({
      sessionId: `s${n - i}`,
      gameId,
      updatedAt: minutesAgo(i * 10 + 5),
      details: { side: `side${n - i}`, round: n - i },
    }),
  );
}

const listPath = (r: MockRequest) => r.url;

describe('GamePage (AC-2, AC-4, ux §12.4)', () => {
  it('TC-GP-01: hero anatomy, enabled "New session" → /new, one request with its gameId', async () => {
    const { requests } = mockFetch({ 'GET /api/sessions': { status: 200, body: [] } });
    renderWithProviders({ path: '/games/test-game', registry });
    const page = screen.getByTestId('game-page');
    expect(page).toHaveAttribute('data-game-id', 'test-game');
    expect(page).toHaveAttribute('data-status', 'available');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Game');
    expect(screen.getByTestId('game-page-cover').getAttribute('alt')).toMatch(/\S/);
    expect(screen.getByTestId('game-page-description')).toHaveTextContent(
      'Фиктивная игра для тестов',
    );
    expect(screen.getByTestId('game-page-players')).toHaveTextContent('2 игрока');
    expect(screen.getByTestId('game-page-ai')).toHaveTextContent('Без AI');
    expect(screen.getByTestId('game-new-session')).toHaveAttribute('href', '/games/test-game/new');
    expect(screen.getByTestId('game-disclaimer')).toBeInTheDocument();
    expect(screen.getByTestId('game-back-to-catalog')).toHaveAttribute('href', '/');
    await screen.findByTestId('game-recent-empty');
    expect(requests.map(listPath)).toEqual(['/api/sessions?gameId=test-game']);
  });

  it('TC-GP-02: empty list → Continue disabled with hint, recent empty state', async () => {
    mockFetch({ 'GET /api/sessions': { status: 200, body: [] } });
    const { user, router } = renderWithProviders({ path: '/games/test-game', registry });
    expect(await screen.findByTestId('game-recent-empty')).toHaveTextContent('Пока нет партий');
    const cont = screen.getByTestId('game-continue');
    expect(cont).toBeDisabled();
    expect(screen.getByTestId('game-continue-hint')).toHaveTextContent('Нет сохранённых партий');
    await user.click(cont).catch(() => undefined);
    expect(router.state.location.pathname).toBe('/games/test-game');
    expect(screen.queryByTestId(/^recent-session-/)).not.toBeInTheDocument();
  });

  it('TC-GP-03/04/05 + Q-13/14: 7 sessions → 5 rows in server order; Continue → the first; lines via describeSession', async () => {
    mockFetch({ 'GET /api/sessions': { status: 200, body: sessions(7) } });
    const { user, router } = renderWithProviders({ path: '/games/test-game', registry });
    const recent = await screen.findByTestId('game-recent-sessions');
    // Rows are the links; part spans (`recent-session-<key>`) share the prefix and must not be counted.
    const rows = await within(recent).findAllByRole('link');
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(
      ['s7', 's6', 's5', 's4', 's3'].map((id) => `recent-session-${id}`),
    );
    expect(rows[0]).toHaveAttribute('href', '/sessions/s7');
    expect(rows[0]).toHaveTextContent(/^side7 · R7Прототип·5 мин\. назад$/);
    expect(within(rows[0]!).getByTestId('recent-session-date')).toHaveTextContent('5 мин. назад');
    const cont = screen.getByTestId('game-continue');
    expect(cont).toHaveAttribute('data-session-id', 's7');
    expect(screen.getByTestId('game-continue-hint')).toHaveTextContent('side7 · R7');
    await user.click(cont);
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/s7'));
  });

  it('D-GP-5: defensive sort by updatedAt; no describeSession / empty text → generic line', async () => {
    const body = [
      makeSessionSummary({ sessionId: 'old', gameId: 'plain-game', updatedAt: minutesAgo(120) }),
      makeSessionSummary({ sessionId: 'new', gameId: 'plain-game', updatedAt: minutesAgo(1) }),
    ];
    mockFetch({ 'GET /api/sessions': { status: 200, body } });
    renderWithProviders({ path: '/games/plain-game', registry });
    const row = await screen.findByTestId('recent-session-new');
    expect(screen.getByTestId('game-continue')).toHaveAttribute('data-session-id', 'new');
    expect(row).toHaveTextContent(/^ПартияПрототип·1 мин\. назад$/);
  });

  it('TC-GP-06 (Q-15): list error → inline error + Retry, Continue disabled, New session enabled', async () => {
    let calls = 0;
    mockFetch({
      'GET /api/sessions': () =>
        ++calls === 1 ? { status: 500, body: undefined } : { status: 200, body: sessions(1) },
    });
    const { user } = renderWithProviders({ path: '/games/test-game', registry });
    const error = await screen.findByTestId('game-sessions-error');
    expect(error).toHaveTextContent('Не удалось загрузить партии.');
    expect(screen.getByTestId('game-continue')).toBeDisabled();
    expect(screen.getByTestId('game-new-session')).toHaveAttribute('href', '/games/test-game/new');
    await user.click(within(error).getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByTestId('recent-session-s1')).toBeInTheDocument();
    expect(screen.getByTestId('game-continue')).toBeEnabled();
  });

  it('TC-GP-07 (Q-16, D-GP-7): coming_soon — notice, both actions disabled and described by it, no recent, no requests', () => {
    const { fetch } = mockFetch({});
    renderWithProviders({ path: '/games/forbidden-stars', registry });
    const notice = screen.getByTestId('game-coming-soon');
    for (const id of ['game-new-session', 'game-continue']) {
      const action = screen.getByTestId(id);
      expect(action).toBeDisabled();
      expect(action).toHaveAttribute('aria-describedby', notice.id);
    }
    expect(screen.getByTestId('game-page-players')).toHaveTextContent('2–4 игрока');
    expect(screen.queryByTestId('game-recent-sessions')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('TC-GP-08: unknown game id and old SWR-002 URL → game-not-found, no requests', () => {
    const { fetch } = mockFetch({});
    renderWithProviders({ path: '/games/2f1c6d1e-0000-4000-8000-000000000000', registry });
    expect(screen.getByTestId('game-not-found')).toBeInTheDocument();
    expect(within(screen.getByTestId('game-not-found')).getByRole('link')).toHaveAttribute(
      'href',
      '/',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('TC-GP-12: two games — each page asks for its own gameId; Continue → first item of its own list', async () => {
    const { requests } = mockFetch({
      'GET /api/sessions': (r) => {
        const gameId = new URL(r.url, 'http://x').searchParams.get('gameId') ?? '';
        return {
          status: 200,
          body: sessions(2, gameId).map((s) => ({ ...s, sessionId: `${gameId}-${s.sessionId}` })),
        };
      },
    });
    const { router } = renderWithProviders({ path: '/games/test-game', registry });
    await waitFor(() =>
      expect(screen.getByTestId('game-continue')).toHaveAttribute('href', '/sessions/test-game-s2'),
    );
    await act(() => router.navigate('/games/plain-game'));
    await waitFor(() =>
      expect(screen.getByTestId('game-continue')).toHaveAttribute(
        'href',
        '/sessions/plain-game-s2',
      ),
    );
    expect(requests.map(listPath)).toEqual([
      '/api/sessions?gameId=test-game',
      '/api/sessions?gameId=plain-game',
    ]);
  });

  it('AM-FE-9: describeSession parts → spans recent-session-<key> joined by « · »; [] → generic; status data', async () => {
    const body = [
      makeSessionSummary({
        sessionId: 'p2',
        gameId: 'parts-game',
        status: 'active',
        updatedAt: minutesAgo(5),
        details: { side: 'north', round: 3 },
      }),
      makeSessionSummary({
        sessionId: 'p1',
        gameId: 'parts-game',
        updatedAt: minutesAgo(30),
        details: { empty: true },
      }),
    ];
    mockFetch({ 'GET /api/sessions': { status: 200, body } });
    renderWithProviders({ path: '/games/parts-game', registry });
    const row = await screen.findByTestId('recent-session-p2');
    expect(row).toHaveTextContent(/^north · R3Идёт·5 мин\. назад$/);
    expect(row).toHaveAttribute('data-session-status', 'active');
    expect(within(row).getByTestId('recent-session-side')).toHaveTextContent('north');
    expect(within(row).getByTestId('recent-session-round')).toHaveTextContent('R3');
    expect(screen.getByTestId('game-continue-hint')).toHaveTextContent(
      'north · R3·Идёт·5 мин. назад',
    );
    const generic = screen.getByTestId('recent-session-p1');
    expect(generic).toHaveTextContent(/^ПартияПрототип·30 мин\. назад$/);
    expect(generic).toHaveAttribute('data-session-status', 'prototype');
  });
  it('TC-C-14 (AC-09, AC-13, Q-21): Rebellion rows — side, opponent (+difficulty only for AI), «Прототип», <time dateTime>; Continue → newest + status', async () => {
    const human = makeSessionSummary({
      sessionId: 'reb-human',
      gameId: 'star-wars-rebellion',
      status: 'prototype',
      updatedAt: minutesAgo(2),
      details: {
        playerFaction: 'rebels',
        opponentFaction: 'empire',
        opponentType: 'human',
        aiDifficulty: null,
        ruleset: 'base',
        gameMode: 'digital',
        round: 1,
        phase: 'assignment',
        rulesEngine: 'mock-v1',
        winner: null,
        reputation: null,
      },
    });
    const ai = makeSessionSummary({
      sessionId: 'emp-ai',
      gameId: 'star-wars-rebellion',
      status: 'prototype',
      updatedAt: minutesAgo(90),
      details: {
        playerFaction: 'empire',
        opponentFaction: 'rebels',
        opponentType: 'ai',
        aiDifficulty: 'hard',
        ruleset: 'base',
        gameMode: 'digital',
        round: 2,
        phase: 'command',
        rulesEngine: 'mock-v1',
        winner: null,
        reputation: null,
      },
    });
    mockFetch({ 'GET /api/sessions': { status: 200, body: [human, ai] } });
    const { user, router } = renderWithProviders({ path: '/games/star-wars-rebellion', registry });
    const recent = await screen.findByTestId('game-recent-sessions');
    const rows = await within(recent).findAllByRole('link');
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'recent-session-reb-human',
      'recent-session-emp-ai',
    ]);

    const [humanRow, aiRow] = rows as [HTMLElement, HTMLElement];
    expect(within(humanRow).getByTestId('recent-session-faction')).toHaveTextContent('Повстанцы');
    expect(within(humanRow).getByTestId('recent-session-opponent')).toHaveTextContent(
      /^против второго игрока$/,
    );
    expect(within(humanRow).getByTestId('recent-session-progress')).toHaveTextContent(
      'Р1 · Назначение',
    );
    expect(within(aiRow).getByTestId('recent-session-faction')).toHaveTextContent('Империя');
    expect(within(aiRow).getByTestId('recent-session-opponent')).toHaveTextContent(
      'против AI (Сложная)',
    );

    for (const [row, summary] of [
      [humanRow, human],
      [aiRow, ai],
    ] as const) {
      const status = within(row).getByTestId('recent-session-status');
      expect(status).toHaveAttribute('data-status', 'prototype');
      expect(status).toHaveTextContent('Прототип');
      const date = within(row).getByTestId('recent-session-date');
      expect(date.tagName).toBe('TIME');
      expect(date).toHaveAttribute('datetime', summary.updatedAt);
      expect(date.getAttribute('title')).toMatch(/\d{4}/);
      expect(date).not.toBeEmptyDOMElement();
    }
    // Ruleset / mode are not shown (OQ-4).
    expect(recent).not.toHaveTextContent(/Базовая|Цифровая/);

    const cont = screen.getByTestId('game-continue');
    expect(cont).toHaveAttribute('data-session-id', 'reb-human');
    const hint = screen.getByTestId('game-continue-hint');
    expect(hint).toHaveTextContent('Повстанцы · против второго игрока · Р1 · Назначение');
    expect(within(hint).getByTestId('game-continue-status')).toHaveAttribute(
      'data-status',
      'prototype',
    );
    expect(within(hint).getByTestId('game-continue-status')).toHaveTextContent('Прототип');
    expect(cont).toHaveAttribute('aria-describedby', hint.id);
    await user.click(cont);
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/reb-human'));
  });

  it('SWR-005 TC-C-13 (Q-31): «Продолжить» → newest NOT completed session; a completed one is listed as «Завершена» and opens', async () => {
    const body = [
      makeSessionSummary({
        sessionId: 'done',
        status: 'completed',
        updatedAt: minutesAgo(1),
        details: { side: 'sideD', round: 14 },
      }),
      makeSessionSummary({
        sessionId: 'running',
        status: 'prototype',
        updatedAt: minutesAgo(30),
        details: { side: 'sideR', round: 3 },
      }),
      makeSessionSummary({
        sessionId: 'older',
        status: 'prototype',
        updatedAt: minutesAgo(90),
        details: { side: 'sideO', round: 2 },
      }),
    ];
    mockFetch({ 'GET /api/sessions': { status: 200, body } });
    const { user, router } = renderWithProviders({ path: '/games/test-game', registry });
    const recent = await screen.findByTestId('game-recent-sessions');
    const rows = await within(recent).findAllByRole('link');
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'recent-session-done',
      'recent-session-running',
      'recent-session-older',
    ]);
    const doneStatus = within(rows[0]!).getByTestId('recent-session-status');
    expect(doneStatus).toHaveAttribute('data-status', 'completed');
    expect(doneStatus).toHaveTextContent('Завершена');

    const cont = screen.getByTestId('game-continue');
    expect(cont).toHaveAttribute('data-session-id', 'running');
    expect(cont).toHaveAttribute('href', '/sessions/running');
    expect(screen.getByTestId('game-continue-hint')).toHaveTextContent('sideR · R3');
    expect(screen.getByTestId('game-continue-status')).toHaveAttribute('data-status', 'prototype');

    // The finished session still opens from the list (final screen).
    await user.click(rows[0]!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/sessions/done'));
  });

  it('SWR-005 Q-31: only completed sessions → «Продолжить» disabled, no «no saved sessions» hint; rows still listed', async () => {
    const body = [
      makeSessionSummary({
        sessionId: 'done1',
        status: 'completed',
        updatedAt: minutesAgo(5),
        details: { side: 'a', round: 1 },
      }),
    ];
    mockFetch({ 'GET /api/sessions': { status: 200, body } });
    renderWithProviders({ path: '/games/test-game', registry });
    await screen.findByTestId('recent-session-done1');
    const cont = screen.getByTestId('game-continue');
    expect(cont).toBeDisabled();
    expect(cont).not.toHaveAttribute('data-session-id');
    expect(screen.queryByTestId('game-continue-hint')).not.toBeInTheDocument();
  });

  it('TC-C-15 (AC-10, D-GP-6): pending → loading skeleton, Continue disabled + busy, New session enabled', async () => {
    let release: () => void = () => undefined;
    mockFetch({
      'GET /api/sessions': () =>
        new Promise((resolve) => {
          release = () => resolve({ status: 200, body: [] });
        }),
    });
    renderWithProviders({ path: '/games/test-game', registry });
    const loading = await screen.findByTestId('game-recent-loading');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('game-continue')).toBeDisabled();
    expect(screen.queryByTestId('game-continue-hint')).not.toBeInTheDocument();
    expect(screen.getByTestId('game-new-session')).toHaveAttribute('href', '/games/test-game/new');
    act(() => release());
    expect(await screen.findByTestId('game-recent-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('game-recent-loading')).not.toBeInTheDocument();
  });
});
