// SWR-004 visual & accessibility (test-cases.md §6): TC-VA-01..TC-VA-13, TC-VA-15 — AC-11 (+ AC-02, AC-07, AC-13, AC-14).
// Screenshots: docs/tasks/SWR-004/artifacts/screenshots/va-NN-<name>-{d,m}.png (support/board.ts saveScreenshot routing),
// D = 1440×900, M = 375×812, table also 1024×768 and 768×1024 (D-1, Q-22). Reduced motion, ru (default, Q-18) plus one
// en copy of the form. TC-VA-14 (reduced motion) is manual (test-cases.md §6).
// SWR-005: kept as SWR-004 regression on core-v1 tables (handoff via FINISH_ACTIVATION, top bar = core controls); its
// PNGs are routed to test-results/screenshots/SWR-004/ (task passed explicitly) — SWR-004 evidence is not rewritten.
// The SWR-005 visual/a11y cases (TC-VA-01..14 of SWR-005) live in core-visual-a11y.spec.ts.
import { expect, test, type Page } from '@playwright/test';
import { createSession, REBELLION, REBELS_VS_HUMAN, type SessionResponse } from './support/api';
import { toHandoff } from './support/core';
import {
  commonAncestor,
  expectBorderContrast,
  expectNoHorizontalScroll,
  expectNoOverflowNorOverlap,
  expectNotClipped,
  expectTextContrast,
  expectTextContrastDeep,
  expectVisibleFocus,
} from './support/a11y';
import {
  gamePath,
  keyboardFocus,
  newSessionPath,
  openSession,
  saveScreenshot,
  sessionPath,
} from './support/board';
import {
  expectCaption,
  expectErrorState,
  expectFaction,
  expectFormDefaults,
  fulfilError,
  routeCreate,
  waitCreate,
} from './support/setup';
import { RECENT_SESSION_ITEM, T } from './support/testids';

const SWR004 = 'SWR-004';
const D = { width: 1440, height: 900 };
const M = { width: 375, height: 812 };
const VIEWPORTS = [
  ['d', D],
  ['m', M],
] as const;

test.use({ reducedMotion: 'reduce', viewport: D });

async function openForm(page: Page) {
  await page.goto(newSessionPath(REBELLION));
  await expect(page.getByTestId(T.setupStart)).toBeVisible();
}

/** data-testid of the focused element (or its tag name). */
const focusedId = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el?.getAttribute('data-testid') ?? el?.tagName.toLowerCase() ?? null;
  });

