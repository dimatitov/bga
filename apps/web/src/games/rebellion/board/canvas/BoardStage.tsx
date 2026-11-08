import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import Konva from 'konva';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Stage } from 'react-konva';
import { useReduceMotion } from '@/shared/settings';
import { VisuallyHidden } from '@/shared/ui';
import { rebellionPalette } from '../../theme/palette';
import { useBoardDebug } from '../hooks/useBoardDebug';
import { useBoardKeyboard } from '../hooks/useBoardKeyboard';
import { useStageSize } from '../hooks/useStageSize';
import { useBoard } from '../model/boardContext';
import { computeBoardLayout } from '../model/boardLayout';
import { DRAG_DISTANCE, WHEEL_STEP, ZOOM_TWEEN_MS } from '../model/constants';
import { useSelectionStore } from '../model/selectionStore';
import { useViewportStore } from '../model/viewportStore';
import { InteractionOverlayLayer } from './layers/InteractionOverlayLayer';
import { MapBackgroundLayer } from './layers/MapBackgroundLayer';
import { PiecesLayer } from './layers/PiecesLayer';
import { SystemsLayer } from './layers/SystemsLayer';
import { MapCaption } from './MapCaption';
import { ZoomControls } from './ZoomControls';

// A-10: < 4 px is a click, ≥ 4 px starts a drag (piece) or a pan (stage).
Konva.dragDistance = DRAG_DISTANCE;

const INSTRUCTIONS_ID = 'board-canvas-instructions';

/**
 * Konva board (plan-frontend §4). The world transform lives only on the Stage and is applied imperatively from the
 * viewport store (tweened for buttons/keys unless reduced motion), so pan/zoom never re-render the layers.
 */
export function BoardStage() {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const { gameId, view } = useBoard();
  const reduceMotion = useReduceMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const tweenRef = useRef<Konva.Tween | null>(null);

  const activateGame = useViewportStore((s) => s.activateGame);
  const setBounds = useViewportStore((s) => s.setBounds);
  const stageSize = useViewportStore((s) => s.stageSize);
  const scale = useViewportStore((s) => s.viewport.scale);

  const layout = useMemo(() => computeBoardLayout(view), [view]);

  useLayoutEffect(() => activateGame(gameId), [activateGame, gameId]);
  useStageSize(containerRef);
  useEffect(() => setBounds(layout.bounds), [layout.bounds, setBounds]);
  useBoardDebug(stageRef, layout);
  const onKeyDown = useBoardKeyboard();

  // Apply the viewport to the Stage imperatively.
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
        });
        tweenRef.current = tween;
        tween.play();
      } else {
        stage.setAttrs({ scaleX: sc, scaleY: sc, x, y });
        stage.batchDraw();
      }
    };
    apply({ ...useViewportStore.getState(), animate: false });
    return useViewportStore.subscribe((s, prev) => {
      if (s.viewport !== prev.viewport) apply(s);
    });
  }, [reduceMotion, stageSize.width]);

  const setCursor = useCallback((cursor: string) => {
    const c = stageRef.current?.container();
    if (c) c.style.cursor = cursor;
  }, []);

  const onWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer || e.evt.deltaY === 0) return;
    useViewportStore
      .getState()
      .zoomAtPointer(pointer, e.evt.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
  }, []);

  const syncStagePosition = useCallback((e: Konva.KonvaEventObject<DragEvent>) => {
    const stage = stageRef.current;
    if (!stage || e.target !== stage) return; // piece drags bubble here too
    const { scale: sc } = useViewportStore.getState().viewport;
    useViewportStore.getState().setViewport({ scale: sc, x: stage.x(), y: stage.y() });
  }, []);

  const onStageClick = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (e.target === e.target.getStage()) useSelectionStore.getState().clearSelection();
  }, []);

  const bounds = layout.bounds;

  return (
    <Box
      ref={containerRef}
      data-testid="board-canvas"
      data-scale={scale.toFixed(3)}
      role="region"
      tabIndex={0}
      aria-label={t('rebellion.board:canvas.label')}
      aria-describedby={INSTRUCTIONS_ID}
      onKeyDown={onKeyDown}
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
      <VisuallyHidden id={INSTRUCTIONS_ID}>
        {t('rebellion.board:canvas.instructions')}
      </VisuallyHidden>
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
            <SystemsLayer layout={layout} setCursor={setCursor} />
            <PiecesLayer layout={layout} setCursor={setCursor} />
            <InteractionOverlayLayer layout={layout} />
          </Stage>
        </div>
      )}
      <ZoomControls />
      <MapCaption />
    </Box>
  );
}
