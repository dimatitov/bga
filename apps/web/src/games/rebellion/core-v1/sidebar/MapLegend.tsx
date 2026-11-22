import Box from '@mui/material/Box';
import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { KeyButton, LegendKey, VisuallyHidden } from '@/shared/ui';
import { mapStyle } from '../../theme/mapStyle';
import { ForceGlyph } from '../../ui/ForceGlyph';

const S = mapStyle;
const F = S.faction;

/** Small own SVG (12 px box, viewBox 24) — the same shapes as the Konva marks (shape + line style, not colour only). */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const ring = (stroke: string, dash?: string, width = 2, r = 8) => (
  <circle
    cx="12"
    cy="12"
    r={r}
    fill="none"
    stroke={stroke}
    strokeWidth={width}
    strokeDasharray={dash}
  />
);
const node = (
  <circle cx="12" cy="12" r="3.5" fill={S.node.fill} stroke={S.node.stroke} strokeWidth="1.5" />
);

type LegendItem =
  | 'empire'
  | 'rebels'
  | 'space'
  | 'ground'
  | 'structure'
  | 'leader'
  | 'target'
  | 'selected'
  | 'activated'
  | 'source'
  | 'aiRecent'
  | 'handle'
  | 'contested'
  | 'remote'
  | 'base'
  | 'region'
  | 'chips'
  | 'hiddenZone';

const GLYPHS: Record<LegendItem, ReactNode> = {
  empire: <ForceGlyph owner="empire" kind="space" size={12} />,
  rebels: <ForceGlyph owner="rebels" kind="space" size={12} />,
  space: <ForceGlyph owner="rebels" kind="space" size={12} />,
  ground: <ForceGlyph owner="rebels" kind="ground" size={12} />,
  structure: <ForceGlyph owner="empire" kind="ground" size={12} />,
  leader: <ForceGlyph owner="rebels" kind="leader" size={12} />,
  target: (
    <Svg>
      {node}
      {ring(S.tone.target, '3 3')}
    </Svg>
  ),
  selected: (
    <Svg>
      {node}
      {ring(S.tone.selected, undefined, 2, 7)}
      <path
        d="M12 1 V4 M12 20 V23 M1 12 H4 M20 12 H23"
        stroke={S.tone.selected}
        strokeWidth="1.5"
      />
    </Svg>
  ),
  activated: (
    <Svg>
      {node}
      {ring(F.rebels, undefined, 3, 7)}
      <path d="M15 1 V6 M15 1 L21 3 L15 5 Z" stroke={F.rebels} fill={F.rebels} />
    </Svg>
  ),
  source: (
    <Svg>
      {node}
      {ring(S.tone.source, '2 2', 1.5, 9)}
      <path
        d="M17 17 L21 21 M21 16 L21 21 L16 21"
        stroke={S.tone.source}
        strokeWidth="2"
        fill="none"
      />
    </Svg>
  ),
  aiRecent: (
    <Svg>
      {node}
      {ring(S.tone.ai, '4 3', 2, 9)}
      <circle cx="19" cy="5" r="2.5" fill={S.tone.ai} />
    </Svg>
  ),
  handle: (
    <Svg>
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke={S.handle.ring}
        strokeWidth="2"
        strokeDasharray="3 3"
      />
      <path d="M12 6 L17 16 L7 16 Z" fill="none" stroke={F.rebels} strokeWidth="2" />
    </Svg>
  ),
  contested: (
    <Svg>
      {node}
      <path d="M15 3 L21 9" stroke={F.rebels} strokeWidth="2.5" />
      <path d="M21 3 L15 9" stroke={F.empire} strokeWidth="2.5" />
    </Svg>
  ),
  remote: (
    <Svg>
      <circle
        cx="12"
        cy="12"
        r="6"
        fill={S.node.fill}
        stroke={S.node.stroke}
        strokeDasharray="2 2"
        strokeWidth="1.5"
      />
      <path d="M4 18 L6 16 L8 18 L6 20 Z" fill="none" stroke={S.tone.remote} />
    </Svg>
  ),
  base: (
    <Svg>
      <path d="M5 21 V11 L12 4 L19 11 V21 Z" fill="none" stroke={S.tone.base} strokeWidth="2" />
    </Svg>
  ),
  region: (
    <Svg>
      <path
        d="M3 5 L21 3 L20 20 L4 21 Z"
        fill="none"
        stroke={S.region.stroke}
        strokeDasharray="3 3"
        strokeWidth="1.5"
      />
    </Svg>
  ),
  chips: (
    <Svg>
      <rect x="2" y="7" width="20" height="10" fill={S.marker.background} stroke={F.empire} />
      <circle cx="8" cy="12" r="3" fill={F.empire} />
      <path d="M14 9.5 V14.5 M17 9.5 V14.5" stroke={S.marker.text} strokeWidth="1.5" />
    </Svg>
  ),
  hiddenZone: (
    <Svg>
      <rect
        x="2"
        y="5"
        width="20"
        height="14"
        fill="none"
        stroke={S.zone.stroke}
        strokeDasharray="4 2"
        strokeWidth="1.5"
      />
    </Svg>
  ),
};

