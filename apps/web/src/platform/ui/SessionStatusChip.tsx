import FlagIcon from '@mui/icons-material/OutlinedFlag';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ScienceIcon from '@mui/icons-material/ScienceOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import Chip from '@mui/material/Chip';
import { SessionStatusSchema, type SessionStatus } from '@bga/platform';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

type BadgeColor = 'default' | 'warning' | 'success';

/**
 * Icon + terminal badge tone of each platform session status (plan-frontend §3; word from `common:sessionStatus.*`).
 * SWR-009: the theme's Chip badges — neutral / amber / green (UI Kit `.badge`).
 */
const LOOK: Record<SessionStatus, { icon: ReactElement; color: BadgeColor }> = {
  setup: { icon: <TuneIcon aria-hidden />, color: 'default' },
  prototype: { icon: <ScienceIcon aria-hidden />, color: 'warning' },
  active: { icon: <PlayArrowIcon aria-hidden />, color: 'success' },
  completed: { icon: <FlagIcon aria-hidden />, color: 'default' },
};

/**
 * Platform session lifecycle chip — icon + word, not colour only (D-V-5, AC-13). Generic: knows nothing about a game.
 * An unknown status (newer server) renders nothing.
 */
export function SessionStatusChip(props: { status: unknown; 'data-testid': string }) {
  const { t } = useTranslation();
  const parsed = SessionStatusSchema.safeParse(props.status);
  if (!parsed.success) return null;
  const status = parsed.data;
  const { icon, color } = LOOK[status];
  return (
    <Chip
      component="span"
      size="small"
      variant="outlined"
      color={color}
      icon={icon}
      label={t(`common:sessionStatus.${status}`)}
      data-testid={props['data-testid']}
      data-status={status}
      sx={{
        fontWeight: 700,
        verticalAlign: 'middle',
        '& .MuiChip-icon': { color: 'inherit' },
      }}
    />
  );
}
