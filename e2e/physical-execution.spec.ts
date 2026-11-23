/// <reference lib="dom" />
// SWR-010 Physical Execution (AC-21, AC-10, AC-12..AC-15; test-cases.md §18, §12): a `physical_companion` game against
// the bot AI on the e2e API (3100, own DB). TC-PX-01 (new game through the form: the initial-setup task with its three
// blocks, the confirm key, the waiting status in words), TC-PX-07 (no map/turn action sends a command while tasks are
// open), TC-PX-04 (double click → ONE CONFIRM_TABLE_TASK, one confirmation event), TC-PX-02 (registration: options =
// exactly the eligible systems, confirm dialog, the card lands in the Location), TC-PX-03 (human turn → AI task →
// «Done on the table» until the console returns to the turn mode), TC-RST-04 / TC-PX-06 (reload and a new browser
// context restore the same task + status), TC-PX-05 (delayed answer + Enter/Space → no second request), TC-PX-09
// (stale second tab → 409 → refetch shows the current head, no double confirmation), TC-PX-08 (human Empire: the
// Refresh task names exactly the 2 drawn probes; AI-Rebels tasks never name the hidden base).
// Oracles: the stored row (`support/seed.ts`, never shown to the page) and the server responses.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  asCore,
  commandOk,
  getCoreView,
  planActivation,
  REBELLION,
  scanForBase,
  type CoreCommandResponse,
  type CorePlayerView,
  type SessionResponse,
} from './support/api';
import { expectNotClipped } from './support/a11y';
import {
  dbg,
  expectNoCommandSent,
  newSessionPath,
  openCore,
  recordApi,
  waitForTable,
} from './support/board';
import {
  commandsDuring,
  confirmViaUi,
  delayNextCommand,
  expectConsoleMatchesTable,
  msg,
  nextCommandResponse,
  openCards,
  pageLang,
  recordCommandPosts,
  stripRegionNames,
  subtreeDump,
  systemName,
  systemNames,
  systemOfProbe,
  waitingText,
} from './support/cards';
import { placeNamesIn } from './support/console';
import { clickSystem, finishViaUi } from './support/core';
import { readStoredRow, seedCore, storedZone } from './support/seed';
import { waitCreate } from './support/setup';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

/** Number of TABLE_TASK_CONFIRMED events in the stored log (oracle of «confirmed exactly once»). */
async function storedConfirmations(sessionId: string): Promise<number> {
  const { state } = await readStoredRow(sessionId);
  return ((state.log as { type: string }[] | undefined) ?? []).filter(
    (e) => e.type === 'TABLE_TASK_CONFIRMED',
  ).length;
}

/** The human's activation through the API (no move), then a reload of the page so it shows the activation. */
async function activateViaApiAndReload(
  page: Page,
  request: APIRequestContext,
  sessionId: string,
): Promise<boolean> {
  const view = await getCoreView(request, sessionId);
  const act = view.legalActions.find((a) => a.type === 'ACTIVATE_SYSTEM');
  if (!act || act.type !== 'ACTIVATE_SYSTEM') return false;
  let leaderId = act.leaderIds[0]!;
  let systemId = act.systemIds[0]!;
  try {
    ({ leaderId, systemId } = planActivation(view, [view.rebelBase.systemId ?? '']));
  } catch {
    // no simple move plan — any legal activation does
  }
  await commandOk(request, sessionId, view, { type: 'ACTIVATE_SYSTEM', leaderId, systemId });
  await page.reload();
  await waitForTable(page, sessionId, { engine: 'core-v1' });
  return true;
}

