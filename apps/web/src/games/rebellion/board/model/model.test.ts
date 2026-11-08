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
  adaptivePadding,
  canZoomIn,
  canZoomOut,
  clampScale,
  computeBounds,
  fitInsets,
  fitScale,
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
      contentInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      minScale: MIN_SCALE,
      userAdjusted: false,
      byGame: {},
      byGameSize: {},
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

describe('fit-to-view (SWR-005 plan-frontend §6, AC-12; fixes SWR-004 O-2)', () => {
  const WIDE = { minX: 0, minY: 0, maxX: 1900, maxY: 1200 };
  const NARROW = { width: 448, height: 600 };

  beforeEach(() => {
    useViewportStore.setState({
      gameId: null,
      viewport: { scale: 1, x: 0, y: 0 },
      stageSize: { width: 0, height: 0 },
      bounds: null,
      contentInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      minScale: MIN_SCALE,
      userAdjusted: false,
      byGame: {},
      byGameSize: {},
    });
  });

  it('fitViewport goes below MIN_SCALE when the map needs it and keeps the whole bounds inside', () => {
    const pad = fitInsets(NARROW);
    const vp = fitViewport(WIDE, NARROW, pad);
    expect(vp.scale).toBeLessThan(MIN_SCALE);
    expect(vp.scale).toBeCloseTo((448 - pad.left - pad.right) / 1900, 6);
    const tl = worldToScreen(vp, { x: WIDE.minX, y: WIDE.minY });
    const br = worldToScreen(vp, { x: WIDE.maxX, y: WIDE.maxY });
    expect(tl.x).toBeGreaterThanOrEqual(pad.left - 1e-6);
    expect(br.x).toBeLessThanOrEqual(NARROW.width - pad.right + 1e-6);
    expect(tl.y).toBeGreaterThanOrEqual(pad.top - 1e-6);
    expect(br.y).toBeLessThanOrEqual(NARROW.height - pad.bottom + 1e-6);
    // centred in the padded area
    expect(tl.x - pad.left).toBeCloseTo(NARROW.width - pad.right - br.x, 6);
  });

  it('per-side insets shift the fitted content (screen-constant labels reserve room)', () => {
    const stage = { width: 1000, height: 800 };
    const extra = { top: 0, right: 60, bottom: 36, left: 60 };
    const ins = fitInsets(stage, extra);
    expect(ins).toEqual({ top: 24, right: 84, bottom: 60, left: 84 });
    const vp = fitViewport(WIDE, stage, ins);
    expect(vp.scale).toBeCloseTo(Math.min((1000 - 168) / 1900, (800 - 84) / 1200), 6);
    expect(worldToScreen(vp, { x: 0, y: 0 }).x).toBeGreaterThanOrEqual(84 - 1e-6);
  });

  it('fit never exceeds MAX_SCALE', () => {
    expect(
      fitScale({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, { width: 1000, height: 800 }, 0),
    ).toBe(MAX_SCALE);
  });

  it('adaptive padding = clamp(12, 3 % of the short side, 48)', () => {
    expect(adaptivePadding({ width: 300, height: 200 })).toBe(12);
    expect(adaptivePadding({ width: 1000, height: 800 })).toBe(24);
    expect(adaptivePadding({ width: 3000, height: 2000 })).toBe(48);
  });

  it('store: minScale = min(MIN_SCALE, fit); zoom-out and wheel stop there, the button state follows', () => {
    const v = useViewportStore.getState();
    v.activateGame('g1');
    v.setStageSize(NARROW);
    v.setBounds(WIDE);
    const fitted = useViewportStore.getState().viewport;
    expect(fitted.scale).toBeLessThan(MIN_SCALE);
    expect(useViewportStore.getState().minScale).toBeCloseTo(fitted.scale, 9);
    for (let i = 0; i < 20; i++) useViewportStore.getState().zoomOut();
    expect(useViewportStore.getState().viewport.scale).toBeCloseTo(fitted.scale, 9);
    expect(canZoomOut(useViewportStore.getState().viewport.scale, fitted.scale)).toBe(false);
    useViewportStore.getState().zoomAtPointer({ x: 10, y: 10 }, 0.5);
    expect(useViewportStore.getState().viewport.scale).toBeCloseTo(fitted.scale, 9);
    useViewportStore.getState().zoomIn();
    expect(canZoomOut(useViewportStore.getState().viewport.scale, fitted.scale)).toBe(true);
  });

  it('store: a wide stage keeps the old MIN_SCALE floor (mock behaviour unchanged)', () => {
    const v = useViewportStore.getState();
    v.activateGame('g1');
    v.setStageSize({ width: 1400, height: 900 });
    v.setBounds(computeBounds(mapLayout, Object.keys(mapLayout)));
    expect(useViewportStore.getState().minScale).toBe(MIN_SCALE);
    for (let i = 0; i < 30; i++) useViewportStore.getState().zoomOut();
    expect(useViewportStore.getState().viewport.scale).toBe(MIN_SCALE);
  });

  it('store: refits on resize and on new bounds until the user adjusts the view, not after', () => {
    const v = useViewportStore.getState();
    v.activateGame('g1');
    v.setStageSize({ width: 1000, height: 800 });
    v.setBounds(WIDE);
    const first = useViewportStore.getState().viewport;
    expect(useViewportStore.getState().userAdjusted).toBe(false);

    useViewportStore.getState().setStageSize({ width: 1000, height: 600 }); // top bar wrapped
    const refit = useViewportStore.getState().viewport;
    expect(refit).not.toEqual(first);
    expect(refit).toEqual(
      fitViewport(WIDE, { width: 1000, height: 600 }, fitInsets({ width: 1000, height: 600 })),
    );

    // same bounds (new object) — no change
    useViewportStore.getState().setBounds({ ...WIDE });
    expect(useViewportStore.getState().viewport).toBe(refit);

    useViewportStore.getState().pan(30, 0);
    expect(useViewportStore.getState().userAdjusted).toBe(true);
    const panned = useViewportStore.getState().viewport;
    useViewportStore.getState().setStageSize({ width: 900, height: 600 });
    useViewportStore.getState().setBounds({ ...WIDE, maxY: 1500 });
    expect(useViewportStore.getState().viewport).toEqual(panned);

    // «Вписать карту» always fits and resumes auto-refit
    useViewportStore.getState().fit(false);
    expect(useViewportStore.getState().userAdjusted).toBe(false);
    useViewportStore.getState().setStageSize({ width: 700, height: 600 });
    expect(useViewportStore.getState().viewport).toEqual(
      fitViewport(
        { ...WIDE, maxY: 1500 },
        { width: 700, height: 600 },
        fitInsets({ width: 700, height: 600 }),
      ),
    );
  });

  it('store: content insets are part of the fit', () => {
    const v = useViewportStore.getState();
    v.activateGame('g1');
    v.setStageSize({ width: 1000, height: 800 });
    const extra = { top: 0, right: 60, bottom: 36, left: 60 };
    v.setBounds(WIDE, extra);
    expect(useViewportStore.getState().viewport).toEqual(
      fitViewport(
        WIDE,
        { width: 1000, height: 800 },
        fitInsets({ width: 1000, height: 800 }, extra),
      ),
    );
  });

  it('store: a remembered view is restored only for the same stage size (D-I-12)', () => {
    const v = useViewportStore.getState();
    v.activateGame('g1');
    v.setStageSize({ width: 1000, height: 800 });
    v.setBounds(WIDE);
    useViewportStore.getState().zoomIn();
    const zoomed = useViewportStore.getState().viewport;

    useViewportStore.getState().activateGame('g2');
    useViewportStore.getState().setStageSize({ width: 700, height: 800 });
    useViewportStore.getState().activateGame('g1');
    expect(useViewportStore.getState().viewport).not.toEqual(zoomed);
    useViewportStore.getState().setBounds(WIDE);
    expect(useViewportStore.getState().viewport).toEqual(
      fitViewport(WIDE, { width: 700, height: 800 }, fitInsets({ width: 700, height: 800 })),
    );
  });

  it('store: forget drops the remembered view and its size (hot-seat handoff)', () => {
    const v = useViewportStore.getState();
    v.activateGame('g1');
    v.setStageSize({ width: 1000, height: 800 });
    v.setBounds(WIDE);
    useViewportStore.getState().zoomIn();
    useViewportStore.getState().forget('g1');
    expect(useViewportStore.getState().byGame.g1).toBeUndefined();
    expect(useViewportStore.getState().byGameSize.g1).toBeUndefined();
    expect(useViewportStore.getState().userAdjusted).toBe(false);
  });
});
