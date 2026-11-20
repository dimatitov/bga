import { act, screen, waitFor, within } from '@testing-library/react';
import { type AutomationRunSummary } from '@bga/platform';
import { beforeEach, describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { type AutomationLastRun, type SessionAutomationState } from '@/platform';
import { i18n } from '@/shared/i18n';
import { useSettingsStore } from '@/shared/settings';
import { type MockHandler, type MockRequest, mockFetch, renderWithProviders } from '@/shared/test';
import { registerDevAiI18n } from '../i18n';
import { DevAiSessionDiagnostics } from './DevAiSessionDiagnostics';
import { resetDevAiTableDiagnostics, useDevAiTableDiagnostics } from './diagnosticsFlag';
import { makeCostGroup, makeDecision, makeDecisionsResponse } from './testFixtures';

registerDevAiI18n();

const SESSION_ID = 'sess-secret-4242';
const GET = `GET /api/dev/ai/sessions/${SESSION_ID}/decisions`;
const ROOT = 'dev-ai-session-diagnostics';

function makeAutomation(overrides: Partial<SessionAutomationState> = {}): SessionAutomationState {
  return {
    strategy: 'openai',
    pending: false,
    phase: 'idle',
    error: null,
    lastRun: null,
    retry: () => undefined,
    ...overrides,
  };
}

function makeLastRun(seq: number, summary: Partial<AutomationRunSummary> = {}): AutomationLastRun {
  return {
    source: 'run',
    events: [],
    seq,
    summary: {
      steps: 2,
      pending: false,
      strategy: 'openai',
      fallbacks: 0,
      fallbackReasons: [],
      stopReason: 'humanTurn',
      ...summary,
    },
  };
}

/** The automation the panel gets from the session host (changed with `setAutomation`). */
const useHarness = create<{ automation: SessionAutomationState }>(() => ({
  automation: makeAutomation(),
}));
const setAutomation = (patch: Partial<SessionAutomationState>) =>
  act(() => useHarness.setState((s) => ({ automation: { ...s.automation, ...patch } })));

function Harness() {
  const automation = useHarness((s) => s.automation);
  return <DevAiSessionDiagnostics sessionId={SESSION_ID} automation={automation} />;
}

function render(handler: MockHandler, automation: Partial<SessionAutomationState> = {}) {
  useHarness.setState({ automation: makeAutomation(automation) });
  const mock = mockFetch({ [GET]: handler });
  const view = renderWithProviders({ element: <Harness /> });
  return { ...mock, ...view };
}

const gets = (requests: MockRequest[]) =>
  requests.filter((r) => `${r.method} ${r.path}` === GET).length;
const settle = () => act(() => new Promise((r) => setTimeout(r, 30)));

async function expand(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.click(screen.getByTestId('dev-ai-session-toggle'));
  await waitFor(() => expect(screen.getByTestId(ROOT)).toHaveAttribute('data-expanded', 'true'));
}

const reasonText = (code: string) => i18n.t(`sessionHost:automation.reason.${code}`);

describe('DevAiSessionDiagnostics (SWR-008 plan-frontend §2, §4.2)', () => {
  beforeEach(() => {
    resetDevAiTableDiagnostics();
    useDevAiTableDiagnostics.setState({ enabled: true });
  });

  it('D-1: rules on/count/ids/tokens/cost, fallback code, «dropped by the prompt limit», data-*, last AI turn', async () => {
    const withRules = makeDecision({
      at: '2026-11-20T10:00:00.000Z',
      rules: {
        count: 3,
        ids: ['rebellion:turn.activate', 'rebellion:move.basic', 'rebellion:impl.engine-scope'],
        tokensEstimate: 412,
        chars: 1648,
        truncated: true,
      },
      costMicroUsd: 113,
    });
    const dropped = makeDecision({
      at: '2026-11-20T10:01:00.000Z',
      status: 'timeout',
      fallback: true,
      errorCode: 'AI_TIMEOUT',
      attempts: 3,
      costMicroUsd: 2500,
      rules: { count: 0, ids: [], chars: 0, tokensEstimate: 0, dropped: true },
    });
    const body = makeDecisionsResponse([withRules, dropped]);
    const { user, requests } = render(
      { status: 200, body },
      {
        lastRun: makeLastRun(1, {
          steps: 2,
          fallbacks: 1,
          fallbackReasons: ['AI_PROMPT_TOO_LARGE'],
        }),
      },
    );
    const root = await screen.findByTestId(ROOT);
    await waitFor(() => expect(root).toHaveAttribute('data-state', 'ready'));
    expect(root).toHaveAttribute('data-decisions', '2');
    expect(root).toHaveAttribute('data-expanded', 'false');
    expect(root.tagName).toBe('SECTION');
    expect(screen.getByTestId('dev-ai-session-toggle')).toHaveTextContent('DEV · решений AI: 2');
    // collapsed: no rows yet
    expect(screen.queryByTestId('dev-ai-session-decision-0')).not.toBeInTheDocument();
    await expand(user);

    const row0 = screen.getByTestId('dev-ai-session-decision-0');
    expect(row0).toHaveAttribute('data-rules-enabled', 'true');
    expect(row0).toHaveAttribute('data-rules-count', '3');
    expect(row0).toHaveAttribute(
      'data-rules-ids',
      'rebellion:turn.activate,rebellion:move.basic,rebellion:impl.engine-scope',
    );
    expect(row0).toHaveAttribute('data-rules-tokens', '412');
    expect(row0).toHaveAttribute('data-rules-chars', '1648');
    expect(row0).toHaveAttribute('data-rules-truncated', 'true');
    expect(row0).toHaveAttribute('data-rules-dropped', 'false');
    expect(row0).toHaveAttribute('data-fallback', 'false');
    expect(row0).toHaveAttribute('data-error-code', '');
    expect(row0).toHaveAttribute('data-status', 'ok');
    expect(row0).toHaveAttribute('data-input-tokens', '1812');
    expect(row0).toHaveAttribute('data-output-tokens', '64');
    expect(row0).toHaveAttribute('data-cost-micro-usd', '113');
    expect(row0).toHaveTextContent('Правила: вкл');
    expect(row0).toHaveTextContent('правил: 3');
    expect(row0).toHaveTextContent('rebellion:turn.activate, rebellion:move.basic');
    expect(row0).toHaveTextContent('контекст правил ≈ 412 ток.');
    expect(row0).toHaveTextContent('обрезаны');
    expect(row0).not.toHaveTextContent('сняты лимитом промпта');
    expect(row0).toHaveTextContent('без fallback');
    expect(row0.textContent).toMatch(/0,000113/);
    expect(row0).toHaveTextContent('rebellion@1:0123456789ab');
    expect(row0).toHaveTextContent('gpt-6-luna-2026-10-01');

    const row1 = screen.getByTestId('dev-ai-session-decision-1');
    expect(row1).toHaveAttribute('data-fallback', 'true');
    expect(row1).toHaveAttribute('data-error-code', 'AI_TIMEOUT');
    expect(row1).toHaveAttribute('data-status', 'timeout');
    expect(row1).toHaveAttribute('data-rules-dropped', 'true');
    expect(row1).toHaveAttribute('data-rules-ids', '');
    expect(row1).toHaveTextContent('fallback: AI_TIMEOUT');
    expect(row1).toHaveTextContent(reasonText('AI_TIMEOUT'));
    expect(row1).toHaveTextContent('сняты лимитом промпта');
    expect(row1).toHaveTextContent('попыток: 3');
    // newest first, indices are the response indices
    const items = within(root)
      .getAllByRole('listitem')
      .filter((li) => li.dataset.testid);
    expect(items.map((li) => li.dataset.testid)).toEqual([
      'dev-ai-session-decision-1',
      'dev-ai-session-decision-0',
    ]);

    const totals = screen.getByTestId('dev-ai-session-totals');
    expect(totals).toHaveAttribute('data-with-rules-decisions', '2');
    expect(totals).toHaveAttribute('data-with-rules-cost', '2613');
    expect(totals).toHaveAttribute('data-without-rules-decisions', '0');
    expect(totals).toHaveAttribute('data-without-rules-cost', '0');
    expect(totals).toHaveAttribute('data-total-cost', '2613');

    const lastRun = screen.getByTestId('dev-ai-session-last-run');
    expect(lastRun).toHaveAttribute('data-steps', '2');
    expect(lastRun).toHaveAttribute('data-fallbacks', '1');
    expect(lastRun).toHaveAttribute('data-reasons', 'AI_PROMPT_TOO_LARGE');
    expect(lastRun).toHaveTextContent('fallback: AI_PROMPT_TOO_LARGE');
    expect(reasonText('AI_PROMPT_TOO_LARGE')).not.toBe(reasonText('unknown'));
    expect(lastRun).toHaveTextContent(reasonText('AI_PROMPT_TOO_LARGE'));
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Решения AI · DEV');
    expect(screen.getByRole('region', { name: 'Решения AI · DEV' })).toBe(root);
    expect(gets(requests)).toBe(1);
  });

  it('D-5: 0 rules, fallback with a code, cost 0, mean null, no ids → «правил: 0», «fallback: …», 0,00, «—»; no NaN/undefined/null', async () => {
    const bot = makeDecision({
      provider: 'mock',
      model: 'mock-deterministic-v1',
      status: 'invalid_decision',
      fallback: true,
      errorCode: 'AI_INVALID_DECISION',
      inputTokens: 0,
      outputTokens: 0,
      costMicroUsd: 0,
      durationMs: 0,
      rules: {
        enabled: false,
        rulesVersion: null,
        count: 0,
        ids: [],
        chars: 0,
        tokensEstimate: 0,
      },
    });
    const body = {
      decisions: [bot],
      totals: {
        withRules: makeCostGroup(),
        withoutRules: makeCostGroup({ decisions: 1, meanCostMicroUsd: 0 }),
        total: makeCostGroup({ decisions: 1, meanCostMicroUsd: 0 }),
      },
    };
    const { user } = render({ status: 200, body });
    await waitFor(() => expect(screen.getByTestId(ROOT)).toHaveAttribute('data-state', 'ready'));
    await expand(user);
    const row = screen.getByTestId('dev-ai-session-decision-0');
    expect(row).toHaveTextContent('Правила: выкл');
    expect(row).toHaveTextContent('правил: 0');
    expect(row).toHaveTextContent('fallback: AI_INVALID_DECISION');
    expect(row).toHaveTextContent(reasonText('AI_INVALID_DECISION'));
    expect(row.textContent).toMatch(/Стоимость: 0,00/);
    expect(row.textContent).toMatch(/ID правил:\s*—/);
    expect(row.textContent).toMatch(/Версия правил:\s*—/);
    expect(row).toHaveTextContent('0 мс');
    const totals = screen.getByTestId('dev-ai-session-totals');
    expect(totals.textContent).toMatch(/С правилами:\s*решений: 0 · 0,00\s\$ · в среднем —/);
    const text = screen.getByTestId(ROOT).textContent ?? '';
    expect(text).not.toMatch(/NaN|undefined|null/);
  });

  it('D-5: empty list → «no model calls yet», totals of zero', async () => {
    const { user } = render({ status: 200, body: makeDecisionsResponse([]) });
    await waitFor(() => expect(screen.getByTestId(ROOT)).toHaveAttribute('data-state', 'ready'));
    expect(screen.getByTestId(ROOT)).toHaveAttribute('data-decisions', '0');
    expect(screen.getByTestId('dev-ai-session-toggle')).toHaveTextContent('DEV · решений AI: 0');
    await expand(user);
    expect(screen.getByTestId('dev-ai-session-empty')).toHaveTextContent(
      'Вызовов модели в этой партии пока нет (ходы бота не записываются).',
    );
    expect(screen.queryByTestId('dev-ai-session-last-run')).not.toBeInTheDocument();
    expect(screen.getByTestId(ROOT).textContent).not.toMatch(/NaN|undefined|null/);
  });

  it('D-6: a body with a field outside the wire (reason / budgetKey) → data-state=error, the values never reach the DOM', async () => {
    const body = makeDecisionsResponse([makeDecision()]) as unknown as {
      decisions: Record<string, unknown>[];
    } & Record<string, unknown>;
    body.decisions[0]!.reason = 'SECRET MODEL REASON';
    body.budgetKey = 'SECRET-BUDGET-KEY';
    const { user } = render({ status: 200, body });
    await waitFor(() => expect(screen.getByTestId(ROOT)).toHaveAttribute('data-state', 'error'));
    await expand(user);
    const alert = screen.getByTestId('dev-ai-session-error');
    expect(alert).toHaveAttribute('data-reason', 'error');
    expect(alert).toHaveTextContent(i18n.t('errors:code.INVALID_RESPONSE'));
    expect(document.body.innerHTML).not.toContain('SECRET');
    expect(screen.queryByTestId('dev-ai-session-decision-0')).not.toBeInTheDocument();
  });

  it('D-7: the session id is nowhere in the DOM; no prompt / situation / reason / budget labels', async () => {
    const { user, requests } = render(
      { status: 200, body: makeDecisionsResponse([makeDecision()]) },
      { lastRun: makeLastRun(1) },
    );
    await waitFor(() => expect(screen.getByTestId(ROOT)).toHaveAttribute('data-state', 'ready'));
    await expand(user);
    expect(requests[0]?.path).toBe(`/api/dev/ai/sessions/${SESSION_ID}/decisions`);
    expect(document.body.innerHTML).not.toContain(SESSION_ID);
    await i18n.changeLanguage('en');
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('AI decisions · DEV'),
    );
    const text = screen.getByTestId(ROOT).textContent ?? '';
    expect(text).not.toMatch(/[А-Яа-яЁё]/);
    expect(text).not.toMatch(/situation|reason|budget|session/i);
    expect(document.body.innerHTML).not.toContain(SESSION_ID);
  });

  it('D-8: one GET on mount, one per new lastRun.seq, one per end of a run; a run ending with steps → one; no loop', async () => {
    const { requests } = render({ status: 200, body: makeDecisionsResponse([]) });
    await waitFor(() => expect(screen.getByTestId(ROOT)).toHaveAttribute('data-state', 'ready'));
    await settle();
    expect(gets(requests)).toBe(1);

    // a human command whose response carried AI steps → new seq
    setAutomation({ lastRun: makeLastRun(1) });
    await waitFor(() => expect(gets(requests)).toBe(2));

    // a run without steps: running → idle, seq unchanged
    setAutomation({ phase: 'running' });
    await settle();
    expect(gets(requests)).toBe(2);
    setAutomation({ phase: 'idle' });
    await waitFor(() => expect(gets(requests)).toBe(3));

    // a run with steps: phase and seq change at once → exactly one request
    setAutomation({ phase: 'running' });
    await settle();
    setAutomation({ phase: 'stalled', lastRun: makeLastRun(2) });
    await waitFor(() => expect(gets(requests)).toBe(4));

    // a human command without AI steps clears lastRun → no request
    setAutomation({ phase: 'idle', lastRun: null });
    await settle();
    await settle();
    expect(gets(requests)).toBe(4);
  });

  it('D-8: «Refresh» refetches once', async () => {
    const { user, requests } = render({ status: 200, body: makeDecisionsResponse([]) });
    await waitFor(() => expect(screen.getByTestId(ROOT)).toHaveAttribute('data-state', 'ready'));
    await expand(user);
    await user.click(screen.getByTestId('dev-ai-session-refresh'));
    await waitFor(() => expect(gets(requests)).toBe(2));
    await settle();
    expect(gets(requests)).toBe(2);
  });

  it.each([
    [404, 'unavailable', 'NOT_FOUND', 'errors.notFound', 'Эндпоинт диагностики не найден'],
    [403, 'forbidden', 'AI_DEV_FORBIDDEN', 'errors.aiDevForbidden', 'Доступ запрещён'],
    [500, 'error', 'INTERNAL', 'errors.internal', null],
  ] as const)(
    'D-9: %i → data-state=%s with dev-ai-session-error[data-reason]',
    async (status, state, code, messageKey, text) => {
      const { user, requests } = render({
        status,
        body: { ok: false, error: { code, messageKey } },
      });
      await waitFor(() => expect(screen.getByTestId(ROOT)).toHaveAttribute('data-state', state));
      expect(screen.getByTestId('dev-ai-session-toggle')).toHaveTextContent(
        'DEV · решения AI: ошибка',
      );
      await expand(user);
      const alert = screen.getByTestId('dev-ai-session-error');
      expect(alert).toHaveAttribute('data-reason', state);
      if (text) expect(alert).toHaveTextContent(text);
      else expect(alert).toHaveTextContent(i18n.t(`errors:${messageKey.replace('errors.', '')}`));
      await settle();
      expect(gets(requests)).toBe(1); // retry: 0
    },
  );

  it('D-10: keyboard — Tab to the chip, Enter expands, Esc collapses and returns focus (also from inside)', async () => {
    const { user } = render({ status: 200, body: makeDecisionsResponse([makeDecision()]) });
    await waitFor(() => expect(screen.getByTestId(ROOT)).toHaveAttribute('data-state', 'ready'));
    const toggle = screen.getByTestId('dev-ai-session-toggle');
    await user.tab();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const regionId = toggle.getAttribute('aria-controls');
    expect(regionId).toBeTruthy();
    expect(document.getElementById(regionId ?? '')).not.toBeNull();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('dev-ai-session-decision-0')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    expect(screen.queryByTestId('dev-ai-session-decision-0')).not.toBeInTheDocument();

    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.tab();
    expect(screen.getByTestId('dev-ai-session-refresh')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('gate: switch off or no automated participant → nothing rendered, nothing requested', async () => {
    useDevAiTableDiagnostics.setState({ enabled: false });
    const { requests } = render({ status: 200, body: makeDecisionsResponse([]) });
    await settle();
    expect(screen.queryByTestId(ROOT)).not.toBeInTheDocument();
    act(() => useDevAiTableDiagnostics.setState({ enabled: true }));
    await waitFor(() => expect(screen.getByTestId(ROOT)).toHaveAttribute('data-state', 'ready'));
    setAutomation({ strategy: null });
    expect(screen.queryByTestId(ROOT)).not.toBeInTheDocument();
    expect(gets(requests)).toBe(1);
  });

  it('en: chip and labels in English', async () => {
    useSettingsStore.getState().setLanguage('en');
    const { user } = render({
      status: 200,
      body: makeDecisionsResponse([makeDecision(), makeDecision()]),
    });
    await waitFor(() => expect(screen.getByTestId(ROOT)).toHaveAttribute('data-state', 'ready'));
    expect(screen.getByTestId('dev-ai-session-toggle')).toHaveTextContent('DEV · AI decisions: 2');
    await expand(user);
    const row = screen.getByTestId('dev-ai-session-decision-0');
    expect(row).toHaveTextContent('Rules: on');
    expect(row).toHaveTextContent('rules: 3');
    expect(row).toHaveTextContent('Cost: $0.000113');
    expect(screen.getByTestId(ROOT).textContent).not.toMatch(/[А-Яа-яЁё]/);
  });
});
