/// <reference lib="dom" />
// SWR-010 Card Hand / Card Detail / Physical Execution helpers (plan-frontend §9, §11.2; test-cases.md HAND, DET, PX,
// RST, SET, LK-14/16/18/19, OLD-06). Everything asserted comes from the server view / responses, the stored row (test
// oracle, `support/seed.ts`) or the public locale files — never from component internals. Texts are read from the web
// locale files (never hard-coded), so the specs follow wording changes.
import { readFileSync } from 'node:fs';
import { expect, type Page, type Request, type Response } from '@playwright/test';
import { API, asCore, type CoreCommandResponse, type CorePlayerView } from './api';
import { isCommandPost, openSidebarTab, version } from './board';
import { T } from './testids';

export type Lang = 'ru' | 'en';

const LOCALES_DIR = new URL('../../apps/web/src/games/rebellion/locales/', import.meta.url);

type Json = Record<string, unknown>;
const cache = new Map<string, Json>();

/** A Rebellion web locale file (`locales/<lang>/<area>.json`). */
export function locale(lang: Lang, area: string): Json {
  const key = `${lang}/${area}`;
  if (!cache.has(key))
    cache.set(
      key,
      JSON.parse(readFileSync(new URL(`${lang}/${area}.json`, LOCALES_DIR), 'utf8')) as Json,
    );
  return cache.get(key)!;
}

/** String at a dotted path of a locale file (fails loudly if absent). */
export function msg(lang: Lang, area: string, dotted: string): string {
  let v: unknown = locale(lang, area);
  for (const k of dotted.split('.')) v = (v as Json | undefined)?.[k];
  if (typeof v !== 'string') throw new Error(`no ${lang} string ${area}:${dotted}`);
  return v;
}

/** Localized system name (`rebellion.data:systems.<id>`). */
export const systemName = (lang: Lang, systemId: string): string =>
  msg(lang, 'data', `systems.${systemId}`);

/** Both localized names of a system. */
export const systemNames = (systemId: string): string[] => [
  systemName('ru', systemId),
  systemName('en', systemId),
];

/**
 * Removes every localized REGION name (ru + en, e.g. «регион Родия» / «Rodia region») from `text`: regions are named
 * after systems, so a system-name scan must not count the region label of another card's parameter line.
 */
export function stripRegionNames(text: string): string {
  let out = text;
  for (const lang of ['ru', 'en'] as const) {
    const regions = (locale(lang, 'data') as { regions: Record<string, string> }).regions;
    for (const name of Object.values(regions).sort((a, b) => b.length - a.length))
      out = out.split(name).join('‹region›');
  }
  return out;
}

/** `probe-<system>` → `<system>`. */
export const systemOfProbe = (definitionId: string): string => definitionId.replace(/^probe-/, '');

