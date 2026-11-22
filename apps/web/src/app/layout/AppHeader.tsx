import SettingsIcon from '@mui/icons-material/Settings';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { paths } from '@/platform/paths';
import { terminalTokens } from '@/shared/theme';
import { Led, MockBadge } from '@/shared/ui';

const T = terminalTokens;

/**
 * Platform header (D-HDR-1..3) as a terminal header strip (SWR-009 N): console-case bar with a bezel, LED + brand
 * link to the catalogue (uppercase), amber MOCK badge, settings key. Not shown on the table.
 */
export function AppHeader() {
  const { t } = useTranslation();
  return (
    <Box
      component="header"
      data-testid="app-header"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, sm: 2 },
        minHeight: 56,
        px: { xs: 2, sm: 3 },
        bgcolor: 'terminal.case',
        borderBottom: `${T.bezel.module}px solid ${T.color.bezel}`,
        boxShadow: `inset 0 -1px 0 ${T.module.inset}`,
      }}
    >
      <Link
        component={RouterLink}
        to={paths.catalog}
        underline="none"
        data-testid="nav-catalog"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1.25,
          minHeight: 44,
          minWidth: 0,
          color: 'text.primary',
          fontWeight: 700,
          fontSize: T.type.small.size,
          letterSpacing: T.letterSpacing.badge,
          lineHeight: 1.3,
          textTransform: 'uppercase',
          '&:hover': { color: 'primary.main' },
        }}
      >
        <Led state="green" />
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
    </Box>
  );
}
