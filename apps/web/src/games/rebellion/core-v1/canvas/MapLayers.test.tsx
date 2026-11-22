/**
 * SWR-009 M — render test of the vector-map Konva layers (TC-ST-05, TC-MAP-03, AC-2/AC-4/AC-5/AC-6). jsdom has no
 * canvas, so `react-konva` is replaced by plain DOM stand-ins that keep every node's type and props: this checks what
 * the layers ask Konva to draw — no `Image` node (no raster), regions dashed without fill, routes, node / label styles
 * from `mapStyle` (tokens), counter markers with the real numbers, zone markers without system ids.
 */
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { terminalTokens } from '@/shared/theme';
import { rebellionPalette } from '../../theme/palette';
import { mapStyle } from '../../theme/mapStyle';
import {
  CS_CORUSCANT,
  CS_SULLUST,
  CS_YAVIN,
  aiRunEventsRedacted,
  empireRedactedView,
  makeCoreActivationView,
  makeCoreView,
  withLastRun,
} from '../../test/coreFixtures';
import { NO_SELECTION } from '../../board/model/selectionStore';
import type { CoreMoveDrag } from '../hooks/useCoreMoveDrag';
import { systemLabelBox, regionLabelBox, type LabelBox } from '../geometry/labelLayout';
import { buildScene, type Scene } from '../geometry/sceneModel';
import { aiRecentMarks } from '../model/aiRecent';
import { InteractiveLayer } from './layers/InteractiveLayer';
import { OverlayLayer } from './layers/OverlayLayer';
import { StaticMapLayer } from './layers/StaticMapLayer';

vi.mock('react-konva', async () => {
  const { createElement } = await import('react');
  const stand = (type: string) =>
    function KonvaStandIn(props: Record<string, unknown> & { children?: ReactNode }) {
      const attrs: Record<string, string> = { 'data-konva': type };
      for (const [k, v] of Object.entries(props)) {
        if (k === 'children' || typeof v === 'function' || v === undefined) continue;
        attrs[`data-${k.toLowerCase()}`] = typeof v === 'string' ? v : JSON.stringify(v);
      }
      return createElement('div', attrs, props.children);
    };
  const names = [
    'Stage',
    'Layer',
    'Group',
    'Rect',
    'Circle',
    'Line',
    'Text',
    'Arrow',
    'Path',
    'RegularPolygon',
    'Image',
  ];
  return Object.fromEntries(names.map((n) => [n, stand(n)]));
});

const moveDrag: CoreMoveDrag = {
  canDrag: () => true,
  start: () => {},
  over: () => {},
  drop: async () => {},
};

function labels(scene: Scene) {
  const system = new Map<string, LabelBox>();
  for (const s of scene.systems) system.set(s.id, systemLabelBox([s.id]));
  const region = new Map<string, LabelBox>();
  for (const r of scene.regions) region.set(r.id, regionLabelBox(r.id));
  return { system, region };
}

function renderLayers(scene: Scene) {
  const { system, region } = labels(scene);
  return render(
    <div data-konva="Stage">
      <StaticMapLayer regions={scene.regions} links={scene.links} />
      <InteractiveLayer
        scene={scene}
        lod={scene.lod}
        screenScale={1}
        zoneTitle="zone"
        aiTag="AI"
        leaderShort={(id) => id.slice(0, 2)}
        moveDrag={moveDrag}
        onSystem={() => {}}
        onUnit={() => {}}
        onLeader={() => {}}
        onZone={() => {}}
        onMarker={() => {}}
        setCursor={() => {}}
      />
      <OverlayLayer scene={scene} screenScale={1} labelBoxes={system} regionLabels={region} />
    </div>,
  );
}

