// SWR-005 scenario 6: an old SWR-002…004 session opens and continues on the mock rules (fictional map) with the
// «Старый прототип: тестовые правила» badge — TC-E-09 (AC-11, AC-13). Rows are SEEDED (TR-4): the frozen v2 snapshot
// and the SWR-003 v1 snapshot, each cloned under a new id (`support/seed.ts`).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { getSession, getView, listSessions, pickMove, REBELLION } from './support/api';
import {
  dbg,
  gamePath,
  openLegacy,
  openSidebarTab,
  sessionPath,
  urlOf,
  version,
  waitForCommand,
  waitForTable,
} from './support/board';
import { seedLegacyV1, seedLegacyV2 } from './support/seed';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

const commonLocale = (lang: 'ru' | 'en') =>
  JSON.parse(
    readFileSync(
      new URL(`../apps/web/src/games/rebellion/locales/${lang}/common.json`, import.meta.url),
      'utf8',
    ),
  ) as { prototype: { legacy: string } };

async function expectLegacyBadge(page: Page): Promise<void> {
  const badge = page.getByTestId(T.prototypeBadge);
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-variant', 'legacy');
  await expect(badge).toHaveAttribute('data-status', 'prototype');
  const lang = (await page.locator('html').getAttribute('lang'))?.startsWith('en') ? 'en' : 'ru';
  await expect(badge).toHaveText(commonLocale(lang).prototype.legacy);
}

test.describe('SWR-005 scenario 6: legacy sessions (mock-v1)', () => {
  test('TC-E-09: /games/R → seeded v2 session → fictional map, «Old prototype» badge, advance-phase + mock move, reload keeps the move', async ({
    page,
    request,
  }) => {
    const { sessionId } = await seedLegacyV2('rebelsAi');
    const before = await getView(request, sessionId);
    expect(before.rulesEngine).toBe('mock-v1');
    expect(before.systems.every((s) => s.id.startsWith('sys-'))).toBe(true); // fictional map (10 systems)
    expect(before.systems).toHaveLength(10);
    const summary = (await listSessions(request, REBELLION)).find((s) => s.sessionId === sessionId);
    expect(summary?.details).toMatchObject({
      rulesEngine: 'mock-v1',
      winner: null,
      reputation: null,
    });

    await page.goto(gamePath(REBELLION));
    const row = page.getByTestId(T.recentSession(sessionId));
    await expect(row.getByTestId(T.recentSessionEngine)).not.toBeEmpty();
    await row.click();
    await expect(page).toHaveURL(urlOf(sessionPath(sessionId)));
    await waitForTable(page, sessionId, { engine: 'mock-v1' });
    await expectLegacyBadge(page);
    expect(await dbg.rulesEngine(page)).toBe('mock-v1');
    await expect(page.getByTestId(T.timeTrack)).toHaveCount(0);
    await expect(page.getByTestId(T.leaderPool)).toHaveCount(0);

    // Mock rules still work: ADVANCE_PHASE (command → refresh) and MOVE_PIECES to an adjacent system.
    const v0 = await version(page);
    let cmd = waitForCommand(page);
    await page.getByTestId(T.advancePhase).click();
    expect((await cmd).status()).toBe(200);
    await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', 'refresh');

    const view = await getView(request, sessionId);
    const move = pickMove(view);
    const pos = await dbg.piecePos(page, move.pieceId);
    await page.mouse.click(pos.x, pos.y);
    cmd = waitForCommand(page);
    await page.getByTestId(T.actionMove(move.pieceId, move.toSystemId)).click();
    expect((await cmd).status()).toBe(200);
    await expect.poll(() => version(page)).toBe(v0 + 2);

    await page.reload();
    await waitForTable(page, sessionId, { engine: 'mock-v1' });
    await expectLegacyBadge(page);
    expect(await version(page)).toBe(v0 + 2);
    await expect(page.getByTestId(T.pieceItem(move.pieceId))).toHaveAttribute(
      'data-system-id',
      move.toSystemId,
    );
    await expect(page.getByTestId(T.phaseIndicator)).toHaveAttribute('data-phase', 'refresh');
    await openSidebarTab(page, 'log');
    await expect(page.getByTestId(T.eventLogItem)).toHaveCount(before.log.length + 2);
    const after = await getSession(request, sessionId);
    expect(after.status).toBe('prototype');
  });

  test('TC-E-09 (v1 row): a seeded SWR-003 session (no schemaVersion) opens as a legacy table and accepts a mock command', async ({
    page,
    request,
  }) => {
    const { sessionId, version: v } = await seedLegacyV1();
    const view = await getView(request, sessionId);
    expect(view.version).toBe(v);
    expect(view.viewer).toBe('empire');
    await openLegacy(page, sessionId);
    await expectLegacyBadge(page);
    const cmd = waitForCommand(page);
    await page.getByTestId(T.advancePhase).click();
    expect((await cmd).status()).toBe(200);
    await expect.poll(() => version(page)).toBe(v + 1);
  });
});
