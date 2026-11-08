// Scenario 7 — mock phase: TC-E2E-24 (AC-4, AC-7, AC-10).
import { expect, test, type Page } from '@playwright/test';
import { createGame, pickMove } from './support/api';
import {
  dbg,
  openGame,
  openSidebarTab,
  version,
  waitForCommand,
  waitForTable,
} from './support/board';
import { T } from './support/testids';

async function advance(page: Page, expectedPhase: string) {
  const cmd = waitForCommand(page);
  await page.getByTestId(T.advancePhase).click();
  const res = await cmd;
  expect(res.status()).toBe(200);
  expect(res.request().postDataJSON()).toMatchObject({ command: { type: 'ADVANCE_PHASE' } });
  await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', expectedPhase);
}

test('TC-E2E-24: "End phase (mock)" cycles phases, increments the round and persists', async ({
  page,
  request,
}) => {
  const { gameId, view } = await createGame(request);
  await openGame(page, gameId);

  // The mock button is explicitly labelled as temporary logic (mock badge present on the table).
  await expect(page.getByTestId(T.mockBadge).first()).toBeVisible();
  await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', 'assignment');
  await expect(page.getByTestId(T.roundIndicator)).toContainText('1');

  await advance(page, 'command');
  await advance(page, 'refresh');
  await advance(page, 'assignment');
  await expect(page.getByTestId(T.roundIndicator)).toContainText('2');
  expect(await version(page)).toBe(view.version + 3);
  await openSidebarTab(page, 'log');
  await expect(page.getByTestId(T.eventLogItem)).toHaveCount(view.log.length + 3);

  await page.reload();
  await waitForTable(page, gameId);
  await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', 'assignment');
  await expect(page.getByTestId(T.roundIndicator)).toContainText('2');
});

test('TC-E2E-24 (move in any phase): a move is offered and accepted in the "command" phase', async ({
  page,
  request,
}) => {
  const { gameId, view } = await createGame(request);
  const move = pickMove(view);
  await openGame(page, gameId);
  await advance(page, 'command');

  const pos = await dbg.piecePos(page, move.pieceId);
  await page.mouse.click(pos.x, pos.y);
  const cmd = waitForCommand(page);
  await page.getByTestId(T.actionMove(move.pieceId, move.toSystemId)).click();
  expect((await cmd).status()).toBe(200);
  await expect(page.getByTestId(T.pieceItem(move.pieceId))).toHaveAttribute(
    'data-system-id',
    move.toSystemId,
  );
});