/** Confirms every task in the UI until the console is back in the turn mode (or the game is over). */
async function confirmAll(
  page: Page,
  start: CorePlayerView,
  onHead?: (view: CorePlayerView) => Promise<void>,
): Promise<CorePlayerView> {
  let view = start;
  for (let i = 0; i < 30 && (view.table?.tasks.length ?? 0) > 0; i++) {
    const head = view.table!.tasks[0]!;
    expect(head.completion, 'only confirm tasks after the registration').toBe('confirm');
    if (onHead) await onHead(view);
    const out = await confirmViaUi(page);
    const confirmed = out.body.events.filter((e) => e.type === 'TABLE_TASK_CONFIRMED');
    expect(confirmed, 'one confirmation per click').toHaveLength(1);
    expect(confirmed[0]!.payload).toMatchObject({ taskId: head.id, kind: head.kind });
    expect(out.view.table?.tasks.some((t) => t.id === head.id) ?? false).toBe(false);
    await expectConsoleMatchesTable(page, out.view);
    view = out.view;
  }
  expect(view.table?.tasks ?? [], 'queue drained').toEqual([]);
  return view;
}

test.describe('SWR-010 Physical Execution: human Rebels vs AI Empire (new game through the form)', () => {
  test('TC-PX-01, TC-PX-07, TC-PX-04, TC-PX-02, TC-PX-03, TC-RST-04: setup task → double-click confirm → registration → human turn → AI task → reload → confirm until the turn mode', async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(180_000);
    const posts = recordCommandPosts(page);
    await page.goto(newSessionPath(REBELLION));
    await page.getByTestId(T.setupModeOption('physical_companion')).click();
    await expect(page.getByTestId(T.setupModeOption('physical_companion'))).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const created = waitCreate(page);
    await page.getByTestId(T.setupStart).click();
    const res = await created;
    expect(res.status()).toBe(201);
    const body = (await res.json()) as SessionResponse;
    expect(body.settings.gameMode).toBe('physical_companion');
    const sessionId = body.sessionId;
    let view = asCore(body.view);
    expect(view.table?.tasks.map((t) => t.kind)).toEqual(['initialSetup', 'registerBase']);
    expect(body.automation.pending, 'the AI is blocked by the table queue').toBe(false);
    await waitForTable(page, sessionId, { engine: 'core-v1' });
    const lang = await pageLang(page);

    // TC-PX-01: the console is in the physical mode with the initial-setup task.
    await expectConsoleMatchesTable(page, view);
    const head = page.getByTestId(T.tableTask(view.table!.tasks[0]!.id));
    await expect(head.getByRole('heading', { level: 3 })).toHaveText(
      msg(lang, 'table', 'table.tasks.initialSetup'),
    );
    await expect(head.getByTestId(T.tableTaskHappened)).toHaveText(
      msg(lang, 'table', 'px.happened.initialSetup'),
    );
    await expect(head.getByTestId(T.tableTaskAffected)).toBeVisible();
    await expect(head.getByTestId(T.tableTaskSteps).locator('li')).toHaveCount(3);
    await expect(page.getByTestId(T.tableTaskConfirm)).toHaveText(msg(lang, 'table', 'px.confirm'));
    const waiting = page.getByTestId(T.tableTaskWaiting);
    await expect(waiting).toHaveAttribute('data-ai-waiting', String(view.table!.aiWaiting));
    await expect(waiting).toContainText(waitingText(lang, view.table!.aiWaiting));
    await expect(page.getByTestId(T.tableTaskNext)).toContainText(
      msg(lang, 'table', 'table.tasks.registerBase'),
    );
    // §5.3: no base marker / name before the registration.
    expect(await dbg.rebelBase(page)).toBeNull();

    // TC-PX-07: no turn controls; map clicks and the system panel send nothing.
    await expect(page.getByTestId(T.turnControls)).toHaveCount(0);
    await expect(page.getByTestId(T.leaderPool)).toHaveCount(0);
    expect(view.legalActions).toEqual([]);
    const someSystem = view.map.systems[0]!.id;
    await expectNoCommandSent(page, async () => {
      await clickSystem(page, someSystem);
      const activate = page.getByTestId(T.systemPanelActivate);
      if ((await activate.count()) > 0 && (await activate.isEnabled())) await activate.click();
    });

    // TC-PX-04: a double click on «Done on the table» → exactly one CONFIRM_TABLE_TASK.
    const before = posts.of('CONFIRM_TABLE_TASK').length;
    const { res: cRes, body: cBody } = await nextCommandResponse(page, () =>
      page.getByTestId(T.tableTaskConfirm).dblclick(),
    );
    expect(cRes.status()).toBe(200);
    await page.waitForTimeout(800);
    expect(posts.of('CONFIRM_TABLE_TASK').length - before, 'one request for a double click').toBe(
      1,
    );
    expect(posts.of('CONFIRM_TABLE_TASK').at(-1)!.command).toEqual({
      type: 'CONFIRM_TABLE_TASK',
      taskId: 't-1-1',
    });
    expect(await storedConfirmations(sessionId)).toBe(1);
    view = asCore((cBody as CoreCommandResponse).view);
    expect(view.table?.tasks.map((t) => t.kind)).toEqual(['registerBase']);
    await expectConsoleMatchesTable(page, view);

    // TC-PX-02: the select lists exactly the eligible systems (= server view = stored oracle).
    const stored = await readStoredRow(sessionId);
    const eligible = stored.state.table!.baseRegistration!.eligibleSystemIds.map(
      (s) => `probe-${s}`,
    );
    expect([...view.table!.registration!.eligibleDefinitionIds].sort()).toEqual(
      [...eligible].sort(),
    );
    const select = page.getByTestId(T.locationRegisterSelect);
    const options = await select
      .locator('option')
      .evaluateAll((els) =>
        els.map((o) => ({ value: (o as HTMLOptionElement).value, text: o.textContent ?? '' })),
      );
    expect(options[0]!.value, 'placeholder first, nothing preselected').toBe('');
    expect(await select.inputValue()).toBe('');
    expect(
      options
        .slice(1)
        .map((o) => o.value)
        .sort(),
    ).toEqual([...eligible].sort());
    for (const o of options.slice(1)) expect(o.text).toBe(systemName(lang, systemOfProbe(o.value)));
    await expect(page.getByTestId(T.locationRegisterSubmit)).toBeDisabled();
    // Pick a system other than the server's provisional base (a free choice of the player).
    const provisional = stored.state.rebelBase!.systemId;
    const chosen = eligible.find((id) => id !== `probe-${provisional}`)!;
    await select.selectOption(chosen);
    await expect(page.getByTestId(T.locationRegisterSubmit)).toBeEnabled();
    await expectNoCommandSent(page, async () => {
      await page.getByTestId(T.locationRegisterSubmit).click();
      await expect(page.getByTestId(T.locationRegisterDialog)).toBeVisible();
      await expect(page.getByTestId(T.locationRegisterDialog)).toContainText(
        systemName(lang, systemOfProbe(chosen)),
      );
      await expect(page.getByTestId(T.locationRegisterCancel)).toBeFocused();
      await page.getByTestId(T.locationRegisterCancel).click();
      await expect(page.getByTestId(T.locationRegisterDialog)).toHaveCount(0);
    });
    await page.getByTestId(T.locationRegisterSubmit).click();
    const { res: rRes, body: rBody } = await nextCommandResponse(page, () =>
      page.getByTestId(T.locationRegisterConfirm).click(),
    );
    expect(rRes.status(), JSON.stringify(rBody).slice(0, 300)).toBe(200);
    expect(posts.of('REGISTER_CARD').at(-1)!.command).toEqual({
      type: 'REGISTER_CARD',
      zoneId: 'rebels-location',
      definitionId: chosen,
    });
    view = asCore((rBody as CoreCommandResponse).view);
    expect(view.table?.registration ?? null).toBeNull();
    await expectConsoleMatchesTable(page, view);
    expect((await readStoredRow(sessionId)).state.rebelBase!.systemId).toBe(systemOfProbe(chosen));
    expect(await storedZone(sessionId, 'rebels-location')).toEqual([`${chosen}#1`]);
    await expect.poll(() => dbg.rebelBase(page)).toBe(systemOfProbe(chosen));
    await openCards(page);
    const card = page.getByTestId(T.cardHandItem(chosen));
    await expect(card).toHaveAttribute('data-zone', 'rebels-location');
    await expect(card).toContainText(msg(lang, 'cards', 'availability.physical'));
    await expect(page.getByTestId(T.cardHandRegister)).toHaveCount(0);

    // TC-PX-03: human turn → the AI's move becomes a table task (the AI waits for it).
    for (let i = 0; i < 6 && (view.table?.tasks.length ?? 0) === 0 && view.outcome === null; i++) {
      if (await activateViaApiAndReload(page, request, sessionId)) {
        view = (await finishViaUi(page)).view;
      } else {
        const out = await nextCommandResponse(page, async () => {
          await page.getByTestId(T.passTurn).click();
          const ok = page.getByTestId(T.passConfirmOk);
          if (
            await ok
              .waitFor({ state: 'visible', timeout: 2_000 })
              .then(() => true)
              .catch(() => false)
          )
            await ok.click();
        });
        expect(out.res.status()).toBe(200);
        view = asCore((out.body as CoreCommandResponse).view);
      }
    }
    expect(view.table?.tasks.length ?? 0, 'the AI turn produced table tasks').toBeGreaterThan(0);
    await expectConsoleMatchesTable(page, view);
    const aiHead = view.table!.tasks[0]!;
    if (aiHead.actor === 'empire') expect(view.table!.aiWaiting).toBe(true);
    await expect(page.getByTestId(T.tableTaskWaiting)).toContainText(
      waitingText(lang, view.table!.aiWaiting),
    );

    // TC-RST-04 / TC-PX-06: a reload and a fresh browser context show the same head task and status.
    await page.reload();
    await waitForTable(page, sessionId, { engine: 'core-v1' });
    await expectConsoleMatchesTable(page, view);
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const other = await ctx.newPage();
      await openCore(other, sessionId);
      await expectConsoleMatchesTable(other, view);
    } finally {
      await ctx.close();
    }

    // TC-PX-03 (cont.): «Done on the table» until the queue is empty; the console returns to «Your task».
    const confirmedBefore = await storedConfirmations(sessionId);
    let clicks = 0;
    view = await confirmAll(page, view, async () => {
      clicks++;
    });
    expect(await storedConfirmations(sessionId)).toBe(confirmedBefore + clicks);
    if (view.outcome === null) {
      await expect(page.getByTestId(T.gameTable)).toHaveAttribute('data-console-mode', 'turn');
      await expect(page.getByTestId(T.turnPanel)).toBeVisible();
    }
  });
});

