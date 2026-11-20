import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { lazy, StrictMode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/AppProviders';
import { routes } from '@/app/router';
import type { TableScreenProps, WebGameEntry } from '@/games/registry';
import {
  createTestQueryClient,
  type MockReply,
  mockFetch,
  renderWithProviders,
} from '@/shared/test';
import { resetAutomationStore } from '../automation/automationStore';
import { commitCommandResult } from '../automation/commitCommandResult';
import { resetAutomationRuns } from '../automation/runAutomation';
import { useSessionAutomation } from '../automation/SessionAutomationContext';
import type { SessionEnvelope } from '../sessions/api';
import { sessionKeys } from '../sessions/queries';
import {
  makeAutomationSummary,
  makeCommandOk,
  makeFakeGameEntry,
  makeSessionEnvelope,
} from '../test/fakeGame';

const gameA = makeFakeGameEntry({ id: 'game-a' });
const gameB = makeFakeGameEntry({ id: 'game-b' });
const registry = [gameA, gameB];

describe('SessionHost (plan-frontend §2.1, TR-5)', () => {
  it('dispatches by the server gameId and passes { sessionId, gameId, status, view: unknown, backHref }', async () => {
    mockFetch({
      'GET /api/sessions/s1': {
        status: 200,
        body: makeSessionEnvelope({
          sessionId: 's1',
          gameId: 'game-b',
          status: 'active',
          view: { raw: [1, 2] },
        }),
      },
    });
    renderWithProviders({ path: '/sessions/s1', registry });
    const table = await screen.findByTestId('fake-table');
    expect(table).toHaveAttribute('data-session-id', 's1');
    expect(table).toHaveAttribute('data-game-id', 'game-b');
    expect(table).toHaveAttribute('data-session-status', 'active');
    expect(screen.getByTestId('fake-table-view')).toHaveTextContent('{"raw":[1,2]}');
    expect(screen.getByTestId('session-back-to-game')).toHaveAttribute('href', '/games/game-b');
    expect(screen.getByTestId('session-host')).toHaveAttribute('data-game-id', 'game-b');
  });

  it('pending → session-loading; setQueryData on detail re-renders the table with the new view', async () => {
    let release: () => void = () => undefined;
    mockFetch({
      'GET /api/sessions/s1': () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              status: 200,
              body: makeSessionEnvelope({ gameId: 'game-a', view: { v: 1 } }),
            });
        }),
    });
    const { queryClient } = renderWithProviders({ path: '/sessions/s1', registry });
    expect(screen.getByTestId('session-loading')).toHaveAttribute('aria-busy', 'true');
    act(() => release());
    expect(await screen.findByTestId('fake-table-view')).toHaveTextContent('{"v":1}');
    act(() => {
      queryClient.setQueryData(
        sessionKeys.detail('s1'),
        makeSessionEnvelope({ gameId: 'game-a', view: { v: 2 } }),
      );
    });
    await waitFor(() => expect(screen.getByTestId('fake-table-view')).toHaveTextContent('{"v":2}'));
  });

  it('422 GAME_UNAVAILABLE (Q-7) and a game without TableScreen → session-unsupported', async () => {
    mockFetch({
      'GET /api/sessions/old': {
        status: 422,
        body: {
          ok: false,
          error: { code: 'GAME_UNAVAILABLE', messageKey: 'errors.gameUnavailable' },
        },
      },
      'GET /api/sessions/s2': {
        status: 200,
        body: makeSessionEnvelope({ sessionId: 's2', gameId: 'soon' }),
      },
    });
    const soon = makeFakeGameEntry({ id: 'soon', status: 'coming_soon' });
    const { router } = renderWithProviders({
      path: '/sessions/old',
      registry: [...registry, soon],
    });
    expect(await screen.findByTestId('session-unsupported')).toBeInTheDocument();
    await act(() => router.navigate('/sessions/s2'));
    expect(await screen.findByTestId('session-unsupported')).toBeInTheDocument();
  });

  it('network error → session-error with Retry that refetches', async () => {
    let calls = 0;
    mockFetch({
      'GET /api/sessions/s1': () =>
        ++calls === 1
          ? 'network'
          : { status: 200, body: makeSessionEnvelope({ gameId: 'game-a' }) },
    });
    const { user } = renderWithProviders({ path: '/sessions/s1', registry });
    expect(await screen.findByTestId('session-error')).toHaveTextContent(/Сервер недоступен/);
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByTestId('fake-table')).toBeInTheDocument();
  });
});

