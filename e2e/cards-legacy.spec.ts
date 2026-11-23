/// <reference lib="dom" />
// SWR-010 old games (AC-16 UI part; test-cases.md TC-HAND-07, TC-OLD-06): a `core-v1` row stored before SWR-010 (W5
// seeds without `cards` / `table`) opens, the table works, the Cards tab says «cards are not tracked in this game»
// (ru, en), the console stays in the turn mode, no page error; reading does not rewrite the row. A `mock-v1` row (the
// old fictional table) has no Cards tab at all.
import { expect, test, type Page } from '@playwright/test';
import { getCoreView } from './support/api';
import { openCore, openLegacy } from './support/board';
import { msg, openCards, setLanguage } from './support/cards';
import { readStoredRow, seedCore, seedLegacyV2 } from './support/seed';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

test.describe('SWR-010 old games without cards (AC-16)', () => {
  for (const lang of ['ru', 'en'] as const) {
    test(`TC-HAND-07 / TC-OLD-06 (${lang}): core-v1 game stored before SWR-010 — «cards are not tracked», turn mode, no errors, row not rewritten`, async ({
      page,
      request,
    }) => {
      if (lang === 'en') await setLanguage(page, 'en');
      const errors = collectErrors(page);
      const seeded = await seedCore('ai-empire-before-reveal');
      const before = await readStoredRow(seeded.sessionId);
      expect(before.state.cards, 'the stored row has no cards').toBeUndefined();
      const view = await getCoreView(request, seeded.sessionId);
      expect(view.cards).toBeNull();
      expect(view.table).toBeNull();
      await openCore(page, seeded.sessionId);
      const table = page.getByTestId(T.gameTable);
      await expect(table).toHaveAttribute('data-cards-tracked', 'false');
      await expect(table).toHaveAttribute('data-console-mode', 'turn');
      await expect(page.getByTestId(T.turnPanel)).toBeVisible();
      await expect(page.getByTestId(T.physicalExecution)).toHaveCount(0);
      await openCards(page);
      const hand = page.getByTestId(T.cardHand);
      await expect(hand).toHaveAttribute('data-tracked', 'false');
      await expect(hand).toHaveAttribute('data-viewer', 'empire');
      const legacy = page.getByTestId(T.cardHandLegacy);
      await expect(legacy).toBeVisible();
      await expect(legacy).toContainText(msg(lang, 'cards', 'legacy.title'));
      await expect(legacy).toContainText(msg(lang, 'cards', 'legacy.text'));
      await expect(hand.locator('button')).toHaveCount(0);
      // Reading does not rewrite the row (TC-OLD-03 from the UI side).
      const after = await readStoredRow(seeded.sessionId);
      expect(after.version).toBe(before.version);
      expect(JSON.stringify(after.state)).toBe(JSON.stringify(before.state));
      expect(errors).toEqual([]);
    });
  }

  test('TC-OLD-06: a mock-v1 row (old fictional table) opens without a Cards tab', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const { sessionId } = await seedLegacyV2('rebelsAi');
    await openLegacy(page, sessionId);
    await expect(page.getByTestId(T.sidebarTab('cards'))).toHaveCount(0);
    await expect(page.getByTestId(T.cardHand)).toHaveCount(0);
    await expect(page.getByTestId(T.sidebarTab('log'))).toBeVisible();
    expect(errors).toEqual([]);
  });
});