/** Switches the UI language through the settings page (persisted in the browser storage). */
export async function setLanguage(page: Page, lang: Lang): Promise<void> {
  await page.goto('/settings');
  await page.getByTestId(T.settingsLanguage(lang)).click();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

/** Language of the page (`<html lang>`). */
export async function pageLang(page: Page): Promise<Lang> {
  return ((await page.locator('html').getAttribute('lang')) ?? 'ru').startsWith('en') ? 'en' : 'ru';
}

/** Opens the Cards tab of the console and waits for the hand. */
export async function openCards(page: Page): Promise<void> {
  await openSidebarTab(page, 'cards');
  await expect(page.locator('#sidebar-panel-cards')).toBeVisible();
  await expect(page.getByTestId(T.cardHand)).toBeVisible();
}

/** The console mode attribute of the table (`turn` | `physical`). */
export const consoleMode = (page: Page) =>
  page.getByTestId(T.gameTable).getAttribute('data-console-mode');

/** Body of a POST /commands request. */
export interface CommandPost {
  actor: string;
  expectedVersion: number;
  command: { type: string; [k: string]: unknown };
}

/** Records every POST /commands request (body parsed) the page sends. */
export function recordCommandPosts(page: Page): {
  posts: CommandPost[];
  of: (type: string) => CommandPost[];
} {
  const posts: CommandPost[] = [];
  page.on('request', (r: Request) => {
    if (isCommandPost(r)) posts.push(r.postDataJSON() as CommandPost);
  });
  return { posts, of: (type) => posts.filter((p) => p.command.type === type) };
}

/** Waits for the next POST /commands response (any status) while running `action`. */
export async function nextCommandResponse(
  page: Page,
  action: () => Promise<unknown>,
): Promise<{ res: Response; body: unknown }> {
  const wait = page.waitForResponse((r) => isCommandPost(r.request()));
  await action();
  const res = await wait;
  return { res, body: (await res.json()) as unknown };
}

/** «Выполнено на столе» via the UI; expects 200 and returns the response body + core view. */
export async function confirmViaUi(
  page: Page,
): Promise<{ body: CoreCommandResponse; view: CorePlayerView }> {
  const confirm = page.getByTestId(T.tableTaskConfirm);
  await expect(confirm).toBeEnabled();
  const { res, body } = await nextCommandResponse(page, () => confirm.click());
  expect(res.status(), `CONFIRM_TABLE_TASK: ${JSON.stringify(body).slice(0, 300)}`).toBe(200);
  const b = body as CoreCommandResponse;
  const view = asCore(b.view);
  await expect(page.getByTestId(T.gameTable)).toHaveAttribute('data-version', String(view.version));
  return { body: b, view };
}

/**
 * Expects the console to show exactly the head task of `view.table` (or the turn mode for an empty queue):
 * mode, `physical-execution[data-head-kind|data-queue-length|data-ai-waiting]`, the head region.
 */
export async function expectConsoleMatchesTable(page: Page, view: CorePlayerView): Promise<void> {
  const tasks = view.table?.tasks ?? [];
  const table = page.getByTestId(T.gameTable);
  await expect(table).toHaveAttribute('data-version', String(view.version));
  if (tasks.length === 0) {
    await expect(table).toHaveAttribute('data-console-mode', 'turn');
    await expect(page.getByTestId(T.physicalExecution)).toHaveCount(0);
    await expect(page.getByTestId(T.turnPanel)).toBeVisible();
    return;
  }
  const head = tasks[0]!;
  await expect(table).toHaveAttribute('data-console-mode', 'physical');
  const px = page.getByTestId(T.physicalExecution);
  await expect(px).toBeVisible();
  await expect(px).toHaveAttribute('data-head-kind', head.kind);
  await expect(px).toHaveAttribute('data-queue-length', String(tasks.length));
  await expect(px).toHaveAttribute('data-ai-waiting', String(view.table!.aiWaiting));
  const region = page.getByTestId(T.tableTask(head.id));
  await expect(region).toHaveAttribute('data-head', 'true');
  await expect(region).toHaveAttribute('data-kind', head.kind);
  await expect(region).toHaveAttribute('role', 'region');
  await expect(region.getByTestId(T.tableTaskSteps).locator('li')).toHaveCount(head.steps.length);
  await expect(page.getByTestId(T.turnPanel)).toHaveCount(0);
  if (head.completion === 'confirm') {
    await expect(page.getByTestId(T.tableTaskConfirm)).toHaveAttribute('data-task-id', head.id);
  } else {
    await expect(page.getByTestId(T.tableTaskConfirm)).toHaveCount(0);
    await expect(page.getByTestId(T.locationRegisterForm)).toBeVisible();
  }
}

/** Text of the waiting status as the locale defines it (TC-PX-10: status in words, not only a LED). */
export const waitingText = (lang: Lang, aiWaiting: boolean): string =>
  msg(lang, 'table', aiWaiting ? 'px.waiting.ai' : 'px.waiting.you');

/** Everything the browser keeps for the page: DOM (incl. portals), storages, URL (TC-LK-18/19 channels O9). */
export async function clientDump(page: Page): Promise<{
  dom: string;
  local: string;
  session: string;
  url: string;
}> {
  return page.evaluate(() => {
    const dump = (s: Storage) => {
      const out: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i)!;
        out.push(`${k}=${s.getItem(k) ?? ''}`);
      }
      return out.join('\n');
    };
    return {
      dom: document.documentElement.outerHTML,
      local: dump(window.localStorage),
      session: dump(window.sessionStorage),
      url: window.location.href,
    };
  });
}

/** Text + attribute values of an element subtree (for name / id scans of one panel). */
export async function subtreeDump(page: Page, testId: string): Promise<string> {
  const parts: string[] = [];
  for (const el of await page.getByTestId(testId).all()) {
    parts.push(
      await el.evaluate((node) => {
        const out: string[] = [node.textContent ?? ''];
        for (const n of [node, ...Array.from(node.querySelectorAll('*'))])
          for (const a of Array.from(n.attributes)) out.push(`${a.name}=${a.value}`);
        return out.join('\n');
      }),
    );
  }
  return parts.join('\n');
}

/** POST /commands of the page during `action` + `settleMs` (for «one request» checks). */
export async function commandsDuring(
  page: Page,
  action: () => Promise<void>,
  settleMs = 800,
): Promise<CommandPost[]> {
  const sent: CommandPost[] = [];
  const on = (r: Request) => {
    if (isCommandPost(r)) sent.push(r.postDataJSON() as CommandPost);
  };
  page.on('request', on);
  try {
    await action();
    await page.waitForTimeout(settleMs);
  } finally {
    page.off('request', on);
  }
  return sent;
}

/** Delays the next POST /commands by `ms` (real server answer, `page.route`). */
export async function delayNextCommand(page: Page, ms: number): Promise<void> {
  await page.route(
    (url) => API.commands.test(url.pathname),
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await new Promise((r) => setTimeout(r, ms));
      const res = await route.fetch();
      await route.fulfill({ response: res });
    },
    { times: 1 },
  );
}

/** Current `data-version` of the table. */
export const tableVersionOf = version;
