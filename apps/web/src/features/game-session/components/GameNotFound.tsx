import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

/** 404 screen for `/games/:id` (D-S-2). */
export function GameNotFound() {
  const { t } = useTranslation();
  return (
    <Box
      data-testid="game-not-found"
      sx={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '60vh',
        gap: 2,
        p: 4,
        textAlign: 'center',
      }}
    >
      <Typography component="h1" variant="h5">
        {t('session:notFound.title')}
      </Typography>
      <Typography sx={{ color: 'text.secondary' }}>{t('session:notFound.text')}</Typography>
      <Button component={RouterLink} to="/" variant="contained">
        {t('session:notFound.toMenu')}
      </Button>
    </Box>
  );
}
