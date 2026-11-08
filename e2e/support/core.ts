/// <reference lib="dom" />
// SWR-005 core-v1 table helpers: UI turn flow (arm a leader, activate, move, finish, pass), zoom to the detail LOD
// around a point, response capture. Everything the specs assert comes from the server response / view or from
// `__boardDebug` (read-only) — never from component internals.
import { expect, type APIRequestContext, type Page, type Response } from '@playwright/test';
import {
  asCore,
  asHandoff,
  commandOk,
  planActivation,
  type CoreCommandResponse,
  type CorePlayerView,
  type Faction,
  type HandoffView,
} from './api';
import { dbg, isCommandPost, waitViewportStable, type Point } from './board';
import { T } from './testids';

/** Waits for the next `POST /commands` response and parses it. */
export async function nextCommand(
  page: Page,
  action: () => Promise<unknown>,
): Promise<{ res: Response; body: CoreCommandResponse }> {
  const wait = page.waitForResponse((r) => isCommandPost(r.request()));
  await action();
  const res = await wait;
  return { res, body: (await res.json()) as CoreCommandResponse };
}

/** Same, but expects 200 and a core-v1 player view in the body. */
export async function commandViaUi(
  page: Page,
  action: () => Promise<unknown>,
): Promise<{ res: Response; body: CoreCommandResponse; view: CorePlayerView }> {
  const out = await nextCommand(page, action);
  expect(out.res.status(), `UI command: ${JSON.stringify(out.body).slice(0, 300)}`).toBe(200);
  return { ...out, view: asCore(out.body.view) };
}

export const tableVersion = async (page: Page): Promise<number> =>
  Number(await page.getByTestId(T.gameTable).getAttribute('data-version'));

/** Clicks a leader in the pool and waits until it is armed (radio checked, turn panel `armed`). */
export async function armLeader(page: Page, leaderId: string): Promise<void> {
  const radio = page.getByTestId(T.leader(leaderId));
  await radio.click();
  await expect(radio).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId(T.turnPanel)).toHaveAttribute('data-state', 'armed');
}

/** Clicks the centre of a system on the map (`__boardDebug.getSystemScreenPos`). */
export async function clickSystem(page: Page, systemId: string): Promise<void> {
  const p = await dbg.systemPos(page, systemId);
  await page.mouse.click(p.x, p.y);
}

/** Midpoint of two systems on screen. */
export async function midpoint(page: Page, a: string, b: string): Promise<Point> {
  const pa = await dbg.systemPos(page, a);
  const pb = await dbg.systemPos(page, b);
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
}

/** Wheel-zooms around `at` (the world point under the cursor stays put) until the map is in the detail LOD. */
export async function zoomToDetailAround(page: Page, at: Point): Promise<void> {
  await page.mouse.move(at.x, at.y);
  for (let i = 0; i < 12 && (await dbg.lod(page)) !== 'detail'; i++) {
    await page.mouse.wheel(0, -200);
    await waitViewportStable(page);
  }
  expect(await dbg.lod(page), 'map reached the detail LOD').toBe('detail');
}

/** «Finish activation» via the top bar. */
export const finishViaUi = (page: Page) =>
  commandViaUi(page, () => page.getByTestId(T.finishActivation).click());

/** «Pass» via the top bar; confirms the dialog when it appears (only while a leader can still activate). */
export async function passViaUi(page: Page, expectDialog: boolean) {
  if (!expectDialog) {
    const out = await commandViaUi(page, () => page.getByTestId(T.passTurn).click());
    await expect(page.getByTestId(T.passConfirm)).toHaveCount(0);
    return out;
  }
  await page.getByTestId(T.passTurn).click();
  await expect(page.getByTestId(T.passConfirm)).toBeVisible();
  return commandViaUi(page, () => page.getByTestId(T.passConfirmOk).click());
}

/** The response events of the given types, in order. */
export const eventsOf = (body: CoreCommandResponse, type: string) =>
  body.events.filter((e) => e.type === type);

/** Expects the table header to show `side` as the active side. */
export async function expectTurn(page: Page, side: Faction): Promise<void> {
  await expect(page.getByTestId(T.gameTable)).toHaveAttribute('data-active-side', side);
  await expect(page.getByTestId(T.turnIndicator)).toHaveAttribute('data-side', side);
}

/** Expects the time track to show `time` / `reputation`. */
export async function expectTrack(page: Page, time: number, reputation = 14): Promise<void> {
  const track = page.getByTestId(T.timeTrack);
  await expect(track).toHaveAttribute('data-time', String(time));
  await expect(track).toHaveAttribute('data-reputation', String(reputation));
}

const LOCALES_DIR = new URL('../../apps/web/src/games/rebellion/locales/', import.meta.url);
const dataCache = new Map<string, { systems: Record<string, string> }>();

/** Localized system name as the UI shows it (locale file of the page's current `<html lang>`). */
export async function systemName(page: Page, systemId: string): Promise<string> {
  const lang = ((await page.locator('html').getAttribute('lang')) ?? 'ru').startsWith('en')
    ? 'en'
    : 'ru';
  if (!dataCache.has(lang)) {
    const { readFileSync } = await import('node:fs');
    dataCache.set(
      lang,
      JSON.parse(readFileSync(new URL(`${lang}/data.json`, LOCALES_DIR), 'utf8')) as {
        systems: Record<string, string>;
      },
    );
  }
  const name = dataCache.get(lang)!.systems[systemId];
  if (!name) throw new Error(`no ${lang} name for system ${systemId}`);
  return name;
}

/**
 * Hot-seat core-v1 session → handoff to the Empire through the public API (activation + finish of the Rebels).
 * Replaces the SWR-004 `endTurn` helper for core sessions (END_TURN is not legal in core-v1).
 */
export async function toHandoff(
  request: APIRequestContext,
  sessionId: string,
  view: CorePlayerView,
): Promise<HandoffView> {
  const plan = planActivation(view, [view.rebelBase.systemId ?? '']);
  const act = asCore(
    (
      await commandOk(request, sessionId, view, {
        type: 'ACTIVATE_SYSTEM',
        leaderId: plan.leaderId,
        systemId: plan.systemId,
      })
    ).view,
  );
  return asHandoff((await commandOk(request, sessionId, act, { type: 'FINISH_ACTIVATION' })).view);
}