const ITEMS = Object.keys(GLYPHS) as LegendItem[];

/** The always-visible single row (prototype: sides, ground, leader, legal target, selected, recent AI). */
const ESSENTIAL: readonly LegendItem[] = [
  'empire',
  'rebels',
  'ground',
  'leader',
  'target',
  'selected',
  'aiRecent',
];

/** Short captions of the essential row (`legend.short.*`). */
const SHORT_KEY = (item: LegendItem) => `rebellion.map:legend.short.${item}`;

/** Texts live in `rebellion.map` (Worker M); the hidden zone uses the zone title. */
const TEXT_KEY = (item: LegendItem) =>
  item === 'hiddenZone' ? 'rebellion.map:zone.title' : `rebellion.map:legend.${item}`;

const META_SX = {
  fontSize: 10,
  lineHeight: '16px',
  letterSpacing: terminalTokens.letterSpacing.meta,
  textTransform: 'uppercase',
  color: S.housing.metaText,
  whiteSpace: 'nowrap',
} as const;

/**
 * Permanent map legend of the map housing (SWR-005 TC-C-19; SWR-009 R-2/R-3, PA-3; fix round 1). One row of the
 * essential keys (sides, ground, leader, legal target, selected, recent AI; «число = фигуры в группе» is in the
 * display header) + the «Легенда» key (`map-legend-toggle`, `aria-expanded`) that opens the full legend
 * (`map-legend-full`) above the bar: 18 keys «glyph + text» with the `map-legend-<item>` testids. The full list is
 * always mounted (hidden while collapsed), so its texts stay in the DOM. The glyph is decorative, the text explains.
 */
export function MapLegend() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Esc anywhere in the legend (the toggle keeps focus) closes the open panel and is consumed: `preventDefault` makes
  // the global Esc handler (`useGlobalEscape`, clears the selection) skip it.
  const onLegendKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !open) return;
    e.preventDefault();
    e.stopPropagation();
    setOpen(false);
    toggleRef.current?.focus();
  };
  return (
    <Box
      component="section"
      data-testid="map-legend"
      data-expanded={open ? 'true' : 'false'}
      aria-labelledby="map-legend-title"
      onKeyDown={onLegendKeyDown}
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minWidth: 0,
        flex: 1,
      }}
    >
      <VisuallyHidden>
        <h3 id="map-legend-title">{t('rebellion.map:legend.title')}</h3>
      </VisuallyHidden>
      <Box
        component="ul"
        data-testid="map-legend-row"
        sx={{
          listStyle: 'none',
          p: 0,
          m: 0,
          // phones: no clipped half-row — the «Легенда» key opens the full list
          display: { xs: 'none', sm: 'flex' },
          alignItems: 'center',
          // one line: keys that do not fit wrap onto a clipped second line (never cut mid-word)
          flexWrap: 'wrap',
          height: 16,
          columnGap: 1.5,
          minWidth: 0,
          overflow: 'hidden',
          flex: 1,
        }}
      >
        {ESSENTIAL.map((item) => (
          <Box
            component="li"
            key={item}
            data-testid={`map-legend-key-${item}`}
            sx={{ display: 'flex', flex: 'none' }}
          >
            <LegendKey
              glyph={GLYPHS[item]}
              sx={{ fontSize: 10, lineHeight: '16px', whiteSpace: 'nowrap' }}
            >
              {t(SHORT_KEY(item))}
            </LegendKey>
          </Box>
        ))}
      </Box>
      <KeyButton
        ref={toggleRef}
        size="small"
        data-testid="map-legend-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        sx={{
          flex: 'none',
          minHeight: 28,
          py: 0.25,
          px: 1,
          fontSize: 10,
          mr: { xs: 'auto', sm: 0 },
        }}
      >
        {t('rebellion.map:legend.toggle')}
      </KeyButton>
      <Box
        id={panelId}
        data-testid="map-legend-full"
        role="region"
        aria-label={t('rebellion.map:legend.title')}
        hidden={!open}
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 'calc(100% + 10px)',
          zIndex: 4,
          maxHeight: 'min(60vh, 420px)',
          overflowY: 'auto',
          p: 1.5,
          bgcolor: S.housing.bar,
          border: 1,
          borderColor: S.housing.frame,
          boxShadow: `0 6px 0 ${S.screen.shadow}`,
          '&[hidden]': { display: 'none' },
        }}
      >
        <Box component="p" sx={{ ...META_SX, m: 0, mb: 1, whiteSpace: 'normal' }}>
          {t('rebellion.map:legend.title')} · {t('rebellion.map:housing.countKey')}
        </Box>
        <Box
          component="ul"
          sx={{
            listStyle: 'none',
            p: 0,
            m: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
            columnGap: 2,
            rowGap: 0.5,
          }}
        >
          {ITEMS.map((item) => (
            <Box
              component="li"
              key={item}
              data-testid={`map-legend-${item}`}
              sx={{ display: 'flex' }}
            >
              <LegendKey glyph={GLYPHS[item]} sx={{ fontSize: 11, lineHeight: '16px' }}>
                {t(TEXT_KEY(item))}
              </LegendKey>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
