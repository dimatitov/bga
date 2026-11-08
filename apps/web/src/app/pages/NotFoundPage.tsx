import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Box
      data-testid="not-found"
      sx={{
        display: 'grid',
        placeItems: 'center',
        alignContent: 'center',
        gap: 2,
        minHeight: '60vh',
        px: 2,
      }}
    >
      <Typography variant="h4" component="h1">
        {t('common:notFound.title')}
      </Typography>
      <Typography color="text.secondary">{t('common:notFound.text')}</Typography>
      <Button component={RouterLink} to="/" variant="contained">
        {t('common:notFound.toMenu')}
      </Button>
    </Box>
  );
}
