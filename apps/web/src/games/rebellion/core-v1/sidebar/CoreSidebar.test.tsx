import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useFeedbackStore } from '@/shared/feedback';
import { useSelectionStore } from '../../board/model/selectionStore';
import { CS_CORELLIA, CS_SULLUST, L_LEIA, makeCoreView } from '../../test/coreFixtures';
import {
  aiActivationTask,
  initialRebelsTasks,
  makePhysicalRebelsView,
  refreshTaskRebels,
} from '../../test/tableFixtures';
import { useCoreUiStore } from '../model/coreUiStore';
import { LOCATION_REGISTER_SELECT_ID, PX_TITLE_ID, TURN_TITLE_ID } from '../panels/focus';
import { CMD_PATH, commandsOf, ok, renderCore, resetCoreStores } from '../panels/test/harness';
import { CoreSidebar } from './CoreSidebar';

beforeEach(resetCoreStores);

describe('CoreSidebar rail (SWR-009 C2)', () => {
  it('order: turn panel → turn keys → inspector → tabs; aside named', () => {
    renderCore(<CoreSidebar log={<p>log</p>} gameInfo={<p>info</p>} />, makeCoreView());
    const aside = screen.getByTestId('core-sidebar');
    expect(aside.tagName).toBe('ASIDE');
    expect(aside).toHaveAccessibleName(/\S/);
    const order = [
      screen.getByTestId('turn-panel'),
      screen.getByTestId('turn-controls'),
      screen.getByTestId('core-context-panel'),
      screen.getByTestId('sidebar-tab-log'),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it('fix 1: data-manifest-open follows the inspector rule (request matches the selection, no armed leader)', () => {
    renderCore(<CoreSidebar />, makeCoreView());
    const aside = screen.getByTestId('core-sidebar');
    expect(aside).toHaveAttribute('data-manifest-open', 'false');
    act(() => {
      useSelectionStore.getState().selectSystem(CS_CORELLIA);
      useCoreUiStore.getState().openManifest({ kind: 'system', systemId: CS_CORELLIA });
    });
    expect(aside).toHaveAttribute('data-manifest-open', 'true');
    // Another selection → the inspector shows the context panel again.
    act(() => useSelectionStore.getState().selectSystem(CS_SULLUST));
    expect(aside).toHaveAttribute('data-manifest-open', 'false');
    act(() => useSelectionStore.getState().selectSystem(CS_CORELLIA));
    expect(aside).toHaveAttribute('data-manifest-open', 'true');
    // QD-5: an armed leader turns the inspector back into the system panel.
    act(() => useCoreUiStore.getState().arm(L_LEIA));
    expect(aside).toHaveAttribute('data-manifest-open', 'false');
  });
});

describe('CoreSidebar — SWR-010 FE-B: console mode and the Cards tab (plan-frontend §2.2)', () => {
  it('tabs Log · Cards · Objects · Game; the Cards panel mounts the Card Hand', async () => {
    const { user } = renderCore(<CoreSidebar />, makeCoreView());
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('data-testid'))).toEqual([
      'sidebar-tab-log',
      'sidebar-tab-cards',
      'sidebar-tab-objects',
      'sidebar-tab-game',
    ]);
    expect(screen.getByTestId('sidebar-tab-cards')).toHaveTextContent('Карты');
    await user.click(screen.getByTestId('sidebar-tab-cards'));
    const panel = document.getElementById('sidebar-panel-cards')!;
    expect(panel).toBeVisible();
    // Legacy game (cards: null) → «not tracked».
    expect(within(panel).getByTestId('card-hand')).toHaveAttribute('data-tracked', 'false');
  });

  it('turn mode: TurnPanel + TurnControls; physical mode: Physical Execution + «Done on the table»', () => {
    const { unmount } = renderCore(<CoreSidebar />, makeCoreView());
    expect(screen.getByTestId('core-sidebar')).toHaveAttribute('data-console-mode', 'turn');
    expect(screen.getByTestId('turn-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('physical-execution')).toBeNull();
    unmount();
    resetCoreStores();

    renderCore(<CoreSidebar />, makePhysicalRebelsView());
    expect(screen.getByTestId('core-sidebar')).toHaveAttribute('data-console-mode', 'physical');
    expect(screen.getByTestId('physical-execution')).toBeInTheDocument();
    expect(screen.queryByTestId('turn-panel')).toBeNull();
    expect(screen.queryByTestId('turn-controls')).toBeNull();
    expect(screen.getByTestId('table-task-confirm')).toBeInTheDocument();
    // The inspector stays.
    expect(screen.getByTestId('core-context-panel')).toBeInTheDocument();
    // The first render (page load / reload) does not move the focus.
    expect(document.activeElement).toBe(document.body);
  });

  it('turn → physical from the view (the pass started a Refresh): focus on the PX heading + «Задача стола»', async () => {
    const view = makePhysicalRebelsView(
      { unregistered: false, tasks: [] },
      { legalActions: [{ type: 'PASS' }] },
    );
    const after = makePhysicalRebelsView(
      { unregistered: false, tasks: [refreshTaskRebels(2)] },
      { version: view.version + 1 },
    );
    const { user, api } = renderCore(<CoreSidebar />, view, { [CMD_PATH]: ok(after) });
    expect(screen.getByTestId('core-sidebar')).toHaveAttribute('data-console-mode', 'turn');
    await user.click(screen.getByTestId('pass-turn'));
    await waitFor(() =>
      expect(screen.getByTestId('core-sidebar')).toHaveAttribute('data-console-mode', 'physical'),
    );
    expect(commandsOf(api.requests)).toEqual([{ type: 'PASS' }]);
    await waitFor(() => expect(document.activeElement?.id).toBe(PX_TITLE_ID));
    expect(screen.getByTestId('physical-execution')).toHaveAttribute('data-head-kind', 'refresh');
  });

  it('physical → turn when the last task is confirmed: focus on the turn heading', async () => {
    const view = makePhysicalRebelsView({ unregistered: false, tasks: [aiActivationTask()] });
    const after = makePhysicalRebelsView(
      { unregistered: false, tasks: [] },
      { version: view.version + 1 },
    );
    const { user } = renderCore(<CoreSidebar />, view, { [CMD_PATH]: ok(after) });
    await user.click(screen.getByTestId('table-task-confirm'));
    await waitFor(() => expect(screen.getByTestId('turn-panel')).toBeInTheDocument());
    expect(screen.getByTestId('core-sidebar')).toHaveAttribute('data-console-mode', 'turn');
    await waitFor(() => expect(document.activeElement?.id).toBe(TURN_TITLE_ID));
    expect(useFeedbackStore.getState().live?.text).toContain('Стол синхронизирован.');
  });

  it('«Register the base card» in the Card Hand focuses the system select of the registration form', async () => {
    const { user } = renderCore(
      <CoreSidebar />,
      makePhysicalRebelsView({ tasks: initialRebelsTasks().slice(1) }),
    );
    await user.click(screen.getByTestId('sidebar-tab-cards'));
    await user.click(await screen.findByTestId('card-hand-register'));
    await waitFor(() => expect(document.activeElement?.id).toBe(LOCATION_REGISTER_SELECT_ID));
  });

  it('… while the initial setup is still the head, it focuses the Physical Execution heading', async () => {
    const { user } = renderCore(<CoreSidebar />, makePhysicalRebelsView());
    await user.click(screen.getByTestId('sidebar-tab-cards'));
    await user.click(await screen.findByTestId('card-hand-register'));
    await waitFor(() => expect(document.activeElement?.id).toBe(PX_TITLE_ID));
  });
});
