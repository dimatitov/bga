/**
 * SWR-010 FE-B (plan-frontend §3.2; TC-PX-02 at component level): the Location registration offers exactly the
 * server's eligible cards, asks for confirmation and sends `REGISTER_CARD { zoneId, definitionId }`.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { initialRebelsTasks, makePhysicalRebelsView } from '../../test/tableFixtures';
import { LOCATION_REGISTER_SELECT_ID } from '../panels/focus';
import { CMD_PATH, commandsOf, ok, renderCore, resetCoreStores } from '../panels/test/harness';
import { PhysicalExecutionPanel } from './PhysicalExecutionPanel';

beforeEach(resetCoreStores);

const registerHead = () => makePhysicalRebelsView({ tasks: initialRebelsTasks().slice(1) });

describe('LocationRegisterForm (AC-10, AC-21)', () => {
  it('TC-PX-02: options = only the eligible systems from the server, sorted by name, none preselected', async () => {
    renderCore(<PhysicalExecutionPanel />, registerHead());
    const select = await screen.findByTestId('location-register-select');
    expect(select.tagName).toBe('SELECT');
    expect(select.id).toBe(LOCATION_REGISTER_SELECT_ID);
    expect(select).toHaveValue('');
    const options = within(select)
      .getAllByRole('option')
      .filter((o) => (o as HTMLOptionElement).value !== '');
    // Server: yavin, hoth, dagobah → sorted by the Russian names: Дагоба, Хот, Явин.
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual([
      'probe-dagobah',
      'probe-hoth',
      'probe-yavin',
    ]);
    expect(options.map((o) => o.textContent)).toEqual(['Дагоба', 'Хот', 'Явин']);
    expect(screen.getByTestId('location-register-submit')).toBeDisabled();
    // Nothing tells which system the server proposed: no option is selected or marked.
    expect(options.every((o) => !(o as HTMLOptionElement).selected)).toBe(true);
  });

  it('choose → Register → dialog; Cancel sends nothing; Confirm sends REGISTER_CARD', async () => {
    const view = registerHead();
    const after = makePhysicalRebelsView(
      { unregistered: false, tasks: [] },
      { version: view.version + 1 },
    );
    const { user, api } = renderCore(<PhysicalExecutionPanel />, view, { [CMD_PATH]: ok(after) });
    await user.selectOptions(await screen.findByTestId('location-register-select'), 'probe-hoth');
    const submit = screen.getByTestId('location-register-submit');
    expect(submit).toBeEnabled();

    await user.click(submit);
    const dialog = await screen.findByTestId('location-register-dialog');
    expect(dialog).toHaveTextContent('Зарегистрировать Хот как карту базы? Изменить нельзя.');
    await user.click(within(dialog).getByTestId('location-register-cancel'));
    await waitFor(() => expect(screen.queryByTestId('location-register-dialog')).toBeNull());
    expect(commandsOf(api.requests)).toHaveLength(0);

    await user.click(submit);
    await user.click(await screen.findByTestId('location-register-confirm'));
    await waitFor(() => expect(commandsOf(api.requests)).toHaveLength(1));
    expect(commandsOf(api.requests)[0]).toEqual({
      type: 'REGISTER_CARD',
      zoneId: 'rebels-location',
      definitionId: 'probe-hoth',
    });
  });
});
