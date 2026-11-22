/// <reference lib="dom" />
// SWR-009 Galactic Vector Terminal helpers (plan §3.1–3.5, §5.3, §5.4): oracles of the group markers / Unit Manifest
// computed from the server view of the SAME side (test-cases.md Conventions `COUNT(x, side, arena)`), the «recent AI»
// oracle from the redacted events of the AI run (`AIREC`), the names of all 32 systems / 8 regions (ru + en) for the
// hidden-zone leak scan, and typed wrappers of the new `__boardDebug` methods. Read-only — never component internals.
import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import type { CoreEventView, CorePlayerView, Faction } from './api';
import type { DebugGroupMarker } from './board';
import { T } from './testids';

export type Arena = 'space' | 'ground';

export const arenaOf = (view: CorePlayerView, typeKey: string): Arena =>
  view.unitTypes.find((t) => t.typeKey === typeKey)?.arena === 'space' ? 'space' : 'ground';

/** Units of a system (`systemId`) or of the hidden zone (`null`, `location.kind === 'rebelBase'`). */
export function unitsAt(view: CorePlayerView, systemId: string | null) {
  return view.units.filter((u) =>
    systemId === null
      ? u.location.kind === 'rebelBase'
      : u.location.kind === 'system' && u.location.systemId === systemId,
  );
}

export interface ExpectedGroup {
  owner: Faction;
  arena: Arena;
  count: number;
  /** typeKey → count */
  types: Map<string, number>;
}

/** `COUNT(x, side, arena)` oracle: groups side × arena of a system (or the zone) from the server view. */
export function expectedGroups(view: CorePlayerView, systemId: string | null): ExpectedGroup[] {
  const out: ExpectedGroup[] = [];
  for (const owner of ['empire', 'rebels'] as const) {
    for (const arena of ['space', 'ground'] as const) {
      const mine = unitsAt(view, systemId).filter(
        (u) => u.owner === owner && arenaOf(view, u.typeKey) === arena,
      );
      if (mine.length === 0) continue;
      const types = new Map<string, number>();
      for (const u of mine) types.set(u.typeKey, (types.get(u.typeKey) ?? 0) + 1);
      out.push({ owner, arena, count: mine.length, types });
    }
  }
  return out;
}

/** `data-markers` value as a sorted list (`"rebels:space:2"` …), order-independent. */
export const markersList = (attr: string | null): string[] =>
  (attr ?? '')
    .split(',')
    .filter((s) => s.length > 0)
    .sort();

export const expectedMarkersList = (view: CorePlayerView, systemId: string | null): string[] =>
  expectedGroups(view, systemId)
    .map((g) => `${g.owner}:${g.arena}:${g.count}`)
    .sort();

/** Systems sorted by the number of group markers they carry (most first), ties by id. */
export function systemsByGroups(view: CorePlayerView): string[] {
  return view.map.systems
    .map((s) => ({ id: s.id, n: expectedGroups(view, s.id).length }))
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id))
    .map((s) => s.id);
}

/**
 * `AIREC` oracle (plan §3.2, QD-3): systems of the AI-side `SYSTEM_ACTIVATED` / `PIECES_MOVED` events of the run (as
 * the viewer received them, redacted); a `null` system marks the hidden zone, never a system.
 */
export function expectedAiRecent(
  events: readonly CoreEventView[],
  ai: Faction,
): { systemIds: string[]; zone: boolean } {
  const ids: string[] = [];
  let zone = false;
  const mark = (v: unknown) => {
    if (typeof v === 'string') {
      if (!ids.includes(v)) ids.push(v);
    } else if (v === null) zone = true;
  };
  for (const e of events) {
    if (e.actor !== ai) continue;
    if (e.type === 'SYSTEM_ACTIVATED') mark(e.payload.systemId);
    if (e.type === 'PIECES_MOVED') {
      mark(e.payload.fromSystemId);
      mark(e.payload.toSystemId);
    }
  }
  return { systemIds: ids.sort(), zone };
}

const LOCALES_DIR = new URL('../../apps/web/src/games/rebellion/locales/', import.meta.url);

/** Every system and region name of the base map, ru and en (from the locale files the UI uses). */
export function allPlaceNames(): string[] {
  const names: string[] = [];
  for (const lang of ['ru', 'en']) {
    const data = JSON.parse(readFileSync(new URL(`${lang}/data.json`, LOCALES_DIR), 'utf8')) as {
      systems: Record<string, string>;
      regions: Record<string, string>;
    };
    names.push(...Object.values(data.systems), ...Object.values(data.regions));
  }
  return [...new Set(names)];
}

/** Names from {@link allPlaceNames} found in `text` (case-sensitive, whole names). */
export const placeNamesIn = (text: string): string[] =>
  allPlaceNames().filter((n) => text.includes(n));

export const cdbg = {
  groupMarkers: (page: Page): Promise<DebugGroupMarker[]> =>
    page.evaluate(() => window.__boardDebug!.getGroupMarkers!()),
  aiRecent: (page: Page): Promise<string[]> =>
    page.evaluate(() => [...window.__boardDebug!.getAiRecentSystemIds!()].sort()),
  routeCount: (page: Page): Promise<number> =>
    page.evaluate(() => window.__boardDebug!.getRouteCount!()),
  regionCount: (page: Page): Promise<number> =>
    page.evaluate(() => window.__boardDebug!.getRegionCount!()),
};

/**
 * Debug group markers vs the view oracle. Detail LOD: one marker per side × arena; compact LOD: one marker per side
 * with `arena: 'all'` and the sum over the arenas (A-8). `null` = the hidden zone.
 */
export async function expectGroupMarkersMatchView(page: Page, view: CorePlayerView): Promise<void> {
  const lod = await page.evaluate(() => window.__boardDebug!.getLod!());
  const actual = (await cdbg.groupMarkers(page))
    .map((m) => `${m.systemId ?? 'zone'}:${m.side}:${m.arena}:${m.count}`)
    .sort();
  const expected: string[] = [];
  const places: (string | null)[] = [...view.map.systems.map((s) => s.id)];
  if (unitsAt(view, null).length > 0) places.push(null);
  for (const place of places) {
    const groups = expectedGroups(view, place);
    if (lod === 'detail' || place === null) {
      // The zone has no compact form (its markers are always per arena, plan §5.3).
      for (const g of groups) expected.push(`${place ?? 'zone'}:${g.owner}:${g.arena}:${g.count}`);
    } else {
      // Compact plate per side: units of all arenas; a side with only leaders there gets a plate with 0 units.
      for (const owner of ['empire', 'rebels'] as const) {
        const n = groups.filter((g) => g.owner === owner).reduce((s, g) => s + g.count, 0);
        const leaders = view.leaders.filter(
          (l) => l.owner === owner && l.location.kind === 'system' && l.location.systemId === place,
        ).length;
        if (n > 0 || leaders > 0) expected.push(`${place}:${owner}:all:${n}`);
      }
    }
  }
  expect(actual, `group markers (${lod} LOD) = view.units`).toEqual(expected.sort());
}

/** `data-markers` of every `map-system-<id>` (and the zone) = view (LOD-independent mirror). */
export async function expectMapMirrorMatchesView(page: Page, view: CorePlayerView): Promise<void> {
  for (const s of view.map.systems) {
    expect(
      markersList(await page.getByTestId(T.mapSystem(s.id)).getAttribute('data-markers')),
      `map-system-${s.id}[data-markers]`,
    ).toEqual(expectedMarkersList(view, s.id));
  }
}
