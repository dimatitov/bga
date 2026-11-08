import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useFeedbackStore } from '@/shared/feedback';
import { i18n } from '@/shared/i18n';
import {
  CS_CORELLIA,
  CS_CORUSCANT,
  CS_SULLUST,
  L_LEIA,
  makeCoreActivationView,
  makeCoreView,
} from '../../test/coreFixtures';
import { useCoreUiStore } from '../model/coreUiStore';
import { MOVE_TITLE_ID } from './focus';
import { leaderLabel, regionLabel, systemLabel } from './labels';
import { CMD_PATH, commandsOf, ok, rejected, renderCore, resetCoreStores } from './test/harness';
import { TurnPanel } from './TurnPanel';

beforeEach(resetCoreStores);

const t = i18n.t;

async function armLeia(user: ReturnType<typeof renderCore>['user']) {
  await user.click(screen.getByTestId(`leader-${L_LEIA}`));
  return within(screen.getByTestId('activation-system-select')).getByRole('combobox');
}

describe('ActivationPicker (P1, plan-frontend §5.3 step 2, Q-FE-5)', () => {
  it('options = the armed leader’s ACTIVATE_SYSTEM.systemIds, grouped by region', async () => {
    const view = makeCoreView({
      legalActions: [
        { type: 'ACTIVATE_SYSTEM', leaderIds: [L_LEIA], systemIds: [CS_SULLUST, CS_CORUSCANT] },
        { type: 'PASS' },
      ],
    });
    const { user } = renderCore(<TurnPanel />, view);
    const input = await armLeia(user);
    await user.click(input);
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual([
      systemLabel(t, view, CS_CORUSCANT),
      systemLabel(t, view, CS_SULLUST),
    ]);
    // Region group headers (r1 before r2, map order).
    expect(listbox).toHaveTextContent(regionLabel(t, view, 'r1'));
    expect(listbox).toHaveTextContent(regionLabel(t, view, 'r2'));
  });

  it('Enter in the field only picks the option; «Activate» sends ACTIVATE_SYSTEM and focuses the move panel', async () => {
    const view = makeCoreView();
    const { user, api } = renderCore(<TurnPanel />, view, {
      [CMD_PATH]: ok(makeCoreActivationView()),
    });
    const input = await armLeia(user);
    await user.click(input);
    await user.keyboard(systemLabel(t, view, CS_CORELLIA).slice(0, 4));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(input).toHaveValue(systemLabel(t, view, CS_CORELLIA));
    await user.keyboard('{Enter}');
    expect(commandsOf(api.requests)).toEqual([]);

    const confirm = screen.getByTestId('activation-confirm');
    expect(confirm).toHaveTextContent(
      t('rebellion.turn:activate.confirm', { system: systemLabel(t, view, CS_CORELLIA) }),
    );
    await user.click(confirm);
    await waitFor(() =>
      expect(commandsOf(api.requests)).toEqual([
        { type: 'ACTIVATE_SYSTEM', leaderId: L_LEIA, systemId: CS_CORELLIA },
      ]),
    );
    const title = await screen.findByTestId('move-panel');
    expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'activation');
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById(MOVE_TITLE_ID)),
    );
    expect(title).toContainElement(document.getElementById(MOVE_TITLE_ID));
    expect(useCoreUiStore.getState().armedLeaderId).toBeNull();
    expect(useFeedbackStore.getState().live?.text).toContain(
      t('rebellion.turn:activate.done', {
        leader: leaderLabel(t, L_LEIA),
        system: systemLabel(t, view, CS_CORELLIA),
      }),
    );
  });

  it('a 422 reason is shown inline (role=alert) and the leader stays armed', async () => {
    const view = makeCoreView();
    const { user } = renderCore(<TurnPanel />, view, {
      [CMD_PATH]: rejected('errors.leaderCannotActivate'),
    });
    const input = await armLeia(user);
    await user.click(input);
    await user.click(within(await screen.findByRole('listbox')).getAllByRole('option')[0]!);
    await user.click(screen.getByTestId('activation-confirm'));
    const alert = await screen.findByTestId('activation-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent(t('rebellion.errors:leaderCannotActivate'));
    expect(useCoreUiStore.getState().armedLeaderId).toBe(L_LEIA);
    expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'armed');
  });
});
