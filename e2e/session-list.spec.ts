// SWR-004 prototype labelling and "continue from the game page": TC-E2E-PR-01 (AC-13), TC-E2E-CT-01 (AC-09).
// Row fields are checked by testid/attributes against `GET /api/sessions` (texts are not asserted, Q-18).
// Relies on `workers: 1`: the two sessions created last are the newest on the game page.
import { expect, test } from '@playwright/test';
import {
  createSession,
  EMPIRE_VS_AI_HARD,
  listSessions,
  REBELLION,
  REBELS_VS_HUMAN,
} from './support/api';
import { expectNotClipped } from './support/a11y';
import {
  gamePath,
  newSessionPath,
  openSession,
  openSidebarTab,
  sessionPath,
  urlOf,
  waitForTable,
} from './support/board';
import { RECENT_SESSION_ITEM, T } from './support/testids';

test.describe('SWR-004 prototype labelling', () => {
  test('TC-E2E-PR-01: "Prototype" on the table (1440 and 375), game tab, every list row, Continue hint and the form', async ({
    page,
    request,
  }) => {
    const { sessionId } = await createSession(request);

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 375, height: 812 },
    ]) {
      await page.setViewportSize(viewport);
      await openSession(page, sessionId);
      const badge = page.getByTestId(T.prototypeBadge);
      await expect(badge).toHaveCount(1);
      await expect(badge).toHaveAttribute('data-status', 'prototype');
      await expect(badge).not.toBeEmpty();
      // full text, wrapped not truncated (plan-frontend §5.4)
      await expectNotClipped(badge, `prototype-badge at ${viewport.width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSidebarTab(page, 'game');
    await expect(page.getByTestId(T.gameInfoStatus)).toHaveAttribute('data-status', 'prototype');

    await page.goto(gamePath(REBELLION));
    const rows = page.getByTestId(T.gameRecentSessions).locator(RECENT_SESSION_ITEM);
    await expect(rows).not.toHaveCount(0);
    for (const row of await rows.all()) {
      await expect(row.getByTestId(T.recentSessionStatus)).toHaveAttribute(
        'data-status',
        'prototype',
      );
    }
    await expect(page.getByTestId(T.gameContinueStatus)).toHaveAttribute(
      'data-status',
      'prototype',
    );

    await page.goto(newSessionPath(REBELLION));
    await expect(page.getByTestId(T.setupPrototypeNote)).toBeVisible();
    await expect(page.getByTestId(T.setupPrototypeNote)).not.toBeEmpty();
  });
});

test.describe('SWR-004 continue from the game page', () => {
  test('TC-E2E-CT-01: list rows show side, opponent, status, date per session; Continue → newest; row → that session', async ({
    page,
    request,
  }) => {
    const older = await createSession(request, EMPIRE_VS_AI_HARD);
    const newer = await createSession(request, REBELS_VS_HUMAN);
    const summaries = await listSessions(request, REBELLION);
    expect(summaries[0]?.sessionId).toBe(newer.sessionId);
    expect(summaries[1]?.sessionId).toBe(older.sessionId);

    await page.goto(gamePath(REBELLION));
    const list = page.getByTestId(T.gameRecentSessions);
    const ids = await list
      .locator(RECENT_SESSION_ITEM)
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
    expect(ids.slice(0, 2)).toEqual([
      T.recentSession(newer.sessionId),
      T.recentSession(older.sessionId),
    ]);

    const text = async (sessionId: string, part: string) =>
      (
        (await list.getByTestId(T.recentSession(sessionId)).getByTestId(part).textContent()) ?? ''
      ).trim();

    for (const s of summaries.slice(0, 2)) {
      const row = list.getByTestId(T.recentSession(s.sessionId));
      await expect(row.getByTestId(T.recentSessionFaction)).not.toBeEmpty();
      await expect(row.getByTestId(T.recentSessionOpponent)).not.toBeEmpty();
      await expect(row.getByTestId(T.recentSessionStatus)).toHaveAttribute('data-status', s.status);
      const time = row.getByTestId(T.recentSessionDate);
      await expect(time).not.toBeEmpty();
      const iso = await time.getAttribute('datetime');
      expect(iso, 'machine-readable date').toBeTruthy();
      expect(Date.parse(iso!), 'date = updatedAt').toBe(Date.parse(s.updatedAt));
    }
    // Different side and different opponent type → different visible text (difficulty only for AI).
    expect(await text(older.sessionId, T.recentSessionFaction)).not.toBe(
      await text(newer.sessionId, T.recentSessionFaction),
    );
    expect(await text(older.sessionId, T.recentSessionOpponent)).not.toBe(
      await text(newer.sessionId, T.recentSessionOpponent),
    );

    // Continue → the newest (human) session.
    await expect(page.getByTestId(T.gameContinueStatus)).toHaveAttribute(
      'data-status',
      'prototype',
    );
    await page.getByTestId(T.gameContinue).click();
    await expect(page).toHaveURL(urlOf(sessionPath(newer.sessionId)));
    await waitForTable(page, newer.sessionId);
    await expect(page.getByTestId(T.activeSide)).toHaveAttribute('data-side', 'rebels');

    // Back → the older row → the Empire table.
    await page.goBack();
    await expect(page).toHaveURL(urlOf(gamePath(REBELLION)));
    await page.getByTestId(T.recentSession(older.sessionId)).click();
    await expect(page).toHaveURL(urlOf(sessionPath(older.sessionId)));
    await waitForTable(page, older.sessionId);
    await expect(page.getByTestId(T.activeSide)).toHaveAttribute('data-side', 'empire');
  });
});