describe('SessionHost: failed refetch with cached data (Analyst decision, SWR-002 behaviour)', () => {
  it('keeps the table, shows a non-blocking warning with Retry; Retry success removes it', async () => {
    let fail = false;
    mockFetch({
      'GET /api/sessions/s1': () =>
        fail
          ? 'network'
          : { status: 200, body: makeSessionEnvelope({ gameId: 'game-a', view: { v: 1 } }) },
    });
    const { queryClient, user } = renderWithProviders({ path: '/sessions/s1', registry });
    expect(await screen.findByTestId('fake-table-view')).toHaveTextContent('{"v":1}');

    fail = true;
    await act(() => queryClient.invalidateQueries({ queryKey: sessionKeys.detail('s1') }));
    const warning = await screen.findByTestId('session-refetch-warning');
    expect(warning).toHaveTextContent(/Сервер недоступен/);
    expect(screen.getByTestId('fake-table-view')).toHaveTextContent('{"v":1}');
    expect(screen.queryByTestId('session-error')).not.toBeInTheDocument();

    fail = false;
    await user.click(within(warning).getByRole('button', { name: 'Повторить' }));
    await waitFor(() =>
      expect(screen.queryByTestId('session-refetch-warning')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('fake-table')).toBeInTheDocument();
  });

  it('404 on refetch still wins over cached data → session-not-found', async () => {
    let gone = false;
    mockFetch({
      'GET /api/sessions/s1': () =>
        gone
          ? {
              status: 404,
              body: {
                ok: false,
                error: { code: 'NOT_FOUND', messageKey: 'errors.sessionNotFound' },
              },
            }
          : { status: 200, body: makeSessionEnvelope({ gameId: 'game-a' }) },
    });
    const { queryClient } = renderWithProviders({ path: '/sessions/s1', registry });
    await screen.findByTestId('fake-table');
    gone = true;
    await act(() => queryClient.invalidateQueries({ queryKey: sessionKeys.detail('s1') }));
    expect(await screen.findByTestId('session-not-found')).toBeInTheDocument();
  });
});

/** Fake table that shows what `useSessionAutomation()` gives a game. */
function ProbeTable({ view }: TableScreenProps) {
  const automation = useSessionAutomation();
  return (
    <div data-testid="probe-table">
      <pre data-testid="probe-view">{JSON.stringify(view)}</pre>
      <pre data-testid="probe-automation">
        {JSON.stringify(
          automation && {
            strategy: automation.strategy,
            pending: automation.pending,
            phase: automation.phase,
            lastRun: automation.lastRun && {
              source: automation.lastRun.source,
              steps: automation.lastRun.summary.steps,
              seq: automation.lastRun.seq,
            },
          },
        )}
      </pre>
    </div>
  );
}

const probeGame: WebGameEntry = {
  ...makeFakeGameEntry({ id: 'game-a' }),
  TableScreen: lazy(() => Promise.resolve({ default: ProbeTable })),
};
const RUN = 'POST /api/sessions/s1/automation/run';
const GET = 'GET /api/sessions/s1';

const aiPending = (view: unknown = { v: 1 }) =>
  makeSessionEnvelope({ gameId: 'game-a', view, automation: { pending: true, strategy: 'bot' } });
const runOk = (
  overrides: Parameters<typeof makeAutomationSummary>[0] = {},
  view: unknown = { v: 2 },
) => ({
  status: 200,
  body: makeCommandOk({
    view,
    events: [{ type: 'AI_MOVE' }],
    automation: makeAutomationSummary({
      steps: 3,
      strategy: 'bot',
      stopReason: 'humanTurn',
      ...overrides,
    }),
  }),
});

function runCount(requests: { method: string; path: string }[]) {
  return requests.filter((r) => r.method === 'POST' && r.path.endsWith('/automation/run')).length;
}

function probe(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('probe-automation').textContent ?? 'null') as Record<
    string,
    unknown
  >;
}

