import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

/** Same loading skeleton for every game (D-SH-1): 56px top strip + map area with a spinner. */
export function SessionLoading() {
  const { t } = useTranslation();
  return (
    <Box
      data-testid="session-loading"
      aria-busy="true"
      sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ height: 56, borderBottom: 1, borderColor: 'divider' }} />
      <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', alignContent: 'center', gap: 2 }}>
        <CircularProgress aria-hidden="true" />
        <Typography color="text.secondary">{t('sessionHost:loading')}</Typography>
      </Box>
    </Box>
  );
}
