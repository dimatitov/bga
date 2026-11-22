import Box from '@mui/material/Box';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import { trackPercent, trackTicks } from './statusBarModel';

const T = terminalTokens;
const SR_ONLY = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'pre',
} as const;

const MARKER = { position: 'absolute', transform: 'translate(-50%, -50%)', top: '50%' } as const;

/**
 * Time / reputation track (SWR-005 D-SW5-12; SWR-009 status bar): the text «Время 1» · «Репутация 14» above a fluid
 * scale `1..max(reputation, time, 16)` with one tick per step and two markers of different SHAPE — time = red
 * diamond, reputation = phosphor ring (not colour only). The scale is decorative (`aria-hidden`); the text and the
 * group's `aria-label` carry the meaning. `time-track[data-time][data-reputation]`, `time-track-scale[data-ticks]`.
 */
export function TimeTrack({ time, reputation }: { time: number; reputation: number }) {
  const { t } = useTranslation();
  const ticks = trackTicks(time, reputation);
  return (
    <Box
      data-testid="time-track"
      data-time={time}
      data-reputation={reputation}
      role="group"
      aria-label={t('rebellion.match:track.aria', { time, reputation })}
      sx={{ display: 'grid', gap: '6px', minWidth: 0 }}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          columnGap: 1,
          fontSize: T.type.meta.size,
          lineHeight: `${T.type.meta.lineHeight}px`,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: T.color.warm,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <Box component="span" data-testid="time-track-time" sx={{ whiteSpace: 'nowrap' }}>
          {t('rebellion.match:track.time')} {time}
        </Box>
        {/* Plain-text separator for copy / text-only readers; the two labels sit at the scale's ends. */}
        <Box component="span" sx={SR_ONLY}>
          {' · '}
        </Box>
        <Box component="span" data-testid="time-track-reputation" sx={{ whiteSpace: 'nowrap' }}>
          {t('rebellion.match:track.reputation')} {reputation}
        </Box>
      </Box>
      <Box
        aria-hidden="true"
        data-testid="time-track-scale"
        data-ticks={ticks}
        sx={{
          position: 'relative',
          height: 8,
          mx: '6px',
          border: `1px solid ${T.color.bezelLight}`,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          {Array.from({ length: ticks }, (_, i) => (
            <Box
              key={i}
              component="span"
              data-testid="time-track-tick"
              sx={{ width: '1px', height: '100%', bgcolor: T.color.bezelLight }}
            />
          ))}
        </Box>
        <Box
          component="span"
          data-testid="time-track-reputation-marker"
          data-shape="ring"
          sx={{
            ...MARKER,
            left: `${trackPercent(reputation, ticks)}%`,
            width: 11,
            height: 11,
            borderRadius: '50%',
            border: `2px solid ${T.color.phosphor}`,
            bgcolor: T.color.crt,
          }}
        />
        <Box
          component="span"
          data-testid="time-track-time-marker"
          data-shape="diamond"
          sx={{
            ...MARKER,
            left: `${trackPercent(time, ticks)}%`,
            width: 8,
            height: 8,
            bgcolor: T.color.red,
            transform: 'translate(-50%, -50%) rotate(45deg)',
          }}
        />
      </Box>
    </Box>
  );
}
