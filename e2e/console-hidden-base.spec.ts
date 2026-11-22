/// <reference lib="dom" />
// SWR-009 hidden information on the new console (test-cases.md TC-H-05, TC-H-06, TC-H-07, TC-H-09, TC-MF-06): an
// Empire game vs the AI Rebels — the hidden zone shows only the server's zone units as group markers, its Unit
// Manifest is «restricted» and names no system / region (ru + en names of all 32 systems and 8 regions); the base
// system never shows up in `getGroupMarkers` / `getAiRecentSystemIds` / `data-ai-recent` / `data-markers` beyond the
// public units there. The base id is learned only from the stored state (TR-3 oracle, `support/seed.ts`).
import { expect, test, type Page } from '@playwright/test';
import {
  actionOf,
  asCore,
  planActivation,
  REBELLION,
  scanForBase,
  type CorePlayerView,
  type SessionResponse,
} from './support/api';
import { dbg, newSessionPath, openSidebarTab, recordApi, waitForTable } from './support/board';
import {
  cdbg,
  expectedAiRecent,
  expectedGroups,
  expectedMarkersList,
  expectGroupMarkersMatchView,
  expectMapMirrorMatchesView,
  markersList,
  placeNamesIn,
} from './support/console';
import {
  armLeader,
  clickSystem,
  commandViaUi,
  eventsBy,
  expectAiTurn,
  expectTurn,
  finishViaUi,
} from './support/core';
import { storedRebelBase } from './support/seed';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

/** Hidden-zone surfaces (panel, manifest, map zone mirror) name no system / region and carry no system id. */
async function expectZoneSurfacesAnonymous(page: Page, baseId: string): Promise<void> {
  for (const id of [T.hiddenZonePanel, T.unitManifest, T.mapHiddenZone, T.hiddenBaseZone]) {
    for (const el of await page.getByTestId(id).all()) {
      const dump = await el.evaluate((node) => {
        const parts: string[] = [node.textContent ?? ''];
        for (const n of [node, ...Array.from(node.querySelectorAll('*'))])
          for (const a of Array.from(n.attributes)) parts.push(`${a.name}=${a.value}`);
        return parts.join('\n');
      });
      expect(placeNamesIn(dump), `${id}: no system/region names`).toEqual([]);
      expect(dump.includes(baseId), `${id}: no base id`).toBe(false);
      expect(dump, `${id}: no data-system-id`).not.toContain('data-system-id=');
    }
  }
}

/** The base system looks exactly like any system with the same public contents (TC-H-05 (b), TC-H-09). */
async function expectBaseNotSingledOut(
  page: Page,
  view: CorePlayerView,
  baseId: string,
): Promise<void> {
  expect(await dbg.rebelBase(page)).toBeNull();
  expect(
    (await cdbg.groupMarkers(page)).filter((m) => m.systemId === baseId).map((m) => m.count),
    'base system markers = only its public units',
  ).toEqual(
    (await dbg.lod(page)) === 'detail'
      ? expectedGroups(view, baseId).map((g) => g.count)
      : expect.any(Array),
  );
  expect(await cdbg.aiRecent(page), 'AIREC never names the base').not.toContain(baseId);
  const sys = page.getByTestId(T.mapSystem(baseId));
  await expect(sys).toHaveAttribute('data-ai-recent', 'false');
  await expect(sys).not.toHaveAttribute('data-rebel-base', /.*/);
  expect(markersList(await sys.getAttribute('data-markers'))).toEqual(
    expectedMarkersList(view, baseId),
  );
}

