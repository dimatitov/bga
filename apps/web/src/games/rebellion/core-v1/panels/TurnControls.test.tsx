import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useFeedbackStore } from '@/shared/feedback';
import { i18n } from '@/shared/i18n';
import { makeCoreActivationView, makeCoreOutcomeView, makeCoreView } from '../../test/coreFixtures';
import { TURN_TITLE_ID } from './focus';
import { CMD_PATH, commandsOf, ok, rejected, renderCore, resetCoreStores } from './test/harness';
import { TurnControls } from './TurnControls';
import { TurnPanel } from './TurnPanel';
import { OutcomeBanner } from '../top-bar/OutcomeBanner';
import { responseEndedGame } from './useTurnCommands';

beforeEach(resetCoreStores);

const t = i18n.t;

function Both() {
  return (
    <>
      <TurnControls />
      <TurnPanel />
    </>
  );
}

describe('TurnControls (P1, plan-frontend §5.2, §9, Q-FE-3, R-6)', () => {
  it('enabled strictly by legalActions: idle → Pass only, activation → Finish only, waiting → none', () => {
    const { unmount } = renderCore(<TurnControls />, makeCoreView());
    expect(screen.getByTestId('pass-turn')).toBeEnabled();
    expect(screen.getByTestId('finish-activation')).toBeDisabled();
    unmount();

    const second = renderCore(<TurnControls />, makeCoreActivationView());
    expect(screen.getByTestId('pass-turn')).toBeDisabled();
    expect(screen.getByTestId('finish-activation')).toBeEnabled();
    second.unmount();

    renderCore(<TurnControls />, makeCoreView({ activeSide: 'empire', legalActions: [] }));
    expect(screen.getByTestId('pass-turn')).toBeDisabled();
    expect(screen.getByTestId('finish-activation')).toBeDisabled();
  });

  it('game over → no turn controls at all', () => {
    renderCore(<TurnControls />, makeCoreOutcomeView());
    expect(screen.queryByTestId('turn-controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pass-turn')).not.toBeInTheDocument();
  });

  it('Pass with leaders left → dialog with focus on Cancel; Esc closes without a command', async () => {
    const { user, api } = renderCore(<TurnControls />, makeCoreView());
    await user.click(screen.getByTestId('pass-turn'));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(t('rebellion.turn:pass.confirmText', { count: 3 })),
    ).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('pass-confirm-cancel')),
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByTestId('pass-turn'));
    await user.click(await screen.findByTestId('pass-confirm-cancel'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(commandsOf(api.requests)).toEqual([]);
  });

  it('confirming sends PASS, announces it and focuses the turn panel heading', async () => {
    const after = makeCoreView({ version: 9, round: 2, markers: { time: 2, reputation: 14 } });
    const { user, api } = renderCore(<Both />, makeCoreView(), { [CMD_PATH]: ok(after) });
    await user.click(screen.getByTestId('pass-turn'));
    await user.click(await screen.findByTestId('pass-confirm-ok'));
    await waitFor(() => expect(commandsOf(api.requests)).toEqual([{ type: 'PASS' }]));
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById(TURN_TITLE_ID)),
    );
    expect(useFeedbackStore.getState().live?.text).toContain(t('rebellion.turn:pass.done'));
  });

  it('a Pass that ends the game leaves the focus on the outcome banner heading (D-2)', async () => {
    const over = makeCoreOutcomeView();
    const gameOver = {
      seq: 3,
      at: '2026-11-08T10:00:00.000Z',
      type: 'GAME_OVER',
      actor: 'system',
      payload: { winner: 'rebels', reason: 'timeReachedReputation' },
    };
    const { user, api } = renderCore(
      <>
        <OutcomeBanner backHref="/" />
        <Both />
      </>,
      makeCoreView({ legalActions: [{ type: 'PASS' }] }),
      { [CMD_PATH]: ok(over, [gameOver]) },
    );
    await user.click(screen.getByTestId('pass-turn'));
    await waitFor(() => expect(commandsOf(api.requests)).toEqual([{ type: 'PASS' }]));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('game-over-title')));
    // focusWhenReady polls for ~12 frames: the focus must still be on the banner afterwards.
    await new Promise((r) => setTimeout(r, 300));
    expect(document.activeElement).toBe(screen.getByTestId('game-over-title'));
  });

  it('responseEndedGame: GAME_OVER event or an outcome in the new view', () => {
    expect(responseEndedGame(makeCoreView(), [])).toBe(false);
    expect(responseEndedGame(null, [])).toBe(false);
    expect(responseEndedGame(makeCoreOutcomeView(), [])).toBe(true);
    expect(
      responseEndedGame(null, [
        {
          type: 'GAME_OVER',
          actor: 'system',
          payload: { winner: 'rebels', reason: 'timeReachedReputation' },
        } as Parameters<typeof responseEndedGame>[1][number],
      ]),
    ).toBe(true);
  });

  it('no leader can activate → Pass is sent at once (no dialog)', async () => {
    const { user, api } = renderCore(
      <TurnControls />,
      makeCoreView({ legalActions: [{ type: 'PASS' }] }),
      { [CMD_PATH]: ok(makeCoreView({ version: 3 })) },
    );
    await user.click(screen.getByTestId('pass-turn'));
    await waitFor(() => expect(commandsOf(api.requests)).toEqual([{ type: 'PASS' }]));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Finish activation sends FINISH_ACTIVATION; a rejection goes to the snackbar', async () => {
    const { user, api } = renderCore(<TurnControls />, makeCoreActivationView(), {
      [CMD_PATH]: rejected('errors.noActivation'),
    });
    await user.click(screen.getByTestId('finish-activation'));
    await waitFor(() => expect(commandsOf(api.requests)).toEqual([{ type: 'FINISH_ACTIVATION' }]));
    await waitFor(() =>
      expect(useFeedbackStore.getState().queue.at(-1)?.message).toBe(
        t('rebellion.errors:noActivation'),
      ),
    );
  });
});
