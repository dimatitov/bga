import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslation } from 'react-i18next';

/** Suspense fallback of lazy pages. */
export function PageFallback() {
  const { t } = useTranslation();
  return (
    <Box
      aria-busy="true"
      sx={{ display: 'grid', placeItems: 'center', minHeight: '50vh', gap: 2 }}
      role="presentation"
    >
      <CircularProgress aria-label={t('common:app.loading')} />
    </Box>
  );
}
