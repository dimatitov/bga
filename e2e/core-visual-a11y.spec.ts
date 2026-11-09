// SWR-005 visual & accessibility (test-cases.md §14): TC-VA-01..TC-VA-14 + evidence screenshots of plan-frontend §10
// into docs/tasks/SWR-005/artifacts/screenshots/ — SWR-005B: the task is passed explicitly (`SWR005`), so after the switch of
// CURRENT_SCREENSHOT_TASK to 'SWR-005B' these PNGs go to test-results/screenshots/SWR-005/ and the SWR-005 evidence is
// rewritten only by a deliberate `SCREENSHOT_TASK=SWR-005 pnpm e2e` (support/board.ts routing rule). Reduced motion,
// ru (default UI language) unless noted; 18 is the en copy. Layout/focus/contrast use the SWR-004 helpers (TR-9).
import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  asCore,
  commandOk,
  createSession,
  EMPIRE_VS_AI,
  planActivation,
  REBELLION,
  REBELS_VS_AI,
  REBELS_VS_HUMAN,
  START_REPUTATION,
  type CorePlayerView,
} from './support/api';
import {
  expectFieldFocus,
  expectNoHorizontalScroll,
  expectNoOverflowNorOverlap,
  expectNotClipped,
  expectTextContrast,
  expectTextContrastDeep,
  expectVisibleFocus,
} from './support/a11y';
import {
  dbg,
  gamePath,
  keyboardFocus,
  openCore,
  openLegacy,
  openSidebarTab,
  saveScreenshot,
  sessionPath,
  waitViewportStable,
} from './support/board';
import {
  armLeader,
  clickSystem,
  commandViaUi,
  finishViaUi,
  midpoint,
  passViaUi,
  systemName,
  toHandoff,
  zoomToDetailAround,
} from './support/core';
import { seedCore, seedLegacyV2 } from './support/seed';
import { T } from './support/testids';

/** Evidence task of these screenshots (SWR-005B: explicit, like visual-a11y.spec.ts does for SWR-004). */
const SWR005 = 'SWR-005';
const D = { width: 1440, height: 900 };
const SIZES = [
  ['01-core-fit-1440x900', D],
  ['02-core-fit-1024x768', { width: 1024, height: 768 }],
  ['03-core-fit-768x1024', { width: 768, height: 1024 }],
] as const;

test.use({ reducedMotion: 'reduce', viewport: D });

async function activateViaApi(request: APIRequestContext, sessionId: string, view: CorePlayerView) {
  const plan = planActivation(view, [view.rebelBase.systemId ?? '']);
  const act = asCore(
    (
      await commandOk(request, sessionId, view, {
        type: 'ACTIVATE_SYSTEM',
        leaderId: plan.leaderId,
        systemId: plan.systemId,
      })
    ).view,
  );
  return { plan, act };
}

async function runSeedCommands(request: APIRequestContext, name: Parameters<typeof seedCore>[0]) {
  const seed = await seedCore(name);
  let version = seed.version;
  let last: CorePlayerView | null = null;
  for (const c of seed.nextCommands) {
    const r = await commandOk(
      request,
      seed.sessionId,
      { version, viewer: c.actor },
      c.command as never,
      c.actor,
    );
    last = asCore(r.view);
    version = last.version;
  }
  return { seed, view: last! };
}

async function gameOverRebels(request: APIRequestContext): Promise<string> {
  const { sessionId, view } = await createSession(request, EMPIRE_VS_AI);
  let v = view;
  for (let i = 0; i < START_REPUTATION - 1; i++)
    v = asCore((await commandOk(request, sessionId, v, { type: 'PASS' })).view);
  expect(v.outcome?.winner).toBe('rebels');
  return sessionId;
}

const focusedInside = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((el) => el.contains(document.activeElement));

