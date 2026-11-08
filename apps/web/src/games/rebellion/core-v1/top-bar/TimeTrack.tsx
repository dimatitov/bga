import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { rebellionPalette } from '../../theme/palette';

const MIN_TICKS = 16;
const STEP = 8;
const PAD = 6;
const H = 20;

/**
 * Time / reputation track (SWR-005 plan-frontend §7, D-SW5-12): text «Время 2 · Репутация 14» + a compact scale
 * 1..max(reputation, 16) with two markers of different shape — time = diamond, reputation = ring (not colour
 * only). The scale is decorative (the text and the `aria-label` carry the meaning) and hidden below 600 px.
 * `time-track[data-time][data-reputation]`.
 */
export function TimeTrack({ time, reputation }: { time: number; reputation: number }) {
  const { t } = useTranslation();
  const ticks = Math.max(reputation, time, MIN_TICKS);
  const width = PAD * 2 + STEP * (ticks - 1);
  const x = (n: number) => PAD + STEP * (Math.min(Math.max(n, 1), ticks) - 1);
  const label = t('rebellion.match:track.aria', { time, reputation });
  return (
    <Box
      data-testid="time-track"
      data-time={time}
      data-reputation={reputation}
      role="group"
      aria-label={label}
      sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}
    >
      <Box
        component="svg"
        viewBox={`0 0 ${width} ${H}`}
        aria-hidden
        data-testid="time-track-scale"
        sx={{ display: { xs: 'none', sm: 'block' }, width, height: H, flex: 'none' }}
      >
        <line
          x1={PAD}
          x2={width - PAD}
          y1={H / 2}
          y2={H / 2}
          stroke="currentColor"
          strokeOpacity={0.35}
        />
        {Array.from({ length: ticks }, (_, i) => (
          <line
            key={i}
            x1={x(i + 1)}
            x2={x(i + 1)}
            y1={H / 2 - 3}
            y2={H / 2 + 3}
            stroke="currentColor"
            strokeOpacity={0.5}
          />
        ))}
        <circle
          cx={x(reputation)}
          cy={H / 2}
          r={6}
          fill="none"
          stroke={rebellionPalette.faction.rebels}
          strokeWidth={2}
        />
        <path
          d={`M ${x(time)} ${H / 2 - 6} L ${x(time) + 5} ${H / 2} L ${x(time)} ${H / 2 + 6} L ${x(time) - 5} ${H / 2} Z`}
          fill={rebellionPalette.faction.empire}
          stroke="currentColor"
          strokeWidth={1}
        />
      </Box>
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
      >
        {t('rebellion.match:track.text', { time, reputation })}
      </Typography>
    </Box>
  );
}