/** The app routes under React StrictMode (double effects), like `main.tsx`. */
function renderStrict(path: string, queryClient = createTestQueryClient()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  render(
    <StrictMode>
      <AppProviders queryClient={queryClient} registry={[probeGame]}>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
  return { queryClient, router, user };
}

describe('SessionHost: automation host (SWR-006 plan-frontend §3, §9 P-2..P-7)', () => {
  beforeEach(() => {
    resetAutomationStore();
    resetAutomationRuns();
  });

  it('P-2: strategy null + pending false → no run request; data-automation-* on session-host; context given to the game', async () => {
    const { requests } = mockFetch({
      [GET]: { status: 200, body: makeSessionEnvelope({ gameId: 'game-a' }) },
    });
    renderStrict('/sessions/s1');
    await screen.findByTestId('probe-table');
    const host = screen.getByTestId('session-host');
    expect(host).toHaveAttribute('data-automation-pending', 'false');
    expect(host).toHaveAttribute('data-automation-strategy', 'none');
    expect(host).toHaveAttribute('data-automation-state', 'idle');
    expect(probe()).toEqual({ strategy: null, pending: false, phase: 'idle', lastRun: null });
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(runCount(requests)).toBe(0);
    expect(screen.queryByTestId('session-automation-notice')).not.toBeInTheDocument();
  });

  it('P-3: pending on load → exactly one run under StrictMode; the response updates the cache and the game', async () => {
    let release: () => void = () => undefined;
    const { requests } = mockFetch({
      [GET]: { status: 200, body: aiPending() },
      [RUN]: () =>
        new Promise<MockReply>((resolve) => {
          release = () => resolve(runOk());
        }),
    });
    const { queryClient } = renderStrict('/sessions/s1');
    await screen.findByTestId('probe-table');
    await waitFor(() =>
      expect(screen.getByTestId('session-host')).toHaveAttribute(
        'data-automation-state',
        'running',
      ),
    );
    expect(screen.getByTestId('session-host')).toHaveAttribute('data-automation-strategy', 'bot');
    expect(screen.queryByTestId('session-automation-notice')).not.toBeInTheDocument();
    act(() => release());
    await waitFor(() =>
      expect(screen.getByTestId('session-host')).toHaveAttribute('data-automation-state', 'idle'),
    );
    expect(runCount(requests)).toBe(1);
    expect(requests.find((r) => r.path.endsWith('/automation/run'))?.body).toEqual({});
    expect(screen.getByTestId('probe-view')).toHaveTextContent('{"v":2}');
    expect(screen.getByTestId('session-host')).toHaveAttribute('data-automation-pending', 'false');
    expect(queryClient.getQueryData<SessionEnvelope>(sessionKeys.detail('s1'))?.automation).toEqual(
      {
        pending: false,
        strategy: 'bot',
      },
    );
    expect(probe()).toMatchObject({ lastRun: { source: 'run', steps: 3, seq: 1 } });
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(runCount(requests)).toBe(1);
  });

  it('P-3: a session seeded by create (no GET) with pending → exactly one run under StrictMode', async () => {
    const { requests } = mockFetch({ [RUN]: runOk() });
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(sessionKeys.detail('s1'), aiPending());
    renderStrict('/sessions/s1', queryClient);
    await waitFor(() => expect(screen.getByTestId('probe-view')).toHaveTextContent('{"v":2}'));
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([RUN]);
  });

  it('P-4: run 500 → notice[data-reason=error] with the reason; retry → second run; a double click → one request', async () => {
    let calls = 0;
    let release: () => void = () => undefined;
    const { requests } = mockFetch({
      [GET]: { status: 200, body: aiPending() },
      [RUN]: () => {
        calls += 1;
        if (calls === 1) {
          return {
            status: 500,
            body: { ok: false, error: { code: 'INTERNAL', messageKey: 'errors.internal' } },
          };
        }
        return new Promise<MockReply>((resolve) => {
          release = () => resolve(runOk());
        });
      },
    });
    renderStrict('/sessions/s1');
    const notice = await screen.findByTestId('session-automation-notice');
    expect(notice).toHaveAttribute('data-reason', 'error');
    expect(notice).toHaveAttribute('role', 'alert');
    expect(notice).toHaveTextContent(/^Ход AI не завершён: /);
    expect(screen.getByTestId('session-host')).toHaveAttribute('data-automation-state', 'error');
    expect(probe()).toMatchObject({ phase: 'error', pending: true });

    const retry = screen.getByTestId('session-automation-retry');
    expect(retry).toHaveTextContent('Продолжить ход AI');
    // Two clicks before React re-renders (the button is not yet `loading`): the in-flight guard keeps one request.
    act(() => {
      retry.click();
      retry.click();
    });
    await waitFor(() => expect(runCount(requests)).toBe(2));
    expect(screen.getByTestId('session-host')).toHaveAttribute('data-automation-state', 'running');
    expect(screen.getByTestId('session-automation-notice')).toBeInTheDocument();
    expect(runCount(requests)).toBe(2);
    act(() => release());
    await waitFor(() =>
      expect(screen.queryByTestId('session-automation-notice')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('session-host')).toHaveAttribute('data-automation-state', 'idle');
    expect(runCount(requests)).toBe(2);
  });

  it('P-4: network error → error notice with the network reason (cache untouched)', async () => {
    mockFetch({ [GET]: { status: 200, body: aiPending({ v: 1 }) }, [RUN]: 'network' });
    renderStrict('/sessions/s1');
    expect(await screen.findByTestId('session-automation-notice')).toHaveTextContent(
      /Сервер недоступен/,
    );
    expect(screen.getByTestId('probe-view')).toHaveTextContent('{"v":1}');
    expect(screen.getByTestId('session-host')).toHaveAttribute('data-automation-pending', 'true');
  });

  it('P-5: run answers pending:true → stalled, no automatic repeat; retry → one more run', async () => {
    const { requests } = mockFetch({
      [GET]: { status: 200, body: aiPending() },
      [RUN]: runOk({ pending: true, stopReason: 'stepLimit' }),
    });
    const { user } = renderStrict('/sessions/s1');
    const notice = await screen.findByTestId('session-automation-notice');
    expect(notice).toHaveAttribute('data-reason', 'stalled');
    expect(notice).toHaveTextContent('AI ещё не закончил ход.');
    expect(screen.getByTestId('session-host')).toHaveAttribute('data-automation-state', 'stalled');
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(runCount(requests)).toBe(1);
    await user.click(screen.getByTestId('session-automation-retry'));
    await waitFor(() => expect(runCount(requests)).toBe(2));
    expect(await screen.findByTestId('session-automation-notice')).toHaveAttribute(
      'data-reason',
      'stalled',
    );
    expect(probe()).toMatchObject({ lastRun: { source: 'run', steps: 3, seq: 2 } });
  });

  it('P-6: run 404 → session-not-found (detail refetched)', async () => {
    let gone = false;
    mockFetch({
      [GET]: () =>
        gone
          ? {
              status: 404,
              body: {
                ok: false,
                error: { code: 'NOT_FOUND', messageKey: 'errors.sessionNotFound' },
              },
            }
          : { status: 200, body: aiPending() },
      [RUN]: () => {
        gone = true;
        return {
          status: 404,
          body: { ok: false, error: { code: 'NOT_FOUND', messageKey: 'errors.sessionNotFound' } },
        };
      },
    });
    renderStrict('/sessions/s1');
    expect(await screen.findByTestId('session-not-found')).toBeInTheDocument();
    expect(screen.queryByTestId('session-automation-notice')).not.toBeInTheDocument();
  });

  it('P-6: run 422 GAME_UNAVAILABLE → session-unsupported', async () => {
    let gone = false;
    const unavailable = {
      status: 422,
      body: {
        ok: false,
        error: { code: 'GAME_UNAVAILABLE', messageKey: 'errors.gameUnavailable' },
      },
    };
    mockFetch({
      [GET]: () => (gone ? unavailable : { status: 200, body: aiPending() }),
      [RUN]: () => {
        gone = true;
        return unavailable;
      },
    });
    renderStrict('/sessions/s1');
    expect(await screen.findByTestId('session-unsupported')).toBeInTheDocument();
  });

  it('P-7: commitCommandResult(command, pending) → one run; steps 0 command clears lastRun; gameOver → detail refetched', async () => {
    let gets = 0;
    const { requests } = mockFetch({
      [GET]: () => {
        gets += 1;
        return {
          status: 200,
          body: makeSessionEnvelope({
            gameId: 'game-a',
            automation: { pending: false, strategy: 'bot' },
          }),
        };
      },
      [RUN]: runOk({ steps: 2 }, { v: 9 }),
    });
    const { queryClient } = renderStrict('/sessions/s1');
    await screen.findByTestId('probe-table');
    expect(runCount(requests)).toBe(0);
    const getsAfterLoad = gets;

    // A human command whose server-side AI loop stopped early (pending) → exactly one automatic run.
    act(() =>
      commitCommandResult(
        queryClient,
        's1',
        makeCommandOk({
          view: { v: 5 },
          automation: makeAutomationSummary({
            steps: 1,
            strategy: 'bot',
            pending: true,
            stopReason: 'stepLimit',
          }),
        }),
        'command',
      ),
    );
    await waitFor(() => expect(screen.getByTestId('probe-view')).toHaveTextContent('{"v":9}'));
    expect(runCount(requests)).toBe(1);
    expect(probe()).toMatchObject({
      phase: 'idle',
      pending: false,
      lastRun: { source: 'run', steps: 2 },
    });

    // Next human command without automated steps → the AI summary disappears (Q-FE-5), no run.
    act(() =>
      commitCommandResult(
        queryClient,
        's1',
        makeCommandOk({ view: { v: 10 }, automation: makeAutomationSummary({ strategy: 'bot' }) }),
        'command',
      ),
    );
    expect(probe()).toMatchObject({ lastRun: null, pending: false });
    expect(screen.getByTestId('probe-view')).toHaveTextContent('{"v":10}');

    // gameOver → detail refetched (platform status `completed`).
    act(() =>
      commitCommandResult(
        queryClient,
        's1',
        makeCommandOk({
          view: { v: 11 },
          automation: makeAutomationSummary({ steps: 1, strategy: 'bot', stopReason: 'gameOver' }),
        }),
        'command',
      ),
    );
    await waitFor(() => expect(gets).toBe(getsAfterLoad + 1));
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(runCount(requests)).toBe(1);
  });

  it('P-7: run with stopReason conflict → detail refetched (W-7, AM-FE-3)', async () => {
    let ran = false;
    let getsAfterRun = 0;
    const { requests } = mockFetch({
      [GET]: () => {
        if (ran) getsAfterRun += 1;
        return {
          status: 200,
          body: ran
            ? makeSessionEnvelope({
                gameId: 'game-a',
                view: { v: 7 },
                automation: { pending: false, strategy: 'bot' },
              })
            : aiPending(),
        };
      },
      [RUN]: () => {
        ran = true;
        return runOk({ steps: 1, pending: true, stopReason: 'conflict' }, { v: 6 });
      },
    });
    renderStrict('/sessions/s1');
    await waitFor(() => expect(screen.getByTestId('probe-view')).toHaveTextContent('{"v":7}'));
    expect(getsAfterRun).toBe(1);
    expect(runCount(requests)).toBe(1);
    expect(screen.getByTestId('session-host')).toHaveAttribute('data-automation-state', 'idle');
  });

  it('P-8: useSessionAutomation() outside SessionHost → null', () => {
    renderWithProviders({
      element: (
        <ProbeTable
          sessionId="x"
          gameId="g"
          status="active"
          view={null}
          definition={probeGame.definition}
          backHref="/"
        />
      ),
    });
    expect(screen.getByTestId('probe-automation')).toHaveTextContent('null');
  });
});
