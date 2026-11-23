/// <reference lib="dom" />
// SWR-010 hidden information in the browser (AC-7, AC-8, AC-15, AC-19, AC-23; test-cases.md §7 O7/O9):
// - TC-LK-18: human Rebels after a Refresh — the AI Empire's probe cards (S1) and the probe deck (S2) appear in no API
//   response of the page, no DOM node (incl. portals and the dev AI panel), no localStorage / sessionStorage entry and
//   not in the URL; the hand shows the Empire only as counts.
// - TC-LK-19: human Empire before the reveal (digital seed and both physical seeds) — the AI Rebels' base / Location
//   card (S3) appears nowhere: `scanForBase` over every API body, no `probe-<base>` in the DOM / storages / URL, the
//   hand and the Physical Execution module name no base system.
// - TC-LK-14 / TC-LK-16 (e2e part): the dev AI session diagnostics panel (dev build + `/dev/ai` opt-in) carries none of
//   these secrets (the e2e API plays the bot, whose moves are not recorded — the panel is in its empty state; the
//   integration part with recorded decisions is apps/api).
// Secrets are taken only from the stored row (test oracle), never from a response of the side they are hidden from.
import { expect, test, type Page } from '@playwright/test';
import {
  commandOk,
  createSession,
  getCoreView,
  REBELS_VS_AI,
  scanForBase,
  zoneOf,
  type CoreCommandResponse,
} from './support/api';
import { dbg, openCore, openSidebarTab, recordApi, type RecordedCall } from './support/board';
import {
  clientDump,
  openCards,
  pageLang,
  stripRegionNames,
  subtreeDump,
  systemName,
  systemNames,
  systemOfProbe,
} from './support/cards';
import { DEV_AI_TABLE_DIAGNOSTICS_KEY, enableTableDiagnostics } from './support/dev-ai';
import { definitionOfInstance, seedCore, storedZone, type CoreSeedName } from './support/seed';
import { T } from './support/testids';

test.use({ reducedMotion: 'reduce' });

/** `id` as a whole token (not a prefix of a longer card id). */
const tokenRe = (id: string) =>
  new RegExp(`${id.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&')}(?![a-z0-9-])`);

/** Visits every console tab (and the hand's own cards) so every lazily rendered surface is in the DOM. */
async function browseConsole(page: Page): Promise<void> {
  for (const tab of ['log', 'objects', 'game'] as const) await openSidebarTab(page, tab);
  await openCards(page);
  const own = page.locator('[data-testid^="card-hand-item-"]');
  if ((await own.count()) > 0) await own.first().click();
  // dev AI panel (opt-in): expand it so its body is rendered too
  const toggle = page.getByTestId(T.devAiSessionToggle);
  if ((await toggle.count()) > 0) {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }
}

/**
 * Canary planted in both browser storages before the page loads (the app itself uses only localStorage and never
 * sessionStorage): the positive control proving that the storage dump actually reads each storage.
 */
const STORAGE_CANARY = 'e2e-scan-canary';
async function plantStorageCanary(page: Page): Promise<void> {
  await page.addInitScript((v) => {
    window.localStorage.setItem('e2e.scanControl', v);
    window.sessionStorage.setItem('e2e.scanControl', v);
  }, STORAGE_CANARY);
}

/** Positive control: `token` is legitimately visible to the viewer and must be FOUND in a channel matching `channel`. */
interface ScanControl {
  channel: RegExp;
  token: string;
  why: string;
}

/** `GET /api/sessions/:id` (the session view of the page, any query). */
const getSessionChannel = (sessionId: string) =>
  new RegExp(`^GET \\S*/api/sessions/${sessionId}(\\?\\S*)?$`);

/** The client channels every control set must cover (plus at least one API body). */
const CLIENT_CHANNELS = ['DOM', 'localStorage', 'sessionStorage', 'URL'] as const;

/**
 * Fails with the channel name for every secret token found in the API bodies or the client dump. Before that, the same
 * scanner over the same channels must FIND every positive control (a legitimate token of the viewer): without it the
 * leak check could pass vacuously (bodies not parsed, DOM dumped before render, storages not read, id format changed).
 */
