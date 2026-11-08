/// <reference lib="dom" />
// Board helpers: `window.__boardDebug` (plan-frontend.md §6.3, R-11 — read-only, enabled by VITE_E2E=1),
// mouse gestures, keyboard walking, network recording and AC-11 screenshots.
import path from 'node:path';
import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { type PlayerView } from './api';
import { T } from './testids';

export interface Point {
  x: number;
  y: number;
}

export interface BoardDebug {
  getViewport(): { scale: number; x: number; y: number };
  getZoomLimits(): { min: number; max: number };
  getSystemScreenPos(systemId: string): Point | null;
  getPieceScreenPos(pieceId: string): Point | null;
  getSelection(): { kind: 'system' | 'piece' | null; id: string | null };
  getHighlightedSystemIds(): string[];
  isDragging(): boolean;
}

declare global {
  interface Window {
    __boardDebug?: BoardDebug;
  }
}

/** Opens `/games/:id` and waits until the table and the debug hook are ready. */
export async function openGame(page: Page, gameId: string): Promise<void> {
  await page.goto(`/games/${gameId}`);
  await waitForTable(page, gameId);
}

export async function waitForTable(page: Page, gameId?: string): Promise<void> {
  const table = page.getByTestId(T.gameTable);
  await expect(table).toBeVisible();
  if (gameId) await expect(table).toHaveAttribute('data-game-id', gameId);
  await page.waitForFunction(() => window.__boardDebug !== undefined, undefined, {
    timeout: 10_000,
  });
  await waitViewportStable(page);
}

export const dbg = {
  viewport: (page: Page) => page.evaluate(() => window.__boardDebug!.getViewport()),
  zoomLimits: (page: Page) => page.evaluate(() => window.__boardDebug!.getZoomLimits()),
  selection: (page: Page) => page.evaluate(() => window.__boardDebug!.getSelection()),
  highlighted: (page: Page) =>
    page.evaluate(() => [...window.__boardDebug!.getHighlightedSystemIds()].sort()),
  isDragging: (page: Page) => page.evaluate(() => window.__boardDebug!.isDragging()),
  systemPos: async (page: Page, systemId: string): Promise<Point> => {
    const p = await page.evaluate((id) => window.__boardDebug!.getSystemScreenPos(id), systemId);
    if (!p) throw new Error(`__boardDebug.getSystemScreenPos(${systemId}) returned null`);
    return p;
  },
  piecePos: async (page: Page, pieceId: string): Promise<Point> => {
    const p = await page.evaluate((id) => window.__boardDebug!.getPieceScreenPos(id), pieceId);
    if (!p) throw new Error(`__boardDebug.getPieceScreenPos(${pieceId}) returned null`);
    return p;
  },
};

/** Waits until the viewport stops changing (zoom/pan tweens are 150 ms; instant with reduced motion). */
export async function waitViewportStable(page: Page, timeoutMs = 3_000): Promise<void> {
  const started = Date.now();
  let prev = JSON.stringify(await dbg.viewport(page));
  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(120);
    const next = JSON.stringify(await dbg.viewport(page));
    if (next === prev) return;
    prev = next;
  }
  throw new Error('viewport did not settle');
}

export async function version(page: Page): Promise<number> {
  const v = await page.getByTestId(T.gameTable).getAttribute('data-version');
  return Number(v);
}

export async function openSidebarTab(page: Page, tab: 'log' | 'objects' | 'game'): Promise<void> {
  const t = page.getByTestId(T.sidebarTab(tab));
  await t.click();
  await expect(t).toHaveAttribute('aria-selected', 'true');
}

