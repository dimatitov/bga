/**
 * SWR-010 FE-A (plan-frontend §11.1; TC-HAND-01..04, 07, 08 at component level): Card Hand tab content.
 */
import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/shared/i18n';
import { renderWithProviders } from '@/shared/test';
import {
  cardsView,
  makeEmpireRevealedView,
  makeEmpireWithProbesView,
  makeRebelsDigitalCardsView,
  makeRebelsPhysicalUnregisteredView,
} from '../../test/cardFixtures';
import { CORE_SESSION_ID, makeCoreView } from '../../test/coreFixtures';
import { CoreBoardContext, type CoreBoardContextValue } from '../model/coreContext';
import { CardHandPanel } from './CardHandPanel';
import { resetCardUiStore } from './model/cardUiStore';

function ctx(view: PlayerViewCore): CoreBoardContextValue {
  return {
    sessionId: CORE_SESSION_ID,
    view,
    send: vi.fn() as CoreBoardContextValue['send'],
    isPending: false,
  };
}

function renderHand(view: PlayerViewCore, onRequestRegister?: () => void) {
  const utils = renderWithProviders({
    element: (
      <CoreBoardContext.Provider value={ctx(view)}>
        <CardHandPanel onRequestRegister={onRequestRegister} />
      </CoreBoardContext.Provider>
    ),
  });
  const rerenderView = (next: PlayerViewCore) =>
    utils.rerender(
      <CoreBoardContext.Provider value={ctx(next)}>
        <CardHandPanel onRequestRegister={onRequestRegister} />
      </CoreBoardContext.Provider>,
    );
  return { ...utils, rerenderView };
}

beforeEach(() => resetCardUiStore());

