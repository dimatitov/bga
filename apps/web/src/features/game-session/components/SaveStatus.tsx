import CheckIcon from '@mui/icons-material/Check';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import type { SaveStatus as SaveStatusValue } from '../hooks/useSendCommand';

/** Autosave indicator (D-P-9); `data-status` ∈ idle | saving | saved | error (Q-3). */
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
        color: status === 'error' ? 'error.main' : 'text.secondary',
      }}
    >
      {status === 'saving' && <CircularProgress size={14} aria-hidden />}
      {(status === 'saved' || status === 'idle') && <CheckIcon fontSize="small" aria-hidden />}
      {status === 'error' && <WarningAmberIcon fontSize="small" aria-hidden />}
      <Typography variant="body2">{t(`session:save.${status}`)}</Typography>
    </Box>
  );
}
