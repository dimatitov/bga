import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/shared/test';
import { CORE_SESSION_ID, makeCoreOutcomeView, makeCoreView } from '../../test/coreFixtures';
import { CoreBoardContext, type CoreBoardContextValue } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import { OutcomeBanner } from './OutcomeBanner';

const BACK = '/games/star-wars-rebellion';

function ctxOf(view: PlayerViewCore): CoreBoardContextValue {
  return {
    sessionId: CORE_SESSION_ID,
    view,
    send: vi.fn() as CoreBoardContextValue['send'],
    isPending: false,
  };
}

function renderBanner(view: PlayerViewCore) {
  return renderWithProviders({
    element: (
      <CoreBoardContext.Provider value={ctxOf(view)}>
        <button type="button">elsewhere</button>
        <OutcomeBanner backHref={BACK} />
      </CoreBoardContext.Provider>
    ),
  });
}

beforeEach(() => useCoreUiStore.getState().reset());

describe('OutcomeBanner (SWR-005 P2, TC-C-12, AC-07)', () => {
  it('no outcome → nothing', () => {
    renderBanner(makeCoreView());
    expect(screen.queryByTestId('game-over-banner')).not.toBeInTheDocument();
  });

  it('Rebels win by time: winner, reason, back link; region labelled by the h2; no turn buttons', async () => {
    renderBanner(makeCoreOutcomeView('rebels', 'timeReachedReputation'));
    const banner = screen.getByTestId('game-over-banner');
    expect(banner).toHaveAttribute('data-winner', 'rebels');
    expect(banner).toHaveAttribute('data-reason', 'timeReachedReputation');
    const title = screen.getByTestId('game-over-title');
    expect(title.tagName).toBe('H2');
    expect(title).toHaveTextContent('Победа Повстанцев');
    expect(screen.getByRole('region', { name: 'Победа Повстанцев' })).toBe(banner);
    expect(within(banner).getByTestId('game-over-reason')).toHaveTextContent(
      'Время дошло до репутации',
    );
    expect(within(banner).getByTestId('game-over-back')).toHaveAttribute('href', BACK);
    // Only the back link — no pass / finish / activate actions.
    expect(within(banner).getAllByRole('link')).toHaveLength(1);
    expect(within(banner).queryByRole('button')).not.toBeInTheDocument();
    await waitFor(() => expect(title).toHaveFocus());
  });

  it('Empire wins by capturing the base: «Победа Империи» + capture reason', () => {
    renderBanner(makeCoreOutcomeView('empire', 'rebelBaseCaptured'));
    const banner = screen.getByTestId('game-over-banner');
    expect(banner).toHaveAttribute('data-winner', 'empire');
    expect(banner).toHaveAttribute('data-reason', 'rebelBaseCaptured');
    expect(screen.getByTestId('game-over-title')).toHaveTextContent('Победа Империи');
    expect(screen.getByTestId('game-over-reason')).toHaveTextContent('База Повстанцев захвачена');
  });

  it('focus moves to the heading only once (lastOutcomeSeen)', async () => {
    const view = makeCoreOutcomeView('rebels');
    const first = renderBanner(view);
    await waitFor(() => expect(screen.getByTestId('game-over-title')).toHaveFocus());
    expect(useCoreUiStore.getState().lastOutcomeSeen).toBe(view.version);
    first.unmount();
    renderBanner({ ...view });
    expect(screen.getByTestId('game-over-title')).not.toHaveFocus();
  });
});
