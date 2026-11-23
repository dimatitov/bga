/// <reference lib="dom" />
// SWR-010 evidence screenshots (plan-frontend §11.4, skill browser-qa): `swr010-<scene>-<ru|en>-<1440|375>.png` into
// docs/tasks/SWR-010/artifacts/screenshots/ (CURRENT_SCREENSHOT_TASK = 'SWR-010', support/board.ts), reduced motion.
// Every scene is also a layout check: no horizontal page scroll, the scene's key element is not clipped; at 375 px the
// four console tabs (Log · Cards · Objects · Game) fit side by side (FR-2, TC-HAND-05). FR-3: at 1024×768 the
// Physical Execution module (with the registration form / the confirm key) is visible and reachable
// (`swr010-px-*-ru-1024.png`).
import { expect, test, type Page } from '@playwright/test';
import { createSession, REBELLION, REBELS_VS_AI } from './support/api';
import { expectNoHorizontalScroll, expectNotClipped } from './support/a11y';
import { newSessionPath, openCore, saveScreenshot } from './support/board';
import { openCards, setLanguage, type Lang } from './support/cards';
import { definitionOfInstance, seedCore, storedZone } from './support/seed';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

const SWR010 = 'SWR-010';
const SIZES = [
  { width: 1440, height: 900 },
  { width: 375, height: 812 },
] as const;

async function tabsFit(page: Page, label: string): Promise<void> {
  let prevRight = -Infinity;
  for (const tab of ['log', 'cards', 'objects', 'game'] as const) {
    const t = page.getByTestId(T.sidebarTab(tab));
    await expectNotClipped(t, `${label} tab ${tab}`);
    const b = (await t.boundingBox())!;
    expect(b.x, `${label}: tab ${tab} after the previous one`).toBeGreaterThanOrEqual(
      prevRight - 1,
    );
    prevRight = b.x + b.width;
  }
}

for (const lang of ['ru', 'en'] as const satisfies readonly Lang[]) {
  for (const size of SIZES) {
    test(`SWR-010 screenshots ${lang} ${size.width}px: setup, hand (Rebels / Empire / legacy), detail, physical execution (setup / register / AI task / Empire refresh)`, async ({
      page,
      request,
    }) => {
      test.setTimeout(150_000);
      const narrow = size.width < 600;
      const suffix = `${lang}-${size.width}`;
      await page.setViewportSize(size);
      if (lang === 'en') await setLanguage(page, 'en');
      const shot = async (scene: string, focus?: string) => {
        if (focus) {
          await page.getByTestId(focus).first().scrollIntoViewIfNeeded();
          await expectNotClipped(page.getByTestId(focus).first(), `${scene} ${suffix} › ${focus}`);
        }
        await expectNoHorizontalScroll(page, `${scene} ${suffix}`);
        if (!narrow) await page.evaluate(() => window.scrollTo(0, 0));
        await saveScreenshot(page, `swr010-${scene}-${suffix}`, SWR010, { fullPage: narrow });
      };

      // Setup: physical chosen against AI / unavailable with a second player.
      await page.goto(newSessionPath(REBELLION));
      await page.getByTestId(T.setupModeOption('physical_companion')).click();
      await expect(page.getByTestId(T.setupModeOption('physical_companion'))).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await shot('setup-physical', T.setupModeOption('physical_companion'));
      await page.getByTestId(T.setupOpponent('human')).click();
      await expect(page.getByTestId(T.setupModeOption('physical_companion'))).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await shot('setup-physical-unavailable', T.setupModeOption('physical_companion'));

      // Card Hand: human Rebels (digital).
      const reb = await createSession(request, REBELS_VS_AI);
      await openCore(page, reb.sessionId);
      if (narrow) await tabsFit(page, 'hand-reb');
      await openCards(page);
      await shot('hand-reb', T.cardHand);

      // Card Hand: human Empire after the Refresh (2 probes) + Card Detail of a probe.
      const emp = await seedCore('digital-empire-after-refresh');
      const probe = definitionOfInstance((await storedZone(emp.sessionId, 'empire-probes'))[0]!);
      await openCore(page, emp.sessionId);
      await openCards(page);
      await shot('hand-emp', T.cardZone('empire-probes'));
      await page.getByTestId(T.cardHandItem(probe)).click();
      await expect(page.getByTestId(T.cardDetail)).toBeVisible();
      await shot('detail', T.cardDetail);

      // Card Hand: a game stored before SWR-010.
      const old = await seedCore('ai-empire-before-reveal');
      await openCore(page, old.sessionId);
      await openCards(page);
      await expect(page.getByTestId(T.cardHandLegacy)).toBeVisible();
      await shot('hand-legacy', T.cardHandLegacy);

      // Physical Execution: new Rebels game — initial setup.
      const phy = await createSession(request, { ...REBELS_VS_AI, gameMode: 'physical_companion' });
      await openCore(page, phy.sessionId);
      await expect(page.getByTestId(T.physicalExecution)).toHaveAttribute(
        'data-head-kind',
        'initialSetup',
      );
      if (narrow) await tabsFit(page, 'px-setup');
      await shot('px-setup', T.tableTaskConfirm);

      // Registration form (seed), a system chosen.
      const regSeed = await seedCore('physical-rebels-registration');
      await openCore(page, regSeed.sessionId);
      await page.getByTestId(T.locationRegisterSelect).selectOption('probe-tatooine');
      await shot('px-register', T.locationRegisterSubmit);

      // AI task (human Empire, the AI activated its hidden base → «Rebel Base» space), the AI waits.
      const aiTask = await seedCore('physical-empire-ai-task-pending');
      await openCore(page, aiTask.sessionId);
      await expect(page.getByTestId(T.physicalExecution)).toHaveAttribute(
        'data-ai-waiting',
        'true',
      );
      await shot('px-ai-task', T.tableTaskConfirm);

      // Refresh task of the human Empire: «take X and Y».
      const refresh = await seedCore('physical-empire-refresh-pending');
      await openCore(page, refresh.sessionId);
      await expect(page.getByTestId(T.physicalExecution)).toHaveAttribute(
        'data-head-kind',
        'refresh',
      );
      await shot('px-emp-refresh', T.tableTaskConfirm);
    });
  }
}

