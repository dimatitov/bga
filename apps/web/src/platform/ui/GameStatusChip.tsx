import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import Chip from '@mui/material/Chip';
import type { GameStatus } from '@bga/platform';
import { useTranslation } from 'react-i18next';

/**
 * Status chip — icon + word, not colour only (D-CAT-5, D-V-5). SWR-009: terminal badge (green «available», neutral
 * «coming soon») on the dark counter plate, so it stays readable over the cover.
 */
export function GameStatusChip(props: { status: GameStatus; id?: string; 'data-testid': string }) {
  const { t } = useTranslation();
  const available = props.status === 'available';
  return (
    <Chip
      id={props.id}
      size="small"
      variant="outlined"
      color={available ? 'success' : 'default'}
      icon={available ? <CheckCircleOutlineIcon aria-hidden /> : <ScheduleIcon aria-hidden />}
      label={t(available ? 'common:status.available' : 'common:status.comingSoon')}
      data-testid={props['data-testid']}
      data-status={props.status}
      sx={{
        // `background-color` wins over the transparent badge fill of the theme (`&&` = doubled class).
        '&&': { bgcolor: 'terminal.plate' },
        fontWeight: 700,
        '& .MuiChip-icon': { color: 'inherit' },
      }}
    />
  );
}
