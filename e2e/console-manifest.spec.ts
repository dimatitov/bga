/// <reference lib="dom" />
// SWR-009 group markers, Unit Manifest, map legend and the responsive console (test-cases.md TC-MK-04, TC-MK-05,
// TC-MK-06, TC-MK-07, TC-MF-11, TC-MF-12 (sheet), TC-CON-03 (legend), TC-RSP-01 (no horizontal scroll)). Counts are the
// `COUNT(x, side, arena)` oracle from the server view of the same side (support/console.ts).
import { expect, test, type Locator, type Page } from '@playwright/test';
import { createSession, REBELS_VS_AI, type CorePlayerView } from './support/api';
import { expectNoHorizontalScroll } from './support/a11y';
import {
  dbg,
  isFocused,
  keyboardFocus,
  openCore,
  openSidebarTab,
  waitViewportStable,
} from './support/board';
import {
  expectedGroups,
  expectGroupMarkersMatchView,
  expectMapMirrorMatchesView,
  systemsByGroups,
  type ExpectedGroup,
} from './support/console';
import { zoomToDetailAround } from './support/core';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

/** The open manifest shows exactly the oracle groups / rows of `systemId`. */
async function expectManifestMatches(
  page: Page,
  view: CorePlayerView,
  systemId: string,
  selected: Pick<ExpectedGroup, 'owner' | 'arena'> | null,
): Promise<void> {
  const groups = expectedGroups(view, systemId);
  const manifest = page.getByTestId(T.unitManifest);
  await expect(manifest).toBeVisible();
  await expect(manifest).toHaveAttribute('data-system-id', systemId);
  await expect(manifest).toHaveAttribute('data-restricted', 'false');
  await expect(manifest).toHaveAttribute(
    'data-total',
    String(groups.reduce((n, g) => n + g.count, 0)),
  );
  await expect(manifest.locator('[data-testid^="unit-manifest-group-"]')).toHaveCount(
    groups.length,
  );
  let rows = 0;
  for (const g of groups) {
    const group = page.getByTestId(T.unitManifestGroup(g.owner, g.arena));
    await expect(group).toHaveAttribute('data-count', String(g.count));
    const isSel = selected !== null && selected.owner === g.owner && selected.arena === g.arena;
    await expect(group).toHaveAttribute('data-selected', String(isSel));
    for (const [typeKey, n] of g.types) {
      await expect(group.getByTestId(T.unitManifestRow(g.owner, typeKey))).toHaveAttribute(
        'data-count',
        String(n),
      );
      rows++;
    }
  }
  await expect(manifest.locator('[data-testid^="unit-manifest-row-"]')).toHaveCount(rows);
}

/** Shift+Tab until `target` is focused (the rail inspector sits before the sidebar tabs in the DOM order). */
async function keyboardFocusBack(page: Page, target: Locator, maxSteps = 80): Promise<void> {
  for (let i = 0; i < maxSteps; i++) {
    if (await isFocused(target)) return;
    await page.keyboard.press('Shift+Tab');
  }
  throw new Error(`could not reach target by Shift+Tab in ${maxSteps} steps`);
}

