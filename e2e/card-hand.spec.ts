/// <reference lib="dom" />
// SWR-010 Card Hand (AC-19; test-cases.md §16): TC-HAND-01 (Rebels' own Location + Empire counts, ru/en),
// TC-HAND-02 (Empire's 2 probes after a Refresh, Rebels' Location only as a count), TC-HAND-03 (mouse and keyboard
// selection → Card Detail), TC-HAND-04 (no play/action buttons in `digital`; only the Location registration in
// `physical` before the registration), TC-HAND-05 (375×812: four tabs fit, no horizontal scroll), TC-HAND-08 (a
// Refresh played in the UI adds +2 probes without a reload). Oracles: the stored row (`support/seed.ts`) and the
// server view; texts from the web locale files (`support/cards.ts`).
import { expect, test, type Page } from '@playwright/test';
import {
  createSession,
  getCoreView,
  REBELS_VS_AI,
  zoneOf,
  type CorePlayerView,
} from './support/api';
import { expectNoHorizontalScroll, expectNotClipped, expectVisibleFocus } from './support/a11y';
import { keyboardFocus, openCore } from './support/board';
import {
  msg,
  openCards,
  pageLang,
  setLanguage,
  stripRegionNames,
  systemName,
  systemOfProbe,
  type Lang,
} from './support/cards';
import { commandViaUi } from './support/core';
import { definitionOfInstance, seedCore, storedRebelBase, storedZone } from './support/seed';
import { CYRILLIC, T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

/** Buttons of the hand: every one is a card toggle, the detail's «Close» or the registration key — nothing else. */
async function expectOnlySelectionButtons(page: Page, allowRegister: boolean): Promise<void> {
  const buttons = await page
    .getByTestId(T.cardHand)
    .locator('button, [role="button"]')
    .evaluateAll((els) =>
      els.map((el) => ({
        testId: el.getAttribute('data-testid') ?? '',
        pressed: el.getAttribute('aria-pressed'),
        text: (el.textContent ?? '').trim(),
      })),
    );
  expect(buttons.length, 'the hand has card toggles').toBeGreaterThan(0);
  for (const b of buttons) {
    const isItem = b.testId.startsWith('card-hand-item-') && b.pressed !== null;
    const isClose = b.testId === T.cardDetailClose;
    const isRegister = allowRegister && b.testId === T.cardHandRegister;
    expect(
      isItem || isClose || isRegister,
      `unexpected button in the hand: ${JSON.stringify(b)}`,
    ).toBe(true);
    expect(b.text, 'no «play» key').not.toMatch(/разыгр|play\b|сыграть/i);
  }
}

async function expectRebelsHand(page: Page, view: CorePlayerView, baseId: string, lang: Lang) {
  const hand = page.getByTestId(T.cardHand);
  await expect(hand).toHaveAttribute('data-tracked', 'true');
  await expect(hand).toHaveAttribute('data-viewer', 'rebels');
  // Own Location: the card of the base system (name, type, parameter, availability, short description).
  const loc = page.getByTestId(T.cardZone('rebels-location'));
  await expect(loc).toHaveAttribute('data-visible', 'true');
  await expect(loc).toHaveAttribute('data-count', '1');
  const item = page.getByTestId(T.cardHandItem(`probe-${baseId}`));
  await expect(item).toHaveAttribute('data-zone', 'rebels-location');
  await expect(item).toHaveAttribute('aria-pressed', 'false');
  await expect(item).toContainText(systemName(lang, baseId));
  await expect(item).toContainText(msg(lang, 'data', 'cards.types.probe'));
  await expect(item).toContainText(msg(lang, 'cards', 'availability.secret'));
  // Short own description = the usage of the card's role in its zone (FIX-QA1 D-1): the Location card names the
  // base, it does not show the Empire's Refresh-draw line.
  await expect(item).toContainText(msg(lang, 'data', 'cards.usage.probe-base-location'));
  await expect(item).not.toContainText(msg(lang, 'data', 'cards.usage.probe-refresh-draw'));
  const region = view.map.systems.find((s) => s.id === baseId)!.regionId;
  await expect(item).toContainText(msg(lang, 'data', `regions.${region}`));
  // Empire: counts only (no cards of the opponent in the DOM).
  const opp = page.getByTestId(T.cardHandOpponentCount);
  await expect(opp).toHaveAttribute('data-count', String(zoneOf(view, 'empire-probes').count));
  await expect(page.getByTestId(T.cardZone('empire-probes'))).toHaveAttribute(
    'data-visible',
    'false',
  );
  await expect(opp.locator('[data-testid^="card-hand-item-"]')).toHaveCount(0);
  // Shared: deck count + the 5 public first-game cards.
  await expect(page.getByTestId(T.cardDeckCount)).toHaveAttribute(
    'data-count',
    String(zoneOf(view, 'probe-deck').count),
  );
  const box = zoneOf(view, 'probe-box');
  expect(box.cards).not.toBeNull();
  await expect(page.getByTestId(T.cardZone('probe-box'))).toHaveAttribute(
    'data-count',
    String(box.count),
  );
  for (const c of box.cards!)
    await expect(page.getByTestId(T.cardHandItem(c.definitionId))).toHaveAttribute(
      'data-zone',
      'probe-box',
    );
  // Language of the panel.
  const text = (await hand.textContent()) ?? '';
  if (lang === 'en') expect(text, 'EN hand has no Cyrillic').not.toMatch(CYRILLIC);
  else expect(text).toMatch(CYRILLIC);
}

test.describe('SWR-010 Card Hand (AC-19)', () => {
  for (const lang of ['ru', 'en'] as const) {
    test(`TC-HAND-01 (${lang}): digital Rebels vs AI — own Location card in the hand, Empire probes and the deck as counts`, async ({
      page,
      request,
    }) => {
      if (lang === 'en') await setLanguage(page, 'en');
      const { sessionId, view } = await createSession(request, REBELS_VS_AI);
      const baseId = await storedRebelBase(sessionId);
      // Oracle: the stored Location holds exactly the base card; the view agrees.
      expect(await storedZone(sessionId, 'rebels-location')).toEqual([`probe-${baseId}#1`]);
      expect(view.cards).not.toBeNull();
      expect(view.table).toBeNull();
      await openCore(page, sessionId);
      await expect(page.getByTestId(T.gameTable)).toHaveAttribute('data-cards-tracked', 'true');
      await expect(page.getByTestId(T.gameTable)).toHaveAttribute('data-console-mode', 'turn');
      await openCards(page);
      expect(await pageLang(page)).toBe(lang);
      await expectRebelsHand(page, view, baseId, lang);
      await expectOnlySelectionButtons(page, false); // TC-HAND-04 (digital)
      await expect(page.getByTestId(T.cardHandRegister)).toHaveCount(0);
    });
  }

  test('TC-HAND-02: digital Empire vs AI after the round-1 Refresh (seed) — 2 own probes (system, type, «no base here»), deck count, Rebels Location only as a count', async ({
    page,
    request,
  }) => {
    const seeded = await seedCore('digital-empire-after-refresh');
    const own = (await storedZone(seeded.sessionId, 'empire-probes')).map(definitionOfInstance);
    expect(own).toHaveLength(2);
    const view = await getCoreView(request, seeded.sessionId);
    await openCore(page, seeded.sessionId);
    await openCards(page);
    const lang = await pageLang(page);
    const hand = page.getByTestId(T.cardHand);
    await expect(hand).toHaveAttribute('data-viewer', 'empire');
    const zone = page.getByTestId(T.cardZone('empire-probes'));
    await expect(zone).toHaveAttribute('data-visible', 'true');
    await expect(zone).toHaveAttribute('data-count', '2');
    for (const id of own) {
      const item = page.getByTestId(T.cardHandItem(id));
      await expect(item).toHaveAttribute('data-zone', 'empire-probes');
      await expect(item).toContainText(systemName(lang, systemOfProbe(id)));
      await expect(item).toContainText(msg(lang, 'data', 'cards.types.probe'));
      await expect(item).toContainText(msg(lang, 'cards', 'hand.noBaseHere'));
      await expect(item).toContainText(msg(lang, 'cards', 'availability.inHand'));
    }
    await expect(page.getByTestId(T.cardDeckCount)).toHaveAttribute(
      'data-count',
      String(zoneOf(view, 'probe-deck').count),
    );
    expect(zoneOf(view, 'probe-deck').count).toBe(23);
    // Rebels: the Location is a hidden count of 1, its card is not in the DOM and not named.
    const loc = page.getByTestId(T.cardZone('rebels-location'));
    await expect(loc).toHaveAttribute('data-visible', 'false');
    await expect(loc).toHaveAttribute('data-count', '1');
    await expect(loc.locator('[data-testid^="card-hand-item-"]')).toHaveCount(0);
    await expect(page.getByTestId(T.cardHandOpponentCount)).toHaveAttribute('data-count', '1');
    const handText = stripRegionNames((await hand.textContent()) ?? '');
    for (const name of [
      systemName('ru', seeded.rebelBaseSystemId),
      systemName('en', seeded.rebelBaseSystemId),
    ])
      expect(handText, 'the hand never names the hidden base').not.toContain(name);
    await expect(page.getByTestId(T.cardHandItem(`probe-${seeded.rebelBaseSystemId}`))).toHaveCount(
      0,
    );
    await expectOnlySelectionButtons(page, false); // TC-HAND-04 (digital, Empire)
  });

  test('TC-HAND-03 + TC-DET-03: select a card by mouse (aria-pressed, detail) and by keyboard (Tab → Enter / Space); Esc and «Close» return focus to the card', async ({
    page,
    request,
  }) => {
    const { sessionId } = await createSession(request, REBELS_VS_AI);
    const baseId = await storedRebelBase(sessionId);
    await openCore(page, sessionId);
    await openCards(page);
    const item = page.getByTestId(T.cardHandItem(`probe-${baseId}`));
    const detail = page.getByTestId(T.cardDetail);

    // Mouse: toggle on → detail of that card; toggle off → no detail.
    await item.click();
    await expect(item).toHaveAttribute('aria-pressed', 'true');
    await expect(item).toHaveAttribute('aria-controls', 'card-detail');
    await expect(detail).toBeVisible();
    await expect(detail).toHaveAttribute('data-definition-id', `probe-${baseId}`);
    await expect(detail).toHaveAttribute('role', 'region');
    await expect(page.locator('#card-detail-title')).toBeFocused();
    await item.click();
    await expect(item).toHaveAttribute('aria-pressed', 'false');
    await expect(detail).toHaveCount(0);

    // Keyboard only: Tab to the card (visible amber focus ring), Enter opens, Esc closes → focus back on the card.
    await page.getByTestId(T.sidebarTab('cards')).focus();
    await keyboardFocus(page, item);
    await expectVisibleFocus(item, 'card item (keyboard)');
    await page.keyboard.press('Enter');
    await expect(item).toHaveAttribute('aria-pressed', 'true');
    await expect(detail).toBeVisible();
    await expect(page.locator('#card-detail-title')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(item).toBeFocused();
    await expect(item).toHaveAttribute('aria-pressed', 'false');

    // Space opens; «Close» (keyboard) closes → focus back on the card.
    await page.keyboard.press('Space');
    await expect(item).toHaveAttribute('aria-pressed', 'true');
    await expect(detail).toBeVisible();
    await page.getByTestId(T.cardDetailClose).focus();
    await page.keyboard.press('Enter');
    await expect(detail).toHaveCount(0);
    await expect(item).toBeFocused();
  });

  test('TC-HAND-04 (physical): human Rebels before the Location registration — the only action key of the hand is «Register the base card», it leads to the registration select', async ({
    page,
  }) => {
    const seeded = await seedCore('physical-rebels-registration');
    await openCore(page, seeded.sessionId);
    await openCards(page);
    const lang = await pageLang(page);
    const loc = page.getByTestId(T.cardZone('rebels-location'));
    await expect(loc).toHaveAttribute('data-count', '0');
    await expect(loc).toContainText(msg(lang, 'cards', 'hand.notRegistered'));
    // No preliminary system: the provisional base is not named in the hand (AQ-4).
    const handText = stripRegionNames((await page.getByTestId(T.cardHand).textContent()) ?? '');
    expect(handText).not.toContain(systemName(lang, seeded.rebelBaseSystemId));
    const register = page.getByTestId(T.cardHandRegister);
    await expect(register).toBeVisible();
    await expect(register).toHaveText(msg(lang, 'cards', 'hand.register'));
    await expectOnlySelectionButtons(page, true);
    await register.click();
    await expect(page.getByTestId(T.locationRegisterSelect)).toBeFocused();
  });

  test('TC-HAND-05: 375×812 — the Cards tab is reachable, the four tabs fit (Log · Cards · Objects · Game), the hand and the detail are not clipped, no horizontal scroll', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    const baseId = await storedRebelBase(sessionId);
    await openCore(page, sessionId);
    await page.getByTestId(T.sidebarTab('cards')).scrollIntoViewIfNeeded();
    const tabs = ['log', 'cards', 'objects', 'game'] as const;
    const boxes = [];
    for (const tab of tabs) {
      const t = page.getByTestId(T.sidebarTab(tab));
      await expectNotClipped(t, `tab ${tab} at 375`);
      boxes.push((await t.boundingBox())!);
    }
    for (let i = 1; i < boxes.length; i++)
      expect(boxes[i]!.x, 'tabs in order, side by side').toBeGreaterThanOrEqual(
        boxes[i - 1]!.x + boxes[i - 1]!.width - 1,
      );
    await openCards(page);
    await expectRebelsHand(page, view, baseId, 'ru');
    await expectNoHorizontalScroll(page, 'cards tab 375');
    await page.getByTestId(T.cardHandItem(`probe-${baseId}`)).click();
    await expectNotClipped(page.getByTestId(T.cardDetail), 'card detail 375');
    await expectNoHorizontalScroll(page, 'card detail 375');
  });

  test('TC-HAND-08: digital Empire (seed) passes in the UI → Refresh → the hand shows +2 probes and the deck −2 without a reload', async ({
    page,
  }) => {
    const seeded = await seedCore('digital-empire-after-refresh');
    await openCore(page, seeded.sessionId);
    await openCards(page);
    await expect(page.getByTestId(T.cardZone('empire-probes'))).toHaveAttribute('data-count', '2');
    await page.evaluate(() => ((window as unknown as { __noReload: number }).__noReload = 1));

    // PASS (with the confirm dialog while a leader can still activate).
    const pass = page.getByTestId(T.passTurn);
    const { view, body } = await commandViaUi(page, async () => {
      await pass.click();
      const ok = page.getByTestId(T.passConfirmOk);
      const dialog = await ok
        .waitFor({ state: 'visible', timeout: 2_000 })
        .then(() => true)
        .catch(() => false);
      if (dialog) await ok.click();
    });
    const drawn = body.events.filter((e) => e.type === 'CARDS_DRAWN');
    expect(drawn, 'the Refresh drew probes for the Empire').toHaveLength(1);
    expect(drawn[0]!.payload).toMatchObject({ side: 'empire', count: 2 });
    const probes = zoneOf(view, 'empire-probes');
    expect(probes.count).toBe(4);
    await openCards(page);
    await expect(page.getByTestId(T.cardZone('empire-probes'))).toHaveAttribute('data-count', '4');
    for (const c of probes.cards!)
      await expect(page.getByTestId(T.cardHandItem(c.definitionId))).toBeVisible();
    await expect(page.getByTestId(T.cardDeckCount)).toHaveAttribute(
      'data-count',
      String(zoneOf(view, 'probe-deck').count),
    );
    expect(zoneOf(view, 'probe-deck').count).toBe(21);
    expect(
      await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload),
      'no reload',
    ).toBe(1);
    // Oracle: the stored hand = the shown hand.
    expect(
      (await storedZone(seeded.sessionId, 'empire-probes')).map(definitionOfInstance).sort(),
    ).toEqual(probes.cards!.map((c) => c.definitionId).sort());
  });
});