test('FR-3: 1024×768 — the Physical Execution module is visible; the confirm key and the registration form are reachable without a page scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const inViewport = async (testId: string, label: string) => {
    const loc = page.getByTestId(testId);
    await expect(loc, label).toBeVisible();
    await expect(loc, `${label} in the viewport`).toBeInViewport();
    await expectNotClipped(loc, label);
  };

  const aiTask = await seedCore('physical-empire-ai-task-pending');
  await openCore(page, aiTask.sessionId);
  await inViewport(T.physicalExecution, 'PX module (AI task)');
  await inViewport(T.tableTaskConfirm, 'confirm key (AI task)');
  expect(await page.evaluate(() => window.scrollY), 'no page scroll needed').toBe(0);
  await expectNoHorizontalScroll(page, 'AI task 1024');
  await saveScreenshot(page, 'swr010-px-ai-task-ru-1024', SWR010);

  const reg = await seedCore('physical-rebels-registration');
  await openCore(page, reg.sessionId);
  await inViewport(T.physicalExecution, 'PX module (registration)');
  // The form may scroll inside the module (overflowY auto), never the page.
  await page.getByTestId(T.locationRegisterSubmit).scrollIntoViewIfNeeded();
  await inViewport(T.locationRegisterSelect, 'register select');
  await inViewport(T.locationRegisterSubmit, 'register submit');
  await expectNoHorizontalScroll(page, 'registration 1024');
  const pageScroll = await page.evaluate(() => ({
    y: window.scrollY,
    h: document.documentElement.scrollHeight,
    vh: window.innerHeight,
  }));
  test.info().annotations.push({
    type: 'FR-3 page scroll (registration 1024×768)',
    description: JSON.stringify(pageScroll),
  });
  expect(pageScroll.h, 'the table fits 768 px in height (no page scroll)').toBeLessThanOrEqual(
    pageScroll.vh + 1,
  );
  await saveScreenshot(page, 'swr010-px-register-ru-1024', SWR010);
});