const all = (root: HTMLElement, sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
const base = { armedLeaderId: null, selection: NO_SELECTION, lod: 'detail' as const };

describe('vector map layers', () => {
  it('no raster: the scene never contains a Konva Image (TC-ST-05)', () => {
    for (const view of [makeCoreView(), makeCoreActivationView(), empireRedactedView()]) {
      for (const lod of ['detail', 'compact'] as const) {
        const { container, unmount } = renderLayers(buildScene({ ...base, view, lod }));
        expect(all(container, '[data-konva="Image"]')).toHaveLength(0);
        unmount();
      }
    }
  });

  it('R-4 styles: dashed regions without fill, routes, dark nodes with phosphor outline, warm PT Mono labels', () => {
    const scene = buildScene({ ...base, view: makeCoreView() });
    const { container } = renderLayers(scene);
    const regions = all(container, '[data-name="region"]');
    expect(regions).toHaveLength(scene.regions.length);
    for (const r of regions) {
      expect(r.dataset.stroke).toBe(terminalTokens.color.region);
      expect(JSON.parse(r.dataset.dash!)).toEqual([5, 5]);
      expect(r.dataset.fill).toBeUndefined();
    }
    const routes = all(container, '[data-name="route"]');
    expect(routes).toHaveLength(scene.links.length);
    for (const r of routes) expect(r.dataset.stroke).toBe(terminalTokens.color.route);
    // node: dark fill + phosphor outline (one per system)
    const nodes = all(container, '[data-konva="Circle"]').filter(
      (c) => c.dataset.fill === terminalTokens.color.node,
    );
    expect(nodes).toHaveLength(scene.systems.length);
    for (const n of nodes) expect(n.dataset.stroke).toBe(rebellionPalette.board.systemStroke);
    // labels: warm, PT Mono
    const texts = all(container, '[data-konva="Text"]').filter((t) =>
      scene.systems.some((s) => t.dataset.text === s.id),
    );
    expect(texts).toHaveLength(scene.systems.length);
    for (const t of texts) {
      expect(t.dataset.fill).toBe(terminalTokens.color.warm);
      expect(t.dataset.fontfamily).toBe(mapStyle.font.family);
    }
  });

  it('counter markers carry the real numbers, framed in the side colour', () => {
    const scene = buildScene({ ...base, view: makeCoreView() });
    const { container } = renderLayers(scene);
    const coruscant = all(container, `[data-id^="marker-${CS_CORUSCANT}-"]`);
    expect(coruscant.map((m) => m.dataset.id)).toEqual([
      `marker-${CS_CORUSCANT}-empire-space`,
      `marker-${CS_CORUSCANT}-empire-ground`,
    ]);
    for (const m of coruscant) {
      const plate = all(m, '[data-konva="Rect"]').find(
        (r) => r.dataset.fill === mapStyle.marker.background,
      )!;
      expect(plate.dataset.stroke).toBe(rebellionPalette.faction.empire);
      expect(all(m, '[data-konva="Text"]').map((t) => t.dataset.text)).toEqual(['2']);
    }
  });

  it('move handles only for MOVE_PIECES units during the own activation', () => {
    const { container } = renderLayers(buildScene({ ...base, view: makeCoreActivationView() }));
    expect(
      all(container, '[data-name="unit"]')
        .map((u) => u.dataset.id)
        .sort(),
    ).toEqual([
      'unit-u-r-transport',
      'unit-u-r-trooper-base',
      'unit-u-r-trooper-sullust',
      'unit-u-r-xwing',
    ]);
    const idle = renderLayers(buildScene({ ...base, view: makeCoreView() }));
    expect(all(idle.container, '[data-name="unit"]')).toHaveLength(0);
  });

  it('Empire redacted view: zone markers without system ids, AI marks only on Sullust / Hoth (AC-8, AC-11)', () => {
    const view = empireRedactedView();
    const aiRecent = aiRecentMarks(withLastRun(aiRunEventsRedacted()), view);
    const scene = buildScene({ ...base, view, aiRecent });
    const { container } = renderLayers(scene);
    const zone = container.querySelector<HTMLElement>('[data-id="hidden-base-zone"]')!;
    const zoneMarkers = all(zone, '[data-id^="marker-"]').map((m) => m.dataset.id);
    expect(zoneMarkers).toEqual(['marker-zone-rebels-space', 'marker-zone-rebels-ground']);
    expect(zone.outerHTML).not.toContain(CS_YAVIN);
    const aiSystems = all(container, '[data-name="mark-aiRecent"]').map(
      (m) => m.closest<HTMLElement>('[data-name="system"]')!.dataset.id,
    );
    expect(aiSystems).toEqual([`system-${CS_SULLUST}`, 'system-hoth']);
    expect(container.querySelector('[data-text="AI · 01"]')).not.toBeNull();
    // no system carries a base mark for the Empire before the reveal
    expect(all(container, '[data-name="mark-base"]')).toHaveLength(0);
  });
});
