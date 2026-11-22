import Box from '@mui/material/Box';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { ScanlineOverlay } from '@/shared/ui';
import { ZoomControls } from '../../board/canvas/ZoomControls';
import { useViewportStore } from '../../board/model/viewportStore';
import { mapStyle } from '../../theme/mapStyle';
import { lodFor } from '../geometry/lod';
import { useCoreBoard } from '../model/coreContext';
import { mapStats } from '../model/mapStats';
import { MapLegend } from '../sidebar/MapLegend';
import { CoreBoardStage } from './CoreBoardStage';

export interface MapHousingProps {
  /** Layer over the map screen (e.g. the game-over `OutcomeBanner`). */
  overlay?: ReactNode;
}

const H = mapStyle.housing;
const META = {
  fontSize: 10,
  lineHeight: '16px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
} as const;

/** «ТАКТИЧЕСКИЙ ДИСПЛЕЙ · 32 системы · 69 связей · ЧИСЛО = ФИГУРЫ В ГРУППЕ · <LOD> · 56%» — real numbers only. */
function DisplayHeader() {
  const { t } = useTranslation();
  const { view } = useCoreBoard();
  const stats = useMemo(() => mapStats(view.map), [view.map]);
  const scale = useViewportStore((s) => s.viewport.scale);
  const zoom = Math.round(scale * 100);
  const lod = lodFor(scale);
  return (
    <Box
      data-testid="map-display-header"
      data-systems={stats.systems}
      data-routes={stats.routes}
      data-regions={stats.regions}
      data-zoom={zoom}
      sx={{
        ...META,
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 1.75,
        minWidth: 0,
        overflow: 'hidden',
        px: 1,
        minHeight: 27,
        bgcolor: H.header,
        border: 1,
        borderColor: H.headerBorder,
        color: H.headerText,
      }}
    >
      <Box component="span" sx={{ color: H.headerText, display: { xs: 'none', sm: 'inline' } }}>
        {t('rebellion.map:housing.display')}
      </Box>
      <Box component="span" sx={{ color: H.metaText }}>
        {t('rebellion.map:housing.systems', { count: stats.systems })}
      </Box>
      <Box component="span" sx={{ color: H.metaText }}>
        {t('rebellion.map:housing.routes', { count: stats.routes })}
      </Box>
      <Box component="span" sx={{ color: H.metaText, display: { xs: 'none', lg: 'inline' } }}>
        {t('rebellion.map:housing.countKey')}
      </Box>
      <Box component="span" sx={{ ml: 'auto', color: H.accentText }}>
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
          {t(
            lod === 'detail'
              ? 'rebellion.map:housing.lodDetail'
              : 'rebellion.map:housing.lodCompact',
          )}
          {' · '}
        </Box>
        {t('rebellion.map:housing.zoom', { percent: zoom })}
      </Box>
    </Box>
  );
}

/**
 * Map housing of the console (SWR-009 plan §2 M item 1, AC-9, R-4): a 4 px frame; the display header with the real
 * map counters (`mapStats(view.map)`) and the zoom of the viewport (secondary items drop on narrow widths); the CRT
 * screen (`max(400px, 65vh)` high below 900 px) (map background, CSS grid 78 px,
 * decorative scanlines with `pointer-events: none`) carrying `board-canvas`; the one-row bottom bar with the
 * permanent legend (essential keys + «Легенда» for the full list) and the zoom keys. No raster. Props are the K-7 slot contract: `{ overlay }` (e.g. the game-over banner).
 */
export function MapHousing({ overlay }: MapHousingProps) {
  const { t } = useTranslation();
  const grid = mapStyle.grid;
  return (
    <Box
      component="section"
      data-testid="map-housing"
      aria-label={t('rebellion.map:housing.label')}
      sx={{
        gridArea: 'board',
        minHeight: 0,
        minWidth: 0,
        // < 900 (one column): the housing grows with its content and the SCREEN gets max(400px, 65vh) (AC-13).
        height: 'auto',
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        gap: '5px',
        p: '6px',
        bgcolor: H.background,
        border: `${terminalTokens.bezel.housing}px solid ${H.frame}`,
        boxShadow: `inset 0 0 0 1px ${H.frameInset}`,
        fontFamily: mapStyle.font.family,
      }}
    >
      <DisplayHeader />
      <Box
        data-testid="map-screen"
        sx={{
          position: 'relative',
          height: { xs: 'max(400px, 65vh)', md: 'auto' },
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden',
          bgcolor: mapStyle.screen.background,
          border: 1,
          borderColor: mapStyle.screen.border,
          boxShadow: `inset 0 0 22px ${mapStyle.screen.shadow}`,
          backgroundImage: `linear-gradient(${grid.color} ${grid.width}px, transparent ${grid.width}px), linear-gradient(90deg, ${grid.color} ${grid.width}px, transparent ${grid.width}px)`,
          backgroundSize: `${grid.step}px ${grid.step}px`,
        }}
      >
        {overlay}
        <CoreBoardStage />
        <ScanlineOverlay />
      </Box>
      <Box
        data-testid="map-housing-bar"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          minWidth: 0,
          px: 1,
          py: 0.5,
          bgcolor: H.bar,
          border: 1,
          borderColor: H.headerBorder,
          flexWrap: 'nowrap',
        }}
      >
        <MapLegend />
        <Box sx={{ flex: 'none', ml: 'auto' }}>
          <ZoomControls placement="bar" />
        </Box>
      </Box>
    </Box>
  );
}