test.describe('SWR-005 visual & accessibility (core-v1)', () => {
  test('TC-VA-01: fit screenshots 1440 / 1024 / 768 (32 systems with labels, track, phase, turn) + en copy (18)', async ({
    page,
    request,
  }) => {
    const { sessionId } = await createSession(request, REBELS_VS_AI);
    for (const [name, vp] of SIZES) {
      await page.setViewportSize(vp);
      await openCore(page, sessionId);
      await page.getByTestId(T.zoomFit).click();
      await waitViewportStable(page);
      for (const id of [T.timeTrack, T.phaseIndicator, T.turnIndicator]) {
        await expect(page.getByTestId(id), `${name} › ${id}`).toBeVisible();
      }
      await saveScreenshot(page, name, SWR005);
    }
    await page.setViewportSize(D);
    await page.goto('/settings');
    await page.getByTestId(T.settingsLanguage('en')).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await openCore(page, sessionId);
    await expect(page.getByTestId(T.prototypeBadge)).toHaveText(/Real map/);
    await saveScreenshot(page, '18-core-fit-1440-en', SWR005);
  });

  test('TC-VA-02: leader armed (04), keyboard activation picker (05), move panel (06), unit drag (07)', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    const plan = planActivation(view, [view.rebelBase.systemId!]);
    await openCore(page, sessionId);
    await armLeader(page, plan.leaderId);
    await openSidebarTab(page, 'objects');
    await saveScreenshot(page, '04-leader-armed-targets', SWR005);

    const input = page.getByTestId(T.activationSystemSelect).locator('input');
    await keyboardFocus(page, input);
    await page.keyboard.type(await systemName(page, plan.systemId));
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expectFieldFocus(input, 'activation picker');
    await saveScreenshot(page, '05-activation-keyboard', SWR005);

    await commandViaUi(page, () => page.getByTestId(T.activationConfirm).click());
    await page.getByTestId(T.movePiece(plan.pieceId)).check();
    await expect(page.getByTestId(T.movePanel)).toBeVisible();
    await saveScreenshot(page, '06-activation-move-panel', SWR005);
    await page.getByTestId(T.movePiece(plan.pieceId)).uncheck();

    await zoomToDetailAround(page, await midpoint(page, plan.fromSystemId, plan.systemId));
    const from = await dbg.piecePos(page, plan.pieceId);
    const to = await dbg.systemPos(page, plan.systemId);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 8, from.y + 8, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 12 });
    expect(await dbg.isDragging(page)).toBe(true);
    await saveScreenshot(page, '07-move-drag', SWR005);
    await commandViaUi(page, () => page.mouse.up());
  });

  test('TC-VA-03: AI auto-pass in the log (08) and the new round (09)', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    await activateViaApi(request, sessionId, view);
    await openCore(page, sessionId);
    const fin = await finishViaUi(page);
    const auto = fin.body.events.find((e) => e.type === 'PASSED')!;
    await openSidebarTab(page, 'log');
    await expect(page.getByTestId(T.logEntryAuto(auto.seq))).toBeVisible();
    await expectTextContrastDeep(page.getByTestId(T.logEntry(auto.seq)), 'auto-pass log entry');
    await saveScreenshot(page, '08-ai-autopass-log', SWR005);
    await passViaUi(page, true);
    await expect(page.getByTestId(T.timeTrack)).toHaveAttribute('data-time', '2');
    await expect(page.getByTestId(T.leaderPool).getByRole('radio')).toHaveCount(4);
    await saveScreenshot(page, '09-new-round', SWR005);
  });

  test('TC-VA-04/05 + TC-VA-12: hidden zone (10), base revealed (11), contested system (12) — not colour-only', async ({
    page,
    request,
  }) => {
    const { sessionId } = await createSession(request, EMPIRE_VS_AI);
    await openCore(page, sessionId);
    await openSidebarTab(page, 'objects');
    const zone = page.getByTestId(T.hiddenBaseZone);
    await zone.click();
    await expect(page.getByTestId(T.hiddenZonePanel)).toBeVisible();
    await expectTextContrastDeep(page.getByTestId(T.hiddenZonePanel), 'hidden zone panel');
    await saveScreenshot(page, '10-empire-hidden-zone', SWR005);

    const { seed } = await runSeedCommands(request, 'ai-empire-before-reveal');
    const baseId = seed.rebelBaseSystemId;
    await openCore(page, seed.sessionId);
    await openSidebarTab(page, 'log');
    await expect(page.locator('[data-type="BASE_REVEALED"]')).toHaveCount(1);
    await expect(page.getByTestId(T.mapSystem(baseId))).toHaveAttribute('data-rebel-base', 'true');
    await saveScreenshot(page, '11-base-revealed', SWR005);

    // D-1: contested = units of both sides; marked by text (list suffix, panel line) and data, not colour only.
    await openSidebarTab(page, 'objects');
    const item = page.getByTestId(T.systemItem(baseId));
    await expect(item).toHaveAttribute('data-contested', 'true');
    expect(await dbg.contested(page)).toContain(baseId);
    const turnRu = JSON.parse(
      readFileSync(
        new URL('../apps/web/src/games/rebellion/locales/ru/turn.json', import.meta.url),
        'utf8',
      ),
    ) as { list: { contested: string } };
    await expect(item).toContainText(turnRu.list.contested.trim());
    await item.click();
    await expect(page.getByTestId(T.systemPanelContested)).toBeVisible();
    await expectTextContrast(page.getByTestId(T.systemPanelContested), 'contested note');
    await saveScreenshot(page, '12-contested', SWR005);
  });

  test('TC-VA-06: game over banners (13 Rebels, 13b Empire) — readable, reason shown, no turn buttons', async ({
    page,
    request,
  }) => {
    const rebels = await gameOverRebels(request);
    await openCore(page, rebels);
    const banner = page.getByTestId(T.gameOverBanner);
    await expect(banner).toHaveAttribute('data-winner', 'rebels');
    await expect(page.getByTestId(T.turnControls)).toHaveCount(0);
    await expectTextContrastDeep(banner, 'game over banner');
    await expectNotClipped(page.getByTestId(T.gameOverReason), 'reason');
    await saveScreenshot(page, '13-game-over-rebels', SWR005);

    const { seed } = await runSeedCommands(request, 'hotseat-empire-before-win');
    await openCore(page, seed.sessionId);
    await expect(banner).toHaveAttribute('data-winner', 'empire');
    await expect(page.getByTestId(T.turnControls)).toHaveCount(0);
    await saveScreenshot(page, '13b-game-over-empire', SWR005);
  });

  test('TC-VA-07/08/09: core handoff (16), legacy table (15), game page with completed + legacy rows (14)', async ({
    page,
    request,
  }) => {
    const human = await createSession(request, REBELS_VS_HUMAN);
    await toHandoff(request, human.sessionId, human.view);
    await page.goto(sessionPath(human.sessionId));
    await expect(page.getByTestId(T.handoffScreen)).toBeVisible();
    await expect(page.getByTestId(T.boardCanvas)).toHaveCount(0);
    await expect(page.getByTestId(T.eventLog)).toHaveCount(0);
    await expectNoHorizontalScroll(page, 'handoff');
    await saveScreenshot(page, '16-hotseat-handoff-core', SWR005);

    const legacy = await seedLegacyV2('empireAi');
    await openLegacy(page, legacy.sessionId);
    await expect(page.getByTestId(T.prototypeBadge)).toHaveAttribute('data-variant', 'legacy');
    await expectTextContrastDeep(page.getByTestId(T.prototypeBadge), 'legacy badge');
    await saveScreenshot(page, '15-legacy-table', SWR005);

    const done = await gameOverRebels(request);
    await page.goto(gamePath(REBELLION));
    const rows = page.getByTestId(T.gameRecentSessions);
    await expect(
      rows.getByTestId(T.recentSession(done)).getByTestId(T.recentSessionStatus),
    ).toHaveAttribute('data-status', 'completed');
    await expect(
      rows.getByTestId(T.recentSession(legacy.sessionId)).getByTestId(T.recentSessionEngine),
    ).not.toBeEmpty();
    await saveScreenshot(page, '14-game-page-completed', SWR005);
  });

  test('TC-VA-10: top bar and panels at 1024×768 and 768×1024 — no overlap, no horizontal scroll, finish/pass not clipped', async ({
    page,
    request,
  }) => {
    const ai = await createSession(request, REBELS_VS_AI);
    await activateViaApi(request, ai.sessionId, ai.view); // activation: finish enabled, move panel shown
    for (const vp of [
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
    ]) {
      await page.setViewportSize(vp);
      await openCore(page, ai.sessionId);
      const label = `core ${vp.width}`;
      await expectNoOverflowNorOverlap(page.getByTestId(T.tableTopBar), `${label} top bar`);
      for (const id of [
        T.finishActivation,
        T.passTurn,
        T.timeTrack,
        T.phaseIndicator,
        T.prototypeBadge,
      ]) {
        await expectNotClipped(page.getByTestId(id), `${label} › ${id}`);
      }
      await expectNotClipped(page.getByTestId(T.movePanel), `${label} › move-panel`);
      await expectNoHorizontalScroll(page, label);
    }
  });

  test('TC-VA-11: visible focus — pool, picker, move checkbox / submit, finish, pass, dialog (17: focus on Cancel, Esc), banner', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    const plan = planActivation(view, [view.rebelBase.systemId!]);
    await openCore(page, sessionId);

    const tabStop = page.getByTestId(T.leaderPool).locator('[tabindex="0"]');
    await keyboardFocus(page, tabStop);
    await expectVisibleFocus(tabStop, 'leader pool');
    await page.keyboard.press('ArrowRight');
    const input = page.getByTestId(T.activationSystemSelect).locator('input');
    await keyboardFocus(page, input);
    await expectFieldFocus(input, 'activation picker');

    // Pass dialog: plan-frontend §5.3 step 5 — initial focus on «Cancel» (the safe action), Esc closes.
    await page.keyboard.press('Escape'); // closes the autocomplete popup if open
    const pass = page.getByTestId(T.passTurn);
    await keyboardFocus(page, pass);
    await expectVisibleFocus(pass, 'pass');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(T.passConfirm)).toBeVisible();
    await expect.poll(() => focusedInside(page, T.passConfirm)).toBe(true);
    await saveScreenshot(page, '17-pass-confirm', SWR005);
    await expect
      .soft(page.getByTestId(T.passConfirmCancel), 'dialog opens with focus on «Cancel»')
      .toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId(T.passConfirm)).toHaveCount(0);
    await expect(pass).toBeFocused();

    // Move panel / finish.
    await page.getByTestId(T.leader(plan.leaderId)).click();
    await commandViaUi(page, () => clickSystem(page, plan.systemId));
    const box = page.getByTestId(T.movePiece(plan.pieceId));
    await keyboardFocus(page, box);
    await expect(box).toBeFocused();
    await page.keyboard.press('Space');
    const submit = page.getByTestId(T.moveSubmit(plan.fromSystemId));
    await keyboardFocus(page, submit);
    await expectVisibleFocus(submit, 'move submit');
    const finish = page.getByTestId(T.finishActivation);
    await keyboardFocus(page, finish);
    await expectVisibleFocus(finish, 'finish activation');

    // Banner: the heading is focusable (tabIndex -1) — the focus move on the game-ending command is TC-E-07
    // (core-victory). Opening an already finished game follows RouteFocus (h1), see qa-results open question.
    const over = await gameOverRebels(request);
    await openCore(page, over);
    await expect(page.getByTestId(T.gameOverTitle)).toHaveAttribute('tabindex', '-1');
  });

  test('TC-VA-12: contrast of the new texts (track, phase, turn, pool, turn status, log, badge)', async ({
    page,
    request,
  }) => {
    const { sessionId } = await createSession(request, EMPIRE_VS_AI);
    await openCore(page, sessionId);
    await expectTextContrastDeep(page.getByTestId(T.timeTrack), 'time track');
    await expectTextContrastDeep(page.getByTestId(T.phaseIndicator), 'phase');
    await expectTextContrastDeep(page.getByTestId(T.turnIndicator), 'turn indicator');
    await expectTextContrastDeep(page.getByTestId(T.turnStatus), 'turn status');
    await expectTextContrastDeep(page.getByTestId(T.leaderPool), 'leader pool');
    await expectTextContrastDeep(page.getByTestId(T.prototypeBadge), 'slice badge');
    await expectTextContrastDeep(page.getByTestId(T.passedIndicator), 'passed indicator');
    await openSidebarTab(page, 'log');
    await expectTextContrastDeep(page.getByTestId(T.eventLog), 'event log');
    await openSidebarTab(page, 'objects');
    await expectTextContrastDeep(page.getByTestId(T.hiddenBaseZone), 'hidden zone item');
  });

  test('TC-VA-13: roles and names — pool radiogroup/radios, turn panel, banner region, live region announces the auto-pass', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    await openCore(page, sessionId);
    const pool = page.getByTestId(T.leaderPool);
    await expect(pool).toHaveRole('radiogroup');
    await expect(pool).toHaveAccessibleName(/\S/);
    for (const r of await pool.getByRole('radio').all()) await expect(r).toHaveAccessibleName(/\S/);
    await expect(page.getByTestId(T.turnPanel)).toHaveAccessibleName(/\S/);
    await expect(page.getByTestId(T.turnControls)).toHaveRole('group');
    await expect(page.getByTestId(T.boardCanvas)).toHaveAccessibleName(/\S/);

    await activateViaApi(request, sessionId, view);
    await page.reload();
    await openCore(page, sessionId);
    const live = page.getByTestId(T.liveRegion);
    const before = (await live.textContent()) ?? '';
    await finishViaUi(page);
    await expect.poll(async () => (await live.textContent()) ?? '').not.toBe(before);
    await expect(live).not.toBeEmpty();

    const over = await gameOverRebels(request);
    await openCore(page, over);
    await expect(page.getByTestId(T.gameOverBanner)).toHaveRole('region');
    await expect(page.getByTestId(T.gameOverBanner)).toHaveAccessibleName(/\S/);
  });

  test('TC-VA-14 (PO-1): opening a core table loads no external domains and no raster board images', async ({
    page,
    request,
    baseURL,
  }) => {
    const { sessionId } = await createSession(request, REBELS_VS_AI);
    const foreign: string[] = [];
    const images: string[] = [];
    const origin = new URL(baseURL!).origin;
    page.on('request', (r) => {
      const url = r.url();
      if (url.startsWith('data:') || url.startsWith('blob:')) return;
      if (new URL(url).origin !== origin) foreign.push(url);
      if (r.resourceType() === 'image' || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url))
        images.push(url);
    });
    await openCore(page, sessionId);
    await page.waitForLoadState('networkidle');
    expect(foreign).toEqual([]);
    expect(images, 'no raster images on the table').toEqual([]);
  });
});
