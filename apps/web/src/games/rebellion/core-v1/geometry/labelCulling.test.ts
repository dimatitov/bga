/**
 * SWR-009 M fix round 1 — collision culling of map captions below the detail threshold (AC-13): plates always stay,
 * captions that would touch a plate of another system or a kept caption are dropped, marked systems keep theirs.
 */
import { describe, expect, it } from 'vitest';
import { NO_SELECTION } from '../../board/model/selectionStore';
import { CS_CORELLIA, CS_CORUSCANT, makeCoreView } from '../../test/coreFixtures';
import { cullLabels } from './labelCulling';
import { type LabelBox, regionLabelBox, systemLabelBox } from './labelLayout';
import { buildScene } from './sceneModel';

const view = makeCoreView();

function boxes(scene: ReturnType<typeof buildScene>, text: (id: string) => string) {
  const system = new Map<string, LabelBox>();
  for (const s of scene.systems) system.set(s.id, systemLabelBox([text(s.id)]));
  const region = new Map<string, LabelBox>();
  for (const r of scene.regions) region.set(r.id, regionLabelBox(`region ${r.id}`));
  return { system, region };
}

describe('cullLabels', () => {
  it('detail LOD: nothing is culled', () => {
    const scene = buildScene({ view, armedLeaderId: null, selection: NO_SELECTION, lod: 'detail' });
    const b = boxes(scene, () => 'x'.repeat(40));
    const shown = cullLabels({ scene, labelBoxes: b.system, regionLabels: b.region, scale: 1 });
    expect(shown.systems.size).toBe(scene.systems.length);
    expect(shown.regions.size).toBe(scene.regions.length);
  });

  it('compact LOD at a tiny scale: colliding captions are dropped, the selected system keeps its label', () => {
    const selection = { kind: 'system' as const, systemId: CS_CORELLIA };
    const scene = buildScene({ view, armedLeaderId: null, selection, lod: 'compact' });
    const b = boxes(scene, () => 'W'.repeat(16)); // wide labels on a 5 % map → everything collides
    const shown = cullLabels({ scene, labelBoxes: b.system, regionLabels: b.region, scale: 0.05 });
    expect(shown.systems.has(CS_CORELLIA)).toBe(true);
    expect(shown.systems.size).toBeLessThan(scene.systems.length);
  });

  it('compact LOD at a comfortable scale keeps every short caption', () => {
    const scene = buildScene({
      view,
      armedLeaderId: null,
      selection: NO_SELECTION,
      lod: 'compact',
    });
    const b = boxes(scene, (id) => id.slice(0, 3));
    const shown = cullLabels({ scene, labelBoxes: b.system, regionLabels: b.region, scale: 0.6 });
    expect(shown.systems.size).toBe(scene.systems.length);
    expect(shown.systems.has(CS_CORUSCANT)).toBe(true);
  });
});

describe('cullLabels — canvas edge (fix round 3)', () => {
  it('a caption that would leave the canvas is culled, even for a marked system', () => {
    const selection = { kind: 'system' as const, systemId: CS_CORELLIA };
    const scene = buildScene({ view, armedLeaderId: null, selection, lod: 'compact' });
    const b = boxes(scene, (id) => id.slice(0, 3));
    // a 1×1 px canvas: nothing fits
    const none = cullLabels({
      scene,
      labelBoxes: b.system,
      regionLabels: b.region,
      scale: 0.5,
      stage: { x: 0, y: 0, width: 1, height: 1 },
    });
    expect(none.systems.size).toBe(0);
    expect(none.regions.size).toBe(0);
    // a huge canvas around the map: everything fits as without the edge check
    const all = cullLabels({
      scene,
      labelBoxes: b.system,
      regionLabels: b.region,
      scale: 0.5,
      stage: { x: 100, y: 100, width: 5000, height: 5000 },
    });
    expect(all.systems.size).toBe(scene.systems.length);
  });
});
