import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Konva from 'konva';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Stage } from 'react-konva';
import { useSessionAutomation } from '@/platform';
import { useReduceMotion } from '@/shared/settings';
import { VisuallyHidden } from '@/shared/ui';
import { useBoardKeyboard } from '../../board/hooks/useBoardKeyboard';
import { useStageSize } from '../../board/hooks/useStageSize';
import { DRAG_DISTANCE, WHEEL_STEP, ZOOM_TWEEN_MS } from '../../board/model/constants';
import { useDragStore } from '../../board/model/dragStore';
import { useSelectionStore } from '../../board/model/selectionStore';
import { useViewportStore } from '../../board/model/viewportStore';
import { mapStyle } from '../../theme/mapStyle';
import { NARROW_FIT_MAX_WIDTH, coreContentInsets } from '../geometry/constants';
import { coreContentBounds } from '../geometry/contentBounds';
import { cullLabels } from '../geometry/labelCulling';
import { type LabelBox, regionLabelBox, systemLabelBox } from '../geometry/labelLayout';
import { lodFor, screenFixedScale } from '../geometry/lod';
import { type GroupMarkerScene, buildMapStatics, buildScene } from '../geometry/sceneModel';
import { useActivateSystem } from '../hooks/useActivateSystem';
import { useCoreBoardDebug } from '../hooks/useCoreBoardDebug';
import { useCoreMoveDrag } from '../hooks/useCoreMoveDrag';
import { useLeaderDrop } from '../hooks/useLeaderDrop';
import { aiRecentMarks } from '../model/aiRecent';
import { useCoreBoard } from '../model/coreContext';
import { useCoreUiStore } from '../model/coreUiStore';
import { forcesBySystem, zoneForces } from '../model/forces';
import { canActivate, hiddenZone } from '../model/viewModel';
import { CoreMapCaption } from './CoreMapCaption';
import { InteractiveLayer } from './layers/InteractiveLayer';
import { OverlayLayer } from './layers/OverlayLayer';
import { StaticMapLayer } from './layers/StaticMapLayer';
import { markersAttr } from './mapMirror';
import { applyScreenScale } from './screenScale';

// A-10: < 4 px is a click, ≥ 4 px starts a drag (unit) or a pan (stage).
Konva.dragDistance = DRAG_DISTANCE;

const INSTRUCTIONS_ID = 'core-board-canvas-instructions';

/**
 * Re-renders the text nodes once PT Mono is loaded (Konva measures text when it draws; plan §1.4). `0` until then;
 * no-op in environments without the Font Loading API (jsdom).
 */