async function expectNoSecrets(
  page: Page,
  calls: RecordedCall[],
  secrets: string[],
  label: string,
  controls: ScanControl[],
): Promise<void> {
  const dump = await clientDump(page);
  const channels: [string, string][] = [
    ['DOM', dump.dom],
    ['localStorage', dump.local],
    ['sessionStorage', dump.session],
    ['URL', dump.url],
    ...calls.map((c): [string, string] => [`${c.method} ${c.url}`, JSON.stringify(c.body)]),
  ];
  // Controls are structural: every client channel and at least one API body is covered, no control is a secret.
  for (const ch of CLIENT_CHANNELS)
    expect(
      controls.some((c) => c.channel.test(ch)),
      `${label}: no positive control for ${ch}`,
    ).toBe(true);
  expect(
    controls.some((c) => !CLIENT_CHANNELS.some((ch) => c.channel.test(ch))),
    `${label}: no positive control for an API body`,
  ).toBe(true);
  for (const c of controls)
    expect(secrets, `${label}: control ${c.token} is a secret`).not.toContain(c.token);
  const missed: string[] = [];
  for (const c of controls) {
    const re = tokenRe(c.token);
    const scanned = channels.filter(([name]) => c.channel.test(name));
    if (!scanned.some(([, text]) => re.test(text)))
      missed.push(`${c.token} (${c.why}) not found in ${c.channel} [${scanned.length} channel(s)]`);
  }
  expect(missed, `${label}: positive controls of the scanner`).toEqual([]);

  const hits: string[] = [];
  for (const s of secrets) {
    const re = tokenRe(s);
    for (const [name, text] of channels) if (re.test(text)) hits.push(`${s} in ${name}`);
  }
  expect(hits, `${label}: secret card ids in client channels`).toEqual([]);
}

/** Controls shared by both sides: storage canary, own session id in the URL, the given cards in DOM + session body. */
function controlsFor(sessionId: string, cards: { token: string; why: string }[]): ScanControl[] {
  return [
    { channel: /^localStorage$/, token: STORAGE_CANARY, why: 'planted canary' },
    { channel: /^localStorage$/, token: DEV_AI_TABLE_DIAGNOSTICS_KEY, why: 'dev AI opt-in flag' },
    { channel: /^sessionStorage$/, token: STORAGE_CANARY, why: 'planted canary' },
    { channel: /^URL$/, token: sessionId, why: 'own session id' },
    ...cards.flatMap(({ token, why }) => [
      { channel: /^DOM$/, token, why },
      { channel: getSessionChannel(sessionId), token, why },
    ]),
  ];
}