export async function canvasBox(page: Page) {
  const box = await page.getByTestId(T.boardCanvas).boundingBox();
  if (!box) throw new Error('board-canvas has no bounding box');
  return box;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Finds a point on the canvas that is as far as possible from every system and piece and outside the overlay
 * controls (zoom buttons, mock badge). Used for background clicks and pan gestures.
 */
export async function emptyCanvasPoint(
  page: Page,
  view: PlayerView,
  minDistance = 110,
): Promise<Point> {
  const box = await canvasBox(page);
  const occupied: Point[] = [];
  for (const s of view.systems) occupied.push(await dbg.systemPos(page, s.id));
  for (const p of view.pieces) {
    const pos = await page.evaluate((id) => window.__boardDebug!.getPieceScreenPos(id), p.id);
    if (pos) occupied.push(pos);
  }
  const overlays: { x: number; y: number; width: number; height: number }[] = [];
  for (const id of [T.zoomIn, T.zoomOut, T.zoomFit, T.zoomLevel, T.mockBadge]) {
    const loc = page.getByTestId(id);
    for (const handle of await loc.all()) {
      const b = await handle.boundingBox();
      if (b)
        overlays.push({ x: b.x - 12, y: b.y - 12, width: b.width + 24, height: b.height + 24 });
    }
  }
  const inOverlay = (pt: Point) =>
    overlays.some(
      (o) => pt.x >= o.x && pt.x <= o.x + o.width && pt.y >= o.y && pt.y <= o.y + o.height,
    );
  let best: { pt: Point; d: number } | null = null;
  const margin = 40;
  for (let x = box.x + margin; x <= box.x + box.width - margin; x += 20) {
    for (let y = box.y + margin; y <= box.y + box.height - margin; y += 20) {
      const pt = { x, y };
      if (inOverlay(pt)) continue;
      const d = Math.min(...occupied.map((o) => dist(o, pt)));
      if (!best || d > best.d) best = { pt, d };
    }
  }
  if (!best || best.d < minDistance) {
    throw new Error(`no empty canvas point at >= ${minDistance}px from board objects`);
  }
  return best.pt;
}

/** Real mouse drag in small steps (Konva needs >= 4 px movement to start a drag, A-10). */
export async function mouseDrag(page: Page, from: Point, to: Point, steps = 15): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y + 6, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

export function isCommandPost(r: Request): boolean {
  return r.method() === 'POST' && /\/api\/games\/[^/]+\/commands$/.test(new URL(r.url()).pathname);
}

export function waitForCommand(page: Page) {
  return page.waitForResponse((r) => isCommandPost(r.request()));
}

/** Runs `action` and asserts that no `POST /commands` was sent during it and for `settleMs` after. */
export async function expectNoCommandSent(
  page: Page,
  action: () => Promise<void>,
  settleMs = 800,
): Promise<void> {
  const sent: string[] = [];
  const onRequest = (r: Request) => {
    if (isCommandPost(r)) sent.push(r.url());
  };
  page.on('request', onRequest);
  try {
    await action();
    await page.waitForTimeout(settleMs);
  } finally {
    page.off('request', onRequest);
  }
  expect(sent, 'no POST /commands expected').toEqual([]);
}

export interface RecordedCall {
  method: string;
  url: string;
  status: number;
  body: unknown;
}

/** Records every `/api/**` response of the page (body parsed as JSON when possible). Call `settle()` before asserting. */
export function recordApi(page: Page): { calls: RecordedCall[]; settle: () => Promise<void> } {
  const calls: RecordedCall[] = [];
  const pending: Promise<void>[] = [];
  page.on('response', (res) => {
    const url = res.url();
    if (!new URL(url).pathname.startsWith('/api/')) return;
    pending.push(
      res
        .json()
        .catch(() => null)
        .then((body: unknown) => {
          calls.push({ method: res.request().method(), url, status: res.status(), body });
        }),
    );
  });
  return { calls, settle: async () => void (await Promise.all(pending)) };
}

/** True if the element is the focused element. */
export const isFocused = (loc: Locator) => loc.evaluate((el) => el === document.activeElement);

/**
 * Moves keyboard focus to `target` using only Tab / ArrowDown (no mouse, no programmatic focus).
 * Inside a listbox (roving tabindex) it uses ArrowDown. Every step must have a visible focus (`:focus-visible`).
 */
export async function keyboardFocus(page: Page, target: Locator, maxSteps = 250): Promise<void> {
  const targetInListbox = await target.evaluate((el) => !!el.closest('[role="listbox"]'));
  for (let i = 0; i < maxSteps; i++) {
    if (await isFocused(target)) return;
    const state = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        inListbox: !!el?.closest('[role="listbox"]'),
        focusVisible: !el || el === document.body ? true : el.matches(':focus-visible'),
      };
    });
    expect(state.focusVisible, 'focused element must be :focus-visible').toBe(true);
    await page.keyboard.press(state.inListbox && targetInListbox ? 'ArrowDown' : 'Tab');
  }
  throw new Error(`could not reach target by keyboard in ${maxSteps} steps`);
}

/** Saves an AC-11 screenshot to docs/tasks/SWR-002/artifacts/screenshots/<name>.png. */
export async function saveScreenshot(page: Page, name: string): Promise<void> {
  const { configFile } = test.info().config;
  const repoRoot = configFile ? path.dirname(configFile) : process.cwd();
  const dir = path.join(repoRoot, 'docs', 'tasks', 'SWR-002', 'artifacts', 'screenshots');
  await page.screenshot({ path: path.join(dir, `${name}.png`), animations: 'disabled' });
}
