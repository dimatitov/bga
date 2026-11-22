import CheckIcon from '@mui/icons-material/Check';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { terminalTokens } from '@/shared/theme';
import type { SaveStatus as SaveStatusValue } from '../hooks/useSendCommand';

const C = terminalTokens.color;

/** Text colour per state (SWR-009: phosphor «сохранено», amber «сохранение…», light red «не сохранено»). */
const COLOR: Readonly<Record<SaveStatusValue, string>> = {
  idle: C.phosphor,
  saved: C.phosphor,
  saving: C.amberText,
  error: C.redText,
};

/**
 * Autosave indicator (D-P-9); `data-status` ∈ idle | saving | saved | error (Q-3). The state is said in words, the
 * icon only repeats it (not colour-only).
 */
export function SaveStatus({ status }: { status: SaveStatusValue }) {
  const { t } = useTranslation();
  return (
    <Box
      data-testid="save-status"
      data-status={status}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        minWidth: 0,
        color: COLOR[status],
      }}
    >
      {status === 'saving' && <CircularProgress size={12} color="inherit" aria-hidden />}
      {(status === 'saved' || status === 'idle') && <CheckIcon sx={{ fontSize: 16 }} aria-hidden />}
      {status === 'error' && <WarningAmberIcon sx={{ fontSize: 16 }} aria-hidden />}
      <Typography
        variant="body2"
        component="span"
        sx={{ color: 'inherit', fontWeight: 700, textTransform: 'uppercase', fontSize: 11 }}
      >
        {t(`rebellion.session:save.${status}`)}
      </Typography>
    </Box>
  );
}
