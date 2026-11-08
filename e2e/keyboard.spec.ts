// Keyboard path: TC-E2E-28 (AC-6, AC-7) — select a piece and move it without the mouse,
// via the accessible alternative list (board-list: role=listbox / role=option + aria-selected).
import { expect, test } from '@playwright/test';
import { createGame, pickMove } from './support/api';
import { dbg, keyboardFocus, openGame, version, waitForCommand } from './support/board';
import { T } from './support/testids';

test('TC-E2E-28: keyboard-only select + move with visible focus and aria-live feedback', async ({
  page,
  request,
}) => {
  const { gameId, view } = await createGame(request);
  const move = pickMove(view);
  await openGame(page, gameId);
  const v0 = await version(page);

  // 1) Tab to the "objects" sidebar tab and activate it.
  const tab = page.getByTestId(T.sidebarTab('objects'));
  await keyboardFocus(page, tab);
  await page.keyboard.press('Enter');
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId(T.boardList)).toHaveAttribute('role', 'listbox');

  // 2) Into the listbox, arrows to the piece option, Enter selects it.
  const option = page.getByTestId(T.pieceItem(move.pieceId));
  await expect(option).toHaveAttribute('role', 'option');
  await keyboardFocus(page, option);
  await page.keyboard.press('Enter');
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'piece', id: move.pieceId });

  // 3) Primary keyboard path (README): the "move here" button of the target system, rendered right below the
  //    listbox (`system-item-<toSystemId>-move`), then Enter.
  const action = page.getByTestId(T.systemItemMove(move.toSystemId));
  await keyboardFocus(page, action);
  const cmd = waitForCommand(page);
  await page.keyboard.press('Enter');
  expect((await cmd).status()).toBe(200);

  await expect(page.getByTestId(T.pieceItem(move.pieceId))).toHaveAttribute(
    'data-system-id',
    move.toSystemId,
  );
  await expect.poll(() => version(page)).toBe(v0 + 1);
  await expect(page.getByTestId(T.liveRegion)).not.toBeEmpty();
  // D-C-6: after success focus moves to the context panel heading (inside context-panel).
  await expect
    .poll(() =>
      page.getByTestId(T.contextPanel).evaluate((el) => el.contains(document.activeElement)),
    )
    .toBe(true);
});