test.describe('SWR-009 hidden base on the console (Empire vs AI Rebels)', () => {
  test('TC-H-05/06/07/09, TC-MF-06: zone markers = zone units, restricted manifest without place names, base absent from markers / AI marks / debug API', async ({
    page,
  }) => {
    const recorder = recordApi(page);
    await page.goto(newSessionPath(REBELLION));
    await page.getByTestId(T.setupFaction('empire')).click();
    const created = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/sessions',
    );
    await page.getByTestId(T.setupStart).click();
    const res = await created;
    expect(res.status()).toBe(201);
    const body = (await res.json()) as SessionResponse;
    let view = asCore(body.view);
    const baseId = await storedRebelBase(body.sessionId);
    expect(view.rebelBase).toEqual({ systemId: null, revealed: false });
    await waitForTable(page, body.sessionId, { engine: 'core-v1' });
    await expectTurn(page, 'empire');

    // The AI Rebels' first turn ran inside the create request. Its marks (if the client got `lastRun`, QD-3) come only
    // from the redacted AI events: the base never, a `null` system → the zone.
    const firstRec = expectedAiRecent(view.log, 'rebels');
    const shownFirst = await cdbg.aiRecent(page);
    const zoneFirst = await page.getByTestId(T.mapHiddenZone).getAttribute('data-ai-recent');
    test.info().annotations.push({
      type: 'ai-first-turn',
      description: `log AIREC ${firstRec.systemIds.join(',') || '∅'} zone=${firstRec.zone}; shown ${shownFirst.join(',') || '∅'} zone=${zoneFirst}`,
    });
    expect(shownFirst).not.toContain(baseId);
    if (shownFirst.length > 0 || zoneFirst === 'true') {
      expect(shownFirst).toEqual(firstRec.systemIds);
      expect(zoneFirst).toBe(String(firstRec.zone));
    }

    // Zone markers (map mirror + debug API) = exactly the zone units the server sent.
    const zoneGroups = expectedGroups(view, null);
    expect(zoneGroups.length, 'the zone holds Rebel units').toBeGreaterThan(0);
    const zone = page.getByTestId(T.mapHiddenZone);
    expect(markersList(await zone.getAttribute('data-markers'))).toEqual(
      expectedMarkersList(view, null),
    );
    await expect(zone).toHaveAttribute('data-ai-recent', /true|false/);
    await expectMapMirrorMatchesView(page, view);
    await expectGroupMarkersMatchView(page, view);
    expect((await cdbg.groupMarkers(page)).filter((m) => m.systemId === null).length).toBe(
      zoneGroups.length,
    );
    await expectBaseNotSingledOut(page, view, baseId);

    // Zone panel → markers (not a unit list) → restricted manifest, by keyboard (Enter on the DOM marker).
    await openSidebarTab(page, 'objects');
    await page.getByTestId(T.hiddenBaseZone).click();
    const panel = page.getByTestId(T.hiddenZonePanel);
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-testid^="piece-item-"]')).toHaveCount(0);
    const g = zoneGroups[0]!;
    const marker = page.getByTestId(T.mapMarkerZone(g.owner, g.arena));
    await expect(marker).toHaveAttribute('data-count', String(g.count));
    await marker.focus();
    await page.keyboard.press('Enter');
    const manifest = page.getByTestId(T.unitManifest);
    await expect(manifest).toBeVisible();
    await expect(manifest).toHaveAttribute('data-zone', 'hidden');
    await expect(manifest).toHaveAttribute('data-restricted', 'true');
    await expect(manifest).toHaveAttribute('data-state', 'restricted');
    await expect(manifest).not.toHaveAttribute('data-system-id', /.*/);
    await expect(manifest).toHaveAttribute(
      'data-total',
      String(zoneGroups.reduce((n, x) => n + x.count, 0)),
    );
    for (const zg of zoneGroups) {
      await expect(page.getByTestId(T.unitManifestGroup(zg.owner, zg.arena))).toHaveAttribute(
        'data-count',
        String(zg.count),
      );
      for (const [typeKey, n] of zg.types)
        await expect(page.getByTestId(T.unitManifestRow(zg.owner, typeKey))).toHaveAttribute(
          'data-count',
          String(n),
        );
    }
    expect(await dbg.selection(page)).toEqual({ kind: 'zone', id: null });
    await expectZoneSurfacesAnonymous(page, baseId);
    await page.getByTestId(T.unitManifestClose).click();
    await expect(manifest).toHaveCount(0);

    // TC-H-07: manifest of the base system vs a system of the same public contents — same structure.
    await page.getByTestId(T.systemItem(baseId)).click();
    await expect(page.getByTestId(T.coreSystemPanel)).toHaveAttribute('data-system-id', baseId);
    await expect(page.getByTestId(T.coreSystemPanel)).not.toContainText(
      /База Повстанцев|Rebel base/,
    );
    await expect(
      page.getByTestId(T.coreSystemPanel).locator('[data-testid^="map-marker-"]'),
    ).toHaveCount(expectedGroups(view, baseId).length);

    // Empire turns → AI Rebels turns (up to 3, until the AI acted on the map): marks never name the base; the zone is
    // marked only through `null` (redacted) systems of AI events.
    const turns: string[] = [];
    for (let turn = 0; turn < 3; turn++) {
      if (view.outcome !== null || view.activeSide !== 'empire' || view.rebelBase.revealed) break;
      if (!actionOf(view, 'ACTIVATE_SYSTEM')) break;
      const plan = planActivation(view, []);
      await armLeader(page, plan.leaderId);
      await commandViaUi(page, () => clickSystem(page, plan.systemId));
      const fin = await finishViaUi(page);
      // after the AI Rebels passed for the phase the Empire keeps the turn (no AI step in this response)
      if (fin.body.automation.steps > 0) expectAiTurn(fin.body, 'rebels');
      view = fin.view;
      const rec = expectedAiRecent(fin.body.events, 'rebels');
      turns.push(
        `${eventsBy(fin.body, 'rebels')
          .map((e) => e.type)
          .join('+')} → AIREC ${rec.systemIds.join(',') || '∅'} zone=${rec.zone}`,
      );
      expect(rec.systemIds, 'redacted AI events never carry the base').not.toContain(baseId);
      if (view.rebelBase.revealed) break;
      await expect.poll(() => cdbg.aiRecent(page)).toEqual(rec.systemIds);
      await expect(page.getByTestId(T.mapHiddenZone)).toHaveAttribute(
        'data-ai-recent',
        String(rec.zone),
      );
      await expectMapMirrorMatchesView(page, view);
      await expectGroupMarkersMatchView(page, view);
      await expectBaseNotSingledOut(page, view, baseId);
      await expectZoneSurfacesAnonymous(page, baseId);
      if (rec.systemIds.length > 0 || rec.zone) break;
    }
    test.info().annotations.push({ type: 'ai-turns', description: turns.join(' | ') || 'none' });

    await recorder.settle();
    for (const c of recorder.calls.filter((x) => x.status < 500))
      expect(scanForBase(c.body, baseId), `${c.method} ${c.url}`).toEqual([]);
  });
});
