import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CS_SULLUST, makeCoreActivationView, makeCoreOutcomeView } from '../../test/coreFixtures';
import { OutcomeBanner } from '../top-bar/OutcomeBanner';
import * as focus from './focus';
import { CMD_PATH, commandsOf, ok, renderCore, resetCoreStores } from './test/harness';
import { TurnPanel } from './TurnPanel';

// Spy on the focus helper (real behaviour kept) to pin WHICH heading a command asks for: the race of review #4
// (the 0-ms tick finding the old move heading before the outcome view renders) is not reproducible in jsdom.
vi.mock('./focus', async (importOriginal) => {
  const actual = await importOriginal<typeof focus>();
  return { ...actual, focusWhenReady: vi.fn(actual.focusWhenReady) };
});

beforeEach(() => {
  resetCoreStores();
  vi.mocked(focus.focusWhenReady).mockClear();
});

const GAME_OVER = {
  seq: 3,
  at: '2026-11-08T10:00:00.000Z',
  type: 'GAME_OVER',
  actor: 'system',
  payload: { winner: 'empire', reason: 'rebelBaseCaptured' },
};

async function submitSullust(response: ReturnType<typeof ok>) {
  const view = makeCoreActivationView();
  const utils = renderCore(
    <>
      <OutcomeBanner backHref="/" />
      <TurnPanel />
    </>,
    view,
    { [CMD_PATH]: response },
  );
  await utils.user.click(screen.getByTestId(`move-select-all-${CS_SULLUST}`));
  await utils.user.click(screen.getByTestId(`move-submit-${CS_SULLUST}`));
  await waitFor(() => expect(commandsOf(utils.api.requests)).toHaveLength(1));
  return { ...utils, view };
}

describe('useTurnCommands focus after MOVE_PIECES (SWR-005 review #4)', () => {
  it('a move that ends the game does not ask for the move heading; focus stays on the banner', async () => {
    await submitSullust(
      ok(makeCoreOutcomeView('empire', 'rebelBaseCaptured', { version: 4 }), [GAME_OVER]),
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('game-over-title')));
    await new Promise((r) => setTimeout(r, 300));
    expect(document.activeElement).toBe(screen.getByTestId('game-over-title'));
    expect(focus.focusWhenReady).not.toHaveBeenCalledWith(focus.MOVE_TITLE_ID);
  });

  it('a regular move still focuses the move panel heading', async () => {
    const view = makeCoreActivationView();
    await submitSullust(ok(makeCoreActivationView({ version: view.version + 1 })));
    await waitFor(() => expect(focus.focusWhenReady).toHaveBeenCalledWith(focus.MOVE_TITLE_ID));
  });
});
