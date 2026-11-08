import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { mockFetch, renderWithProviders } from '@/shared/test';
import { useSelectionStore } from '../board/model/selectionStore';
import {
  CORE_SESSION_ID,
  CS_CORELLIA,
  L_LEIA,
  makeCoreSession,
  makeCoreView,
} from '../test/coreFixtures';
import { useCoreUiStore } from './model/coreUiStore';
import { TURN_TITLE_ID } from './panels/focus';
import { resetCoreStores } from './panels/test/harness';

beforeEach(resetCoreStores);

const t = i18n.t;

/** Real app routes: `/sessions/:id` → SessionHost → Rebellion TableScreen → CoreTable. */
function renderTable() {
  mockFetch({
    [`GET /api/sessions/${CORE_SESSION_ID}`]: {
      status: 200,
      body: makeCoreSession(makeCoreView()),
    },
  });
  return renderWithProviders({ path: `/sessions/${CORE_SESSION_ID}` });
}

describe('CoreTable composition (P1, plan-frontend §3.4)', () => {
  it('top bar with turn controls, map container, sidebar with turn panel / context / tabs', async () => {
    renderTable();
    const table = await screen.findByTestId('game-table');
    expect(table).toHaveAttribute('data-rules-engine', 'core-v1');
    expect(within(table).getByTestId('turn-controls')).toBeInTheDocument();
    expect(within(table).getByTestId('pass-turn')).toBeEnabled();
    expect(within(table).getByTestId('board-canvas')).toHaveAttribute('role', 'region');
    expect(within(table).getByTestId('turn-panel')).toHaveAttribute('data-state', 'idle');
    expect(within(table).getByTestId('core-context-panel')).toBeInTheDocument();
    // The accessible list is in the DOM even while its tab is hidden.
    expect(within(table).getByTestId('board-list')).toBeInTheDocument();
    expect(within(table).getByTestId('session-back-to-game')).toHaveAttribute(
      'href',
      '/games/star-wars-rebellion',
    );
  });

  it('skip links focus the turn panel heading and the object list', async () => {
    const { user } = renderTable();
    await screen.findByTestId('game-table');
    await user.click(screen.getByTestId('skip-to-turn'));
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById(TURN_TITLE_ID)),
    );
    expect(screen.getByTestId('skip-to-turn')).toHaveTextContent(t('rebellion.turn:skip.toTurn'));
    await user.click(screen.getByTestId('skip-to-list'));
    await waitFor(() => expect(useSelectionStore.getState().sidebarTab).toBe('objects'));
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute(
        'data-testid',
        expect.stringMatching(/^system-item-/),
      ),
    );
  });

  it('Esc first drops the armed leader (selection kept), then clears the selection', async () => {
    const { user } = renderTable();
    await screen.findByTestId('game-table');
    await user.click(screen.getByTestId(`leader-${L_LEIA}`));
    useSelectionStore.getState().selectSystem(CS_CORELLIA);
    await user.keyboard('{Escape}');
    expect(useCoreUiStore.getState().armedLeaderId).toBeNull();
    expect(useSelectionStore.getState().selection).toEqual({
      kind: 'system',
      systemId: CS_CORELLIA,
    });
    await user.keyboard('{Escape}');
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'none' });
  });
});
