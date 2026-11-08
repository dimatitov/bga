import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { rebellionPalette } from '../../theme/palette';

const B = rebellionPalette.board;
const F = rebellionPalette.faction;

/** Own small glyphs mirroring the map marks (D-SW5-7, D-SW5-8): shape + line style, not colour only. */
const GLYPHS: Record<LegendItem, ReactNode> = {
  region: (
    <rect
      x="2"
      y="4"
      width="20"
      height="16"
      rx="3"
      fill="rgba(124,156,255,0.15)"
      stroke={B.systemStroke}
      strokeDasharray="3 2"
    />
  ),
  remote: (
    <circle cx="12" cy="12" r="7" fill={B.systemFill} stroke={B.label} strokeDasharray="2 2" />
  ),
  contested: (
    <g>
      <circle cx="12" cy="12" r="7" fill={B.systemFill} stroke={B.systemStroke} />
      <path d="M7 17 L17 7 M9 19 L19 9" stroke={B.invalidTarget} strokeWidth="2" />
    </g>
  ),
  activated: (
    <g>
      <circle cx="12" cy="12" r="8" fill={B.systemFill} stroke={F.rebels} strokeWidth="3" />
      <path d="M12 2 L12 8 L17 5 Z" fill={F.rebels} />
    </g>
  ),
  target: (
    <circle
      cx="12"
      cy="12"
      r="8"
      fill={B.systemFill}
      stroke={B.legalTarget}
      strokeWidth="2"
      strokeDasharray="3 2"
    />
  ),
  source: (
    <g>
      <circle cx="7" cy="12" r="4" fill={B.systemFill} stroke={B.systemStroke} />
      <path
        d="M12 12 L21 12 M18 9 L21 12 L18 15"
        stroke={B.legalTarget}
        strokeWidth="2"
        fill="none"
      />
    </g>
  ),
  leader: <circle cx="12" cy="12" r="7" fill={F.empire} stroke={B.selected} strokeWidth="1.5" />,
  base: <path d="M12 3 L20 9 L17 20 L7 20 L4 9 Z" fill="none" stroke={F.rebels} strokeWidth="2" />,
  space: <path d="M12 4 L20 19 L4 19 Z" fill={F.rebels} stroke={B.label} strokeWidth="1" />,
  ground: (
    <rect x="6" y="6" width="12" height="12" fill={F.empire} stroke={B.label} strokeWidth="1" />
  ),
  structure: (
    <path d="M12 4 L20 12 L12 20 L4 12 Z" fill={F.rebels} stroke={B.label} strokeWidth="1" />
  ),
  chips: (
    <g>
      <rect x="3" y="7" width="18" height="10" rx="5" fill={B.systemFill} stroke={F.empire} />
      <circle cx="8" cy="12" r="2" fill={F.empire} />
      <path d="M13 9 L13 15 M16 9 L16 15" stroke={B.label} strokeWidth="1.5" />
    </g>
  ),
  hiddenZone: (
    <rect
      x="2"
      y="5"
      width="20"
      height="14"
      rx="2"
      fill="none"
      stroke={F.rebels}
      strokeDasharray="4 2"
    />
  ),
};

type LegendItem =
  | 'region'
  | 'remote'
  | 'contested'
  | 'activated'
  | 'target'
  | 'source'
  | 'leader'
  | 'base'
  | 'space'
  | 'ground'
  | 'structure'
  | 'chips'
  | 'hiddenZone';

const ITEMS: readonly LegendItem[] = [
  'region',
  'remote',
  'contested',
  'activated',
  'target',
  'source',
  'leader',
  'base',
  'space',
  'ground',
  'structure',
  'chips',
  'hiddenZone',
];

/** Texts live in Worker M's `rebellion.map` (plan-frontend §8.2); the hidden zone uses the zone title. */
const TEXT_KEY = (item: LegendItem) =>
  item === 'hiddenZone' ? 'rebellion.map:zone.title' : `rebellion.map:legend.${item}`;

/**
 * Map legend (SWR-005 plan-frontend §7, TC-C-19; tab «Партия»): regions, remote / contested / activated systems,
 * activation targets, move sources, leaders, the rebel base, unit glyphs (ship / ground / structure), compact
 * counters and the hidden base zone. Text describes each mark,
 * the glyph is decorative. `map-legend`.
 */
export function MapLegend() {
  const { t } = useTranslation();
  return (
    <Box component="section" data-testid="map-legend" aria-labelledby="map-legend-title">
      <Typography id="map-legend-title" component="h3" variant="subtitle2" sx={{ mb: 1 }}>
        {t('rebellion.map:legend.title')}
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', rowGap: 0.75 }}>
        {ITEMS.map((item) => (
          <Box
            component="li"
            key={item}
            data-testid={`map-legend-${item}`}
            sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}
          >
            <Box
              component="svg"
              viewBox="0 0 24 24"
              aria-hidden
              sx={{ width: 24, height: 24, flex: 'none', bgcolor: B.background, borderRadius: 0.5 }}
            >
              {GLYPHS[item]}
            </Box>
            <Typography variant="body2">{t(TEXT_KEY(item))}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
