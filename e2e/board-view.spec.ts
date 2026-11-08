// Scenario 3 — the table on mock data: TC-E2E-06 (AC-4, AC-10); not-found game: TC-E2E-32 (AC-2).
import { expect, test } from '@playwright/test';
import { createGame } from './support/api';
import { dbg, openGame, openSidebarTab } from './support/board';
import { T } from './support/testids';

test('TC-E2E-06: table renders the mock scenario from the server PlayerView', async ({
  page,
  request,
}) => {
  const { gameId, view } = await createGame(request);
  await openGame(page, gameId);

  // ≥ 8 systems, each rendered on the canvas and mirrored in the accessible list.
  expect(view.systems.length).toBeGreaterThanOrEqual(8);
  for (const s of view.systems) {
    expect(s.adjacentSystemIds.length, `system ${s.id} has neighbours`).toBeGreaterThan(0);
    await dbg.systemPos(page, s.id); // throws if not rendered
    await expect(page.getByTestId(T.systemItem(s.id))).toHaveCount(1);
  }

  // Units and tokens of both sides; every piece is on the canvas and in the list with its system.
  for (const owner of ['empire', 'rebellion'] as const) {
    for (const kind of ['unit', 'token'] as const) {
      expect(
        view.pieces.some((p) => p.owner === owner && p.kind === kind),
        `${owner} ${kind} present in the scenario`,
      ).toBe(true);
    }
  }
  for (const p of view.pieces) {
    await dbg.piecePos(page, p.id);
    await expect(page.getByTestId(T.pieceItem(p.id))).toHaveAttribute('data-system-id', p.systemId);
  }

  await openSidebarTab(page, 'objects');
  await expect(page.getByTestId(T.boardList)).toBeVisible();
  await expect(page.getByTestId(T.boardList)).toHaveAttribute('role', 'listbox');

  // Header: round and phase; context panel; event log with GAME_CREATED; mock labelling.
  await expect(page.getByTestId(T.roundIndicator)).toContainText('1');
  await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', 'assignment');
  await expect(page.getByTestId(T.contextPanel)).toBeVisible();
  await openSidebarTab(page, 'log');
  await expect(page.getByTestId(T.eventLog)).toBeVisible();
  await expect(page.getByTestId(T.eventLogItem)).toHaveCount(1);
  await expect(page.getByTestId(T.eventLogItem).first()).toHaveAttribute('data-seq', '1');
  await expect(page.getByTestId(T.mockBadge).first()).toBeVisible();
  await expect(page.getByTestId(T.advancePhase)).toBeVisible();
  // NOTE: adjacency lines are canvas-only (no hook) — verified by screenshot 04 and TC-MAN-03.
});

test('TC-E2E-32: unknown game id shows a "not found" state with a way back', async ({ page }) => {
  await page.goto('/games/does-not-exist');
  const nf = page.getByTestId(T.gameNotFound);
  await expect(nf).toBeVisible();
  await expect(nf.getByRole('link').or(nf.getByRole('button')).first()).toBeVisible();
  await expect(page.getByTestId(T.gameTable)).toHaveCount(0);
});
