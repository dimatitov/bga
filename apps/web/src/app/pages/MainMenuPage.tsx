import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SettingsIcon from '@mui/icons-material/Settings';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { ContinueButton, RecentGamesList, useGamesList } from '@/features/game-setup';
import { MockBadge } from '@/shared/ui';

/** `/` — New game / Continue / Settings + recent games (D-M-1..D-M-5). */
export function MainMenuPage() {
  const { t } = useTranslation();
  const { isError, refetch, isFetching } = useGamesList();

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        px: 2,
        pt: { xs: 6, md: 12 },
        pb: 4,
      }}
    >
      <Stack spacing={4} sx={{ width: '100%', maxWidth: 420, flex: 1 }}>
        <Stack spacing={1}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>
              {t('common:app.title')}
            </Typography>
            <MockBadge data-testid="menu-mock-badge" />
          </Stack>
          <Typography color="text.secondary">{t('common:app.subtitle')}</Typography>
        </Stack>

        <Stack component="nav" spacing={2} aria-label={t('common:nav.menu')}>
          <Button
            component={RouterLink}
            to="/games/new"
            variant="contained"
            size="large"
            fullWidth
            startIcon={<PlayArrowIcon />}
            data-testid="menu-new-game"
            sx={{ justifyContent: 'flex-start' }}
          >
            {t('setup:menu.newGame')}
          </Button>
          <ContinueButton />
          <Button
            component={RouterLink}
            to="/settings"
            variant="outlined"
            size="large"
            fullWidth
            startIcon={<SettingsIcon />}
            data-testid="menu-settings"
            sx={{ justifyContent: 'flex-start' }}
          >
            {t('setup:menu.settings')}
          </Button>
        </Stack>

        {isError ? (
          <Alert
            severity="error"
            data-testid="menu-error"
            action={
              <Button
                color="inherit"
                size="small"
                loading={isFetching}
                onClick={() => void refetch()}
              >
                {t('common:actions.retry')}
              </Button>
            }
          >
            {t('setup:menu.loadError')}
          </Alert>
        ) : null}

        <RecentGamesList />
      </Stack>

      <Typography component="footer" variant="caption" color="text.secondary" sx={{ mt: 4 }}>
        {t('common:mock.footer')}
      </Typography>
    </Box>
  );
}
