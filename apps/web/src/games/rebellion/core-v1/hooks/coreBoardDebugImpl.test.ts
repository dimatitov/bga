/**
 * SWR-009 M — debug API of the vector map (plan §5.3, AC-8 (e)): `getPieceScreenPos` = move handle / centre of the
 * group marker / zone marker; new `getGroupMarkers`, `getAiRecentSystemIds`, `getRouteCount`, `getRegionCount`; on the
 * Empire's redacted view no method returns (or mentions) the base system.
 */
import type { PlayerViewCore } from '@bga/game-rebellion/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NO_SELECTION } from '../../board/model/selectionStore';
import { useViewportStore } from '../../board/model/viewportStore';
import {
  CS_CORUSCANT,
  CS_HOTH,
  CS_SULLUST,
  CS_YAVIN,
  L_DODONNA,
  U_RT_BASE,
  U_SD,
  U_TRANSPORT,
  U_XWING,
  aiRunEventsRedacted,
  empireRedactedView,
  makeCoreActivationView,
  makeCoreView,
  withLastRun,
} from '../../test/coreFixtures';
import type { Lod } from '../geometry/lod';
import { markerScreenRect, rectCenter } from '../geometry/markerLayout';
import { buildScene } from '../geometry/sceneModel';
import { aiRecentMarks } from '../model/aiRecent';
import { type CoreBoardDebug, installCoreBoardDebug } from './coreBoardDebugImpl';

const VIEWPORT = { scale: 0.8, x: 10, y: 20 };
let uninstall: (() => void) | null = null;

function install(view: PlayerViewCore, lod: Lod = 'detail', withAi = false): CoreBoardDebug {
  const aiRecent = withAi ? aiRecentMarks(withLastRun(aiRunEventsRedacted()), view) : null;
  const scene = buildScene({ view, armedLeaderId: null, selection: NO_SELECTION, lod, aiRecent });
  const container = document.createElement('div');
  uninstall = installCoreBoardDebug(() => ({
    container,
    view,
    scene,
    bounds: null,
    labelBoxes: new Map(),
  }));
  return (window as unknown as { __boardDebug: CoreBoardDebug }).__boardDebug;
}

beforeEach(() => {
  useViewportStore.setState((s) => ({ ...s, viewport: { ...VIEWPORT } }));
});
afterEach(() => {
  uninstall?.();
  uninstall = null;
});

describe('core __boardDebug (SWR-009 §5.3)', () => {
  it('getGroupMarkers: one entry per side × arena with the COUNT and the page centre of the plate', () => {
    const dbg = install(makeCoreView());
    const markers = dbg.getGroupMarkers();
    expect(
      markers.filter((m) => m.systemId === CS_CORUSCANT).map((m) => [m.side, m.arena, m.count]),
    ).toEqual([
      ['empire', 'space', 2],
      ['empire', 'ground', 2],
    ]);
    const total = markers.reduce((n, m) => n + m.count, 0);
    expect(total).toBe(makeCoreView().units.filter((u) => u.location.kind === 'system').length);
  });

  it('getPieceScreenPos: centre of the group marker; the move handle during the own activation', () => {
    const dbg = install(makeCoreView());
    const sd = dbg.getPieceScreenPos(U_SD)!;
    const space = dbg
      .getGroupMarkers()
      .find((m) => m.systemId === CS_CORUSCANT && m.arena === 'space')!;
    expect(sd).toEqual(space.screen);
    uninstall?.();

    const act = install(makeCoreActivationView());
    const transport = act.getPieceScreenPos(U_TRANSPORT)!;
    const sullust = act.getSystemScreenPos(CS_SULLUST)!;
    expect(transport.y).toBeLessThan(sullust.y); // handle on the upper arc of the source
    const marker = act
      .getGroupMarkers()
      .find((m) => m.systemId === CS_SULLUST && m.arena === 'space')!;
    expect(transport).not.toEqual(marker.screen);
  });

  it('compact LOD: units and leaders resolve to their side marker', () => {
    const dbg = install(makeCoreView(), 'compact');
    const markers = dbg.getGroupMarkers();
    expect(markers.every((m) => m.arena === 'all')).toBe(true);
    const yavin = markers.find((m) => m.systemId === CS_YAVIN)!;
    expect(dbg.getPieceScreenPos(U_XWING)).toEqual(yavin.screen);
    expect(yavin.count).toBe(3);
  });

  it('route / region counts come from view.map (fixture 5 / 2; real map 69 / 8 via e2e)', () => {
    const dbg = install(makeCoreView());
    expect(dbg.getRouteCount()).toBe(5);
    expect(dbg.getRegionCount()).toBe(2);
  });

  it('Empire redacted view: zone markers have systemId null, nothing returns or names the base system', () => {
    const view = empireRedactedView();
    const dbg = install(view, 'detail', true);
    const markers = dbg.getGroupMarkers();
    const zone = markers.filter((m) => m.systemId === null);
    expect(zone.map((m) => [m.side, m.arena, m.count])).toEqual([
      ['rebels', 'space', 1],
      ['rebels', 'ground', 2],
    ]);
    expect(markers.some((m) => m.systemId === CS_YAVIN)).toBe(false);
    // base units resolve to the zone marker, never to a system position
    expect(dbg.getPieceScreenPos(U_RT_BASE)).toEqual(
      zone.find((m) => m.arena === 'ground')!.screen,
    );
    expect(dbg.getPieceScreenPos(U_XWING)).toEqual(zone.find((m) => m.arena === 'space')!.screen);
    expect(dbg.getLeaderScreenPos(L_DODONNA)).not.toBeNull();
    expect(dbg.getAiRecentSystemIds()).toEqual([CS_SULLUST, CS_HOTH]);
    expect(dbg.getRebelBaseSystemId()).toBeNull();
    const dump = JSON.stringify({
      markers,
      ai: dbg.getAiRecentSystemIds(),
      base: dbg.getRebelBaseSystemId(),
      routes: dbg.getRouteCount(),
      regions: dbg.getRegionCount(),
      zone: dbg.hasHiddenZone(),
    });
    expect(dump).not.toContain(CS_YAVIN);
  });

  it('marker centre = markerScreenRect geometry (same numbers as the Konva plate)', () => {
    const view = makeCoreView();
    const dbg = install(view);
    const scene = buildScene({ view, armedLeaderId: null, selection: NO_SELECTION, lod: 'detail' });
    const m = scene.markers[0]!;
    const c = rectCenter(markerScreenRect(m.anchor, m.box, VIEWPORT));
    const got = dbg.getGroupMarkers()[0]!.screen;
    expect(got.x).toBeCloseTo(c.x);
    expect(got.y).toBeCloseTo(c.y);
  });
});
