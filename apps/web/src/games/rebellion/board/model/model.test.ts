import { mapLayout } from '@bga/game-rebellion/board';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeMovedView,
  makeView,
  P_E1,
  P_E2,
  P_E3,
  P_R1,
  P_RH,
  S_A,
  S_B,
  S_C,
  S_D,
} from '../test/fixtures';
import { MAX_SCALE, MIN_SCALE, ORBIT_RADIUS, PIECE_SIZE, SLOTS_PER_SIDE } from './constants';
import { useDragStore } from './dragStore';
import {
  canZoomIn,
  canZoomOut,
  clampScale,
  computeBounds,
  fitViewport,
  nearestSystem,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from './geometry';
import {
  canAdvancePhase,
  groupMoveForSystem,
  highlightedSystemIds,
  moveTargetsForPiece,
} from './legal';
import { layoutPiecesInSystem, previewSlotForMove, type LayoutPiece } from './pieceLayout';
import { useSelectionStore } from './selectionStore';
import { useViewportStore } from './viewportStore';

describe('geometry', () => {
  it('zoomAt keeps the world point under the cursor fixed', () => {
    const vp = { scale: 1, x: 30, y: -20 };
    const pointer = { x: 400, y: 250 };
    const before = screenToWorld(vp, pointer);
    const next = zoomAt(vp, pointer, 1.1);
    expect(next.scale).toBeCloseTo(1.1);
    const after = worldToScreen(next, before);
    expect(after.x).toBeCloseTo(pointer.x);
    expect(after.y).toBeCloseTo(pointer.y);
  });

  it('clamps scale to MIN/MAX and reports limits', () => {
    expect(clampScale(10)).toBe(MAX_SCALE);
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    let vp = { scale: 1, x: 0, y: 0 };
    for (let i = 0; i < 50; i++) vp = zoomAt(vp, { x: 0, y: 0 }, 1.25);
    expect(vp.scale).toBe(MAX_SCALE);
    expect(canZoomIn(vp.scale)).toBe(false);
    expect(canZoomOut(vp.scale)).toBe(true);
    for (let i = 0; i < 50; i++) vp = zoomAt(vp, { x: 0, y: 0 }, 0.8);
    expect(vp.scale).toBe(MIN_SCALE);
    expect(canZoomOut(vp.scale)).toBe(false);
  });

  it('fit contains every system of the layout inside the stage with padding', () => {
    const ids = Object.keys(mapLayout);
    const bounds = computeBounds(mapLayout, ids);
    expect(bounds).not.toBeNull();
    const stage = { width: 1056, height: 844 };
    const vp = fitViewport(bounds!, stage, 64);
    for (const id of ids) {
      const p = worldToScreen(vp, mapLayout[id]!);
      expect(p.x).toBeGreaterThanOrEqual(64);
      expect(p.x).toBeLessThanOrEqual(stage.width - 64);
      expect(p.y).toBeGreaterThanOrEqual(64);
      expect(p.y).toBeLessThanOrEqual(stage.height - 64);
    }
  });

  it('nearestSystem snaps only within the radius', () => {
    const centers = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 200, y: 0 }],
    ]);
    expect(nearestSystem({ x: 20, y: 10 }, centers, 70)).toBe('a');
    expect(nearestSystem({ x: 190, y: 0 }, centers, 70)).toBe('b');
    expect(nearestSystem({ x: 100, y: 0 }, centers, 70)).toBeNull();
  });
});

describe('pieceLayout', () => {
  const center = { x: 500, y: 500 };
  const pieces: LayoutPiece[] = [
    { id: 'p3', kind: 'token', owner: 'empire' },
    { id: 'p1', kind: 'unit', owner: 'empire' },
    { id: 'r1', kind: 'unit', owner: 'rebels' },
    { id: 'p2', kind: 'leader', owner: 'empire' },
  ];

  it('is deterministic regardless of input order', () => {
    const a = layoutPiecesInSystem(center, pieces);
    const b = layoutPiecesInSystem(center, [...pieces].reverse());
    expect([...a.slots.entries()].sort()).toEqual([...b.slots.entries()].sort());
  });

  it('puts the Empire on the left arc and the Rebellion on the right arc', () => {
    const { slots } = layoutPiecesInSystem(center, pieces);
    expect(slots.get('p1')!.x).toBeCloseTo(center.x - ORBIT_RADIUS);
    expect(slots.get('r1')!.x).toBeCloseTo(center.x + ORBIT_RADIUS);
    expect(slots.get('p2')!.x).toBeLessThan(center.x);
  });

  it('never overlaps slots and counts overflow beyond SLOTS_PER_SIDE', () => {
    const many: LayoutPiece[] = Array.from({ length: SLOTS_PER_SIDE + 3 }, (_, i) => ({
      id: `e${String(i).padStart(2, '0')}`,
      kind: 'unit',
      owner: 'empire',
    }));
    const { slots, overflow } = layoutPiecesInSystem(center, many);
    expect(slots.size).toBe(SLOTS_PER_SIDE);
    expect(overflow).toEqual({ empire: 3, rebels: 0 });
    const pts = [...slots.values()];
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++)
        expect(Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y)).toBeGreaterThanOrEqual(
          PIECE_SIZE,
        );
  });

  it('previewSlotForMove returns the slot the piece would take in the target', () => {
    const slot = previewSlotForMove(center, [{ id: 'x1', kind: 'unit', owner: 'empire' }], {
      id: 'x0',
      kind: 'unit',
      owner: 'empire',
    });
    expect(slot).toEqual(
      layoutPiecesInSystem(center, [
        { id: 'x1', kind: 'unit', owner: 'empire' },
        { id: 'x0', kind: 'unit', owner: 'empire' },
      ]).slots.get('x0'),
    );
  });
});

