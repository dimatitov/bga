// Scenario 4 — selection: TC-E2E-13..16 (AC-6, AC-10). SWR-005 (Q-1): rewritten on core-v1 — systems, own / enemy
// units, the hidden-zone, background click and Esc (Esc priority: armed leader → selection, plan-frontend §5.3 step 6).
import { expect, test, type Page } from '@playwright/test';
import {
  actionOf,
  coreMoveActions,
  createSession,
  EMPIRE_VS_AI,
  REBELS_VS_AI,
  unitsIn,
  type CorePlayerView,
} from './support/api';
import { dbg, emptyCoreCanvasPoint, openCore, openSidebarTab } from './support/board';
import { armLeader, clickSystem, zoomToDetailAround } from './support/core';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

/** A system with units of both… or at least with one unit of `owner` (from the view). */
function systemWithUnit(view: CorePlayerView, owner: 'rebels' | 'empire'): string {
  const u = view.units.find((x) => x.owner === owner && x.location.kind === 'system');
  if (!u || u.location.kind !== 'system') throw new Error(`no ${owner} unit on the map`);
  return u.location.systemId;
}

async function clickUnit(page: Page, unitId: string) {
  const pos = await dbg.piecePos(page, unitId);
  await page.mouse.click(pos.x, pos.y);
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'piece', id: unitId });
}

test('TC-E2E-13 (core-v1): clicking a system selects it and opens the system panel', async ({
  page,
  request,
}) => {
  const { sessionId, view } = await createSession(request, REBELS_VS_AI);
  const systemId = systemWithUnit(view, 'empire');
  await openCore(page, sessionId);
  await clickSystem(page, systemId);

  await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'system', id: systemId });
  await expect(page.getByTestId(T.systemItem(systemId))).toHaveAttribute('aria-selected', 'true');
  const panel = page.getByTestId(T.coreSystemPanel);
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-system-id', systemId);
  await expect(panel).not.toBeEmpty();
  // No leader armed → the panel offers no activation.
  await expect(page.getByTestId(T.systemPanelActivate)).toHaveCount(0);
  for (const other of view.map.systems.filter((s) => s.id !== systemId)) {
    await expect(page.getByTestId(T.systemItem(other.id))).not.toHaveAttribute(
      'aria-selected',
      'true',
    );
  }
});

test('TC-E2E-14 (core-v1): own unit → unit panel; armed leader → exactly the server targets; activation → exactly the server move sources', async ({
  page,
  request,
}) => {
  const { sessionId, view } = await createSession(request, REBELS_VS_AI);
  const from = systemWithUnit(view, 'rebels');
  const own = unitsIn(view, from).find((u) => u.owner === 'rebels')!;
  await openCore(page, sessionId);

  await zoomToDetailAround(page, await dbg.systemPos(page, from));
  await clickUnit(page, own.id);
  await expect(page.getByTestId(T.unitPanel)).toHaveAttribute('data-unit-id', own.id);
  await expect(page.getByTestId(T.pieceItem(own.id))).toHaveAttribute('aria-selected', 'true');
  expect(await dbg.moveSources(page), 'no activation → no move sources').toEqual([]);

  const activate = actionOf(view, 'ACTIVATE_SYSTEM')!;
  await armLeader(page, activate.leaderIds[0]!);
  expect(await dbg.highlighted(page)).toEqual([...activate.systemIds].sort());
  for (const id of activate.systemIds) {
    await expect(page.getByTestId(T.systemItem(id))).toHaveAttribute('data-activatable', 'true');
    await expect(page.getByTestId(T.mapSystem(id))).toHaveAttribute('data-target', 'true');
  }
  const target = view.map.systems.find((s) => s.adjacentSystemIds.includes(from))!.id;
  const res = page.waitForResponse((r) => r.url().endsWith('/commands'));
  await page.getByTestId(T.leader(activate.leaderIds[0]!)).focus();
  await clickSystem(page, target);
  const after = (await (await res).json()) as { view: CorePlayerView };
  const sources = coreMoveActions(after.view)
    .map((m) => m.fromSystemId)
    .sort();
  await expect.poll(() => dbg.moveSources(page)).toEqual(sources);
  for (const s of after.view.map.systems) {
    await expect(page.getByTestId(T.mapSystem(s.id))).toHaveAttribute(
      'data-source',
      String(sources.includes(s.id)),
    );
  }
});

test('TC-E2E-15 (core-v1): enemy units and the hidden zone offer no commands', async ({
  page,
  request,
}) => {
  const { sessionId, view } = await createSession(request, EMPIRE_VS_AI);
  const enemySystem = systemWithUnit(view, 'rebels');
  const enemy = unitsIn(view, enemySystem).find((u) => u.owner === 'rebels')!;
  await openCore(page, sessionId);
  await zoomToDetailAround(page, await dbg.systemPos(page, enemySystem));
  await clickUnit(page, enemy.id);
  await expect(page.getByTestId(T.unitPanel)).toHaveAttribute('data-unit-id', enemy.id);
  await expect(page.getByTestId(T.movePanel)).toHaveCount(0);
  expect(await dbg.highlighted(page)).toEqual([]);
  expect(view.legalActions.some((a) => a.type === 'MOVE_PIECES')).toBe(false);

  await openSidebarTab(page, 'objects');
  await page.getByTestId(T.hiddenBaseZone).click();
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'zone', id: null });
  await expect(page.getByTestId(T.hiddenZonePanel)).toBeVisible();
  await expect(page.getByTestId(T.movePanel)).toHaveCount(0);
});

test('TC-E2E-16 (core-v1): background click (< 4 px) and Esc clear the selection; Esc first drops an armed leader', async ({
  page,
  request,
}) => {
  const { sessionId, view } = await createSession(request, REBELS_VS_AI);
  const systemId = systemWithUnit(view, 'empire');
  await openCore(page, sessionId);
  const select = async () => {
    await clickSystem(page, systemId);
    await expect.poll(() => dbg.selection(page)).toEqual({ kind: 'system', id: systemId });
  };

  await select();
  const empty = await emptyCoreCanvasPoint(page, view);
  await page.mouse.click(empty.x, empty.y);
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: null, id: null });
  await expect(page.getByTestId(T.coreSystemPanel)).toHaveCount(0);

  await select();
  await page.keyboard.press('Escape');
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: null, id: null });

  // Armed leader + selection: the first Esc disarms, the second clears the selection.
  const leader = actionOf(view, 'ACTIVATE_SYSTEM')!.leaderIds[0]!;
  await openSidebarTab(page, 'objects');
  await page.getByTestId(T.systemItem(systemId)).click();
  await armLeader(page, leader);
  await page.getByTestId(T.gameTable).locator('h1').first().focus();
  await page.keyboard.press('Escape');
  await expect.poll(() => dbg.armedLeader(page)).toBeNull();
  expect(await dbg.selection(page)).toEqual({ kind: 'system', id: systemId });
  await page.keyboard.press('Escape');
  await expect.poll(() => dbg.selection(page)).toEqual({ kind: null, id: null });
});
