import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import {
  CS_CORELLIA,
  CS_SULLUST,
  CS_YAVIN,
  L_LEIA,
  makeCoreActivationView,
  U_RT_BASE,
  U_RT_SULLUST,
  U_SHIELD,
  U_TRANSPORT,
  U_XWING,
} from '../../test/coreFixtures';
import { useCoreUiStore } from '../model/coreUiStore';
import { MOVE_TITLE_ID } from './focus';
import { leaderLabel, systemLabel } from './labels';
import { CMD_PATH, commandsOf, ok, rejected, renderCore, resetCoreStores } from './test/harness';
import { TurnPanel } from './TurnPanel';

beforeEach(resetCoreStores);

const t = i18n.t;

describe('MovePanel (P1, plan-frontend §5.3 step 4, Q-FE-2)', () => {
  it('one fieldset per MOVE_PIECES source; checkboxes only for the listed units', () => {
    const view = makeCoreActivationView();
    renderCore(<TurnPanel />, view);
    const panel = screen.getByTestId('move-panel');
    expect(panel).toHaveAttribute('data-to', CS_CORELLIA);
    expect(within(panel).getByRole('heading', { level: 3 })).toHaveTextContent(
      t('rebellion.turn:move.title', {
        system: systemLabel(t, view, CS_CORELLIA),
        leader: leaderLabel(t, L_LEIA),
      }),
    );
    const sullust = screen.getByTestId(`move-source-${CS_SULLUST}`);
    const yavin = screen.getByTestId(`move-source-${CS_YAVIN}`);
    expect(sullust.tagName).toBe('FIELDSET');
    expect(sullust).toHaveAttribute('data-to', CS_CORELLIA);
    expect(screen.getByTestId(`move-piece-${U_TRANSPORT}`)).toBeInTheDocument();
    expect(screen.getByTestId(`move-piece-${U_RT_SULLUST}`)).toBeInTheDocument();
    expect(within(yavin).getByTestId(`move-piece-${U_XWING}`)).toBeInTheDocument();
    expect(within(yavin).getByTestId(`move-piece-${U_RT_BASE}`)).toBeInTheDocument();
    // The immobile shield generator is not a candidate (the server did not list it).
    expect(screen.queryByTestId(`move-piece-${U_SHIELD}`)).not.toBeInTheDocument();
    expect(screen.getByTestId(`move-submit-${CS_SULLUST}`)).toBeDisabled();
  });

  it('capacity preview «N/M» follows the server numbers; it is a hint, never a gate', async () => {
    const { user } = renderCore(<TurnPanel />, makeCoreActivationView());
    const capacity = screen.getByTestId(`move-capacity-${CS_YAVIN}`);
    expect(capacity).toHaveTextContent(
      t('rebellion.turn:move.capacity', { required: 0, capacity: 0 }),
    );
    await user.click(screen.getByTestId(`move-piece-${U_RT_BASE}`));
    expect(capacity).toHaveAttribute('data-fits', 'false');
    expect(capacity).toHaveTextContent(
      t('rebellion.turn:move.capacity', { required: 1, capacity: 0 }),
    );
    expect(screen.getByText(t('rebellion.turn:move.capacityOver'))).toBeInTheDocument();
    // Still submittable: the server decides insufficientCapacity.
    expect(screen.getByTestId(`move-submit-${CS_YAVIN}`)).toBeEnabled();

    await user.click(screen.getByTestId(`move-select-all-${CS_SULLUST}`));
    const sullust = screen.getByTestId(`move-capacity-${CS_SULLUST}`);
    expect(sullust).toHaveAttribute('data-required', '1');
    expect(sullust).toHaveAttribute('data-capacity', '4');
    expect(sullust).toHaveAttribute('data-fits', 'true');
  });

  it('submit sends the whole checked set as one MOVE_PIECES; success clears the source and focuses the heading', async () => {
    const view = makeCoreActivationView();
    const after = makeCoreActivationView({
      version: view.version + 1,
      legalActions: view.legalActions.filter(
        (a) => a.type !== 'MOVE_PIECES' || a.fromSystemId !== CS_SULLUST,
      ),
    });
    const { user, api } = renderCore(<TurnPanel />, view, { [CMD_PATH]: ok(after) });
    await user.click(screen.getByTestId(`move-select-all-${CS_SULLUST}`));
    const submit = screen.getByTestId(`move-submit-${CS_SULLUST}`);
    expect(submit).toHaveTextContent(
      t('rebellion.turn:move.submit', { count: 2, system: systemLabel(t, view, CS_CORELLIA) }),
    );
    await user.click(submit);
    await waitFor(() =>
      expect(commandsOf(api.requests)).toEqual([
        {
          type: 'MOVE_PIECES',
          pieceIds: [U_TRANSPORT, U_RT_SULLUST],
          fromSystemId: CS_SULLUST,
          toSystemId: CS_CORELLIA,
        },
      ]),
    );
    await waitFor(() =>
      expect(screen.queryByTestId(`move-source-${CS_SULLUST}`)).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById(MOVE_TITLE_ID)),
    );
    expect(useCoreUiStore.getState().moveDraft[CS_SULLUST]).toBeUndefined();
  });

  it('422 insufficientCapacity → move-error-<from> with the text; the draft is kept', async () => {
    const { user } = renderCore(<TurnPanel />, makeCoreActivationView(), {
      [CMD_PATH]: rejected('errors.insufficientCapacity'),
    });
    await user.click(screen.getByTestId(`move-piece-${U_RT_BASE}`));
    await user.click(screen.getByTestId(`move-submit-${CS_YAVIN}`));
    const error = await screen.findByTestId(`move-error-${CS_YAVIN}`);
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent(t('rebellion.errors:insufficientCapacity'));
    expect(useCoreUiStore.getState().moveDraft[CS_YAVIN]).toEqual([U_RT_BASE]);
    expect(screen.getByTestId(`move-piece-${U_RT_BASE}`)).toBeChecked();
    expect(screen.queryByTestId(`move-error-${CS_SULLUST}`)).not.toBeInTheDocument();
  });

  it('no sources → neutral note; the panel still shows the activation', () => {
    renderCore(
      <TurnPanel />,
      makeCoreActivationView({ legalActions: [{ type: 'FINISH_ACTIVATION' }] }),
    );
    expect(screen.getByTestId('move-none')).toHaveTextContent(t('rebellion.turn:move.none'));
    expect(screen.queryByRole('group')).toBeNull();
  });
});