describe('CardHandPanel (SWR-010 FE-A, AC-19)', () => {
  it('TC-HAND-01 (ru): own Location with name, type, parameter, availability, description; Empire only counts', async () => {
    renderHand(makeRebelsDigitalCardsView());
    const hand = await screen.findByTestId('card-hand');
    expect(hand).toHaveAttribute('data-tracked', 'true');
    expect(hand).toHaveAttribute('data-viewer', 'rebels');
    expect(screen.getByRole('heading', { level: 3, name: 'Ваши карты' })).toBeInTheDocument();
    const item = screen.getByTestId('card-hand-item-probe-yavin');
    expect(item).toHaveAttribute('data-zone', 'rebels-location');
    expect(item).toHaveTextContent('Явин');
    expect(item).toHaveTextContent('Зонд');
    expect(item).toHaveTextContent('Секретная, только у вас');
    expect(item).toHaveTextContent('Система: Явин');
    // FIX-QA1 D-1: the Location card shows its Location role, not the Empire refresh-draw usage.
    expect(within(item).getByTestId('card-hand-item-usage')).toHaveTextContent(
      'Карта в зоне Location Повстанцев называет систему их базы',
    );
    expect(item).not.toHaveTextContent('В фазе Обновления Империя добирает');
    const opp = screen.getByTestId('card-hand-opponent-count');
    expect(opp).toHaveAttribute('data-count', '2');
    expect(opp).toHaveTextContent('2 карты (скрыты)');
    expect(screen.getByTestId('card-zone-empire-probes')).toHaveAttribute('data-visible', 'false');
    // No names of the opponent's cards (only the public removed list names systems).
    expect(screen.queryByTestId('card-hand-item-probe-hoth')).toBeNull();
    expect(screen.queryByTestId('card-hand-item-probe-endor')).toBeNull();
    expect(screen.getByTestId('card-deck-count')).toHaveAttribute('data-count', '23');
    expect(screen.getByTestId('card-deck-count')).toHaveTextContent('Колода зондов: 23 карты');
    expect(within(screen.getByTestId('card-zone-probe-box')).getAllByRole('button')).toHaveLength(
      5,
    );
    expect(screen.getByTestId('card-hand-deferred')).toHaveTextContent('Миссия');
  });

  it('TC-HAND-01 (en): English texts, no Cyrillic', async () => {
    renderHand(makeRebelsDigitalCardsView());
    const hand = await screen.findByTestId('card-hand');
    await act(() => i18n.changeLanguage('en'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 3, name: 'Your cards' })).toBeInTheDocument(),
    );
    expect(screen.getByTestId('card-hand-item-probe-yavin')).toHaveTextContent('Secret, only you');
    expect(screen.getByTestId('card-hand-opponent-count')).toHaveTextContent('2 cards (hidden)');
    expect(hand.textContent).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('TC-HAND-02: human Empire sees its probes («базы здесь нет»), the Rebel Location is a count only', async () => {
    renderHand(makeEmpireWithProbesView(['hoth', 'endor']));
    const hand = await screen.findByTestId('card-hand');
    expect(hand).toHaveAttribute('data-viewer', 'empire');
    for (const id of ['probe-hoth', 'probe-endor']) {
      const item = screen.getByTestId(`card-hand-item-${id}`);
      expect(item).toHaveAttribute('data-zone', 'empire-probes');
      expect(item).toHaveTextContent('Базы здесь нет');
      expect(item).toHaveTextContent('В руке');
      expect(within(item).getByTestId('card-hand-item-usage')).toHaveTextContent(
        'В фазе Обновления Империя добирает 2 карты зондов',
      );
    }
    const location = screen.getByTestId('card-zone-rebels-location');
    expect(location).toHaveAttribute('data-visible', 'false');
    expect(location).toHaveAttribute('data-count', '1');
    expect(location).toHaveTextContent('1 карта (скрыта)');
    expect(hand.textContent).not.toContain('Явин');
  });

  it('after the reveal the Empire sees the base card in the public revealed zone', async () => {
    renderHand(makeEmpireRevealedView());
    const item = await screen.findByTestId('card-hand-item-probe-yavin');
    expect(item).toHaveAttribute('data-zone', 'rebels-base-revealed');
    expect(item).toHaveTextContent('Раскрыта');
    expect(within(item).getByTestId('card-hand-item-usage')).toHaveTextContent(
      'Карта в зоне Location Повстанцев называет систему их базы',
    );
  });

  it('TC-HAND-03: select by mouse and keyboard (aria-pressed), Card Detail opens; click again closes', async () => {
    const { user } = renderHand(makeEmpireWithProbesView(['hoth', 'endor']));
    const hoth = await screen.findByTestId('card-hand-item-probe-hoth');
    expect(hoth).toHaveAttribute('aria-pressed', 'false');
    await user.click(hoth);
    expect(hoth).toHaveAttribute('aria-pressed', 'true');
    expect(hoth).toHaveAttribute('aria-controls', 'card-detail');
    expect(screen.getByTestId('card-detail')).toHaveAttribute('data-definition-id', 'probe-hoth');
    expect(screen.getByRole('heading', { level: 3, name: 'Хот' })).toHaveFocus();

    const endor = screen.getByTestId('card-hand-item-probe-endor');
    endor.focus();
    await user.keyboard('{Enter}');
    expect(endor).toHaveAttribute('aria-pressed', 'true');
    expect(hoth).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('card-detail')).toHaveAttribute('data-definition-id', 'probe-endor');

    endor.focus();
    await user.keyboard(' ');
    expect(endor).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('card-detail')).toBeNull();
  });

  it('TC-HAND-04: digital — the only buttons are the cards themselves (no play / action keys)', async () => {
    renderHand(makeRebelsDigitalCardsView(), vi.fn());
    const hand = await screen.findByTestId('card-hand');
    const buttons = within(hand).getAllByRole('button');
    for (const b of buttons) expect(b.dataset.testid).toMatch(/^card-hand-item-/);
    expect(screen.queryByTestId('card-hand-register')).toBeNull();
  });

  it('TC-HAND-04: physical before the registration — «не зарегистрирована» and the only action key', async () => {
    const onRegister = vi.fn();
    const { user } = renderHand(makeRebelsPhysicalUnregisteredView(), onRegister);
    const hand = await screen.findByTestId('card-hand');
    const location = screen.getByTestId('card-zone-rebels-location');
    expect(location).toHaveTextContent('Карта базы не зарегистрирована');
    // No preliminary system is named for the Location.
    expect(location.textContent).not.toContain('Явин');
    const actions = within(hand)
      .getAllByRole('button')
      .filter((b) => !b.dataset.testid?.startsWith('card-hand-item-'));
    expect(actions.map((b) => b.dataset.testid)).toEqual(['card-hand-register']);
    await user.click(screen.getByTestId('card-hand-register'));
    expect(onRegister).toHaveBeenCalledTimes(1);
  });

  it('TC-HAND-07: legacy game → «В этой партии карты не отслеживаются» (ru, en)', async () => {
    renderHand(makeCoreView());
    const hand = await screen.findByTestId('card-hand');
    expect(hand).toHaveAttribute('data-tracked', 'false');
    expect(screen.getByTestId('card-hand-legacy')).toHaveTextContent(
      'В этой партии карты не отслеживаются',
    );
    await act(() => i18n.changeLanguage('en'));
    expect(screen.getByTestId('card-hand-legacy')).toHaveTextContent(
      'Cards are not tracked in this game',
    );
  });

  it('TC-HAND-08: a new view (Refresh: +2 probes) updates the counts without a reload', async () => {
    const { rerenderView } = renderHand(makeRebelsDigitalCardsView());
    expect(await screen.findByTestId('card-hand-opponent-count')).toHaveAttribute(
      'data-count',
      '2',
    );
    rerenderView(
      makeCoreView({
        cards: cardsView('rebels', { empireProbes: ['hoth', 'endor', 'dagobah', 'ilum'] }),
      }),
    );
    expect(screen.getByTestId('card-hand-opponent-count')).toHaveAttribute('data-count', '4');
    expect(screen.getByTestId('card-deck-count')).toHaveAttribute('data-count', '21');
  });

  it('the selection is dropped when the selected card leaves the view', async () => {
    const { user, rerenderView } = renderHand(makeRebelsDigitalCardsView());
    await user.click(await screen.findByTestId('card-hand-item-probe-yavin'));
    expect(screen.getByTestId('card-detail')).toBeInTheDocument();
    rerenderView(makeCoreView({ cards: cardsView('rebels', { revealed: true }) }));
    expect(screen.queryByTestId('card-detail')).toBeNull();
  });
});
