/// <reference lib="dom" />
// Board helpers: `window.__boardDebug` (plan-frontend.md §6.3, R-11 — read-only, enabled by VITE_E2E=1),
// mouse gestures, keyboard walking, network recording and screenshots (SWR-004: per-task screenshot routing).
import path from 'node:path';
import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { API, REBELLION, type PlayerView } from './api';
import { T } from './testids';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardDebug {
  getViewport(): { scale: number; x: number; y: number };
  getZoomLimits(): { min: number; max: number };
  getSystemScreenPos(systemId: string): Point | null;
  getPieceScreenPos(pieceId: string): Point | null;
  getSelection(): { kind: 'system' | 'piece' | 'leader' | 'zone' | null; id: string | null };
  getHighlightedSystemIds(): string[];
  isDragging(): boolean;
  // SWR-005 core-v1 only (plan-frontend §9, coreBoardDebugImpl.ts); absent on the mock table.
  getMoveSourceIds?(): string[];
  getLeaderScreenPos?(leaderId: string): Point | null;
  getSystemLabelRect?(systemId: string): Rect | null;
  getContentBounds?(): { minX: number; minY: number; maxX: number; maxY: number } | null;
  getLod?(): string;
  getActivatedSystemId?(): string | null;
  getArmedLeaderId?(): string | null;
  getRulesEngine?(): 'core-v1';
  getRebelBaseSystemId?(): string | null;
  getContestedSystemIds?(): string[];
  hasHiddenZone?(): boolean;
}

declare global {
  interface Window {
    __boardDebug?: BoardDebug;
  }
}

/** URL path of a session table (`/sessions/:sessionId`). */
export const sessionPath = (sessionId: string) => `/sessions/${encodeURIComponent(sessionId)}`;
/** URL path of a game page (`/games/:gameId`). */
export const gamePath = (gameId: string) => `/games/${encodeURIComponent(gameId)}`;
/** URL path of the new-session screen of a game (`/games/:gameId/new`). */
export const newSessionPath = (gameId: string) => `${gamePath(gameId)}/new`;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Matches a full URL whose pathname is exactly `urlPath` (any origin, optional query/hash). */
export const urlOf = (urlPath: string) =>
  new RegExp(`^[a-z]+://[^/]+${escapeRe(urlPath)}(?:[?#].*)?$`);
