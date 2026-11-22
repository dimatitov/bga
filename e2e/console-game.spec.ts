/// <reference lib="dom" />
// SWR-009 Galactic Vector Terminal — the real game on the new console (test-cases.md TC-MAIN-01 (core path), TC-CON-01,
// TC-CON-03, TC-MAP-04/05, TC-SS-05, TC-AI-01, TC-AI-03, TC-AI-06, TC-FN-01..03, TC-MK-04): a Rebels game vs the
// deterministic e2e bot created through the form → arm a leader → select a system → «Активировать систему»
// (`turn-activate`) → move → finish → the AI turn → «recent AI» marks on the map (`data-ai-recent`, debug API) and the
// AI tag in the log → own command clears the marks → pass with confirmation. Everything is compared with the server
// response of the same side (Q-BE-8: properties of the AI turn, never its exact moves).
import { expect, test } from '@playwright/test';
import {
  actionOf,
  asCore,
  CORE_SYSTEM_COUNT,
  planActivation,
  REBELLION,
  type CorePlayerView,
  type SessionResponse,
} from './support/api';
import { expectNoHorizontalScroll } from './support/a11y';
import { dbg, newSessionPath, openSidebarTab, waitForTable } from './support/board';
import {
  cdbg,
  expectedAiRecent,
  expectGroupMarkersMatchView,
  expectMapMirrorMatchesView,
} from './support/console';
import {
  armLeader,
  clickSystem,
  commandViaUi,
  eventsBy,
  eventsOf,
  expectAiTurn,
  expectTurn,
  finishViaUi,
  passViaUi,
} from './support/core';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

