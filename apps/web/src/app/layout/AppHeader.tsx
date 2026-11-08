import SettingsIcon from '@mui/icons-material/Settings';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { paths } from '@/platform/paths';
import { MockBadge } from '@/shared/ui';

/** Platform header (D-HDR-1..3): brand link to the catalogue, MOCK badge, settings. Not shown on the table. */
export function AppHeader() {
  const { t } = useTranslation();
  return (
    <AppBar
      position="static"
      color="transparent"
      elevation={0}
      data-testid="app-header"
      sx={{ borderBottom: 1, borderColor: 'divider' }}
    >
      <Toolbar variant="dense" sx={{ minHeight: 56, gap: 2 }}>
        <Link
          component={RouterLink}
          to={paths.catalog}
          underline="none"
          color="inherit"
          data-testid="nav-catalog"
          sx={{ fontWeight: 700 }}
        >
          {t('common:app.platformName')}
        </Link>
        <Box sx={{ flex: 1 }} />
        <MockBadge />
        <Tooltip title={t('common:nav.settings')}>
          <IconButton
            component={RouterLink}
            to={paths.settings}
            aria-label={t('common:nav.settings')}
            data-testid="nav-settings"
          >
            <SettingsIcon />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
