/** SWR-010 FE-A (plan-frontend §6, §11.1; TC-DET-01..04 at component level): Card Detail. */
import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/shared/i18n';
import { renderWithProviders } from '@/shared/test';
import { makeEmpireWithProbesView, makeRebelsDigitalCardsView } from '../../test/cardFixtures';
import { CORE_SESSION_ID } from '../../test/coreFixtures';
import { CoreBoardContext, type CoreBoardContextValue } from '../model/coreContext';
import { CardDetail, VerificationBadge } from './CardDetail';
import { CardHandPanel } from './CardHandPanel';
import { resetCardUiStore } from './model/cardUiStore';

function withCtx(view: PlayerViewCore, ui: React.ReactNode) {
  const value: CoreBoardContextValue = {
    sessionId: CORE_SESSION_ID,
    view,
    send: vi.fn() as CoreBoardContextValue['send'],
    isPending: false,
  };
  return renderWithProviders({
    element: <CoreBoardContext.Provider value={value}>{ui}</CoreBoardContext.Provider>,
  });
}

beforeEach(() => resetCardUiStore());

describe('CardDetail (SWR-010 FE-A, AC-20)', () => {
  it('TC-DET-01 (ru): name, type, type info, usage, effect, where, authority, sources, verification', () => {
    withCtx(
      makeEmpireWithProbesView(),
      <CardDetail
        definitionId="probe-hoth"
        zoneId="empire-probes"
        zoneKind="hand"
        authority="digital"
        onClose={vi.fn()}
      />,
    );
    const detail = screen.getByTestId('card-detail');
    expect(detail).toHaveAttribute('role', 'region');
    expect(screen.getByRole('region', { name: 'Хот' })).toBe(detail);
    expect(screen.getByTestId('card-detail-type')).toHaveTextContent('Зонд');
    expect(screen.getByTestId('card-detail-type-info')).toHaveTextContent('Называет одну систему');
    const usage = within(screen.getByTestId('card-detail-usage')).getAllByRole('listitem');
    expect(usage).toHaveLength(2);
    // FIX-QA1 D-1: in the Empire hand the refresh-draw role comes first and is marked «Сейчас».
    expect(usage[0]).toHaveAttribute('data-current', 'true');
    expect(usage[0]).toHaveTextContent('Сейчас');
    expect(usage[0]).toHaveTextContent('В фазе Обновления Империя добирает');
    expect(usage[1]).not.toHaveAttribute('data-current');
    const effect = screen.getByTestId('card-detail-effect');
    expect(effect).toHaveAttribute('data-effect-status', 'none');
    expect(effect).toHaveTextContent('Нет розыгрыша — справочная карта');
    expect(effect).toHaveTextContent('Без розыгрыша');
    expect(screen.getByTestId('card-detail-where')).toHaveTextContent('Зонды Империи');
    expect(screen.getByTestId('card-detail-authority')).toHaveTextContent('Ведётся приложением');
    const sources = screen.getByTestId('card-detail-sources');
    expect(sources).toHaveTextContent('rebellion:cards.probe');
    expect(sources).toHaveTextContent('RR, с. 10 · Probe Cards');
    expect(screen.getByTestId('card-detail-verification')).toHaveAttribute(
      'data-verification',
      'verified',
    );
    expect(screen.getByTestId('card-detail-verification')).toHaveTextContent('Проверено');
  });

  it('TC-DET-01 (en): English texts, physical authority', async () => {
    withCtx(
      makeRebelsDigitalCardsView(),
      <CardDetail
        definitionId="probe-yavin"
        zoneId="rebels-location"
        authority="physical"
        onClose={vi.fn()}
      />,
    );
    const detail = screen.getByTestId('card-detail');
    await act(() => i18n.changeLanguage('en'));
    await waitFor(() =>
      expect(screen.getByTestId('card-detail-authority')).toHaveTextContent(
        'Physical card on your table',
      ),
    );
    expect(screen.getByTestId('card-detail-where')).toHaveTextContent('Rebel Location');
    expect(screen.getByTestId('card-detail-sources')).toHaveTextContent('RR, p. 10 · Probe Cards');
    expect(detail.textContent).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('FIX-QA1 D-1: a probe in the Rebel Location lists the base-location usage first; no zone kind = no mark', () => {
    const { unmount } = withCtx(
      makeRebelsDigitalCardsView(),
      <CardDetail
        definitionId="probe-yavin"
        zoneId="rebels-location"
        zoneKind="special"
        authority="digital"
        onClose={vi.fn()}
      />,
    );
    const usage = within(screen.getByTestId('card-detail-usage')).getAllByRole('listitem');
    expect(usage[0]).toHaveAttribute('data-current', 'true');
    expect(usage[0]).toHaveTextContent('Карта в зоне Location Повстанцев называет систему их базы');
    expect(usage[1]).toHaveTextContent('В фазе Обновления Империя добирает');
    unmount();
    withCtx(
      makeRebelsDigitalCardsView(),
      <CardDetail
        definitionId="probe-yavin"
        zoneId="probe-box"
        authority="physical"
        onClose={vi.fn()}
      />,
    );
    const neutral = within(screen.getByTestId('card-detail-usage')).getAllByRole('listitem');
    expect(neutral).toHaveLength(2);
    expect(neutral.some((li) => li.hasAttribute('data-current'))).toBe(false);
  });

  it('TC-DET-02: no «Play» button — the only button is «Закрыть»', () => {
    withCtx(
      makeEmpireWithProbesView(),
      <CardDetail
        definitionId="probe-hoth"
        zoneId="empire-probes"
        authority="digital"
        onClose={vi.fn()}
      />,
    );
    const buttons = within(screen.getByTestId('card-detail')).getAllByRole('button');
    expect(buttons.map((b) => b.dataset.testid)).toEqual(['card-detail-close']);
    expect(screen.queryByText(/Разыграть|Play/)).toBeNull();
  });

  it('TC-DET-03: Esc and «Закрыть» close the detail and return the focus to the card', async () => {
    const { user } = withCtx(makeEmpireWithProbesView(), <CardHandPanel />);
    const hoth = await screen.findByTestId('card-hand-item-probe-hoth');
    await user.click(hoth);
    expect(screen.getByRole('heading', { level: 3, name: 'Хот' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('card-detail')).toBeNull();
    expect(hoth).toHaveFocus();
    expect(hoth).toHaveAttribute('aria-pressed', 'false');

    await user.click(hoth);
    await user.click(screen.getByTestId('card-detail-close'));
    expect(screen.queryByTestId('card-detail')).toBeNull();
    expect(hoth).toHaveFocus();
  });

  it('TC-DET-04 (FQ-5): a catalog entry not `verified` shows an amber «требует проверки» badge', () => {
    withCtx(makeEmpireWithProbesView(), <VerificationBadge verification="needs-review" />);
    const badge = screen.getByTestId('card-detail-verification');
    expect(badge).toHaveTextContent('Требует проверки');
    expect(badge).toHaveAttribute('data-verification', 'needs-review');
  });
});
