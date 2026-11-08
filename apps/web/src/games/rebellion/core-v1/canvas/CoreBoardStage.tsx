import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Konva from 'konva';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Stage } from 'react-konva';
import { useReduceMotion } from '@/shared/settings';
import { VisuallyHidden } from '@/shared/ui';
import { ZoomControls } from '../../board/canvas/ZoomControls';
import { MapBackgroundLayer } from '../../board/canvas/layers/MapBackgroundLayer';
import { useBoardKeyboard } from '../../board/hooks/useBoardKeyboard';
import { useStageSize } from '../../board/hooks/useStageSize';
import { DRAG_DISTANCE, WHEEL_STEP, ZOOM_TWEEN_MS } from '../../board/model/constants';
import { useDragStore } from '../../board/model/dragStore';
import { useSelectionStore } from '../../board/model/selectionStore';
import { useViewportStore } from '../../board/model/viewportStore';
import { rebellionPalette } from '../../theme/palette';
import { CORE_CONTENT_INSETS } from '../geometry/constants';
import { coreContentBounds } from '../geometry/contentBounds';
import { type LabelBox, regionLabelBox, systemLabelBox } from '../geometry/labelLayout';
import { lodFor, screenFixedScale } from '../geometry/lod';
import { buildMapStatics, buildScene } from '../geometry/sceneModel';
import { useActivateSystem } from '../hooks/useActivateSystem';
import { useCoreBoardDebug } from '../hooks/useCoreBoardDebug';
import { useCoreMoveDrag } from '../hooks/useCoreMoveDrag';
import { useLeaderDrop } from '../hooks/useLeaderDrop';
import { useCoreBoard } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import { canActivate, hiddenZone } from '../model/viewModel';
import { CoreMapCaption } from './CoreMapCaption';
import { InteractiveLayer } from './layers/InteractiveLayer';
import { OverlayLayer } from './layers/OverlayLayer';
import { StaticMapLayer } from './layers/StaticMapLayer';
import { applyScreenScale } from './screenScale';

// A-10: < 4 px is a click, ≥ 4 px starts a drag (unit) or a pan (stage).
Konva.dragDistance = DRAG_DISTANCE;

const INSTRUCTIONS_ID = 'core-board-canvas-instructions';

/**
 * Konva map of a `core-v1` session (SWR-005 plan-frontend §4–§6): the real galaxy (32 systems, 8 regions,
 * adjacency) on own schematic geometry (`@bga/game-rebellion/board` → `core-layout`), highlights from
 * `legalActions` via `viewModel`/`sceneModel`, screen-constant labels, LOD, the hidden rebel-base zone, drag of
 * a unit onto the activated system, drop of a leader from the pool. The world transform lives on the Stage and is
 * applied imperatively from the shared viewport store (tweened unless reduced motion); «вписать карту» fits the
 * content bounds plus screen insets for labels. Mounted by `CoreTable` inside `CoreBoardContext`.
 */
