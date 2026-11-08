import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { useSelectionStore } from '../../board/model/selectionStore';
import {
  CS_ALDERAAN,
  CS_CORELLIA,
  CS_CORUSCANT,
  CS_HOTH,
  CS_SULLUST,
  CS_YAVIN,
  L_LEIA,
  L_VADER,
  makeCoreActivationView,
  makeCoreEmpireView,
  makeCoreView,
  U_RT_BASE,
  U_SD,
} from '../../test/coreFixtures';
import { useCoreUiStore } from '../model/coreUiStore';
import { CMD_PATH, commandsOf, ok, renderCore, resetCoreStores } from '../panels/test/harness';
import { CoreBoardList } from './CoreBoardList';

beforeEach(resetCoreStores);

const t = i18n.t;

describe('CoreBoardList (P1, plan-frontend §5.3 step 3, §9)', () => {
  it('systems carry region / remote / contested / activated markers from the view', () => {
    renderCore(<CoreBoardList />, makeCoreActivationView({ contestedSystemIds: [CS_CORUSCANT] }));
    const coruscant = screen.getByTestId(`system-item-${CS_CORUSCANT}`);
    expect(coruscant).toHaveAttribute('role', 'option');
    expect(coruscant).toHaveAttribute('data-region', 'r1');
    expect(coruscant).toHaveAttribute('data-contested', 'true');
    expect(coruscant).toHaveTextContent(t('rebellion.turn:list.contested').trim());
    expect(screen.getByTestId(`system-item-${CS_HOTH}`)).toHaveAttribute('data-remote', 'true');
    expect(screen.getByTestId(`system-item-${CS_SULLUST}`)).toHaveAttribute('data-remote', 'false');
    expect(screen.getByTestId(`system-item-${CS_CORELLIA}`)).toHaveAttribute(
      'data-activated',
      'true',
    );
    expect(screen.getByTestId(`system-item-${CS_ALDERAAN}`)).toHaveAttribute(
      'data-activated',
      'false',
    );
    // Leaders on the map and in the pools.
    expect(screen.getByTestId(`leader-item-${L_LEIA}`)).toHaveAttribute(
      'data-location',
      CS_CORELLIA,
    );
    expect(screen.getByTestId(`leader-item-${L_VADER}`)).toHaveAttribute('data-location', 'pool');
    expect(screen.getByTestId(`piece-item-${U_SD}`)).toHaveAttribute(
      'data-system-id',
      CS_CORUSCANT,
    );
    // Rebels: the base is known → no hidden zone.
    expect(screen.queryByTestId('hidden-base-zone')).not.toBeInTheDocument();
  });

  it('armed leader: targets are data-activatable; selecting one offers system-item-<id>-activate', async () => {
    const { user, api } = renderCore(<CoreBoardList />, makeCoreView(), {
      [CMD_PATH]: ok(makeCoreActivationView()),
    });
    expect(screen.getByTestId(`system-item-${CS_CORELLIA}`)).toHaveAttribute(
      'data-activatable',
      'false',
    );
    useCoreUiStore.getState().arm(L_LEIA);
    await waitFor(() =>
      expect(screen.getByTestId(`system-item-${CS_CORELLIA}`)).toHaveAttribute(
        'data-activatable',
        'true',
      ),
    );
    expect(screen.getByTestId(`system-item-${CS_CORELLIA}`)).toHaveTextContent(
      t('rebellion.turn:activate.inList').trim(),
    );
    expect(screen.queryByTestId(`system-item-${CS_CORELLIA}-activate`)).not.toBeInTheDocument();
    await user.click(screen.getByTestId(`system-item-${CS_CORELLIA}`));
    await user.click(await screen.findByTestId(`system-item-${CS_CORELLIA}-activate`));
    await waitFor(() =>
      expect(commandsOf(api.requests)).toEqual([
        { type: 'ACTIVATE_SYSTEM', leaderId: L_LEIA, systemId: CS_CORELLIA },
      ]),
    );
  });

  it('keyboard: one Tab stop, arrows move, Enter selects', async () => {
    const { user } = renderCore(<CoreBoardList />, makeCoreView());
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId(`system-item-${CS_CORUSCANT}`));
    await user.keyboard('{ArrowDown}{Enter}');
    // The first option after Coruscant is its first unit.
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'piece', pieceId: U_SD });
    await user.keyboard('{Home}{Enter}');
    expect(useSelectionStore.getState().selection).toEqual({
      kind: 'system',
      systemId: CS_CORUSCANT,
    });
  });

  it('Empire before the reveal: the hidden zone comes only from the view (no base system marked)', async () => {
    const { user } = renderCore(<CoreBoardList />, makeCoreEmpireView());
    const zone = screen.getByTestId('hidden-base-zone');
    // Rebel trooper, X-wing and shield generator of the base system were sent with location rebelBase.
    expect(zone).toHaveAttribute('data-count', '3');
    expect(zone).toHaveTextContent(t('rebellion.turn:list.zone', { count: 3 }));
    expect(screen.getByTestId(`piece-item-${U_RT_BASE}`)).not.toHaveAttribute('data-system-id');
    // Yavin itself is listed as an ordinary system with nothing in it.
    expect(screen.getByTestId(`system-item-${CS_YAVIN}`)).toHaveTextContent('(0)');
    expect(
      screen.queryByTestId(`piece-item-${U_RT_BASE}`)?.closest('[role="group"]'),
    ).toHaveAttribute('aria-label', t('rebellion.turn:zone.title'));
    await user.click(zone);
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'zone' });
  });
});