test.describe('SWR-010 hidden card information in the browser', () => {
  test('TC-LK-18 + TC-LK-14: human Rebels after a Refresh — no Empire probe and no deck card in API bodies, DOM, storages, URL, dev AI panel; the hand shows counts only', async ({
    page,
    request,
  }) => {
    await enableTableDiagnostics(page);
    const { sessionId, view } = await createSession(request, REBELS_VS_AI);
    // Rebels pass → the AI Empire plays out its round and passes → Refresh: the Empire draws 2 probes.
    const pass = await commandOk(request, sessionId, view, { type: 'PASS' });
    const empireHand = (await storedZone(sessionId, 'empire-probes')).map(definitionOfInstance);
    expect(empireHand.length, 'the Empire drew probes in the Refresh').toBeGreaterThanOrEqual(2);
    const deck = (await storedZone(sessionId, 'probe-deck')).map(definitionOfInstance);
    expect(deck.length).toBeGreaterThan(0);
    const secrets = [...empireHand, ...deck];
    // Positive controls: the Rebels' own Location card and a public probe-box card (stored row = oracle).
    const ownLocation = (await storedZone(sessionId, 'rebels-location')).map(definitionOfInstance);
    expect(ownLocation).toHaveLength(1);
    const publicBox = (await storedZone(sessionId, 'probe-box')).map(definitionOfInstance);
    expect(publicBox.length).toBeGreaterThan(0);
    // The command response of the human (server → Rebels) already redacts the draw.
    const drawn = (pass as CoreCommandResponse).events.filter((e) => e.type === 'CARDS_DRAWN');
    expect(drawn.length).toBeGreaterThanOrEqual(1);
    for (const e of drawn) expect(e.payload.definitionIds).toBeNull();

    await plantStorageCanary(page);
    const api = recordApi(page);
    await openCore(page, sessionId);
    await browseConsole(page);
    const now = await getCoreView(request, sessionId);
    await expect(page.getByTestId(T.cardHandOpponentCount)).toHaveAttribute(
      'data-count',
      String(zoneOf(now, 'empire-probes').count),
    );
    await expect(page.getByTestId(T.cardZone('empire-probes'))).toHaveAttribute(
      'data-visible',
      'false',
    );
    await expect(page.getByTestId(T.cardZone('probe-deck'))).toHaveCount(0); // deck: only `card-deck-count`
    await expect(page.getByTestId(T.devAiSessionDiagnostics)).toBeVisible();
    await api.settle();
    expect(
      api.calls.some((c) => c.url.includes('/api/dev/ai/sessions/')),
      'the dev panel answered',
    ).toBe(true);
    await expectNoSecrets(
      page,
      [...api.calls, { method: 'POST', url: 'PASS (API)', status: 200, body: pass }],
      secrets,
      'Rebels',
      controlsFor(sessionId, [
        { token: ownLocation[0]!, why: 'own Location card' },
        { token: publicBox[0]!, why: 'public probe-box card' },
      ]),
    );
    // The hand names none of the Empire's probe systems (the 5 public first-game cards and the own Location may).
    const lang = await pageLang(page);
    const handText = stripRegionNames(await subtreeDump(page, T.cardHand));
    expect(handText, 'control: the hand names the own Location system').toContain(
      systemName(lang, systemOfProbe(ownLocation[0]!)),
    );
    for (const id of empireHand)
      expect(handText, `hand names ${id}`).not.toContain(systemName(lang, systemOfProbe(id)));
  });

  const EMPIRE_SEEDS: CoreSeedName[] = [
    'digital-empire-after-refresh',
    'physical-empire-ai-task-pending',
    'physical-empire-refresh-pending',
  ];
  for (const seed of EMPIRE_SEEDS) {
    test(`TC-LK-19 + TC-LK-16: human Empire before the reveal (${seed}) — the AI Rebels' base / Location card appears in no API body, DOM, storage, URL, dev AI panel; hand and table tasks never name it`, async ({
      page,
    }) => {
      await enableTableDiagnostics(page);
      const seeded = await seedCore(seed);
      const base = seeded.rebelBaseSystemId;
      expect(await storedZone(seeded.sessionId, 'rebels-location')).toEqual([`probe-${base}#1`]);
      // Positive controls: the Empire's own probes (if it holds any in this seed) and a public probe-box card.
      const ownProbes = (await storedZone(seeded.sessionId, 'empire-probes')).map(
        definitionOfInstance,
      );
      const publicBox = (await storedZone(seeded.sessionId, 'probe-box')).map(definitionOfInstance);
      expect(publicBox.length).toBeGreaterThan(0);
      await plantStorageCanary(page);
      const api = recordApi(page);
      await openCore(page, seeded.sessionId);
      await browseConsole(page);
      const loc = page.getByTestId(T.cardZone('rebels-location'));
      await expect(loc).toHaveAttribute('data-visible', 'false');
      await expect(loc).toHaveAttribute('data-count', '1');
      expect(await dbg.rebelBase(page)).toBeNull();
      await api.settle();
      for (const call of api.calls)
        expect(scanForBase(call.body, base), `${call.method} ${call.url}`).toEqual([]);
      await expectNoSecrets(
        page,
        api.calls,
        [`probe-${base}`],
        'Empire',
        controlsFor(seeded.sessionId, [
          { token: publicBox[0]!, why: 'public probe-box card' },
          ...ownProbes.map((token) => ({ token, why: 'own Empire probe' })),
        ]),
      );
      const dump = await clientDump(page);
      for (const [name, text] of [
        ['localStorage', dump.local],
        ['sessionStorage', dump.session],
        ['URL', dump.url],
      ] as const)
        expect(text.includes(base), `${name} mentions the base id`).toBe(false);
      const lang = await pageLang(page);
      expect(
        stripRegionNames(await subtreeDump(page, T.cardHand)),
        'control: the hand names a public probe-box system',
      ).toContain(systemName(lang, systemOfProbe(publicBox[0]!)));
      for (const id of [T.cardHand, T.physicalExecution]) {
        const text = stripRegionNames(await subtreeDump(page, id));
        for (const n of systemNames(base))
          expect(text, `${id} names the base (${n})`).not.toContain(n);
        expect(text, `${id} carries the base id`).not.toContain(base);
      }
    });
  }
});
