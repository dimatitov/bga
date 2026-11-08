import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Link from '@mui/material/Link';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { RouteFocus } from './RouteFocus';

function PageFallback() {
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

/** Skip-link (D-A-1), `<main id="main">`, Suspense for lazy pages, route focus (D-A-8). */
export function AppLayout() {
  const { t } = useTranslation();
  return (
    <>
      <Link
        href="#main"
        sx={{
          position: 'absolute',
          left: 8,
          top: -48,
          zIndex: (theme) => theme.zIndex.tooltip + 1,
          px: 2,
          py: 1,
          bgcolor: 'background.paper',
          borderRadius: 1,
          '&:focus': { top: 8 },
        }}
      >
        {t('common:nav.skipToContent')}
      </Link>
      <Box component="main" id="main" tabIndex={-1} sx={{ minHeight: '100dvh', outline: 'none' }}>
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </Box>
      <RouteFocus />
    </>
  );
}
