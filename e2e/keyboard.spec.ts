// Keyboard path: TC-E2E-28 (AC-6, AC-7) via the accessible alternative list (board-list: role=listbox / role=option +
// aria-selected). SWR-005 (Q-1): rewritten on core-v1 — select a system in the object list with the keyboard and
// activate it with `system-item-<id>-activate` (plan-frontend §5.3 step 3); the picker path is TC-E-10 (core-turn).
import { expect, test } from '@playwright/test';
import { asCore, createSession, planActivation, REBELS_VS_AI } from './support/api';
import { dbg, keyboardFocus, openCore } from './support/board';
import { tableVersion } from './support/core';
import { expectVisibleFocus } from './support/a11y';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

test('TC-E2E-28 (core-v1): keyboard-only — arm a leader, select a system in the object list, activate it; visible focus and aria-live feedback', async ({
  page,
  request,
}) => {
  const { sessionId, view } = await createSession(request, REBELS_VS_AI);
  const plan = planActivation(view, [view.rebelBase.systemId!]);
  await openCore(page, sessionId);
  const v0 = await tableVersion(page);

  // 1) Arm the planned leader in the pool (radiogroup, Space).
  const leader = page.getByTestId(T.leader(plan.leaderId));
  await keyboardFocus(page, page.getByTestId(T.leaderPool).locator('[tabindex="0"]'));
  for (let i = 0; i < 4 && !(await leader.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('ArrowRight');
  }
  // Arrows arm the leader they land on; the initial tab stop is only focused — Space must arm it
  // (plan-frontend §5.3 step 1, LeaderPool doc «Space/Enter/click arms»). Soft: on failure the test is reported
  // failed (defect) but continues via the arrow path (ArrowRight + ArrowLeft arm the planned leader).
  if ((await leader.getAttribute('aria-checked')) !== 'true') {
    await page.keyboard.press('Space');
    await expect
      .soft(leader, 'Space arms the focused leader')
      .toHaveAttribute('aria-checked', 'true');
    if ((await leader.getAttribute('aria-checked')) !== 'true') {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowLeft');
    }
  }
  await expect(leader).toHaveAttribute('aria-checked', 'true');

  // 2) Tab to the "objects" sidebar tab and activate it.
  const tab = page.getByTestId(T.sidebarTab('objects'));
  await keyboardFocus(page, tab);
  await page.keyboard.press('Enter');
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId(T.boardList)).toHaveRole('listbox');

  // 3) Into the listbox, arrows to the system option, Enter selects it (marked «can activate»).
  const option = page.getByTestId(T.systemItem(plan.systemId));
  await expect(option).toHaveRole('option');
  await expect(option).toHaveAttribute('data-activatable', 'true');
  await keyboardFocus(page, option);
  await expectVisibleFocus(option, 'system option');
  await page.keyboard.press('Enter');
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'system', id: plan.systemId });

  // 4) «Activate <system> with <leader>» right below the listbox, Enter.
  const action = page.getByTestId(T.systemItemActivate(plan.systemId));
  await keyboardFocus(page, action);
  await expectVisibleFocus(action, 'activate button');
  const cmd = page.waitForResponse((r) => r.url().endsWith('/commands'));
  await page.keyboard.press('Enter');
  const res = await cmd;
  expect(res.status()).toBe(200);
  expect(res.request().postDataJSON()).toMatchObject({
    command: { type: 'ACTIVATE_SYSTEM', leaderId: plan.leaderId, systemId: plan.systemId },
  });
  const after = asCore(((await res.json()) as { view: unknown }).view as never);
  expect(after.activation?.leaderId).toBe(plan.leaderId);
  await expect.poll(() => tableVersion(page)).toBe(v0 + 1);
  await expect(page.getByTestId(T.systemItem(plan.systemId))).toHaveAttribute(
    'data-activated',
    'true',
  );
  await expect(page.getByTestId(T.liveRegion)).not.toBeEmpty();
  // Focus after ACTIVATE → the move panel heading (plan-frontend §5.3).
  await expect
    .poll(() => page.getByTestId(T.movePanel).evaluate((el) => el.contains(document.activeElement)))
    .toBe(true);
});