test.describe('SWR-010 Physical Execution: seeded tasks', () => {
  test('TC-PX-05: the confirm answer is delayed — Enter and Space on the busy key send no second request; afterwards the next state is shown', async ({
    page,
  }) => {
    const seeded = await seedCore('physical-empire-ai-task-pending');
    await openCore(page, seeded.sessionId);
    const confirm = page.getByTestId(T.tableTaskConfirm);
    await expect(confirm).toHaveAttribute('data-task-id', 't-3-1');
    await delayNextCommand(page, 1_500);
    const wait = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/commands$/.test(r.url()),
    );
    const sent = await commandsDuring(
      page,
      async () => {
        await confirm.click();
        await expect(confirm).toBeDisabled();
        await expect(confirm).toHaveAttribute('aria-busy', 'true');
        await page.keyboard.press('Enter');
        await page.keyboard.press('Space');
        await wait;
      },
      800,
    );
    expect(sent.map((p) => p.command.type)).toEqual(['CONFIRM_TABLE_TASK']);
    expect(await storedConfirmations(seeded.sessionId)).toBe(
      // the seed already holds one confirmation (initial setup) + this one
      2,
    );
    const view = asCore(((await (await wait).json()) as CoreCommandResponse).view);
    await expectConsoleMatchesTable(page, view);
  });

  test('TC-PX-06 / TC-RST-04 (seed): reload and a new browser context restore the physical mode, the same head task and «AI waits for the table»', async ({
    page,
    request,
    browser,
  }) => {
    const seeded = await seedCore('physical-empire-ai-task-pending');
    const view = await getCoreView(request, seeded.sessionId);
    expect(view.table?.aiWaiting).toBe(true);
    await openCore(page, seeded.sessionId);
    await expectConsoleMatchesTable(page, view);
    const lang = await pageLang(page);
    await expect(page.getByTestId(T.tableTaskWaiting)).toContainText(waitingText(lang, true));
    await page.reload();
    await waitForTable(page, seeded.sessionId, { engine: 'core-v1' });
    await expectConsoleMatchesTable(page, view);
    await expect(page.getByTestId(T.tableTaskWaiting)).toContainText(waitingText(lang, true));
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const other = await ctx.newPage();
      await openCore(other, seeded.sessionId);
      await expectConsoleMatchesTable(other, view);
    } finally {
      await ctx.close();
    }
    // Nothing was written by reading.
    expect((await readStoredRow(seeded.sessionId)).version).toBe(seeded.version);
  });

  test('TC-PX-09: a second tab confirmed first — the stale tab gets 409, refetches and shows the current head; the task is confirmed once', async ({
    page,
    browser,
  }) => {
    const seeded = await seedCore('physical-empire-ai-task-pending');
    await openCore(page, seeded.sessionId);
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const other = await ctx.newPage();
      await openCore(other, seeded.sessionId);
      const first = await confirmViaUi(other);
      const stale = await nextCommandResponse(page, () =>
        page.getByTestId(T.tableTaskConfirm).click(),
      );
      expect(stale.res.status(), 'stale expectedVersion → 409').toBe(409);
      // Refetch: the stale tab shows what the other tab shows.
      await expectConsoleMatchesTable(page, first.view);
      expect(await storedConfirmations(seeded.sessionId)).toBe(2); // seed's initial setup + one
    } finally {
      await ctx.close();
    }
  });

  test('TC-PX-02 (seed): registration — options = eligible systems only, the dialog, then the Location holds the card (physical); stored base = choice', async ({
    page,
    request,
  }) => {
    const seeded = await seedCore('physical-rebels-registration');
    const view = await getCoreView(request, seeded.sessionId);
    await openCore(page, seeded.sessionId);
    await expectConsoleMatchesTable(page, view);
    const lang = await pageLang(page);
    const stored = await readStoredRow(seeded.sessionId);
    const eligible = stored.state.table!.baseRegistration!.eligibleSystemIds.map(
      (s) => `probe-${s}`,
    );
    const values = await page
      .getByTestId(T.locationRegisterSelect)
      .locator('option')
      .evaluateAll((els) => els.map((o) => (o as HTMLOptionElement).value).filter((v) => v));
    expect(values.sort()).toEqual([...eligible].sort());
    // Sorted by the localized name.
    const names = await page
      .getByTestId(T.locationRegisterSelect)
      .locator('option:not([value=""])')
      .allTextContents();
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, lang)));
    // Non-eligible systems (e.g. the Empire's start, Coruscant) are not offered.
    expect(values).not.toContain('probe-coruscant');
    const target = 'probe-tatooine';
    expect(values).toContain(target);
    await page.getByTestId(T.locationRegisterSelect).selectOption(target);
    await page.getByTestId(T.locationRegisterSubmit).click();
    const { res, body } = await nextCommandResponse(page, () =>
      page.getByTestId(T.locationRegisterConfirm).click(),
    );
    expect(res.status()).toBe(200);
    const after = asCore((body as CoreCommandResponse).view);
    await expectConsoleMatchesTable(page, after);
    expect((await readStoredRow(seeded.sessionId)).state.rebelBase!.systemId).toBe('tatooine');
    await openCards(page);
    await expect(page.getByTestId(T.cardHandItem(target))).toHaveAttribute(
      'data-zone',
      'rebels-location',
    );
    await page.getByTestId(T.cardHandItem(target)).click();
    await expect(page.getByTestId(T.cardDetailAuthority)).toHaveAttribute(
      'data-authority',
      'physical',
    );
  });
});

