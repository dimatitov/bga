import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { terminalTokens } from '@/shared/theme';

const T = terminalTokens;

/** Decorative crosshair of the inspector (UI Kit inspector: rings + cross in amber). */
function Crosshair({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none' }}
    >
      <circle cx={11} cy={11} r={6} fill="none" stroke={T.color.amber} strokeWidth={1.5} />
      <circle
        cx={11}
        cy={11}
        r={9.5}
        fill="none"
        stroke={T.color.amber}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <path d="M11 0v22M0 11h22" stroke={T.color.amber} strokeWidth={1} opacity={0.65} />
    </svg>
  );
}

/**
 * Inspector heading (SWR-009 design-analysis §3 «инспектор»): crosshair + the object name in amber + an optional
 * sub-line (region). `name` is a text node from `view` data — never a demo string.
 */
export function InspectorHeading({
  name,
  sub,
  id,
  tone = 'amber',
  compact = false,
}: {
  name: ReactNode;
  sub?: ReactNode;
  id?: string;
  tone?: 'amber' | 'paper';
  /** One line: small crosshair, name (14 px) and the sub-line inline after it (the rail manifest header). */
  compact?: boolean;
}) {
  const color = tone === 'amber' ? T.color.amber : T.color.paper;
  if (compact) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          minWidth: 0,
          flexWrap: 'wrap',
          rowGap: 0,
        }}
      >
        <Crosshair size={14} />
        <Typography
          id={id}
          component="h3"
          sx={{
            m: 0,
            fontSize: T.type.body.size,
            lineHeight: '20px',
            fontWeight: 700,
            color,
            overflowWrap: 'anywhere',
          }}
        >
          {name}
        </Typography>
        {sub !== undefined && (
          <Typography
            variant="meta"
            component="span"
            sx={{ m: 0, color: T.color.warm, lineHeight: '20px' }}
          >
            · {sub}
          </Typography>
        )}
      </Box>
    );
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
      <Crosshair />
      <Box sx={{ minWidth: 0 }}>
        <Typography
          id={id}
          component="h3"
          sx={{
            m: 0,
            fontSize: T.type.subtitle.size,
            lineHeight: `${T.type.subtitle.lineHeight}px`,
            fontWeight: T.type.subtitle.weight,
            color,
            overflowWrap: 'anywhere',
          }}
        >
          {name}
        </Typography>
        {sub !== undefined && (
          <Typography variant="meta" component="p" sx={{ m: 0, color: T.color.warm }}>
            {sub}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
