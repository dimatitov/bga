import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { paths } from '../paths';

/** Unknown `gameId` on `/games/:gameId[/new]` (and old SWR-002 URLs) → link to the catalogue. */
export function GameNotFound() {
  const { t } = useTranslation();
  return (
    <Box
      data-testid="game-not-found"
      sx={{
        display: 'grid',
        placeItems: 'center',
        alignContent: 'center',
        gap: 2,
        minHeight: '50vh',
        px: 2,
      }}
    >
      <Typography variant="h4" component="h1">
        {t('gamePage:notFound.title')}
      </Typography>
      <Typography color="text.secondary">{t('gamePage:notFound.text')}</Typography>
      <Button component={RouterLink} to={paths.catalog} variant="contained">
        {t('common:notFound.toCatalog')}
      </Button>
    </Box>
  );
}