test.describe('SWR-004 visual & accessibility', () => {
  test('TC-VA-01: game page with sessions (D, M) — no horizontal scroll on M', async ({
    page,
    request,
  }) => {
    await createSession(request);
    for (const [suffix, vp] of VIEWPORTS) {
      await page.setViewportSize(vp);
      await page.goto(gamePath(REBELLION));
      await expect(page.getByTestId(T.gameContinue)).toBeEnabled();
      await expect(
        page.getByTestId(T.gameRecentSessions).locator(RECENT_SESSION_ITEM),
      ).not.toHaveCount(0);
      await expectNoHorizontalScroll(page, `game page ${suffix}`);
      await saveScreenshot(page, `va-01-game-page-${suffix}`, SWR004);
    }
  });

  test('TC-VA-02..04: form defaults, Empire selected, human selected (D, M) + en copy', async ({
    page,
  }) => {
    for (const [suffix, vp] of VIEWPORTS) {
      await page.setViewportSize(vp);
      await openForm(page);
      await expectFormDefaults(page);
      await expectNoHorizontalScroll(page, `form ${suffix}`);
      const reb = await page.getByTestId(T.setupFaction('rebels')).boundingBox();
      const emp = await page.getByTestId(T.setupFaction('empire')).boundingBox();
      if (!reb || !emp) throw new Error('faction cards have no box');
      if (suffix === 'd') {
        // side by side
        expect(Math.abs(reb.y - emp.y)).toBeLessThan(4);
        expect(emp.x).toBeGreaterThanOrEqual(reb.x + reb.width - 1);
      } else {
        // stacked (plan-frontend §6)
        expect(emp.y).toBeGreaterThanOrEqual(reb.y + reb.height - 1);
      }
      await saveScreenshot(page, `va-02-new-session-defaults-${suffix}`, SWR004);

      await page.getByTestId(T.setupFaction('empire')).click();
      await expectFaction(page, 'empire');
      await expectCaption(page, 'rebels');
      await saveScreenshot(page, `va-03-empire-selected-${suffix}`, SWR004);

      await page.getByTestId(T.setupOpponent('human')).click();
      await expect(page.getByTestId(T.setupDifficulty)).toBeHidden();
      await expectNoHorizontalScroll(page, `form human ${suffix}`);
      // nothing overlaps after the difficulty block collapsed
      await expectNoOverflowNorOverlap(page.getByTestId(T.setupForm), `form human ${suffix}`);
      await saveScreenshot(page, `va-04-human-selected-${suffix}`, SWR004);
    }

    // Q-18: one English copy of the form.
    await page.setViewportSize(D);
    await page.goto('/settings');
    await page.getByTestId(T.settingsLanguage('en')).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await openForm(page);
    await expectFormDefaults(page);
    await saveScreenshot(page, 'va-02-new-session-defaults-en-d', SWR004);
  });

  test('TC-VA-05 + TC-VA-13: error state is visible next to the button (D, M) and reads as human text', async ({
    page,
  }) => {
    for (const [suffix, vp] of VIEWPORTS) {
      await page.setViewportSize(vp);
      await openForm(page);
      const matcher = await routeCreate(page, (route) =>
        fulfilError(route, 500, 'INTERNAL', 'errors.internal'),
      );
      const failed = waitCreate(page);
      await page.getByTestId(T.setupStart).click();
      await failed;
      await expectErrorState(page);
      await expect(page.getByTestId(T.setupError)).toBeInViewport();
      await expect(page.getByTestId(T.setupStart)).toBeInViewport();
      await saveScreenshot(page, `va-05-error-state-${suffix}`, SWR004);
      await page.unroute(matcher);
    }
  });

  test('TC-VA-06 + TC-VA-07: table with the prototype badge and the handoff screen (D, M)', async ({
    page,
    request,
  }) => {
    const ai = await createSession(request);
    const human = await createSession(request, REBELS_VS_HUMAN);
    await toHandoff(request, human.sessionId, human.view);
    for (const [suffix, vp] of VIEWPORTS) {
      await page.setViewportSize(vp);
      await openSession(page, ai.sessionId);
      await expectNotClipped(page.getByTestId(T.prototypeBadge), `prototype-badge ${suffix}`);
      await expectNoHorizontalScroll(page, `table ${suffix}`);
      await saveScreenshot(page, `va-06-table-prototype-badge-${suffix}`, SWR004);

      await page.goto(sessionPath(human.sessionId));
      await expect(page.getByTestId(T.handoffScreen)).toBeVisible();
      await expect(page.getByTestId(T.boardCanvas)).toHaveCount(0);
      await expect(page.getByTestId(T.eventLog)).toHaveCount(0);
      await expectNoHorizontalScroll(page, `handoff ${suffix}`);
      await saveScreenshot(page, `va-07-handoff-${suffix}`, SWR004);
    }
  });

  test('TC-VA-08 (D-1): table top bar at 1024×768 and 768×1024 does not overflow (AI and human games)', async ({
    page,
    request,
  }) => {
    const sessions: [string, SessionResponse][] = [
      ['ai', await createSession(request)],
      ['human', await createSession(request, REBELS_VS_HUMAN)],
    ];
    for (const vp of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, D]) {
      for (const [kind, s] of sessions) {
        await page.setViewportSize(vp);
        await openSession(page, s.sessionId);
        const label = `top bar ${kind} ${vp.width}`;
        const bar =
          (await page.getByTestId(T.tableTopBar).count()) > 0
            ? page.getByTestId(T.tableTopBar)
            : await commonAncestor(page, [T.timeTrack, T.passTurn, T.prototypeBadge]);
        await expectNoOverflowNorOverlap(bar, label);
        // SWR-005 core-v1 top bar (TC-VA-10 of SWR-005: finish/pass not clipped).
        const controls: string[] = [
          T.prototypeBadge,
          T.timeTrack,
          T.phaseIndicator,
          T.turnIndicator,
          T.finishActivation,
          T.passTurn,
        ];
        for (const id of controls) await expectNotClipped(page.getByTestId(id), `${label} › ${id}`);
        for (const id of [T.zoomIn, T.zoomOut, T.zoomFit]) {
          await expectNotClipped(page.getByTestId(id), `${label} › ${id}`);
        }
        await expectNoHorizontalScroll(page, label);
        if (vp !== D)
          await saveScreenshot(
            page,
            `va-08-table-${vp.width}${kind === 'human' ? '-human' : ''}`,
            SWR004,
          );
      }
    }
  });

  test('TC-VA-09 + TC-VA-10: keyboard-only path through the form, visible focus, Enter creates the session', async ({
    page,
  }) => {
    await openForm(page);
    // Reach the faction radiogroup with Tab only (RouteFocus starts on the h1, D-A-8).
    for (let i = 0; i < 10 && !(await focusedId(page))?.startsWith('setup-faction-'); i++) {
      await page.keyboard.press('Tab');
    }
    const rebels = page.getByTestId(T.setupFaction('rebels'));
    await expectVisibleFocus(rebels, 'faction radiogroup tab stop = the checked card');
    // the previous tab stop is "← back to game" (h1 is not a tab stop)
    await page.keyboard.press('Shift+Tab');
    expect(await focusedId(page)).toBe(T.newSessionBackToGame);
    await page.keyboard.press('Tab');
    await expect(rebels).toBeFocused();

    // Arrows change the choice inside the group (roving tabindex).
    await page.keyboard.press('ArrowRight');
    await expectVisibleFocus(page.getByTestId(T.setupFaction('empire')), 'empire card');
    await expectFaction(page, 'empire');
    await expectCaption(page, 'rebels');

    // One tab stop per group: Tab → opponent (checked = AI).
    await page.keyboard.press('Tab');
    await expectVisibleFocus(page.getByTestId(T.setupOpponent('ai')), 'opponent AI');
    await page.keyboard.press('Tab');
    await expectVisibleFocus(page.getByTestId(T.setupDifficultyOption('normal')), 'difficulty');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('ArrowRight');
    await expectVisibleFocus(page.getByTestId(T.setupOpponent('human')), 'opponent human');
    await expect(page.getByTestId(T.setupOpponent('human'))).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByTestId(T.setupDifficulty)).toBeHidden();

    // Ruleset: the disabled option is skipped by arrows and never focused.
    await page.keyboard.press('Tab');
    const base = page.getByTestId(T.setupRulesetOption('base'));
    await expectVisibleFocus(base, 'ruleset base');
    await page.keyboard.press('ArrowRight');
    await expect(base).toBeFocused();
    await expect(base).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId(T.setupRulesetOption('rise-of-the-empire'))).toHaveAttribute(
      'aria-checked',
      'false',
    );

    await page.keyboard.press('Tab');
    const digital = page.getByTestId(T.setupModeOption('digital'));
    await expectVisibleFocus(digital, 'mode digital');
    await page.keyboard.press('ArrowRight');
    await expect(digital).toBeFocused();
    await expect(digital).toHaveAttribute('aria-checked', 'true');

    await page.keyboard.press('Tab');
    const start = page.getByTestId(T.setupStart);
    await expectVisibleFocus(start, 'start');
    await saveScreenshot(page, 'va-09-keyboard-focus', SWR004);
    await page.keyboard.press('Tab');
    await expectVisibleFocus(page.getByTestId(T.setupCancel), 'cancel');
    await page.keyboard.press('Shift+Tab');
    await expect(start).toBeFocused();

    const created = waitCreate(page);
    await page.keyboard.press('Enter');
    const res = await created;
    expect(res.status()).toBe(201);
    expect(res.request().postDataJSON()).toEqual({
      gameId: REBELLION,
      setup: {
        playerFaction: 'empire',
        opponentType: 'human',
        ruleset: 'base',
        gameMode: 'digital',
      },
    });
    const { sessionId } = (await res.json()) as SessionResponse;
    await expect(page).toHaveURL(new RegExp(`/sessions/${sessionId}$`));
  });

  test('TC-VA-10 (lists, handoff): keyboard focus is visible on the game page rows and on "I am …"', async ({
    page,
    request,
  }) => {
    const human = await createSession(request, REBELS_VS_HUMAN);
    await page.goto(gamePath(REBELLION));
    await keyboardFocus(page, page.getByTestId(T.gameNewSession));
    await expectVisibleFocus(page.getByTestId(T.gameNewSession), 'new session');
    await keyboardFocus(page, page.getByTestId(T.recentSession(human.sessionId)));
    await expectVisibleFocus(page.getByTestId(T.recentSession(human.sessionId)), 'recent row');

    await toHandoff(request, human.sessionId, human.view);
    await page.goto(sessionPath(human.sessionId));
    await expect(page.getByTestId(T.handoffTitle)).toBeFocused(); // OQ-1
    await page.keyboard.press('Tab');
    await expectVisibleFocus(page.getByTestId(T.handoffAccept), 'handoff accept');
  });

  test('TC-VA-11: text and selection contrast (form, error, badge, handoff) — WCAG helper (TR-9)', async ({
    page,
    request,
  }) => {
    await openForm(page);
    for (const f of ['rebels', 'empire'] as const) {
      await page.getByTestId(T.setupFaction(f)).click();
      await expectTextContrastDeep(page.getByTestId(T.setupFaction(f)), `selected card ${f}`);
      // selection is not colour-only: the border of the selected card is a UI component (≥ 3:1, WCAG 1.4.11)
      await expectBorderContrast(page.getByTestId(T.setupFaction(f)), `selected card border ${f}`);
    }
    await expectTextContrastDeep(page.getByTestId(T.setupFaction('rebels')), 'unselected card');
    await expectTextContrast(page.getByTestId(T.setupOpponentCaption), 'opponent caption');
    await expectTextContrastDeep(page.getByTestId(T.setupPrototypeNote), 'prototype note');
    // Q-23: disabled "soon" options are exempt by WCAG, but must stay readable (≥ 3:1).
    await expectTextContrastDeep(
      page.getByTestId(T.setupRulesetOption('rise-of-the-empire')),
      'ruleset soon',
      3,
    );
    await expectTextContrastDeep(
      page.getByTestId(T.setupModeOption('physical_companion')),
      'mode soon',
      3,
    );
    await expectTextContrastDeep(page.getByTestId(T.setupStart), 'start button');

    const matcher = await routeCreate(page, (route) =>
      fulfilError(route, 500, 'INTERNAL', 'errors.internal'),
    );
    await page.getByTestId(T.setupStart).click();
    await expect(page.getByTestId(T.setupError)).toBeVisible();
    await expectTextContrastDeep(page.getByTestId(T.setupError), 'error alert');
    await page.unroute(matcher);

    const human = await createSession(request, REBELS_VS_HUMAN);
    await openSession(page, human.sessionId);
    await expectTextContrastDeep(page.getByTestId(T.prototypeBadge), 'prototype badge');
    await expectTextContrastDeep(page.getByTestId(T.passTurn), 'pass (core-v1)');
    await toHandoff(request, human.sessionId, human.view);
    await page.goto(sessionPath(human.sessionId));
    await expectTextContrastDeep(page.getByTestId(T.handoffScreen), 'handoff screen');
  });

  test('TC-VA-12: roles and names — radiogroups, radios, alert, busy button, handoff heading', async ({
    page,
    request,
  }) => {
    await openForm(page);
    const factions = page.getByTestId(T.setupFactionGroup);
    await expect(factions).toHaveRole('radiogroup');
    await expect(factions).toHaveAccessibleName(/\S/);
    for (const f of ['rebels', 'empire'] as const) {
      await expect(page.getByTestId(T.setupFaction(f))).toHaveRole('radio');
      await expect(page.getByTestId(T.setupFaction(f))).toHaveAccessibleName(/\S/);
    }
    expect(
      await factions.getByRole('radio', { checked: true }).count(),
      'exactly one checked faction',
    ).toBe(1);
    for (const id of [T.setupOpponentGroup, T.setupDifficulty, T.setupRuleset, T.setupMode]) {
      await expect(page.getByTestId(id)).toHaveRole('radiogroup');
      await expect(page.getByTestId(id)).toHaveAccessibleName(/\S/);
    }
    await expect(page.getByTestId(T.setupOpponentCaption)).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByTestId(T.setupStart)).toHaveRole('button');

    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    const matcher = await routeCreate(page, async (route) => {
      await released;
      await fulfilError(route, 500, 'INTERNAL', 'errors.internal');
    });
    await page.getByTestId(T.setupStart).click();
    await expect(page.getByTestId(T.setupStart)).toHaveAttribute('aria-busy', 'true');
    release();
    await expect(page.getByTestId(T.setupError)).toHaveRole('alert');
    await expect(page.getByTestId(T.setupStart)).not.toHaveAttribute('aria-busy', 'true');
    await page.unroute(matcher);

    const human = await createSession(request, REBELS_VS_HUMAN);
    await toHandoff(request, human.sessionId, human.view);
    await page.goto(sessionPath(human.sessionId));
    await expect(page.getByTestId(T.handoffTitle)).toHaveRole('heading');
    await expect(page.getByTestId(T.handoffTitle)).toBeFocused();
    await expect(page.getByTestId(T.handoffAccept)).toHaveRole('button');
    await expect(page.getByTestId(T.handoffAccept)).toHaveAccessibleName(/\S/);
  });

  test('TC-VA-15: the form loads only same-origin resources (emblems are local)', async ({
    page,
    baseURL,
  }) => {
    const foreign: string[] = [];
    const origin = new URL(baseURL!).origin;
    page.on('request', (r) => {
      const url = r.url();
      if (url.startsWith('data:') || url.startsWith('blob:')) return;
      if (new URL(url).origin !== origin) foreign.push(url);
    });
    await openForm(page);
    await page.getByTestId(T.setupFaction('empire')).click();
    await page.waitForLoadState('networkidle');
    expect(foreign).toEqual([]);
  });
});
