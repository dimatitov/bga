import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { type MockReply, mockFetch, renderWithProviders } from '@/shared/test';
import { errorBody, makeDecisionResponse, makeMockStatus, makeStatus } from './testFixtures';
import { DEV_AI_TEST_SCENARIO } from './testScenario';

const STATUS = 'GET /api/dev/ai/status';
const DECIDE = 'POST /api/dev/ai/test-decision';

async function openPage(routes: Parameters<typeof mockFetch>[0]) {
  const mock = mockFetch(routes);
  const view = renderWithProviders({ path: '/dev/ai' });
  await screen.findByTestId('dev-ai-page');
  return { ...mock, ...view };
}

function deferred() {
  let resolve!: (reply: MockReply) => void;
  const promise = new Promise<MockReply>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const count = (requests: { method: string; path: string }[], key: string) =>
  requests.filter((r) => `${r.method} ${r.path}` === key).length;

describe('DevAiPage (SWR-005B plan-frontend §11)', () => {
  it('T-1: h1, DEV chip, one status GET and no POST on mount', async () => {
    const { requests } = await openPage({ [STATUS]: { status: 200, body: makeStatus() } });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Диагностика AI');
    expect(screen.getByTestId('dev-ai-badge')).toHaveTextContent('DEV');
    await waitFor(() =>
      expect(screen.getByTestId('dev-ai-status')).toHaveAttribute('data-state', 'ready'),
    );
    expect(count(requests, STATUS)).toBe(1);
    expect(count(requests, DECIDE)).toBe(0);
  });

  it('T-2: ready status — OpenAI, provider, key boolean, models availability, budget', async () => {
    await openPage({
      [STATUS]: {
        status: 200,
        body: makeStatus({
          models: {
            strategy: { id: 'gpt-6.1-sol', available: true },
            tactical: { id: 'gpt-6-luna', available: false },
          },
        }),
      },
    });
    const status = screen.getByTestId('dev-ai-status');
    await waitFor(() => expect(status).toHaveAttribute('data-state', 'ready'));
    expect(screen.getByTestId('dev-ai-status-openai')).toHaveAttribute('data-enabled', 'true');
    expect(screen.getByTestId('dev-ai-status-openai')).toHaveTextContent('включён');
    expect(screen.getByTestId('dev-ai-status-provider')).toHaveAttribute('data-provider', 'openai');
    expect(screen.getByTestId('dev-ai-status-key')).toHaveAttribute('data-configured', 'true');
    expect(screen.getByTestId('dev-ai-status-key')).toHaveTextContent('задан');
    expect(screen.getByTestId('dev-ai-model-strategy')).toHaveAttribute('data-available', 'true');
    expect(screen.getByTestId('dev-ai-model-strategy')).toHaveTextContent('gpt-6.1-sol');
    expect(screen.getByTestId('dev-ai-model-strategy')).toHaveTextContent('доступна');
    expect(screen.getByTestId('dev-ai-model-tactical')).toHaveAttribute('data-available', 'false');
    expect(screen.getByTestId('dev-ai-model-tactical')).toHaveTextContent('недоступна');
    const budget = screen.getByTestId('dev-ai-budget');
    expect(budget).toHaveAttribute('data-remaining-usd', '0.2488');
    expect(budget.textContent).toMatch(/0,0012/);
    expect(budget.textContent).toMatch(/0,25/);
    expect(budget.textContent).toMatch(/0,2488/);
    expect(screen.getByTestId('dev-ai-page').textContent).not.toMatch(/sk-/);
  });

  it('T-2b: mock status — OpenAI off, model not set / unchecked, no limit', async () => {
    await openPage({ [STATUS]: { status: 200, body: makeMockStatus() } });
    await waitFor(() =>
      expect(screen.getByTestId('dev-ai-status')).toHaveAttribute('data-state', 'ready'),
    );
    expect(screen.getByTestId('dev-ai-status-openai')).toHaveAttribute('data-enabled', 'false');
    expect(screen.getByTestId('dev-ai-status-key')).toHaveTextContent('не задан');
    expect(screen.getByTestId('dev-ai-model-strategy')).toHaveAttribute(
      'data-available',
      'unknown',
    );
    expect(screen.getByTestId('dev-ai-model-strategy')).toHaveTextContent('не задана');
    expect(screen.getByTestId('dev-ai-model-strategy')).toHaveTextContent('не проверялась');
    expect(screen.getByTestId('dev-ai-budget')).toHaveAttribute('data-remaining-usd', '');
    expect(screen.getByTestId('dev-ai-budget')).toHaveTextContent('лимита нет');
  });

  it('T-3: 404 → unavailable; 500 → error with role=alert and Retry → second GET', async () => {
    const { requests, router } = await openPage({
      [STATUS]: { status: 404, body: errorBody('NOT_FOUND', 'errors.notFound') },
    });
    await waitFor(() =>
      expect(screen.getByTestId('dev-ai-status')).toHaveAttribute('data-state', 'unavailable'),
    );
    expect(screen.getByTestId('dev-ai-submit')).toBeEnabled();
    expect(count(requests, STATUS)).toBe(1);
    await act(() => router.navigate('/settings'));

    let calls = 0;
    const second = mockFetch({
      [STATUS]: () => {
        calls += 1;
        return calls === 1
          ? { status: 500, body: errorBody('INTERNAL', 'errors.internal') }
          : { status: 200, body: makeStatus() };
      },
    });
    const { user } = renderWithProviders({ path: '/dev/ai' });
    const pages = await screen.findAllByTestId('dev-ai-status');
    const status = pages[pages.length - 1]!;
    await waitFor(() => expect(status).toHaveAttribute('data-state', 'error'));
    const alert = within(status).getByRole('alert');
    expect(alert).toHaveTextContent('Статус не загружен');
    await user.click(within(status).getByTestId('dev-ai-status-retry'));
    await waitFor(() => expect(status).toHaveAttribute('data-state', 'ready'));
    expect(count(second.requests, STATUS)).toBe(2);
  });

  it('T-3b: network failure → error state with the network text', async () => {
    await openPage({ [STATUS]: 'network' });
    await waitFor(() =>
      expect(screen.getByTestId('dev-ai-status')).toHaveAttribute('data-state', 'error'),
    );
    expect(screen.getByTestId('dev-ai-status-error')).toHaveAttribute('data-code', 'NETWORK');
    expect(screen.getByTestId('dev-ai-status-error')).toHaveTextContent('Сервер недоступен');
  });

  it('T-4: defaults mock + tactical; auto shows the paid warning (OpenAI on) or the mock hint (OpenAI off)', async () => {
    const { user } = await openPage({ [STATUS]: { status: 200, body: makeStatus() } });
    await waitFor(() =>
      expect(screen.getByTestId('dev-ai-status')).toHaveAttribute('data-state', 'ready'),
    );
    expect(screen.getByTestId('dev-ai-provider-mock')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('dev-ai-role-tactical')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('dev-ai-role-tactical')).toHaveTextContent('tactical — gpt-6-luna');
    expect(screen.queryByTestId('dev-ai-paid-warning')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('dev-ai-provider-auto'));
    expect(screen.getByTestId('dev-ai-paid-warning')).toHaveTextContent('платный запрос');
    expect(screen.queryByTestId('dev-ai-auto-mock-hint')).not.toBeInTheDocument();
  });

  it('T-4b: auto with OpenAI off → mock hint, no paid warning', async () => {
    const { user } = await openPage({ [STATUS]: { status: 200, body: makeMockStatus() } });
    await waitFor(() =>
      expect(screen.getByTestId('dev-ai-status')).toHaveAttribute('data-state', 'ready'),
    );
    await user.click(screen.getByTestId('dev-ai-provider-auto'));
    expect(screen.getByTestId('dev-ai-auto-mock-hint')).toBeInTheDocument();
    expect(screen.queryByTestId('dev-ai-paid-warning')).not.toBeInTheDocument();
  });

  it('T-5: click → one POST with the PO scenario, role and provider (no budgetKey); pending blocks the UI', async () => {
    const reply = deferred();
    const { requests, user } = await openPage({
      [STATUS]: { status: 200, body: makeStatus() },
      [DECIDE]: () => reply.promise,
    });
    await user.click(screen.getByTestId('dev-ai-role-strategy'));
    const submit = screen.getByTestId('dev-ai-submit');
    // Double click in one task (before React re-renders the disabled button) → still one request.
    act(() => {
      submit.click();
      submit.click();
    });
    await waitFor(() => expect(submit).toHaveAttribute('data-pending', 'true'));
    expect(submit).toBeDisabled();
    expect(submit).toHaveTextContent('Запрос выполняется…');
    expect(screen.getByTestId('dev-ai-role-tactical')).toBeDisabled();
    expect(screen.getByTestId('dev-ai-provider-auto')).toBeDisabled();
    expect(screen.getByTestId('dev-ai-result')).toHaveAttribute('data-state', 'pending');
    expect(screen.getByTestId('dev-ai-result')).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(submit);
    expect(count(requests, DECIDE)).toBe(1);
    const post = requests.find((r) => r.method === 'POST')!;
    expect(post.body).toEqual({
      scenario: DEV_AI_TEST_SCENARIO,
      role: 'strategy',
      provider: 'mock',
    });
    expect(post.body).not.toHaveProperty('budgetKey');
    expect(DEV_AI_TEST_SCENARIO).toEqual({
      faction: 'empire',
      phase: 'command',
      objective: 'Strengthen imperial control',
      availableActions: [
        { id: 'action-1', type: 'MOVE_FLEET', target: 'corellia' },
        { id: 'action-2', type: 'RECRUIT', target: 'coruscant' },
        { id: 'action-3', type: 'PASS' },
      ],
    });
    reply.resolve({ status: 200, body: makeDecisionResponse() });
    await waitFor(() => expect(submit).toHaveAttribute('data-pending', 'false'));
    expect(submit).toHaveTextContent('Тестировать AI');
  });

  it('T-6: success → all result fields, selected action marked, reasoning null → «—»', async () => {
    const { user } = await openPage({
      [STATUS]: { status: 200, body: makeStatus() },
      [DECIDE]: { status: 200, body: makeDecisionResponse() },
    });
    await user.click(screen.getByTestId('dev-ai-submit'));
    const result = screen.getByTestId('dev-ai-result');
    await waitFor(() => expect(result).toHaveAttribute('data-state', 'success'));
    expect(screen.getByTestId('dev-ai-result-action')).toHaveTextContent(
      'action-1 · MOVE_FLEET · corellia',
    );
    expect(screen.getByTestId('dev-ai-result-reason')).toHaveTextContent(
      'Improves strategic positioning',
    );
    expect(screen.getByTestId('dev-ai-result-provider')).toHaveTextContent('openai');
    expect(screen.getByTestId('dev-ai-result-model')).toHaveTextContent('gpt-6-luna-2026-10-01');
    expect(screen.getByTestId('dev-ai-result-duration')).toHaveAttribute('data-ms', '1234');
    expect(screen.getByTestId('dev-ai-result-duration').textContent).toMatch(/1\s?234 мс/);
    expect(screen.getByTestId('dev-ai-result-attempts')).toHaveTextContent('1');
    expect(screen.getByTestId('dev-ai-tokens-input')).toHaveAttribute('data-value', '812');
    expect(screen.getByTestId('dev-ai-tokens-cached')).toHaveAttribute('data-value', '0');
    expect(screen.getByTestId('dev-ai-tokens-output')).toHaveAttribute('data-value', '64');
    expect(screen.getByTestId('dev-ai-tokens-reasoning')).toHaveAttribute('data-value', '32');
    expect(screen.getByTestId('dev-ai-tokens-total')).toHaveAttribute('data-value', '876');
    expect(screen.getByTestId('dev-ai-cost')).toHaveAttribute('data-usd', '0.000113');
    expect(screen.getByTestId('dev-ai-cost').textContent).toMatch(/0,000113/);
    expect(screen.getByTestId('dev-ai-cost-note')).toHaveTextContent(
      'оценка; итог по счёту OpenAI может отличаться',
    );
    expect(screen.getByTestId('dev-ai-pricing')).toHaveTextContent('openai-2026-11-08');
    expect(screen.getByTestId('dev-ai-budget-remaining')).toHaveAttribute('data-usd', '0.248687');
    expect(screen.getByTestId('dev-ai-action-action-1')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('dev-ai-action-action-1')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('dev-ai-action-action-2')).toHaveAttribute('data-selected', 'false');
    await waitFor(() =>
      expect(screen.getByTestId('live-region')).toHaveTextContent('AI выбрал действие action-1'),
    );
  });

  it('T-6b: reasoningTokens null → «—» and «нет данных»; mock cost 0', async () => {
    const { user } = await openPage({
      [STATUS]: { status: 200, body: makeMockStatus() },
      [DECIDE]: {
        status: 200,
        body: makeDecisionResponse({
          provider: 'mock',
          model: 'mock',
          estimatedCostUsd: 0,
          estimatedCostMicroUsd: 0,
          selectedActionId: 'action-3',
          usage: {
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningTokens: null,
            totalTokens: 0,
          },
        }),
      },
    });
    await user.click(screen.getByTestId('dev-ai-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('dev-ai-result')).toHaveAttribute('data-state', 'success'),
    );
    const reasoning = screen.getByTestId('dev-ai-tokens-reasoning');
    expect(reasoning).toHaveAttribute('data-value', '');
    expect(reasoning).toHaveTextContent('—');
    expect(reasoning).toHaveTextContent('нет данных');
    expect(screen.getByTestId('dev-ai-result-action')).toHaveTextContent('action-3 · PASS');
    expect(screen.getByTestId('dev-ai-cost')).toHaveAttribute('data-usd', '0');
  });

  it.each([
    [
      'AI_NOT_CONFIGURED',
      503,
      'errors.aiModelUnavailable',
      { role: 'tactical', model: 'gpt-6-luna' },
      'модель OpenAI недоступна',
      null,
    ],
    [
      'AI_BUDGET_EXCEEDED',
      429,
      'errors.aiBudgetExceeded',
      {
        budgetKey: 'dev-diagnostics',
        spentUsd: 0.25,
        limitUsd: 0.25,
        remainingUsd: 0,
        requiredUsd: 0.01,
      },
      'Бюджет AI исчерпан',
      /Осталось 0,00\s\$ из 0,25\s\$/,
    ],
    [
      'AI_RATE_LIMITED',
      429,
      'errors.aiDevRateLimited',
      { retryAfterSeconds: 42 },
      'Слишком много диагностических запросов',
      /через 42 с/,
    ],
    [
      'AI_TIMEOUT',
      504,
      'errors.aiTimeout',
      { attempts: 3 },
      'OpenAI не ответил вовремя',
      /Попыток: 3/,
    ],
    [
      'AI_PROVIDER_ERROR',
      502,
      'errors.aiQuota',
      { attempts: 1, reason: 'quota' },
      'закончилась квота',
      /Попыток: 1/,
    ],
    [
      'AI_INVALID_DECISION',
      502,
      'errors.aiInvalidDecision',
      { attempts: 1, reason: 'not_in_actions', estimatedCostUsd: 0.0001 },
      'недопустимое решение',
      /Попыток: 1/,
    ],
    [
      'AI_DEV_FORBIDDEN',
      403,
      'errors.aiDevForbidden',
      undefined,
      'только с локальной машины',
      null,
    ],
  ] as const)(
    'T-7: %s → dev-ai-error role=alert with the localized text',
    async (code, httpStatus, messageKey, details, text, fact) => {
      const { user } = await openPage({
        [STATUS]: { status: 200, body: makeStatus() },
        [DECIDE]: { status: httpStatus, body: errorBody(code, messageKey, details) },
      });
      await user.click(screen.getByTestId('dev-ai-submit'));
      const alert = await screen.findByTestId('dev-ai-error');
      expect(alert).toHaveAttribute('role', 'alert');
      expect(alert).toHaveAttribute('data-code', code);
      expect(alert).toHaveTextContent(text);
      if (fact) expect(alert.textContent).toMatch(fact);
      expect(screen.getByTestId('dev-ai-result')).toHaveAttribute('data-state', 'error');
      expect(screen.getByTestId('dev-ai-submit')).toBeEnabled();
    },
  );

  it('T-7b: AI error without details → text without numbers (fallback)', async () => {
    const { user } = await openPage({
      [STATUS]: { status: 200, body: makeStatus() },
      [DECIDE]: { status: 429, body: errorBody('AI_BUDGET_EXCEEDED', 'errors.aiBudgetExceeded') },
    });
    await user.click(screen.getByTestId('dev-ai-submit'));
    const alert = await screen.findByTestId('dev-ai-error');
    expect(alert).toHaveTextContent('Бюджет исчерпан');
    expect(alert).toHaveTextContent('Mock продолжает работать бесплатно');
    expect(alert).toHaveTextContent('Лимит общий для всех запросов диагностики');
    expect(alert.textContent).not.toMatch(/Осталось/);
  });

  it.each(['ru', 'en'] as const)(
    'D-2 (%s): the budget alert says «Mock keeps working for free» exactly once',
    async (lng) => {
      await i18n.changeLanguage(lng);
      const { user } = await openPage({
        [STATUS]: { status: 200, body: makeStatus() },
        [DECIDE]: {
          status: 429,
          body: errorBody('AI_BUDGET_EXCEEDED', 'errors.aiBudgetExceeded', {
            remainingUsd: 0,
            limitUsd: 0.25,
          }),
        },
      });
      await i18n.changeLanguage(lng);
      await user.click(screen.getByTestId('dev-ai-submit'));
      const alert = await screen.findByTestId('dev-ai-error');
      const phrase =
        lng === 'ru' ? /Mock продолжает работать бесплатно/g : /Mock keeps working for free/g;
      expect(alert.textContent?.match(phrase)).toHaveLength(1);
    },
  );

  it('D-2: a hint already contained in the error text is not repeated (AI_NOT_CONFIGURED)', async () => {
    const { user } = await openPage({
      [STATUS]: { status: 200, body: makeStatus() },
      [DECIDE]: { status: 503, body: errorBody('AI_NOT_CONFIGURED', 'errors.aiNotConfigured') },
    });
    await user.click(screen.getByTestId('dev-ai-submit'));
    const alert = await screen.findByTestId('dev-ai-error');
    expect(alert).toHaveTextContent('AI не настроен');
    expect(alert.textContent?.match(/Выберите провайдер Mock/g)).toHaveLength(1);
  });

  it('D-2: a hint not contained in the error text is still shown (aiKeyRejected)', async () => {
    const { user } = await openPage({
      [STATUS]: { status: 200, body: makeStatus() },
      [DECIDE]: { status: 503, body: errorBody('AI_NOT_CONFIGURED', 'errors.aiKeyRejected') },
    });
    await user.click(screen.getByTestId('dev-ai-submit'));
    const alert = await screen.findByTestId('dev-ai-error');
    expect(alert).toHaveTextContent('OpenAI отклонил API-ключ');
    expect(alert).toHaveTextContent('Выберите провайдер Mock или проверьте apps/api/.env.');
  });

  it('D-3: placeholder words use the regular font; data slots use a Cyrillic-capable mono stack', async () => {
    await openPage({ [STATUS]: { status: 200, body: makeMockStatus() } });
    await waitFor(() =>
      expect(screen.getByTestId('dev-ai-status')).toHaveAttribute('data-state', 'ready'),
    );
    const placeholders = [
      within(screen.getByTestId('dev-ai-model-strategy')).getByText('не задана'),
      within(screen.getByTestId('dev-ai-action-action-3')).getByText('без цели'),
    ];
    for (const el of placeholders) {
      expect(el.tagName).not.toBe('CODE');
      expect(el.closest('code')).toBeNull();
      expect(el).toHaveAttribute('data-placeholder', 'true');
      expect(getComputedStyle(el).fontFamily).not.toMatch(/mono/i);
    }
    const codes = screen.getByTestId('dev-ai-page').querySelectorAll('code');
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      expect(code.textContent).not.toMatch(/[А-Яа-яЁё]/);
      expect(getComputedStyle(code).fontFamily).toMatch(/Menlo/);
      expect(getComputedStyle(code).fontFamily).toMatch(/Consolas/);
    }
  });

  it('T-8: status refetched after success and after error; a new attempt clears the previous error', async () => {
    let decide = 0;
    const { requests, user } = await openPage({
      [STATUS]: { status: 200, body: makeStatus() },
      [DECIDE]: () => {
        decide += 1;
        return decide === 1
          ? { status: 504, body: errorBody('AI_TIMEOUT', 'errors.aiTimeout', { attempts: 3 }) }
          : { status: 200, body: makeDecisionResponse() };
      },
    });
    await waitFor(() => expect(count(requests, STATUS)).toBe(1));
    await user.click(screen.getByTestId('dev-ai-submit'));
    await screen.findByTestId('dev-ai-error');
    await waitFor(() => expect(count(requests, STATUS)).toBe(2));
    await user.click(screen.getByTestId('dev-ai-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('dev-ai-result')).toHaveAttribute('data-state', 'success'),
    );
    expect(screen.queryByTestId('dev-ai-error')).not.toBeInTheDocument();
    await waitFor(() => expect(count(requests, STATUS)).toBe(3));
    expect(count(requests, DECIDE)).toBe(2);
  });

  it('T-9: 200 not matching the schema → INVALID_RESPONSE text, page intact', async () => {
    const { user } = await openPage({
      [STATUS]: { status: 200, body: makeStatus() },
      [DECIDE]: { status: 200, body: { decision: { selectedActionId: 'action-1' } } },
    });
    await user.click(screen.getByTestId('dev-ai-submit'));
    const alert = await screen.findByTestId('dev-ai-error');
    expect(alert).toHaveAttribute('data-code', 'INVALID_RESPONSE');
    expect(alert).toHaveTextContent('Запрос не выполнен');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('T-10: reason with markup is rendered as text', async () => {
    const { user } = await openPage({
      [STATUS]: { status: 200, body: makeStatus() },
      [DECIDE]: { status: 200, body: makeDecisionResponse({ reason: '<b>bold</b> move' }) },
    });
    await user.click(screen.getByTestId('dev-ai-submit'));
    const reason = await screen.findByTestId('dev-ai-result-reason');
    expect(reason).toHaveTextContent('<b>bold</b> move');
    expect(reason.querySelector('b')).toBeNull();
  });

  it('T-11: en → English page texts, no Cyrillic in the page', async () => {
    await i18n.changeLanguage('en');
    const { user } = await openPage({
      [STATUS]: { status: 200, body: makeStatus() },
      [DECIDE]: { status: 200, body: makeDecisionResponse() },
    });
    await i18n.changeLanguage('en');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('AI diagnostics');
    expect(screen.getByTestId('dev-ai-submit')).toHaveTextContent('Test AI');
    expect(screen.getByTestId('dev-ai-scenario-note')).toHaveTextContent(
      'Test data, not Rebellion rules',
    );
    await user.click(screen.getByTestId('dev-ai-submit'));
    await waitFor(() =>
      expect(screen.getByTestId('dev-ai-result')).toHaveAttribute('data-state', 'success'),
    );
    expect(screen.getByTestId('dev-ai-cost-note')).toHaveTextContent(
      'estimate; the final OpenAI bill may differ',
    );
    expect(screen.getByTestId('dev-ai-page').textContent).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('T-12: a11y by roles — 2 radiogroups, button, 4 h2, ordered action list', async () => {
    await openPage({ [STATUS]: { status: 200, body: makeStatus() } });
    expect(screen.getByRole('radiogroup', { name: 'Роль модели' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Провайдер' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Тестировать AI' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Подключение',
      'Запуск',
      'Результат',
      'Тестовый сценарий',
    ]);
    const list = within(screen.getByTestId('dev-ai-scenario')).getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('region', { name: 'Результат' })).toBe(
      screen.getByTestId('dev-ai-result'),
    );
    expect(screen.getByTestId('dev-ai-scenario-note')).toHaveTextContent(
      'Тестовые данные, не правила Rebellion',
    );
  });
});
