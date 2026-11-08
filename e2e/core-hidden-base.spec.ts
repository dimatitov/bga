// SWR-005 scenario 2 (AI game as the Empire, hidden rebel base) and scenario 4 (base reveal from a seeded state):
// TC-E-04, TC-E-06 (AC-08, AC-10). The base id is learned from the stored state (TR-3 oracle, `support/seed.ts`) or
// from the seed file (Q-35) — never from an Empire-facing response.
import { expect, test, type Page } from '@playwright/test';
import {
  asCore,
  coreMoveActions,
  getCoreView,
  REBELLION,
  scanForBase,
  type SessionResponse,
} from './support/api';
import {
  dbg,
  newSessionPath,
  openCore,
  openSidebarTab,
  recordApi,
  waitForTable,
} from './support/board';
import {
  armLeader,
  clickSystem,
  commandViaUi,
  eventsOf,
  expectTurn,
  finishViaUi,
} from './support/core';
import { readStoredRow, seedCore, storedRebelBase } from './support/seed';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

/** DOM of the page does not point at the hidden base (attributes only; system names are public catalogue data). */
async function expectBaseHiddenInDom(page: Page, baseId: string): Promise<void> {
  await expect(page.locator('[data-rebel-base]')).toHaveCount(0);
  await expect(page.locator(`[data-system-id="${baseId}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-location*="${baseId}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-to="${baseId}"]`)).toHaveCount(0);
  expect(await dbg.rebelBase(page)).toBeNull();
  expect(await dbg.hasHiddenZone(page)).toBe(true);
}

