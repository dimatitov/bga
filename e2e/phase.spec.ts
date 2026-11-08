// Scenario 7 — mock phase: TC-E2E-24 (AC-4, AC-7, AC-10).
// SWR-003: sessions are created via `POST /api/sessions` and opened at `/sessions/:id`; expectations unchanged.
// SWR-005 (Q-1, TR-4): mock-rules regression on a SEEDED legacy row (frozen v2 «Empire vs AI hard, round 1,
// assignment»); the phase name of `command` is «Приказы» everywhere (Q-FE-8) — checked via data-phase here.
import { expect, test, type Page } from '@playwright/test';
import { getView, pickMove } from './support/api';
import {
  dbg,
  openLegacy,
  openSidebarTab,
  version,
  waitForCommand,
  waitForTable,
} from './support/board';
import { seedLegacyV2 } from './support/seed';
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
  const { sessionId } = await seedLegacyV2('empireAi');
  const view = await getView(request, sessionId);
  await openLegacy(page, sessionId);

  // The mock button is explicitly labelled as temporary logic (SWR-004: `prototype-badge` replaces `mock-badge`;
  // SWR-005: legacy variant «Старый прототип: тестовые правила»).
  await expect(page.getByTestId(T.prototypeBadge)).toBeVisible();
  await expect(page.getByTestId(T.prototypeBadge)).toHaveAttribute('data-status', 'prototype');
  await expect(page.getByTestId(T.prototypeBadge)).toHaveAttribute('data-variant', 'legacy');
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
  await waitForTable(page, sessionId);
  await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', 'assignment');
  await expect(page.getByTestId(T.roundIndicator)).toContainText('2');
});

test('TC-E2E-24 (move in any phase): a move is offered and accepted in the "command" phase', async ({
  page,
  request,
}) => {
  const { sessionId } = await seedLegacyV2('empireAi');
  const move = pickMove(await getView(request, sessionId));
  await openLegacy(page, sessionId);
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