describe('legal helpers (TC-WEB-06/07: only view.legalActions)', () => {
  const view = makeView();

  it('TC-WEB-06: targets come from legalActions, not adjacency', () => {
    expect(view.systems.find((s) => s.id === S_A)!.adjacentSystemIds).toEqual([S_B, S_D]);
    expect(moveTargetsForPiece(view, P_E1)).toEqual([S_B]);
    expect(highlightedSystemIds(view, { kind: 'piece', pieceId: P_E1 }, null)).toEqual([S_B]);
  });

  it('TC-WEB-07: a piece without a legal action has no targets', () => {
    expect(moveTargetsForPiece(view, P_R1)).toEqual([]);
    expect(moveTargetsForPiece(view, P_RH)).toEqual([]);
    expect(highlightedSystemIds(view, { kind: 'system', systemId: S_A }, null)).toEqual([]);
  });

  it('drag highlights the dragged piece targets', () => {
    expect(highlightedSystemIds(view, { kind: 'none' }, { pieceId: P_E3 })).toEqual([
      S_A,
      S_D,
      S_C,
    ]);
  });

  it('group move = intersection of targets of own pieces in the system', () => {
    expect(groupMoveForSystem(view, S_A)).toEqual({ pieceIds: [P_E1, P_E2], toSystemIds: [S_B] });
    expect(groupMoveForSystem(view, S_B)).toBeNull(); // one piece only
    const disjoint = makeView({
      legalActions: [
        { type: 'MOVE_PIECES', pieceId: P_E1, toSystemIds: [S_B] },
        { type: 'MOVE_PIECES', pieceId: P_E2, toSystemIds: [S_D] },
      ],
    });
    expect(groupMoveForSystem(disjoint, S_A)).toBeNull();
  });

  it('canAdvancePhase reflects ADVANCE_PHASE in legalActions', () => {
    expect(canAdvancePhase(view)).toBe(true);
    expect(canAdvancePhase(makeView({ legalActions: [] }))).toBe(false);
  });
});

describe('stores', () => {
  beforeEach(() => {
    useSelectionStore.setState({ gameId: null, selection: { kind: 'none' }, sidebarTab: 'log' });
    useDragStore.getState().clear();
    useViewportStore.setState({
      gameId: null,
      viewport: { scale: 1, x: 0, y: 0 },
      stageSize: { width: 0, height: 0 },
      bounds: null,
      byGame: {},
    });
  });

  it('selection reconciles against a new view and resets on game change', () => {
    const s = useSelectionStore.getState();
    s.activateGame('g1');
    s.selectPiece(P_E1);
    useSelectionStore.getState().reconcile(makeMovedView());
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'piece', pieceId: P_E1 });
    useSelectionStore.getState().reconcile(makeView({ pieces: [] }));
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'none' });
    useSelectionStore.getState().selectSystem(S_A);
    useSelectionStore.getState().activateGame('g2');
    expect(useSelectionStore.getState().selection).toEqual({ kind: 'none' });
  });

  it('viewport fits once stage and bounds are known, then remembers per game', () => {
    const v = useViewportStore.getState();
    v.activateGame('g1');
    v.setBounds(computeBounds(mapLayout, Object.keys(mapLayout)));
    expect(useViewportStore.getState().viewport.scale).toBe(1);
    useViewportStore.getState().setStageSize({ width: 1000, height: 800 });
    const fitted = useViewportStore.getState().viewport;
    expect(fitted.scale).not.toBe(1);
    useViewportStore.getState().zoomIn();
    const zoomed = useViewportStore.getState().viewport;
    expect(zoomed.scale).toBeCloseTo(fitted.scale * 1.25);
    useViewportStore.getState().activateGame('g2');
    useViewportStore.getState().activateGame('g1');
    expect(useViewportStore.getState().viewport).toEqual(zoomed);
  });

  it('drag store tracks over-state and clears', () => {
    const d = useDragStore.getState();
    d.start(P_E1, S_A);
    useDragStore.getState().over(S_B, 'legal');
    expect(useDragStore.getState().drag).toMatchObject({
      pieceId: P_E1,
      overSystemId: S_B,
      overState: 'legal',
    });
    useDragStore.getState().clear();
    expect(useDragStore.getState().drag).toBeNull();
  });
});