test.describe('SWR-005 hidden rebel base (core-v1)', () => {
  test('TC-E-04: AI game as the Empire — Empire to move on first show, AI auto-pass logged, hidden zone of exactly the 6 «on base» units, base id in no response, DOM or debug hook', async ({
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
    const view = asCore(body.view);
    const baseId = await storedRebelBase(body.sessionId);

    // AC-08: the AI Rebels' first pass is already applied when the player sees the table.
    expect(view.viewer).toBe('empire');
    expect(view.activeSide).toBe('empire');
    expect(view.passed).toEqual({ rebels: true, empire: false });
    const autoPass = view.log.filter((e) => e.type === 'PASSED');
    expect(autoPass).toHaveLength(1);
    expect(autoPass[0]).toMatchObject({ actor: 'rebels', payload: { auto: true } });
    expect(view.rebelBase).toEqual({ systemId: null, revealed: false });
    const zoneUnits = view.units.filter((u) => u.location.kind === 'rebelBase');
    // The zone holds every Rebel unit in the base system. Since review #1 (Analyst decision, R-10) a system holding
    // starting Rebel units (Bothawui) is no longer an eligible base, so the zone is exactly the 6 «on base» units of the
    // first-game setup (spec Data clarifications) — no starting system units can «disappear» into it.
    const stored = await readStoredRow(body.sessionId);
    const inBase = (
      stored.state.units as { owner: string; systemId: string; typeKey: string }[]
    ).filter((u) => u.owner === 'rebels' && u.systemId === baseId);
    expect(zoneUnits.map((u) => u.typeKey).sort()).toEqual(inBase.map((u) => u.typeKey).sort());
    expect(zoneUnits, 'hidden zone = exactly the 6 «on base» units').toHaveLength(6);
    const onBase = [
      'unit.rebels.airspeeder',
      'unit.rebels.rebel-trooper',
      'unit.rebels.rebel-trooper',
      'unit.rebels.rebel-trooper',
      'unit.rebels.x-wing',
      'unit.rebels.y-wing',
    ];
    const zoneTypes = zoneUnits.map((u) => u.typeKey);
    for (const t of onBase) {
      const i = zoneTypes.indexOf(t);
      expect(i, `${t} on the base`).toBeGreaterThanOrEqual(0);
      zoneTypes.splice(i, 1);
    }
    const zoneCount = String(zoneUnits.length);
    test
      .info()
      .annotations.push({ type: 'base', description: `${baseId}: ${zoneCount} units in the zone` });

    await waitForTable(page, body.sessionId, { engine: 'core-v1' });
    await expectTurn(page, 'empire');
    await expect(page.getByTestId(T.turnPanel)).toHaveAttribute('data-state', 'idle');
    await expect(page.getByTestId(T.passedIndicator)).toHaveAttribute('data-rebels', 'true');
    await openSidebarTab(page, 'log');
    const entry = page.getByTestId(T.logEntry(autoPass[0]!.seq));
    await expect(entry).toHaveAttribute('data-actor', 'rebels');
    await expect(entry).toHaveAttribute('data-auto', 'true');
    await expect(page.getByTestId(T.logEntryAuto(autoPass[0]!.seq))).toBeVisible();

    // Hidden zone «base — location unknown» with the 6 units; the base system itself is not marked.
    await openSidebarTab(page, 'objects');
    const zone = page.getByTestId(T.hiddenBaseZone);
    await expect(zone).toBeVisible();
    await expect(zone).toHaveAttribute('data-count', zoneCount);
    await expect(page.getByTestId(T.mapHiddenZone)).toHaveAttribute('data-count', zoneCount);
    await expect(page.getByTestId(T.mapSystem(baseId))).not.toHaveAttribute(
      'data-rebel-base',
      /.*/,
    );
    for (const u of zoneUnits) {
      await expect(page.getByTestId(T.pieceItem(u.id))).not.toHaveAttribute('data-system-id', /.*/);
    }
    await zone.click();
    await expect(page.getByTestId(T.hiddenZonePanel)).toHaveAttribute('data-count', zoneCount);
    await expectBaseHiddenInDom(page, baseId);

    // Arming a leader does not reveal anything either (targets = all 32 systems, Q-BE-3).
    const leader = view.legalActions.find((a) => a.type === 'ACTIVATE_SYSTEM');
    expect(leader && 'leaderIds' in leader ? leader.leaderIds.length : 0).toBe(4);
    await armLeader(page, 'vader');
    expect(await dbg.highlighted(page)).toHaveLength(32);
    await expectBaseHiddenInDom(page, baseId);

    // AC-10: no Empire-facing response carries the base id outside the static catalogue.
    await page.reload();
    await waitForTable(page, body.sessionId, { engine: 'core-v1' });
    await page.request.get('/api/sessions?gameId=' + REBELLION);
    await recorder.settle();
    const calls = recorder.calls.filter((c) => c.status < 500);
    expect(calls.some((c) => c.url.includes(body.sessionId))).toBe(true);
    for (const c of calls) {
      expect(scanForBase(c.body, baseId), `${c.method} ${c.url}`).toEqual([]);
    }
    expect(scanForBase(await getCoreView(page.request, body.sessionId), baseId)).toEqual([]);
    const list = await (await page.request.get('/api/sessions?gameId=' + REBELLION)).json();
    expect(scanForBase(list, baseId), 'GET /api/sessions').toEqual([]);
  });

  test('TC-E-06 (scenario 4, seed ai-empire-before-reveal): Empire moves ground units into the base → «base revealed in <system>», zone gone, base marked', async ({
    page,
    request,
  }) => {
    const seed = await seedCore('ai-empire-before-reveal');
    const baseId = seed.rebelBaseSystemId;
    const [activate, move] = seed.nextCommands;
    expect(activate?.command).toMatchObject({ type: 'ACTIVATE_SYSTEM', systemId: baseId });
    const leaderId = activate!.command.leaderId as string;
    const { pieceIds, fromSystemId } = move!.command as unknown as {
      pieceIds: string[];
      fromSystemId: string;
    };

    const initial = await getCoreView(request, seed.sessionId);
    expect(initial.viewer).toBe('empire');
    expect(initial.rebelBase).toEqual({ systemId: null, revealed: false });
    expect(scanForBase(initial, baseId), 'seeded view before any command').toEqual([]);

    await openCore(page, seed.sessionId);
    await expectTurn(page, 'empire');
    await expect(page.getByTestId(T.hiddenBaseZone)).toHaveAttribute('data-count', '6');
    await expectBaseHiddenInDom(page, baseId);

    // Activate the (secret) base system: activation alone reveals nothing (Q-11).
    await armLeader(page, leaderId);
    const act = await commandViaUi(page, () => clickSystem(page, baseId));
    expect(eventsOf(act.body, 'BASE_REVEALED')).toEqual([]);
    expect(act.view.rebelBase.revealed).toBe(false);
    const source = coreMoveActions(act.view).find((m) => m.fromSystemId === fromSystemId);
    expect(source, `move source ${fromSystemId}`).toBeDefined();

    // Move the seed's units (ship + ground units needing transport) with the panel.
    for (const id of pieceIds) await page.getByTestId(T.movePiece(id)).check();
    await expect(page.getByTestId(T.moveCapacity(fromSystemId))).toHaveAttribute(
      'data-fits',
      'true',
    );
    const moved = await commandViaUi(page, () =>
      page.getByTestId(T.moveSubmit(fromSystemId)).click(),
    );
    expect(eventsOf(moved.body, 'PIECES_MOVED')).toHaveLength(1);
    expect(moved.view.rebelBase.revealed).toBe(false);

    // Finish → BASE_REVEALED (R-8: ground unit of the Empire in the base system).
    const fin = await finishViaUi(page);
    expect(fin.body.events.map((e) => e.type).slice(0, 2)).toEqual([
      'ACTIVATION_FINISHED',
      'BASE_REVEALED',
    ]);
    const revealed = eventsOf(fin.body, 'BASE_REVEALED')[0]!;
    expect(revealed).toMatchObject({ actor: 'system', payload: { systemId: baseId } });
    expect(eventsOf(fin.body, 'GAME_OVER')).toEqual([]); // Rebel units stay on the base
    expect(fin.view.rebelBase).toEqual({ systemId: baseId, revealed: true });
    expect(fin.view.outcome).toBeNull();

    await expect(page.getByTestId(T.hiddenBaseZone)).toHaveCount(0);
    await expect(page.getByTestId(T.mapHiddenZone)).toHaveCount(0);
    await expect(page.getByTestId(T.mapSystem(baseId))).toHaveAttribute('data-rebel-base', 'true');
    expect(await dbg.rebelBase(page)).toBe(baseId);
    expect(await dbg.hasHiddenZone(page)).toBe(false);
    await expect(page.getByTestId(T.systemItem(baseId))).toHaveAttribute('data-contested', 'true');
    await openSidebarTab(page, 'log');
    const entry = page.getByTestId(T.logEntry(revealed.seq));
    await expect(entry).toHaveAttribute('data-type', 'BASE_REVEALED');
    await expect(entry).not.toBeEmpty();

    // «Visible to both sides»: the event is public (actor system, unredacted) in the stored log the Rebels' view
    // is built from; the Rebels' own view is checked on the hot-seat seed (TC-E-08).
    const stored = await readStoredRow(seed.sessionId);
    expect(stored.state.rebelBase).toEqual({ systemId: baseId, revealed: true });
    expect(
      (stored.state.log as { type: string; payload: unknown }[]).filter(
        (e) => e.type === 'BASE_REVEALED',
      ),
    ).toEqual([expect.objectContaining({ payload: { systemId: baseId } })]);
    expect(seed.expectAfter).toEqual({ revealed: true, outcome: null });
  });
});
