import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

/** Root `errorElement`: failed lazy chunk of a game screen or an unexpected route error (D-SH-5). */
export function RouteError() {
  const { t } = useTranslation();
  return (
    <Box
      component="main"
      id="main"
      data-testid="route-error"
      sx={{
        display: 'grid',
        placeItems: 'center',
        alignContent: 'center',
        gap: 2,
        minHeight: '100dvh',
        px: 2,
      }}
    >
      <Typography variant="h4" component="h1">
        {t('common:routeError.title')}
      </Typography>
      <Typography color="text.secondary">{t('common:routeError.text')}</Typography>
      <Button variant="contained" onClick={() => window.location.reload()}>
        {t('common:routeError.reload')}
      </Button>
    </Box>
  );
}
