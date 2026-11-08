import Link from '@mui/material/Link';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { RouteFocus } from './RouteFocus';

/** Root layout: skip-link to `#main` (D-A-1) + route focus (D-A-8). `<main>` is rendered by Platform/SessionLayout. */
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
      <Outlet />
      <RouteFocus />
    </>
  );
}