test.describe('SWR-009 group markers and the Unit Manifest', () => {
  test('TC-MK-04: group markers (debug API, compact + detail LOD) and the map mirror = view.units for all 32 systems', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    await openCore(page, sessionId);
    await expectMapMirrorMatchesView(page, view);
    await expectGroupMarkersMatchView(page, view); // fit (whatever LOD the fit gives)
    const target = systemsByGroups(view)[0]!;
    await zoomToDetailAround(page, await dbg.systemPos(page, target));
    await expectGroupMarkersMatchView(page, view);
    await page.getByTestId(T.zoomFit).click();
    await waitViewportStable(page);
    if ((await dbg.lod(page)) === 'detail') {
      // make sure the compact form is exercised too
      for (let i = 0; i < 8 && (await dbg.lod(page)) !== 'compact'; i++) {
        await page.getByTestId(T.zoomOut).click();
        await waitViewportStable(page);
      }
    }
    test.info().annotations.push({ type: 'lod-after-fit', description: await dbg.lod(page) });
    await expectGroupMarkersMatchView(page, view);
  });

  test('TC-MK-06 / TC-MF-11: keyboard only — Objects → system → Tab to the marker → Enter opens the Unit Manifest = view; Close returns focus', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    await openCore(page, sessionId);
    const systemId = systemsByGroups(view)[0]!;
    const group = expectedGroups(view, systemId)[0]!;

    await openSidebarTab(page, 'objects');
    const item = page.getByTestId(T.systemItem(systemId));
    await keyboardFocus(page, item);
    await page.keyboard.press('Enter');
    expect(await dbg.selection(page)).toEqual({ kind: 'system', id: systemId });
    await expect(page.getByTestId(T.coreSystemPanel)).toHaveAttribute('data-system-id', systemId);
    // system panel lists markers, not units (SWR-009: rows only in the manifest)
    await expect(
      page.getByTestId(T.coreSystemPanel).locator('[data-testid^="piece-item-"]'),
    ).toHaveCount(0);

    const marker = page.getByTestId(T.mapMarker(systemId, group.owner, group.arena));
    await expect(marker).toHaveAttribute('data-count', String(group.count));
    await keyboardFocusBack(page, marker);
    expect(await marker.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(T.unitManifest)).toHaveAttribute('data-variant', 'rail');
    await expectManifestMatches(page, view, systemId, group);
    expect(await dbg.selection(page)).toEqual({ kind: 'system', id: systemId });

    // Close (keyboard) → back to the system inspector, focus on the invoking marker.
    const close = page.getByTestId(T.unitManifestClose);
    await close.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId(T.unitManifest)).toHaveCount(0);
    await expect(page.getByTestId(T.coreSystemPanel)).toHaveAttribute('data-system-id', systemId);
    await expect
      .poll(() => isFocused(page.getByTestId(T.mapMarker(systemId, group.owner, group.arena))))
      .toBe(true);
  });

  test('TC-MK-05: mouse click on a group marker of the canvas (detail LOD) → system selected + manifest with that group', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    await openCore(page, sessionId);
    const systemId = systemsByGroups(view)[0]!;
    await zoomToDetailAround(page, await dbg.systemPos(page, systemId));
    const markers = (await page.evaluate(() => window.__boardDebug!.getGroupMarkers!())).filter(
      (m) => m.systemId === systemId,
    );
    expect(markers.length).toBe(expectedGroups(view, systemId).length);
    const m = markers[markers.length - 1]!;
    expect(m.arena).not.toBe('all');
    await page.mouse.click(m.screen.x, m.screen.y);
    expect(await dbg.selection(page)).toEqual({ kind: 'system', id: systemId });
    await expectManifestMatches(page, view, systemId, {
      owner: m.side,
      arena: m.arena as 'space' | 'ground',
    });
    // The rail shows the manifest instead of the system panel (its DOM markers come back on «Закрыть»).
    await expect(page.getByTestId(T.coreSystemPanel)).toHaveCount(0);
    await page.getByTestId(T.unitManifestClose).click();
    await expect(page.getByTestId(T.mapMarker(systemId, m.side, m.arena))).toHaveAttribute(
      'data-count',
      String(m.count),
    );
  });

  test('TC-MK-07: compact LOD — a click on a side plate opens the manifest with the whole side selected', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    await openCore(page, sessionId);
    for (let i = 0; i < 8 && (await dbg.lod(page)) !== 'compact'; i++) {
      await page.getByTestId(T.zoomOut).click();
      await waitViewportStable(page);
    }
    test.skip((await dbg.lod(page)) !== 'compact', 'the map never reached the compact LOD');
    const systemId = systemsByGroups(view)[0]!;
    const plate = (await page.evaluate(() => window.__boardDebug!.getGroupMarkers!())).find(
      (m) => m.systemId === systemId && m.count > 0,
    )!;
    expect(plate.arena).toBe('all');
    const side = expectedGroups(view, systemId).filter((g) => g.owner === plate.side);
    expect(plate.count).toBe(side.reduce((n, g) => n + g.count, 0));
    await page.mouse.click(plate.screen.x, plate.screen.y);
    expect(await dbg.selection(page)).toEqual({ kind: 'system', id: systemId });
    const manifest = page.getByTestId(T.unitManifest);
    await expect(manifest).toHaveAttribute('data-system-id', systemId);
    for (const g of expectedGroups(view, systemId)) {
      await expect(page.getByTestId(T.unitManifestGroup(g.owner, g.arena))).toHaveAttribute(
        'data-selected',
        String(g.owner === plate.side),
      );
    }
  });
});