export function CoreBoardStage() {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const { sessionId, view } = useCoreBoard();
  const reduceMotion = useReduceMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const tweenRef = useRef<Konva.Tween | null>(null);

  const activateGame = useViewportStore((s) => s.activateGame);
  const setBounds = useViewportStore((s) => s.setBounds);
  const stageSize = useViewportStore((s) => s.stageSize);
  const scale = useViewportStore((s) => s.viewport.scale);
  const lod = useViewportStore((s) => lodFor(s.viewport.scale));
  const armedLeaderId = useCoreUiStore((s) => s.armedLeaderId);
  const selection = useSelectionStore((s) => s.selection);
  const drag = useDragStore((s) => s.drag);

  const statics = useMemo(() => buildMapStatics(view.map), [view.map]);
  const scene = useMemo(
    () => buildScene({ view, armedLeaderId, selection, lod, drag, statics }),
    [view, armedLeaderId, selection, lod, drag, statics],
  );
  const showZone = hiddenZone(view) !== null;
  const bounds = useMemo(
    () => coreContentBounds({ systemIds: view.map.systems.map((s) => s.id), showZone }),
    [view.map.systems, showZone],
  );

  const lang = i18n.language;
  const labelBoxes = useMemo(() => {
    void lang;
    const m = new Map<string, LabelBox>();
    for (const s of view.map.systems) {
      m.set(s.id, systemLabelBox([t(`rebellion.data:${s.nameKey}`, { defaultValue: s.id })]));
    }
    return m;
  }, [view.map.systems, t, lang]);
  const regionLabels = useMemo(() => {
    void lang;
    const m = new Map<string, LabelBox>();
    for (const r of view.map.regions) {
      m.set(r.id, regionLabelBox(t(`rebellion.data:${r.nameKey}`, { defaultValue: r.id })));
    }
    return m;
  }, [view.map.regions, t, lang]);
  const leaderShort = useCallback(
    (id: string) => t(`rebellion.data:leaders.${id}.short`, { defaultValue: id.slice(0, 2) }),
    [t],
  );

  useLayoutEffect(() => activateGame(sessionId), [activateGame, sessionId]);
  useStageSize(containerRef);
  useEffect(() => setBounds(bounds, CORE_CONTENT_INSETS), [bounds, setBounds]);
  const debugSnapshot = useMemo(
    () => ({ view, scene, bounds, labelBoxes }),
    [view, scene, bounds, labelBoxes],
  );
  useCoreBoardDebug(stageRef, debugSnapshot);
  const onKeyDown = useBoardKeyboard();

  // Apply the viewport to the Stage imperatively and counter-scale screen-constant nodes.
  useLayoutEffect(() => {
    const apply = (s: { viewport: { scale: number; x: number; y: number }; animate: boolean }) => {
      const stage = stageRef.current;
      if (!stage) return;
      tweenRef.current?.destroy();
      tweenRef.current = null;
      const { scale: sc, x, y } = s.viewport;
      if (s.animate && !reduceMotion) {
        const tween = new Konva.Tween({
          node: stage,
          duration: ZOOM_TWEEN_MS / 1000,
          scaleX: sc,
          scaleY: sc,
          x,
          y,
          easing: Konva.Easings.EaseOut,
          onUpdate: () => applyScreenScale(stage, stage.scaleX()),
        });
        tweenRef.current = tween;
        tween.play();
      } else {
        stage.setAttrs({ scaleX: sc, scaleY: sc, x, y });
        applyScreenScale(stage, sc);
        stage.batchDraw();
      }
    };
    apply({ ...useViewportStore.getState(), animate: false });
    return useViewportStore.subscribe((s, prev) => {
      if (s.viewport !== prev.viewport) apply(s);
    });
  }, [reduceMotion, stageSize.width]);

  // Newly mounted screen-constant nodes get the current scale (no re-render on zoom).
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    applyScreenScale(stage, stage.scaleX());
    stage.batchDraw();
  });

  const setCursor = useCallback((cursor: string) => {
    const c = stageRef.current?.container();
    if (c) c.style.cursor = cursor;
  }, []);

  const onWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer || e.evt.deltaY === 0) return;
    useViewportStore
      .getState()
      .zoomAtPointer(pointer, e.evt.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
  }, []);

  const syncStagePosition = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = stageRef.current;
    if (!stage || e.target !== stage) return; // unit drags bubble here too
    const { scale: sc } = useViewportStore.getState().viewport;
    useViewportStore.getState().setViewport({ scale: sc, x: stage.x(), y: stage.y() });
  }, []);

  const onStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage()) useSelectionStore.getState().clearSelection();
  }, []);

  const activate = useActivateSystem();
  const onSystem = useCallback(
    (systemId: string) => {
      // §5.2: with an armed leader a click on a listed target is the command (two-step intent, Q-FE-5).
      const armed = useCoreUiStore.getState().armedLeaderId;
      if (armed && canActivate(view, armed, systemId)) {
        void activate(armed, systemId);
        return;
      }
      useSelectionStore.getState().selectSystem(systemId);
    },
    [activate, view],
  );
  const onUnit = useCallback((id: string) => useSelectionStore.getState().selectPiece(id), []);
  const onLeader = useCallback((id: string) => useSelectionStore.getState().selectLeader(id), []);
  const onZone = useCallback(() => useSelectionStore.getState().selectZone(), []);

  const moveDrag = useCoreMoveDrag(scene.centers);
  const leaderDrop = useLeaderDrop(stageRef, scene.centers);
  const initialScreenScale = screenFixedScale(scale);

  return (
    <Box
      ref={containerRef}
      data-testid="board-canvas"
      data-rules-engine="core-v1"
      data-scale={scale.toFixed(3)}
      data-lod={lod}
      role="region"
      tabIndex={0}
      aria-label={t('rebellion.map:canvas.label')}
      aria-describedby={INSTRUCTIONS_ID}
      onKeyDown={onKeyDown}
      onDragOver={leaderDrop.onDragOver}
      onDrop={leaderDrop.onDrop}
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        bgcolor: rebellionPalette.board.background,
        '&:focus-visible': { outline: `2px solid ${palette.focus}`, outlineOffset: -2 },
        '& canvas': { display: 'block' },
      }}
    >
      <VisuallyHidden id={INSTRUCTIONS_ID}>{t('rebellion.map:canvas.instructions')}</VisuallyHidden>
      {/* Machine-readable mirror of the map state for tests (not exposed to assistive tech). */}
      <div hidden data-testid="core-map-state">
        {scene.systems.map((s) => (
          <span
            key={s.id}
            data-testid={`map-system-${s.id}`}
            data-region={s.regionId}
            data-remote={s.remote}
            data-contested={s.contested}
            data-target={s.target}
            data-source={s.source}
            data-activated={s.activatedBy !== null}
            data-rebel-base={s.isBase ? 'true' : undefined}
          />
        ))}
        {scene.zone && (
          <span
            data-testid="map-hidden-zone"
            data-count={scene.zone.units.length + scene.zone.leaders.length}
          />
        )}
      </div>
      {stageSize.width > 0 && stageSize.height > 0 && (
        <div aria-hidden="true">
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            draggable
            style={{ cursor: 'grab' }}
            onWheel={onWheel}
            onDragMove={syncStagePosition}
            onDragEnd={syncStagePosition}
            onClick={onStageClick}
            onTap={onStageClick}
          >
            {bounds && (
              <MapBackgroundLayer
                bounds={bounds}
                background={rebellionPalette.board.background}
                star={rebellionPalette.board.star}
              />
            )}
            <StaticMapLayer regions={statics.regions} links={statics.links} />
            <InteractiveLayer
              scene={scene}
              lod={lod}
              screenScale={initialScreenScale}
              zoneTitle={t('rebellion.map:zone.title')}
              leaderShort={leaderShort}
              moveDrag={moveDrag}
              onSystem={onSystem}
              onUnit={onUnit}
              onLeader={onLeader}
              onZone={onZone}
              setCursor={setCursor}
            />
            <OverlayLayer
              scene={scene}
              screenScale={initialScreenScale}
              labelBoxes={labelBoxes}
              regionLabels={regionLabels}
            />
          </Stage>
        </div>
      )}
      <ZoomControls />
      <CoreMapCaption />
    </Box>
  );
}
