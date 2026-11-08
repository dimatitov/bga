import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useFeedbackStore } from '@/shared/feedback';
import { i18n } from '@/shared/i18n';
import { L_DODONNA, L_LEIA, L_MOTHMA, L_RIEEKAN, makeCoreView } from '../../test/coreFixtures';
import { useCoreUiStore } from '../model/coreUiStore';
import { leaderLabel } from './labels';
import { renderCore, resetCoreStores } from './test/harness';
import { TurnPanel } from './TurnPanel';

beforeEach(resetCoreStores);

describe('LeaderPool (P1, plan-frontend §5.3 step 1)', () => {
  it('radiogroup of the own pool: one Tab stop, arrows arm the next available leader, aria-checked', async () => {
    const { user } = renderCore(<TurnPanel />, makeCoreView());
    const pool = screen.getByRole('radiogroup', { name: i18n.t('rebellion.turn:pool.label') });
    expect(pool).toHaveAttribute('data-testid', 'leader-pool');
    const radios = within(pool).getAllByRole('radio');
    // Own side only (rebels: Mon Mothma, Leia, Dodonna, Rieekan), view order.
    expect(radios.map((r) => r.getAttribute('data-testid'))).toEqual([
      `leader-${L_MOTHMA}`,
      `leader-${L_LEIA}`,
      `leader-${L_DODONNA}`,
      `leader-${L_RIEEKAN}`,
    ]);
    radios.forEach((r) => expect(r).toHaveAttribute('data-owner', 'rebels'));
    // Exactly one tab stop: the first AVAILABLE leader (Mon Mothma cannot activate).
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([
      screen.getByTestId(`leader-${L_LEIA}`),
    ]);
    expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'idle');

    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId(`leader-${L_LEIA}`));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByTestId(`leader-${L_DODONNA}`));
    expect(screen.getByTestId(`leader-${L_DODONNA}`)).toHaveAttribute('aria-checked', 'true');
    expect(useCoreUiStore.getState().armedLeaderId).toBe(L_DODONNA);
    expect(screen.getByTestId('turn-panel')).toHaveAttribute('data-state', 'armed');
    // Wraps and skips the unavailable leader.
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(document.activeElement).toBe(screen.getByTestId(`leader-${L_LEIA}`));
    expect(useFeedbackStore.getState().live?.text).toBe(
      i18n.t('rebellion.turn:pool.armed', { leader: leaderLabel(i18n.t, L_LEIA), count: 6 }),
    );
  });

  it('a leader that cannot activate is aria-disabled with the reason and is not armed by click', async () => {
    const { user } = renderCore(<TurnPanel />, makeCoreView());
    const mothma = screen.getByTestId(`leader-${L_MOTHMA}`);
    expect(mothma).toHaveAttribute('aria-disabled', 'true');
    expect(mothma).toHaveAttribute('data-available', 'false');
    expect(mothma).toHaveAccessibleDescription(i18n.t('rebellion.turn:pool.unavailable'));
    expect(mothma).not.toHaveAttribute('draggable', 'true');
    await user.click(mothma);
    expect(useCoreUiStore.getState().armedLeaderId).toBeNull();
    expect(mothma).toHaveAttribute('aria-checked', 'false');
  });

  it('click arms, a second click and Esc disarm', async () => {
    const { user } = renderCore(<TurnPanel />, makeCoreView());
    const leia = screen.getByTestId(`leader-${L_LEIA}`);
    await user.click(leia);
    expect(leia).toHaveAttribute('aria-checked', 'true');
    expect(leia).toHaveAttribute('draggable', 'true');
    await user.click(leia);
    expect(leia).toHaveAttribute('aria-checked', 'false');
    await user.click(leia);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(useCoreUiStore.getState().armedLeaderId).toBeNull());
    expect(useFeedbackStore.getState().live?.text).toBe(i18n.t('rebellion.turn:pool.disarmed'));
  });

  it('Space and Enter on the focused leader arm it exactly once (D-3: no double toggle)', async () => {
    const { user } = renderCore(<TurnPanel />, makeCoreView());
    const leia = screen.getByTestId(`leader-${L_LEIA}`);
    await user.tab();
    expect(document.activeElement).toBe(leia);
    await user.keyboard(' ');
    expect(leia).toHaveAttribute('aria-checked', 'true');
    expect(useCoreUiStore.getState().armedLeaderId).toBe(L_LEIA);
    await user.keyboard(' ');
    expect(useCoreUiStore.getState().armedLeaderId).toBeNull();
    await user.keyboard('{Enter}');
    expect(leia).toHaveAttribute('aria-checked', 'true');
    expect(useCoreUiStore.getState().armedLeaderId).toBe(L_LEIA);
    await user.keyboard('{Enter}');
    expect(useCoreUiStore.getState().armedLeaderId).toBeNull();
  });

  it('without ACTIVATE_SYSTEM (Q-40) the whole pool is unavailable and only passing is offered', () => {
    renderCore(<TurnPanel />, makeCoreView({ legalActions: [{ type: 'PASS' }] }));
    const pool = screen.getByTestId('leader-pool');
    expect(pool).toHaveAttribute('aria-disabled', 'true');
    within(pool)
      .getAllByRole('radio')
      .forEach((r) => {
        expect(r).toHaveAttribute('aria-disabled', 'true');
        expect(r.tabIndex).toBe(-1);
      });
    expect(screen.getByTestId('leader-pool-no-leaders')).toHaveTextContent(
      i18n.t('rebellion.turn:panel.noLeaders'),
    );
    expect(pool).toHaveAccessibleDescription(i18n.t('rebellion.turn:panel.noLeaders'));
  });

  it('an armed leader shows the picker; the system picker is absent before', async () => {
    const { user } = renderCore(<TurnPanel />, makeCoreView());
    expect(screen.queryByTestId('activation-system-select')).not.toBeInTheDocument();
    await user.click(screen.getByTestId(`leader-${L_LEIA}`));
    expect(screen.getByTestId('activation-system-select')).toBeInTheDocument();
    expect(screen.getByTestId('activation-confirm')).toBeDisabled();
  });
});
