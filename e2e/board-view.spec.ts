// Scenario 3 — the table on mock data: TC-E2E-06 (AC-4, AC-10); not-found: TC-E2E-32 (old URL; see also
// catalog.spec TC-GP-17 and game-page.spec TC-HOST-08).
// SWR-003: sessions via `POST /api/sessions`, table at `/sessions/:id` (test-cases.md §8.1).
import { expect, test } from '@playwright/test';
import { createSession } from './support/api';
import { dbg, openSession, openSidebarTab } from './support/board';
import { T } from './support/testids';

test('TC-E2E-06: table renders the mock scenario from the server PlayerView', async ({
  page,
  request,
}) => {
  const { sessionId, view } = await createSession(request);
  await openSession(page, sessionId);

  // ≥ 8 systems, each rendered on the canvas and mirrored in the accessible list.
  expect(view.systems.length).toBeGreaterThanOrEqual(8);
  for (const s of view.systems) {
    expect(s.adjacentSystemIds.length, `system ${s.id} has neighbours`).toBeGreaterThan(0);
    await dbg.systemPos(page, s.id); // throws if not rendered
    await expect(page.getByTestId(T.systemItem(s.id))).toHaveCount(1);
  }

  // Units and tokens of both sides; every piece is on the canvas and in the list with its system.
  for (const owner of ['empire', 'rebels'] as const) {
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

  // Header: round and phase; context panel; event log with GAME_CREATED; prototype labelling.
  await expect(page.getByTestId(T.roundIndicator)).toContainText('1');
  await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', 'assignment');
  await expect(page.getByTestId(T.contextPanel)).toBeVisible();
  await openSidebarTab(page, 'log');
  await expect(page.getByTestId(T.eventLog)).toBeVisible();
  await expect(page.getByTestId(T.eventLogItem)).toHaveCount(1);
  await expect(page.getByTestId(T.eventLogItem).first()).toHaveAttribute('data-seq', '1');
  // SWR-004 (plan-frontend §5.4): the table `mock-badge` is replaced by `prototype-badge` (status from the server).
  const badge = page.getByTestId(T.prototypeBadge);
  await expect(badge).toHaveCount(1);
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-status', 'prototype');
  await expect(badge).not.toBeEmpty();
  await expect(page.getByTestId(T.advancePhase)).toBeVisible();
  // NOTE: adjacency lines are canvas-only (no hook) — verified by screenshot 04 and TC-MAN-03.
});

test('TC-E2E-32 (SWR-003: old SWR-002 URL): /games/<real session id> is "game not found", not the table', async ({
  page,
  request,
}) => {
  // Spec Assumptions: SWR-002 URLs `/games/<uuid>` are not supported — the id is read as an unknown game id.
  const { sessionId } = await createSession(request);
  await page.goto(`/games/${sessionId}`);
  const nf = page.getByTestId(T.gameNotFound);
  await expect(nf).toBeVisible();
  await expect(nf.getByRole('link').or(nf.getByRole('button')).first()).toBeVisible();
  await expect(page.getByTestId(T.gameTable)).toHaveCount(0);
});