test.describe('SWR-009 map legend', () => {
  test('TC-CON-03: the essential legend row is always visible; «Легенда» toggles the full legend (aria-expanded) by mouse and keyboard', async ({
    page,
    request,
  }) => {
    const { sessionId } = await createSession(request, REBELS_VS_AI);
    await openCore(page, sessionId);
    const legend = page.getByTestId(T.mapLegend);
    await expect(legend).toBeVisible();
    await expect(page.getByTestId(T.mapHousing).getByTestId(T.mapLegend)).toBeVisible();
    await expect(page.getByTestId(T.mapLegendRow)).toBeVisible();
    const toggle = page.getByTestId(T.mapLegendToggle);
    const full = page.getByTestId(T.mapLegendFull);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(full).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(full).toBeVisible();
    const items = full.locator('[data-testid^="map-legend-"]');
    expect(await items.count()).toBeGreaterThan(0);
    for (const item of await items.all()) {
      await expect(item).toBeVisible();
      expect((await item.innerText()).trim().length, 'legend key has text').toBeGreaterThan(0);
    }
    // Keyboard: the toggle is a regular button (Enter toggles); focus stays on it.
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(full).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Enter');
    await expect(full).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Enter');
    await expect(full).toBeHidden();
    expect(await isFocused(toggle)).toBe(true);
  });
});

test.describe('SWR-009 responsive console', () => {
  const SIZES = [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 375, height: 812 },
  ];

  test('TC-RSP-01: the table has no horizontal scroll at 1440×900, 1280×800, 1024×768, 768×1024, 375×812', async ({
    page,
    request,
  }) => {
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    for (const size of SIZES) {
      await page.setViewportSize(size);
      await openCore(page, sessionId);
      for (const id of [
        T.consoleHeader,
        T.tableTopBar,
        T.mapHousing,
        T.coreSidebar,
        T.consoleFooter,
      ])
        await expect(page.getByTestId(id), `${id} at ${size.width}`).toBeAttached();
      await expectNoHorizontalScroll(page, `table ${size.width}×${size.height}`);
      // and after opening a manifest (rail or sheet)
      const systemId = systemsByGroups(view)[0]!;
      const g = expectedGroups(view, systemId)[0]!;
      await openSidebarTab(page, 'objects');
      await page.getByTestId(T.systemItem(systemId)).click();
      await page.getByTestId(T.mapMarker(systemId, g.owner, g.arena)).click();
      await expect(page.getByTestId(T.unitManifest)).toBeVisible();
      await expectNoHorizontalScroll(page, `table + manifest ${size.width}×${size.height}`);
    }
  });

  test('TC-MF-12: 375×812 — the manifest is a bottom sheet (data-variant=sheet) with rows = view; Close returns to the system panel', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    await openCore(page, sessionId);
    const systemId = systemsByGroups(view)[0]!;
    const g = expectedGroups(view, systemId)[0]!;
    await openSidebarTab(page, 'objects');
    await page.getByTestId(T.systemItem(systemId)).click();
    const marker = page.getByTestId(T.mapMarker(systemId, g.owner, g.arena));
    await marker.click();
    await expect(page.getByTestId(T.unitManifestSheet)).toBeVisible();
    await expect(page.getByTestId(T.unitManifest)).toHaveAttribute('data-variant', 'sheet');
    await expectManifestMatches(page, view, systemId, g);
    const sheetBox = await page.getByTestId(T.unitManifestSheet).boundingBox();
    expect(sheetBox!.x).toBeGreaterThanOrEqual(-1);
    expect(sheetBox!.x + sheetBox!.width).toBeLessThanOrEqual(376);
    await expectNoHorizontalScroll(page, 'sheet 375');
    await page.getByTestId(T.unitManifestClose).click();
    await expect(page.getByTestId(T.unitManifest)).toHaveCount(0);
    await expect(page.getByTestId(T.unitManifestSheet)).toHaveCount(0);
    await expect(page.getByTestId(T.coreSystemPanel)).toHaveAttribute('data-system-id', systemId);
  });
});
