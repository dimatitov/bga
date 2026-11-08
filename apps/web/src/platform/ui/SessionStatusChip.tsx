import FlagIcon from '@mui/icons-material/OutlinedFlag';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ScienceIcon from '@mui/icons-material/ScienceOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import Chip from '@mui/material/Chip';
import { SessionStatusSchema, type SessionStatus } from '@bga/platform';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

/** Icon + colour of each platform session status (plan-frontend §3; word from `common:sessionStatus.*`). */
const LOOK: Record<SessionStatus, { icon: ReactElement; color: string }> = {
  setup: { icon: <TuneIcon aria-hidden />, color: 'text.secondary' },
  prototype: { icon: <ScienceIcon aria-hidden />, color: 'mock.main' },
  active: { icon: <PlayArrowIcon aria-hidden />, color: 'primary.main' },
  completed: { icon: <FlagIcon aria-hidden />, color: 'text.secondary' },
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
      icon={icon}
      label={t(`common:sessionStatus.${status}`)}
      data-testid={props['data-testid']}
      data-status={status}
      sx={{
        color,
        borderColor: color,
        fontWeight: 600,
        verticalAlign: 'middle',
        '& .MuiChip-icon': { color: 'inherit' },
      }}
    />
  );
}
