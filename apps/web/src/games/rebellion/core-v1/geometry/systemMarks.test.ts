/**
 * SWR-009 M — system state marks (AC-5, R-2/R-3, TC-ST/TC-MAP): every state has a mark, and any two marks differ by
 * geometry (ring radius / dash / width, glyph, node dash) — never by colour alone.
 */
import { describe, expect, it } from 'vitest';
import type { SystemScene } from './sceneModel';
import { MARK_SPECS, type MarkKind, markShapeSignature, systemMarks } from './systemMarks';

const plain: SystemScene = {
  id: 'x',
  nameKey: 'systems.x',
  regionId: 'r1',
  center: { x: 0, y: 0 },
  remote: false,
  contested: false,
  target: false,
  activatedBy: null,
  source: false,
  selected: false,
  isBase: false,
  dropTarget: false,
  dropIllegal: false,
  aiRecent: null,
};

const KINDS = Object.keys(MARK_SPECS) as MarkKind[];

describe('systemMarks', () => {
  it('a plain system has no marks', () => {
    expect(systemMarks(plain)).toEqual([]);
  });

  it('maps every state field to its mark', () => {
    const cases: Array<[Partial<SystemScene>, MarkKind]> = [
      [{ remote: true }, 'remote'],
      [{ contested: true }, 'contested'],
      [{ target: true }, 'target'],
      [{ activatedBy: 'rebels' }, 'activated'],
      [{ source: true }, 'source'],
      [{ selected: true }, 'selected'],
      [{ isBase: true }, 'base'],
      [{ dropTarget: true }, 'dropLegal'],
      [{ dropIllegal: true }, 'dropIllegal'],
      [{ aiRecent: 2 }, 'aiRecent'],
    ];
    for (const [patch, kind] of cases) {
      expect(systemMarks({ ...plain, ...patch }).map((m) => m.kind)).toEqual([kind]);
    }
    expect(cases.map(([, k]) => k).sort()).toEqual([...KINDS].sort());
  });

  it('every pair of marks is distinguishable without colour (shape signature differs)', () => {
    const sigs = KINDS.map((k) => markShapeSignature(MARK_SPECS[k]));
    expect(new Set(sigs).size).toBe(KINDS.length);
    // and no mark is «just a colour»: each has a ring, a glyph or a dashed node outline
    for (const k of KINDS) {
      const m = MARK_SPECS[k];
      expect(m.ring !== null || m.glyph !== 'none' || m.nodeDash !== null, k).toBe(true);
    }
  });

  it('follows R-3: target = dashed ring, selection = solid ring + dashed outer ring + crosshair, AI = dashed + dot', () => {
    expect(MARK_SPECS.target.ring?.dash).not.toBeNull();
    expect(MARK_SPECS.selected.ring?.dash).toBeNull();
    expect(MARK_SPECS.selected.outer?.dash).not.toBeNull();
    expect(MARK_SPECS.selected.glyph).toBe('crosshair');
    expect(MARK_SPECS.aiRecent.ring?.dash).not.toBeNull();
    expect(MARK_SPECS.aiRecent.glyph).toBe('dot');
    expect(MARK_SPECS.selected.ring?.radius).toBe(17);
    expect(MARK_SPECS.selected.outer?.radius).toBe(23);
    expect(MARK_SPECS.aiRecent.ring?.radius).toBe(14);
  });

  it('several states at once: all marks, AI order kept, drawing order inner → outer', () => {
    const marks = systemMarks({
      ...plain,
      remote: true,
      target: true,
      selected: true,
      aiRecent: 1,
      contested: true,
    });
    expect(marks.map((m) => m.kind)).toEqual([
      'remote',
      'target',
      'aiRecent',
      'selected',
      'contested',
    ]);
    expect(marks.find((m) => m.kind === 'aiRecent')?.order).toBe(1);
  });
});