test.describe('SWR-010 Physical Execution: human Empire vs AI Rebels (hidden base)', () => {
  test('TC-PX-08: Refresh task (seed) names exactly the 2 drawn probes; the following AI-Rebels tasks never name the hidden base', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seeded = await seedCore('physical-empire-refresh-pending');
    const base = seeded.rebelBaseSystemId;
    const drawn = (await storedZone(seeded.sessionId, 'empire-probes')).map((i) =>
      i.replace(/#\d+$/, ''),
    );
    expect(drawn.sort()).toEqual(['probe-mon-calamari', 'probe-ryloth']);
    const api = recordApi(page);
    const view = await getCoreView(request, seeded.sessionId);
    await openCore(page, seeded.sessionId);
    await expectConsoleMatchesTable(page, view);
    const lang = await pageLang(page);
    const head = page.getByTestId(T.tableTask('t-4-1'));
    await expect(head).toHaveAttribute('data-kind', 'refresh');
    const take = head.locator('li[data-step="takeProbeCards"]');
    for (const id of drawn) await expect(take).toContainText(systemName(lang, systemOfProbe(id)));
    // The panel names exactly the drawn systems — no other probe system, never the base.
    const pxText = (await page.getByTestId(T.physicalExecution).textContent()) ?? '';
    expect(placeNamesIn(pxText).sort()).toEqual(
      drawn.map((id) => systemName(lang, systemOfProbe(id))).sort(),
    );
    await expect(head.locator('li[data-step="advanceTime"]')).toBeVisible();
    // The drawn probes are in the Empire's hand.
    await openCards(page);
    for (const id of drawn) await expect(page.getByTestId(T.cardHandItem(id))).toBeVisible();

    // Confirm → the AI Rebels move; every new head task is checked for the base.
    const checkHead = async () => {
      const dump = stripRegionNames(await subtreeDump(page, T.physicalExecution));
      for (const n of systemNames(base)) expect(dump, `PX names the base (${n})`).not.toContain(n);
      expect(dump).not.toContain(base);
    };
    await checkHead();
    await confirmAll(page, view, checkHead);
    await api.settle();
    for (const call of api.calls)
      expect(scanForBase(call.body, base), `${call.method} ${call.url}`).toEqual([]);
    expect(await dbg.rebelBase(page)).toBeNull();
  });

  test('TC-PX-08 / TC-LK-13 (seed): the AI activated its hidden base — the task says «the Rebel Base space», never the system', async ({
    page,
    request,
  }) => {
    const seeded = await seedCore('physical-empire-ai-task-pending');
    const view = await getCoreView(request, seeded.sessionId);
    const task = view.table!.tasks[0]!;
    expect(task.affected.systemIds).toEqual([null]);
    await openCore(page, seeded.sessionId);
    const lang = await pageLang(page);
    const head = page.getByTestId(T.tableTask(task.id));
    await expect(head.locator('li[data-step="placeLeader"]')).toContainText(
      msg(lang, 'table', 'px.baseSpace'),
    );
    const dump = stripRegionNames(await subtreeDump(page, T.physicalExecution));
    for (const n of systemNames(seeded.rebelBaseSystemId)) expect(dump).not.toContain(n);
    expect(dump).not.toContain(seeded.rebelBaseSystemId);
    await expectNotClipped(page.getByTestId(T.tableTaskConfirm), 'confirm key');
  });
});