test.describe('SWR-009 console: a real game vs the bot', () => {
  test('TC-MAIN-01 (core path): create → arm → select → turn-activate → move → finish → AI turn → AI marks + log tag → own command clears marks → pass with confirm', async ({
    page,
  }) => {
    // 1. Create «Rebels (you) vs AI-bot, normal» through the form (defaults).
    await page.goto(newSessionPath(REBELLION));
    const created = page.waitForResponse(
      (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/sessions',
    );
    await page.getByTestId(T.setupStart).click();
    const res = await created;
    expect(res.status()).toBe(201);
    const body = (await res.json()) as SessionResponse;
    let view: CorePlayerView = asCore(body.view);
    expect(view.viewer).toBe('rebels');
    await waitForTable(page, body.sessionId, { engine: 'core-v1' });
    await expectTurn(page, 'rebels');

    // 2. Console shell (TC-CON-01): header → status bar → map housing | rail → footer, no horizontal scroll.
    const box = async (id: string) => {
      const b = await page.getByTestId(id).boundingBox();
      expect(b, `${id} has a box`).not.toBeNull();
      return b!;
    };
    const header = await box(T.consoleHeader);
    const status = await box(T.tableTopBar);
    const housing = await box(T.mapHousing);
    const rail = await box(T.coreSidebar);
    const footer = await box(T.consoleFooter);
    expect(header.y + header.height).toBeLessThanOrEqual(status.y + 1);
    expect(status.y + status.height).toBeLessThanOrEqual(housing.y + 1);
    expect(housing.x + housing.width).toBeLessThanOrEqual(rail.x + 1);
    expect(Math.max(housing.y + housing.height, rail.y + rail.height)).toBeLessThanOrEqual(
      footer.y + 1,
    );
    await expectNoHorizontalScroll(page, 'console 1440×900');
    await expect(page.getByTestId(T.turnIndicator)).toHaveAttribute('data-mine', 'true');
    await expect(page.getByTestId(T.timeTrack)).toHaveAttribute(
      'data-time',
      String(view.markers.time),
    );
    await expect(page.getByTestId(T.timeTrack)).toHaveAttribute(
      'data-reputation',
      String(view.markers.reputation),
    );

    // 3. Map facts (TC-MAP-04/05): 32 systems, 69 routes, 8 regions — from the view, not literals of the UI.
    const routes = new Set<string>();
    for (const s of view.map.systems)
      for (const a of s.adjacentSystemIds) routes.add([s.id, a].sort().join('|'));
    expect(view.map.systems).toHaveLength(CORE_SYSTEM_COUNT);
    expect(routes.size).toBe(69);
    expect(view.map.regions).toHaveLength(8);
    const display = page.getByTestId(T.mapDisplayHeader);
    await expect(display).toHaveAttribute('data-systems', '32');
    await expect(display).toHaveAttribute('data-routes', String(routes.size));
    await expect(display).toHaveAttribute('data-regions', '8');
    expect(await cdbg.routeCount(page)).toBe(routes.size);
    expect(await cdbg.regionCount(page)).toBe(8);
    await expect(
      page.getByTestId(T.coreMapState).locator('[data-testid^="map-system-"]'),
    ).toHaveCount(CORE_SYSTEM_COUNT);
    await expectMapMirrorMatchesView(page, view);
    await expectGroupMarkersMatchView(page, view);

    // 4. AI Commander idle (TC-AI-01): LED + state text; no recent-AI marks before any AI run of this page.
    await expect(page.getByTestId(T.aiCommanderStatus)).toHaveAttribute('data-state', 'idle');
    await expect(page.getByTestId(T.aiCommanderLed)).toHaveAttribute('data-state', 'idle');

    // 5. Arm a leader, select the target in «Объекты» (selection only — no command), activate with the rail key.
    const plan = planActivation(view, [view.rebelBase.systemId ?? '']);
    await expect(page.getByTestId(T.turnActivate)).toBeDisabled();
    await armLeader(page, plan.leaderId);
    await expect(page.getByTestId(T.turnActivate)).toBeDisabled(); // nothing selected yet
    await openSidebarTab(page, 'objects');
    await page.getByTestId(T.systemItem(plan.systemId)).click();
    expect(await dbg.selection(page)).toEqual({ kind: 'system', id: plan.systemId });
    expect(await dbg.armedLeader(page)).toBe(plan.leaderId);
    const activateKey = page.getByTestId(T.turnActivate);
    await expect(activateKey).toBeEnabled();
    await expect(activateKey).toHaveAttribute('data-system-id', plan.systemId);
    await expect(activateKey).toHaveAttribute('data-leader-id', plan.leaderId);
    const act = await commandViaUi(page, () => activateKey.click());
    expect(eventsOf(act.body, 'SYSTEM_ACTIVATED')).toEqual([
      expect.objectContaining({
        actor: 'rebels',
        payload: expect.objectContaining({ systemId: plan.systemId, leaderId: plan.leaderId }),
      }),
    ]);
    await expect(page.getByTestId(T.turnPanel)).toHaveAttribute('data-state', 'activation');
    await expect(page.getByTestId(T.mapSystem(plan.systemId))).toHaveAttribute(
      'data-activated',
      'true',
    );
    expect(await dbg.activated(page)).toBe(plan.systemId);

    // 6. Move the planned unit with the move panel; markers of both systems follow the new view (TC-STALE-01).
    await page.getByTestId(T.movePiece(plan.pieceId)).check();
    const moved = await commandViaUi(page, () =>
      page.getByTestId(T.moveSubmit(plan.fromSystemId)).click(),
    );
    expect(eventsOf(moved.body, 'PIECES_MOVED')).toHaveLength(1);
    view = moved.view;
    await expectMapMirrorMatchesView(page, view);
    await expectGroupMarkersMatchView(page, view);

    // 7. Finish → the AI (Empire) turn in the same response.
    const fin = await finishViaUi(page);
    expectAiTurn(fin.body, 'empire');
    view = fin.view;
    await expectTurn(page, 'rebels');
    const aiEvents = eventsBy(fin.body, 'empire');
    const rec = expectedAiRecent(fin.body.events, 'empire');
    test.info().annotations.push({
      type: 'ai-turn',
      description: `${aiEvents.map((e) => e.type).join(',')} → AIREC ${rec.systemIds.join(',') || '∅'}`,
    });
    expect(rec.zone, 'the Rebels see no hidden zone').toBe(false);

    // 8. Recent-AI marks (TC-AI-03): debug API and the DOM mirror = systems of the AI events of this run.
    await expect.poll(() => cdbg.aiRecent(page)).toEqual(rec.systemIds);
    for (const s of view.map.systems) {
      await expect(page.getByTestId(T.mapSystem(s.id))).toHaveAttribute(
        'data-ai-recent',
        String(rec.systemIds.includes(s.id)),
      );
    }
    await expect(page.getByTestId(T.aiTurnSummary)).toHaveAttribute(
      'data-steps',
      String(fin.body.automation.steps),
    );
    await expectMapMirrorMatchesView(page, view);
    await expectGroupMarkersMatchView(page, view);
    // AI tag in the log (TC-AI-03).
    await openSidebarTab(page, 'log');
    for (const e of aiEvents) {
      await expect(page.getByTestId(T.logEntry(e.seq))).toHaveAttribute('data-ai', 'true');
      await expect(page.getByTestId(T.logEntryAi(e.seq))).toBeVisible();
    }

    // 9. Own command clears the marks (TC-AI-06, A-6): arm + click a target on the map → activation.
    const plan2 = planActivation(view, [view.rebelBase.systemId ?? '']);
    await armLeader(page, plan2.leaderId);
    const act2 = await commandViaUi(page, () => clickSystem(page, plan2.systemId));
    expect(eventsOf(act2.body, 'SYSTEM_ACTIVATED')).toHaveLength(1);
    await expect.poll(() => cdbg.aiRecent(page)).toEqual([]);
    await expect(page.getByTestId(T.coreMapState).locator('[data-ai-recent="true"]')).toHaveCount(
      0,
    );

    // 10. Finish (second AI turn), then pass: a leader can still activate → confirmation dialog.
    const fin2 = await finishViaUi(page);
    expectAiTurn(fin2.body, 'empire');
    view = fin2.view;
    if (view.outcome !== null || view.activeSide !== 'rebels') {
      test.info().annotations.push({ type: 'pass', description: 'game left the Rebels turn' });
      return;
    }
    const leadersLeft = actionOf(view, 'ACTIVATE_SYSTEM')?.leaderIds.length ?? 0;
    const passed = await passViaUi(page, leadersLeft > 0);
    expect(eventsOf(passed.body, 'PASSED')[0]).toMatchObject({ actor: 'rebels' });
    await expect(page.getByTestId(T.passConfirm)).toHaveCount(0);
  });
});
