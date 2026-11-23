/// <reference lib="dom" />
// SWR-010 Card Detail (AC-20; test-cases.md §17): TC-DET-01 (name, type + own type description, usage conditions,
// effect / supported mechanic, where the card is and who tracks it, rule source, verification status — ru and en; a
// probe of the human Empire and the Location of the human Rebels), TC-DET-02 (no «Play» key at all, FD-4; opening,
// reading and closing the detail sends no command), TC-DET-03 (Esc / «Close» → focus back on the card; also in
// card-hand.spec.ts). Texts come from the web locale files; the card data from the public catalogue as the UI shows it.
import { expect, test, type Page } from '@playwright/test';
import { createSession, REBELS_VS_AI } from './support/api';
import { expectNoCommandSent, openCore, recordApi } from './support/board';
import { msg, openCards, setLanguage, systemName, systemOfProbe, type Lang } from './support/cards';
import { definitionOfInstance, seedCore, storedRebelBase, storedZone } from './support/seed';
import { CYRILLIC, T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

/** Every field of §6 is present and localized; returns the detail text. */
async function expectDetailFields(
  page: Page,
  definitionId: string,
  lang: Lang,
  where: { zoneId: string; authority: 'digital' | 'physical' },
): Promise<string> {
  const detail = page.getByTestId(T.cardDetail);
  await expect(detail).toBeVisible();
  await expect(detail).toHaveAttribute('data-definition-id', definitionId);
  await expect(page.locator('#card-detail-title')).toHaveText(
    systemName(lang, systemOfProbe(definitionId)),
  );
  await expect(page.getByTestId(T.cardDetailType)).toHaveText(
    msg(lang, 'data', 'cards.types.probe'),
  );
  await expect(page.getByTestId(T.cardDetailTypeInfo)).toHaveText(
    msg(lang, 'data', 'cards.typeInfo.probe'),
  );
  const usage = page.getByTestId(T.cardDetailUsage).locator('li');
  expect(await usage.count(), 'usage conditions listed').toBeGreaterThanOrEqual(1);
  const effect = page.getByTestId(T.cardDetailEffect);
  await expect(effect).toHaveAttribute('data-effect-status', 'none');
  await expect(effect).toContainText(msg(lang, 'data', 'cards.effects.no-play'));
  await expect(effect).toContainText(msg(lang, 'cards', 'detail.effectStatus.none'));
  await expect(page.getByTestId(T.cardDetailWhere)).toContainText(
    msg(lang, 'data', `cards.zones.${where.zoneId}`),
  );
  const authority = page.getByTestId(T.cardDetailAuthority);
  await expect(authority).toHaveAttribute('data-authority', where.authority);
  await expect(authority).toContainText(msg(lang, 'cards', `detail.authority.${where.authority}`));
  const sources = page.getByTestId(T.cardDetailSources).locator('li');
  expect(await sources.count(), 'rule source listed').toBeGreaterThanOrEqual(1);
  // kb id (`rebellion:…`) or a book page — never empty.
  for (const s of await sources.allTextContents()) expect(s.trim()).toMatch(/rebellion:|\d/);
  const verification = page.getByTestId(T.cardDetailVerification);
  await expect(verification).toHaveAttribute('data-verification', 'verified');
  await expect(verification).toHaveText(msg(lang, 'cards', 'verification.verified'));
  // FD-4 / TC-DET-02: the only key of the detail is «Close» (no Play key, neither enabled nor disabled).
  const keys = await detail
    .locator('button, [role="button"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(keys).toEqual([T.cardDetailClose]);
  const text = (await detail.textContent()) ?? '';
  expect(text).not.toMatch(/разыгр|сыграть|\bplay\b/i);
  if (lang === 'en') expect(text, 'EN detail has no Cyrillic').not.toMatch(CYRILLIC);
  else expect(text).toMatch(CYRILLIC);
  return text;
}

test.describe('SWR-010 Card Detail (AC-20)', () => {
  for (const lang of ['ru', 'en'] as const) {
    test(`TC-DET-01 + TC-DET-02 (${lang}): Empire probe card (seed) — all fields; no Play key; reading the detail sends no command`, async ({
      page,
    }) => {
      if (lang === 'en') await setLanguage(page, 'en');
      const seeded = await seedCore('digital-empire-after-refresh');
      const probe = definitionOfInstance((await storedZone(seeded.sessionId, 'empire-probes'))[0]!);
      const api = recordApi(page);
      await openCore(page, seeded.sessionId);
      await openCards(page);
      const item = page.getByTestId(T.cardHandItem(probe));
      await expectNoCommandSent(page, async () => {
        await item.click();
        await expectDetailFields(page, probe, lang, {
          zoneId: 'empire-probes',
          authority: 'digital',
        });
        await page.getByTestId(T.cardDetailClose).click();
        await expect(page.getByTestId(T.cardDetail)).toHaveCount(0);
        await expect(item).toBeFocused(); // TC-DET-03 (Close)
        await item.click();
        await page.keyboard.press('Escape');
        await expect(page.getByTestId(T.cardDetail)).toHaveCount(0);
        await expect(item).toBeFocused(); // TC-DET-03 (Esc)
      });
      await api.settle();
      expect(
        api.calls.filter((c) => c.method !== 'GET').map((c) => `${c.method} ${c.url}`),
        'no write request while using the hand and the detail',
      ).toEqual([]);
    });

    test(`TC-DET-01 (${lang}): Rebels' own Location card (digital) — where = Location, tracked by the app`, async ({
      page,
      request,
    }) => {
      if (lang === 'en') await setLanguage(page, 'en');
      const { sessionId } = await createSession(request, REBELS_VS_AI);
      const baseId = await storedRebelBase(sessionId);
      await openCore(page, sessionId);
      await openCards(page);
      await expectNoCommandSent(page, async () => {
        await page.getByTestId(T.cardHandItem(`probe-${baseId}`)).click();
        await expectDetailFields(page, `probe-${baseId}`, lang, {
          zoneId: 'rebels-location',
          authority: 'digital',
        });
      });
    });
  }

  test('TC-DET-01: a public first-game card (out of the game) — where = «Out of the game (first game)»', async ({
    page,
    request,
  }) => {
    const { sessionId } = await createSession(request, REBELS_VS_AI);
    const box = (await storedZone(sessionId, 'probe-box')).map(definitionOfInstance);
    expect(box).toHaveLength(5);
    await openCore(page, sessionId);
    await openCards(page);
    await page.getByTestId(T.cardHandItem(box[0]!)).click();
    await expectDetailFields(page, box[0]!, 'ru', { zoneId: 'probe-box', authority: 'digital' });
  });
});