/** Matches a session table URL and captures the session id. */
export const SESSION_URL = /^[a-z]+:\/\/[^/]+\/sessions\/([^/?#]+)(?:[?#].*)?$/;

/** Opens `/sessions/:id` and waits until the table and the debug hook are ready. */
export async function openSession(
  page: Page,
  sessionId: string,
  options: { engine?: 'core-v1' | 'mock-v1' } = {},
): Promise<void> {
  await page.goto(sessionPath(sessionId));
  await waitForTable(page, sessionId, options);
}

/** Opens a core-v1 session table (`game-table[data-rules-engine=core-v1]`). */
export const openCore = (page: Page, sessionId: string) =>
  openSession(page, sessionId, { engine: 'core-v1' });
/** Opens a legacy (mock-v1, seeded) session table. */
export const openLegacy = (page: Page, sessionId: string) =>
  openSession(page, sessionId, { engine: 'mock-v1' });

/**
 * Waits for the Rebellion table. With `sessionId` it also checks `game-table[data-session-id]` (Q-10, TR-1) and
 * that `data-game-id` is the game id (not the session id as in SWR-002).
 */
export async function waitForTable(
  page: Page,
  sessionId?: string,
  options: { engine?: 'core-v1' | 'mock-v1' } = {},
): Promise<void> {
  const table = page.getByTestId(T.gameTable);
  await expect(table).toBeVisible();
  if (options.engine) await expect(table).toHaveAttribute('data-rules-engine', options.engine);
  if (sessionId) {
    await expect(table).toHaveAttribute('data-session-id', sessionId);
    await expect(table).toHaveAttribute('data-game-id', REBELLION);
  }
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
  // core-v1
  labelRect: async (page: Page, systemId: string): Promise<Rect> => {
    const r = await page.evaluate((id) => window.__boardDebug!.getSystemLabelRect!(id), systemId);
    if (!r) throw new Error(`__boardDebug.getSystemLabelRect(${systemId}) returned null`);
    return r;
  },
  lod: (page: Page) => page.evaluate(() => window.__boardDebug!.getLod!()),
  contentBounds: (page: Page) => page.evaluate(() => window.__boardDebug!.getContentBounds!()),
  activated: (page: Page) => page.evaluate(() => window.__boardDebug!.getActivatedSystemId!()),
  armedLeader: (page: Page) => page.evaluate(() => window.__boardDebug!.getArmedLeaderId!()),
  rulesEngine: (page: Page) =>
    page.evaluate(() => window.__boardDebug!.getRulesEngine?.() ?? 'mock-v1'),
  rebelBase: (page: Page) => page.evaluate(() => window.__boardDebug!.getRebelBaseSystemId!()),
  contested: (page: Page) =>
    page.evaluate(() => [...window.__boardDebug!.getContestedSystemIds!()].sort()),
  moveSources: (page: Page) =>
    page.evaluate(() => [...window.__boardDebug!.getMoveSourceIds!()].sort()),
  hasHiddenZone: (page: Page) => page.evaluate(() => window.__boardDebug!.hasHiddenZone!()),
  leaderPos: async (page: Page, leaderId: string): Promise<Point> => {
    const p = await page.evaluate((id) => window.__boardDebug!.getLeaderScreenPos!(id), leaderId);
    if (!p) throw new Error(`__boardDebug.getLeaderScreenPos(${leaderId}) returned null`);
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
 * controls (zoom buttons, prototype badge). Used for background clicks and pan gestures.
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
  for (const id of [T.zoomIn, T.zoomOut, T.zoomFit, T.zoomLevel, T.prototypeBadge]) {
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

/**
 * Points of the canvas far from every system centre, unit and leader of a core-v1 view (core counterpart of
 * {@link emptyCanvasPoint}).
 */
export async function emptyCoreCanvasPoint(
  page: Page,
  view: { map: { systems: { id: string }[] }; units: { id: string }[] },
  minDistance = 60,
): Promise<Point> {
  const box = await canvasBox(page);
  const occupied: Point[] = [];
  for (const s of view.map.systems) occupied.push(await dbg.systemPos(page, s.id));
  for (const u of view.units) {
    const pos = await page.evaluate((id) => window.__boardDebug!.getPieceScreenPos(id), u.id);
    if (pos) occupied.push(pos);
  }
  for (const s of view.map.systems) {
    const r = await page.evaluate(
      (id) => window.__boardDebug!.getSystemLabelRect?.(id) ?? null,
      s.id,
    );
    if (r) occupied.push({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
  }
  const overlays: Rect[] = [];
  for (const id of [T.zoomIn, T.zoomOut, T.zoomFit, T.zoomLevel, T.gameOverBanner, 'map-caption']) {
    for (const handle of await page.getByTestId(id).all()) {
      const b = await handle.boundingBox();
      if (b)
        overlays.push({ x: b.x - 12, y: b.y - 12, width: b.width + 24, height: b.height + 24 });
    }
  }
  let best: { pt: Point; d: number } | null = null;
  for (let x = box.x + 30; x <= box.x + box.width - 30; x += 15) {
    for (let y = box.y + 30; y <= box.y + box.height - 30; y += 15) {
      const pt = { x, y };
      if (overlays.some((o) => x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height))
        continue;
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
  return r.method() === 'POST' && API.commands.test(new URL(r.url()).pathname);
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
    // The starting element may have been focused by a mouse click or programmatically (not :focus-visible by
    // design); every element reached by a key press must show a visible focus.
    if (i > 0) expect(state.focusVisible, 'focused element must be :focus-visible').toBe(true);
    await page.keyboard.press(state.inListbox && targetInListbox ? 'ArrowDown' : 'Tab');
  }
  throw new Error(`could not reach target by keyboard in ${maxSteps} steps`);
}

/**
 * Screenshot routing (SWR-004 test-cases.md §5 "Screenshots"):
 * - every screenshot belongs to a task (`saveScreenshot(page, name, task)`, default {@link CURRENT_SCREENSHOT_TASK});
 * - it is written into the tracked evidence folder `docs/tasks/<task>/artifacts/screenshots/<name>.png` **only** when
 *   `task` is the evidence task of this run: env `SCREENSHOT_TASK` if set, otherwise {@link CURRENT_SCREENSHOT_TASK};
 * - screenshots of any other task go to the untracked `test-results/screenshots/<task>/<name>.png` (the screens are
 *   still exercised, but historical evidence of finished tasks — SWR-002, SWR-003 — is never rewritten by a run).
 * Regenerate old evidence deliberately: `SCREENSHOT_TASK=SWR-003 pnpm e2e` (then SWR-004 shots go to test-results).
 * SWR-005B: current task is SWR-005B (dev-ai.spec.ts); SWR-005 specs pass 'SWR-005' explicitly.
 */
export const CURRENT_SCREENSHOT_TASK = 'SWR-005B';

/** Task whose evidence folder receives screenshots in this run. */
export function evidenceTask(): string {
  return process.env.SCREENSHOT_TASK?.trim() || CURRENT_SCREENSHOT_TASK;
}

/** Absolute path where `saveScreenshot(…, name, task)` writes (exported for the docs/tests of the routing rule). */
export function screenshotPath(repoRoot: string, name: string, task: string): string {
  const dir =
    task === evidenceTask()
      ? path.join(repoRoot, 'docs', 'tasks', task, 'artifacts', 'screenshots')
      : path.join(repoRoot, 'test-results', 'screenshots', task);
  return path.join(dir, `${name}.png`);
}

/** Saves a viewport (or, with `fullPage`, full-page) screenshot of `task` (see the routing rule above). */
export async function saveScreenshot(
  page: Page,
  name: string,
  task: string = CURRENT_SCREENSHOT_TASK,
  options: { fullPage?: boolean } = {},
): Promise<void> {
  const { configFile } = test.info().config;
  const repoRoot = configFile ? path.dirname(configFile) : process.cwd();
  await page.screenshot({
    path: screenshotPath(repoRoot, name, task),
    animations: 'disabled',
    fullPage: options.fullPage ?? false,
  });
}