function useMapFontEpoch(): number {
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts || typeof fonts.load !== 'function') return;
    let alive = true;
    fonts
      .load(`400 13px "${mapStyle.font.face}"`)
      .then(() => {
        if (alive) setEpoch((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return epoch;
}

/**
 * Konva vector map of a `core-v1` session (SWR-005 plan-frontend §4–§6; SWR-009 plan §2 M): the real galaxy
 * (`view.map` + `coreMapLayout` / `coreRegionShapes`: 32 systems, 69 routes, 8 regions) in the Galactic Vector
 * Terminal style — dashed region outlines, routes, screen-constant nodes with state marks (`systemMarks`), group
 * counter markers (`forcesBySystem` / `zoneForces`), leader diamonds, single-unit move handles during the viewer's
 * own activation and the AI's recent marks (`aiRecentMarks` of the last automation run). The world transform lives on
 * the Stage and is applied imperatively from the shared viewport store (tweened unless reduced motion). The CRT
 * screen, grid, scanlines, legend and zoom keys are DOM (`MapHousing`). Mounted inside `CoreBoardContext`.
 */
export function CoreBoardStage() {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const { sessionId, view } = useCoreBoard();
  const automation = useSessionAutomation();
  const reduceMotion = useReduceMotion();
  const fontEpoch = useMapFontEpoch();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const tweenRef = useRef<Konva.Tween | null>(null);

  const activateGame = useViewportStore((s) => s.activateGame);
  const setBounds = useViewportStore((s) => s.setBounds);
  const stageSize = useViewportStore((s) => s.stageSize);
  const scale = useViewportStore((s) => s.viewport.scale);
  // Collision culling of captions works on a quantised scale (re-render every 2 %, compact LOD only).
  const cullScale = useViewportStore((s) =>
    lodFor(s.viewport.scale) === 'compact' ? Math.round(s.viewport.scale * 50) / 50 : null,
  );
  const lod = useViewportStore((s) => lodFor(s.viewport.scale));
  const armedLeaderId = useCoreUiStore((s) => s.armedLeaderId);
  const manifest = useCoreUiStore((s) => s.manifest);
  const selection = useSelectionStore((s) => s.selection);
  const drag = useDragStore((s) => s.drag);

  const lastRun = automation?.lastRun ?? null;
  const aiRecent = useMemo(() => aiRecentMarks(lastRun, view), [lastRun, view]);
  const statics = useMemo(() => buildMapStatics(view.map), [view.map]);
  const scene = useMemo(
    () => buildScene({ view, armedLeaderId, selection, lod, drag, statics, aiRecent, manifest }),
    [view, armedLeaderId, selection, lod, drag, statics, aiRecent, manifest],
  );
  const forces = useMemo(() => forcesBySystem(view), [view]);
  const zoneSet = useMemo(() => zoneForces(view), [view]);
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
  // fix round 3 (QA-3): one-column consoles fit the map without the side label insets (window width, re-read on
  // every stage resize); edge captions are culled instead.
  const narrow =
    stageSize.width > 0 &&
    typeof window !== 'undefined' &&
    window.innerWidth < NARROW_FIT_MAX_WIDTH;
  useEffect(
    () => setBounds(bounds, coreContentInsets(narrow ? 0 : Infinity)),
    [bounds, setBounds, narrow],
  );
  // Edge culling needs the translation too: quantised to 16 px (re-render while panning only every 16 px).
  const cullOffset = useViewportStore((s) =>
    narrow ? `${Math.round(s.viewport.x / 16) * 16}:${Math.round(s.viewport.y / 16) * 16}` : null,
  );
  const shownLabels = useMemo(() => {
    if (cullScale === null) return null;
    const [x, y] = (cullOffset ?? '0:0').split(':').map(Number);
    const stage = cullOffset === null ? null : { x: x!, y: y!, ...stageSize };
    return cullLabels({ scene, labelBoxes, regionLabels, scale: cullScale, stage });
  }, [cullScale, cullOffset, stageSize, scene, labelBoxes, regionLabels]);
  const debugSnapshot = useMemo(
    () => ({ view, scene, bounds, labelBoxes, shownLabels }),
    [view, scene, bounds, labelBoxes, shownLabels],
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
  const onMarker = useCallback(
    (m: GroupMarkerScene) => {
      // QD-5: while a leader is armed a marker behaves exactly like a click on its system (or the zone).
      if (useCoreUiStore.getState().armedLeaderId) {
        if (m.systemId === null) onZone();
        else onSystem(m.systemId);
        return;
      }
      const group = { owner: m.owner, arena: m.arena };
      if (m.systemId === null) {
        useSelectionStore.getState().selectZone();
        useCoreUiStore.getState().openManifest({ kind: 'zone' }, group);
      } else {
        useSelectionStore.getState().selectSystem(m.systemId);
        useCoreUiStore.getState().openManifest({ kind: 'system', systemId: m.systemId }, group);
      }
    },
    [onSystem, onZone],
  );

  const moveDrag = useCoreMoveDrag(scene.centers);
  const leaderDrop = useLeaderDrop(stageRef, scene.centers);
  const initialScreenScale = screenFixedScale(scale);
  const aiSet = new Set(scene.aiRecentIds);

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
        bgcolor: 'transparent',
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
            data-ai-recent={aiSet.has(s.id)}
            data-label={shownLabels && !shownLabels.systems.has(s.id) ? 'hidden' : 'shown'}
            data-markers={markersAttr(forces.get(s.id))}
          />
        ))}
        {scene.zone && (
          <span
            data-testid="map-hidden-zone"
            data-count={scene.zone.unitIds.length + scene.zone.leaders.length}
            data-ai-recent={scene.zone.aiRecent}
            data-markers={markersAttr(zoneSet)}
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
            <StaticMapLayer regions={statics.regions} links={statics.links} />
            <InteractiveLayer
              key={`i-${fontEpoch}`}
              scene={scene}
              lod={lod}
              screenScale={initialScreenScale}
              zoneTitle={t('rebellion.map:zone.title')}
              aiTag={t('rebellion.map:marker.ai')}
              leaderShort={leaderShort}
              moveDrag={moveDrag}
              onSystem={onSystem}
              onUnit={onUnit}
              onLeader={onLeader}
              onZone={onZone}
              onMarker={onMarker}
              setCursor={setCursor}
            />
            <OverlayLayer
              key={`o-${fontEpoch}`}
              scene={scene}
              screenScale={initialScreenScale}
              labelBoxes={labelBoxes}
              regionLabels={regionLabels}
              shown={shownLabels}
            />
          </Stage>
        </div>
      )}
      <CoreMapCaption />
    </Box>
  );
}
