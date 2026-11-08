// Scenario 3 — the table: TC-E2E-06 (AC-4, AC-10); not-found: TC-E2E-32 (old URL; see also catalog.spec TC-GP-17 and
// game-page.spec TC-HOST-08). SWR-003: sessions via `POST /api/sessions`, table at `/sessions/:id`.
// SWR-005 (Q-1): rewritten on core-v1 — the table renders the real galaxy from the server PlayerView (32 systems,
// units of both sides, leaders); the mock table is covered by legacy.spec / move.spec / phase.spec on seeded rows.
import { expect, test } from '@playwright/test';
import { CORE_SYSTEM_COUNT, createSession, LEADERS, REBELS_VS_AI } from './support/api';
import { dbg, openCore, openSidebarTab } from './support/board';
import { T } from './support/testids';

test('TC-E2E-06 (core-v1): table renders the base-game galaxy from the server PlayerView', async ({
  page,
  request,
}) => {
  const { sessionId, view } = await createSession(request, REBELS_VS_AI);
  await openCore(page, sessionId);

  // 32 systems, each with neighbours, drawn on the canvas, mirrored in the list and in the map-state hook.
  expect(view.map.systems).toHaveLength(CORE_SYSTEM_COUNT);
  for (const s of view.map.systems) {
    expect(s.adjacentSystemIds.length, `system ${s.id} has neighbours`).toBeGreaterThan(0);
    await dbg.systemPos(page, s.id); // throws if not rendered
    await expect(page.getByTestId(T.systemItem(s.id))).toHaveCount(1);
    await expect(page.getByTestId(T.mapSystem(s.id))).toHaveAttribute('data-region', s.regionId);
  }

  // Units of both sides; every unit on the map (glyph or side chip) and in the list with its system.
  for (const owner of ['empire', 'rebels'] as const) {
    expect(
      view.units.some((u) => u.owner === owner),
      `${owner} units present`,
    ).toBe(true);
  }
  for (const u of view.units) {
    await dbg.piecePos(page, u.id);
    const item = page.getByTestId(T.pieceItem(u.id));
    if (u.location.kind === 'system')
      await expect(item).toHaveAttribute('data-system-id', u.location.systemId);
    else await expect(item).toHaveCount(1);
  }
  // Both leader pools are public (8 starting leaders, all in the pools).
  for (const id of [...LEADERS.empire, ...LEADERS.rebels]) {
    await expect(page.getByTestId(T.leaderItem(id))).toHaveAttribute('data-location', /.+/);
  }
  await expect(page.getByTestId(T.poolGroup('empire'))).toHaveCount(1);
  await expect(page.getByTestId(T.poolGroup('rebels'))).toHaveCount(1);

  await openSidebarTab(page, 'objects');
  await expect(page.getByTestId(T.boardList)).toBeVisible();
  await expect(page.getByTestId(T.boardList)).toHaveRole('listbox');

  // Header: time track and phase; context panel; event log; prototype labelling.
  await expect(page.getByTestId(T.timeTrack)).toHaveAttribute('data-time', '1');
  await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', 'command');
  await expect(page.getByTestId(T.coreContextPanel)).toBeVisible();
  await openSidebarTab(page, 'log');
  await expect(page.getByTestId(T.eventLog)).toBeVisible();
  await expect(page.locator('[data-testid^="log-entry-"][data-seq]')).toHaveCount(view.log.length);
  await expect(page.getByTestId(T.logEntry(1))).toHaveAttribute('data-type', 'GAME_CREATED');
  const badge = page.getByTestId(T.prototypeBadge);
  await expect(badge).toHaveCount(1);
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-status', 'prototype');
  await expect(badge).toHaveAttribute('data-variant', 'core-v1');
  await expect(badge).not.toBeEmpty();
  await expect(page.getByTestId(T.advancePhase)).toHaveCount(0);
  await openSidebarTab(page, 'game');
  await expect(page.getByTestId(T.mapLegend)).toBeVisible();
  // NOTE: adjacency lines / region borders are canvas-only — verified by screenshots 01–03.
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
