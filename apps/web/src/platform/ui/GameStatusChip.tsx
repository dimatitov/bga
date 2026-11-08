import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import Chip from '@mui/material/Chip';
import type { GameStatus } from '@bga/platform';
import { useTranslation } from 'react-i18next';

/** Status chip — icon + word, not colour only (D-CAT-5, D-V-5). */
export function GameStatusChip(props: { status: GameStatus; id?: string; 'data-testid': string }) {
  const { t } = useTranslation();
  const available = props.status === 'available';
  return (
    <Chip
      id={props.id}
      size="small"
      variant={available ? 'outlined' : 'filled'}
      color={available ? 'primary' : 'default'}
      icon={available ? <CheckCircleOutlineIcon aria-hidden /> : <ScheduleIcon aria-hidden />}
      label={t(available ? 'common:status.available' : 'common:status.comingSoon')}
      data-testid={props['data-testid']}
      data-status={props.status}
      sx={{
        bgcolor: 'background.paper',
        color: available ? 'primary.main' : 'text.secondary',
        fontWeight: 600,
      }}
    />
  );
}
